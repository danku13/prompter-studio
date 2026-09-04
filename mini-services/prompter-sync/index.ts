/**
 * Prompter Studio — WS-мини-сервис синхронизации (Task 2-d).
 *
 * Real-time синхронизация редактора (компьютер) и мобильных устройств-суфлёров.
 * Источник истины по протоколу: /src/lib/types.ts (WS-протокол + REST-контракт).
 *
 * Порт: 3030 — КОНСТАНТА (требование окружения), не из env.
 * socket.io: path '/' — НЕ МЕНЯТЬ: шлюз Caddy строит на нём проброс портов
 * (клиент шлёт `/?XTransformPort=3030`, см. examples/websocket + Caddyfile).
 *
 * Комнаты: `script:<scriptId>` — редакторы + устройства одного сценария.
 *
 * Внутренний HTTP API (тот же порт 3030):
 *   GET  /                    → healthcheck { ok: true, service: 'prompter-sync' }
 *   POST /internal/broadcast  → body { scriptId, revision, script } → emit 'script' в комнату
 *   всё прочее                → 404 { error: 'not found' }
 *
 * Безопасность (аудит 2026-09):
 *   - /internal/broadcast требует секрет X-Broadcast-Secret (env BROADCAST_SECRET
 *     или файл runtime-secret рядом с сервисом; Next.js читает тот же файл из
 *     notify.ts). Секрет сравнивается timing-safe. Без секрета широковещание
 *     в комнаты невозможно — это закрывал вектор подмены текста в суфлёре.
 *   - WS-подключения с чужим Origin (drive-by страница в браузере пользователя)
 *     отклоняются: Origin должен совпадать по хосту с Host либо быть Capacitor
 *     (https://localhost). Небраузерные клиенты без Origin пропускаются.
 *   - CORS остаётся открытым только для транспорта socket.io; авторизация
 *     ролей происходит в io.use + hello (токен устройства валидируется в Next.js).
 *
 * Техническое примечание про внутренний API: socket.io с path '/' перехватывает
 * ЛЮБОЙ http-запрос (engine.io check: `req.url` начинается с '/'), поэтому обычный
 * request-handler httpServer, зарегистрированный до socket.io, никогда не вызывается.
 * Внутренний API реализован через публичный engine.io middleware `io.engine.use(...)`
 * (задокументированный способ: https://socket.io/docs/v4/middlewares/).
 * Трафик engine.io (query EIO/sid или заголовок Upgrade) пропускается через next().
 *
 * Вызовы Next.js (NEXT_URL, по умолчанию http://127.0.0.1:3000):
 *   GET  /api/pair/validate?token=...   — валидация device-токена при 'hello'
 *   POST /api/takes                     — сохранение дубля перед рассылкой 'take'
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server, type Socket } from 'socket.io';

// ============================== Конфигурация ==============================

const PORT = 3030;
const NEXT_URL = process.env.NEXT_URL ?? 'http://127.0.0.1:3000';
const FETCH_TIMEOUT_MS = 10_000;

const log = (...args: unknown[]) => console.log('[sync]', ...args);
const logError = (...args: unknown[]) => console.error('[sync]', ...args);

const room = (scriptId: string) => `script:${scriptId}`;

// ============================== Broadcast-секрет ==============================

const SERVICE_DIR = dirname(fileURLToPath(import.meta.url));
const SECRET_FILE = join(SERVICE_DIR, 'runtime-secret');

/**
 * Секрет для POST /internal/broadcast (см. шапку). Источники по приоритету:
 * env BROADCAST_SECRET → файл runtime-secret (создаётся при первом запуске,
 * права 0600). Next.js-сторона читает тот же файл из notify.ts.
 */
function loadBroadcastSecret(): string {
  const fromEnv = process.env.BROADCAST_SECRET?.trim();
  if (fromEnv && fromEnv.length >= 16) return fromEnv;
  try {
    const existing = readFileSync(SECRET_FILE, 'utf8').trim();
    if (existing.length >= 16) return existing;
  } catch {
    /* файла нет — создадим ниже */
  }
  const secret = randomBytes(32).toString('hex');
  try {
    writeFileSync(SECRET_FILE, `${secret}\n`, { mode: 0o600 });
  } catch (err) {
    logError('не удалось записать runtime-secret:', err);
  }
  return secret;
}

