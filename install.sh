#!/usr/bin/env bash

set -euo pipefail

APP_NAME="YourMsgr"
PROJECT_NAME="yourmsgr"
REPO_URL="${YOURMSGR_REPO_URL:-https://github.com/bxchkov/YourMsgr.git}"
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

warn() {
  printf '[%s] %s\n' "$APP_NAME" "$1" >&2
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

is_interactive() {
  [[ -t 0 && -t 1 ]]
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
    if systemctl list-unit-files docker.socket >/dev/null 2>&1; then
      systemctl unmask docker.socket >/dev/null 2>&1 || true
      systemctl enable --now docker.socket
    fi

    systemctl unmask docker.service >/dev/null 2>&1 || true
    systemctl enable docker.service >/dev/null 2>&1 || true
    systemctl start docker.service >/dev/null 2>&1 || true
  fi

  docker compose version >/dev/null 2>&1 || fail "Docker Compose plugin is required"
  wait_for_docker_daemon
}

wait_for_docker_daemon() {
  local attempt

  for attempt in $(seq 1 30); do
    if docker info >/dev/null 2>&1; then
      log "Docker daemon is ready"
      return
    fi

    sleep 2
  done

  if command -v systemctl >/dev/null 2>&1; then
    systemctl status docker --no-pager || true
    systemctl status docker.socket --no-pager || true
  fi

  fail "Docker daemon did not become ready in time"
}

random_secret() {
  openssl rand -hex 32
}

random_simple_value() {
  local length="${1:-12}"
  openssl rand -hex "$length" | cut -c "1-${length}"
}

detect_public_ip() {
  if [[ -n "${YOURMSGR_PUBLIC_IP:-}" ]]; then
    printf '%s' "$YOURMSGR_PUBLIC_IP"
    return
  fi

  local detected
  detected="$(curl -4fsSL https://api.ipify.org 2>/dev/null || true)"

  if [[ -z "$detected" ]]; then
    detected="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
  fi

  if [[ -z "$detected" ]]; then
    detected="127.0.0.1"
  fi

  printf '%s' "$detected"
}

is_ipv4_address() {
  [[ "$1" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]
}

read_env_value() {
  local env_path="$1"
  local key="$2"
  local default_value="${3:-}"

  if [[ ! -f "$env_path" ]]; then
    printf '%s' "$default_value"
    return
  fi

  local value
  value="$(grep "^${key}=" "$env_path" | head -n 1 | cut -d '=' -f 2- || true)"
  value="${value//$'\r'/}"
  printf '%s' "${value:-$default_value}"
}

extract_host_from_url() {
  local value="$1"

  value="${value#http://}"
  value="${value#https://}"
  value="${value%%/*}"
  value="${value%%:*}"

  printf '%s' "$value"
}

prompt_public_host() {
  local detected_ip="$1"
  local existing_host="$2"

  if [[ -n "${YOURMSGR_PUBLIC_HOST:-}" ]]; then
    printf '%s' "$YOURMSGR_PUBLIC_HOST"
    return
  fi

  if [[ -n "$existing_host" ]]; then
    printf '%s' "$existing_host"
    return
  fi

  if ! is_interactive; then
    printf '%s' "$detected_ip"
    return
  fi

  local input_host=""
  read -r -p "Panel domain (leave blank to use server IP ${detected_ip}): " input_host || true
  printf '%s' "${input_host:-$detected_ip}"
}

validate_public_host() {
  local public_host="$1"
  local detected_ip="$2"

  if [[ "$public_host" == *"/"* || "$public_host" == *" "* || "$public_host" == *":"* ]]; then
    fail "Public host must be a bare domain or IPv4 address"
  fi

  if is_ipv4_address "$public_host"; then
    return
  fi

  local resolved_ips
  resolved_ips="$(getent ahostsv4 "$public_host" 2>/dev/null | awk '{print $1}' | sort -u || true)"

  if [[ -z "$resolved_ips" ]]; then
    fail "Domain '$public_host' does not resolve on this server"
  fi

  if ! grep -qx "$detected_ip" <<<"$resolved_ips"; then
    fail "Domain '$public_host' resolves to [$resolved_ips], but this server IP is '$detected_ip'"
  fi
}

port_in_use() {
  local port="$1"

  if command -v ss >/dev/null 2>&1; then
    ss -H -ltn 2>/dev/null | awk '{print $4}' | grep -Eq "(^|[:.])${port}$"
    return
  fi

  if command -v netstat >/dev/null 2>&1; then
    netstat -ltn 2>/dev/null | awk '{print $4}' | grep -Eq "[:.]${port}$"
    return
  fi

  return 1
}

find_available_port() {
  local candidate

  for candidate in "$@"; do
    if ! port_in_use "$candidate"; then
      RESOLVED_PORT="$candidate"
      return 0
    fi
  done

  return 1
}

RESOLVED_PORT=""

resolve_bind_port() {
  local port_kind="$1"
  local desired_port="$2"
  local prompt_label="$3"
  shift 3
  local fallback_port=""
  local input_port=""

  RESOLVED_PORT=""

  if ! port_in_use "$desired_port"; then
    RESOLVED_PORT="$desired_port"
    return
  fi

  if is_interactive; then
    while true; do
      read -r -p "$prompt_label [$desired_port]: " input_port || true
      input_port="${input_port:-$desired_port}"

      if [[ ! "$input_port" =~ ^[0-9]+$ ]]; then
        echo "Please enter a numeric port" >&2
        continue
      fi

      if port_in_use "$input_port"; then
        echo "Port $input_port is already in use" >&2
        continue
      fi

      RESOLVED_PORT="$input_port"
      return
    done
  fi

  if find_available_port "$@"; then
    fallback_port="$RESOLVED_PORT"
  fi

  if [[ -n "$fallback_port" ]]; then
    warn "$port_kind port $desired_port is busy, using $fallback_port"
    return
  fi

  fail "$port_kind port $desired_port is already in use and no fallback port was found"
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
  read_env_value "$INSTALL_DIR/.env" "$key" "$default_value"
}

get_project_version() {
  local version_path="$INSTALL_DIR/VERSION"

  if [[ -f "$version_path" ]]; then
    tr -d '[:space:]' < "$version_path"
    return
  fi

  printf '%s' "unknown"
}

build_public_url() {
  local public_host="$1"
  local https_port="$2"

  if [[ "$https_port" == "443" ]]; then
    printf 'https://%s' "$public_host"
    return
  fi

  printf 'https://%s:%s' "$public_host" "$https_port"
}

build_tls_alt_names() {
  local public_host="$1"
  local detected_ip="$2"

  if is_ipv4_address "$public_host"; then
    printf 'IP:%s' "$public_host"
    return
  fi

  if [[ -n "$detected_ip" ]]; then
    printf 'DNS:%s,IP:%s' "$public_host" "$detected_ip"
    return
  fi

  printf 'DNS:%s' "$public_host"
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
  local detected_ip existing_public_host existing_http_port existing_https_port
  local existing_public_url existing_allowed_origins
  local public_host public_url tls_alt_names postgres_password
  local client_http_bind client_http_port client_https_bind client_https_port
  local server_bind server_port postgres_bind postgres_port restart_policy
  local postgres_user postgres_db

  detected_ip="$(detect_public_ip)"
  existing_public_host="$(read_env_value "$env_path" PUBLIC_HOST "")"
  existing_public_url="$(read_env_value "$env_path" PUBLIC_URL "")"
  existing_allowed_origins="$(read_env_value "$env_path" ALLOWED_ORIGINS "")"
  existing_http_port="$(read_env_value "$env_path" CLIENT_HTTP_PORT "")"
  existing_https_port="$(read_env_value "$env_path" CLIENT_HTTPS_PORT "")"

  if [[ -z "$existing_public_host" && -n "$existing_public_url" ]]; then
    existing_public_host="$(extract_host_from_url "$existing_public_url")"
  fi

  if [[ -z "$existing_public_host" && -n "$existing_allowed_origins" ]]; then
    existing_public_host="$(extract_host_from_url "${existing_allowed_origins%%,*}")"
  fi

  public_host="$(prompt_public_host "$detected_ip" "$existing_public_host")"
  validate_public_host "$public_host" "$detected_ip"

  client_http_bind="${YOURMSGR_CLIENT_HTTP_BIND:-$(read_env_value "$env_path" CLIENT_HTTP_BIND "0.0.0.0")}"
  client_https_bind="${YOURMSGR_CLIENT_HTTPS_BIND:-$(read_env_value "$env_path" CLIENT_HTTPS_BIND "0.0.0.0")}"
  server_bind="${YOURMSGR_SERVER_BIND:-$(read_env_value "$env_path" SERVER_BIND "127.0.0.1")}"
  server_port="${YOURMSGR_SERVER_PORT:-$(read_env_value "$env_path" SERVER_PORT "3000")}"
  postgres_bind="${YOURMSGR_POSTGRES_BIND:-$(read_env_value "$env_path" POSTGRES_BIND "127.0.0.1")}"
  postgres_port="${YOURMSGR_POSTGRES_PORT:-$(read_env_value "$env_path" POSTGRES_PORT "5432")}"
  postgres_password="${YOURMSGR_POSTGRES_PASSWORD:-$(read_env_value "$env_path" POSTGRES_PASSWORD "$(random_secret)")}"
  postgres_user="${YOURMSGR_POSTGRES_USER:-$(read_env_value "$env_path" POSTGRES_USER "chat_user")}"
  postgres_db="${YOURMSGR_POSTGRES_DB:-$(read_env_value "$env_path" POSTGRES_DB "chat")}"
  restart_policy="${YOURMSGR_RESTART_POLICY:-$(read_env_value "$env_path" RESTART_POLICY "unless-stopped")}"

  resolve_bind_port "HTTP" "${YOURMSGR_CLIENT_HTTP_PORT:-${existing_http_port:-80}}" "HTTP redirect port" 80 8080 8000 18080
  client_http_port="$RESOLVED_PORT"

  resolve_bind_port "HTTPS" "${YOURMSGR_CLIENT_HTTPS_PORT:-${existing_https_port:-443}}" "HTTPS panel port" 443 8443 9443 10443
  client_https_port="$RESOLVED_PORT"

  public_url="$(build_public_url "$public_host" "$client_https_port")"
  tls_alt_names="$(build_tls_alt_names "$public_host" "$detected_ip")"

  mkdir -p "$INSTALL_DIR/deploy/certs"

  cat > "$env_path" <<EOF
POSTGRES_USER=$postgres_user
POSTGRES_PASSWORD=$postgres_password
POSTGRES_DB=$postgres_db

NODE_ENV=production
PUBLIC_HOST=$public_host
PUBLIC_URL=$public_url
ALLOWED_ORIGINS=$public_url

CLIENT_HTTP_BIND=$client_http_bind
CLIENT_HTTP_PORT=$client_http_port
CLIENT_HTTPS_BIND=$client_https_bind
CLIENT_HTTPS_PORT=$client_https_port

SERVER_BIND=$server_bind
SERVER_PORT=$server_port

POSTGRES_BIND=$postgres_bind
POSTGRES_PORT=$postgres_port

TLS_CERT_PATH=/etc/nginx/certs/server.crt
TLS_KEY_PATH=/etc/nginx/certs/server.key
TLS_ALT_NAMES=$tls_alt_names
RESTART_POLICY=$restart_policy
EOF

  log "Wrote $env_path"
}

write_server_env() {
  local env_path="$INSTALL_DIR/server/.env"
  local existing_access_secret existing_refresh_secret
  local rate_limit_max rate_limit_window

  existing_access_secret="$(read_env_value "$env_path" JWT_ACCESS_SECRET "$(random_secret)")"
  existing_refresh_secret="$(read_env_value "$env_path" JWT_REFRESH_SECRET "$(random_secret)")"
  rate_limit_max="${YOURMSGR_RATE_LIMIT_MAX:-$(read_env_value "$env_path" RATE_LIMIT_MAX "100")}"
  rate_limit_window="${YOURMSGR_RATE_LIMIT_WINDOW:-$(read_env_value "$env_path" RATE_LIMIT_WINDOW "15")}"

  cat > "$env_path" <<EOF
JWT_ACCESS_SECRET=${YOURMSGR_JWT_ACCESS_SECRET:-$existing_access_secret}
JWT_REFRESH_SECRET=${YOURMSGR_JWT_REFRESH_SECRET:-$existing_refresh_secret}

RATE_LIMIT_MAX=$rate_limit_max
RATE_LIMIT_WINDOW=$rate_limit_window
EOF

  log "Wrote $env_path"
}

install_helper() {
  install -m 0755 "$INSTALL_DIR/scripts/yourmsgr.sh" "$HELPER_TARGET"
  log "Installed helper command: yourmsgr"
}

start_stack() {
  log "Starting Docker stack"
  compose up -d --build
}

wait_for_url() {
  local url="$1"
  local name="$2"
  local attempts="${3:-60}"
  local curl_insecure="${4:-0}"

  local attempt curl_args=()
  if [[ "$curl_insecure" == "1" ]]; then
    curl_args+=(-k)
  fi

  for attempt in $(seq 1 "$attempts"); do
    if curl -fsS "${curl_args[@]}" "$url" >/dev/null 2>&1; then
      log "$name is ready"
      return
    fi

    sleep 2
  done

  fail "$name did not become ready in time ($url)"
}

wait_for_stack() {
  local server_port client_http_port client_https_port
  server_port="$(get_env_value SERVER_PORT 3000)"
  client_http_port="$(get_env_value CLIENT_HTTP_PORT 80)"
  client_https_port="$(get_env_value CLIENT_HTTPS_PORT 443)"

  wait_for_url "http://127.0.0.1:${server_port}/healthz" "Server" 60
  wait_for_url "http://127.0.0.1:${client_http_port}/healthz" "Client HTTP" 60
  wait_for_url "https://127.0.0.1:${client_https_port}/auth" "Client HTTPS" 60 1
}

prepare_bootstrap_admin_credentials() {
  if [[ "$INSTALL_MODE" != "fresh" ]]; then
    return
  fi

  BOOTSTRAPPED_ADMIN_LOGIN="${YOURMSGR_ADMIN_LOGIN:-admin$(random_simple_value 6 | tr '[:upper:]' '[:lower:]')}"
  BOOTSTRAPPED_ADMIN_PASSWORD="${YOURMSGR_ADMIN_PASSWORD:-$(random_simple_value 14)}"
  BOOTSTRAPPED_ADMIN_USERNAME="${YOURMSGR_ADMIN_USERNAME:-$BOOTSTRAPPED_ADMIN_LOGIN}"

  if is_interactive; then
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
  local public_url
  public_url="$(get_env_value PUBLIC_URL "unknown")"

  log "Installation completed"
  echo
  echo "Version: $(get_project_version)"
  echo "Panel URL: $public_url"
  echo "TLS: self-signed certificate"
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
  echo "  yourmsgr status"
  echo "  yourmsgr logs"
  echo "  yourmsgr check-update"
  echo "  yourmsgr service start"
  echo "  yourmsgr service stop"
  echo "  yourmsgr service autostart on"
  echo "  yourmsgr service autorestart on"
  echo "  yourmsgr admin stats"
  echo "  yourmsgr uninstall"
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
