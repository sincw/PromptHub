#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="$ROOT_DIR/apps/web"
RUNTIME_DIR="${PROMPTHUB_RUNTIME_DIR:-/tmp/prompthub-dev-${UID:-$(id -u)}}"
HOST="${PROMPTHUB_HOST:-0.0.0.0}"
SERVER_PORT="${PROMPTHUB_SERVER_PORT:-3000}"
CLIENT_PORT="${PROMPTHUB_CLIENT_PORT:-5174}"

SERVER_PID="$RUNTIME_DIR/server.pid"
CLIENT_PID="$RUNTIME_DIR/client.pid"
SERVER_LOG="$RUNTIME_DIR/server.log"
CLIENT_LOG="$RUNTIME_DIR/client.log"

export PATH="$WEB_DIR/node_modules/.bin:$ROOT_DIR/node_modules/.bin:$PATH"

usage() {
  cat <<'EOF'
Usage: bash scripts/project.sh <command> [options]

Commands:
  start       Start backend and frontend dev servers
  stop        Stop servers started by this script
  restart     Stop then start
  status      Show PID, port, URL, and log status
  logs        Tail server and client logs

Options:
  --force     With stop/restart, also kill listeners on configured ports

Environment:
  PROMPTHUB_SERVER_PORT  Backend port, default 3000
  PROMPTHUB_CLIENT_PORT  Vite port, default 5174
  PROMPTHUB_HOST         Bind host, default 0.0.0.0
  PROMPTHUB_RUNTIME_DIR  PID/log directory, default /tmp/prompthub-dev-$UID
EOF
}

die() {
  echo "Error: $*" >&2
  exit 1
}

ensure_tool() {
  command -v "$1" >/dev/null 2>&1 || die "Missing $1. Run dependency install first."
}

pid_from_file() {
  local pid_file="$1"
  [[ -f "$pid_file" ]] || return 1
  read -r pid <"$pid_file"
  [[ -n "${pid:-}" ]] || return 1
  printf '%s\n' "$pid"
}

is_running_pid() {
  local pid="$1"
  kill -0 "$pid" >/dev/null 2>&1
}

is_running_file() {
  local pid_file="$1"
  local pid
  pid="$(pid_from_file "$pid_file" 2>/dev/null)" || return 1
  is_running_pid "$pid"
}

listeners_for_port() {
  local port="$1"
  command -v lsof >/dev/null 2>&1 || return 0
  lsof -tiTCP:"$port" -sTCP:LISTEN -n -P 2>/dev/null || true
}

port_has_unowned_listener() {
  local port="$1"
  local owned_pid="${2:-}"
  local pid

  while read -r pid; do
    [[ -z "$pid" ]] && continue
    [[ -n "$owned_pid" && "$pid" == "$owned_pid" ]] && continue
    return 0
  done < <(listeners_for_port "$port")

  return 1
}

check_port_available() {
  local port="$1"
  local name="$2"
  local owned_pid="${3:-}"
  if port_has_unowned_listener "$port" "$owned_pid"; then
    die "$name port $port is already in use. Run status, stop --force, or change the port env var."
  fi
}

start_one() {
  local name="$1"
  local pid_file="$2"
  local log_file="$3"
  local port="$4"
  shift 4

  if is_running_file "$pid_file"; then
    echo "$name already running (pid $(pid_from_file "$pid_file"))."
    return 0
  fi

  rm -f "$pid_file"
  mkdir -p "$RUNTIME_DIR"
  : >"$log_file"

  (
    cd "$WEB_DIR"
    if command -v setsid >/dev/null 2>&1; then
      nohup setsid "$@" >"$log_file" 2>&1 &
    else
      nohup "$@" >"$log_file" 2>&1 &
    fi
    echo $! >"$pid_file"
  )

  local listener_pid=""
  for _ in {1..30}; do
    listener_pid="$(listeners_for_port "$port" | head -n 1)"
    if [[ -n "$listener_pid" ]]; then
      echo "$listener_pid" >"$pid_file"
      echo "$name started (pid $listener_pid, log $log_file)."
      return 0
    fi

    if ! is_running_file "$pid_file"; then
      break
    fi

    sleep 0.5
  done

  echo "$name failed to start. Last log lines:" >&2
  tail -n 40 "$log_file" >&2 || true
  return 1
}

