#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/alipay-mcp.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "[ERROR] Config file not found: $ENV_FILE"
  echo "[ACTION] Please create scripts/alipay-mcp.env first."
  exit 1
fi

set -a
source "$ENV_FILE"
set +a

if [[ -z "${AP_APP_ID:-}" ]]; then
  echo "[ERROR] AP_APP_ID is missing."
  exit 1
fi

if [[ -z "${AP_APP_KEY:-}" ]]; then
  echo "[ERROR] AP_APP_KEY is missing."
  echo "[TIP] AP_APP_KEY must be APP PRIVATE KEY."
  exit 1
fi

if [[ "${AP_APP_KEY}" == "__REPLACE_WITH_APP_PRIVATE_KEY__" ]]; then
  echo "[ERROR] AP_APP_KEY still uses placeholder."
  echo "[ACTION] Fill real private key in scripts/alipay-mcp.env."
  exit 1
fi

if [[ -z "${AP_PUB_KEY:-}" ]]; then
  echo "[ERROR] AP_PUB_KEY is missing."
  exit 1
fi

if [[ -z "${AP_RETURN_URL:-}" ]]; then
  echo "[ERROR] AP_RETURN_URL is missing."
  exit 1
fi

if [[ -z "${AP_NOTIFY_URL:-}" ]]; then
  echo "[ERROR] AP_NOTIFY_URL is missing."
  exit 1
fi

echo "[INFO] Starting MCP Inspector + Alipay MCP server..."
npx -y @modelcontextprotocol/inspector npx -y @alipay/mcp-server-alipay
