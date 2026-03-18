#!/usr/bin/env bash

set -euo pipefail

INSTALL_DIR="${YOURMSGR_INSTALL_DIR:-/opt/yourmsgr}"
PROJECT_NAME="yourmsgr"
HELPER_TARGET="/usr/local/bin/yourmsgr"

if [[ ! -d "$INSTALL_DIR" ]]; then
  echo "Install directory '$INSTALL_DIR' not found"
  exit 1
fi

if [[ -t 1 ]]; then
  COLOR_RESET=$'\033[0m'
  COLOR_ACCENT=$'\033[38;5;201m'
  COLOR_TITLE=$'\033[38;5;220m'
  COLOR_INFO=$'\033[38;5;45m'
  COLOR_OK=$'\033[38;5;46m'
  COLOR_WARN=$'\033[38;5;214m'
  COLOR_ERROR=$'\033[38;5;196m'
  COLOR_DIM=$'\033[38;5;250m'
  COLOR_HIGHLIGHT=$'\033[1m'
else
  COLOR_RESET=""
  COLOR_ACCENT=""
  COLOR_TITLE=""
  COLOR_INFO=""
  COLOR_OK=""
  COLOR_WARN=""
  COLOR_ERROR=""
  COLOR_DIM=""
  COLOR_HIGHLIGHT=""
fi

load_env() {
  if [[ -f "$INSTALL_DIR/.env" ]]; then
    set -a
    # shellcheck disable=SC1091
    source "$INSTALL_DIR/.env"
    set +a
  fi
}

current_version() {
  if [[ -f "$INSTALL_DIR/VERSION" ]]; then
    tr -d '[:space:]' < "$INSTALL_DIR/VERSION"
    return
  fi

  echo "unknown"
}

current_branch() {
  local upstream branch

  upstream="$(git -C "$INSTALL_DIR" rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>/dev/null || true)"
  if [[ -n "$upstream" ]]; then
    branch="${upstream#origin/}"
    echo "${branch:-main}"
    return
  fi

  git -C "$INSTALL_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main"
}

remote_default_branch() {
  local remote_head

  remote_head="$(git -C "$INSTALL_DIR" ls-remote --symref origin HEAD 2>/dev/null | awk '/^ref:/ { sub("refs/heads/", "", $2); print $2; exit }')"
  echo "${remote_head:-main}"
}

current_public_url() {
  load_env
  echo "${PUBLIC_URL:-https://localhost}"
}

current_restart_policy() {
  load_env
  echo "${RESTART_POLICY:-unless-stopped}"
}

compose() {
  load_env
  local env_args=()

  if [[ -f "$INSTALL_DIR/.env" ]]; then
    env_args=(--env-file "$INSTALL_DIR/.env")
  fi

  (
    cd "$INSTALL_DIR"
    docker compose \
      --project-name "$PROJECT_NAME" \
      "${env_args[@]}" \
      -f "$INSTALL_DIR/docker-compose.yml" \
      "$@"
  )
}

server_health_url() {
  load_env
  echo "http://127.0.0.1:${SERVER_PORT:-3000}/healthz"
}

client_http_health_url() {
  load_env
  echo "http://127.0.0.1:${CLIENT_HTTP_PORT:-80}/healthz"
}

client_https_app_url() {
  load_env
  echo "https://127.0.0.1:${CLIENT_HTTPS_PORT:-443}/auth"
}

format_value() {
  local color="$1"
  local value="$2"
  printf "%s%s%s" "$color" "$value" "$COLOR_RESET"
}

draw_line() {
  printf "%s+------------------------------------------------------------+%s\n" "$COLOR_ACCENT" "$COLOR_RESET"
}

draw_section() {
  local title="$1"
  draw_line
  printf "%s* %s *%s\n" "$COLOR_TITLE" "$title" "$COLOR_RESET"
  draw_line
}

clear_screen() {
  if [[ -t 1 ]] && command -v clear >/dev/null 2>&1; then
    clear
  fi
}