start_project() {
  ensure_tool tsx
  ensure_tool vite

  local server_owned_pid=""
  local client_owned_pid=""
  server_owned_pid="$(pid_from_file "$SERVER_PID" 2>/dev/null || true)"
  client_owned_pid="$(pid_from_file "$CLIENT_PID" 2>/dev/null || true)"

  check_port_available "$SERVER_PORT" "Backend" "$server_owned_pid"
  check_port_available "$CLIENT_PORT" "Frontend" "$client_owned_pid"

  start_one "Backend" "$SERVER_PID" "$SERVER_LOG" "$SERVER_PORT" env PORT="$SERVER_PORT" HOST="$HOST" tsx watch src/index.ts
  start_one "Frontend" "$CLIENT_PID" "$CLIENT_LOG" "$CLIENT_PORT" vite --host "$HOST" --port "$CLIENT_PORT" --strictPort

  echo "Frontend: http://localhost:$CLIENT_PORT/"
  echo "Backend:  http://localhost:$SERVER_PORT/health"
}

stop_pid_file() {
  local name="$1"
  local pid_file="$2"
  local pid

  pid="$(pid_from_file "$pid_file" 2>/dev/null || true)"
  if [[ -z "$pid" ]]; then
    echo "$name not running (no pid file)."
    return 0
  fi

  if ! is_running_pid "$pid"; then
    echo "$name not running (stale pid $pid)."
    rm -f "$pid_file"
    return 0
  fi

  kill "$pid" >/dev/null 2>&1 || true
  for _ in {1..20}; do
    if ! is_running_pid "$pid"; then
      rm -f "$pid_file"
      echo "$name stopped."
      return 0
    fi
    sleep 0.2
  done

  kill -9 "$pid" >/dev/null 2>&1 || true
  rm -f "$pid_file"
  echo "$name force stopped."
}

kill_port_listeners() {
  local port="$1"
  local label="$2"
  local pid
  while read -r pid; do
    [[ -z "$pid" ]] && continue
    echo "Stopping $label listener on port $port (pid $pid)."
    kill "$pid" >/dev/null 2>&1 || true
  done < <(listeners_for_port "$port")
}

stop_project() {
  local force="$1"
  stop_pid_file "Frontend" "$CLIENT_PID"
  stop_pid_file "Backend" "$SERVER_PID"

  if [[ "$force" == "true" ]]; then
    kill_port_listeners "$CLIENT_PORT" "frontend"
    kill_port_listeners "$SERVER_PORT" "backend"
  fi
}

status_one() {
  local name="$1"
  local pid_file="$2"
  local port="$3"
  local log_file="$4"
  local pid=""

  pid="$(pid_from_file "$pid_file" 2>/dev/null || true)"
  if [[ -n "$pid" ]] && is_running_pid "$pid"; then
    echo "$name: running (pid $pid, port $port, log $log_file)"
  elif [[ -n "$pid" ]]; then
    echo "$name: stopped (stale pid $pid, port $port, log $log_file)"
  else
    echo "$name: stopped (port $port, log $log_file)"
  fi

  local listeners
  listeners="$(listeners_for_port "$port" | tr '\n' ' ' | sed 's/[[:space:]]*$//')"
  if [[ -n "$listeners" ]]; then
    echo "$name port listeners: $listeners"
  fi
}

status_project() {
  status_one "Backend" "$SERVER_PID" "$SERVER_PORT" "$SERVER_LOG"
  status_one "Frontend" "$CLIENT_PID" "$CLIENT_PORT" "$CLIENT_LOG"
  echo "Frontend URL: http://localhost:$CLIENT_PORT/"
  echo "Backend health: http://localhost:$SERVER_PORT/health"
}

tail_logs() {
  mkdir -p "$RUNTIME_DIR"
  touch "$SERVER_LOG" "$CLIENT_LOG"
  tail -n 80 -f "$SERVER_LOG" "$CLIENT_LOG"
}

main() {
  local command="${1:-}"
  local force="false"
  shift || true

  for arg in "$@"; do
    case "$arg" in
      --force) force="true" ;;
      -h|--help) usage; exit 0 ;;
      *) die "Unknown option: $arg" ;;
    esac
  done

  case "$command" in
    start) start_project ;;
    stop) stop_project "$force" ;;
    restart)
      stop_project "$force"
      start_project
      ;;
    status) status_project ;;
    logs) tail_logs ;;
    -h|--help|"") usage ;;
    *) die "Unknown command: $command" ;;
  esac
}

main "$@"
