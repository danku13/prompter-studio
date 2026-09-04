'use client';

/**
 * Онбординг-курс из 7 шагов (спека: docs/plan/01-onboarding.md).
 *
 * Автозапуск — не чаще одного раза за сессию показа и только когда приложение
 * реально готово (prop `active`: PIN снят и данные загружены), а курс не
 * завершён и не пропущен. Автозапуск продолжает с последнего открытого шага;
 * ручной запуск («Пройти обучение заново» из справки/меню) всегда начинает
 * с шага 1 без сброса статуса — повторное завершение обновляет completedAt.
 *
 * Любое закрытие курса (Esc, клик мимо, «Пропустить») = скип с записью
 * skippedAt; завершение — только кнопками «Готово» / «Начать работу».
 */

import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  CircleCheck,
  Clapperboard,
  FileUp,
  ListVideo,
  Smartphone,
  Sparkles,
  Video,
} from 'lucide-react';
import {
  ONBOARDING_STEPS,
  completeOnboarding,
  isOnboardingFinished,
  loadOnboarding,
  markStepSeen,
  saveOnboarding,
  skipOnboarding,
} from '@/lib/client/onboarding-store';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';

interface TourStep {
  icon: LucideIcon;
  title: string;
  text: string;
  bullets?: string[];
}

const STEPS: TourStep[] = [
  {
    icon: Clapperboard,
    title: 'Добро пожаловать в Prompter Studio',
    text: 'Это редактор сценария на компьютере и телесуфлёр с записью видео на телефоне. Устройства синхронизируются по Wi-Fi, а все данные хранятся локально на вашей машине.',
    bullets: [
      'Готовите и правите сценарий — на компьютере',
      'Читаете текст и снимаете видео — на телефоне',
    ],
  },
  {
    icon: ListVideo,
    title: 'Сценарии и секции',
    text: 'Слева — список сценариев. Внутри сценария — секции: смысловые блоки речи, например тезис, демонстрация, переход. Порядок секций легко менять.',
    bullets: [
      'Цвет секции — визуальный маркер в суфлёре',
      'Секции можно дублировать и удалять',
      'Изменения сохраняются автоматически, хронометраж — в словах в минуту',
    ],
  },
  {
    icon: FileUp,
    title: 'Импорт текста',
    text: 'Не набирайте сценарий с нуля: вставьте готовый текст или перетащите файл .txt или .md прямо в область секций редактора.',
    bullets: [
      'Строка, начинающаяся с «##», станет заголовком секции',
      'Диалог покажет предпросмотр: сколько секций будет создано',
      'Экспорт в .txt и .md — в меню «⋯» в шапке',
    ],
  },
  {
    icon: Sparkles,
    title: 'AI-помощник',
    text: 'ИИ умеет улучшать текст и разбивать длинные секции на короткие подсекции. Перед применением видно сравнение «до → после», а правку можно отменить.',
    bullets: [
      '«Встроенный» провайдер работает сразу, без ключей',
      'Или укажите свой ключ OpenAI или Claude — кнопка ✦ в шапке',
    ],
  },
  {
    icon: Smartphone,
    title: 'Подключите телефон',
    text: 'Нажмите «Подключить телефон» в шапке — появится QR-код. Отсканируйте его камерой телефона, находясь в той же Wi-Fi-сети.',
    bullets: [
      'APK-приложение подключается по ссылке из QR-кода автоматически',
      'Снятое видео остаётся на телефоне и на сервер не попадает',
    ],
  },
  {
    icon: Video,
    title: 'Суфлёр и запись',
    text: 'Телефон показывает текст и пишет видео, а вы управляете темпом речи на ходу.',
    bullets: [
      'Скорость чтения (WPM) меняется на лету',
      'Секцию можно перезапустить, не останавливая запись',
      'Дублям ставьте оценки — так проще отбирать лучшие на монтаже',
      'Перед записью — отсчёт 3-2-1',
    ],
  },
  {
    icon: CircleCheck,
    title: 'Всё готово!',
    text: 'Вы знаете всё необходимое, чтобы записать первый выпуск. Кое-что можно настроить под себя:',
    bullets: [
      'Тёмная и светлая тема — переключатель в шапке',
      'Кнопка «?» в шапке — помощь и FAQ',
      'Пройти обучение заново можно в любой момент из справки',
    ],
  },
];

