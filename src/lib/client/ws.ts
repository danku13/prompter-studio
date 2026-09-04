/**
 * Построение socket.io-соединения с WS-мини-сервисом (порт 3030).
 *
 * Два режима (см. ServerInfo.wsMode):
 *  - 'gateway'  — песочница/превью/любой https-прокси: трафик идёт через шлюз
 *                 с query XTransformPort. Паттерн в точности повторяет
 *                 examples/websocket/frontend.tsx
 *  - 'direct'   — LAN-деплой: телефон подключается напрямую ws://<host>:<wsPort>,
 *                 путь '/' (мини-сервис слушает engine.io на '/')
 *
 * Режим выбирается НА КЛИЕНТЕ (resolveWsMode), а не только по Host с сервера:
 *  - APK (Capacitor) → всегда direct: страница живёт на https://localhost,
 *    а реальный сервер — cfg.serverHost:wsPort;
 *  - https-страница (превью, любой TLS-прокси) → всегда gateway: прямой ws://
 *    из https-страницы блокируется как mixed content, а порт 3030 наружу
 *    всё равно не проброшен. Server-side Host-детекция может промахнуться,
 *    если внешний прокси переписывает Host, — клиент знает свой origin точно;
 *  - http-страница (localhost / LAN-IP) → ответ сервера (direct на LAN,
 *    gateway, если сервер за http-прокси).
 */

import { io, type Socket } from 'socket.io-client';
import { isNativeApp } from './connection';
import type { WsMode } from '../types';

export interface ConnectParams {
  mode: WsMode;
  wsPort: number;
  host?: string;
}

/** Надёжное определение режима WS на клиенте (см. комментарий к файлу). */
export function resolveWsMode(serverMode: WsMode): WsMode {
  if (isNativeApp()) return 'direct';
  if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
    return 'gateway';
  }
  return serverMode;
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