pause_any_key() {
  if [[ ! -t 0 || ! -t 1 ]]; then
    return
  fi

  echo
  printf "%s>%s Press any key to return..." "$COLOR_TITLE" "$COLOR_RESET"
  IFS= read -rsn1 _ || true
  echo
}

confirm_action() {
  local prompt="$1"
  local answer=""

  if [[ ! -t 0 || ! -t 1 ]]; then
    return 0
  fi

  printf "%s>%s %s [y/N]: " "$COLOR_TITLE" "$COLOR_RESET" "$prompt"
  IFS= read -rsn1 answer || true
  echo

  [[ "$answer" == "y" || "$answer" == "Y" ]]
}

detect_os() {
  if [[ -r /etc/os-release ]]; then
    # shellcheck disable=SC1091
    source /etc/os-release
    printf '%s' "${PRETTY_NAME:-${NAME:-unknown}}"
    return
  fi

  uname -s
}

detect_arch() {
  uname -m
}

detect_ip() {
  hostname -I 2>/dev/null | awk '{print $1}' || echo "unknown"
}

detect_cpu_usage() {
  top -bn1 2>/dev/null | awk -F'[, ]+' '/^%?Cpu/ {
    for (i = 1; i <= NF; i++) {
      if ($i == "id" && (i - 1) >= 1) {
        printf "%.1f%%", 100 - $(i - 1)
        exit
      }
    }
  }'
}

detect_ram_usage() {
  free 2>/dev/null | awk '/Mem:/ { printf "%.1f%%", ($3 / $2) * 100 }'
}

container_state() {
  local service="$1"
  local name="${PROJECT_NAME}-${service}-1"
  local status health

  if ! docker inspect "$name" >/dev/null 2>&1; then
    echo "inactive"
    return
  fi

  status="$(docker inspect -f '{{.State.Status}}' "$name" 2>/dev/null || echo "unknown")"
  health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$name" 2>/dev/null || true)"

  case "$status:$health" in
    running:healthy|running:)
      echo "active"
      ;;
    running:starting|created:*)
      echo "starting"
      ;;
    running:unhealthy|restarting:*|exited:*|dead:*|unknown:*)
      echo "error"
      ;;
    *)
      echo "inactive"
      ;;
  esac
}

systemd_service_state() {
  local service="$1"

  if ! command -v systemctl >/dev/null 2>&1; then
    echo "unknown"
    return
  fi

  if systemctl is-active --quiet "$service"; then
    echo "active"
  else
    echo "inactive"
  fi
}

systemd_service_enabled() {
  local service="$1"

  if ! command -v systemctl >/dev/null 2>&1; then
    echo "unknown"
    return
  fi

  if systemctl is-enabled --quiet "$service" >/dev/null 2>&1; then
    echo "enabled"
  else
    echo "disabled"
  fi
}

render_state() {
  local state="$1"

  case "$state" in
    active|enabled|up_to_date)
      format_value "$COLOR_OK" "${state//_/ }"
      ;;
    starting|available|warning)
      format_value "$COLOR_WARN" "${state//_/ }"
      ;;
    error|inactive|disabled|failed)
      format_value "$COLOR_ERROR" "${state//_/ }"
      ;;
    *)
      format_value "$COLOR_DIM" "${state//_/ }"
      ;;
  esac
}

print_system_overview() {
  draw_section "System Overview"
  printf "%sOS:%s      %s\n" "$COLOR_OK" "$COLOR_RESET" "$(detect_os)"
  printf "%sARCH:%s    %s\n" "$COLOR_OK" "$COLOR_RESET" "$(detect_arch)"
  printf "%sIP:%s      %s\n" "$COLOR_OK" "$COLOR_RESET" "$(detect_ip)"
  printf "%sCPU:%s     %s\n" "$COLOR_OK" "$COLOR_RESET" "$(detect_cpu_usage)"
  printf "%sRAM:%s     %s\n" "$COLOR_OK" "$COLOR_RESET" "$(detect_ram_usage)"
}

