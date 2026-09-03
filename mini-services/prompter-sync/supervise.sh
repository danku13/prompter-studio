#!/usr/bin/env bash
# Перманентный запуск WS-мини-сервиса prompter-sync с авто-перезапуском.
#
# `bun --hot` перезагружает код при изменении файлов БЕЗ рестарта процесса;
# этот скрипт нужен для другого случая: если процесс сервиса упал
# (например, редкий нативный краш bun+ws на websocket-upgrade),
# он поднимается заново через 1 секунду. Перманентный запуск:
#
#   cd /home/z/my-project/mini-services/prompter-sync
#   nohup bash supervise.sh > service.log 2>&1 & disown
#
# Остановить сервис полностью (памятуя про supervisor):
#   pkill -f 'prompter-sync/supervise.sh'; pkill -f 'prompter-sync/index.ts'

cd "$(dirname "$0")" || exit 1

child_pid=0

terminate() {
  trap - TERM INT
  if [ "$child_pid" -ne 0 ]; then
    kill -TERM "$child_pid" 2>/dev/null
    wait "$child_pid" 2>/dev/null
  fi
  echo "[supervisor] stopped" >&2
  exit 0
}

trap terminate TERM INT

while true; do
  node --watch index.ts &
  child_pid=$!
  wait "$child_pid"
  code=$?
  child_pid=0
  if [ "$code" -eq 0 ]; then
    echo "[supervisor] clean exit, stopping" >&2
    break
  fi
  echo "[supervisor] service exited with code $code — restarting in 1s" >&2
  sleep 1
done
