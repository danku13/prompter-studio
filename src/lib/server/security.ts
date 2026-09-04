/**
 * PIN-защита доступа (P0 «кафе/коворкинг», аудит 2026-09: REST без аутентификации, F-03/F-04).
 *
 * Модель угрозы: компьютер со студией в публичной Wi-Fi сети (кафе/коворкинг).
 * Любой человек в той же сети может открыть веб-редактор или дергать REST/WS.
 *
 * Решение — локальный PIN:
 *  - PIN задаётся/меняется через POST /api/auth/pin и хранится В БД как scrypt-хэш
 *    ('scrypt:<N>:<r>:<p>:<len>:<saltHex>:<hashHex>'). Плейтекст нигде не сохраняется.
 *  - POST /api/auth/pin/verify проверяет PIN (scrypt — дорогой, только на входе)
 *    и выдаёт краткоживущий HMAC-тикет «v1.<expMs>.<sig>» (12 ч).
 *  - Дальше клиент прикладывает тикет заголовком x-app-ticket на каждый запрос;
 *    guard requireTicket() проверяет HMAC (быстро, ~0.1 мс) без БД и без scrypt.
 *  - WS-мини-сервис валидирует редактора по тому же тикету: читает
 *    mini-services/prompter-sync/runtime-pin.json ({enabled}) и runtime-auth-secret
 *    (HMAC-ключ). Устройства (телефоны) тикет НЕ требуют — их защищает pairing-токен.
 *  - Смена/удаление PIN ротирует auth-секрет → все старые тикеты мгновенно недействительны.
 *
 * Разграничение роутов:
 *  - тикет обязателен: /api/scripts*, /api/pair (POST), /api/takes (GET/PATCH/DELETE), /api/ai/*
 *    (важно: AI-настройки читают/пишут BYOK-ключи);
 *  - без тикета: /api/server-info (публичные метаданные + pinRequired), /api/auth/pin*
 *    (сами и есть вход), /api/pair/validate и /api/mobile/script и POST /api/takes
 *    (device-токен в query/теле — их собственная аутентификация).
 *
 * Brute-force: AttemptLimiter — 10 неудач / 5 мин на IP (verify + смена PIN).
 * Транспорт в LAN — http/ws (cleartext): PIN защищает от «просто соседа», но не от
 * целевого сниффера — это осознанный компромисс LAN-режима (см. security-audit.md).
 */

import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { HttpError } from './http';
import { PIN_MAX_LEN, PIN_MIN_LEN, isValidPinFormat } from '@/lib/pin-policy';

export { PIN_MAX_LEN, PIN_MIN_LEN, isValidPinFormat };

// ============================== PIN: хэш и проверка ==============================

const SCRYPT_N = 16_384;
const SCRYPT_r = 8;
const SCRYPT_p = 1;
const SCRYPT_LEN = 64;

/** 'scrypt:N:r:p:len:saltHex:hashHex' */
export function hashPin(pin: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(pin, salt, SCRYPT_LEN, { N: SCRYPT_N, r: SCRYPT_r, p: SCRYPT_p, maxmem: 64 * 1024 * 1024 });
  return `scrypt:${SCRYPT_N}:${SCRYPT_r}:${SCRYPT_p}:${SCRYPT_LEN}:${salt.toString('hex')}:${hash.toString('hex')}`;
}

/** timing-safe сверка PIN с закодированным хэшем */
export function verifyPinEncoded(pin: string, encoded: string): boolean {
  try {
    const parts = encoded.split(':');
    if (parts.length !== 7 || parts[0] !== 'scrypt') return false;
    const [, nStr, rStr, pStr, lenStr, saltHex, hashHex] = parts;
    const N = Number(nStr);
    const r = Number(rStr);
    const p = Number(pStr);
    const len = Number(lenStr);
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(hashHex, 'hex');
    if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p) || !Number.isFinite(len)) return false;
    if (salt.length === 0 || expected.length !== len) return false;
    const actual = scryptSync(pin, salt, len, { N, r, p, maxmem: 64 * 1024 * 1024 });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}


async function readPinHash(): Promise<string | null> {
  const row = await db.securityConfig.findUnique({ where: { id: 'default' } });
  return row?.pinHash ?? null;
}

export async function isPinEnabled(): Promise<boolean> {
  return (await readPinHash()) !== null;
}

/** Проверить PIN против БД (scrypt, «дорого»; для /api/auth/pin/verify) */
export async function verifyPin(pin: string): Promise<boolean> {
  const encoded = await readPinHash();
  if (!encoded) return false;
  return verifyPinEncoded(pin, encoded);
}

