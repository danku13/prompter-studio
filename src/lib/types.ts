/**
 * Prompter Studio — общие контракты данных и протоколов.
 * ЕДИНЫЙ ИСТОЧНИК ПРАВДЫ для веб-редактора, мобильного клиента и синхронизации.
 * Менять аккуратно: на этот файл завязаны десктоп, мобайл, REST API и WS-сервис.
 */

// ================= Данные сценария =================

export const SECTION_COLORS = ['default', 'amber', 'rose', 'emerald', 'violet'] as const;
export type SectionColor = (typeof SECTION_COLORS)[number];

export interface ScriptSection {
  /** cuid от сервера; временные клиентские id начинаются с 'tmp-' */
  id: string;
  title: string;
  content: string;
  color: SectionColor;
  orderIndex: number;
}

export interface ScriptData {
  id: string;
  title: string;
  revision: number;
  sections: ScriptSection[];
  updatedAt?: string;
}

export interface ScriptSummary {
  id: string;
  title: string;
  revision: number;
  sectionCount: number;
  wordCount: number;
  estSeconds: number;
  updatedAt: string;
}

/** Секция, которую клиент отправляет при сохранении (id опционален для новых) */
export interface SectionDraft {
  id?: string;
  title: string;
  content: string;
  color: SectionColor;
  orderIndex: number;
}

export interface SaveScriptPayload {
  title: string;
  sections: SectionDraft[];
  /** ревизия, на которой клиент основывал правки; при конфликте сервер вернёт 409 */
  baseRevision: number;
}

// ================= Дубли (takes) =================

export type TakeRating = 'good' | 'ok' | 'bad';

export interface TakeRecord {
  id: string;
  scriptId: string;
  sectionId: string;
  /** снапшот заголовка секции на момент дубля (секция могла быть изменена) */
  sectionTitle: string;
  /** мс от старта записи */
  t0: number;
  /** мс от старта записи */
  t1: number;
  durationMs: number;
  rating: TakeRating | null;
  createdAt: string;
}

// ================= Сервер / pairing =================

export type WsMode = 'direct' | 'gateway';

export interface ServerInfo {
  appName: string;
  version: string;
  /** LAN IPv4 компьютера (для QR); null, если не найден */
  lanIp: string | null;
  webPort: number;
  wsPort: number;
  wsMode: WsMode;
  /** включён ли PIN-доступ (P0 «кафе/коворкинг»): клиент показывает экран ввода */
  pinRequired: boolean;
}

// ================= PIN-доступ (P0 «кафе/коворкинг») =================

/** POST /api/auth/pin/verify — ok без ticket, если PIN не задан */
export interface PinVerifyResponse {
  ok: true;
  ticket: string | null;
  expiresAt: number | null;
  enabled: boolean;
}

/** POST /api/auth/pin — тикет свежий (после ротации секрета старые недействительны) */
export interface PinChangeResponse {
  enabled: boolean;
  ticket: string;
  expiresAt: number;
}

export interface PairSessionInfo {
  token: string;
  scriptId: string;
  /** prompter://connect?host=..&webPort=..&wsPort=..&token=.. — для APK (deep link) */
  deepLink: string;
  /** http://<lanIp>:<webPort>/?pair=<token> — для браузера на телефоне */
  webUrl: string;
  expiresAt: string;
}

// ================= WebSocket-протокол (мини-сервис, порт 3030) =================
/**
 * Комнаты: script:<scriptId> — в комнате редакторы + устройства.
 *
 * Клиент → сервер:
 *   'hello'    HelloPayload → ack HelloAck           (валидация токена для device)
 *   'subscribe' {scriptId}                            (editor/device: сменить активную комнату;
 *                                                    device подписывается на сценарий, открытый в суфлёре)
 *   'status'   {recording, sectionId, wpm, battery}   (device → телеметрия)
 *   'take'     {sectionId, sectionTitle, t0, t1}      (device → метка дубля)
 *
 * Сервер → клиентам:
 *   'script'          ScriptPushMessage   — всем в комнате (живые правки текста)
 *   'device-status'   DeviceStatusMessage — редакторам (телеметрия телефона)
 *   'device-presence' DevicePresenceMessage — редакторам (online/offline)
 *   'take'            TakeMessage         — редакторам (новый дубль, уже сохранённый в БД)
 *
 * Внутренний HTTP (Next.js → мини-сервис):
 *   POST /internal/broadcast {scriptId, revision, script}
 * Мини-сервис → Next.js:
 *   GET  /api/pair/validate?token=   (валидация device-токена)
 *   POST /api/takes                  (сохранение дубля, токен в теле)
 */

export type SyncRole = 'device' | 'editor';

export interface DeviceInfo {
  deviceId: string;
  /** например "Android · Pixel 7" */
  name: string;
  /** 'android' | 'browser' | ... */
  platform: string;
}

export interface HelloPayload {
  role: SyncRole;
  /** для role=device */
  token?: string;
  /** для role=editor — активный сценарий */
  scriptId?: string;
  /** для role=editor — тикет доступа (x-app-ticket), когда включён PIN */
  ticket?: string;
  deviceInfo?: DeviceInfo;
}

