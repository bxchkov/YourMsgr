#!/usr/bin/env bash

set -euo pipefail

APP_NAME="YourMsgr"
PROJECT_NAME="yourmsgr"
REPO_URL="${YOURMSGR_REPO_URL:-https://github.com/bxchkov/.Chat.git}"
REPO_BRANCH="${YOURMSGR_REPO_BRANCH:-main}"
INSTALL_DIR="${YOURMSGR_INSTALL_DIR:-/opt/yourmsgr}"
HELPER_TARGET="/usr/local/bin/yourmsgr"

INSTALL_MODE="fresh"
BOOTSTRAPPED_ADMIN_LOGIN=""
BOOTSTRAPPED_ADMIN_PASSWORD=""
BOOTSTRAPPED_ADMIN_USERNAME=""

log() {
  printf '[%s] %s\n' "$APP_NAME" "$1"
}

fail() {
  printf '[%s] ERROR: %s\n' "$APP_NAME" "$1" >&2
  exit 1
}

require_root() {
  if [[ "$(id -u)" -ne 0 ]]; then
    fail "Please run this installer as root"
  fi
}

detect_package_manager() {
  if command -v apt-get >/dev/null 2>&1; then
    echo "apt"
    return
  fi

  if command -v dnf >/dev/null 2>&1; then
    echo "dnf"
    return
  fi

  if command -v yum >/dev/null 2>&1; then
    echo "yum"
    return
  fi

  fail "Unsupported Linux distribution"
}

install_base_packages() {
  local manager
  manager="$(detect_package_manager)"

  case "$manager" in
    apt)
      apt-get update
      DEBIAN_FRONTEND=noninteractive apt-get install -y curl git ca-certificates openssl tar
      ;;
    dnf)
      dnf install -y curl git ca-certificates openssl tar
      ;;
    yum)
      yum install -y curl git ca-certificates openssl tar
      ;;
  esac
}

install_docker_if_needed() {
  if ! command -v docker >/dev/null 2>&1; then
    log "Installing Docker"
    curl -fsSL https://get.docker.com | sh
  else
    log "Docker is already installed"
  fi

  if command -v systemctl >/dev/null 2>&1; then
    systemctl enable --now docker
  fi

  docker compose version >/dev/null 2>&1 || fail "Docker Compose plugin is required"
}

random_secret() {
  openssl rand -hex 32
}

random_simple_value() {
  local length="${1:-12}"
  openssl rand -hex "$length" | cut -c "1-${length}"
}

detect_public_host() {
  if [[ -n "${YOURMSGR_PUBLIC_HOST:-}" ]]; then
    printf '%s' "$YOURMSGR_PUBLIC_HOST"
    return
  fi

  local detected
  detected="$(curl -4fsSL https://api.ipify.org 2>/dev/null || true)"

  if [[ -z "$detected" ]]; then
    detected="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
  fi

  if [[ -z "$detected" ]]; then
    detected="localhost"
  fi

  printf '%s' "$detected"
}

compose() {
  (
    cd "$INSTALL_DIR"
    docker compose --project-name "$PROJECT_NAME" --env-file "$INSTALL_DIR/.env" "$@"
  )
}

get_env_value() {
  local key="$1"
  local default_value="${2:-}"

  if [[ ! -f "$INSTALL_DIR/.env" ]]; then
    printf '%s' "$default_value"
    return
  fi

  local value
  value="$(grep "^${key}=" "$INSTALL_DIR/.env" | cut -d '=' -f 2- || true)"
  printf '%s' "${value:-$default_value}"
}

get_project_version() {
  local version_path="$INSTALL_DIR/VERSION"

  if [[ -f "$version_path" ]]; then
    tr -d '[:space:]' < "$version_path"
    return
  fi

  printf '%s' "unknown"
}

clone_or_update_repo() {
  if [[ -d "$INSTALL_DIR/.git" ]]; then
    INSTALL_MODE="update"
    log "Updating existing repository in $INSTALL_DIR"
    git -C "$INSTALL_DIR" fetch --all --tags
    git -C "$INSTALL_DIR" checkout "$REPO_BRANCH"
    git -C "$INSTALL_DIR" pull --ff-only origin "$REPO_BRANCH"
    return
  fi

  INSTALL_MODE="fresh"
  log "Cloning repository into $INSTALL_DIR"
  rm -rf "$INSTALL_DIR"
  git clone --branch "$REPO_BRANCH" "$REPO_URL" "$INSTALL_DIR"
}

write_compose_env() {
  local env_path="$INSTALL_DIR/.env"

  if [[ -f "$env_path" ]]; then
    log "Keeping existing $env_path"
    return
  fi

  local public_host client_port postgres_password

  public_host="$(detect_public_host)"
  client_port="${YOURMSGR_CLIENT_PORT:-80}"
  postgres_password="${YOURMSGR_POSTGRES_PASSWORD:-$(random_secret)}"

  cat > "$env_path" <<EOF
POSTGRES_USER=${YOURMSGR_POSTGRES_USER:-chat_user}
POSTGRES_PASSWORD=$postgres_password
POSTGRES_DB=${YOURMSGR_POSTGRES_DB:-chat}

NODE_ENV=production
ALLOWED_ORIGINS=http://$public_host,https://$public_host,http://localhost,http://127.0.0.1

CLIENT_BIND=${YOURMSGR_CLIENT_BIND:-0.0.0.0}
CLIENT_PORT=$client_port

SERVER_BIND=${YOURMSGR_SERVER_BIND:-127.0.0.1}
SERVER_PORT=${YOURMSGR_SERVER_PORT:-3000}

POSTGRES_BIND=${YOURMSGR_POSTGRES_BIND:-127.0.0.1}
POSTGRES_PORT=${YOURMSGR_POSTGRES_PORT:-5432}
EOF

  log "Created $env_path"
}

