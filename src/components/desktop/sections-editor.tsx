'use client';

/**
 * Центральная колонка: статистика (слова/время @wpm), список секций,
 * добавление и импорт. Состояние редактирования живёт в desktop-app.
 *
 * Вся прокручиваемая область с блоками текста — зона drag-and-drop:
 * брошенный сюда файл .txt / .md открывает диалог импорта с предзаполненным
 * текстом (перед созданием секций видно предпросмотр). Бросок мимо зоны
 * (на статистику, шапку и т.п.) не уводит браузер на файл — навигация
 * от перетаскивания блокируется на уровне окна.
 */

import * as React from 'react';
import { AlertTriangle, FileUp, Gauge, ListPlus, Plus, RefreshCw, Upload } from 'lucide-react';
import type { AiSubsectionDraft, ScriptData, ScriptSection } from '@/lib/types';
import { ApiClient } from '@/lib/client/api';
import { countWords, estimateSeconds, formatDuration } from '@/lib/text';
import { useToast } from '@/hooks/use-toast';
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

/** Допустимые к импорту файлы: обычный текст и markdown */
const IMPORT_FILE_RE = /\.(txt|md|markdown)$/i;
const IMPORT_MAX_BYTES = 5 * 1024 * 1024;

/** Это драг файлов (а не, например, выделенного текста)? */
function isFileDrag(e: React.DragEvent): boolean {
  return Array.from(e.dataTransfer?.types ?? []).includes('Files');
}

function importFileName(file: File): boolean {
  return IMPORT_FILE_RE.test(file.name) || file.type.startsWith('text/');
}

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
  const { toast } = useToast();
  const [importOpen, setImportOpen] = React.useState(false);
  /** текст из брошенного файла — им предзаполняется диалог импорта */
  const [importSeed, setImportSeed] = React.useState<string | null>(null);
  const [wpmOpen, setWpmOpen] = React.useState(false);
  const [wpmDraft, setWpmDraft] = React.useState(String(wpm));

  // ---------- drag-and-drop .txt/.md ----------
  const [dragActive, setDragActive] = React.useState(false);
  const dragDepth = React.useRef(0);

  // бросок файла в любом месте окна не должен уводить браузер на сам файл
  React.useEffect(() => {
    const swallow = (e: DragEvent) => {
      e.preventDefault();
    };
    window.addEventListener('dragover', swallow);
    window.addEventListener('drop', swallow);
    return () => {
      window.removeEventListener('dragover', swallow);
      window.removeEventListener('drop', swallow);
    };
  }, []);

  const handleDragEnter = (e: React.DragEvent) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    dragDepth.current += 1;
    setDragActive(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    if (!dragActive) setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!isFileDrag(e)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    dragDepth.current = 0;
    setDragActive(false);

    if (!script) {
      toast({
        title: 'Сначала выберите сценарий',
        description: 'Импорт добавляет секции в текущий сценарий — создайте или выберите его в списке слева.',
      });
      return;
    }

    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    if (!importFileName(file)) {
      toast({
        title: 'Этот файл не подойдёт',
        description: 'Поддерживаются текстовые файлы .txt и .md.',
        variant: 'destructive',
      });
      return;
    }
    if (file.size > IMPORT_MAX_BYTES) {
      toast({
        title: 'Файл слишком большой',
        description: 'Лимит — 5 МБ. Разбейте текст на части.',
        variant: 'destructive',
      });
      return;
    }

    file
      .text()
      .then((text) => {
        if (!text.trim()) {
          toast({ title: 'Файл пустой', description: 'Внутри нет текста для импорта.' });
          return;
        }
        setImportSeed(text);
        setImportOpen(true);
      })
      .catch(() => {
        toast({
          title: 'Не удалось прочитать файл',
          description: 'Проверьте, что файл не повреждён, и попробуйте ещё раз.',
          variant: 'destructive',
        });
      });
  };

  const openImport = () => {
    setImportSeed(null);
    setImportOpen(true);
  };

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

      {/* прокручиваемая область секций = зона drag-and-drop txt/md */}
      <div
        className={cn('relative flex-1 px-4 py-4 md:px-6 lg:min-h-0 lg:overflow-y-auto', THIN_SCROLL)}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
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
              Добавьте первую секцию и начните писать — всё сохранится автоматически. Или
              перетащите сюда файл .txt / .md.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={onAddSection}>
                <Plus className="size-4" />
                Добавить секцию
              </Button>
              <Button variant="outline" onClick={openImport}>
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
              <Button onClick={onAddSection}>
                <Plus className="size-4" />
                Добавить секцию
              </Button>
              <Button variant="outline" onClick={openImport}>
                <Upload className="size-4" />
                Импорт текста
              </Button>
            </div>
          </div>
        )}

        {/* оверлей «отпустите файл» */}
        {dragActive && (
          <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-background/80 p-6 backdrop-blur-[2px]">
            <div className="flex max-w-sm flex-col items-center gap-3 rounded-xl border-2 border-dashed border-primary/60 bg-primary/5 px-8 py-7 text-center shadow-lg">
              <FileUp className="size-8 text-primary" />
              <p className="text-sm font-semibold">Отпустите файл для импорта</p>
              <p className="text-xs text-muted-foreground">
                Поддерживаются .txt и .md — строки с «##» станут названиями секций
              </p>
            </div>
          </div>
        )}
      </div>

      <ImportDialog
        open={importOpen}
        onOpenChange={(o) => {
          setImportOpen(o);
          if (!o) setImportSeed(null);
        }}
        seed={importSeed}
        onImport={onImportSections}
      />
    </div>
  );
}
