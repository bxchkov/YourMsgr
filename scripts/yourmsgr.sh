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
  git -C "$INSTALL_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown"
}

current_commit() {
  git -C "$INSTALL_DIR" rev-parse --short HEAD 2>/dev/null || echo "unknown"
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

client_health_url() {
  load_env
  echo "http://127.0.0.1:${CLIENT_PORT:-80}/auth"
}

server_health_url() {
  load_env
  echo "http://127.0.0.1:${SERVER_PORT:-3000}/healthz"
}

print_service_health() {
  local label="$1"
  local url="$2"

  if curl -fsS "$url" >/dev/null 2>&1; then
    echo "$label: ok ($url)"
  else
    echo "$label: fail ($url)"
  fi
}

usage() {
  cat <<'EOF'
YourMsgr helper

Commands:
  menu
  version
  check-update
  status
  health
  up
  down
  restart [service]
  logs [service]
  update
  shell [service]
  admin <command> [args]
  uninstall
EOF
}

clear_screen() {
  if [[ -t 1 ]] && command -v clear >/dev/null 2>&1; then
    clear
  fi
}

draw_line() {
  printf "%s%s%s\n" "$COLOR_ACCENT" "------------------------------------------------------------" "$COLOR_RESET"
}

draw_section() {
  local title="$1"
  draw_line
  printf "%s* %s *%s\n" "$COLOR_TITLE" "$title" "$COLOR_RESET"
  draw_line
}

format_value() {
  local color="$1"
  local value="$2"
  printf "%s%s%s" "$color" "$value" "$COLOR_RESET"
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

render_state() {
  local state="$1"

  case "$state" in
    active)
      format_value "$COLOR_OK" "Active"
      ;;
    starting)
      format_value "$COLOR_WARN" "Starting"
      ;;
    error)
      format_value "$COLOR_ERROR" "Error"
      ;;
    inactive)
      format_value "$COLOR_ERROR" "Inactive"
      ;;
    *)
      format_value "$COLOR_DIM" "$state"
      ;;
  esac
}

print_system_overview() {
  local os arch ip cpu ram

  os="$(detect_os)"
  arch="$(detect_arch)"
  ip="$(detect_ip)"
  cpu="$(detect_cpu_usage)"
  ram="$(detect_ram_usage)"

  draw_section "System Overview"
  printf "%sOS:%s   %s\n" "$COLOR_OK" "$COLOR_RESET" "$os"
  printf "%sARCH:%s %s\n" "$COLOR_OK" "$COLOR_RESET" "$arch"
  printf "%sIP:%s   %s\n" "$COLOR_OK" "$COLOR_RESET" "$ip"
  printf "%sCPU:%s  %s\n" "$COLOR_OK" "$COLOR_RESET" "${cpu:-unknown}"
  printf "%sRAM:%s  %s\n" "$COLOR_OK" "$COLOR_RESET" "${ram:-unknown}"
  echo
  printf "%sVersion:%s %s\n" "$COLOR_INFO" "$COLOR_RESET" "$(current_version)"
  printf "%sBranch:%s  %s\n" "$COLOR_INFO" "$COLOR_RESET" "$(current_branch)"
  printf "%sCommit:%s  %s\n" "$COLOR_INFO" "$COLOR_RESET" "$(current_commit)"
}

