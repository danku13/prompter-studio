'use client';

/**
 * Панель «Дубли»: группировка по секциям, таймкоды, длительность,
 * оценка (хороший/нормальный/плохой) и удаление. Операции — через
 * колбэки (оптимистичные обновления делает desktop-app).
 */

import * as React from 'react';
import { Check, Film, RefreshCw, ThumbsDown, ThumbsUp, Trash2 } from 'lucide-react';
import type { TakeRating, TakeRecord } from '@/lib/types';
import { formatDuration, formatTimecode } from '@/lib/text';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { THIN_SCROLL, plural } from './utils';

const RATING_BUTTONS: {
  value: TakeRating;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: string;
}[] = [
  {
    value: 'good',
    label: 'Хороший дубль',
    icon: ThumbsUp,
    active:
      'bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-400 dark:hover:bg-emerald-950',
  },
  {
    value: 'ok',
    label: 'Нормальный дубль',
    icon: Check,
    active:
      'bg-amber-100 text-amber-700 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-400 dark:hover:bg-amber-950',
  },
  {
    value: 'bad',
    label: 'Плохой дубль',
    icon: ThumbsDown,
    active:
      'bg-rose-100 text-rose-700 hover:bg-rose-100 dark:bg-rose-950 dark:text-rose-400 dark:hover:bg-rose-950',
  },
];

export interface TakesPanelProps {
  takes: TakeRecord[];
  onRate: (take: TakeRecord, rating: TakeRating | null) => void;
  onDelete: (take: TakeRecord) => void;
  onRefresh: () => void;
}

export function TakesPanel({ takes, onRate, onDelete, onRefresh }: TakesPanelProps) {
  const groups = React.useMemo(() => {
    const map = new Map<string, TakeRecord[]>();
    for (const t of takes) {
      const key = t.sectionTitle?.trim() || 'Без названия';
      const list = map.get(key);
      if (list) list.push(t);
      else map.set(key, [t]);
    }
    return Array.from(map.entries());
  }, [takes]);

  return (
    <div className={cn('flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-3', THIN_SCROLL)}>
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-xs font-medium tabular-nums text-muted-foreground">
          {takes.length} {plural(takes.length, 'дубль', 'дубля', 'дублей')}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto size-7 text-muted-foreground"
          onClick={onRefresh}
          title="Обновить список дублей"
        >
          <RefreshCw className="size-3.5" />
        </Button>
      </div>

      {takes.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-6 text-center">
          <div className="rounded-full bg-muted p-3">
            <Film className="size-6 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium">Дублей пока нет</p>
            <p className="mt-1 max-w-60 text-xs text-muted-foreground">
              Дубли появляются, когда на телефоне нажимают «кусок заново» во время записи.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map(([title, list]) => (
            <div key={title} className="flex flex-col gap-2">
              <div className="flex items-center gap-2 px-0.5">
                <span className="truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {title}
                </span>
                <Badge variant="secondary" className="h-4 px-1.5 text-[10px] tabular-nums">
                  {list.length}
                </Badge>
              </div>
              {list.map((t) => (
                <div key={t.id} className="rounded-lg border bg-card p-2.5 shadow-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                      {formatTimecode(t.t0)}–{formatTimecode(t.t1)}
                    </span>
                    <Badge variant="secondary" className="tabular-nums">
                      {formatDuration(t.durationMs / 1000)}
                    </Badge>
                  </div>
                  <div className="mt-1.5 flex items-center gap-0.5">
                    {RATING_BUTTONS.map(({ value, label, icon: Icon, active }) => (
                      <Button
                        key={value}
                        variant="ghost"
                        size="icon"
                        title={label}
                        aria-label={label}
                        className={cn('size-7 text-muted-foreground', t.rating === value && active)}
                        onClick={() => onRate(t, t.rating === value ? null : value)}
                      >
                        <Icon className="size-3.5" />
                      </Button>
                    ))}
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Удалить дубль"
                      aria-label="Удалить дубль"
                      className="ml-auto size-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => onDelete(t)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
