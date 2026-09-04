/**
 * Zod-схемы тел запросов REST API.
 */

import { z } from 'zod';
import { AI_PROVIDERS, SECTION_COLORS } from '@/lib/types';

/** Секция, присылаемая клиентом при сохранении (orderIndex опционален → возьмём позицию в массиве) */
export const sectionDraftSchema = z.object({
  id: z.string().optional(),
  title: z.string(),
  content: z.string(),
  color: z.enum(SECTION_COLORS),
  orderIndex: z.number().int().optional(),
});

export type SectionDraftInput = z.infer<typeof sectionDraftSchema>;

/** PUT /api/scripts/:id */
export const saveScriptSchema = z.object({
  title: z.string(),
  sections: z.array(sectionDraftSchema),
  baseRevision: z.number().int(),
});

/** POST /api/scripts { title? } */
export const createScriptSchema = z.object({
  title: z.string().optional(),
});

/** POST /api/pair { scriptId } */
export const pairCreateSchema = z.object({
  scriptId: z.string().min(1),
});

/** POST /api/takes (вызывает WS-мини-сервис) */
export const takeCreateSchema = z.object({
  token: z.string().min(1),
  sectionId: z.string().min(1),
  sectionTitle: z.string(),
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
  .regex(/^https?:\/\//, 'Base URL должен начинаться с http:// или https://');

const aiProviderUpdateSchema = z.object({
  /** undefined — не менять; null/'' — стереть; непустая строка — новое значение */
  key: z.string().nullable().optional(),
  baseUrl: aiBaseUrl.optional(),
  model: z.string().trim().min(1).optional(),
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
  key: z.string().optional(),
  baseUrl: aiBaseUrl.optional(),
  model: z.string().trim().min(1).optional(),
});

/** POST /api/ai/improve */
export const aiImproveSchema = z
  .object({
    title: z.string().optional(),
    content: z.string().min(1),
    mode: z.enum(['polish', 'shorten', 'expand', 'custom']),
    instruction: z.string().optional(),
  })
  .refine((v) => v.mode !== 'custom' || (v.instruction ?? '').trim().length > 0, {
    path: ['instruction'],
  });

/** POST /api/ai/split */
export const aiSplitSchema = z.object({
  title: z.string().optional(),
  content: z.string().min(1),
  maxWords: z.number().int().min(20).max(1000).optional(),
});
