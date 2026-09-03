# Prompter Studio — мобильное приложение (Android APK)

Мобильный суфлёр **Prompter Studio**, упакованный в Android-приложение через
[Capacitor 7](https://capacitorjs.com/). Внутри APK — тот же код, что и в мобильной
веб-версии (`src/components/mobile/**`): экран подключения, список сценариев,
суфлёр с камерой, прокруткой по WPM, записью дублей и синком с компьютером по Wi-Fi.

Сборка веб-части — **Vite** (`apk/vite.config.ts`, алиас `@` → `../src`), поэтому
Next.js для APK не нужен: мобильный UI не использует `next/*`.

---

## 1. Как собрать APK в облаке (GitHub Actions) — рекомендуемый способ

1. Запушьте изменения в ветку `main` (workflow срабатывает при правках в
   `apk/**`, `src/components/mobile/**`, `src/components/ui/**`, `src/lib/**`,
   `src/hooks/**`, `src/app/globals.css`; либо запустите вручную —
   **Actions → Build Android APK → Run workflow**).
2. Откройте вкладку **Actions** репозитория → job **Build Android APK**.
3. Когда сборка станет зелёной — в артефактах будет
   **`prompter-studio-debug-apk`** (файл `app-debug.apk`). Скачайте его.
4. На телефоне разрешите установку приложений из неизвестных источников
   (Chrome предложит это сам) и установите APK.

APK подписан debug-ключом — устанавливается на любой Android без манипуляций.

## 2. Как собрать локально (опционально)

Требования: **Bun ≥ 1.2**, **JDK 21** (не 17! `capacitor.build.gradle` требует
source/target compatibility 21), **Android SDK** (platform 35 + build-tools 35.0.0),
`ANDROID_HOME`/`ANDROID_SDK_ROOT` в окружении.

```bash
cd apk
bun install            # зависимости Vite + Capacitor
bun run build          # Vite → www/ (веб-часть)
bunx cap sync android  # www + плагины → android/
cd android
./gradlew assembleDebug --no-daemon
# результат: android/app/build/outputs/apk/debug/app-debug.apk
```

Пересборка иконок (нужен `sharp` в корневом `node_modules`):
`node apk/scripts/generate-icons.mjs` — из `public/app-icon.png` генерирует
`ic_launcher*` для всех плотностей.

Dev-сервер веб-части (в браузере, для отладки): `cd apk && bun run dev`.

## 3. Первый запуск на телефоне

- Телефон и компьютер должны быть в **одной Wi-Fi сети** (LAN).
- **Способ 1 — QR:** в веб-редакторе на компьютере нажмите «Подключить телефон»
  и отсканируйте камерой QR с `prompter://connect?...` — телефон может открыть
  ссылку камерой/сканером, приложение подхватит deep link и подключится само.
- **Способ 2 — вручную:** в приложении введите адрес компьютера
  (например `http://192.168.1.42:3000`) и код подключения из диалога на десктопе.
- Приложение запоминает подключение; сценарии кэшируются офлайн.

## 4. Технические детали

| Параметр | Значение | Зачем |
| --- | --- | --- |
| appId | `com.prompterstudio.app` | идентификатор приложения |
| webDir | `www/` | результат `vite build` копируется в APK |
| `androidScheme: https` | WebView грузит приложение с `https://localhost` | **secure context** — без него `getUserMedia` (камера) не работает |
| `cleartext: true` + `usesCleartextTraffic` | разрешён http/ws | REST/WS к LAN-компьютеру (`http://<ip>:3000`, `ws://<ip>:3030`) |
| `allowMixedContent: true` | https-страница + http-запросы | то же — смешанный контент для LAN |
| deep link `prompter://connect` | intent-filter в манифесте | QR-пейринг (обрабатывает `src/lib/client/connection.ts`) |

Разрешения Android: `INTERNET`, `ACCESS_NETWORK_STATE` (сеть), `CAMERA`,
`RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS` (запись видео), `WAKE_LOCK` (экран не гаснет).

Capacitor-плагины (подключаются через `window.Capacitor.Plugins` — см.
`src/lib/client/capacitor-bridge.ts`, без npm-импортов в общем коде):

- `@capacitor/app` — deep links (`getLaunchUrl` / `appUrlOpen`);
- `@capacitor/filesystem` + `@capacitor/share` — сохранение записанного видео
  (кэш приложения → системный «Поделиться» → Галерея/Telegram/Drive);
- `@capacitor-community/keep-awake` — экран не гасит во время суфлёрства.

### Особенность сборки: исходники вне корня Vite

Код UI лежит в `../src`, а зависимости ставятся только в `apk/node_modules`.
Node-резолюция ищет пакеты «вверх» от файла-импортёра и в CI не находит их —
поэтому в `apk/vite.config.ts` есть плагин `apk-resolve-bare-from-apk-node-modules`
(все bare-импорты резолвятся из `apk/node_modules`, ESM-входы с приоритетом —
сохраняется tree-shaking). Tailwind 4 сканирует классы только в корне проекта —
поэтому `apk/src/tailwind.css` добавляет `@source "../../src"` (без этого UI
в APK остался бы без стилей).

### Полезное

- CI: `.github/workflows/build-apk.yml` (Bun → Vite → cap sync → Gradle assembleDebug → артефакт).
- `bunx cap add android` уже выполнен; платформа `apk/android/` в репозитории
  (манифест запатчен: разрешения, cleartext, deep link).
- Если добавите Capacitor-плагин — добавьте пакет в `apk/package.json` и
  выполните `bunx cap sync android` (Gradle-файлы обновятся сами).
