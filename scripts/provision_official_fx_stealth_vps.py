#!/usr/bin/env python3
import argparse
import os
import paramiko
import sys


HOST = "107.175.95.172"
USER = "root"
APP_PATH = "/var/www/importaiagent"

REMOTE_SCRIPT = """#!/usr/bin/env bash
set -euo pipefail

APP_PATH="$1"
VENV_PATH="$APP_PATH/.venv-official-fx"

export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y python3-pip python3-venv

if [ ! -f "$APP_PATH/.env.production" ]; then
  echo ".env.production no existe en el VPS y no se desplegara desde local" >&2
  exit 1
fi

python3 -m venv "$VENV_PATH"
"$VENV_PATH/bin/python" -m pip install --upgrade pip
"$VENV_PATH/bin/pip" install playwright
"$VENV_PATH/bin/python" -m playwright install --with-deps chromium

grep -q '^OFFICIAL_FX_STEALTH_ENABLED=' "$APP_PATH/.env.production" && \
  sed -i 's/^OFFICIAL_FX_STEALTH_ENABLED=.*/OFFICIAL_FX_STEALTH_ENABLED=true/' "$APP_PATH/.env.production" || \
  echo 'OFFICIAL_FX_STEALTH_ENABLED=true' >> "$APP_PATH/.env.production"

grep -q '^OFFICIAL_FX_STEALTH_HEADLESS=' "$APP_PATH/.env.production" && \
  sed -i 's/^OFFICIAL_FX_STEALTH_HEADLESS=.*/OFFICIAL_FX_STEALTH_HEADLESS=true/' "$APP_PATH/.env.production" || \
  echo 'OFFICIAL_FX_STEALTH_HEADLESS=true' >> "$APP_PATH/.env.production"

grep -q '^OFFICIAL_FX_USE_CAMOUFOX=' "$APP_PATH/.env.production" && \
  sed -i 's/^OFFICIAL_FX_USE_CAMOUFOX=.*/OFFICIAL_FX_USE_CAMOUFOX=false/' "$APP_PATH/.env.production" || \
  echo 'OFFICIAL_FX_USE_CAMOUFOX=false' >> "$APP_PATH/.env.production"

grep -q '^OFFICIAL_FX_BROWSER_CHANNEL=' "$APP_PATH/.env.production" && \
  sed -i 's/^OFFICIAL_FX_BROWSER_CHANNEL=.*/OFFICIAL_FX_BROWSER_CHANNEL=/' "$APP_PATH/.env.production" || \
  echo 'OFFICIAL_FX_BROWSER_CHANNEL=' >> "$APP_PATH/.env.production"

grep -q '^OFFICIAL_FX_STEALTH_TIMEOUT_MS=' "$APP_PATH/.env.production" && \
  sed -i 's/^OFFICIAL_FX_STEALTH_TIMEOUT_MS=.*/OFFICIAL_FX_STEALTH_TIMEOUT_MS=8000/' "$APP_PATH/.env.production" || \
  echo 'OFFICIAL_FX_STEALTH_TIMEOUT_MS=8000' >> "$APP_PATH/.env.production"

grep -q '^OFFICIAL_FX_CACHE_TTL_MS=' "$APP_PATH/.env.production" && \
  sed -i 's/^OFFICIAL_FX_CACHE_TTL_MS=.*/OFFICIAL_FX_CACHE_TTL_MS=900000/' "$APP_PATH/.env.production" || \
  echo 'OFFICIAL_FX_CACHE_TTL_MS=900000' >> "$APP_PATH/.env.production"

grep -q '^OFFICIAL_FX_PYTHON_BIN=' "$APP_PATH/.env.production" && \
  sed -i "s|^OFFICIAL_FX_PYTHON_BIN=.*|OFFICIAL_FX_PYTHON_BIN=$VENV_PATH/bin/python|" "$APP_PATH/.env.production" || \
  echo "OFFICIAL_FX_PYTHON_BIN=$VENV_PATH/bin/python" >> "$APP_PATH/.env.production"

if [ ! -f "$APP_PATH/.env" ]; then
  cp "$APP_PATH/.env.production" "$APP_PATH/.env"
fi
chmod 600 "$APP_PATH/.env" "$APP_PATH/.env.production"

APP_PORT="$(grep '^PORT=' "$APP_PATH/.env.production" | tail -n 1 | cut -d= -f2- | tr -d '[:space:]')"
WS_PORT="$(grep '^WS_PORT=' "$APP_PATH/.env.production" | tail -n 1 | cut -d= -f2- | tr -d '[:space:]')"

if [ -z "$APP_PORT" ]; then
  echo "PORT falta en .env.production" >&2
  exit 2
fi

if [ -z "$WS_PORT" ]; then
  echo "WS_PORT falta en .env.production" >&2
  exit 3
fi

cd "$APP_PATH"
pm2 restart cotizador --update-env
sleep 5

echo '--- helper ---'
"$VENV_PATH/bin/python" "$APP_PATH/scripts/fetch_official_fx.py" --headless true --use-camoufox false --timeout-ms 12000 || true
echo '--- api ---'
curl -fsS "http://127.0.0.1:$APP_PORT/api/monitor/health" | head -c 300
printf '\\n'
echo '--- tipo cambio ---'
node -e "require('./server/sunat-proxy').getTipoCambio().then(x=>console.log(JSON.stringify(x))).catch(e=>{{console.error(e);process.exit(1)}})"
"""

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


def parse_args():
    parser = argparse.ArgumentParser(description="Provisiona el helper de tipo de cambio oficial resistente en el VPS.")
    parser.add_argument("--host", default=HOST)
    parser.add_argument("--user", default=USER)
    parser.add_argument("--path", default=APP_PATH)
    parser.add_argument("--password-env", default="VPS_PASSWORD")
    parser.add_argument("--password")
    return parser.parse_args()


def resolve_password(args):
    password = args.password or os.environ.get(args.password_env)
    if not password:
        raise SystemExit(
            f"No se encontro la contrasena del VPS. Define {args.password_env} o usa --password."
        )
    return password


def main():
    args = parse_args()
    password = resolve_password(args)
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        hostname=args.host,
        username=args.user,
        password=password,
        timeout=30,
        auth_timeout=30,
        banner_timeout=30,
        look_for_keys=False,
        allow_agent=False,
    )

    try:
        sftp = client.open_sftp()
        try:
            with sftp.open(f"{args.path}/provision-official-fx-stealth.sh", "w") as remote_file:
                remote_file.write(REMOTE_SCRIPT)
            sftp.chmod(f"{args.path}/provision-official-fx-stealth.sh", 0o755)
        finally:
            sftp.close()

        stdin, stdout, stderr = client.exec_command(
            f"bash {args.path}/provision-official-fx-stealth.sh {args.path}",
            get_pty=True,
        )
        exit_status = stdout.channel.recv_exit_status()
        output = stdout.read().decode("utf-8", "replace")
        errors = stderr.read().decode("utf-8", "replace")
        print(output)
        if errors.strip():
            print(errors)
        if exit_status != 0:
            raise RuntimeError(f"Provision remoto fallo con codigo {exit_status}")
    finally:
        client.close()


if __name__ == "__main__":
    main()
