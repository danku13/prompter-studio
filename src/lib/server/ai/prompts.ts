/**
 * Промпты AI-помощника (агент 5): улучшение текста секции и разбиение на подсекции.
 * Требования Prompter Studio: текст читается ВСЛУХ с телесуфлёра, поэтому
 * улучшения сохраняют устный ритм, а разбиение не переписывает текст.
 */

import type { AiImproveMode, AiSubsectionDraft } from '@/lib/types';
import { HttpError } from '../http';

const IMPROVE_SYSTEM = `Ты — профессиональный редактор текстов для видеосъёмки. Текст будет зачитываться вслух с телесуфлёра.
Правила ответа:
- Отвечай ТОЛЬКО готовым текстом: без комментариев, пояснений, кавычек и заголовков.
- Сохрани язык оригинала (обычно русский).
- Никакой markdown-разметки, списков и эмодзи — только связный устный текст.
- Держи разговорный ритм устной речи: короткие фразы, естественный порядок слов.`;

const MODE_RULES: Record<Exclude<AiImproveMode, 'custom'>, string> = {
  polish:
    'Задача: отшлифуй текст. Исправь грамматику и пунктуацию, убери канцелярит, повторы и слова-паразиты, выровняй ритм устной речи. Смысл и примерный объём сохрани.',
  shorten:
    'Задача: сократи текст примерно на треть. Убери воду, повторы и второстепенные отступления. Все ключевые мысли и их порядок сохрани.',
  expand:
    'Задача: расширь текст примерно в полтора раза. Добавь живые детали, короткие примеры и пояснения, сохранив стиль, тон и структуру исходного текста.',
};

/** Грубая оценка токенов (для русского ≈ 2.5 символа/токен) */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 2.5) + 64;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

export interface BuiltPrompt {
  system: string;
  user: string;
  maxTokens: number;
}

export function buildImprovePrompt(
  title: string | undefined,
  content: string,
  mode: AiImproveMode,
  instruction: string | undefined
): BuiltPrompt {
  const base = estimateTokens(content);
  let modeRule: string;
  let maxTokens: number;

  if (mode === 'custom') {
    const clean = (instruction ?? '').trim();
    if (!clean) {
      throw new HttpError(400, 'Для своего режима улучшения задайте инструкцию');
    }
    modeRule = `Задача: примени к тексту инструкцию пользователя: «${clean}»`;
    maxTokens = clamp(base * 3 + 512, 1024, 8000);
  } else {
    modeRule = MODE_RULES[mode];
    maxTokens = clamp(
      Math.round(base * (mode === 'expand' ? 2.5 : mode === 'shorten' ? 1.2 : 1.5)) + 256,
      1024,
      8000
    );
  }

  const system = `${IMPROVE_SYSTEM}\n${modeRule}`;
  const header = title?.trim() ? `Название секции: «${title.trim()}»\n\n` : '';
  return {
    system,
    user: `${header}Текст:\n${content}`,
    maxTokens,
  };
}

export function buildSplitPrompt(
  title: string | undefined,
  content: string,
  maxWords: number
): BuiltPrompt {
  const system = `Ты — редактор телесуфлёра. Разбиваешь один длинный текст на последовательные подсекции, чтобы диктору было удобно читать и перезаписывать дубли.
Правила:
- НЕ переписывай текст: сохраняй формулировки дословно, допустимы только минимальные правки на стыках (обрезка фразы, связка).
- Разбивай по смыслу: одна законченная мысль — одна подсекция.
- Заголовок подсекции: 1–4 слова, отражающих суть фрагмента.
- Текст подсекции: связная устная речь, без markdown, списков и эмодзи.
- Верни ответ СТРОГО в формате JSON: массив объектов [{"title": "...", "content": "..."}] и ничего больше. Без тройных обратных кавычек.`;

  const header = title?.trim() ? `Название исходной секции: «${title.trim()}»\n\n` : '';
  const user = `${header}Целевой размер каждой подсекции: около ${maxWords} слов (можно немного больше или меньше — важнее смысловые границы).\n\nТекст:\n${content}`;

  return {
    system,
    user,
    maxTokens: clamp(Math.round(estimateTokens(content) * 1.5) + 1024, 1024, 8000),
  };
}

/** Ответ модели → массив подсекций; с валидацией и человекочитаемыми ошибками */
export function parseSplitResponse(raw: string): AiSubsectionDraft[] {
  let text = raw.trim();
  // срезаем ```json ... ``` ограждения, если модель их добавила
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(text);
  if (fence) text = fence[1].trim();

  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) {
    throw new HttpError(
      502,
      'AI вернул ответ не в ожидаемом формате (нет JSON-массива). Попробуйте ещё раз.'
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new HttpError(502, 'Не удалось разобрать JSON от AI. Попробуйте ещё раз.');
  }

  if (!Array.isArray(parsed)) {
    throw new HttpError(502, 'AI вернул не массив подсекций. Попробуйте ещё раз.');
  }

  const subsections: AiSubsectionDraft[] = [];
  for (const item of parsed) {
    if (typeof item !== 'object' || item === null) continue;
    const obj = item as Record<string, unknown>;
    const title = typeof obj.title === 'string' ? obj.title.trim() : '';
    const content = typeof obj.content === 'string' ? obj.content.trim() : '';
    if (content) subsections.push({ title, content });
  }

  if (subsections.length < 2) {
    throw new HttpError(
      502,
      'AI предложил меньше двух подсекций. Уменьшите целевой размер подсекции и попробуйте ещё раз.'
    );
  }
  if (subsections.length > 60) {
    throw new HttpError(502, 'AI предложил слишком много подсекций. Увеличьте целевой размер.');
  }
  return subsections;
}