print_app_overview() {
  draw_section "Application"
  printf "%sVersion:%s      %s\n" "$COLOR_INFO" "$COLOR_RESET" "$(current_version)"
  printf "%sURL:%s          %s\n" "$COLOR_INFO" "$COLOR_RESET" "$(current_public_url)"
  printf "%sAuto-start:%s   %s\n" "$COLOR_INFO" "$COLOR_RESET" "$(render_state "$(autostart_state)")"
  printf "%sAuto-restart:%s %s\n" "$COLOR_INFO" "$COLOR_RESET" "$(render_state "$(autorestart_state)")"
}

print_service_overview() {
  draw_section "Services"
  printf "Docker:   %s\n" "$(render_state "$(systemd_service_state docker.service)")"
  printf "Client:   %s\n" "$(render_state "$(container_state client)")"
  printf "Server:   %s\n" "$(render_state "$(container_state server)")"
  printf "Postgres: %s\n" "$(render_state "$(container_state postgres)")"
}

check_endpoint() {
  local url="$1"
  local insecure="${2:-0}"
  local curl_args=(-fsS)

  if [[ "$insecure" == "1" ]]; then
    curl_args+=(-k)
  fi

  if curl "${curl_args[@]}" "$url" >/dev/null 2>&1; then
    echo "active"
  else
    echo "error"
  fi
}

print_endpoint_overview() {
  draw_section "Endpoints"
  printf "Server health: %s\n" "$(render_state "$(check_endpoint "$(server_health_url)")")"
  printf "HTTP redirect: %s\n" "$(render_state "$(check_endpoint "$(client_http_health_url)")")"
  printf "HTTPS app:     %s\n" "$(render_state "$(check_endpoint "$(client_https_app_url)" 1)")"
}

show_status() {
  print_system_overview
  echo
  print_app_overview
  echo
  print_service_overview
  echo
  print_endpoint_overview
  echo
  draw_section "Containers"
  compose ps
}

autostart_state() {
  local docker_enabled socket_enabled
  docker_enabled="$(systemd_service_enabled docker.service)"
  socket_enabled="$(systemd_service_enabled docker.socket)"

  if [[ "$docker_enabled" == "enabled" || "$socket_enabled" == "enabled" ]]; then
    echo "enabled"
    return
  fi

  if [[ "$docker_enabled" == "unknown" && "$socket_enabled" == "unknown" ]]; then
    echo "unknown"
    return
  fi

  echo "disabled"
}

autorestart_state() {
  local policy
  policy="$(current_restart_policy)"

  if [[ "$policy" == "no" ]]; then
    echo "disabled"
    return
  fi

  echo "enabled"
}

update_env_value() {
  local key="$1"
  local value="$2"
  local env_path="$INSTALL_DIR/.env"
  local escaped

  escaped="$(printf '%s' "$value" | sed -e 's/[&|]/\\&/g')"

  if grep -q "^${key}=" "$env_path"; then
    sed -i "s|^${key}=.*|${key}=${escaped}|" "$env_path"
  else
    printf '\n%s=%s\n' "$key" "$value" >> "$env_path"
  fi
}

service_start() {
  compose up -d
}

service_stop() {
  compose stop
}

service_restart() {
  compose restart
}

service_set_autostart() {
  local mode="$1"

  if ! command -v systemctl >/dev/null 2>&1; then
    echo "systemctl is not available"
    return 1
  fi

  case "$mode" in
    on)
      systemctl enable docker.service >/dev/null 2>&1 || true
      if systemctl list-unit-files docker.socket >/dev/null 2>&1; then
        systemctl enable docker.socket >/dev/null 2>&1 || true
      fi
      echo "Auto-start enabled"
      ;;
    off)
      systemctl disable docker.service >/dev/null 2>&1 || true
      if systemctl list-unit-files docker.socket >/dev/null 2>&1; then
        systemctl disable docker.socket >/dev/null 2>&1 || true
      fi
      echo "Auto-start disabled"
      ;;
    *)
      echo "Usage: yourmsgr service autostart <on|off>"
      return 1
      ;;
  esac
}