print_service_overview() {
  draw_section "Services Status"
  printf "Docker:   %s\n" "$(render_state "$(systemd_service_state docker.service)")"
  printf "Client:   %s\n" "$(render_state "$(container_state client)")"
  printf "Server:   %s\n" "$(render_state "$(container_state server)")"
  printf "Postgres: %s\n" "$(render_state "$(container_state postgres)")"
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

show_menu() {
  while true; do
    clear_screen
    print_system_overview
    echo
    print_service_overview
    echo
    draw_section "Main Menu"
    printf "%s[1]%s Status\n" "$COLOR_INFO" "$COLOR_RESET"
    printf "%s[2]%s Health\n" "$COLOR_INFO" "$COLOR_RESET"
    printf "%s[3]%s Logs\n" "$COLOR_INFO" "$COLOR_RESET"
    printf "%s[4]%s Check update\n" "$COLOR_INFO" "$COLOR_RESET"
    printf "%s[5]%s Update\n" "$COLOR_INFO" "$COLOR_RESET"
    printf "%s[6]%s Admin stats\n" "$COLOR_INFO" "$COLOR_RESET"
    printf "%s[7]%s Users list\n" "$COLOR_INFO" "$COLOR_RESET"
    printf "%s[8]%s Server shell\n" "$COLOR_INFO" "$COLOR_RESET"
    printf "%s[9]%s Uninstall\n" "$COLOR_INFO" "$COLOR_RESET"
    printf "%s[0]%s Exit\n" "$COLOR_INFO" "$COLOR_RESET"
    echo
    printf "%s>%s Press a digit: " "$COLOR_TITLE" "$COLOR_RESET"

    local choice=""
    IFS= read -rsn1 choice || true
    echo

    case "$choice" in
      1)
        clear_screen
        draw_section "Status"
        show_status
        pause_any_key
        ;;
      2)
        clear_screen
        draw_section "Health"
        show_health
        pause_any_key
        ;;
      3)
        clear_screen
        draw_section "Logs"
        show_logs
        ;;
      4)
        clear_screen
        draw_section "Check Update"
        check_update
        pause_any_key
        ;;
      5)
        clear_screen
        draw_section "Update"
        update_stack
        pause_any_key
        ;;
      6)
        clear_screen
        draw_section "Admin Stats"
        compose exec server bun src/cli/admin.ts stats
        pause_any_key
        ;;
      7)
        clear_screen
        draw_section "Users List"
        compose exec server bun src/cli/admin.ts users:list
        pause_any_key
        ;;
      8)
        clear_screen
        draw_section "Server Shell"
        open_shell "server"
        ;;
      9)
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

show_status() {
  compose ps
}

show_version() {
  echo "YourMsgr version: $(current_version)"
  echo "Branch: $(current_branch)"
  echo "Commit: $(current_commit)"
  echo "Install dir: $INSTALL_DIR"
}

check_update() {
  local branch local_commit remote_commit ahead_count

  branch="$(current_branch)"

  git -C "$INSTALL_DIR" fetch --quiet origin "$branch"

  local_commit="$(git -C "$INSTALL_DIR" rev-parse HEAD)"
  remote_commit="$(git -C "$INSTALL_DIR" rev-parse "origin/$branch")"

  echo "Version: $(current_version)"
  echo "Local commit:  ${local_commit:0:12}"
  echo "Remote commit: ${remote_commit:0:12}"

  if [[ "$local_commit" == "$remote_commit" ]]; then
    echo "Status: up to date"
    return
  fi

  ahead_count="$(git -C "$INSTALL_DIR" rev-list --count "${local_commit}..origin/${branch}")"
  echo "Status: update available (${ahead_count} commit(s))"
}

show_health() {
  show_status
  echo
  print_service_health "Server" "$(server_health_url)"
  print_service_health "Client" "$(client_health_url)"
}

show_logs() {
  shift || true
  if [[ $# -eq 0 ]]; then
    compose logs -f
  else
    compose logs -f "$@"
  fi
}

update_stack() {
  git -C "$INSTALL_DIR" fetch --all --tags
  git -C "$INSTALL_DIR" pull --ff-only
  install -m 0755 "$INSTALL_DIR/scripts/yourmsgr.sh" "$HELPER_TARGET"
  compose up -d --build
  show_version
}

open_shell() {
  shift || true
  local service="${1:-server}"
  compose exec "$service" sh
}

uninstall_stack() {
  compose down -v --remove-orphans || true
  rm -rf "$INSTALL_DIR"
  rm -f "$HELPER_TARGET"
  echo "YourMsgr uninstalled"
  exit 0
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

  check-update)
    check_update
    ;;

  status)
    show_status
    ;;

  health)
    show_health
    ;;

  up)
    compose up -d --build
    ;;

  down)
    compose down
    ;;

  restart)
    shift || true
    if [[ $# -eq 0 ]]; then
      compose restart
    else
      compose restart "$@"
    fi
    ;;

  logs)
    show_logs "$@"
    ;;

  update)
    update_stack
    ;;

  shell)
    open_shell "$@"
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
