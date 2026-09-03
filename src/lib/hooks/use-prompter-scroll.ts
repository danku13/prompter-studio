'use client';

/**
 * Прокрутка суфлёра — «сердце» чтения.
 *
 * Прокрутку делает НЕ браузер: контент внутри контейнера (overflow-hidden)
 * двигается transform'ом translate3d в rAF-цикле.
 *
 * Математика: скорость задаётся в СЛОВАХ В МИНУТУ и не зависит от шрифта/ширины:
 *
 *   pxPerSec = (contentHeight / totalWords) * (wpm / 60)
 *
 * где contentHeight — полная высота контента (scrollHeight), totalWords —
 * все слова сценария (countWords из @/lib/text).
 *
 * Текущая позиция хранится как translate (px), поэтому смена wpm на лету
 * меняет только скорость — позиция не «прыгает». Линия чтения — середина
 * полосы (50%), конец прокрутки — когда конец текста дошёл до линии чтения.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { ScriptSection } from '@/lib/types';
import { countWords } from '@/lib/text';

/** Доля высоты полосы, где находится линия чтения */
const READ_LINE = 0.5;

export interface PrompterScroll {
  containerRef: RefObject<HTMLDivElement | null>;
  contentRef: RefObject<HTMLDivElement | null>;
  playing: boolean;
  /** 0..1 по всей длине сценария */
  progress: number;
  currentSectionIndex: number;
  play: () => void;
  pause: () => void;
  /** прыгнуть к началу секции i (заголовок встанет на линию чтения) */
  jumpSection: (index: number) => void;
  /** «кусок заново» — к началу текущей секции */
  restartSection: () => void;
  /** пересчитать геометрию (вызывается автоматически через ResizeObserver) */
  remeasure: () => void;
}