service_set_autorestart() {
  local mode="$1"

  case "$mode" in
    on)
      update_env_value "RESTART_POLICY" "unless-stopped"
      compose up -d --force-recreate
      echo "Auto-restart enabled"
      ;;
    off)
      update_env_value "RESTART_POLICY" "no"
      compose up -d --force-recreate
      echo "Auto-restart disabled"
      ;;
    *)
      echo "Usage: yourmsgr service autorestart <on|off>"
      return 1
      ;;
  esac
}

print_logs() {
  local service="${1:-}"
  local exit_code=0

  set +e
  if [[ -n "$service" ]]; then
    compose logs -f "$service"
    exit_code=$?
  else
    compose logs -f
    exit_code=$?
  fi
  set -e

  if [[ "$exit_code" -ne 0 && "$exit_code" -ne 130 ]]; then
    return "$exit_code"
  fi
}

is_semver() {
  [[ "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]
}

compare_versions() {
  local left="$1"
  local right="$2"

  if [[ "$left" == "$right" ]]; then
    echo "equal"
    return
  fi

  if [[ "$(printf '%s\n%s\n' "$left" "$right" | sort -V | tail -n1)" == "$left" ]]; then
    echo "greater"
    return
  fi

  echo "less"
}

UPDATE_BRANCH=""
UPDATE_LOCAL_VERSION=""
UPDATE_REMOTE_VERSION=""
UPDATE_LOCAL_COMMIT=""
UPDATE_REMOTE_COMMIT=""
UPDATE_STATE=""

refresh_update_state() {
  UPDATE_BRANCH="$(current_branch)"
  if ! git -C "$INSTALL_DIR" ls-remote --exit-code --heads origin "$UPDATE_BRANCH" >/dev/null 2>&1; then
    UPDATE_BRANCH="$(remote_default_branch)"
  fi
  UPDATE_LOCAL_VERSION="$(current_version)"
  UPDATE_LOCAL_COMMIT="$(git -C "$INSTALL_DIR" rev-parse HEAD 2>/dev/null || echo "")"

  git -C "$INSTALL_DIR" fetch --quiet origin "$UPDATE_BRANCH"

  UPDATE_REMOTE_COMMIT="$(git -C "$INSTALL_DIR" rev-parse "origin/$UPDATE_BRANCH" 2>/dev/null || echo "")"
  UPDATE_REMOTE_VERSION="$(git -C "$INSTALL_DIR" show "origin/$UPDATE_BRANCH:VERSION" 2>/dev/null | tr -d '[:space:]' || echo "unknown")"

  if [[ "$UPDATE_LOCAL_COMMIT" == "$UPDATE_REMOTE_COMMIT" ]]; then
    UPDATE_STATE="up_to_date"
    return
  fi

  if is_semver "$UPDATE_LOCAL_VERSION" && is_semver "$UPDATE_REMOTE_VERSION"; then
    case "$(compare_versions "$UPDATE_REMOTE_VERSION" "$UPDATE_LOCAL_VERSION")" in
      greater)
        UPDATE_STATE="available"
        return
        ;;
      equal)
        UPDATE_STATE="version_not_bumped"
        return
        ;;
      less)
        UPDATE_STATE="local_ahead"
        return
        ;;
    esac
  fi

  UPDATE_STATE="warning"
}