write_server_env() {
  local env_path="$INSTALL_DIR/server/.env"

  if [[ -f "$env_path" ]]; then
    log "Keeping existing $env_path"
    return
  fi

  cat > "$env_path" <<EOF
JWT_ACCESS_SECRET=${YOURMSGR_JWT_ACCESS_SECRET:-$(random_secret)}
JWT_REFRESH_SECRET=${YOURMSGR_JWT_REFRESH_SECRET:-$(random_secret)}

RATE_LIMIT_MAX=${YOURMSGR_RATE_LIMIT_MAX:-100}
RATE_LIMIT_WINDOW=${YOURMSGR_RATE_LIMIT_WINDOW:-15}
EOF

  log "Created $env_path"
}

install_helper() {
  install -m 0755 "$INSTALL_DIR/scripts/yourmsgr.sh" "$HELPER_TARGET"
  log "Installed helper command: yourmsgr"
}

start_stack() {
  log "Starting Docker stack"
  compose up -d --build
}

wait_for_http() {
  local url="$1"
  local name="$2"
  local attempts="${3:-60}"

  local attempt
  for attempt in $(seq 1 "$attempts"); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      log "$name is ready"
      return
    fi

    sleep 2
  done

  fail "$name did not become ready in time ($url)"
}

wait_for_stack() {
  local server_port client_port
  server_port="$(get_env_value SERVER_PORT 3000)"
  client_port="$(get_env_value CLIENT_PORT 80)"

  wait_for_http "http://127.0.0.1:${server_port}/healthz" "Server" 60
  wait_for_http "http://127.0.0.1:${client_port}/auth" "Client" 60
}

prepare_bootstrap_admin_credentials() {
  if [[ "$INSTALL_MODE" != "fresh" ]]; then
    return
  fi

  BOOTSTRAPPED_ADMIN_LOGIN="${YOURMSGR_ADMIN_LOGIN:-admin$(random_simple_value 6 | tr '[:upper:]' '[:lower:]')}"
  BOOTSTRAPPED_ADMIN_PASSWORD="${YOURMSGR_ADMIN_PASSWORD:-$(random_simple_value 14)}"
  BOOTSTRAPPED_ADMIN_USERNAME="${YOURMSGR_ADMIN_USERNAME:-$BOOTSTRAPPED_ADMIN_LOGIN}"

  if [[ -t 0 ]]; then
    local input_login input_password input_username

    read -r -p "Initial admin login [${BOOTSTRAPPED_ADMIN_LOGIN}]: " input_login || true
    read -r -p "Initial admin password [${BOOTSTRAPPED_ADMIN_PASSWORD}]: " input_password || true
    read -r -p "Initial admin display name [${BOOTSTRAPPED_ADMIN_USERNAME}]: " input_username || true

    BOOTSTRAPPED_ADMIN_LOGIN="${input_login:-$BOOTSTRAPPED_ADMIN_LOGIN}"
    BOOTSTRAPPED_ADMIN_PASSWORD="${input_password:-$BOOTSTRAPPED_ADMIN_PASSWORD}"
    BOOTSTRAPPED_ADMIN_USERNAME="${input_username:-$BOOTSTRAPPED_ADMIN_USERNAME}"
  fi
}

bootstrap_admin() {
  if [[ "$INSTALL_MODE" != "fresh" ]]; then
    return
  fi

  prepare_bootstrap_admin_credentials

  local bootstrap_output
  bootstrap_output="$(compose exec -T server bun src/cli/admin.ts users:bootstrap-admin \
    "$BOOTSTRAPPED_ADMIN_LOGIN" \
    "$BOOTSTRAPPED_ADMIN_PASSWORD" \
    "$BOOTSTRAPPED_ADMIN_USERNAME" 2>&1 || true)"

  echo "$bootstrap_output"

  if grep -q "Bootstrapped admin" <<<"$bootstrap_output"; then
    log "Initial admin account created"
    return
  fi

  if grep -q "Admin bootstrap skipped" <<<"$bootstrap_output"; then
    BOOTSTRAPPED_ADMIN_LOGIN=""
    BOOTSTRAPPED_ADMIN_PASSWORD=""
    BOOTSTRAPPED_ADMIN_USERNAME=""
    log "Admin bootstrap skipped"
    return
  fi

  fail "Failed to bootstrap admin account"
}

print_summary() {
  local public_host client_port

  public_host="$(detect_public_host)"
  client_port="$(get_env_value CLIENT_PORT 80)"

  log "Installation completed"
  echo
  echo "Version: $(get_project_version)"
  echo "Panel URL: http://$public_host:$client_port"
  echo

  if [[ -n "$BOOTSTRAPPED_ADMIN_LOGIN" ]]; then
    echo "Initial admin credentials:"
    echo "  login:    $BOOTSTRAPPED_ADMIN_LOGIN"
    echo "  password: $BOOTSTRAPPED_ADMIN_PASSWORD"
    echo "  username: $BOOTSTRAPPED_ADMIN_USERNAME"
    echo
  fi

  echo "Useful commands:"
  echo "  yourmsgr"
  echo "  yourmsgr version"
  echo "  yourmsgr check-update"
  echo "  yourmsgr status"
  echo "  yourmsgr health"
  echo "  yourmsgr logs"
  echo "  yourmsgr update"
  echo "  yourmsgr backup"
  echo "  yourmsgr admin stats"
  echo "  yourmsgr admin users:list"
}

main() {
  require_root
  install_base_packages
  install_docker_if_needed
  clone_or_update_repo
  write_compose_env
  write_server_env
  install_helper
  start_stack
  wait_for_stack
  bootstrap_admin
  print_summary
}

main "$@"
