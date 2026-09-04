'use client';

/**
 * Диалог настроек AI-помощника (BYOK, агент 5).
 *
 * Три провайдера:
 *  - «Встроенный» — без ключа, работает сразу (z-ai на сервере);
 *  - «OpenAI API» — свой ключ, совместимо с OpenAI и OpenAI-подобными прокси;
 *  - «Claude API» — свой ключ Anthropic (Messages API).
 *
 * Ключи клиенту не показываются: поле ввода пустое с плейсхолдером-маской
 * («Сохранён: sk-…9f2c»). Проверка подключения идёт до сохранения —
 * инлайн-поля улетают в POST /api/ai/test.
 */

import * as React from 'react';
import { Check, Eye, EyeOff, ExternalLink, KeyRound, Loader2, Sparkles, Trash2 } from 'lucide-react';
import type { AiProviderName, AiSettingsView } from '@/lib/types';
import { ApiClient } from '@/lib/client/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { errorMessage } from './utils';

type ByokProvider = Exclude<AiProviderName, 'builtin'>;

interface ProviderDraft {
  key: string;
  baseUrl: string;
  model: string;
  clearKey: boolean;
}

function emptyDraft(): ProviderDraft {
  return { key: '', baseUrl: '', model: '', clearKey: false };
}

const PROVIDER_META: Record<ByokProvider, { title: string; hint: string; keyUrl: string; keyPlaceholder: string }> = {
  openai: {
    title: 'OpenAI API',
    hint: 'Совместимо с OpenAI и любым OpenAI-подобным API (прокси, шлюзы).',
    keyUrl: 'https://platform.openai.com/api-keys',
    keyPlaceholder: 'sk-…',
  },
  anthropic: {
    title: 'Claude API',
    hint: 'Anthropic Messages API: ключ вида sk-ant-…, модель claude-…',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    keyPlaceholder: 'sk-ant-…',
  },
};

export interface AiSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  api: ApiClient;
}

