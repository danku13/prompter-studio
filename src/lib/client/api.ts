/**
 * REST-клиент Prompter Studio. Контракт — см. src/lib/types.ts (низ файла).
 * Используется и редактором (same-origin), и мобильным клиентом (base из ConnectionConfig).
 */

import type {
  AiImproveMode,
  AiImproveResult,
  AiProviderName,
  AiSettingsUpdate,
  AiSettingsView,
  AiSplitResult,
  PairSessionInfo,
  SaveScriptPayload,
  ScriptData,
  ScriptSummary,
  ServerInfo,
  TakeRating,
  TakeRecord,
  WsMode,
} from '../types';
import { isNativeApp, type ConnectionConfig } from './connection';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class ApiClient {
  /** '' — same-origin (браузер), 'http://host:3000' — нативное приложение */
  constructor(private base = '') {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    let res: Response;
    try {
      res = await fetch(this.base + path, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...(init?.headers ?? {}),
        },
      });
    } catch {
      throw new ApiError(0, 'Нет связи с сервером. Проверьте, что компьютер и телефон в одной сети.');
    }
    if (!res.ok) {
      let message = res.statusText || 'Ошибка сервера';
      let code: string | undefined;
      try {
        const body = (await res.json()) as { error?: string; code?: string };
        message = body.error ?? message;
        code = body.code;
      } catch {
        /* тело не JSON */
      }
      throw new ApiError(res.status, message, code);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  serverInfo(): Promise<ServerInfo> {
    return this.request<ServerInfo>('/api/server-info');
  }

  listScripts(): Promise<ScriptSummary[]> {
    return this.request<ScriptSummary[]>('/api/scripts');
  }

  getScript(id: string): Promise<ScriptData> {
    return this.request<ScriptData>(`/api/scripts/${id}`);
  }

  createScript(title: string): Promise<ScriptData> {
    return this.request<ScriptData>('/api/scripts', { method: 'POST', body: JSON.stringify({ title }) });
  }

  /** При конфликте ревизий бросает ApiError(409, ..., 'revision_conflict') */
  saveScript(id: string, payload: SaveScriptPayload): Promise<{ script: ScriptData }> {
    return this.request<{ script: ScriptData }>(`/api/scripts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  deleteScript(id: string): Promise<{ ok: true }> {
    return this.request<{ ok: true }>(`/api/scripts/${id}`, { method: 'DELETE' });
  }

  createPairing(scriptId: string): Promise<PairSessionInfo> {
    return this.request<PairSessionInfo>('/api/pair', {
      method: 'POST',
      body: JSON.stringify({ scriptId }),
    });
  }

  /** Для мобильного клиента: сценарий по токену + параметры WS */
  mobileScript(token: string, deviceName?: string): Promise<{ script: ScriptData; wsMode: WsMode; wsPort: number }> {
    const q = new URLSearchParams({ token });
    if (deviceName) q.set('deviceName', deviceName);
    return this.request<{ script: ScriptData; wsMode: WsMode; wsPort: number }>(`/api/mobile/script?${q.toString()}`);
  }

  listTakes(scriptId: string): Promise<TakeRecord[]> {
    return this.request<TakeRecord[]>(`/api/takes?scriptId=${encodeURIComponent(scriptId)}`);
  }

  rateTake(id: string, rating: TakeRating | null): Promise<TakeRecord> {
    return this.request<TakeRecord>(`/api/takes/${id}`, { method: 'PATCH', body: JSON.stringify({ rating }) });
  }

  deleteTake(id: string): Promise<{ ok: true }> {
    return this.request<{ ok: true }>(`/api/takes/${id}`, { method: 'DELETE' });
  }

  // ================= AI (BYOK) =================

  /** Настройки AI-помощника: ключи приходят масками */
  aiSettings(): Promise<AiSettingsView> {
    return this.request<AiSettingsView>('/api/ai/settings');
  }

  /** Сохранение BYOK-настроек (ключ undefined → не менять, null/'' → стереть) */
  aiSaveSettings(payload: AiSettingsUpdate): Promise<AiSettingsView> {
    return this.request<AiSettingsView>('/api/ai/settings', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  /** Проверка подключения: инлайн-поля перекрывают сохранённые */
  aiTest(payload: {
    provider?: AiProviderName;
    key?: string;
    baseUrl?: string;
    model?: string;
  }): Promise<{ ok: true; provider: AiProviderName; model: string; reply: string }> {
    return this.request<{ ok: true; provider: AiProviderName; model: string; reply: string }>(
      '/api/ai/test',
      { method: 'POST', body: JSON.stringify(payload) }
    );
  }

  /** Улучшение текста секции (stateless: текст передаётся в теле) */
  aiImprove(payload: {
    title?: string;
    content: string;
    mode: AiImproveMode;
    instruction?: string;
  }): Promise<AiImproveResult> {
    return this.request<AiImproveResult>('/api/ai/improve', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  /** Разбиение текста секции на подсекции */
  aiSplit(payload: {
    title?: string;
    content: string;
    maxWords?: number;
  }): Promise<AiSplitResult> {
    return this.request<AiSplitResult>('/api/ai/split', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }
}

/** Фабрика: браузер → same-origin; APK → абсолютный base из конфига подключения */
export function createApiClient(cfg?: ConnectionConfig | null): ApiClient {
  if (cfg && isNativeApp()) return new ApiClient(`http://${cfg.serverHost}:${cfg.webPort}`);
  return new ApiClient('');
}
