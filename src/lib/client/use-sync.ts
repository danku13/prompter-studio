'use client';

/**
 * React-хуки WS-синхронизации с мини-сервисом (порт 3030).
 *
 * useEditorSync — для десктоп-редактора: устройства-онлайн, телеметрия,
 *   живые дубли, push сценария (правки с другого редактора).
 * useDeviceSync — для мобильного клиента: подключение по токену,
 *   отправка телеметрии и меток дублей, приём push сценария.
 *
 * Принцип: состояние меняется ТОЛЬКО из асинхронных коллбэков (сокет/феч),
 * а «сброс» при смене сценария/конфига — через derived-значения (фильтрация по scriptId).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { connectSocket, resolveWsMode } from './ws';
import { getDeviceIdentity, type ConnectionConfig } from './connection';
import { getTicket, notifyPinRequired } from './pin-store';
import { ApiClient } from './api';
import type {
  DevicePresenceMessage,
  DeviceStatusMessage,
  HelloAck,
  HelloPayload,
  ScriptPushMessage,
  TakeMessage,
  TakeRecord,
} from '../types';

export type SyncStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error';

// ==================== РЕДАКТОР (десктоп) ====================

export interface EditorSync {
  status: SyncStatus;
  /** онлайн-устройства с последней телеметрией (только активного сценария) */
  devices: DeviceStatusMessage[];
  /** дубли: живые события + начальная загрузка через REST (только активного сценария) */
  takes: TakeRecord[];
  /** последний push сценария; применить, если revision > текущей клиентской */
  scriptPush: ScriptPushMessage | null;
  clearScriptPush: () => void;
  refreshTakes: () => Promise<void>;
}

const EMPTY_DEVICES: DeviceStatusMessage[] = [];
const EMPTY_TAKES: TakeRecord[] = [];

export function useEditorSync(api: ApiClient, scriptId: string | null): EditorSync {
  const [rawStatus, setRawStatus] = useState<SyncStatus>('idle');
  const [rawDevices, setRawDevices] = useState<DeviceStatusMessage[]>([]);
  const [rawTakes, setRawTakes] = useState<TakeRecord[]>([]);
  const [rawScriptPush, setRawScriptPush] = useState<ScriptPushMessage | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const refreshTakes = useCallback(async () => {
    if (!scriptId) return;
    try {
      setRawTakes(await api.listTakes(scriptId));
    } catch {
      /* офлайн и т.п. — покажем то, что есть */
    }
  }, [api, scriptId]);

  // Жизненный цикл сокета привязан к активному сценарию
  useEffect(() => {
    if (!scriptId) return;

    let disposed = false;
    let sock: Socket | null = null;

    (async () => {
      try {
        const info = await api.serverInfo();
        if (disposed) return;
        setRawStatus('connecting');
        sock = connectSocket({
          mode: resolveWsMode(info.wsMode),
          wsPort: info.wsPort,
          host: typeof window !== 'undefined' ? window.location.hostname : undefined,
        });
        socketRef.current = sock;

        sock.on('connect', () => {
          if (disposed) return;
          const payload: HelloPayload = { role: 'editor', scriptId };
          const ticket = getTicket();
          if (ticket) payload.ticket = ticket;
          sock!.emit('hello', payload, (ack: HelloAck) => {
            if (disposed) return;
            if (ack?.ok) setRawStatus('connected');
            else {
              // включён PIN, а тикета нет/протух — просим приложение разблокироваться
              if (ack?.code === 'pin_required' || ack?.code === 'pin_invalid') {
                notifyPinRequired();
              }
              setRawStatus('error');
            }
          });
        });

        sock.on('disconnect', () => {
          if (!disposed) setRawStatus((s) => (s === 'connected' ? 'reconnecting' : s));
        });

        sock.on('device-status', (m: DeviceStatusMessage) => {
          setRawDevices((prev) => {
            const idx = prev.findIndex((d) => d.deviceId === m.deviceId);
            if (idx === -1) return [...prev, m];
            const copy = [...prev];
            copy[idx] = m;
            return copy;
          });
        });

        sock.on('device-presence', (m: DevicePresenceMessage) => {
          if (!m.connected) {
            setRawDevices((prev) => prev.filter((d) => d.deviceId !== m.deviceId));
            return;
          }
          setRawDevices((prev) => {
            if (prev.some((d) => d.deviceId === m.deviceId)) return prev;
            const stub: DeviceStatusMessage = {
              deviceId: m.deviceId,
              deviceName: m.deviceName,
              scriptId: m.scriptId,
              recording: false,
              sectionId: null,
              wpm: null,
              battery: null,
              updatedAt: new Date().toISOString(),
            };
            return [...prev, stub];
          });
        });

        sock.on('take', (m: TakeMessage) => {
          setRawTakes((prev) => [m.take, ...prev.filter((t) => t.id !== m.take.id)]);
        });

        sock.on('script', (m: ScriptPushMessage) => {
          setRawScriptPush(m);
        });
      } catch {
        if (!disposed) setRawStatus('error');
      }
    })();

    return () => {
      disposed = true;
      sock?.disconnect();
      socketRef.current = null;
    };
  }, [api, scriptId]);

  // Начальная загрузка дублей при смене сценария (fetch инлайн, чтобы setState был строго после await)
  useEffect(() => {
    if (!scriptId) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await api.listTakes(scriptId);
        if (!cancelled) setRawTakes(list);
      } catch {
        /* офлайн и т.п. — покажем то, что есть */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, scriptId]);

  // Derived-значения: сброс при смене сценария без синхронных setState
  const active = !!scriptId;
  const status: SyncStatus = active ? (rawStatus === 'idle' ? 'connecting' : rawStatus) : 'idle';
  const devices = active
    ? rawDevices.filter((d) => d.scriptId === scriptId)
    : EMPTY_DEVICES;
  const takes = active ? rawTakes.filter((t) => t.scriptId === scriptId) : EMPTY_TAKES;
  const scriptPush =
    active && rawScriptPush && rawScriptPush.scriptId === scriptId ? rawScriptPush : null;

  return {
    status,
    devices,
    takes,
    scriptPush,
    clearScriptPush: () => setRawScriptPush(null),
    refreshTakes,
  };
}

