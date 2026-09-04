'use client';

/**
 * Центральная колонка: статистика (слова/время @wpm), список секций,
 * добавление и импорт. Состояние редактирования живёт в desktop-app.
 */

import * as React from 'react';
import { AlertTriangle, Gauge, ListPlus, Plus, RefreshCw, Upload } from 'lucide-react';
import type { AiSubsectionDraft, ScriptData, ScriptSection } from '@/lib/types';
import { ApiClient } from '@/lib/client/api';
import { countWords, estimateSeconds, formatDuration } from '@/lib/text';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { SectionCard } from './section-card';
import { ImportDialog, type ImportedSection } from './import-dialog';
import { THIN_SCROLL, plural } from './utils';

export interface SectionsEditorProps {
  script: ScriptData | null;
  loading: boolean;
  error: string | null;
  wpm: number;
  /** REST-клиент для AI-диалогов секций */
  api: ApiClient;
  onWpmChange: (wpm: number) => void;
  onTitleChange: (title: string) => void;
  onSectionChange: (id: string, patch: Partial<ScriptSection>) => void;
  onMoveSection: (index: number, dir: -1 | 1) => void;
  onDuplicateSection: (index: number) => void;
  onRemoveSection: (index: number) => void;
  onAddSection: () => void;
  /** заменить секцию по индексу на подсекции (AI-разбиение) */
  onSplitSection: (index: number, parts: AiSubsectionDraft[]) => void;
  onImportSections: (sections: ImportedSection[]) => void;
  onRetryLoad: () => void;
}

