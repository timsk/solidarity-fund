#!/usr/bin/env bash
set -euo pipefail

# ── Parameters ──────────────────────────────────────────────────────
SSH_TARGET="${1:?Usage: ./install.sh <user@host>}"
shift || true

# Defaults (override via env)
APP_NAME="${APP_NAME:-csf}"
DATA_DIR="${DATA_DIR:-/var/lib/$APP_NAME}"
HTTP_PORT="${HTTP_PORT:-80}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$DATA_DIR/.env"
IMAGE="ghcr.io/tinybluerobots/solidarity-fund:latest"

# ── Preserve existing config from remote .env ─────────────────────
EXISTING_ENV=$(ssh "$SSH_TARGET" "cat '$ENV_FILE' 2>/dev/null" || true)
	if [ -n "$EXISTING_ENV" ]; then
		ADMIN_PASSWORD="${ADMIN_PASSWORD:-$(echo "$EXISTING_ENV" | grep '^ADMIN_PASSWORD=' | sed 's/^ADMIN_PASSWORD=//' | tr -d "'" || true)}"
		ALTCHA_HMAC_KEY="${ALTCHA_HMAC_KEY:-$(echo "$EXISTING_ENV" | grep '^ALTCHA_HMAC_KEY=' | sed 's/^ALTCHA_HMAC_KEY=//' | tr -d "'" || true)}"
		FUND_NAME="${FUND_NAME:-$(echo "$EXISTING_ENV" | grep '^FUND_NAME=' | sed 's/^FUND_NAME=//' | tr -d "'" || true)}"
		PORT="${PORT:-$(echo "$EXISTING_ENV" | grep '^PORT=' | sed 's/^PORT=//' | tr -d "'" || true)}"
		SMS_ENABLED="${SMS_ENABLED:-$(echo "$EXISTING_ENV" | grep '^SMS_ENABLED=' | sed 's/^SMS_ENABLED=//' | tr -d "'" || true)}"
		SMS_LOG_LEVEL="${SMS_LOG_LEVEL:-$(echo "$EXISTING_ENV" | grep '^SMS_LOG_LEVEL=' | sed 's/^SMS_LOG_LEVEL=//' | tr -d "'" || true)}"
		CLICKSEND_USERNAME="${CLICKSEND_USERNAME:-$(echo "$EXISTING_ENV" | grep '^CLICKSEND_USERNAME=' | sed 's/^CLICKSEND_USERNAME=//' | tr -d "'" || true)}"
		CLICKSEND_API_KEY="${CLICKSEND_API_KEY:-$(echo "$EXISTING_ENV" | grep '^CLICKSEND_API_KEY=' | sed 's/^CLICKSEND_API_KEY=//' | tr -d "'" || true)}"
		EMAIL_ENABLED="${EMAIL_ENABLED:-$(echo "$EXISTING_ENV" | grep '^EMAIL_ENABLED=' | sed 's/^EMAIL_ENABLED=//' | tr -d "'" || true)}"
		GMAIL_USER="${GMAIL_USER:-$(echo "$EXISTING_ENV" | grep '^GMAIL_USER=' | sed 's/^GMAIL_USER=//' | tr -d "'" || true)}"
		GMAIL_APP_PASSWORD="${GMAIL_APP_PASSWORD:-$(echo "$EXISTING_ENV" | grep '^GMAIL_APP_PASSWORD=' | sed 's/^GMAIL_APP_PASSWORD=//' | tr -d "'" || true)}"
		EMAIL_FROM_NAME="${EMAIL_FROM_NAME:-$(echo "$EXISTING_ENV" | grep '^EMAIL_FROM_NAME=' | sed 's/^EMAIL_FROM_NAME=//' | tr -d "'" || true)}"
	fi

# Defaults for vars that can be overridden by remote .env
PORT="${PORT:-443}"
FUND_NAME="${FUND_NAME:-Community Solidarity Fund}"

# Auto-generate secrets if still not set (first install)
ADMIN_PASSWORD="${ADMIN_PASSWORD:-$(openssl rand -base64 32)}"
ALTCHA_HMAC_KEY="${ALTCHA_HMAC_KEY:-$(openssl rand -base64 32)}"

