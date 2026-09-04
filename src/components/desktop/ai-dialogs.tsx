'use client';

/**
 * Диалоги AI-помощника для секции (агент 5):
 *  - AiImproveDialog  — улучшение текста (polish / shorten / expand / своя инструкция),
 *                       результат можно отредактировать перед применением;
 *  - AiSplitDialog    — разбиение секции на подсекции с редактированием частей.
 *
 * Применение НЕ пишется в БД напрямую: колбэк родителя проводит правку через
 * штатный mutate редактора → автосохранение → ревизия → broadcast в суфлёр.
 */

import * as React from 'react';
import { Loader2, Plus, Scissors, Sparkles, Trash2, Wand2 } from 'lucide-react';
import type { AiImproveMode, AiSubsectionDraft } from '@/lib/types';
import { ApiClient } from '@/lib/client/api';
import { countWords } from '@/lib/text';
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
  /** применить результат (уже отредактированный пользователем) */
  onApply: (content: string) => void;
}

export function AiImproveDialog({ open, onOpenChange, api, title, content, onApply }: AiImproveDialogProps) {
  const [mode, setMode] = React.useState<AiImproveMode>('polish');
  const [instruction, setInstruction] = React.useState('');
  const [result, setResult] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setMode('polish');
    setInstruction('');
    setResult('');
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
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [api, title, content, mode, instruction]);

  const wordsBefore = countWords(content);
  const wordsAfter = countWords(result);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="size-4 text-amber-500" />
            Улучшить текст секции
            {title.trim() ? <span className="text-muted-foreground">· «{title.trim()}»</span> : null}
          </DialogTitle>
          <DialogDescription>
            AI предложит вариант — вы сможете отредактировать его перед применением. Изменение
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
                      ? 'border-amber-500 bg-amber-500/10'
                      : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                  )}
                >
                  <span className={cn('text-sm', mode === m.value && 'font-medium text-amber-700 dark:text-amber-400')}>
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
            className="w-full bg-amber-500 text-white hover:bg-amber-600"
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

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            className="bg-amber-500 text-white hover:bg-amber-600"
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
            <Scissors className="size-4 text-amber-500" />
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
                      ? 'border-amber-500 bg-amber-500/10'
                      : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                  )}
                >
                  <span className={cn('text-sm', maxWords === s.value && 'font-medium text-amber-700 dark:text-amber-400')}>
                    {s.label}
                  </span>
                  <span className="text-[11px] leading-tight opacity-70">{s.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <Button
            type="button"
            className="w-full bg-amber-500 text-white hover:bg-amber-600"
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
            className="bg-amber-500 text-white hover:bg-amber-600"
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
