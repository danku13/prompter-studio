'use client';

/**
 * Справка: быстрые действия и FAQ по частым вопросам.
 *
 * Открывается кнопкой «?» в шапке (или меню «⋯» → «Помощь и FAQ…»).
 * «Пройти обучение заново» делегируется наверх (onStartOnboarding) —
 * сам курс и его состояние живут в OnboardingTour / onboarding-store.
 * PIN-диалог здесь не открывается намеренно: он принадлежит desktop-app,
 * поэтому для PIN — только текстовая подсказка, где его искать.
 */

import { CircleHelp, CirclePlay, KeyRound } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { THIN_SCROLL } from './utils';

interface FaqItem {
  q: string;
  a: string;
}

const FAQ_ITEMS: FaqItem[] = [
  {
    q: 'Как подключить телефон?',
    a: 'Нажмите «Подключить телефон» в шапке редактора и отсканируйте QR-код камерой телефона. Телефон и компьютер должны быть в одной Wi-Fi-сети, а мини-сервис синхронизации (порт 3030) — запущен. APK-приложение подключается по ссылке из QR-кода автоматически.',
  },
  {
    q: 'Телефон не подключается, нет связи',
    a: 'Проверьте, что телефон и компьютер находятся в одной Wi-Fi-сети, а брандмауэр Windows пропускает порты 3000 и 3030. В суфлёре тапните точку статуса в углу экрана — она объяснит конкретную причину.',
  },
  {
    q: 'Не записывается видео',
    a: 'Браузер даёт доступ к камере только на HTTPS или localhost: откройте студию по адресу localhost или используйте APK-приложение. Снятое видео сохраняется на телефоне и на сервер не попадает.',
  },
  {
    q: 'Текст не обновляется в суфлёре',
    a: 'Убедитесь, что мини-сервис синхронизации (порт 3030) запущен, а редактор и суфлёр открыли один и тот же сценарий. При восстановлении связи суфлёр сам подтянет свежую версию текста.',
  },
  {
    q: 'AI-помощник не работает',
    a: 'Откройте настройки кнопкой ✦ в шапке: провайдер «Встроенный» работает без ключей. Для OpenAI или Claude вставьте свой ключ и нажмите «Проверить подключение». Перед применением видно сравнение «до → после», а отменить правку можно баннером в карточке секции.',
  },
  {
    q: 'Как защитить доступ в кафе или коворкинге?',
    a: 'Откройте меню «⋯» → «PIN-код…» и задайте код: без PIN редактор открыт всей Wi-Fi-сети, а после включения каждая сессия вводит PIN. Телефон подключается по QR-коду как раньше.',
  },
  {
    q: 'Как импортировать и экспортировать текст?',
    a: 'Вставьте текст в диалог «Импорт текста» или перетащите файл .txt или .md в область секций — строки с «##» станут заголовками. Экспорт в .txt и .md — в меню «⋯» в шапке.',
  },
  {
    q: 'Что значит «Сценарий изменён на другом устройстве»?',
    a: 'Это конфликт ревизий: сценарий правили в другом окне, и загрузилась более свежая версия. Данные не теряются — сохраняются правки того, кто сохранился первым. Это штатная ситуация.',
  },
  {
    q: 'Где хранятся мои данные?',
    a: 'Всё хранится локально на вашем компьютере в базе SQLite. API-ключи AI тоже лежат только на компьютере и наружу не отдаются: в интерфейсе видны лишь маски ключей.',
  },
  {
    q: 'Что такое дубли и оценки?',
    a: 'Во время записи телефон отправляет метку дубля для текущей секции. Список дублей виден в панели «Дубли» справа. Оценки «хорошо / норм / плохо» помогают отобрать лучшие дубли при монтаже.',
  },
];

export interface HelpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Перезапустить онбординг-курс (справа закрывается, курс открывается). */
  onStartOnboarding: () => void;
}

export function HelpDialog({ open, onOpenChange, onStartOnboarding }: HelpDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[80dvh] flex-col gap-4 sm:max-w-xl">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <CircleHelp className="size-5 text-primary" />
            Помощь и FAQ
          </DialogTitle>
          <DialogDescription>
            Ответы на частые вопросы о сценариях, телефоне и записи. Быстрые действия — ниже.
          </DialogDescription>
        </DialogHeader>

        {/* быстрые действия */}
        <div className="grid shrink-0 gap-2 sm:grid-cols-2">
          <Button
            variant="outline"
            className="h-auto justify-start gap-3 whitespace-normal p-4 text-left"
            onClick={onStartOnboarding}
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <CirclePlay className="size-4" />
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">Пройти обучение заново</span>
              <span className="text-xs text-muted-foreground">7 коротких шагов</span>
            </span>
          </Button>
          <div className="flex items-start gap-3 rounded-md border p-4">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <KeyRound className="size-4" />
            </span>
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">Настроить PIN-код</span>
              <span className="text-xs text-muted-foreground">
                Меню «⋯» в шапке → «PIN-код…»
              </span>
            </div>
          </div>
        </div>

        {/* FAQ */}
        <div className={cn('min-h-0 flex-1 overflow-y-auto pr-1', THIN_SCROLL)}>
          <Accordion type="single" collapsible className="w-full">
            {FAQ_ITEMS.map((item, i) => (
              <AccordionItem key={item.q} value={`faq-${i}`}>
                <AccordionTrigger className="text-left text-sm">{item.q}</AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>

        {/* футер */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-t pt-4">
          <p className="text-xs text-muted-foreground">
            Обучение и справка всегда доступны через кнопку «?» в шапке.
          </p>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Закрыть
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
