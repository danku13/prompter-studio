'use client';

/**
 * Prompter Studio — десктоп-редактор сценария (агент 2-a).
 *
 * Оркестрирует: список сценариев, активный сценарий + автосохранение
 * (debounce 800ms, конфликты ревизий 409), WS-синхронизацию (устройства,
 * дубли, push сценария с другого редактора), сопряжение телефона и экспорт.
 */

import * as React from 'react';
import {
  Clapperboard,
  Cloud,
  CloudOff,
  FileDown,
  FileText,
  Loader2,
  MoreHorizontal,
  PanelLeft,
  PanelRight,
  Smartphone,
  WifiOff,
} from 'lucide-react';
import { ApiClient, ApiError } from '@/lib/client/api';
import { useEditorSync } from '@/lib/client/use-sync';
import type { ScriptData, ScriptSection, ScriptSummary, TakeRating, TakeRecord } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { PairDialog } from './pair-dialog';
import { ScriptSidebar } from './script-sidebar';
import { SectionsEditor } from './sections-editor';
import { SyncPanel } from './sync-panel';
import type { ImportedSection } from './import-dialog';
import {
  buildExportText,
  delay,
  downloadBlob,
  errorMessage,
  sanitizeFilename,
  toDrafts,
  uid,
} from './utils';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const ACTIVE_SCRIPT_KEY = 'ps.activeScript';
const WPM_KEY = 'ps.wpm';
const SAVE_DEBOUNCE_MS = 800;

function readStoredWpm(): number {
  try {
    const v = Number(window.localStorage.getItem(WPM_KEY));
    if (Number.isFinite(v) && v >= 60 && v <= 400) return Math.round(v);
  } catch {
    /* приватный режим */
  }
  return 140;
}

/** Индикатор статуса автосохранения в шапке */
function SaveStatus({
  status,
  savedAt,
  onRetry,
}: {
  status: SaveState;
  savedAt: Date | null;
  onRetry: () => void;
}) {
  if (status === 'saving') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        Сохранение…
      </span>
    );
  }
  if (status === 'error') {
    return (
      <button
        type="button"
        onClick={onRetry}
        title="Повторить сохранение"
        className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 dark:hover:bg-red-950/40"
      >
        <CloudOff className="size-3.5" />
        Не сохранено — повторить
      </button>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Cloud className={cn('size-3.5', status === 'saved' ? 'text-emerald-600' : 'opacity-50')} />
      {status === 'saved' && savedAt
        ? `Сохранено ${savedAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`
        : 'Все изменения сохранены'}
    </span>
  );
}