// ============================== Auth-секрет и тикеты ==============================

const SERVICE_DIR = path.join(process.cwd(), 'mini-services', 'prompter-sync');
const AUTH_SECRET_FILE = path.join(SERVICE_DIR, 'runtime-auth-secret');
const PIN_STATE_FILE = path.join(SERVICE_DIR, 'runtime-pin.json');

/** Кэш секрета в памяти (ротация — через resetAuthCache при смене PIN) */
let cachedAuthSecret: Buffer | null = null;

/**
 * HMAC-ключ тикетов. env AUTH_SECRET (≥16 байт hex/base64) → файл runtime-auth-secret
 * (0600, создаётся при первом запуске рядом с WS-мини-сервисом — его он читает тоже).
 */
function authSecret(): Buffer {
  if (cachedAuthSecret) return cachedAuthSecret;
  const fromEnv = process.env.AUTH_SECRET?.trim();
  if (fromEnv && fromEnv.length >= 16) {
    cachedAuthSecret = Buffer.from(fromEnv, 'utf8');
    return cachedAuthSecret;
  }
  try {
    if (existsSync(AUTH_SECRET_FILE)) {
      const v = readFileSync(AUTH_SECRET_FILE, 'utf8').trim();
      if (v.length >= 16) {
        cachedAuthSecret = Buffer.from(v, 'utf8');
        return cachedAuthSecret;
      }
    }
  } catch {
    /* пересоздадим */
  }
  const secret = randomBytes(32).toString('hex');
  try {
    writeFileSync(AUTH_SECRET_FILE, `${secret}\n`, { mode: 0o600 });
  } catch (err) {
    console.warn('[security] не удалось записать runtime-auth-secret:', err);
  }
  cachedAuthSecret = Buffer.from(secret, 'utf8');
  return cachedAuthSecret;
}

export const TICKET_TTL_MS = 12 * 60 * 60 * 1000; // 12 часов
const TICKET_PREFIX = 'v1.editor.';

function ticketSignature(expMs: number): string {
  return createHmac('sha256', authSecret()).update(`${TICKET_PREFIX}${expMs}`).digest('hex');
}

/** Выпустить тикет редактора (после успешной проверки PIN) */
export function issueEditorTicket(): { ticket: string; expiresAt: number } {
  const expMs = Date.now() + TICKET_TTL_MS;
  return { ticket: `${TICKET_PREFIX}${expMs}.${ticketSignature(expMs)}`, expiresAt: expMs };
}

