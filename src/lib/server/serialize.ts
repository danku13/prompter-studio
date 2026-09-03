/**
 * Мапперы Prisma-моделей → контракты из src/lib/types.ts.
 * Ответы REST API должны совпадать с типами 1-в-1.
 */

import type { Script, Section, Take } from '@prisma/client';
import { countWords, estimateSeconds } from '@/lib/text';
import { SECTION_COLORS, type SectionColor, type ScriptData, type ScriptSection, type ScriptSummary, type TakeRating, type TakeRecord } from '@/lib/types';
import { READING_WPM } from './config';

const VALID_COLORS = new Set<string>(SECTION_COLORS);

function toColor(color: string): SectionColor {
  return (VALID_COLORS.has(color) ? color : 'default') as SectionColor;
}

function toRating(rating: string | null): TakeRating | null {
  return rating === 'good' || rating === 'ok' || rating === 'bad' ? rating : null;
}

export function serializeSection(section: Section): ScriptSection {
  return {
    id: section.id,
    title: section.title,
    content: section.content,
    color: toColor(section.color),
    orderIndex: section.orderIndex,
  };
}

/** ScriptData: секции по orderIndex asc */
export function serializeScript(script: Script & { sections: Section[] }): ScriptData {
  const sections = [...script.sections]
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map(serializeSection);
  return {
    id: script.id,
    title: script.title,
    revision: script.revision,
    sections,
    updatedAt: script.updatedAt.toISOString(),
  };
}

/** ScriptSummary: wordCount — сумма по секциям, estSeconds — при 140 сл/мин */
export function serializeSummary(script: Script & { sections: Section[] }): ScriptSummary {
  const wordCount = script.sections.reduce((sum, s) => sum + countWords(s.content), 0);
  return {
    id: script.id,
    title: script.title,
    revision: script.revision,
    sectionCount: script.sections.length,
    wordCount,
    estSeconds: estimateSeconds(wordCount, READING_WPM),
    updatedAt: script.updatedAt.toISOString(),
  };
}

export function serializeTake(take: Take): TakeRecord {
  return {
    id: take.id,
    scriptId: take.scriptId,
    sectionId: take.sectionId,
    sectionTitle: take.sectionTitle,
    t0: take.t0,
    t1: take.t1,
    durationMs: take.durationMs,
    rating: toRating(take.rating),
    createdAt: take.createdAt.toISOString(),
  };
}
