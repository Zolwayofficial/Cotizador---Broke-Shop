#!/usr/bin/env python3
import shutil
import tarfile
import tempfile
import sys
from pathlib import Path

import paramiko


ROOT = Path(__file__).resolve().parent.parent
APP_PATH = "/var/www/importaiagent"
HOST = "107.175.95.172"
USER = "root"
PASSWORD = "PpnXibJ0jV94750oMH"
EXCLUDES = {
    ".git",
    "node_modules",
    "data",
    ".env",
    ".env.production",
    "coverage",
    "backups",
    "restored-backups",
    "LOCAL_SECRETS.md",
}

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


REMOTE_SCRIPT = """#!/usr/bin/env bash
set -euo pipefail

APP_PATH="$1"
ARCHIVE_NAME="$2"
BACKUP_PATH="/var/backups/importaiagent/code-$(date +%Y%m%d-%H%M%S)"

mkdir -p "$APP_PATH" "$BACKUP_PATH"
cd "$APP_PATH"

for item in * .[!.]* ..?*; do
  [ -e "$item" ] || continue
  case "$item" in
    data|.env|.env.production|$ARCHIVE_NAME|deploy-app-only.sh)
      continue
      ;;
  esac
  mv "$item" "$BACKUP_PATH"/
done

tar -xzf "$ARCHIVE_NAME"
rm -f "$ARCHIVE_NAME"

if [ -f ".env.production" ]; then
  cp .env.production .env
fi

mkdir -p data data/logs
npm install --omit=dev
pm2 delete cotizador >/dev/null 2>&1 || true
pm2 start ecosystem.config.js --only cotizador --update-env
pm2 save

chmod 755 "$APP_PATH"
find "$APP_PATH" -path "$APP_PATH/data" -prune -o -type d -exec chmod 755 {} +
find "$APP_PATH" -path "$APP_PATH/data/*" -prune -o -type f -exec chmod 644 {} +
[ -d "$APP_PATH/secure" ] && chmod 700 "$APP_PATH/secure"
[ -d "$APP_PATH/secure" ] && find "$APP_PATH/secure" -type f -exec chmod 600 {} +
[ -f "$APP_PATH/.env" ] && chmod 600 "$APP_PATH/.env"
[ -f "$APP_PATH/.env.production" ] && chmod 600 "$APP_PATH/.env.production"

HEALTH_URL="http://127.0.0.1:3000/api/monitor/health"
health_ok=0

for attempt in $(seq 1 20); do
  if curl -fsS "$HEALTH_URL" | head -c 300; then
    printf '\\n'
    health_ok=1
    break
  fi
  sleep 3
done

if [ "$health_ok" -ne 1 ]; then
  echo "No se pudo confirmar el health check local tras varios intentos." >&2
  pm2 logs cotizador --lines 60 --nostream || true
  exit 7
fi

pm2 status cotizador --no-color
"""


def main():
    stage_dir = Path(tempfile.mkdtemp(prefix="cotizador-vps-stage-"))
    archive_path = Path(tempfile.gettempdir()) / "importaiagent-app-only.tgz"
    if archive_path.exists():
        archive_path.unlink()

    try:
        for item in ROOT.iterdir():
            if item.name in EXCLUDES:
                continue
            destination = stage_dir / item.name
            if item.is_dir():
                shutil.copytree(
                    item,
                    destination,
                    ignore=shutil.ignore_patterns(
                        "node_modules",
                        "coverage",
                        "__pycache__",
                        "backups",
                        "restored-backups",
                    ),
                )
            else:
                shutil.copy2(item, destination)

        with tarfile.open(archive_path, "w:gz") as tar:
            tar.add(stage_dir, arcname=".")

        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        client.connect(
            hostname=HOST,
            username=USER,
            password=PASSWORD,
            timeout=30,
            auth_timeout=30,
            banner_timeout=30,
            look_for_keys=False,
            allow_agent=False,
        )

        try:
            sftp = client.open_sftp()
            try:
                sftp.put(str(archive_path), f"{APP_PATH}/importaiagent-app-only.tgz")
                with sftp.open(f"{APP_PATH}/deploy-app-only.sh", "w") as remote_file:
                    remote_file.write(REMOTE_SCRIPT)
                sftp.chmod(f"{APP_PATH}/deploy-app-only.sh", 0o755)
            finally:
                sftp.close()

            command = f"bash {APP_PATH}/deploy-app-only.sh {APP_PATH} importaiagent-app-only.tgz"
            stdin, stdout, stderr = client.exec_command(command, get_pty=True)
            exit_status = stdout.channel.recv_exit_status()
            output = stdout.read().decode("utf-8", "replace")
            errors = stderr.read().decode("utf-8", "replace")
            print(output)
            if errors.strip():
                print(errors)
            if exit_status != 0:
                raise RuntimeError(f"Deploy remoto fallo con codigo {exit_status}")
        finally:
            client.close()
    finally:
        shutil.rmtree(stage_dir, ignore_errors=True)
        if archive_path.exists():
            archive_path.unlink()


if __name__ == "__main__":
    main()
