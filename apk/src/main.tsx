/**
 * Точка входа мобильного приложения (APK через Capacitor + Vite).
 *
 * Код UI общий с веб-версией: монтируем MobileApp из ../src/components/mobile.
 * Директивы 'use client' в общих файлах — просто строки, Vite их игнорирует.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Фолбэки шрифтов Geist (в Next их задаёт layout.tsx, в APK их нет) — ДО основных стилей,
// чтобы var(--font-geist-sans)/var(--font-geist-mono) из @theme имели значения.
import './app-fonts.css';
// Общие стили веб-версии (Tailwind 4 + tw-animate-css) + @source ../src для сканирования классов.
import './tailwind.css';

import MobileApp from '@/components/mobile/mobile-app';
// В веб-версии <Toaster/> монтируется в src/app/layout.tsx; в APK его заменяем здесь,
// иначе тосты мобильного UI (ошибки сети, «Сценарий сохранён» и т.п.) не показывались бы.
import { Toaster } from '@/components/ui/toaster';

const el = document.getElementById('root');
if (!el) throw new Error('Не найден #root в index.html');

createRoot(el).render(
  <StrictMode>
    <MobileApp />
    <Toaster />
  </StrictMode>,
);