export function usePrompterScroll(sections: ScriptSection[], wpm: number): PrompterScroll {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);

  // ---- Геометрия (обновляется measure) ----
  const containerHeightRef = useRef(0);
  const contentHeightRef = useRef(0);
  const sectionOffsetsRef = useRef<number[]>([]);
  const totalWordsRef = useRef(0);
  const startOffsetRef = useRef(0);
  const endTranslateRef = useRef(0);
  const initializedRef = useRef(false);

  // ---- Состояние прокрутки ----
  const translateRef = useRef(0);
  const pxPerSecRef = useRef(0);
  const wpmRef = useRef(wpm);
  const playingRef = useRef(false);
  const currentIndexRef = useRef(0);
  const rafRef = useRef(0);
  const lastTsRef = useRef(0);
  const lastUiTsRef = useRef(0);

  const applyTransform = useCallback(() => {
    const el = contentRef.current;
    if (el) el.style.transform = `translate3d(0, ${translateRef.current}px, 0)`;
  }, []);

  const computeSpeed = useCallback(() => {
    const words = totalWordsRef.current;
    const height = contentHeightRef.current;
    pxPerSecRef.current = words > 0 && height > 0 ? (height / words) * (wpmRef.current / 60) : 0;
  }, []);

  const updateDerivedState = useCallback(() => {
    // Текущая секция: последняя секция, чьё начало уже прошло линию чтения
    const readingPos = startOffsetRef.current - translateRef.current;
    const offsets = sectionOffsetsRef.current;
    let idx = 0;
    for (let i = 0; i < offsets.length; i++) {
      if (offsets[i] <= readingPos + 1) idx = i;
      else break;
    }
    currentIndexRef.current = idx;
    setCurrentSectionIndex(idx);

    const total = startOffsetRef.current - endTranslateRef.current;
    const p = total > 0 ? (startOffsetRef.current - translateRef.current) / total : 0;
    setProgress(Math.min(1, Math.max(0, p)));
  }, []);

  const measure = useCallback(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;
    const containerHeight = container.clientHeight;
    if (containerHeight <= 0) return;

    const contentHeight = content.scrollHeight;
    const offsets = Array.from(content.querySelectorAll<HTMLElement>('[data-section-index]')).map(
      (el) => el.offsetTop
    );

    containerHeightRef.current = containerHeight;
    contentHeightRef.current = contentHeight;
    sectionOffsetsRef.current = offsets;
    totalWordsRef.current = sections.reduce((sum, s) => sum + countWords(s.content), 0);
    startOffsetRef.current = containerHeight * READ_LINE;
    endTranslateRef.current = Math.min(
      startOffsetRef.current,
      -(contentHeight - containerHeight * (1 - READ_LINE))
    );

    if (!initializedRef.current) {
      // старт: начало текста на линии чтения
      translateRef.current = startOffsetRef.current;
      initializedRef.current = true;
    }
    // после смены геометрии держим позицию в допустимых пределах
    translateRef.current = Math.min(startOffsetRef.current, Math.max(endTranslateRef.current, translateRef.current));

    computeSpeed();
    applyTransform();
    updateDerivedState();
  }, [applyTransform, computeSpeed, sections, updateDerivedState]);

  const measureRef = useRef(measure);
  useEffect(() => {
    measureRef.current = measure;
  });

  // Смена секций (push сценария) — пересчитать на следующем кадре
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      measureRef.current();
    });
    return () => cancelAnimationFrame(raf);
  }, [measure]);

  // Смена wpm на лету: скорость новая, позиция та же — без скачка
  useEffect(() => {
    wpmRef.current = wpm;
    computeSpeed();
  }, [wpm, computeSpeed]);

  // rAF-цикл прокрутки
  useEffect(() => {
    const loop = (ts: number) => {
      rafRef.current = requestAnimationFrame(loop);
      const dt = Math.min(100, ts - lastTsRef.current); // вкладка спала — не прыгаем
      lastTsRef.current = ts;

      if (playingRef.current && pxPerSecRef.current > 0) {
        let t = translateRef.current - (pxPerSecRef.current * dt) / 1000;
        if (t <= endTranslateRef.current) {
          t = endTranslateRef.current;
          playingRef.current = false;
          setPlaying(false);
        }
        translateRef.current = t;
        applyTransform();
      }

      if (ts - lastUiTsRef.current > 200) {
        lastUiTsRef.current = ts;
        updateDerivedState();
      }
    };
    lastTsRef.current = performance.now();
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [applyTransform, updateDerivedState]);

  // Геометрия: контейнер, контент, окно (поворот экрана, смена настроек)
  useEffect(() => {
    const ro = new ResizeObserver(() => {
      measureRef.current();
    });
    if (containerRef.current) ro.observe(containerRef.current);
    if (contentRef.current) ro.observe(contentRef.current);
    const onResize = () => measureRef.current();
    window.addEventListener('resize', onResize);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', onResize);
    };
  }, []);

  const play = useCallback(() => {
    measure();
    if (contentHeightRef.current <= 0) return;
    if (translateRef.current <= endTranslateRef.current + 0.5) {
      // дошли до конца — начинаем заново
      translateRef.current = startOffsetRef.current;
    }
    playingRef.current = true;
    setPlaying(true);
    applyTransform();
    updateDerivedState();
  }, [applyTransform, measure, updateDerivedState]);

  const pause = useCallback(() => {
    playingRef.current = false;
    setPlaying(false);
  }, []);

  const jumpSection = useCallback(
    (index: number) => {
      measure();
      const offsets = sectionOffsetsRef.current;
      if (offsets.length === 0) return;
      const i = Math.min(offsets.length - 1, Math.max(0, index));
      const target = Math.min(
        startOffsetRef.current,
        Math.max(endTranslateRef.current, startOffsetRef.current - offsets[i])
      );
      translateRef.current = target;
      applyTransform();
      updateDerivedState();
    },
    [applyTransform, measure, updateDerivedState]
  );

  const restartSection = useCallback(() => {
    jumpSection(currentIndexRef.current);
  }, [jumpSection]);

  const remeasure = useCallback(() => {
    measure();
  }, [measure]);

  return {
    containerRef,
    contentRef,
    playing,
    progress,
    currentSectionIndex,
    play,
    pause,
    jumpSection,
    restartSection,
    remeasure,
  };
}