/** Проверить тикет редактора (быстро: HMAC + срок; timing-safe) */
export function verifyEditorTicket(ticket: string): boolean {
  if (typeof ticket !== 'string' || !ticket.startsWith(TICKET_PREFIX)) return false;
  const rest = ticket.slice(TICKET_PREFIX.length);
  const dot = rest.lastIndexOf('.');
  if (dot <= 0) return false;
  const expStr = rest.slice(0, dot);
  const sigHex = rest.slice(dot + 1);
  const expMs = Number(expStr);
  if (!Number.isInteger(expMs) || expMs <= Date.now() || expMs > Date.now() + TICKET_TTL_MS + 60_000) return false;
  const expected = Buffer.from(ticketSignature(expMs), 'hex');
  let actual: Buffer;
  try {
    actual = Buffer.from(sigHex, 'hex');
  } catch {
    return false;
  }
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Заголовок, которым клиент прикладывает тикет */
export const TICKET_HEADER = 'x-app-ticket';

// ============================== Guard для REST-роутов ==============================

/** Кэш «PIN включён?» (1 с TTL) — guard не должен ходить в БД на каждый запрос */
let pinEnabledCache: { value: boolean; at: number } | null = null;
export function resetSecurityCache(): void {
  pinEnabledCache = null;
  cachedAuthSecret = null;
}

async function pinEnabled(): Promise<boolean> {
  const now = Date.now();
  if (pinEnabledCache && now - pinEnabledCache.at < 1000) return pinEnabledCache.value;
  const value = await isPinEnabled();
  pinEnabledCache = { value, at: now };
  return value;
}

/**
 * Guard: если PIN включен — запрос обязан нести валидный тикет (x-app-ticket).
 * Бросает HttpError(401, code='pin_required') — клиент показывает экран ввода PIN.
 */
export async function requireTicket(req: NextRequest): Promise<void> {
  if (!(await pinEnabled())) return;
  const ticket = req.headers.get(TICKET_HEADER) ?? '';
  if (verifyEditorTicket(ticket)) return;
  throw new HttpError(401, 'Требуется PIN-код', 'pin_required');
}

// ============================== Смена PIN + файлы для мини-сервиса ==============================

/**
 * Записать состояние для WS-мини-сервиса:
 *  runtime-pin.json    { v: 1, enabled } — включен ли PIN (editor hello требует тикет)
 *  runtime-auth-secret ротируется при смене → старые тикеты недействительны
 */
function writePinState(enabled: boolean): void {
  try {
    writeFileSync(PIN_STATE_FILE, `${JSON.stringify({ v: 1, enabled })}\n`, { mode: 0o600 });
  } catch (err) {
    console.warn('[security] не удалось записать runtime-pin.json (WS-сервис будет думать, что PIN выключен):', err);
  }
}

/** Синхронизировать файл состояния с БД (вызывать после смены PIN) */
function syncPinState(): void {
  void readPinHash().then((hash) => writePinState(hash !== null));
}

/**
 * Установить/сменить/отключить PIN.
 *  - если PIN уже задан, требуется currentPin (scrypt-проверка + rate-limit снаружи);
 *  - newPin: строка 4–8 цифр → установка; null → отключение;
 *  - при успехе ротируется auth-секрет (все тикеты протухают, включая WS-редакторов).
 * Возвращает свежий тикет, чтобы пользователь не разлогинивался после смены PIN.
 */
export async function applyPinChange(newPin: string | null, currentPin?: string): Promise<{ ticket: string; expiresAt: number; enabled: boolean }> {
  const existing = await readPinHash();
  if (existing) {
    const current = typeof currentPin === 'string' ? currentPin : '';
    if (!current || !verifyPinEncoded(current, existing)) {
      throw new HttpError(401, 'Неверный текущий PIN-код', 'pin_invalid');
    }
  }
  if (newPin !== null && !isValidPinFormat(newPin)) {
    throw new HttpError(
      400,
      `PIN — от ${PIN_MIN_LEN} до ${PIN_MAX_LEN} цифр`,
      'pin_bad_format'
    );
  }
  const pinHash = newPin === null ? null : hashPin(newPin);
  await db.securityConfig.upsert({
    where: { id: 'default' },
    create: { id: 'default', pinHash },
    update: { pinHash },
  });
  // ротация секрета: старые тикеты (REST и WS) больше не работают
  try {
    const fresh = randomBytes(32).toString('hex');
    writeFileSync(AUTH_SECRET_FILE, `${fresh}\n`, { mode: 0o600 });
  } catch (err) {
    console.warn('[security] не удалось ротировать runtime-auth-secret:', err);
  }
  resetSecurityCache();
  cachedAuthSecret = null;
  writePinState(pinHash !== null);
  const enabled = pinHash !== null;
  // при отключенном PIN тикет не нужен, но выдадим всё равно (безвреден)
  const { ticket, expiresAt } = issueEditorTicket();
  return { ticket, expiresAt, enabled };
}

// при загрузке модуля синхронизируем файл состояния (первый запуск/перезапуск сервера)
syncPinState();

// ============================== Rate limit попыток ==============================

/**
 * Простые in-memory счётчики неудач (per-IP, окно). Процесс один — этого достаточно.
 * 10 неудач / 5 минут → HttpError(429) с оставшимся временем.
 */
const WINDOW_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 10;

const attempts = new Map<string, { count: number; resetAt: number }>();

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for');
  const first = fwd?.split(',')[0]?.trim();
  if (first) return first;
  return req.headers.get('x-real-ip')?.trim() || 'local';
}

/** Вызвать ПЕРЕД опасной проверкой: бросит 429, если лимит уже исчерпан */
export function checkPinAttemptLimit(req: NextRequest): void {
  const ip = clientIp(req);
  const now = Date.now();
  const rec = attempts.get(ip);
  if (rec && rec.resetAt > now && rec.count >= MAX_ATTEMPTS) {
    const waitSec = Math.ceil((rec.resetAt - now) / 1000);
    throw new HttpError(429, `Слишком много попыток. Подождите ${waitSec} c.`, 'rate_limited');
  }
}

/** Вызвать после НЕУДАЧНОЙ проверки PIN — фиксирует попытку */
export function recordFailedPinAttempt(req: NextRequest): void {
  const ip = clientIp(req);
  const now = Date.now();
  const rec = attempts.get(ip);
  if (!rec || rec.resetAt <= now) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  rec.count += 1;
  // чистка карты от устаревших записей, чтобы не текла
  if (attempts.size > 1000) {
    for (const [k, v] of attempts) if (v.resetAt <= now) attempts.delete(k);
  }
}

/** Успешный вход — сбрасывает счётчик для IP */
export function clearPinAttempts(req: NextRequest): void {
  attempts.delete(clientIp(req));
}
