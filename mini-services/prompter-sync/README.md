# prompter-sync — WS-мини-сервис синхронизации Prompter Studio

Socket.io-мини-сервис (порт **3030**, отдельный bun-проект): real-time синхронизация
веб-редактора (компьютер) и мобильных устройств-суфлёров (телефон).
Контракты протокола — в `src/lib/types.ts` главного проекта.

## Запуск

```bash
bun install
bun run dev        # bun --hot index.ts (авто-перезагрузка кода без рестарта)
bun run start      # без --hot
bun run typecheck  # tsc --noEmit
```

Перманентный запуск с авто-перезапуском при падении процесса:

```bash
nohup bash supervise.sh > service.log 2>&1 & disown
# (в песочнице bash-инструмент убивает фоновые задания команды —
#  запускать через субшелл-сироту: ( setsid bash supervise.sh > service.log 2>&1 < /dev/null & ))

# остановить:
pkill -f 'prompter-sync/supervise.sh'; pkill -f 'prompter-sync/index.ts'
```

## HTTP API (тот же порт 3030)

| Метод | Путь                 | Ответ                                          |
|-------|----------------------|------------------------------------------------|
| GET   | `/`                  | `{ ok: true, service: 'prompter-sync' }` (healthcheck) |
| POST  | `/internal/broadcast`| body `{ scriptId, revision, script }` → `emit('script')` в комнату `script:<scriptId>`; ошибки валидации → 400 |
| *     | прочее               | 404 `{ error: 'not found' }`                   |

Внутренний API реализован через `io.engine.use(...)` (engine.io middleware):
socket.io с `path: '/'` перехватывает все http-запросы, обычный request-handler
httpServer до socket.io не вызывается — см. комментарий в `index.ts`.

## WS-протокол

Комнаты: `script:<scriptId>` (редакторы + устройства).

- `hello` (device — валидация токена через `GET NEXT_URL/api/pair/validate`) → ack
- `subscribe` `{ scriptId }` (editor — сменить комнату)
- `status` `{ recording, sectionId, wpm, battery }` (device → `device-status` в комнату)
- `take` `{ sectionId, sectionTitle, t0, t1 }` (device → `POST NEXT_URL/api/takes`,
  при успехе `take` редакторам, при ошибке `take-error` устройству)
- disconnect устройства → `device-presence` `{ connected: false }` редакторам

`NEXT_URL` (по умолчанию `http://127.0.0.1:3000`) — Next.js на той же машине.

## Конфигурация

- Порт — константа `3030` (требование окружения).
- socket.io `path: '/'` — НЕ менять: шлюз Caddy строит на нём проброс (`/?XTransformPort=3030`).
