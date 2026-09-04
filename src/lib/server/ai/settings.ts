/**
 * Хранилище BYOK-конфигурации AI (агент 5).
 * Единственная строка AiConfig (id='default') в SQLite.
 * Ключи наружу НЕ отдаются — только маски (keyHint).
 */

import type { AiConfig } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import type {
  AiProviderName,
  AiProviderView,
  AiSettingsUpdate,
  AiSettingsView,
} from '@/lib/types';
import { HttpError } from '../http';
import type { ProviderConfig } from './provider';

const ROW_ID = 'default';

const OPENAI_DEFAULTS = {
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
};

const ANTHROPIC_DEFAULTS = {
  baseUrl: 'https://api.anthropic.com',
  model: 'claude-sonnet-4-20250514',
};

function toProviderName(value: string): AiProviderName {
  return value === 'openai' || value === 'anthropic' ? value : 'builtin';
}

/** Читает строку конфигурации, при первом обращении создаёт с дефолтами */
export async function readAiConfig(): Promise<AiConfig> {
  const existing = await db.aiConfig.findUnique({ where: { id: ROW_ID } });
  if (existing) return existing;
  try {
    return await db.aiConfig.create({ data: { id: ROW_ID } });
  } catch {
    // гонка при одновременном создании строки — читаем победителя
    const row = await db.aiConfig.findUnique({ where: { id: ROW_ID } });
    if (row) return row;
    throw new HttpError(500, 'Не удалось прочитать настройки AI');
  }
}

function maskKey(key: string): string {
  const trimmed = key.trim();
  if (trimmed.length <= 8) return '••••';
  return `${trimmed.slice(0, 3)}…${trimmed.slice(-4)}`;
}

/** Эффективная конфигурация провайдера с учётом дефолтов */
export function providerConfig(row: AiConfig, provider: AiProviderName): ProviderConfig {
  if (provider === 'openai') {
    return {
      provider,
      apiKey: row.openaiKey?.trim() || null,
      baseUrl: row.openaiBaseUrl?.trim() || OPENAI_DEFAULTS.baseUrl,
      model: row.openaiModel?.trim() || OPENAI_DEFAULTS.model,
    };
  }
  if (provider === 'anthropic') {
    return {
      provider,
      apiKey: row.anthropicKey?.trim() || null,
      baseUrl: row.anthropicBaseUrl?.trim() || ANTHROPIC_DEFAULTS.baseUrl,
      model: row.anthropicModel?.trim() || ANTHROPIC_DEFAULTS.model,
    };
  }
  return { provider: 'builtin', apiKey: null, baseUrl: '', model: 'z-ai-builtin' };
}

function providerView(
  hasKey: boolean,
  key: string | null,
  baseUrl: string | null,
  model: string | null,
  defaults: { baseUrl: string; model: string }
): AiProviderView {
  return {
    hasKey,
    keyHint: key ? maskKey(key) : null,
    baseUrl: baseUrl?.trim() || defaults.baseUrl,
    model: model?.trim() || defaults.model,
  };
}

/** Представление для клиента: ключи замаскированы */
export function aiSettingsView(row: AiConfig): AiSettingsView {
  return {
    defaultProvider: toProviderName(row.defaultProvider),
    openai: providerView(
      Boolean(row.openaiKey?.trim()),
      row.openaiKey,
      row.openaiBaseUrl,
      row.openaiModel,
      OPENAI_DEFAULTS
    ),
    anthropic: providerView(
      Boolean(row.anthropicKey?.trim()),
      row.anthropicKey,
      row.anthropicBaseUrl,
      row.anthropicModel,
      ANTHROPIC_DEFAULTS
    ),
  };
}

/** Конфиг активного (или указанного) провайдера; для BYOK без ключа — 400 ai_not_configured */
export function resolveProviderConfig(row: AiConfig, provider?: AiProviderName): ProviderConfig {
  const target = provider ?? toProviderName(row.defaultProvider);
  const cfg = providerConfig(row, target);
  if (target !== 'builtin' && !cfg.apiKey) {
    throw new HttpError(
      400,
      `API-ключ для ${target === 'openai' ? 'OpenAI' : 'Claude'} не настроен. Откройте «Настройки AI» (иконка ✦ в шапке) и добавьте ключ, либо выберите встроенный провайдер.`,
      'ai_not_configured'
    );
  }
  return cfg;
}

/**
 * Частичное обновление настроек.
 * key: undefined — не менять; null/'' — стереть; строка — записать.
 */
export async function updateAiConfig(update: AiSettingsUpdate): Promise<AiConfig> {
  const row = await readAiConfig();
  const data: Prisma.AiConfigUpdateInput = {};

  if (update.defaultProvider) data.defaultProvider = update.defaultProvider;

  if (update.openai) {
    const { key, baseUrl, model } = update.openai;
    if (key !== undefined) data.openaiKey = key?.trim() || null;
    if (baseUrl !== undefined) data.openaiBaseUrl = baseUrl.trim() || null;
    if (model !== undefined) data.openaiModel = model.trim() || null;
  }
  if (update.anthropic) {
    const { key, baseUrl, model } = update.anthropic;
    if (key !== undefined) data.anthropicKey = key?.trim() || null;
    if (baseUrl !== undefined) data.anthropicBaseUrl = baseUrl.trim() || null;
    if (model !== undefined) data.anthropicModel = model.trim() || null;
  }

  return db.aiConfig.update({ where: { id: row.id }, data });
}