export function AiSettingsDialog({ open, onOpenChange, api }: AiSettingsDialogProps) {
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [tab, setTab] = React.useState<ByokProvider>('openai');
  const [defaultProvider, setDefaultProvider] = React.useState<AiProviderName>('builtin');
  const [drafts, setDrafts] = React.useState<Record<ByokProvider, ProviderDraft>>({
    openai: emptyDraft(),
    anthropic: emptyDraft(),
  });
  const [view, setView] = React.useState<AiSettingsView | null>(null);
  const [showKey, setShowKey] = React.useState(false);
  const [testState, setTestState] = React.useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');
  const [testMessage, setTestMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // сброс состояния при открытии + загрузка настроек
  React.useEffect(() => {
    if (!open) return;
    setTestState('idle');
    setTestMessage(null);
    setError(null);
    setShowKey(false);
    setDrafts({ openai: emptyDraft(), anthropic: emptyDraft() });
    setLoading(true);
    api
      .aiSettings()
      .then((v) => {
        setView(v);
        setDefaultProvider(v.defaultProvider);
      })
      .catch((e: unknown) => setError(errorMessage(e)))
      .finally(() => setLoading(false));
  }, [open, api]);

  const currentView = view ? (tab === 'openai' ? view.openai : view.anthropic) : null;
  const draft = drafts[tab];

  const patchDraft = React.useCallback(
    (provider: ByokProvider, patch: Partial<ProviderDraft>) => {
      setDrafts((prev) => ({ ...prev, [provider]: { ...prev[provider], ...patch } }));
      setTestState('idle');
      setTestMessage(null);
    },
    []
  );

  const effectiveBaseUrl = draft.baseUrl.trim() || currentView?.baseUrl || '';
  const effectiveModel = draft.model.trim() || currentView?.model || '';

  const runTest = React.useCallback(async () => {
    setTestState('testing');
    setTestMessage(null);
    try {
      const res = await api.aiTest({
        provider: tab,
        ...(draft.key.trim() ? { key: draft.key.trim() } : {}),
        ...(effectiveBaseUrl ? { baseUrl: effectiveBaseUrl } : {}),
        ...(effectiveModel ? { model: effectiveModel } : {}),
      });
      setTestState('ok');
      setTestMessage(`Подключение работает: «${res.reply.slice(0, 40)}»`);
    } catch (e) {
      setTestState('fail');
      setTestMessage(errorMessage(e));
    }
  }, [api, tab, draft.key, effectiveBaseUrl, effectiveModel]);

  const save = React.useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const payload: Parameters<ApiClient['aiSaveSettings']>[0] = { defaultProvider };
      for (const p of ['openai', 'anthropic'] as const) {
        const d = drafts[p];
        const patch: { key?: string | null; baseUrl?: string; model?: string } = {};
        if (d.clearKey) patch.key = null;
        else if (d.key.trim()) patch.key = d.key.trim();
        if (d.baseUrl.trim()) patch.baseUrl = d.baseUrl.trim();
        if (d.model.trim()) patch.model = d.model.trim();
        if (Object.keys(patch).length > 0) payload[p] = patch;
      }
      const updated = await api.aiSaveSettings(payload);
      setView(updated);
      setDrafts({ openai: emptyDraft(), anthropic: emptyDraft() });
      setTestState('idle');
      setTestMessage(null);
      onOpenChange(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }, [api, defaultProvider, drafts, onOpenChange]);

  const hasChanges =
    defaultProvider !== (view?.defaultProvider ?? 'builtin') ||
    (['openai', 'anthropic'] as const).some((p) => {
      const d = drafts[p];
      return d.key.trim().length > 0 || d.clearKey || d.baseUrl.trim().length > 0 || d.model.trim().length > 0;
    });

  const meta = PROVIDER_META[tab];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-amber-500 text-white">
              <Sparkles className="size-4" />
            </span>
            AI-помощник — свои ключи (BYOK)
          </DialogTitle>
          <DialogDescription>
            Ключи хранятся только на этом компьютере и уходят исключительно в API выбранного
            провайдера. Нужны для «Улучшить текст» и «Разбить на подсекции».
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Загружаю настройки…
          </div>
        )}

        {!loading && (
          <div className="space-y-4">
            {/* активный провайдер */}
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground">
                Провайдер для AI-функций
              </Label>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    { value: 'builtin', label: 'Встроенный' },
                    { value: 'openai', label: 'OpenAI' },
                    { value: 'anthropic', label: 'Claude' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setDefaultProvider(opt.value)}
                    className={cn(
                      'flex min-h-9 items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-sm transition-colors',
                      defaultProvider === opt.value
                        ? 'border-amber-500 bg-amber-500/10 font-medium text-amber-700 dark:text-amber-400'
                        : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                    )}
                  >
                    {defaultProvider === opt.value && <Check className="size-3.5" />}
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {defaultProvider === 'builtin'
                  ? 'Встроенный провайдер работает без ключа — можно начать прямо сейчас.'
                  : `Используется ${defaultProvider === 'openai' ? 'OpenAI API' : 'Claude API'} с вашим ключом.`}
              </p>
            </div>

            {/* настройки ключей */}
            <Tabs value={tab} onValueChange={(v) => setTab(v as ByokProvider)}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="openai">OpenAI API</TabsTrigger>
                <TabsTrigger value="anthropic">Claude API</TabsTrigger>
              </TabsList>

              {(['openai', 'anthropic'] as const).map((p) => {
                const m = PROVIDER_META[p];
                const d = drafts[p];
                const v = view ? (p === 'openai' ? view.openai : view.anthropic) : null;
                return (
                  <TabsContent key={p} value={p} className="space-y-3 pt-1">
                    <p className="text-xs text-muted-foreground">{m.hint}</p>

                    <div className="space-y-1.5">
                      <Label htmlFor={`ai-key-${p}`} className="flex items-center gap-1.5">
                        <KeyRound className="size-3.5" />
                        API-ключ
                      </Label>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Input
                            id={`ai-key-${p}`}
                            type={showKey ? 'text' : 'password'}
                            autoComplete="off"
                            value={d.key}
                            placeholder={
                              d.clearKey
                                ? 'Ключ будет удалён'
                                : v?.keyHint
                                  ? `Сохранён: ${v.keyHint} (введите новый для замены)`
                                  : m.keyPlaceholder
                            }
                            onChange={(e) => patchDraft(p, { key: e.target.value, clearKey: false })}
                            className="pr-9 font-mono text-sm"
                          />
                          <button
                            type="button"
                            onClick={() => setShowKey((s) => !s)}
                            title={showKey ? 'Скрыть ключ' : 'Показать ключ'}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                          >
                            {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                          </button>
                        </div>
                        {v?.hasKey && !d.key && (
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="size-9 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            title="Удалить сохранённый ключ"
                            onClick={() => patchDraft(p, { clearKey: true })}
                            disabled={d.clearKey}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Взять ключ:{' '}
                        <a
                          href={m.keyUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-0.5 underline underline-offset-2 hover:text-foreground"
                        >
                          {m.keyUrl.replace('https://', '')}
                          <ExternalLink className="size-3" />
                        </a>
                      </p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor={`ai-base-${p}`}>Base URL</Label>
                        <Input
                          id={`ai-base-${p}`}
                          value={d.baseUrl}
                          placeholder={v?.baseUrl ?? m.keyUrl}
                          onChange={(e) => patchDraft(p, { baseUrl: e.target.value })}
                          className="font-mono text-sm"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`ai-model-${p}`}>Модель</Label>
                        <Input
                          id={`ai-model-${p}`}
                          value={d.model}
                          placeholder={v?.model ?? ''}
                          onChange={(e) => patchDraft(p, { model: e.target.value })}
                          className="font-mono text-sm"
                        />
                      </div>
                    </div>
                  </TabsContent>
                );
              })}
            </Tabs>

            {/* проверка подключения */}
            <div className="space-y-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                disabled={testState === 'testing'}
                onClick={() => void runTest()}
              >
                {testState === 'testing' ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    Проверяю подключение к {meta.title}…
                  </>
                ) : (
                  <>
                    <Sparkles className="size-3.5" />
                    Проверить подключение к {meta.title}
                  </>
                )}
              </Button>
              {testMessage && (
                <p
                  className={cn(
                    'text-xs',
                    testState === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                  )}
                >
                  {testMessage}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Проверка отправит крошечный запрос и подтвердит ключ, адрес и модель (без сохранения).
              </p>
            </div>

            {error && (
              <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-red-600 dark:text-red-400">
                {error}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            className="bg-amber-500 text-white hover:bg-amber-600"
            disabled={saving || loading || !hasChanges}
            onClick={() => void save()}
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
