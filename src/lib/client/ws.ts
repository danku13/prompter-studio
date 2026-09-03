/**
 * Построение socket.io-соединения с WS-мини-сервисом (порт 3030).
 *
 * Два режима (см. ServerInfo.wsMode):
 *  - 'gateway'  — песочница/превью: трафик идёт через шлюз Caddy с query XTransformPort.
 *                 Паттерн в точности повторяет examples/websocket/frontend.tsx
 *  - 'direct'   — LAN-деплой: телефон подключается напрямую ws://<host>:<wsPort>,
 *                 путь '/' (мини-сервис слушает engine.io на '/')
 */

import { io, type Socket } from 'socket.io-client';

export interface ConnectParams {
  mode: 'gateway' | 'direct';
  wsPort: number;
  host?: string;
}

export function connectSocket(params: ConnectParams): Socket {
  if (params.mode === 'gateway') {
    // НЕ менять формат URL — он используется шлюзом для проброса на нужный порт
    return io(`/?XTransformPort=${params.wsPort}`, {
      transports: ['websocket', 'polling'],
      forceNew: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    });
  }
  return io(`ws://${params.host}:${params.wsPort}`, {
    path: '/',
    transports: ['websocket', 'polling'],
    forceNew: true,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000,
  });
}