if [ -n "$EXISTING_ENV" ]; then
	echo "==> Reusing existing secrets from remote .env"
else
	echo "==> Generated NEW secrets (save these!):"
	echo "    ADMIN_PASSWORD=$ADMIN_PASSWORD"
	echo "    ALTCHA_HMAC_KEY=$ALTCHA_HMAC_KEY"
fi

# ── Write env file to remote first ─────────────────────────────────
# Set defaults for optional variables before escaping
: "${SMS_ENABLED:=false}"
: "${SMS_LOG_LEVEL:=warn}"
: "${EMAIL_ENABLED:=false}"

ssh "$SSH_TARGET" "mkdir -p '$DATA_DIR'"
ssh "$SSH_TARGET" "cat > '$ENV_FILE' && chmod 600 '$ENV_FILE'" <<EOF
APP_NAME='${APP_NAME//\'/\'\\\'\'}'
DATA_DIR='${DATA_DIR//\'/\'\\\'\'}'
PORT='${PORT//\'/\'\\\'\'}'
HTTP_PORT='${HTTP_PORT//\'/\'\\\'\'}'
FUND_NAME='${FUND_NAME//\'/\'\\\'\'}'
ADMIN_PASSWORD='${ADMIN_PASSWORD//\'/\'\\\'\'}'
ALTCHA_HMAC_KEY='${ALTCHA_HMAC_KEY//\'/\'\\\'\'}'
SMS_ENABLED='${SMS_ENABLED//\'/\'\\\'\'}'
SMS_LOG_LEVEL='${SMS_LOG_LEVEL//\'/\'\\\'\'}'
CLICKSEND_USERNAME='${CLICKSEND_USERNAME//\'/\'\\\'\'}'
CLICKSEND_API_KEY='${CLICKSEND_API_KEY//\'/\'\\\'\'}'
EMAIL_ENABLED='${EMAIL_ENABLED//\'/\'\\\'\'}'
GMAIL_USER='${GMAIL_USER//\'/\'\\\'\'}'
GMAIL_APP_PASSWORD='${GMAIL_APP_PASSWORD//\'/\'\\\'\'}'
EMAIL_FROM_NAME='${EMAIL_FROM_NAME//\'/\'\\\'\'}'
IMAGE='${IMAGE//\'/\'\\\'\'}'
NODE_ENV=production
EOF

# ── Copy compose file ──────────────────────────────────────────────
scp "$SCRIPT_DIR/docker-compose.yml" "$SSH_TARGET:$DATA_DIR/docker-compose.yml"

# ── Remote setup (reads config from env file) ──────────────────────
ssh "$SSH_TARGET" "ENV_FILE='$ENV_FILE' bash" <<'REMOTE'
set -euo pipefail
set -a; source "$ENV_FILE"; set +a
export DEBIAN_FRONTEND=noninteractive

# ── Docker ──────────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  echo "==> Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
fi

# ── Self-signed TLS cert ─────────────────────────────────────────────
CERT_DIR="$DATA_DIR/certs"
mkdir -p "$CERT_DIR"
if [ ! -f "$CERT_DIR/cert.pem" ]; then
  HOST_IP="$(hostname -I | awk '{print $1}')"
  echo "==> Generating self-signed TLS certificate for $HOST_IP..."
  openssl req -x509 -newkey rsa:2048 -days 3650 -nodes \
    -keyout "$CERT_DIR/key.pem" \
    -out "$CERT_DIR/cert.pem" \
    -subj "/CN=solidarity-fund" \
    -addext "subjectAltName=IP:$HOST_IP"
fi

# ── Pull image ──────────────────────────────────────────────────────
echo "==> Pulling $IMAGE..."
docker pull "$IMAGE"

# ── Start containers ───────────────────────────────────────────────
cd "$DATA_DIR"
docker compose down 2>/dev/null || true
docker compose up -d

echo ""
echo "==> $APP_NAME is running on port $PORT (HTTPS) with redirect from $HTTP_PORT (HTTP)"
docker compose ps

echo ""
echo "==> TO UPGRADE:"
echo "    Run this script again — pulls latest image and restarts."
REMOTE

echo "==> Done. $APP_NAME deployed to $SSH_TARGET"