export interface HelloAck {
  ok: boolean;
  scriptId?: string;
  error?: string;
  /** 'pin_required' — редактор без тикета/с протухшим (нужно показать ввод PIN) */
  code?: 'pin_required' | 'pin_invalid';
}

export interface DeviceStatusMessage {
  deviceId: string;
  deviceName: string;
  scriptId: string;
  recording: boolean;
  sectionId: string | null;
  wpm: number | null;
  battery: number | null;
  updatedAt: string;
}

export interface DevicePresenceMessage {
  deviceId: string;
  deviceName: string;
  scriptId: string;
  connected: boolean;
}

export interface TakeMessage {
  scriptId: string;
  take: TakeRecord;
}

export interface ScriptPushMessage {
  scriptId: string;
  revision: number;
  script: ScriptData;
}

// ================= AI-помощник (BYOK) =================
/**
 * Провайдеры для AI-функций редактора:
 *  - 'builtin'   — встроенный (без ключа, работает «из коробки»);
 *  - 'openai'    — совместимость с OpenAI API (включая OpenAI-совместимые прокси);
 *  - 'anthropic' — совместимость с Claude (Anthropic Messages API).
 */

export const AI_PROVIDERS = ['builtin', 'openai', 'anthropic'] as const;
export type AiProviderName = (typeof AI_PROVIDERS)[number];

export type AiImproveMode = 'polish' | 'shorten' | 'expand' | 'custom';

/** Представление настроек провайдера для клиента: ключ ТОЛЬКО маской */
export interface AiProviderView {
  hasKey: boolean;
  /** например «sk-…9f2c»; null, если ключ не задан */
  keyHint: string | null;
  baseUrl: string;
  model: string;
}

export interface AiSettingsView {
  defaultProvider: AiProviderName;
  openai: AiProviderView;
  anthropic: AiProviderView;
}

/** PUT /api/ai/settings: undefined — не менять, null/'' — стереть, строка — записать */
export interface AiProviderUpdate {
  key?: string | null;
  baseUrl?: string;
  model?: string;
}

export interface AiSettingsUpdate {
  defaultProvider?: AiProviderName;
  openai?: AiProviderUpdate;
  anthropic?: AiProviderUpdate;
}

export interface AiTestResult {
  ok: true;
  provider: AiProviderName;
  model: string;
  reply: string;
}

/** Подсекция, предложенная AI при разбиении */
export interface AiSubsectionDraft {
  title: string;
  content: string;
}

export interface AiImproveResult {
  content: string;
}

export interface AiSplitResult {
  subsections: AiSubsectionDraft[];
}

// ================= REST-контракт (Next.js /api) =================
/**
 * GET    /api/server-info                 → ServerInfo
 * GET    /api/scripts                     → ScriptSummary[]
 * POST   /api/scripts {title}             → ScriptData
 * GET    /api/scripts/:id                 → ScriptData
 * PUT    /api/scripts/:id SaveScriptPayload → { script: ScriptData } | 409 {error:'revision_conflict'}
 * DELETE /api/scripts/:id                 → { ok: true }
 * POST   /api/pair {scriptId}             → PairSessionInfo
 * GET    /api/pair/validate?token=        → { ok: true, scriptId, expiresAt } | 404
 * GET    /api/mobile/script?token=&deviceName= → { script, wsMode, wsPort }
 * POST   /api/takes {token, sectionId, sectionTitle, t0, t1} → { take: TakeRecord }
 * GET    /api/takes?scriptId=             → TakeRecord[] (новые сверху)
 * PATCH  /api/takes/:id {rating|null}     → TakeRecord
 * DELETE /api/takes/:id                   → { ok: true }
 *
 * AI (BYOK; ключи хранятся на сервере, клиенту — маски):
 * GET    /api/ai/settings                 → AiSettingsView
 * PUT    /api/ai/settings AiSettingsUpdate → AiSettingsView
 * POST   /api/ai/test {provider?, key?, baseUrl?, model?} → AiTestResult
 * POST   /api/ai/improve {content, mode, instruction?, title?} → AiImproveResult
 * POST   /api/ai/split {content, maxWords?, title?} → AiSplitResult
 *
 * REST-контракт — при включённом PIN все editor-роуты требуют заголовок
 * x-app-ticket (тикет выдаёт POST /api/auth/pin/verify; 401 code='pin_required'):
 * POST   /api/auth/pin/verify {pin}            → PinVerifyResponse | 401 pin_invalid | 429 rate_limited
 * GET    /api/auth/pin                        → { enabled }
 * POST   /api/auth/pin {currentPin?, newPin}  → PinChangeResponse (newPin=null → отключить)
 * Без тикета: /api/server-info, /api/auth/pin*, /api/pair/validate,
 * /api/mobile/script и POST /api/takes (их защищает device-токен).
 *
 * Ошибки: { error: string, code?: string }; 409 → code='revision_conflict';
 * ключ не настроен → 400 code='ai_not_configured'
 */
