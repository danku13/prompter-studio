'use client';

/**
 * Мобильное приложение-суфлёр — точка входа (роля MOBILE из src/app/page.tsx).
 *
 * Стейт-машина экранов: 'connect' → 'scripts' → 'prompter'.
 * Внутри экранов — локальный стейт; навигации (роутинга) нет.
 *
 * Этот же код собирается в APK через Capacitor (Vite), поэтому здесь нет
 * next/*-импортов — только React, shadcn/ui и @/lib.
 */

import { useCallback, useMemo, useState } from 'react';
import { createApiClient } from '@/lib/client/api';
import { clearConnection, type ConnectionConfig } from '@/lib/client/connection';
import type { ScriptData } from '@/lib/types';
import ConnectScreen from './connect-screen';
import PrompterScreen from './prompter-screen';
import ScriptPicker from './script-picker';

type Screen = 'connect' | 'scripts' | 'prompter';

export default function MobileApp() {
  const [screen, setScreen] = useState<Screen>('connect');
  const [cfg, setCfg] = useState<ConnectionConfig | null>(null);
  const [script, setScript] = useState<ScriptData | null>(null);

  const api = useMemo(() => (cfg ? createApiClient(cfg) : null), [cfg]);

  const handleConnected = useCallback((nextCfg: ConnectionConfig, initialScript: ScriptData) => {
    setCfg(nextCfg);
    setScript(initialScript);
    setScreen('scripts');
  }, []);

  const handleDisconnect = useCallback(() => {
    clearConnection();
    // убираем ?pair= из адреса, иначе экран подключения тут же переподключится по токену из URL
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has('pair')) {
        url.searchParams.delete('pair');
        window.history.replaceState(null, '', url);
      }
    } catch {
      /* noop */
    }
    setCfg(null);
    setScript(null);
    setScreen('connect');
  }, []);

  const handleOpenScript = useCallback((nextScript: ScriptData) => {
    setScript(nextScript);
    setScreen('prompter');
  }, []);

  const handleExitPrompter = useCallback(() => {
    setScreen('scripts');
  }, []);

  if (screen === 'scripts' && cfg && api && script) {
    return (
      <ScriptPicker
        cfg={cfg}
        api={api}
        initialScript={script}
        onOpenScript={handleOpenScript}
        onDisconnect={handleDisconnect}
      />
    );
  }

  if (screen === 'prompter' && cfg && api && script) {
    return <PrompterScreen cfg={cfg} api={api} script={script} onExit={handleExitPrompter} />;
  }

  return <ConnectScreen onConnected={handleConnected} />;
}