print_update_status() {
  refresh_update_state

  draw_section "Update Status"
  printf "%sCurrent version:%s %s\n" "$COLOR_INFO" "$COLOR_RESET" "$UPDATE_LOCAL_VERSION"
  printf "%sRemote version:%s  %s\n" "$COLOR_INFO" "$COLOR_RESET" "$UPDATE_REMOTE_VERSION"

  case "$UPDATE_STATE" in
    up_to_date)
      printf "%sStatus:%s          %s\n" "$COLOR_INFO" "$COLOR_RESET" "$(render_state "up_to_date")"
      ;;
    available)
      printf "%sStatus:%s          %s\n" "$COLOR_INFO" "$COLOR_RESET" "$(render_state "available")"
      ;;
    version_not_bumped)
      printf "%sStatus:%s          %s\n" "$COLOR_INFO" "$COLOR_RESET" "$(render_state "warning")"
      echo "Remote revision differs, but VERSION was not increased."
      ;;
    local_ahead)
      printf "%sStatus:%s          %s\n" "$COLOR_INFO" "$COLOR_RESET" "$(render_state "warning")"
      echo "Installed version is newer than origin/$UPDATE_BRANCH."
      ;;
    *)
      printf "%sStatus:%s          %s\n" "$COLOR_INFO" "$COLOR_RESET" "$(render_state "warning")"
      echo "Could not classify update state from version metadata."
      ;;
  esac
}

update_stack() {
  local force="${1:-0}"

  refresh_update_state

  case "$UPDATE_STATE" in
    up_to_date)
      echo "Already on the latest version ($UPDATE_LOCAL_VERSION)"
      return
      ;;
    version_not_bumped|warning)
      if [[ "$force" != "1" ]]; then
        echo "Remote revision differs without a proper version bump. Refusing regular update."
        echo "Use: yourmsgr update --force"
        return
      fi
      ;;
  esac

  if ! git -C "$INSTALL_DIR" checkout "$UPDATE_BRANCH" >/dev/null 2>&1; then
    git -C "$INSTALL_DIR" checkout -B "$UPDATE_BRANCH" "origin/$UPDATE_BRANCH" >/dev/null 2>&1
  fi
  git -C "$INSTALL_DIR" pull --ff-only origin "$UPDATE_BRANCH"
  install -m 0755 "$INSTALL_DIR/scripts/yourmsgr.sh" "$HELPER_TARGET"
  compose up -d --build
  echo "Updated to version $(current_version)"
}

show_version() {
  echo "YourMsgr version: $(current_version)"
  echo "URL: $(current_public_url)"
  echo "Install dir: $INSTALL_DIR"
}

show_logs_menu() {
  while true; do
    clear_screen
    draw_section "Logs"
    printf "%s[1]%s All services\n" "$COLOR_INFO" "$COLOR_RESET"
    printf "%s[2]%s Client\n" "$COLOR_INFO" "$COLOR_RESET"
    printf "%s[3]%s Server\n" "$COLOR_INFO" "$COLOR_RESET"
    printf "%s[4]%s Postgres\n" "$COLOR_INFO" "$COLOR_RESET"
    printf "%s[0]%s Back\n" "$COLOR_INFO" "$COLOR_RESET"
    echo
    printf "%s>%s Press a digit: " "$COLOR_TITLE" "$COLOR_RESET"

    local choice=""
    IFS= read -rsn1 choice || true
    echo

    case "$choice" in
      1)
        clear_screen
        draw_section "Logs: All services"
        print_logs
        ;;
      2)
        clear_screen
        draw_section "Logs: Client"
        print_logs "client"
        ;;
      3)
        clear_screen
        draw_section "Logs: Server"
        print_logs "server"
        ;;
      4)
        clear_screen
        draw_section "Logs: Postgres"
        print_logs "postgres"
        ;;
      0)
        return
        ;;
      *)
        ;;
    esac
  done
}

