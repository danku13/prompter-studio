'use client';

/**
 * Диалог импорта текста: строки с «##» — заголовки секций,
 * остальное — содержимое. Живой предпросмотр количества секций.
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

/** Парсинг: «## Название» начинает новую секцию, остальное — её содержимое */
export function parseImportText(text: string): ImportedSection[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const raw: { title: string; lines: string[] }[] = [];
  for (const line of lines) {
    if (/^##\s?/.test(line)) {
      raw.push({ title: line.replace(/^##\s?/, '').trim(), lines: [] });
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
}

export function ImportDialog({ open, onOpenChange, onImport }: ImportDialogProps) {
  const [text, setText] = React.useState('');

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
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileUp className="size-5 text-amber-600" />
            Импорт текста
          </DialogTitle>
          <DialogDescription>
            Строка, начинающаяся с «##», станет названием новой секции, остальной текст — её
            содержимым. Пустые строки разделяют абзацы.
          </DialogDescription>
        </DialogHeader>

        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'## Вступление\nПривет! В этом видео…\n\n## Основная часть\nТекст основного блока'}
          className="min-h-64"
        />

        <div className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
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

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            className="bg-amber-500 text-white hover:bg-amber-600"
            disabled={parsed.length === 0}
            onClick={doImport}
          >
            Создать секции
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
