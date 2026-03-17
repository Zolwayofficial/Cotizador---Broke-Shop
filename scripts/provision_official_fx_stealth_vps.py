#!/usr/bin/env python3
import paramiko
import sys


HOST = "107.175.95.172"
USER = "root"
PASSWORD = "PpnXibJ0jV94750oMH"
APP_PATH = "/var/www/importaiagent"
VENV_PATH = f"{APP_PATH}/.venv-official-fx"

REMOTE_SCRIPT = f"""#!/usr/bin/env bash
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y python3-pip python3-venv

python3 -m venv "{VENV_PATH}"
"{VENV_PATH}/bin/python" -m pip install --upgrade pip
"{VENV_PATH}/bin/pip" install playwright
"{VENV_PATH}/bin/python" -m playwright install --with-deps chromium

grep -q '^OFFICIAL_FX_STEALTH_ENABLED=' "{APP_PATH}/.env.production" && \
  sed -i 's/^OFFICIAL_FX_STEALTH_ENABLED=.*/OFFICIAL_FX_STEALTH_ENABLED=true/' "{APP_PATH}/.env.production" || \
  echo 'OFFICIAL_FX_STEALTH_ENABLED=true' >> "{APP_PATH}/.env.production"

grep -q '^OFFICIAL_FX_STEALTH_HEADLESS=' "{APP_PATH}/.env.production" && \
  sed -i 's/^OFFICIAL_FX_STEALTH_HEADLESS=.*/OFFICIAL_FX_STEALTH_HEADLESS=true/' "{APP_PATH}/.env.production" || \
  echo 'OFFICIAL_FX_STEALTH_HEADLESS=true' >> "{APP_PATH}/.env.production"

grep -q '^OFFICIAL_FX_USE_CAMOUFOX=' "{APP_PATH}/.env.production" && \
  sed -i 's/^OFFICIAL_FX_USE_CAMOUFOX=.*/OFFICIAL_FX_USE_CAMOUFOX=false/' "{APP_PATH}/.env.production" || \
  echo 'OFFICIAL_FX_USE_CAMOUFOX=false' >> "{APP_PATH}/.env.production"

grep -q '^OFFICIAL_FX_BROWSER_CHANNEL=' "{APP_PATH}/.env.production" && \
  sed -i 's/^OFFICIAL_FX_BROWSER_CHANNEL=.*/OFFICIAL_FX_BROWSER_CHANNEL=/' "{APP_PATH}/.env.production" || \
  echo 'OFFICIAL_FX_BROWSER_CHANNEL=' >> "{APP_PATH}/.env.production"

grep -q '^OFFICIAL_FX_STEALTH_TIMEOUT_MS=' "{APP_PATH}/.env.production" && \
  sed -i 's/^OFFICIAL_FX_STEALTH_TIMEOUT_MS=.*/OFFICIAL_FX_STEALTH_TIMEOUT_MS=8000/' "{APP_PATH}/.env.production" || \
  echo 'OFFICIAL_FX_STEALTH_TIMEOUT_MS=8000' >> "{APP_PATH}/.env.production"

grep -q '^OFFICIAL_FX_CACHE_TTL_MS=' "{APP_PATH}/.env.production" && \
  sed -i 's/^OFFICIAL_FX_CACHE_TTL_MS=.*/OFFICIAL_FX_CACHE_TTL_MS=900000/' "{APP_PATH}/.env.production" || \
  echo 'OFFICIAL_FX_CACHE_TTL_MS=900000' >> "{APP_PATH}/.env.production"

grep -q '^OFFICIAL_FX_PYTHON_BIN=' "{APP_PATH}/.env.production" && \
  sed -i 's|^OFFICIAL_FX_PYTHON_BIN=.*|OFFICIAL_FX_PYTHON_BIN={VENV_PATH}/bin/python|' "{APP_PATH}/.env.production" || \
  echo 'OFFICIAL_FX_PYTHON_BIN={VENV_PATH}/bin/python' >> "{APP_PATH}/.env.production"

cp "{APP_PATH}/.env.production" "{APP_PATH}/.env"
chmod 600 "{APP_PATH}/.env" "{APP_PATH}/.env.production"

cd "{APP_PATH}"
pm2 restart cotizador --update-env
sleep 5

echo '--- helper ---'
"{VENV_PATH}/bin/python" "{APP_PATH}/scripts/fetch_official_fx.py" --headless 1 --use-camoufox 0 --timeout-ms 12000 || true
echo '--- api ---'
curl -fsS http://127.0.0.1:3000/api/monitor/health | head -c 300
printf '\\n'
echo '--- tipo cambio ---'
node -e "require('./server/sunat-proxy').getTipoCambio().then(x=>console.log(JSON.stringify(x))).catch(e=>{{console.error(e);process.exit(1)}})"
"""

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


def main():
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
            with sftp.open(f"{APP_PATH}/provision-official-fx-stealth.sh", "w") as remote_file:
                remote_file.write(REMOTE_SCRIPT)
            sftp.chmod(f"{APP_PATH}/provision-official-fx-stealth.sh", 0o755)
        finally:
            sftp.close()

        stdin, stdout, stderr = client.exec_command(
            f"bash {APP_PATH}/provision-official-fx-stealth.sh",
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