show_service_menu() {
  while true; do
    clear_screen
    draw_section "Service Management"
    printf "%sCurrent auto-start:%s   %s\n" "$COLOR_INFO" "$COLOR_RESET" "$(render_state "$(autostart_state)")"
    printf "%sCurrent auto-restart:%s %s\n" "$COLOR_INFO" "$COLOR_RESET" "$(render_state "$(autorestart_state)")"
    echo
    printf "%s[1]%s Start application\n" "$COLOR_INFO" "$COLOR_RESET"
    printf "%s[2]%s Stop application\n" "$COLOR_INFO" "$COLOR_RESET"
    printf "%s[3]%s Restart application\n" "$COLOR_INFO" "$COLOR_RESET"
    printf "%s[4]%s Enable auto-start\n" "$COLOR_INFO" "$COLOR_RESET"
    printf "%s[5]%s Disable auto-start\n" "$COLOR_INFO" "$COLOR_RESET"
    printf "%s[6]%s Enable auto-restart\n" "$COLOR_INFO" "$COLOR_RESET"
    printf "%s[7]%s Disable auto-restart\n" "$COLOR_INFO" "$COLOR_RESET"
    printf "%s[0]%s Back\n" "$COLOR_INFO" "$COLOR_RESET"
    echo
    printf "%s>%s Press a digit: " "$COLOR_TITLE" "$COLOR_RESET"

    local choice=""
    IFS= read -rsn1 choice || true
    echo

    case "$choice" in
      1)
        service_start
        pause_any_key
        ;;
      2)
        service_stop
        pause_any_key
        ;;
      3)
        service_restart
        pause_any_key
        ;;
      4)
        service_set_autostart on
        pause_any_key
        ;;
      5)
        service_set_autostart off
        pause_any_key
        ;;
      6)
        service_set_autorestart on
        pause_any_key
        ;;
      7)
        service_set_autorestart off
        pause_any_key
        ;;
      0)
        return
        ;;
      *)
        ;;
    esac
  done
}

show_update_menu() {
  while true; do
    clear_screen
    print_update_status
    echo

    case "$UPDATE_STATE" in
      available)
        printf "%s[1]%s Install update\n" "$COLOR_INFO" "$COLOR_RESET"
        ;;
      version_not_bumped|warning)
        printf "%s[1]%s Force update\n" "$COLOR_INFO" "$COLOR_RESET"
        ;;
    esac

    printf "%s[0]%s Back\n" "$COLOR_INFO" "$COLOR_RESET"
    echo
    printf "%s>%s Press a digit: " "$COLOR_TITLE" "$COLOR_RESET"

    local choice=""
    IFS= read -rsn1 choice || true
    echo

    case "$choice" in
      1)
        case "$UPDATE_STATE" in
          available)
            update_stack
            ;;
          version_not_bumped|warning)
            update_stack 1
            ;;
        esac
        pause_any_key
        ;;
      0)
        return
        ;;
      *)
        ;;
    esac
  done
}

show_admin_menu() {
  while true; do
    clear_screen
    draw_section "Admin Tools"
    printf "%s[1]%s Stats\n" "$COLOR_INFO" "$COLOR_RESET"
    printf "%s[2]%s Users list\n" "$COLOR_INFO" "$COLOR_RESET"
    printf "%s[0]%s Back\n" "$COLOR_INFO" "$COLOR_RESET"
    echo
    printf "%s>%s Press a digit: " "$COLOR_TITLE" "$COLOR_RESET"

    local choice=""
    IFS= read -rsn1 choice || true
    echo

    case "$choice" in
      1)
        clear_screen
        draw_section "Admin Stats"
        compose exec server bun src/cli/admin.ts stats
        pause_any_key
        ;;
      2)
        clear_screen
        draw_section "Users List"
        compose exec server bun src/cli/admin.ts users:list
        pause_any_key
        ;;
      0)
        return
        ;;
      *)
        ;;
    esac
  done
}