const BROADCAST_SECRET = loadBroadcastSecret();

function secretMatches(provided: string): boolean {
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(BROADCAST_SECRET, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

// ============================== Типы (локально, по контракту types.ts) ==============================

interface SocketState {
  role?: 'device' | 'editor';
  token?: string;
  scriptId?: string;
  deviceId?: string;
  deviceName?: string;
  rooms: string[];
}

interface DeviceInfoPayload {
  deviceId?: string;
  name?: string;
  platform?: string;
}

interface SocketWithState extends Socket {
  data: SocketState;
}

interface BroadcastBody {
  scriptId?: unknown;
  revision?: unknown;
  script?: unknown;
}

// ============================== HTTP + socket.io ==============================

// globalThis-хранитель для bun --hot: при пере-исполнении модуля переиспользуем
// уже слушающий http-сервер вместо повторного listen (иначе EADDRINUSE).
const g = globalThis as typeof globalThis & Record<string, unknown>;
const httpServer = (g.__prompterSyncHttpServer ??= createServer()) as import('node:http').Server;

const io = new Server(httpServer, {
  // path '/' НЕ менять — см. шапку файла
  path: '/',
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60_000,
  pingInterval: 25_000,
});

// ============================== Вспомогательные ==============================

function sendJson(res: ServerResponse, code: number, body: unknown): void {
  try {
    if (res.headersSent) {
      res.end();
      return;
    }
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  } catch (err) {
    logError('sendJson failed:', err);
  }
}

function readBody(req: IncomingMessage, limitBytes = 25 * 1024 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(new Error('payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function roomSize(scriptId: string): number {
  const adapter = io.sockets.adapter as unknown as { rooms?: Map<string, Set<string>> };
  return adapter.rooms?.get(room(scriptId))?.size ?? 0;
}

interface ValidationResult {
  ok: boolean;
  scriptId?: string;
}

async function validateToken(token: string): Promise<ValidationResult> {
  try {
    const res = await fetch(`${NEXT_URL}/api/pair/validate?token=${encodeURIComponent(token)}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return { ok: false };
    const body = (await res.json().catch(() => null)) as { ok?: boolean; scriptId?: string } | null;
    if (body && body.ok === true && typeof body.scriptId === 'string' && body.scriptId) {
      return { ok: true, scriptId: body.scriptId };
    }
    return { ok: false };
  } catch (err) {
    logError('pair/validate request failed:', err);
    return { ok: false };
  }
}

async function apiErrorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown } | null;
    if (body && typeof body.error === 'string' && body.error) return body.error;
  } catch {
    /* ignore */
  }
  return `Ошибка сервера (HTTP ${res.status})`;
}

function joinRoom(socket: SocketWithState, scriptId: string): void {
  for (const r of socket.data.rooms) socket.leave(r);
  const r = room(scriptId);
  socket.join(r);
  socket.data.rooms = [r];
  socket.data.scriptId = scriptId;
}

/**
 * Редактору при входе в комнату/подписке отправляем presence всех УЖЕ подключённых
 * устройств комнаты (иначе он не узнает о телефонах, подключившихся раньше него).
 */
function sendRoomDevicesTo(socket: SocketWithState): void {
  const currentRoom = socket.data.rooms[0];
  if (!currentRoom) return;
  for (const [, s] of io.sockets.sockets) {
    const other = s as SocketWithState;
    if (other.id === socket.id) continue;
    if (other.data?.role !== 'device' || !other.data.rooms?.includes(currentRoom)) continue;
    socket.emit('device-presence', {
      deviceId: other.data.deviceId ?? 'unknown',
      deviceName: other.data.deviceName ?? 'Устройство',
      scriptId: other.data.scriptId ?? '',
      connected: true,
    });
  }
}

// ============================== Внутренний HTTP API ==============================

async function handleHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  next: (err?: unknown) => void
): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost');

  // Трафик engine.io (polling/websocket) пропускаем дальше к socket.io
  const isEngineTraffic =
    req.headers.upgrade !== undefined || url.searchParams.has('EIO') || url.searchParams.has('sid');
  if (isEngineTraffic) {
    next();
    return;
  }

  // CORS-middleware мог уже ответить на preflight OPTIONS
  if (res.headersSent) return;

  if (req.method === 'POST' && url.pathname === '/internal/broadcast') {
    const provided = typeof req.headers['x-broadcast-secret'] === 'string' ? req.headers['x-broadcast-secret'] : '';
    if (!provided || !secretMatches(provided)) {
      log(`broadcast rejected: missing/invalid secret (socket ${req.socket.remoteAddress ?? 'unknown'})`);
      sendJson(res, 403, { error: 'forbidden' });
      return;
    }
    let raw: string;
    try {
      raw = await readBody(req);
    } catch {
      sendJson(res, 400, { error: 'Не удалось прочитать тело запроса' });
      return;
    }
    let parsed: BroadcastBody;
    try {
      parsed = JSON.parse(raw) as BroadcastBody;
    } catch {
      sendJson(res, 400, { error: 'Некорректный JSON' });
      return;
    }
    const scriptId = parsed.scriptId;
    const script = parsed.script;
    if (typeof scriptId !== 'string' || !scriptId || script == null) {
      sendJson(res, 400, { error: 'Требуются scriptId и script' });
      return;
    }
    const revision = typeof parsed.revision === 'number' && Number.isFinite(parsed.revision) ? parsed.revision : 0;
    io.to(room(scriptId)).emit('script', { scriptId, revision, script });
    log(`broadcast → script ${scriptId} rev ${revision} (${roomSize(scriptId)} client(s) in room)`);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/') {
    sendJson(res, 200, { ok: true, service: 'prompter-sync', port: PORT });
    return;
  }

  sendJson(res, 404, { error: 'not found' });
}

io.engine.use((req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => {
  handleHttpRequest(req, res, next).catch((err) => {
    logError('internal http handler error:', err);
    sendJson(res, 500, { error: 'internal error' });
  });
});

// ============================== WS: origin-гейт ==============================

/** hostname из заголовка Host (учитывает [IPv6]:port) */
function hostnameOf(hostHeader: string): string {
  let h = hostHeader.trim().toLowerCase();
  if (h.startsWith('[')) {
    const end = h.indexOf(']');
    return end === -1 ? h : h.slice(1, end);
  }
  const idx = h.lastIndexOf(':');
  if (idx !== -1) h = h.slice(0, idx);
  return h;
}

/** Origin допустим: хост Origin = хост Host, либо Capacitor-приложение (localhost) */
function isAllowedOrigin(origin: string, host: string): boolean {
  try {
    const originHost = new URL(origin).hostname.toLowerCase();
    if (originHost === 'localhost' || originHost === '127.0.0.1' || originHost === '::1') {
      // APK: страница живёт на https://localhost, а WS ходит на LAN-хост сервера
      return true;
    }
    const hostName = hostnameOf(host);
    return hostName !== '' && originHost === hostName;
  } catch {
    return false;
  }
}

/**
 * Отсекаем браузерные cross-origin подключения (вредоносная страница в браузере
 * пользователя, пытающаяся подключиться к LAN-серверу). Небраузерные клиенты
 * (node/curl/APK-WebView без Origin) не затрагиваются.
 */
io.use((socket, next) => {
  const origin = socket.handshake.headers.origin;
  const host = socket.handshake.headers.host ?? '';
  if (typeof origin === 'string' && origin && !isAllowedOrigin(origin, host)) {
    log(`socket rejected: cross-origin (origin=${origin}, host=${host})`);
    next(new Error('origin not allowed'));
    return;
  }
  next();
});

// ============================== WS: hello ==============================

async function handleHello(socket: SocketWithState, payload: unknown, ack: unknown): Promise<void> {
  const respond = (body: Record<string, unknown>): void => {
    if (typeof ack === 'function') {
      try {
        ack(body);
      } catch (err) {
        logError('hello ack error:', err);
      }
    }
  };

  if (typeof payload !== 'object' || payload === null) {
    respond({ ok: false, error: 'Некорректный payload' });
    return;
  }
  const p = payload as { role?: unknown; token?: unknown; scriptId?: unknown; deviceInfo?: unknown };

  if (p.role === 'device') {
    const token = typeof p.token === 'string' ? p.token.trim() : '';
    if (!token) {
      respond({ ok: false, error: 'Не передан токен' });
      return;
    }
    const validation = await validateToken(token);
    if (!validation.ok || !validation.scriptId) {
      respond({ ok: false, error: 'Код недействителен или истёк' });
      log(`device rejected: invalid token (socket ${socket.id})`);
      socket.disconnect(true);
      return;
    }
    const info = (typeof p.deviceInfo === 'object' && p.deviceInfo !== null ? p.deviceInfo : {}) as DeviceInfoPayload;
    socket.data.role = 'device';
    socket.data.token = token;
    socket.data.deviceId = typeof info.deviceId === 'string' && info.deviceId ? info.deviceId : `unknown-${socket.id}`;
    socket.data.deviceName = typeof info.name === 'string' && info.name ? info.name : 'Устройство';
    joinRoom(socket, validation.scriptId);
    respond({ ok: true, scriptId: validation.scriptId });
    socket.to(room(validation.scriptId)).emit('device-presence', {
      deviceId: socket.data.deviceId,
      deviceName: socket.data.deviceName,
      scriptId: validation.scriptId,
      connected: true,
    });
    log(`device connected: "${socket.data.deviceName}" (${socket.data.deviceId}) → script ${validation.scriptId}`);
    return;
  }

  if (p.role === 'editor') {
    const scriptId = typeof p.scriptId === 'string' ? p.scriptId.trim() : '';
    if (!scriptId) {
      respond({ ok: false, error: 'Не передан scriptId' });
      return;
    }
    socket.data.role = 'editor';
    joinRoom(socket, scriptId);
    respond({ ok: true, scriptId });
    sendRoomDevicesTo(socket);
    log(`editor connected → script ${scriptId}`);
    return;
  }

  respond({ ok: false, error: 'Неизвестная роль' });
}

// ============================== WS: take ==============================

async function handleTake(socket: SocketWithState, payload: unknown): Promise<void> {
  const data = socket.data;
  try {
    if (data.role !== 'device' || !data.scriptId || !data.token) return;
    const p = (typeof payload === 'object' && payload !== null ? payload : {}) as Record<string, unknown>;
    const sectionId = typeof p.sectionId === 'string' ? p.sectionId : '';
    if (!sectionId) {
      socket.emit('take-error', { error: 'Дубль без sectionId' });
      return;
    }
    const sectionTitle = typeof p.sectionTitle === 'string' ? p.sectionTitle : '';
    const t0 = typeof p.t0 === 'number' && Number.isFinite(p.t0) ? p.t0 : 0;
    const t1 = typeof p.t1 === 'number' && Number.isFinite(p.t1) ? p.t1 : 0;

    let res: Response;
    try {
      res = await fetch(`${NEXT_URL}/api/takes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: data.token, sectionId, sectionTitle, t0, t1 }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch (err) {
      logError('take: request to /api/takes failed:', err);
      socket.emit('take-error', { error: 'Сервер недоступен, дубль не сохранён' });
      return;
    }

    if (!res.ok) {
      const message = await apiErrorMessage(res);
      logError(`take rejected by API (HTTP ${res.status}): ${message}`);
      socket.emit('take-error', { error: message });
      return;
    }

    const body = (await res.json().catch(() => null)) as { take?: unknown } | null;
    if (!body || typeof body.take !== 'object' || body.take === null) {
      logError('take: unexpected API response (no take object)');
      socket.emit('take-error', { error: 'Неожиданный ответ сервера' });
      return;
    }

    socket.to(room(data.scriptId)).emit('take', { scriptId: data.scriptId, take: body.take });
    log(`take saved: script ${data.scriptId} section "${sectionTitle}" (${t1 - t0} ms)`);
  } catch (err) {
    logError('take handler error:', err);
    try {
      socket.emit('take-error', { error: 'Внутренняя ошибка сервиса' });
    } catch {
      /* noop */
    }
  }
}

// ============================== WS: подключение ==============================

io.on('connection', (rawSocket) => {
  const socket = rawSocket as SocketWithState;
  socket.data = { rooms: [] };
  log(`client connected: ${socket.id} (${socket.conn.transport.name})`);

  socket.on('hello', (payload: unknown, ack?: unknown) => {
    handleHello(socket, payload, ack).catch((err) => {
      logError('hello handler error:', err);
      if (typeof ack === 'function') {
        try {
          ack({ ok: false, error: 'Внутренняя ошибка' });
        } catch {
          /* noop */
        }
      }
    });
  });

  // 'subscribe' { scriptId } — editor И device: сменить активную комнату.
  // Для device это сценарий, открытый в суфлёре: устройство подписывается на него
  // при открытии (prompter-screen) и возвращается к спаренному при выходе в список.
  // Без этого правки сценария, отличного от спаренного по QR, не доходили до телефона.
  socket.on('subscribe', (payload: unknown) => {
    try {
      const data = socket.data;
      if (data.role !== 'editor' && data.role !== 'device') return;
      const p = (typeof payload === 'object' && payload !== null ? payload : {}) as { scriptId?: unknown };
      const scriptId = typeof p.scriptId === 'string' ? p.scriptId.trim() : '';
      if (!scriptId) return;
      if (data.scriptId === scriptId && data.rooms.includes(room(scriptId))) return;
      joinRoom(socket, scriptId);
      if (data.role === 'editor') sendRoomDevicesTo(socket);
      log(`${data.role} ${socket.id} subscribed → script ${scriptId}`);
    } catch (err) {
      logError('subscribe handler error:', err);
    }
  });

  // 'status' { recording, sectionId, wpm, battery } — телеметрия device → редакторам
  socket.on('status', (payload: unknown) => {
    try {
      const data = socket.data;
      if (data.role !== 'device' || !data.scriptId) return;
      const p = (typeof payload === 'object' && payload !== null ? payload : {}) as Record<string, unknown>;
      socket.to(room(data.scriptId)).emit('device-status', {
        deviceId: data.deviceId ?? 'unknown',
        deviceName: data.deviceName ?? 'Устройство',
        scriptId: data.scriptId,
        recording: p.recording === true,
        sectionId: typeof p.sectionId === 'string' ? p.sectionId : null,
        wpm: typeof p.wpm === 'number' && Number.isFinite(p.wpm) ? p.wpm : null,
        battery: typeof p.battery === 'number' && Number.isFinite(p.battery) ? p.battery : null,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      logError('status handler error:', err);
    }
  });

  // 'take' { sectionId, sectionTitle, t0, t1 } — device; сначала сохранение, потом рассылка
  socket.on('take', (payload: unknown) => {
    void handleTake(socket, payload);
  });

  socket.on('disconnect', (reason: string) => {
    try {
      const data = socket.data;
      if (data.role === 'device' && data.scriptId) {
        socket.to(room(data.scriptId)).emit('device-presence', {
          deviceId: data.deviceId ?? 'unknown',
          deviceName: data.deviceName ?? 'Устройство',
          scriptId: data.scriptId,
          connected: false,
        });
        log(`device disconnected: "${data.deviceName}" (script ${data.scriptId}, reason: ${reason})`);
      } else if (data.role === 'editor') {
        log(`editor disconnected (script ${data.scriptId}, reason: ${reason})`);
      } else {
        log(`client disconnected: ${socket.id} (${reason})`);
      }
      data.rooms = [];
    } catch (err) {
      logError('disconnect handler error:', err);
    }
  });
});

// ============================== Запуск и shutdown ==============================

httpServer.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    logError(`port ${PORT} already in use — another instance running?`);
  } else {
    logError('http server error:', err);
  }
});

if (!g.__prompterSyncListening) {
  g.__prompterSyncListening = true;
  httpServer.listen(PORT, () => {
    log(`prompter-sync is up on :${PORT} (socket.io path '/', transports: polling+websocket)`);
    log(`NEXT_URL = ${NEXT_URL}`);
    log(`rooms: script:<scriptId>; internal POST /internal/broadcast (secret: on); healthcheck GET /`);
  });
}

let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  log(`received ${signal} — shutting down...`);
  const forceExit = setTimeout(() => process.exit(0), 3000);
  forceExit.unref?.();
  try {
    io.close(() => {
      log('closed');
      process.exit(0);
    });
  } catch (err) {
    logError('close error:', err);
    process.exit(0);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Страховка: JS-исключения не должны ронять сервис (краши уровня bun —
// обрабатывает supervisor-обёртка, см. supervise.sh)
process.on('uncaughtException', (err) => {
  logError('uncaughtException (ignored, service keeps running):', err);
});
process.on('unhandledRejection', (err) => {
  logError('unhandledRejection (ignored, service keeps running):', err);
});