export function SectionsEditor({
  script,
  loading,
  error,
  wpm,
  api,
  onWpmChange,
  onTitleChange,
  onSectionChange,
  onMoveSection,
  onDuplicateSection,
  onRemoveSection,
  onAddSection,
  onSplitSection,
  onImportSections,
  onRetryLoad,
}: SectionsEditorProps) {
  const [importOpen, setImportOpen] = React.useState(false);
  const [wpmOpen, setWpmOpen] = React.useState(false);
  const [wpmDraft, setWpmDraft] = React.useState(String(wpm));

  React.useEffect(() => {
    if (wpmOpen) setWpmDraft(String(wpm));
  }, [wpmOpen, wpm]);

  const sections = script?.sections ?? [];
  const words = sections.reduce((sum, s) => sum + countWords(s.content), 0);
  const seconds = estimateSeconds(words, wpm);

  const applyWpm = () => {
    const v = Number(wpmDraft);
    if (Number.isFinite(v) && v >= 60 && v <= 400) onWpmChange(Math.round(v));
    setWpmOpen(false);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* статистика-бар */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b bg-background px-4 py-2.5 md:px-6">
        <Input
          value={script?.title ?? ''}
          placeholder="Название сценария"
          disabled={!script}
          onChange={(e) => onTitleChange(e.target.value)}
          className="h-8 w-full min-w-40 flex-none border-transparent bg-transparent px-1 text-base font-semibold shadow-none focus-visible:border-input dark:bg-transparent sm:w-auto sm:flex-1"
        />
        {script && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground sm:gap-x-3">
            <span className="tabular-nums">
              {sections.length} {plural(sections.length, 'секция', 'секции', 'секций')}
            </span>
            <span className="hidden text-muted-foreground/40 sm:inline">•</span>
            <span className="tabular-nums">
              {words} {plural(words, 'слово', 'слова', 'слов')}
            </span>
            <span className="hidden text-muted-foreground/40 sm:inline">•</span>
            <span className="tabular-nums">~{formatDuration(seconds)}</span>
            <Popover open={wpmOpen} onOpenChange={setWpmOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
                  title="Скорость речи — настроить"
                >
                  <Gauge className="size-3.5" />
                  {wpm} слов/мин
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64" align="end">
                <Label className="text-xs text-muted-foreground">
                  Скорость речи, слов в минуту
                </Label>
                <div className="mt-2 flex items-center gap-2">
                  <Input
                    autoFocus
                    type="number"
                    min={60}
                    max={400}
                    value={wpmDraft}
                    onChange={(e) => setWpmDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') applyWpm();
                      if (e.key === 'Escape') setWpmOpen(false);
                    }}
                    className="h-8"
                  />
                  <Button size="sm" className="h-8" onClick={applyWpm}>
                    ОК
                  </Button>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Средняя речь — 130–160 слов в минуту. Влияет на оценку хронометража.
                </p>
              </PopoverContent>
            </Popover>
          </div>
        )}
      </div>

      {/* прокручиваемая область секций */}
      <div className={cn('flex-1 px-4 py-4 md:px-6 lg:min-h-0 lg:overflow-y-auto', THIN_SCROLL)}>
        {loading && (
          <div className="mx-auto max-w-3xl space-y-4">
            <Skeleton className="h-40 rounded-xl" />
            <Skeleton className="h-40 rounded-xl" />
            <Skeleton className="h-40 rounded-xl" />
          </div>
        )}

        {!loading && error !== null && (
          <Alert variant="destructive" className="mx-auto max-w-3xl">
            <AlertTriangle className="size-4" />
            <AlertTitle>Не удалось загрузить сценарий</AlertTitle>
            <AlertDescription className="flex flex-col items-start gap-2">
              <span>{error}</span>
              <Button variant="outline" size="sm" onClick={onRetryLoad}>
                <RefreshCw className="size-3.5" />
                Повторить
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {!loading && error === null && !script && (
          <div className="mx-auto flex h-full max-w-3xl flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-8 text-center">
            <ListPlus className="size-8 text-muted-foreground/50" />
            <p className="text-sm font-medium">Сценарий не выбран</p>
            <p className="max-w-64 text-xs text-muted-foreground">
              Выберите сценарий в списке слева или создайте новый.
            </p>
          </div>
        )}

        {!loading && error === null && script && sections.length === 0 && (
          <div className="mx-auto flex h-full max-w-3xl flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-8 text-center">
            <ListPlus className="size-8 text-muted-foreground/50" />
            <p className="text-sm font-medium">В сценарии пока нет секций</p>
            <p className="max-w-72 text-xs text-muted-foreground">
              Добавьте первую секцию и начните писать — всё сохранится автоматически.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button className="bg-amber-500 text-white hover:bg-amber-600" onClick={onAddSection}>
                <Plus className="size-4" />
                Добавить секцию
              </Button>
              <Button variant="outline" onClick={() => setImportOpen(true)}>
                <Upload className="size-4" />
                Импорт текста
              </Button>
            </div>
          </div>
        )}

        {!loading && error === null && script && sections.length > 0 && (
          <div className="mx-auto flex max-w-3xl flex-col gap-4">
            {sections.map((s, i) => (
              <SectionCard
                key={s.id}
                section={s}
                index={i}
                total={sections.length}
                wpm={wpm}
                api={api}
                onChange={(patch) => onSectionChange(s.id, patch)}
                onMove={(dir) => onMoveSection(i, dir)}
                onDuplicate={() => onDuplicateSection(i)}
                onRemove={() => onRemoveSection(i)}
                onSplit={(parts) => onSplitSection(i, parts)}
              />
            ))}
            <div className="flex flex-wrap items-center gap-2 pt-1 pb-6">
              <Button className="bg-amber-500 text-white hover:bg-amber-600" onClick={onAddSection}>
                <Plus className="size-4" />
                Добавить секцию
              </Button>
              <Button variant="outline" onClick={() => setImportOpen(true)}>
                <Upload className="size-4" />
                Импорт текста
              </Button>
            </div>
          </div>
        )}
      </div>

      <ImportDialog open={importOpen} onOpenChange={setImportOpen} onImport={onImportSections} />
    </div>
  );
}
