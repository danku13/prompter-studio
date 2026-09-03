/**
 * Zod-схемы тел запросов REST API.
 */

import { z } from 'zod';
import { SECTION_COLORS } from '@/lib/types';

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
