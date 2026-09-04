'use client';

/**
 * Sidebar со списком сценариев: создание (inline-название),
 * переименование двойным кликом, удаление с подтверждением.
 * Используется и в постоянном aside (lg+), и в Sheet (<lg).
 */

import * as React from 'react';
import { FileText, Plus, Trash2, X } from 'lucide-react';
import type { ScriptSummary } from '@/lib/types';
import { formatRelative } from '@/lib/text';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { THIN_SCROLL } from './utils';

export interface ScriptSidebarProps {
  /** null — идёт загрузка */
  scripts: ScriptSummary[] | null;
  error: string | null;
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: (title: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onRetry: () => void;
}

export function ScriptSidebar({
  scripts,
  error,
  activeId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  onRetry,
}: ScriptSidebarProps) {
  const [creating, setCreating] = React.useState(false);
  const [draftTitle, setDraftTitle] = React.useState('');
  const [renamingId, setRenamingId] = React.useState<string | null>(null);
  const [renameValue, setRenameValue] = React.useState('');
  const [deleteTarget, setDeleteTarget] = React.useState<ScriptSummary | null>(null);

  const submitCreate = () => {
    onCreate(draftTitle.trim() || 'Новый сценарий');
    setDraftTitle('');
    setCreating(false);
  };

  const cancelCreate = () => {
    setDraftTitle('');
    setCreating(false);
  };

  const startRename = (s: ScriptSummary) => {
    setRenamingId(s.id);
    setRenameValue(s.title);
  };

  const commitRename = () => {
    const id = renamingId;
    if (id) {
      const target = scripts?.find((s) => s.id === id);
      const title = renameValue.trim();
      if (target && title && title !== target.title) onRename(id, title);
    }
    setRenamingId(null);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Сценарии
        </h2>
        {scripts && scripts.length > 0 && (
          <span className="text-xs tabular-nums text-muted-foreground">{scripts.length}</span>
        )}
      </div>

      <div className={cn('min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-3', THIN_SCROLL)}>
        {/* загрузка */}
        {scripts === null && error === null && (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        )}

        {/* ошибка сети */}
        {error !== null && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
            <p className="text-sm font-medium text-destructive">Не удалось загрузить список</p>
            <p className="mt-1 text-xs text-muted-foreground">{error}</p>
            <Button variant="outline" size="sm" className="mt-2 w-full" onClick={onRetry}>
              Повторить
            </Button>
          </div>
        )}

        {/* inline-создание */}
        {creating && (
          <div className="rounded-lg border border-primary/40 bg-primary/5 p-2">
            <Input
              autoFocus
              value={draftTitle}
              placeholder="Название сценария"
              onChange={(e) => setDraftTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitCreate();
                if (e.key === 'Escape') cancelCreate();
              }}
              className="h-8"
            />
            <div className="mt-2 flex items-center gap-1">
              <Button
                size="sm"
                className="h-7 flex-1"
                onClick={submitCreate}
              >
                <Plus className="size-3.5" />
                Создать
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-muted-foreground"
                onClick={cancelCreate}
                title="Отменить"
              >
                <X className="size-3.5" />
              </Button>
            </div>
          </div>
        )}

        {/* пустое состояние */}
        {scripts !== null && scripts.length === 0 && error === null && !creating && (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-5 text-center">
            <FileText className="size-7 text-muted-foreground/60" />
            <p className="text-sm text-muted-foreground">Сценариев пока нет</p>
            <Button
              size="sm"
              onClick={() => setCreating(true)}
            >
              <Plus className="size-3.5" />
              Создать первый
            </Button>
          </div>
        )}

        {/* карточки сценариев */}
        {scripts?.map((s) => {
          const active = s.id === activeId;
          const renaming = s.id === renamingId;
          return (
            <div
              key={s.id}
              role="button"
              tabIndex={0}
              onClick={() => {
                if (!renaming) onSelect(s.id);
              }}
              onDoubleClick={() => {
                if (!renaming) startRename(s);
              }}
              onKeyDown={(e) => {
                if ((e.key === 'Enter' || e.key === ' ') && !renaming) {
                  e.preventDefault();
                  onSelect(s.id);
                }
              }}
              title={renaming ? undefined : 'Двойной клик — переименовать'}
              className={cn(
                'group w-full cursor-pointer rounded-lg border p-3 text-left outline-none transition-colors',
                'focus-visible:ring-2 focus-visible:ring-ring',
                active
                  ? 'border-foreground/25 bg-muted'
                  : 'border-border bg-card hover:bg-accent/60'
              )}
            >
              {renaming ? (
                <Input
                  autoFocus
                  value={renameValue}
                  placeholder="Название сценария"
                  onChange={(e) => setRenameValue(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') commitRename();
                    if (e.key === 'Escape') setRenamingId(null);
                  }}
                  onBlur={commitRename}
                  className="h-7"
                />
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <span className={cn('truncate text-sm', active ? 'font-semibold' : 'font-medium')}>
                    {s.title || 'Без названия'}
                  </span>
                  <span
                    role="button"
                    tabIndex={0}
                    title="Удалить сценарий"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget(s);
                    }}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === 'Enter' || e.key === ' ') setDeleteTarget(s);
                    }}
                    className="shrink-0 rounded p-1 text-muted-foreground/50 opacity-0 transition-all group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 focus-visible:outline-none"
                  >
                    <Trash2 className="size-3.5" />
                  </span>
                </div>
              )}
              <div className="mt-1.5 flex flex-col gap-0.5 text-xs text-muted-foreground">
                <span className="tabular-nums">
                  {s.sectionCount} секц. • {s.wordCount} слов
                </span>
                <span className="text-muted-foreground/70">обновлён {formatRelative(s.updatedAt)}</span>
              </div>
            </div>
          );
        })}
      </div>

      {scripts !== null && scripts.length > 0 && (
        <div className="shrink-0 border-t p-3">
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => setCreating((c) => !c)}
          >
            <Plus className="size-3.5" />
            Новый сценарий
          </Button>
        </div>
      )}

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить сценарий?</AlertDialogTitle>
            <AlertDialogDescription>
              «{deleteTarget?.title || 'Без названия'}», все его секции и дубли будут удалены
              безвозвратно.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget) onDelete(deleteTarget.id);
                setDeleteTarget(null);
              }}
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