export interface OnboardingTourProps {
  /** Приложение разблокировано (PIN снят) и данные загружены. */
  active: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OnboardingTour({ active, open, onOpenChange }: OnboardingTourProps) {
  const [step, setStep] = React.useState(0);
  /** true, если текущее открытие — автозапуск (продолжаем с lastStep). */
  const autoOpenRef = React.useRef(false);
  /** Автозапуск срабатывает не чаще одного раза за сессию показа. */
  const autoShownRef = React.useRef(false);

  // ---------- автозапуск ----------
  React.useEffect(() => {
    if (!active || open || autoShownRef.current) return;
    autoShownRef.current = true;
    if (isOnboardingFinished()) return;
    autoOpenRef.current = true;
    onOpenChange(true);
  }, [active, open, onOpenChange]);

  // ---------- стартовый шаг при открытии ----------
  React.useEffect(() => {
    if (!open) return;
    if (loadOnboarding() === null) saveOnboarding(); // первый визит: фиксируем startedAt
    const resumeStep = autoOpenRef.current ? loadOnboarding()?.lastStep ?? 1 : 1;
    autoOpenRef.current = false;
    const start = clampIndex(resumeStep - 1);
    setStep(start);
    markStepSeen(start);
  }, [open]);

  const last = step === STEPS.length - 1;

  const go = (next: number) => {
    const clamped = clampIndex(next);
    setStep(clamped);
    markStepSeen(clamped);
  };

  const finish = () => {
    completeOnboarding();
    onOpenChange(false);
  };

  const skip = () => {
    skipOnboarding();
    onOpenChange(false);
  };

  // закрытие «мимо» или системными путями = скип с записью skippedAt
  const handleOpenChange = (next: boolean) => {
    if (next) onOpenChange(true);
    else skip();
  };

  // ←/→ — навигация по шагам (Esc перехватывается отдельно ниже)
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight' && !last) {
      e.preventDefault();
      go(step + 1);
    } else if (e.key === 'ArrowLeft' && step > 0) {
      e.preventDefault();
      go(step - 1);
    }
  };

  const current = STEPS[step] ?? STEPS[0]!;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="flex max-h-[80dvh] flex-col gap-4 sm:max-w-lg"
        showCloseButton={false}
        onEscapeKeyDown={(e) => {
          // Esc = скип (не молчаливое закрытие): глушим Radix и пишем skippedAt
          e.preventDefault();
          skip();
        }}
        onKeyDown={onKeyDown}
      >
        {/* шапка шага: счётчик, точки прогресса, «Пропустить» */}
        <div className="flex shrink-0 items-center gap-3">
          <span className="text-xs font-medium tabular-nums text-muted-foreground">
            Шаг {step + 1} из {STEPS.length}
          </span>
          <div className="flex items-center gap-1" role="group" aria-label="Прогресс обучения">
            {STEPS.map((s, i) => (
              <button
                key={s.title}
                type="button"
                onClick={() => go(i)}
                disabled={i > step}
                aria-label={`Шаг ${i + 1} из ${STEPS.length}`}
                aria-current={i === step ? 'step' : undefined}
                title={`Шаг ${i + 1} из ${STEPS.length}`}
                className="flex size-4 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'size-2 rounded-full transition-colors',
                    i === step ? 'bg-primary' : i < step ? 'bg-primary/40' : 'bg-border'
                  )}
                />
              </button>
            ))}
          </div>
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-3 text-muted-foreground"
            onClick={skip}
          >
            Пропустить
          </Button>
        </div>

        {/* тело шага (key пересоздаёт узел → лёгкая анимация появления) */}
        <div
          key={step}
          className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto animate-in fade-in-0 slide-in-from-bottom-2 duration-200"
        >
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <current.icon className="size-5" />
          </span>
          <div className="flex flex-col gap-2">
            <DialogTitle className="text-left text-lg leading-snug font-semibold">
              {current.title}
            </DialogTitle>
            <DialogDescription className="text-left text-sm leading-relaxed">
              {current.text}
            </DialogDescription>
          </div>
          {current.bullets && (
            <ul className="flex flex-col gap-2">
              {current.bullets.map((b) => (
                <li key={b} className="flex gap-2.5 text-sm leading-relaxed text-foreground">
                  <span
                    aria-hidden="true"
                    className="mt-[7px] size-1.5 shrink-0 rounded-full bg-primary/60"
                  />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* футер шага */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-t pt-4">
          <div>
            {step > 0 && (
              <Button variant="ghost" onClick={() => go(step - 1)}>
                Назад
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            {last ? (
              <>
                <Button variant="outline" onClick={finish}>
                  Начать работу
                </Button>
                <Button onClick={finish}>Готово</Button>
              </>
            ) : (
              <Button onClick={() => go(step + 1)}>Далее</Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function clampIndex(i: number): number {
  return Math.min(Math.max(i, 0), ONBOARDING_STEPS - 1);
}
