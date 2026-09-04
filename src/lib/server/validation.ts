/**
 * Zod-схемы тел запросов REST API.
 */

import { z } from 'zod';
import { AI_PROVIDERS, SECTION_COLORS } from '@/lib/types';

/**
 * Лимиты размеров (аудит безопасности 2026-09): без них неаутентифицированный
 * запрос мог положить в БД/память произвольно большие строки (DoS/биллинг).
 * Значения с запасом выше легитимных сценариев (импорт файла — до 5 МБ).
 */
const MAX_TITLE = 1_000;
const MAX_CONTENT = 6_000_000; // ≥ 5 МБ текста в UTF-8 (лимит импорта файла)
const MAX_SECTIONS = 2_000;
const MAX_ID = 64;
const MAX_AI_CONTENT = 200_000; // AI-функции: ~80k токенов — за пределами разумного
const MAX_INSTRUCTION = 4_000;
const MAX_KEY = 500;
const MAX_MODEL = 200;
const MAX_BASE_URL = 2_000;

/** Секция, присылаемая клиентом при сохранении (orderIndex опционален → возьмём позицию в массиве) */
export const sectionDraftSchema = z.object({
  id: z.string().max(MAX_ID).optional(),
  title: z.string().max(MAX_TITLE),
  content: z.string().max(MAX_CONTENT),
  color: z.enum(SECTION_COLORS),
  orderIndex: z.number().int().optional(),
});

export type SectionDraftInput = z.infer<typeof sectionDraftSchema>;

/** PUT /api/scripts/:id */
export const saveScriptSchema = z.object({
  title: z.string().max(MAX_TITLE),
  sections: z.array(sectionDraftSchema).max(MAX_SECTIONS),
  baseRevision: z.number().int(),
});

/** POST /api/scripts { title? } */
export const createScriptSchema = z.object({
  title: z.string().max(MAX_TITLE).optional(),
});

/** POST /api/pair { scriptId } */
export const pairCreateSchema = z.object({
  scriptId: z.string().min(1).max(MAX_ID),
});

/** POST /api/takes (вызывает WS-мини-сервис) */
export const takeCreateSchema = z.object({
  token: z.string().min(1).max(MAX_ID),
  sectionId: z.string().min(1).max(MAX_ID),
  sectionTitle: z.string().max(MAX_TITLE),
  t0: z.number().int(),
  t1: z.number().int(),
});

/** PATCH /api/takes/:id */
export const takeRatingSchema = z.object({
  rating: z.enum(['good', 'ok', 'bad']).nullable(),
});

// ================= AI (BYOK) =================

const aiProviderEnum = z.enum(AI_PROVIDERS);
const aiBaseUrl = z
  .string()
  .trim()
  .max(MAX_BASE_URL)
  .regex(/^https?:\/\//, 'Base URL должен начинаться с http:// или https://');

const aiProviderUpdateSchema = z.object({
  /** undefined — не менять; null/'' — стереть; непустая строка — новое значение */
  key: z.string().max(MAX_KEY).nullable().optional(),
  baseUrl: aiBaseUrl.optional(),
  model: z.string().trim().min(1).max(MAX_MODEL).optional(),
});

/** PUT /api/ai/settings */
export const aiSettingsSchema = z.object({
  defaultProvider: aiProviderEnum.optional(),
  openai: aiProviderUpdateSchema.optional(),
  anthropic: aiProviderUpdateSchema.optional(),
});

/** POST /api/ai/test — ключ/base/model можно передать инлайн (проверка до сохранения) */
export const aiTestSchema = z.object({
  provider: aiProviderEnum.optional(),
  key: z.string().max(MAX_KEY).optional(),
  baseUrl: aiBaseUrl.optional(),
  model: z.string().trim().min(1).max(MAX_MODEL).optional(),
});

/** POST /api/ai/improve */
export const aiImproveSchema = z
  .object({
    title: z.string().max(MAX_TITLE).optional(),
    content: z.string().min(1).max(MAX_AI_CONTENT),
    mode: z.enum(['polish', 'shorten', 'expand', 'custom']),
    instruction: z.string().max(MAX_INSTRUCTION).optional(),
  })
  .refine((v) => v.mode !== 'custom' || (v.instruction ?? '').trim().length > 0, {
    path: ['instruction'],
  });

/** POST /api/ai/split */
export const aiSplitSchema = z.object({
  title: z.string().max(MAX_TITLE).optional(),
  content: z.string().min(1).max(MAX_AI_CONTENT),
  maxWords: z.number().int().min(20).max(1000).optional(),
});
