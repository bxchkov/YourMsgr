#!/usr/bin/env bash

set -euo pipefail

INSTALL_DIR="${YOURMSGR_INSTALL_DIR:-/opt/yourmsgr}"
PROJECT_NAME="yourmsgr"
HELPER_TARGET="/usr/local/bin/yourmsgr"
BACKUP_DIR="${YOURMSGR_BACKUP_DIR:-$INSTALL_DIR/backups}"

if [[ ! -d "$INSTALL_DIR" ]]; then
  echo "Install directory '$INSTALL_DIR' not found"
  exit 1
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
  backup
  shell [service]
  admin <command> [args]
  uninstall
  uninstall-purge
EOF
}

show_menu() {
  while true; do
    cat <<'EOF'

YourMsgr menu
  1) Status
  2) Health
  3) Logs
  4) Check update
  5) Update
  6) Backup
  7) Admin stats
  8) Users list
  9) Shell
 10) Uninstall
  0) Exit
EOF
    read -r -p "Choose an action: " choice

    case "$choice" in
      1) show_status ;;
      2) show_health ;;
      3) show_logs ;;
      4) check_update ;;
      5) update_stack ;;
      6) create_backup ;;
      7) compose exec server bun src/cli/admin.ts stats ;;
      8) compose exec server bun src/cli/admin.ts users:list ;;
      9) open_shell "server" ;;
      10) uninstall_stack ;;
      0) exit 0 ;;
      *) echo "Unknown option" ;;
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
  local auto_backup="${YOURMSGR_SKIP_AUTO_BACKUP:-0}"

  if [[ "$auto_backup" != "1" ]]; then
    create_backup
  fi

  git -C "$INSTALL_DIR" fetch --all --tags
  git -C "$INSTALL_DIR" pull --ff-only
  compose up -d --build
  show_version
}

create_backup() {
  load_env

  mkdir -p "$BACKUP_DIR"

  local timestamp archive_path temp_dir
  timestamp="$(date +%Y%m%d-%H%M%S)"
  archive_path="$BACKUP_DIR/yourmsgr-backup-$timestamp.tar.gz"
  temp_dir="$(mktemp -d)"

  cp "$INSTALL_DIR/.env" "$temp_dir/root.env"
  cp "$INSTALL_DIR/server/.env" "$temp_dir/server.env"

  compose exec -T postgres pg_dump -U "${POSTGRES_USER:-chat_user}" "${POSTGRES_DB:-chat}" > "$temp_dir/database.sql"

  tar -czf "$archive_path" -C "$temp_dir" .
  rm -rf "$temp_dir"

  echo "Backup created: $archive_path"
}

open_shell() {
  shift || true
  local service="${1:-server}"
  compose exec "$service" sh
}

uninstall_stack() {
  local purge_data="${1:-0}"
  local description="Remove stack, project directory and helper command"

  if [[ "$purge_data" == "1" ]]; then
    description="${description}, including Docker volumes and backups"
  else
    description="${description}, while keeping Docker volumes/backups"
  fi

  read -r -p "${description}? (yes/no): " answer
  if [[ "$answer" != "yes" ]]; then
    echo "Cancelled"
    return
  fi

  if [[ "$purge_data" == "1" ]]; then
    compose down -v --remove-orphans || true
    rm -rf "$BACKUP_DIR"
  else
    compose down --remove-orphans || true
  fi

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

  backup)
    create_backup
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
      compose exec -T server bun src/cli/admin.ts "$@"
    fi
    ;;

  uninstall)
    uninstall_stack 0
    ;;

  uninstall-purge)
    uninstall_stack 1
    ;;

  help)
    usage
    ;;

  *)
    echo "Unknown command: $command_name"
    usage
    exit 1
    ;;
esac
