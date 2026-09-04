'use client';

/**
 * Карточка секции сценария: заголовок, цвет, порядок, дублирование,
 * удаление, авторастущий textarea и статистика слов/времени.
 */

import * as React from 'react';
import { ArrowDown, ArrowUp, Copy, Scissors, Sparkles, Trash2, Wand2 } from 'lucide-react';
import type { AiSubsectionDraft, ScriptSection } from '@/lib/types';
import { ApiClient } from '@/lib/client/api';
import { countWords, estimateSeconds, formatDuration } from '@/lib/text';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { SECTION_COLOR_DOT, SECTION_COLOR_EDGE, SECTION_COLOR_LABEL, SECTION_COLORS } from './colors';
import { AiImproveDialog, AiSplitDialog } from './ai-dialogs';
import { plural } from './utils';

export interface SectionCardProps {
  section: ScriptSection;
  index: number;
  total: number;
  wpm: number;
  /** REST-клиент для AI-диалогов */
  api: ApiClient;
  onChange: (patch: Partial<ScriptSection>) => void;
  onMove: (dir: -1 | 1) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  /** применить разбиение: секция заменяется подсекциями */
  onSplit: (parts: AiSubsectionDraft[]) => void;
}

export function SectionCard({
  section,
  index,
  total,
  wpm,
  api,
  onChange,
  onMove,
  onDuplicate,
  onRemove,
  onSplit,
}: SectionCardProps) {
  const [confirmRemove, setConfirmRemove] = React.useState(false);
  const [improveOpen, setImproveOpen] = React.useState(false);
  const [splitOpen, setSplitOpen] = React.useState(false);
  const taRef = React.useRef<HTMLTextAreaElement | null>(null);

  const words = countWords(section.content);
  const seconds = estimateSeconds(words, wpm);

  // авто-подгон высоты textarea (min-h-28 = 112px)
  React.useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(el.scrollHeight, 112)}px`;
  }, [section.content]);

  return (
    <Card className={cn('gap-2 border-l-4 py-3', SECTION_COLOR_EDGE[section.color])}>
      <div className="flex flex-wrap items-center gap-2 px-3">
        <Input
          value={section.title}
          placeholder="Название секции"
          onChange={(e) => onChange({ title: e.target.value })}
          className="h-8 min-w-32 flex-1 border-transparent bg-transparent px-2 font-medium shadow-none focus-visible:border-input dark:bg-transparent"
        />
        <div className="flex items-center gap-1.5 rounded-full border px-2.5 py-1">
          {SECTION_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              title={`Цвет: ${SECTION_COLOR_LABEL[c]}`}
              aria-label={`Цвет: ${SECTION_COLOR_LABEL[c]}`}
              onClick={() => onChange({ color: c })}
              className={cn(
                'size-3 rounded-full transition-transform hover:scale-125',
                SECTION_COLOR_DOT[c],
                section.color === c
                  ? 'ring-2 ring-foreground/70 ring-offset-2 ring-offset-card'
                  : 'opacity-60 hover:opacity-100'
              )}
            />
          ))}
        </div>
        <div className="flex items-center gap-0.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-amber-600 hover:bg-amber-500/10 hover:text-amber-600 dark:text-amber-400"
                title="AI-помощник: улучшить или разбить текст"
              >
                <Sparkles className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => setImproveOpen(true)}>
                <Wand2 className="size-4" />
                Улучшить текст…
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSplitOpen(true)}>
                <Scissors className="size-4" />
                Разбить на подсекции…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground"
            disabled={index === 0}
            onClick={() => onMove(-1)}
            title="Переместить выше"
          >
            <ArrowUp className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground"
            disabled={index === total - 1}
            onClick={() => onMove(1)}
            title="Переместить ниже"
          >
            <ArrowDown className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground"
            onClick={onDuplicate}
            title="Дублировать секцию"
          >
            <Copy className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setConfirmRemove(true)}
            title="Удалить секцию"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      <div className="px-3">
        <Textarea
          ref={taRef}
          value={section.content}
          placeholder="Текст секции…"
          onChange={(e) => onChange({ content: e.target.value })}
          className="min-h-28 resize-none border-transparent bg-transparent px-2 shadow-none focus-visible:border-input dark:bg-transparent"
        />
      </div>

      <div className="flex items-center justify-between px-4 text-xs tabular-nums text-muted-foreground">
        <span>Секция {index + 1}</span>
        <span>
          {words} {plural(words, 'слово', 'слова', 'слов')} • ~{formatDuration(seconds)}
        </span>
      </div>

      <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить секцию?</AlertDialogTitle>
            <AlertDialogDescription>
              «{section.title || 'Без названия'}» будет удалена вместе с текстом. Действие нельзя
              отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={onRemove}
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AI-диалоги: улучшение и разбиение */}
      <AiImproveDialog
        open={improveOpen}
        onOpenChange={setImproveOpen}
        api={api}
        title={section.title}
        content={section.content}
        onApply={(content) => onChange({ content })}
      />
      <AiSplitDialog
        open={splitOpen}
        onOpenChange={setSplitOpen}
        api={api}
        title={section.title}
        content={section.content}
        onApply={onSplit}
      />
    </Card>
  );
}
