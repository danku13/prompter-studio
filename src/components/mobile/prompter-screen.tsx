'use client';

/**
 * Экран 3. Суфлёр — сердце приложения.
 *
 * Слои (absolute, inset-0):
 *  a) камера (camera-layer + use-camera) — или заглушка «Камера недоступна»
 *     с кнопкой «Продолжить без записи» (режим репетиции);
 *  b) оверлей телесуфлёра (prompter-overlay) — прокрутка из use-prompter-scroll;
 *  c) статус-бар (status-bar);
 *  d) панель управления (control-bar) — REC, «Кусок заново», секции, замок, wpm;
 *  e) обратный отсчёт (countdown-overlay).
 *
 * Запись: use-recorder (MediaRecorder). Метки дублей: рестарт секции во время
 * записи фиксирует дубль (WS sendTake + локальный список), финальный дубль —
 * при стопе (> 2с). Сохранение — save-dialog.
 * Синхронизация: useDeviceSync — телеметрия раз в 2с, push сценария
 * (во время записи буферизуется и применяется после стопа).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Lock } from 'lucide-react';
import type { ApiClient } from '@/lib/client/api';
import type { ConnectionConfig } from '@/lib/client/connection';
import { useDeviceSync } from '@/lib/client/use-sync';
import { keepScreenAwake, saveVideoBlob } from '@/lib/client/capacitor-bridge';
import type { ScriptData, ScriptPushMessage, ScriptSection } from '@/lib/types';
import { useBattery } from '@/lib/hooks/use-battery';
import { useCamera } from '@/lib/hooks/use-camera';
import { usePrompterSettings } from '@/lib/hooks/use-prompter-settings';
import { usePrompterScroll } from '@/lib/hooks/use-prompter-scroll';
import { buildVideoFilename, useRecorder } from '@/lib/hooks/use-recorder';
import { useToast } from '@/hooks/use-toast';
import CameraLayer from './camera-layer';
import ControlBar from './control-bar';
import CountdownOverlay from './countdown-overlay';
import PrompterOverlay from './prompter-overlay';
import SaveDialog from './save-dialog';
import SettingsSheet from './settings-sheet';
import StatusBar from './status-bar';
import { cacheScript } from './script-cache';
import type { SessionTake } from './shared';

export interface PrompterScreenProps {
  cfg: ConnectionConfig;
  api: ApiClient;
  script: ScriptData;
  onExit: () => void;
}

export default function PrompterScreen({ cfg, api, script: initialScript, onExit }: PrompterScreenProps) {
  const { toast } = useToast();
  const [script, setScript] = useState<ScriptData>(initialScript);
  const { settings, update: updateSettings, reset: resetSettings } = usePrompterSettings();

  const camera = useCamera();
  const recorder = useRecorder();
  const {
    recording,
    elapsedMs,
    blob,
    mimeType,
    start: startRecorder,
    stop: stopRecorder,
    reset: resetRecorder,
  } = recorder;
  const battery = useBattery();

  const scroll = usePrompterScroll(script.sections, settings.wpm);
  const { playing, progress, currentSectionIndex, play: playScroll, pause: pauseScroll, jumpSection, restartSection } =
    scroll;

  const [rehearsalMode, setRehearsalMode] = useState(false);
  const [locked, setLocked] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [countdown, setCountdown] = useState<number | 'go' | null>(null);
  const [confirmExit, setConfirmExit] = useState(false);
  const [sessionTakes, setSessionTakes] = useState<SessionTake[]>([]);
  const [saving, setSaving] = useState(false);

  const takeStartMsRef = useRef(0);
  const pendingPushRef = useRef<ScriptPushMessage | null>(null);
  const pendingJumpSectionIdRef = useRef<string | null>(null);

  const currentSection: ScriptSection | null = script.sections[currentSectionIndex] ?? null;
  const sectionCount = script.sections.length;
  const canRecord = !rehearsalMode && camera.stream !== null;

  // ================= Синхронизация (WS) =================

  const scriptRef = useRef(script);
  scriptRef.current = script;

  const applyScriptPush = useCallback(
    (m: ScriptPushMessage) => {
      const keepId = scriptRef.current.sections[currentSectionIndex]?.id ?? null;
      setScript(m.script);
      cacheScript(m.script);
      pendingJumpSectionIdRef.current = keepId;
      toast({ title: 'Текст обновлён', description: `Синхронизирована ревизия ${m.script.revision}.` });
    },
    [currentSectionIndex, toast]
  );

  // «Заживление»: подтянуть свежую ревизию с сервера (пуши могли быть пропущены,
  // пока сокет был внизу или сидел в другой комнате). Применяем только если новее.
  const freshenScript = useCallback(async () => {
    const current = scriptRef.current;
    if (!current) return;
    try {
      const fresh = await api.getScript(current.id);
      if (fresh.id === scriptRef.current?.id && fresh.revision > scriptRef.current.revision) {
        applyScriptPush({ scriptId: fresh.id, revision: fresh.revision, script: fresh });
      }
    } catch {
      /* офлайн — следующий реконнект повторит */
    }
  }, [api, applyScriptPush]);

  const sync = useDeviceSync(api, cfg, {
    onScriptPush: (m) => {
      const current = scriptRef.current;
      if (m.scriptId !== current.id || m.revision <= current.revision) return;
      if (recording) {
        // запись идёт — применяем после стопа
        pendingPushRef.current = m;
        return;
      }
      applyScriptPush(m);
    },
    onConnected: () => {
      void freshenScript();
    },
  });
  const { sendStatus, sendTake, subscribe, status: wsStatus } = sync;

  // Суфлёр подписывается на комнату ОТКРЫТОГО сценария — правки «прилетают»
  // даже если он отличается от спаренного по QR (иначе комната не совпадала
  // и обновления не доходили).
  useEffect(() => {
    subscribe(script.id);
  }, [subscribe, script.id]);

  // после применения пуша — вернуть читателя к началу той же секции
  useEffect(() => {
    const id = pendingJumpSectionIdRef.current;
    if (id === null) return;
    pendingJumpSectionIdRef.current = null;
    const idx = script.sections.findIndex((s) => s.id === id);
    jumpSection(idx >= 0 ? idx : 0);
  }, [script, jumpSection]);

  // телеметрия каждые 2 секунды
  const statusSectionId = currentSection?.id ?? null;
  useEffect(() => {
    const id = setInterval(() => {
      sendStatus({ recording, sectionId: statusSectionId, wpm: settings.wpm, battery });
    }, 2000);
    return () => clearInterval(id);
  }, [sendStatus, recording, statusSectionId, settings.wpm, battery]);

  // ================= Wake lock =================
  useEffect(() => {
    void keepScreenAwake(true);
    return () => {
      void keepScreenAwake(false);
    };
  }, []);

  // ================= Запись =================

  const beginRecording = useCallback(() => {
    if (!camera.stream) {
      toast({ title: 'Камера недоступна', description: 'Запись невозможна — продолжите в режиме репетиции.' });
      return;
    }
    const err = startRecorder(camera.stream);
    if (err !== null) {
      toast({ title: 'Не удалось начать запись', description: err });
      return;
    }
    takeStartMsRef.current = 0;
    setSessionTakes([]);
    playScroll();
  }, [camera.stream, startRecorder, playScroll, toast]);

  const pushTake = useCallback(
    (section: ScriptSection, t0: number, t1: number, notify: boolean) => {
      sendTake({ sectionId: section.id, sectionTitle: section.title, t0, t1 });
      setSessionTakes((prev) => [
        ...prev,
        { id: `take-${prev.length + 1}`, sectionId: section.id, sectionTitle: section.title, t0, t1 },
      ]);
      if (notify) toast({ title: `Дубль отмечен: ${section.title}` });
    },
    [sendTake, toast]
  );

  const stopRecording = useCallback(() => {
    const finalMs = stopRecorder();
    pauseScroll();
    // финальный дубль текущей секции, если длился дольше 2 секунд
    if (currentSection && finalMs - takeStartMsRef.current > 2000) {
      pushTake(currentSection, takeStartMsRef.current, finalMs, false);
    }
    // отложенный push сценария — применяем после стопа
    const pending = pendingPushRef.current;
    if (pending) {
      pendingPushRef.current = null;
      applyScriptPush(pending);
    }
  }, [stopRecorder, pauseScroll, currentSection, pushTake, applyScriptPush]);

  const handleToggleRecord = useCallback(() => {
    if (countdown !== null) return;
    if (recording) {
      stopRecording();
      return;
    }
    if (!canRecord) return;
    if (settings.countdown) {
      pauseScroll();
      setCountdown(3);
    } else {
      beginRecording();
    }
  }, [countdown, recording, canRecord, settings.countdown, pauseScroll, beginRecording, stopRecording]);

  // Обратный отсчёт: 3 → 2 → 1 → «Съёмка!» → старт прокрутки и записи
  useEffect(() => {
    if (countdown === null) return;
    if (countdown === 'go') {
      const t = setTimeout(() => {
        setCountdown(null);
        beginRecording();
      }, 700);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      setCountdown((c) => (typeof c === 'number' ? (c <= 1 ? 'go' : c - 1) : c));
    }, 1000);
    return () => clearTimeout(t);
  }, [countdown, beginRecording]);

  // ================= Управление =================

  const handleRestartSection = useCallback(() => {
    if (recording && currentSection) {
      const now = elapsedMs;
      if (now - takeStartMsRef.current >= 250) {
        pushTake(currentSection, takeStartMsRef.current, now, true);
      }
      takeStartMsRef.current = now;
    }
    restartSection();
  }, [recording, currentSection, elapsedMs, pushTake, restartSection]);

  const handlePrevSection = useCallback(() => {
    jumpSection(currentSectionIndex - 1);
  }, [jumpSection, currentSectionIndex]);

  const handleNextSection = useCallback(() => {
    jumpSection(currentSectionIndex + 1);
  }, [jumpSection, currentSectionIndex]);

  const handleSwitchCamera = useCallback(() => {
    if (!recording) camera.switchCamera();
  }, [recording, camera]);

  const handleWpmDelta = useCallback(
    (delta: number) => {
      updateSettings({ wpm: Math.min(300, Math.max(60, settings.wpm + delta)) });
    },
    [settings.wpm, updateSettings]
  );

  // ================= Сохранение =================

  const filename = useMemo(
    () => (blob ? buildVideoFilename(script.title, mimeType ?? 'video/webm') : ''),
    [blob, script.title, mimeType]
  );

  const handleSaveVideo = useCallback(async () => {
    if (!blob) return;
    setSaving(true);
    try {
      const result = await saveVideoBlob(blob, filename);
      if (result === 'download') {
        toast({ title: 'Видео скачивается', description: filename });
      } else if (result === 'shared') {
        toast({ title: 'Открыт системный диалог сохранения', description: filename });
      } else {
        toast({ title: 'Не удалось сохранить видео', description: 'Проверьте свободное место и разрешения.' });
      }
    } finally {
      setSaving(false);
    }
  }, [blob, filename, toast]);

  const handleRetake = useCallback(() => {
    resetRecorder();
    restartSection();
  }, [resetRecorder, restartSection]);

  const handleDiscard = useCallback(() => {
    resetRecorder();
  }, [resetRecorder]);

  const handleExitConfirmed = useCallback(() => {
    setConfirmExit(false);
    if (recording) stopRecorder(); // несохранённый ролик отбрасывается
    onExit();
  }, [recording, stopRecorder, onExit]);

  // ================= Рендер =================

  return (
    <div className="fixed inset-0 select-none overflow-hidden bg-black">
      <CameraLayer
        videoRef={camera.videoRef}
        facing={camera.facing}
        error={camera.error}
        retry={camera.retry}
        rehearsalMode={rehearsalMode}
        onEnterRehearsal={() => setRehearsalMode(true)}
      />

      <PrompterOverlay
        sections={script.sections}
        settings={settings}
        containerRef={scroll.containerRef}
        contentRef={scroll.contentRef}
      />

      {!locked && (
        <StatusBar
          title={script.title}
          sectionIndex={currentSectionIndex}
          sectionCount={sectionCount}
          recording={recording}
          elapsedMs={elapsedMs}
          wsStatus={wsStatus}
          battery={battery}
          rehearsalMode={rehearsalMode}
          onBack={() => setConfirmExit(true)}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      )}

      {!locked && (
        <ControlBar
          playing={playing}
          recording={recording}
          canRecord={canRecord}
          progress={progress}
          wpm={settings.wpm}
          canPrev={currentSectionIndex > 0}
          canNext={currentSectionIndex < sectionCount - 1}
          onTogglePlay={() => (playing ? pauseScroll() : playScroll())}
          onToggleRecord={handleToggleRecord}
          onPrevSection={handlePrevSection}
          onNextSection={handleNextSection}
          onRestartSection={handleRestartSection}
          onSwitchCamera={handleSwitchCamera}
          onToggleLock={() => setLocked(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          onWpmChange={handleWpmDelta}
        />
      )}

      {locked && (
        <button
          type="button"
          onClick={() => setLocked(false)}
          aria-label="Разблокировать интерфейс"
          title="Разблокировать интерфейс"
          className="absolute right-3 z-30 flex size-10 items-center justify-center rounded-full border border-white/10 bg-black/40 text-zinc-400"
          style={{ top: 'calc(env(safe-area-inset-top) + 12px)' }}
        >
          <Lock className="size-4" />
        </button>
      )}

      <CountdownOverlay phase={countdown} />

      <AnimatePresence>
        {confirmExit && (
          <motion.div
            key="exit-confirm"
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/75 p-6 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="w-full max-w-xs rounded-2xl border border-white/10 bg-zinc-900 p-5"
              initial={{ scale: 0.92 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.92 }}
              transition={{ duration: 0.15 }}
            >
              <p className="text-base font-semibold text-zinc-100">Выйти из суфлёра?</p>
              <p className="mt-1 text-sm leading-relaxed text-zinc-400">
                Несохранённый ролик будет потерян. Отметки дублей уже отправлены на сервер.
              </p>
              <div className="mt-5 flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmExit(false)}
                  className="h-11 flex-1 rounded-xl border border-white/10 text-sm text-zinc-200 transition-colors active:bg-white/5"
                >
                  Остаться
                </button>
                <button
                  type="button"
                  onClick={handleExitConfirmed}
                  className="h-11 flex-1 rounded-xl bg-red-500 text-sm font-medium text-white transition-colors active:bg-red-400"
                >
                  Выйти
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <SettingsSheet
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={settings}
        onChange={updateSettings}
        onReset={resetSettings}
      />

      <SaveDialog
        open={blob !== null}
        blob={blob}
        durationMs={elapsedMs}
        filename={filename}
        takes={sessionTakes}
        saving={saving}
        onSave={() => void handleSaveVideo()}
        onRetake={handleRetake}
        onDiscard={handleDiscard}
      />
    </div>
  );
}
