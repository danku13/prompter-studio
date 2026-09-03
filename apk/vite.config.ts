import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire, isBuiltin } from 'node:module';

// Каталог apk/ (vite.config.ts лежит в нём) — ESM-безопасно, без __dirname.
const here = path.dirname(fileURLToPath(import.meta.url));
const requireFromApk = createRequire(path.resolve(here, 'package.json'));
const nodeModulesDir = path.join(here, 'node_modules');

/**
 * ЗАЧЕМ ЭТОТ ПЛАГИН: общие исходники живут в ../src — ВНЕ корня Vite-проекта.
 * Node-резолюция bare-импортов идёт вверх от файла-импортёра: ../src/... →
 * ../node_modules (корень репозитория). Локально это работает (в корне есть
 * node_modules), но в GitHub Actions ставятся ТОЛЬКО зависимости apk/ — и тогда
 * vite падает с «Rollup failed to resolve import "lucide-react"».
 *
 * Плагин резолвит все bare-импорты (npm-пакеты, CSS-@import'ы вроде
 * tw-animate-css) строго из apk/node_modules: одинаково в песочнице и в CI,
 * один экземпляр React на бандл. ESM-входы предпочитаем CJS — сохраняется
 * tree-shaking (lucide-react ESM vs CJS: ~0.5 МБ vs ~1.2 МБ бандла).
 */

const resolveCache = new Map<string, string | null>();

function fileFromEntry(pkgDir: string, entry: string): string | null {
  const file = path.resolve(pkgDir, entry);
  if (fs.existsSync(file)) return file;
  for (const ext of ['.mjs', '.js', '.cjs', '.css']) {
    if (fs.existsSync(file + ext)) return file + ext;
  }
  for (const idx of ['index.mjs', 'index.js', 'index.cjs']) {
    const f = path.join(file, idx);
    if (fs.existsSync(f)) return f;
  }
  return null;
}

/** exports["."] может быть строкой или картой условий — вынимаем входную точку. */
function entryFromExportsDot(exp: unknown): string | undefined {
  if (typeof exp === 'string') return exp;
  if (!exp || typeof exp !== 'object') return undefined;
  const rec = exp as Record<string, unknown>;
  for (const key of ['import', 'style', 'module', 'esm', 'browser', 'default', 'require']) {
    const v = rec[key];
    if (typeof v === 'string') return v;
    if (v && typeof v === 'object') {
      const nested = entryFromExportsDot(v);
      if (nested) return nested;
    }
  }
  return undefined;
}

/** Резолв пакета БЕЗ субпейджа по package.json с приоритетом ESM. */
function resolvePackageEntry(id: string): string | null {
  const pkgDir = path.join(nodeModulesDir, id);
  const pkgJsonPath = path.join(pkgDir, 'package.json');
  let pkg: Record<string, unknown> | null = null;
  try {
    pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
  const pkgExports = (pkg as { exports?: unknown }).exports;
  const fromExports = entryFromExportsDot(
    (pkgExports && typeof pkgExports === 'object' ? (pkgExports as Record<string, unknown>)['.'] : undefined) ?? undefined,
  );
  const entry = fromExports ?? (pkg.module as string | undefined) ?? (pkg.main as string | undefined);
  if (typeof entry !== 'string') return null;
  return fileFromEntry(pkgDir, entry);
}

/** Пытаемся достать id из apk/node_modules (ESM → CJS → subpath через require.resolve). */
function resolveFromApk(id: string): string | null {
  if (resolveCache.has(id)) return resolveCache.get(id) ?? null;

  let resolved: string | null = null;
  const hasSubpath = id.split('/').length > (id.startsWith('@') ? 2 : 1);
  const queryless = id.split('?')[0];
  if (!hasSubpath && queryless === id) {
    resolved = resolvePackageEntry(id);
  }
  if (!resolved) {
    try {
      resolved = requireFromApk.resolve(queryless);
    } catch {
      resolved = null;
    }
  }
  if (resolved && !fs.existsSync(resolved)) resolved = null;

  resolveCache.set(id, resolved);
  return resolved;
}

const resolveFromApkNodeModules: Plugin = {
  name: 'apk-resolve-bare-from-apk-node-modules',
  enforce: 'pre',
  resolveId(source) {
    if (
      source.startsWith('.') ||
      source.startsWith('/') ||
      path.isAbsolute(source) ||
      source.startsWith('\0') ||
      source.startsWith('\x00') ||
      source.startsWith('node:') ||
      // встроенные модули Node (tty/util/events внутри engine.io-client) — Vite сам
      // экстернализует их для браузера; не даём резолверу их «резолвить»
      isBuiltin(source) ||
      // алиас проекта @/… (не путать со scoped-пакетами @radix-ui/…)
      source.startsWith('@/')
    ) {
      return null;
    }
    const resolved = resolveFromApk(source);
    // нет такого пакета в apk/node_modules — пусть резолвит Vite (алиасы, virtual и т.п.)
    return resolved ?? null;
  },
};

export default defineConfig({
  plugins: [resolveFromApkNodeModules, react(), tailwindcss()],
  resolve: {
    // '@' → общий src/ веб-версии (мобильный UI живёт там же: src/components/mobile/**)
    alias: { '@': path.resolve(here, '../src') },
    // страховка: даже если кто-то уберёт плагин выше, react/react-dom берём из apk/
    dedupe: ['react', 'react-dom'],
  },
  server: { fs: { allow: ['..'] } },
  build: {
    outDir: 'www',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
    target: 'es2020',
  },
});
