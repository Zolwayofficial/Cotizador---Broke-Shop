import argparse
import io
import os
import posixpath
import shutil
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path

import paramiko


ROOT = Path(__file__).resolve().parent.parent
EXCLUDES = {
    ".git",
    ".github",
    "node_modules",
    "coverage",
    "data",
    ".env",
    "local-start.err.log",
    "local-start.out.log",
}

REMOTE_SCRIPT = r"""#!/usr/bin/env bash
set -euo pipefail

APP_PATH="$1"
ARCHIVE_NAME="$2"
DOMAIN="$3"
HOST_IP="$4"
APP_PORT="$5"

export DEBIAN_FRONTEND=noninteractive

mkdir -p /var/backups/importaiagent
mkdir -p "$APP_PATH"

CURRENT_SCRIPT="$(basename "$0")"
BACKUP_ITEMS=()

for item in "$APP_PATH"/* "$APP_PATH"/.[!.]* "$APP_PATH"/..?*; do
  [ -e "$item" ] || continue
  base="$(basename "$item")"
  if [ "$base" = "$ARCHIVE_NAME" ] || [ "$base" = "$CURRENT_SCRIPT" ]; then
    continue
  fi
  BACKUP_ITEMS+=("$item")
done

if [ "${#BACKUP_ITEMS[@]}" -gt 0 ]; then
  BACKUP_PATH="/var/backups/importaiagent/app-$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$BACKUP_PATH"
  mv "${BACKUP_ITEMS[@]}" "$BACKUP_PATH"/
fi

if command -v apt-get >/dev/null 2>&1; then
  apt-get update -y
  apt-get install -y curl ca-certificates gnupg nginx tar
fi

if ! command -v node >/dev/null 2>&1 || ! node -e "const major = Number(process.versions.node.split('.')[0]); process.exit(major >= 18 ? 0 : 1)"; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

cd "$APP_PATH"
tar -xzf "$ARCHIVE_NAME"
rm -f "$ARCHIVE_NAME"

if [ -f ".env.production" ]; then
  cp .env.production .env
fi

mkdir -p data data/logs
npm install --omit=dev

if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2
fi

pm2 delete cotizador >/dev/null 2>&1 || true
pm2 start ecosystem.config.js --only cotizador --update-env
pm2 save

if command -v systemctl >/dev/null 2>&1; then
  pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true
fi

cat > /etc/nginx/sites-available/importaiagent <<NGINX
server {
    listen 80;
    server_name ${DOMAIN} ${HOST_IP};

    location /ws {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host \$host;
    }

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/importaiagent /etc/nginx/sites-enabled/importaiagent
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable nginx
systemctl restart nginx

for attempt in $(seq 1 20); do
  if curl -fsS "http://127.0.0.1:${APP_PORT}/api/monitor/health" >/tmp/importaiagent-health.json; then
    break
  fi
  sleep 2
done

if [ ! -s /tmp/importaiagent-health.json ]; then
  echo "Health check no respondio a tiempo" >&2
  exit 1
fi

cat /tmp/importaiagent-health.json
echo
pm2 status cotizador
rm -f "$0"
"""


def run_local(command, cwd=ROOT):
    print(f"[local] {' '.join(command)}")
    subprocess.run(command, cwd=str(cwd), check=True)


def safe_print(text):
    if not text:
        return
    encoding = getattr(sys.stdout, "encoding", None) or "utf-8"
    sys.stdout.write(text.encode(encoding, "replace").decode(encoding))
    if not text.endswith("\n"):
        sys.stdout.write("\n")
    sys.stdout.flush()


def copy_project(stage_dir: Path):
    for item in ROOT.iterdir():
        if item.name in EXCLUDES:
            continue
        destination = stage_dir / item.name
        if item.is_dir():
            shutil.copytree(
                item,
                destination,
                ignore=shutil.ignore_patterns("node_modules", "coverage", ".git", "data"),
            )
        else:
            shutil.copy2(item, destination)


def build_archive() -> Path:
    run_local(["npm.cmd", "run", "client:build"])
    run_local(["npm.cmd", "run", "production:check"])

    stage_dir = Path(tempfile.mkdtemp(prefix="cotizador-stage-"))
    archive_path = Path(tempfile.gettempdir()) / "importaiagent-deploy.tgz"
    if archive_path.exists():
        archive_path.unlink()

    copy_project(stage_dir)

    with tarfile.open(archive_path, "w:gz") as tar:
        tar.add(stage_dir, arcname=".")

    shutil.rmtree(stage_dir, ignore_errors=True)
    return archive_path


def ssh_client(host, user, password):
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        hostname=host,
        username=user,
        password=password,
        timeout=30,
        auth_timeout=30,
        banner_timeout=30,
        look_for_keys=False,
        allow_agent=False,
    )
    return client


def exec_remote(client, command):
    print(f"[remote] {command}")
    stdin, stdout, stderr = client.exec_command(command, get_pty=True)
    exit_status = stdout.channel.recv_exit_status()
    out = stdout.read().decode("utf-8", "ignore")
    err = stderr.read().decode("utf-8", "ignore")
    if out.strip():
        safe_print(out.strip())
    if err.strip():
        safe_print(err.strip())
    if exit_status != 0:
        raise RuntimeError(f"Remote command failed ({exit_status}): {command}")


def upload_bytes(sftp, remote_path: str, content: str):
    with sftp.open(remote_path, "w") as remote_file:
        remote_file.write(content)


def upload_file(sftp, local_path: Path, remote_path: str):
    print(f"[upload] {local_path.name} -> {remote_path}")
    sftp.put(str(local_path), remote_path)


def deploy(args):
    password = args.password or os.environ.get(args.password_env)
    if not password:
        raise SystemExit(
            f"No se encontro la contrasena del VPS. Define {args.password_env} o usa --password."
        )

    archive_path = build_archive()
    client = ssh_client(args.host, args.user, password)
    remote_archive = posixpath.join(args.path, archive_path.name)
    remote_script = posixpath.join(args.path, "deploy-remote.sh")

    try:
        exec_remote(client, f"mkdir -p {args.path}")
        sftp = client.open_sftp()
        try:
            upload_file(sftp, archive_path, remote_archive)
            upload_bytes(sftp, remote_script, REMOTE_SCRIPT)
            sftp.chmod(remote_script, 0o755)
        finally:
            sftp.close()

        command = (
            f"bash {remote_script} {args.path} {archive_path.name} "
            f"{args.domain} {args.host} {args.port}"
        )
        exec_remote(client, command)
    finally:
        client.close()
        archive_path.unlink(missing_ok=True)


def parse_args():
    parser = argparse.ArgumentParser(description="Despliegue directo al VPS con respaldo previo.")
    parser.add_argument("--host", default="107.175.95.172")
    parser.add_argument("--user", default="root")
    parser.add_argument("--path", default="/var/www/importaiagent")
    parser.add_argument("--domain", default="importaiagent.com")
    parser.add_argument("--port", default="3000")
    parser.add_argument("--password-env", default="VPS_PASSWORD")
    parser.add_argument("--password")
    return parser.parse_args()


if __name__ == "__main__":
    deploy(parse_args())
