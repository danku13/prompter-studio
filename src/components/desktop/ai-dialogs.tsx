'use client';

/**
 * Диалоги AI-помощника для секции:
 *  - AiImproveDialog  — улучшение текста (polish / shorten / expand / своя инструкция)
 *                       с видом «до → после» (пословная подсветка изменений) и
 *                       редактированием результата перед применением;
 *  - AiSplitDialog    — разбиение секции на подсекции с редактированием частей.
 *
 * Применение НЕ пишется в БД напрямую: колбэк родителя проводит правку через
 * штатный mutate редактора → автосохранение → ревизия → broadcast в суфлёр.
 * Возможность отменить применённую правку живёт в SectionCard (снапшот «до»).
 */

import * as React from 'react';
import { Columns2, Loader2, PenLine, Plus, Scissors, Sparkles, Trash2, Wand2 } from 'lucide-react';
import type { AiImproveMode, AiSubsectionDraft } from '@/lib/types';
import { ApiClient } from '@/lib/client/api';
import { diffWords, type DiffToken } from '@/lib/diff';
import { countWords, estimateSeconds, formatDuration } from '@/lib/text';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { errorMessage, plural, THIN_SCROLL } from './utils';

function ErrorNote({ message }: { message: string }) {
  return (
    <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-red-600 dark:text-red-400">
      {message}
    </p>
  );
}

// ================= Улучшение текста =================

/** Подсветка удалённых слов — колонка «было» */
const DEL_MARK =
  'rounded-sm bg-red-500/15 text-red-700 line-through decoration-red-500/50 dark:bg-red-500/20 dark:text-red-300';
/** Подсветка добавленных слов — колонка «стало» */
const ADD_MARK =
  'rounded-sm bg-emerald-500/15 font-medium text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300';

/** Поток diff с подсветкой; пробелы внутри атомов остаются вне подсветки */
function DiffStream({ tokens, side }: { tokens: DiffToken[]; side: 'before' | 'after' }) {
  return (
    <p className="whitespace-pre-wrap text-sm leading-relaxed">
      {tokens.map((t, i) => {
        const marked = (side === 'before' && t.op === 'del') || (side === 'after' && t.op === 'add');
        if (!marked) return <span key={i}>{t.text}</span>;
        const split = /^(.*?)(\s*)$/s.exec(t.text);
        const core = split ? split[1] : t.text;
        const tail = split ? split[2] : '';
        return (
          <span key={i}>
            {core ? <span className={side === 'before' ? DEL_MARK : ADD_MARK}>{core}</span> : null}
            {tail}
          </span>
        );
      })}
    </p>
  );
}

/** Колонка сравнения: «Было» или «Стало» */
function ComparePanel({
  label,
  words,
  seconds,
  tokens,
  side,
}: {
  label: string;
  words: number;
  seconds: number | null;
  tokens: DiffToken[];
  side: 'before' | 'after';
}) {
  return (
    <div className="min-w-0 rounded-lg border">
      <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-1.5">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className="text-xs tabular-nums text-muted-foreground">
          {words} {plural(words, 'слово', 'слова', 'слов')}
          {seconds !== null ? <> · ~{formatDuration(seconds)}</> : null}
        </span>
      </div>
      <div className="p-3">
        <DiffStream tokens={tokens} side={side} />
      </div>
    </div>
  );
}

const IMPROVE_MODES: { value: AiImproveMode; label: string; hint: string }[] = [
  { value: 'polish', label: 'Отшлифовать', hint: 'грамматика, стиль, ритм' },
  { value: 'shorten', label: 'Сократить', hint: '− треть объёма' },
  { value: 'expand', label: 'Расширить', hint: '×1,5 объёма' },
  { value: 'custom', label: 'Своя инструкция', hint: 'задайте сами' },
];

export interface AiImproveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  api: ApiClient;
  title: string;
  content: string;
  /** скорость речи — для оценки хронометража «до → после» */
  wpm?: number;
  /** применить результат (уже отредактированный пользователем) */
  onApply: (content: string) => void;
}

/** Режим показа результата AI: сравнение с оригиналом или редактирование */
type ResultView = 'compare' | 'edit';