// ==================== УСТРОЙСТВО (мобильный клиент) ====================

export interface DeviceStatusInput {
  recording: boolean;
  sectionId: string | null;
  wpm: number | null;
  battery: number | null;
}

export interface TakeInput {
  sectionId: string;
  sectionTitle: string;
  t0: number;
  t1: number;
}

export interface DeviceSyncHandlers {
  onScriptPush?: (m: ScriptPushMessage) => void;
  onConnected?: (scriptId: string | null) => void;
}

export interface DeviceSync {
  status: SyncStatus;
  scriptId: string | null;
  sendStatus: (s: DeviceStatusInput) => void;
  sendTake: (t: TakeInput) => void;
  /** Подписаться на комнату сценария, открытого в суфлёре (не только спаренного). */
  subscribe: (scriptId: string | null) => void;
}

export function useDeviceSync(
  api: ApiClient,
  cfg: ConnectionConfig | null,
  handlers: DeviceSyncHandlers = {}
): DeviceSync {
  const [rawStatus, setRawStatus] = useState<SyncStatus>('idle');
  const [rawScriptId, setRawScriptId] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const handlersRef = useRef(handlers);
  /** Желаемая комната (сценарий, открытый в суфлёре); применяется при подключении
   *  и при каждом реконнекте — вызов до установки сокета не теряется. */
  const desiredScriptIdRef = useRef<string | null>(null);

  // Держим handlers актуальными (обновление ref в эффекте, не в рендере)
  useEffect(() => {
    handlersRef.current = handlers;
  });

  const host = cfg?.serverHost;
  const wsPort = cfg?.wsPort;
  const token = cfg?.token;

  useEffect(() => {
    if (!host || !wsPort || !token) return;

    let disposed = false;
    let sock: Socket | null = null;

    (async () => {
      try {
        const info = await api.serverInfo();
        if (disposed) return;
        setRawStatus('connecting');
        sock = connectSocket({ mode: resolveWsMode(info.wsMode), wsPort, host });
        socketRef.current = sock;

        sock.on('connect', () => {
          if (disposed) return;
          const identity = getDeviceIdentity();
          const payload: HelloPayload = { role: 'device', token, deviceInfo: identity };
          sock!.emit('hello', payload, (ack: HelloAck) => {
            if (disposed) return;
            if (ack?.ok) {
              setRawScriptId(ack.scriptId ?? null);
              setRawStatus('connected');
              // после hello устройство сидит в комнате спаренного сценария;
              // если суфлёр открыл другой — переходим в его комнату
              const desired = desiredScriptIdRef.current;
              if (desired && desired !== ack.scriptId) {
                sock!.emit('subscribe', { scriptId: desired });
              }
              handlersRef.current.onConnected?.(ack.scriptId ?? null);
            } else {
              setRawStatus('error');
            }
          });
        });

        sock.on('disconnect', () => {
          if (!disposed) setRawStatus((s) => (s === 'connected' ? 'reconnecting' : s));
        });

        sock.on('script', (m: ScriptPushMessage) => {
          handlersRef.current.onScriptPush?.(m);
        });
      } catch {
        if (!disposed) setRawStatus('error');
      }
    })();

    return () => {
      disposed = true;
      sock?.disconnect();
      socketRef.current = null;
    };
  }, [api, host, wsPort, token]);

  const sendStatus = useCallback((s: DeviceStatusInput) => {
    socketRef.current?.emit('status', s);
  }, []);

  const sendTake = useCallback((t: TakeInput) => {
    socketRef.current?.emit('take', t);
  }, []);

  const subscribe = useCallback((scriptId: string | null) => {
    desiredScriptIdRef.current = scriptId;
    const sock = socketRef.current;
    if (scriptId && sock && sock.connected) {
      sock.emit('subscribe', { scriptId });
    }
  }, []);

  // Derived: без конфига — idle, до первого события — 'connecting'
  const active = !!(host && wsPort && token);
  const status: SyncStatus = active ? (rawStatus === 'idle' ? 'connecting' : rawStatus) : 'idle';
  const scriptId = active ? rawScriptId : null;

  return { status, scriptId, sendStatus, sendTake, subscribe };
}
