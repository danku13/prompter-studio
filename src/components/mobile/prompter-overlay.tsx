'use client';

/**
 * Слой (b) суфлёра: полупрозрачная полоса с прокручиваемым текстом.
 *
 * Полоса ~45% экрана, позиция top/center/bottom + тонкая подстройка (offset %).
 * Внутри — контейнер overflow-hidden, контент (секции подряд) двигается
 * translate3d из хука use-prompter-scroll. Зона чтения — две amber-линии
 * на 30%/70% полосы. Зеркалирование текста — scaleX(-1) на обёртке контента.
 */

import type { RefObject } from 'react';
import { cn } from '@/lib/utils';
import type { ScriptSection, SectionColor } from '@/lib/types';
import type { PrompterSettings } from '@/lib/hooks/use-prompter-settings';

const BAND_HEIGHT_PCT = 45;

const BASE_TOP: Record<PrompterSettings['position'], number> = {
  top: 6,
  center: 27.5,
  bottom: 47,
};

const DOT_CLASSES: Record<SectionColor, string> = {
  default: 'bg-zinc-400',
  amber: 'bg-amber-400',
  rose: 'bg-rose-400',
  emerald: 'bg-emerald-400',
  violet: 'bg-violet-400',
};

export interface PrompterOverlayProps {
  sections: ScriptSection[];
  settings: PrompterSettings;
  containerRef: RefObject<HTMLDivElement | null>;
  contentRef: RefObject<HTMLDivElement | null>;
}

export default function PrompterOverlay({ sections, settings, containerRef, contentRef }: PrompterOverlayProps) {
  const baseTop = BASE_TOP[settings.position];
  const topPct = Math.min(100 - BAND_HEIGHT_PCT, Math.max(0, baseTop + settings.offsetPct));

  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-10"
      style={{ top: `${topPct}%`, height: `${BAND_HEIGHT_PCT}%` }}
    >
      {/* Подложка-полоса */}
      <div className="absolute inset-0 bg-black" style={{ opacity: settings.overlayOpacity / 100 }} />
      {/* Мягкие края */}
      <div className="absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-black/70 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/70 to-transparent" />

      {/* Зона чтения */}
      {settings.readingZone && (
        <>
          <div className="absolute inset-x-0 top-[30%] h-px bg-amber-400/60" />
          <div className="absolute inset-x-0 top-[70%] h-px bg-amber-400/60" />
          <div className="absolute inset-x-0 top-[30%] bottom-[30%] bg-gradient-to-b from-transparent via-white/[0.06] to-transparent" />
          <div className="absolute left-2 top-[30%] size-1.5 -translate-y-1/2 rounded-full bg-amber-400/80" />
          <div className="absolute left-2 top-[70%] size-1.5 -translate-y-1/2 rounded-full bg-amber-400/80" />
          <div className="absolute right-2 top-[30%] size-1.5 -translate-y-1/2 rounded-full bg-amber-400/80" />
          <div className="absolute right-2 top-[70%] size-1.5 -translate-y-1/2 rounded-full bg-amber-400/80" />
        </>
      )}

      {/* Прокручиваемый контент */}
      <div ref={containerRef} className="absolute inset-0 overflow-hidden">
        {/* Зеркалирование (rig с полупрозрачным стеклом) — обёртка, чтобы не конфликтовать с translate3d */}
        <div style={settings.mirrorText ? { transform: 'scaleX(-1)' } : undefined}>
          <div
            ref={contentRef}
            className="relative will-change-transform text-center font-medium text-white"
            style={{
              fontSize: settings.fontSize,
              lineHeight: settings.lineHeight,
              textShadow: '0 2px 14px rgba(0,0,0,0.95), 0 0 4px rgba(0,0,0,0.9)',
            }}
          >
            {sections.map((section, i) => (
              <div key={section.id} data-section-index={i} className="px-5 pb-16 pt-10">
                {/* Заголовок секции: плашка с цветом */}
                <div className="mb-8 flex justify-center">
                  <div className="inline-flex items-center gap-2.5 rounded-full border border-white/10 bg-black/45 px-4 py-1.5">
                    <span
                      className={cn(
                        'size-2.5 shrink-0 rounded-full',
                        settings.sectionColors ? DOT_CLASSES[section.color] : 'bg-zinc-400'
                      )}
                    />
                    <span className="text-[0.5em] font-semibold uppercase tracking-[0.18em] text-zinc-300">
                      {section.title}
                    </span>
                  </div>
                </div>
                {section.content.split('\n').map((line, j) => (
                  <p key={j} className="mb-[0.55em] last:mb-0">
                    {line || '\u00A0'}
                  </p>
                ))}
              </div>
            ))}
            {sections.length === 0 && (
              <div className="px-5 pt-16 text-[0.6em] text-zinc-500">
                Пустой сценарий — добавьте текст в редакторе на компьютере.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
