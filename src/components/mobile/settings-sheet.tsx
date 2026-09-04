'use client';

/**
 * Настройки суфлёра (Sheet снизу): скорость, текст, позиция полосы, отображение.
 * Всё применяется мгновенно и сохраняется на устройстве (use-prompter-settings).
 */

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import type { PrompterPosition, PrompterSettings } from '@/lib/hooks/use-prompter-settings';
import { DARK_SCOPE } from './shared';

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-zinc-300">{label}</span>
      {value !== undefined && <span className="text-sm tabular-nums text-blue-400">{value}</span>}
    </div>
  );
}

function SwitchRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-sm text-zinc-300">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

export interface SettingsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: PrompterSettings;
  onChange: (patch: Partial<PrompterSettings>) => void;
  onReset: () => void;
}

export default function SettingsSheet({ open, onOpenChange, settings, onChange, onReset }: SettingsSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className={cn(DARK_SCOPE, 'max-h-[88vh] overflow-y-auto rounded-t-3xl border-white/10 p-0')}
      >
        <SheetHeader className="border-b border-white/5 px-5 pt-4 pb-3">
          <SheetTitle className="text-zinc-100">Настройки суфлёра</SheetTitle>
          <SheetDescription className="text-zinc-500">
            Применяются сразу и сохраняются на устройстве.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-7 p-5 pb-[calc(env(safe-area-inset-bottom)+20px)]">
          <section className="space-y-3">
            <Row label="Скорость чтения" value={`${settings.wpm} слов/мин`} />
            <Slider
              min={60}
              max={300}
              step={5}
              value={[settings.wpm]}
              onValueChange={(v) => onChange({ wpm: v[0] ?? settings.wpm })}
            />
          </section>

          <section className="space-y-3">
            <Row label="Размер текста" value={`${settings.fontSize} px`} />
            <Slider
              min={20}
              max={72}
              step={1}
              value={[settings.fontSize]}
              onValueChange={(v) => onChange({ fontSize: v[0] ?? settings.fontSize })}
            />
            <Row label="Интерлиньяж" value={`×${settings.lineHeight.toFixed(2)}`} />
            <Slider
              min={1.2}
              max={2}
              step={0.05}
              value={[settings.lineHeight]}
              onValueChange={(v) => onChange({ lineHeight: v[0] ?? settings.lineHeight })}
            />
          </section>

          <section className="space-y-3">
            <Row label="Позиция полосы" />
            <ToggleGroup
              type="single"
              variant="outline"
              value={settings.position}
              onValueChange={(v) => {
                if (v) onChange({ position: v as PrompterPosition });
              }}
              className="w-full"
            >
              <ToggleGroupItem value="top" className="h-11 flex-1">
                Вверху
              </ToggleGroupItem>
              <ToggleGroupItem value="center" className="h-11 flex-1">
                Центр
              </ToggleGroupItem>
              <ToggleGroupItem value="bottom" className="h-11 flex-1">
                Внизу
              </ToggleGroupItem>
            </ToggleGroup>
            <Row
              label="Подстройка по вертикали"
              value={`${settings.offsetPct > 0 ? '+' : ''}${settings.offsetPct}%`}
            />
            <Slider
              min={-20}
              max={20}
              step={1}
              value={[settings.offsetPct]}
              onValueChange={(v) => onChange({ offsetPct: v[0] ?? settings.offsetPct })}
            />
          </section>

          <section className="space-y-4">
            <Row label="Прозрачность подложки" value={`${settings.overlayOpacity}%`} />
            <Slider
              min={0}
              max={90}
              step={5}
              value={[settings.overlayOpacity]}
              onValueChange={(v) => onChange({ overlayOpacity: v[0] ?? settings.overlayOpacity })}
            />
            <SwitchRow
              label="Зеркалирование текста"
              checked={settings.mirrorText}
              onChange={(v) => onChange({ mirrorText: v })}
            />
            <SwitchRow
              label="Линии зоны чтения"
              checked={settings.readingZone}
              onChange={(v) => onChange({ readingZone: v })}
            />
            <SwitchRow
              label="Цвета секций"
              checked={settings.sectionColors}
              onChange={(v) => onChange({ sectionColors: v })}
            />
            <SwitchRow
              label="Обратный отсчёт перед записью"
              checked={settings.countdown}
              onChange={(v) => onChange({ countdown: v })}
            />
          </section>

          <button
            type="button"
            onClick={onReset}
            className="h-11 w-full rounded-xl border border-white/10 text-sm text-zinc-400 transition-colors active:bg-white/5"
          >
            Сбросить настройки
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
