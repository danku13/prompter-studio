'use client';

/**
 * Диалог импорта текста: строки с «##» — заголовки секций,
 * остальное — содержимое. Живой предпросмотр количества секций.
 *
 * Высота диалога ограничена 80% экрана: при вставке длинного текста
 * текстовый блок растёт до свободного лимита, дальше включается
 * его собственная прокрутка (окно никогда не выезжает за экран).
 *
 * Сюда же «приземляется» файл, брошенный в область секций редактора
 * (drag-and-drop .txt / .md): диалог открывается с предзаполненным
 * текстом, пользователь видит предпросмотр и подтверждает импорт.
 */

import * as React from 'react';
import { FileUp } from 'lucide-react';
import { countWords } from '@/lib/text';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export interface ImportedSection {
  title: string;
  content: string;
}

/**
 * Парсинг:
 *  - «## Название» (и deeper-заголовки md) — заголовок новой секции;
 *  - «# Название» (h1 — так экспорт .md пишет имя сценария) — пропускается;
 *  - остальное — содержимое секции.
 */
export function parseImportText(text: string): ImportedSection[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const raw: { title: string; lines: string[] }[] = [];
  for (const line of lines) {
    if (/^#{2,}\s?/.test(line)) {
      raw.push({ title: line.replace(/^#{2,}\s?/, '').trim(), lines: [] });
    } else if (/^#\s+/.test(line)) {
      // заголовок всего документа (h1) — секции не создаёт
      continue;
    } else {
      if (raw.length === 0) raw.push({ title: '', lines: [] });
      raw[raw.length - 1].lines.push(line);
    }
  }
  return raw
    .map((s) => ({
      title: s.title,
      content: s.lines.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
    }))
    .filter((s) => s.title !== '' || s.content !== '');
}

export interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (sections: ImportedSection[]) => void;
  /** текст для предзаполнения (файл из drag-and-drop); null — обычное открытие */
  seed?: string | null;
}

export function ImportDialog({ open, onOpenChange, onImport, seed }: ImportDialogProps) {
  const [text, setText] = React.useState('');

  // предзаполнение при открытии с брошенным файлом
  React.useEffect(() => {
    if (open && seed != null) setText(seed);
  }, [open, seed]);

  const parsed = React.useMemo(() => parseImportText(text), [text]);
  const words = React.useMemo(
    () => parsed.reduce((sum, s) => sum + countWords(s.content), 0),
    [parsed]
  );

  const doImport = () => {
    if (parsed.length === 0) return;
    onImport(parsed);
    setText('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[80dvh] flex-col gap-4 sm:max-w-xl">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <FileUp className="size-5 text-primary" />
            Импорт текста
          </DialogTitle>
          <DialogDescription>
            Строка, начинающаяся с «##», станет названием новой секции, остальной текст — её
            содержимым. Пустые строки разделяют абзацы. Файл .txt или .md можно перетащить
            прямо в редактор.
          </DialogDescription>
        </DialogHeader>

        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'## Вступление\nПривет! В этом видео…\n\n## Основная часть\nТекст основного блока'}
          aria-label="Текст для импорта"
          className="min-h-32 max-h-[50dvh] resize-none overflow-y-auto"
        />

        <div className="shrink-0 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
          {parsed.length > 0 ? (
            <>
              Будет создано секций:{' '}
              <span className="font-semibold tabular-nums text-foreground">{parsed.length}</span>
              {' • '}слов: <span className="font-semibold tabular-nums text-foreground">{words}</span>
            </>
          ) : (
            'Введите текст, чтобы увидеть предпросмотр.'
          )}
        </div>

        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button disabled={parsed.length === 0} onClick={doImport}>
            Создать секции
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