show_menu() {
  while true; do
    clear_screen
    print_system_overview
    echo
    print_app_overview
    echo
    print_service_overview
    echo
    draw_section "Main Menu"
    printf "%s[1]%s Status\n" "$COLOR_INFO" "$COLOR_RESET"
    printf "%s[2]%s Service management\n" "$COLOR_INFO" "$COLOR_RESET"
    printf "%s[3]%s Logs\n" "$COLOR_INFO" "$COLOR_RESET"
    printf "%s[4]%s Check updates\n" "$COLOR_INFO" "$COLOR_RESET"
    printf "%s[5]%s Admin tools\n" "$COLOR_INFO" "$COLOR_RESET"
    printf "%s[6]%s Uninstall\n" "$COLOR_INFO" "$COLOR_RESET"
    printf "%s[0]%s Exit\n" "$COLOR_INFO" "$COLOR_RESET"
    echo
    printf "%s>%s Press a digit: " "$COLOR_TITLE" "$COLOR_RESET"

    local choice=""
    if ! IFS= read -rsn1 -t 1 choice; then
      continue
    fi
    echo

    case "$choice" in
      1)
        clear_screen
        show_status
        pause_any_key
        ;;
      2)
        show_service_menu
        ;;
      3)
        show_logs_menu
        ;;
      4)
        show_update_menu
        ;;
      5)
        show_admin_menu
        ;;
      6)
        if confirm_action "Remove stack, volumes, install directory and helper command?"; then
          uninstall_stack
        fi
        ;;
      0)
        exit 0
        ;;
      *)
        ;;
    esac
  done
}

uninstall_stack() {
  compose down -v --remove-orphans || true
  rm -rf "$INSTALL_DIR"
  rm -f "$HELPER_TARGET"
  echo "YourMsgr uninstalled"
  exit 0
}

usage() {
  cat <<'EOF'
YourMsgr helper

Commands:
  menu
  version
  status
  logs [client|server|postgres]
  check-update
  update [--force]
  service start
  service stop
  service restart
  service autostart <on|off>
  service autorestart <on|off>
  admin <command> [args]
  uninstall
EOF
}

run_service_command() {
  local action="${1:-}"
  shift || true

  case "$action" in
    start)
      service_start
      ;;
    stop)
      service_stop
      ;;
    restart)
      service_restart
      ;;
    autostart)
      service_set_autostart "${1:-}"
      ;;
    autorestart)
      service_set_autorestart "${1:-}"
      ;;
    *)
      echo "Usage: yourmsgr service <start|stop|restart|autostart|autorestart> ..."
      exit 1
      ;;
  esac
}

command_name="${1:-}"

if [[ -z "$command_name" ]]; then
  if [[ -t 0 && -t 1 ]]; then
    command_name="menu"
  else
    command_name="help"
  fi
fi

case "$command_name" in
  menu|"")
    show_menu
    ;;

  version)
    show_version
    ;;

  status|health)
    show_status
    ;;

  logs)
    shift || true
    print_logs "${1:-}"
    ;;

  check-update)
    print_update_status
    ;;

  update)
    shift || true
    if [[ "${1:-}" == "--force" ]]; then
      update_stack 1
    else
      update_stack
    fi
    ;;

  service)
    shift || true
    run_service_command "$@"
    ;;

  up)
    service_start
    ;;

  down)
    service_stop
    ;;

  restart)
    service_restart
    ;;

  admin)
    shift || true
    if [[ $# -eq 0 ]]; then
      echo "Usage: yourmsgr admin <command> [args]"
      exit 1
    fi
    if [[ -t 0 && -t 1 ]]; then
      compose exec server bun src/cli/admin.ts "$@"
    else
      compose exec -T server bun src/cli/admin.ts "$@" < /dev/null
    fi
    ;;

  uninstall|uninstall-purge)
    if [[ -t 0 && -t 1 ]]; then
      if ! confirm_action "Remove stack, volumes, install directory and helper command?"; then
        echo "Cancelled"
        exit 0
      fi
    fi
    uninstall_stack
    ;;

  help|--help|-h)
    usage
    ;;

  *)
    echo "Unknown command: $command_name"
    echo
    usage
    exit 1
    ;;
esac