export default function DesktopApp() {
  const api = React.useMemo(() => new ApiClient(), []);
  const { toast } = useToast();

  // ---------- список сценариев ----------
  const [scripts, setScripts] = React.useState<ScriptSummary[] | null>(null);
  const [listError, setListError] = React.useState<string | null>(null);
  const [listTick, setListTick] = React.useState(0);

  // ---------- активный сценарий ----------
  const [activeScriptId, setActiveScriptId] = React.useState<string | null>(null);
  const [script, setScript] = React.useState<ScriptData | null>(null);
  const [scriptLoading, setScriptLoading] = React.useState(false);
  const [scriptError, setScriptError] = React.useState<string | null>(null);
  const [scriptLoadTick, setScriptLoadTick] = React.useState(0);

  // ---------- автосохранение ----------
  const [editTick, setEditTick] = React.useState(0);
  const [saveStatus, setSaveStatus] = React.useState<SaveState>('idle');
  const [savedAt, setSavedAt] = React.useState<Date | null>(null);

  // ---------- прочее ----------
  const [wpm, setWpm] = React.useState(140);
  const [pairOpen, setPairOpen] = React.useState(false);
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [panelOpen, setPanelOpen] = React.useState(false);
  /** оптимистичные правки дублей поверх sync.takes (null = удалён) */
  const [takeOverrides, setTakeOverrides] = React.useState<Record<string, TakeRecord | null>>({});

  const sync = useEditorSync(api, activeScriptId);

  // refs с актуальными значениями для асинхронных колбэков
  const scriptRef = React.useRef<ScriptData | null>(null);
  const activeIdRef = React.useRef<string | null>(null);
  const tickRef = React.useRef(0);
  const inFlightRef = React.useRef(false);

  React.useEffect(() => {
    activeIdRef.current = activeScriptId;
  }, [activeScriptId]);
  React.useEffect(() => {
    tickRef.current = editTick;
  }, [editTick]);

  const applyLocalScript = React.useCallback((next: ScriptData | null) => {
    scriptRef.current = next;
    setScript(next);
  }, []);

  // ---------- localStorage: активный сценарий + wpm ----------
  React.useEffect(() => {
    try {
      const saved = window.localStorage.getItem(ACTIVE_SCRIPT_KEY);
      if (saved) setActiveScriptId(saved);
    } catch {
      /* приватный режим */
    }
    setWpm(readStoredWpm());
  }, []);

  React.useEffect(() => {
    try {
      if (activeScriptId) window.localStorage.setItem(ACTIVE_SCRIPT_KEY, activeScriptId);
      else window.localStorage.removeItem(ACTIVE_SCRIPT_KEY);
    } catch {
      /* приватный режим */
    }
  }, [activeScriptId]);

  const changeWpm = React.useCallback((v: number) => {
    setWpm(v);
    try {
      window.localStorage.setItem(WPM_KEY, String(v));
    } catch {
      /* приватный режим */
    }
  }, []);

  // ---------- загрузка списка ----------
  const refreshScripts = React.useCallback(async () => {
    try {
      setScripts(await api.listScripts());
      setListError(null);
    } catch {
      /* тихо: обновится при следующем успешном запросе */
    }
  }, [api]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setListError(null);
      try {
        const list = await api.listScripts();
        if (cancelled) return;
        setScripts(list);
        setActiveScriptId((cur) => {
          if (cur && list.some((s) => s.id === cur)) return cur;
          return list[0]?.id ?? null;
        });
      } catch (e) {
        if (cancelled) return;
        setScripts([]);
        setListError(errorMessage(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, listTick]);

  // ---------- загрузка активного сценария ----------
  React.useEffect(() => {
    if (!activeScriptId) {
      applyLocalScript(null);
      setScriptError(null);
      setScriptLoading(false);
      return;
    }
    let cancelled = false;
    setScriptLoading(true);
    setScriptError(null);
    api.getScript(activeScriptId).then(
      (data) => {
        if (cancelled) return;
        applyLocalScript(data);
        setEditTick(0);
        setSaveStatus('idle');
        setScriptLoading(false);
      },
      (e: unknown) => {
        if (cancelled) return;
        applyLocalScript(null);
        setScriptError(errorMessage(e));
        setScriptLoading(false);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [activeScriptId, api, applyLocalScript, scriptLoadTick]);

  // сброс оптимистичных дублей при смене сценария
  React.useEffect(() => {
    setTakeOverrides({});
  }, [activeScriptId]);

  const reloadScript = React.useCallback(
    async (id: string) => {
      try {
        const fresh = await api.getScript(id);
        if (activeIdRef.current !== id) return;
        applyLocalScript(fresh);
        setEditTick(0);
        setSaveStatus('saved');
        setSavedAt(new Date());
      } catch (e) {
        setSaveStatus('error');
        toast({
          title: 'Не удалось перезагрузить сценарий',
          description: errorMessage(e),
          variant: 'destructive',
        });
      }
    },
    [api, applyLocalScript, toast]
  );

  // ---------- автосохранение ----------
  const runSave = React.useCallback(async () => {
    // ждём завершения предыдущего PUT, чтобы не слать конкурентные сохранения
    while (inFlightRef.current) {
      await delay(120);
    }
    const id = activeIdRef.current;
    const data = scriptRef.current;
    if (!id || !data) return;

    inFlightRef.current = true;
    const tickAtStart = tickRef.current;
    setSaveStatus('saving');
    try {
      const res = await api.saveScript(id, {
        title: data.title,
        sections: toDrafts(data.sections),
        baseRevision: data.revision,
      });
      if (activeIdRef.current === id) {
        const server = res.script;
        const cur = scriptRef.current ?? data;
        let sections = cur.sections;
        if (cur.sections.length === server.sections.length) {
          // подменяем временные id на серверные (порядок сохранён)
          sections = cur.sections.map((s, i) =>
            s.id.startsWith('tmp-') ? { ...s, id: server.sections[i].id } : s
          );
        }
        applyLocalScript({
          ...cur,
          revision: server.revision,
          sections,
          updatedAt: server.updatedAt,
        });
        if (tickRef.current === tickAtStart) {
          setSaveStatus('saved');
          setSavedAt(new Date());
        }
        void refreshScripts();
      }
    } catch (e) {
      if (activeIdRef.current === id) {
        if (e instanceof ApiError && e.code === 'revision_conflict') {
          toast({
            title: 'Сценарий изменён на другом устройстве',
            description: 'Загружаю свежую версию',
          });
          await reloadScript(id);
        } else {
          setSaveStatus('error');
        }
      }
    } finally {
      inFlightRef.current = false;
    }
  }, [api, applyLocalScript, reloadScript, refreshScripts, toast]);

  React.useEffect(() => {
    if (editTick === 0 || activeScriptId === null) return;
    const t = window.setTimeout(() => {
      void runSave();
    }, SAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [editTick, activeScriptId, runSave]);

  // ---------- правки (локально + планирование сохранения) ----------
  const bump = React.useCallback(() => {
    setSaveStatus('saving');
    setEditTick((t) => t + 1);
  }, []);

  const mutate = React.useCallback(
    (fn: (s: ScriptData) => ScriptData) => {
      const cur = scriptRef.current;
      if (!cur) return;
      applyLocalScript(fn(cur));
      bump();
    },
    [applyLocalScript, bump]
  );

  const updateTitle = React.useCallback(
    (title: string) => {
      mutate((s) => ({ ...s, title }));
    },
    [mutate]
  );

  const updateSection = React.useCallback(
    (id: string, patch: Partial<ScriptSection>) => {
      mutate((s) => ({
        ...s,
        sections: s.sections.map((sec) => (sec.id === id ? { ...sec, ...patch } : sec)),
      }));
    },
    [mutate]
  );

  const addSection = React.useCallback(() => {
    mutate((s) => ({
      ...s,
      sections: [
        ...s.sections,
        { id: uid(), title: '', content: '', color: 'default', orderIndex: s.sections.length },
      ],
    }));
  }, [mutate]);

  const importSections = React.useCallback(
    (imported: ImportedSection[]) => {
      mutate((s) => {
        const base = s.sections.length;
        return {
          ...s,
          sections: [
            ...s.sections,
            ...imported.map((sec, i) => ({
              id: uid(),
              title: sec.title,
              content: sec.content,
              color: 'default' as const,
              orderIndex: base + i,
            })),
          ],
        };
      });
      toast({ title: `Импортировано секций: ${imported.length}` });
    },
    [mutate, toast]
  );

  const moveSection = React.useCallback(
    (index: number, dir: -1 | 1) => {
      mutate((s) => {
        const target = index + dir;
        if (target < 0 || target >= s.sections.length) return s;
        const sections = [...s.sections];
        const [item] = sections.splice(index, 1);
        sections.splice(target, 0, item);
        return { ...s, sections: sections.map((sec, i) => ({ ...sec, orderIndex: i })) };
      });
    },
    [mutate]
  );

  const duplicateSection = React.useCallback(
    (index: number) => {
      mutate((s) => {
        const src = s.sections[index];
        if (!src) return s;
        const copy: ScriptSection = {
          ...src,
          id: uid(),
          title: src.title ? `${src.title} (копия)` : '',
        };
        const sections = [...s.sections];
        sections.splice(index + 1, 0, copy);
        return { ...s, sections: sections.map((sec, i) => ({ ...sec, orderIndex: i })) };
      });
    },
    [mutate]
  );

  const removeSection = React.useCallback(
    (index: number) => {
      mutate((s) => ({
        ...s,
        sections: s.sections
          .filter((_, i) => i !== index)
          .map((sec, i) => ({ ...sec, orderIndex: i })),
      }));
    },
    [mutate]
  );

  // ---------- операции со сценариями ----------
  const selectScript = React.useCallback((id: string) => {
    setActiveScriptId((cur) => (cur === id ? cur : id));
  }, []);

  const createScript = React.useCallback(
    async (title: string) => {
      try {
        const created = await api.createScript(title);
        await refreshScripts();
        setActiveScriptId(created.id);
        toast({ title: 'Сценарий создан' });
      } catch (e) {
        toast({
          title: 'Не удалось создать сценарий',
          description: errorMessage(e),
          variant: 'destructive',
        });
      }
    },
    [api, refreshScripts, toast]
  );

  const renameScript = React.useCallback(
    async (id: string, title: string) => {
      if (id === activeIdRef.current && scriptRef.current) {
        updateTitle(title);
        return;
      }
      // переименование неактивного сценария: читаем и пересохраняем целиком
      try {
        const data = await api.getScript(id);
        await api.saveScript(id, {
          title,
          sections: toDrafts(data.sections),
          baseRevision: data.revision,
        });
        await refreshScripts();
      } catch (e) {
        toast({
          title: 'Не удалось переименовать',
          description: errorMessage(e),
          variant: 'destructive',
        });
      }
    },
    [api, refreshScripts, toast, updateTitle]
  );

  const deleteScript = React.useCallback(
    async (id: string) => {
      try {
        await api.deleteScript(id);
        const rest = (scripts ?? []).filter((s) => s.id !== id);
        setScripts(rest);
        if (activeIdRef.current === id) {
          applyLocalScript(null);
          setActiveScriptId(rest[0]?.id ?? null);
        }
        toast({ title: 'Сценарий удалён' });
        void refreshScripts();
      } catch (e) {
        toast({
          title: 'Не удалось удалить сценарий',
          description: errorMessage(e),
          variant: 'destructive',
        });
      }
    },
    [api, applyLocalScript, refreshScripts, scripts, toast]
  );

  // ---------- живые правки с другого редактора ----------
  const scriptPush = sync.scriptPush;
  const clearScriptPushRef = React.useRef(sync.clearScriptPush);
  clearScriptPushRef.current = sync.clearScriptPush;
  React.useEffect(() => {
    const m = scriptPush;
    if (!m) return;
    const cur = scriptRef.current;
    // эхо собственных сохранений (revision <= локальной) игнорируем
    if (
      m.scriptId === activeIdRef.current &&
      cur &&
      m.revision > cur.revision &&
      !inFlightRef.current
    ) {
      applyLocalScript(m.script);
      setEditTick(0);
      setSaveStatus('saved');
      setSavedAt(new Date());
      toast({
        title: 'Сценарий обновлён',
        description: `Загружена ревизия ${m.revision} с другого устройства`,
      });
    }
    clearScriptPushRef.current();
  }, [scriptPush, applyLocalScript, toast]);

  // ---------- дубли: оптимистичные операции ----------
  const displayTakes = React.useMemo(() => {
    const result: TakeRecord[] = [];
    for (const t of sync.takes) {
      const ov = takeOverrides[t.id];
      if (ov === null) continue; // удалён локально
      result.push(ov ?? t);
    }
    return result;
  }, [sync.takes, takeOverrides]);

  const rateTake = React.useCallback(
    (take: TakeRecord, rating: TakeRating | null) => {
      setTakeOverrides((prev) => ({ ...prev, [take.id]: { ...take, rating } }));
      api.rateTake(take.id, rating).then(
        (updated) => setTakeOverrides((prev) => ({ ...prev, [take.id]: updated })),
        (e: unknown) => {
          setTakeOverrides((prev) => ({ ...prev, [take.id]: take }));
          toast({
            title: 'Не удалось сохранить оценку',
            description: errorMessage(e),
            variant: 'destructive',
          });
        }
      );
    },
    [api, toast]
  );

  const removeTake = React.useCallback(
    (take: TakeRecord) => {
      setTakeOverrides((prev) => ({ ...prev, [take.id]: null }));
      api.deleteTake(take.id).then(
        () => undefined,
        (e: unknown) => {
          setTakeOverrides((prev) => ({ ...prev, [take.id]: take }));
          toast({
            title: 'Не удалось удалить дубль',
            description: errorMessage(e),
            variant: 'destructive',
          });
        }
      );
    },
    [api, toast]
  );

  // ---------- экспорт ----------
  const exportScript = React.useCallback(
    (format: 'txt' | 'md') => {
      const data = scriptRef.current;
      if (!data) {
        toast({
          title: 'Нет активного сценария',
          description: 'Выберите или создайте сценарий перед экспортом',
        });
        return;
      }
      const text = buildExportText(data, format);
      const blob = new Blob([text], {
        type: format === 'md' ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8',
      });
      downloadBlob(blob, `${sanitizeFilename(data.title)}.${format}`);
    },
    [toast]
  );

  const retrySave = React.useCallback(() => {
    if (scriptRef.current && activeIdRef.current) bump();
  }, [bump]);

  const sections = script?.sections ?? [];
  const sidebarProps = {
    scripts,
    error: listError,
    activeId: activeScriptId,
    onSelect: selectScript,
    onCreate: (title: string) => void createScript(title),
    onRename: (id: string, title: string) => void renameScript(id, title),
    onDelete: (id: string) => void deleteScript(id),
    onRetry: () => setListTick((t) => t + 1),
  };
  const syncPanelProps = {
    devices: sync.devices,
    syncStatus: sync.status,
    sections,
    takes: displayTakes,
    onRateTake: rateTake,
    onDeleteTake: removeTake,
    onRefreshTakes: () => void sync.refreshTakes(),
    onConnect: () => setPairOpen(true),
  };

  return (
    <div className="flex min-h-screen flex-col bg-background lg:h-screen">
      {/* ---------- шапка ---------- */}
      <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur md:px-4">
        <Button
          variant="ghost"
          size="icon"
          className="size-9 text-muted-foreground lg:hidden"
          onClick={() => setSidebarOpen(true)}
          title="Список сценариев"
        >
          <PanelLeft className="size-4" />
        </Button>
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-lg bg-amber-500 text-white shadow-sm">
            <Clapperboard className="size-4" />
          </span>
          <span className="hidden text-sm font-semibold tracking-tight sm:inline">
            Prompter Studio
          </span>
        </div>
        <div className="mx-2 hidden h-6 w-px bg-border sm:block" />
        <div className="hidden min-w-0 items-center sm:flex">
          <SaveStatus status={saveStatus} savedAt={savedAt} onRetry={retrySave} />
          {listError !== null && (
            <span className="ml-3 hidden items-center gap-1.5 text-xs font-medium text-red-600 md:flex">
              <WifiOff className="size-3.5" />
              Нет связи с сервером
            </span>
          )}
        </div>
        <div className="flex-1" />
        <Button
          size="sm"
          className="bg-amber-500 text-white shadow-sm hover:bg-amber-600"
          onClick={() => setPairOpen(true)}
        >
          <Smartphone className="size-4" />
          <span className="hidden sm:inline">Подключить телефон</span>
          <span className="sm:hidden">Телефон</span>
        </Button>
        <Button
          asChild
          variant="ghost"
          size="icon"
          className="text-muted-foreground"
          title="Открыть мобильную версию (для отладки)"
        >
          <a href="/?ui=mobile" target="_blank" rel="noopener noreferrer">
            <Smartphone className="size-4" />
          </a>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="text-muted-foreground" title="Меню">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel>Экспорт сценария</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => exportScript('txt')}>
              <FileDown className="size-4" />
              Скачать .txt
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => exportScript('md')}>
              <FileText className="size-4" />
              Скачать .md
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground xl:hidden"
          onClick={() => setPanelOpen(true)}
          title="Устройства и дубли"
        >
          <PanelRight className="size-4" />
        </Button>
      </header>

      {/* ---------- рабочая область ---------- */}
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-64 shrink-0 flex-col border-r bg-background lg:flex">
          <ScriptSidebar {...sidebarProps} />
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <SectionsEditor
            script={script}
            loading={scriptLoading}
            error={scriptError}
            wpm={wpm}
            onWpmChange={changeWpm}
            onTitleChange={updateTitle}
            onSectionChange={updateSection}
            onMoveSection={moveSection}
            onDuplicateSection={duplicateSection}
            onRemoveSection={removeSection}
            onAddSection={addSection}
            onImportSections={importSections}
            onRetryLoad={() => setScriptLoadTick((t) => t + 1)}
          />
        </main>

        <aside className="hidden w-80 shrink-0 flex-col border-l bg-background xl:flex">
          <SyncPanel {...syncPanelProps} />
        </aside>
      </div>

      {/* ---------- мобильные/планшетные панели (Sheet) ---------- */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-72 gap-0 p-0 sm:max-w-72">
          <SheetHeader className="border-b p-3">
            <SheetTitle className="text-sm">Сценарии</SheetTitle>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-hidden">
            <ScriptSidebar
              {...sidebarProps}
              onSelect={(id) => {
                selectScript(id);
                setSidebarOpen(false);
              }}
            />
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={panelOpen} onOpenChange={setPanelOpen}>
        <SheetContent side="right" className="w-80 gap-0 p-0 sm:max-w-80">
          <SheetHeader className="border-b p-3">
            <SheetTitle className="text-sm">Синхронизация</SheetTitle>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <SyncPanel {...syncPanelProps} />
          </div>
        </SheetContent>
      </Sheet>

      {/* ---------- диалог сопряжения ---------- */}
      <PairDialog
        open={pairOpen}
        onOpenChange={setPairOpen}
        api={api}
        scriptId={activeScriptId}
        scriptTitle={script?.title}
        sections={sections}
        devices={sync.devices}
      />
    </div>
  );
}