export function AiImproveDialog({ open, onOpenChange, api, title, content, wpm, onApply }: AiImproveDialogProps) {
  const [mode, setMode] = React.useState<AiImproveMode>('polish');
  const [instruction, setInstruction] = React.useState('');
  const [result, setResult] = React.useState('');
  const [view, setView] = React.useState<ResultView>('compare');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setMode('polish');
    setInstruction('');
    setResult('');
    setView('compare');
    setError(null);
    setLoading(false);
  }, [open]);

  const canGenerate =
    content.trim().length > 0 && (mode !== 'custom' || instruction.trim().length > 0);

  const generate = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.aiImprove({
        title: title.trim() || undefined,
        content,
        mode,
        ...(mode === 'custom' ? { instruction: instruction.trim() } : {}),
      });
      setResult(res.content);
      setView('compare');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [api, title, content, mode, instruction]);

  const wordsBefore = countWords(content);
  const wordsAfter = countWords(result);

  // пословное сравнение «до → после» (результат ещё можно править — diff пересчитается)
  const diff = React.useMemo(() => (result ? diffWords(content, result) : null), [content, result]);
  const secBefore = wpm ? estimateSeconds(wordsBefore, wpm) : null;
  const secAfter = wpm ? estimateSeconds(wordsAfter, wpm) : null;
  const delta = wordsAfter - wordsBefore;
  const deltaPct = wordsBefore > 0 ? Math.round((delta / wordsBefore) * 100) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="size-4 text-primary" />
            Улучшить текст секции
            {title.trim() ? <span className="text-muted-foreground">· «{title.trim()}»</span> : null}
          </DialogTitle>
          <DialogDescription>
            AI предложит вариант — сравните его с исходным текстом, поправьте при желании и
            примените. После применения правку можно отменить прямо в карточке секции. Изменение
            сохранится и синхронизируется в суфлёр как обычная правка.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Что сделать</Label>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              {IMPROVE_MODES.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setMode(m.value)}
                  className={cn(
                    'flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-lg border px-2 py-1.5 text-center transition-colors',
                    mode === m.value
                      ? 'border-primary bg-primary/10'
                      : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                  )}
                >
                  <span className={cn('text-sm', mode === m.value && 'font-medium text-primary')}>
                    {m.label}
                  </span>
                  <span className="text-[11px] leading-tight opacity-70">{m.hint}</span>
                </button>
              ))}
            </div>
          </div>

          {mode === 'custom' && (
            <div className="space-y-1.5">
              <Label htmlFor="ai-instruction">Инструкция для AI</Label>
              <Input
                id="ai-instruction"
                autoFocus
                value={instruction}
                placeholder="Например: переписать в более живом и разговорном тоне, добавить обращение к зрителю"
                onChange={(e) => setInstruction(e.target.value)}
              />
            </div>
          )}

          <Button
            type="button"
            className="w-full"
            disabled={!canGenerate || loading}
            onClick={() => void generate()}
          >
            {loading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Генерирую…
              </>
            ) : (
              <>
                <Sparkles className="size-4" />
                {result ? 'Сгенерировать заново' : 'Сгенерировать'}
              </>
            )}
          </Button>

          {error && <ErrorNote message={error} />}

          {result && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label className="text-xs font-medium text-muted-foreground">
                  Результат — проверьте изменения перед применением
                </Label>
                <div
                  className="inline-flex items-center gap-0.5 rounded-lg border p-0.5"
                  role="tablist"
                  aria-label="Режим просмотра результата"
                >
                  {(
                    [
                      { v: 'compare', label: 'Сравнить', icon: Columns2 },
                      { v: 'edit', label: 'Править', icon: PenLine },
                    ] as const
                  ).map(({ v, label, icon: Icon }) => (
                    <button
                      key={v}
                      type="button"
                      role="tab"
                      aria-selected={view === v}
                      onClick={() => setView(v)}
                      className={cn(
                        'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                        view === v
                          ? 'bg-primary/15 text-primary'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <Icon className="size-3.5" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {view === 'compare' && diff ? (
                <>
                  <div className={cn('max-h-80 overflow-y-auto rounded-lg', THIN_SCROLL)}>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <ComparePanel
                        label="Было"
                        words={wordsBefore}
                        seconds={secBefore}
                        tokens={diff.before}
                        side="before"
                      />
                      <ComparePanel
                        label="Стало"
                        words={wordsAfter}
                        seconds={secAfter}
                        tokens={diff.after}
                        side="after"
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block size-2.5 rounded-sm bg-red-500/35" aria-hidden />
                      удалено
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block size-2.5 rounded-sm bg-emerald-500/35" aria-hidden />
                      добавлено
                    </span>
                    <span className="tabular-nums">
                      −{diff.removedWords} / +{diff.addedWords}{' '}
                      {plural(diff.removedWords + diff.addedWords, 'слово', 'слова', 'слов')}
                    </span>
                    {deltaPct !== null && delta !== 0 && (
                      <span
                        className={cn(
                          'font-medium tabular-nums',
                          delta < 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-primary'
                        )}
                      >
                        объём {delta > 0 ? '+' : '−'}
                        {Math.abs(deltaPct)}%
                      </span>
                    )}
                    {diff.fallback && <span>текст большой — без детальной подсветки</span>}
                  </div>
                </>
              ) : (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="ai-improve-result">
                      Результат{' '}
                      <span className="font-normal text-muted-foreground">
                        ({wordsBefore} → {wordsAfter} {plural(wordsAfter, 'слово', 'слова', 'слов')})
                      </span>
                    </Label>
                  </div>
                  <Textarea
                    id="ai-improve-result"
                    value={result}
                    onChange={(e) => setResult(e.target.value)}
                    className="min-h-44 resize-none"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            disabled={loading || !result.trim()}
            onClick={() => {
              onApply(result);
              onOpenChange(false);
            }}
          >
            Применить к секции
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ================= Разбиение на подсекции =================

const SPLIT_SIZES = [
  { value: 60, label: '~60 слов', hint: 'короткие дубли' },
  { value: 90, label: '~90 слов', hint: 'средние' },
  { value: 130, label: '~130 слов', hint: 'длинные' },
  { value: 180, label: '~180 слов', hint: 'очень длинные' },
] as const;

export interface AiSplitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  api: ApiClient;
  title: string;
  content: string;
  /** применить: секция заменяется списком подсекций */
  onApply: (parts: AiSubsectionDraft[]) => void;
}

export function AiSplitDialog({ open, onOpenChange, api, title, content, onApply }: AiSplitDialogProps) {
  const [maxWords, setMaxWords] = React.useState<number>(90);
  const [parts, setParts] = React.useState<AiSubsectionDraft[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setMaxWords(90);
    setParts(null);
    setError(null);
    setLoading(false);
  }, [open]);

  const generate = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.aiSplit({
        title: title.trim() || undefined,
        content,
        maxWords,
      });
      setParts(res.subsections);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [api, title, content, maxWords]);

  const patchPart = (index: number, patch: Partial<AiSubsectionDraft>) => {
    setParts((prev) => (prev ? prev.map((p, i) => (i === index ? { ...p, ...patch } : p)) : prev));
  };

  const removePart = (index: number) => {
    setParts((prev) => (prev ? prev.filter((_, i) => i !== index) : prev));
  };

  const addPart = () => {
    setParts((prev) => (prev ? [...prev, { title: '', content: '' }] : prev));
  };

  const validParts = (parts ?? []).filter((p) => p.content.trim().length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scissors className="size-4 text-primary" />
            Разбить секцию на подсекции
            {title.trim() ? <span className="text-muted-foreground">· «{title.trim()}»</span> : null}
          </DialogTitle>
          <DialogDescription>
            AI делит текст по смыслу, почти не переписывая его: так удобнее читать с суфлёра и
            перезаписывать отдельные дубли. Части можно отредактировать до применения.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Целевой размер подсекции</Label>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              {SPLIT_SIZES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setMaxWords(s.value)}
                  className={cn(
                    'flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-lg border px-2 py-1 transition-colors',
                    maxWords === s.value
                      ? 'border-primary bg-primary/10'
                      : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                  )}
                >
                  <span className={cn('text-sm', maxWords === s.value && 'font-medium text-primary')}>
                    {s.label}
                  </span>
                  <span className="text-[11px] leading-tight opacity-70">{s.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <Button
            type="button"
            className="w-full"
            disabled={content.trim().length === 0 || loading}
            onClick={() => void generate()}
          >
            {loading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Разбиваю…
              </>
            ) : (
              <>
                <Sparkles className="size-4" />
                {parts ? 'Разбить заново' : 'Разбить текст'}
              </>
            )}
          </Button>

          {error && <ErrorNote message={error} />}

          {parts && (
            <div className={cn('space-y-3', THIN_SCROLL)}>
              {parts.map((p, i) => (
                <div key={i} className="space-y-1.5 rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
                      {i + 1}.
                    </span>
                    <Input
                      value={p.title}
                      placeholder={`Заголовок подсекции ${i + 1}`}
                      onChange={(e) => patchPart(i, { title: e.target.value })}
                      className="h-8"
                    />
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {countWords(p.content)}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => removePart(i)}
                      title="Убрать часть"
                      disabled={parts.length <= 2}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                  <Textarea
                    value={p.content}
                    placeholder="Текст подсекции…"
                    onChange={(e) => patchPart(i, { content: e.target.value })}
                    className="min-h-20 resize-none text-sm"
                  />
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" className="w-full" onClick={addPart}>
                <Plus className="size-3.5" />
                Добавить часть вручную
              </Button>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            disabled={loading || validParts.length < 2}
            onClick={() => {
              onApply(validParts);
              onOpenChange(false);
            }}
          >
            <Scissors className="size-4" />
            Заменить секцию на {validParts.length}{' '}
            {plural(validParts.length, 'подсекцию', 'подсекции', 'подсекций')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
