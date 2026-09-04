# План 02 — Регистрация и авторизация: Яндекс ID и Google ID

Статус: 📋 план (M2).

Требование пользователя: «подготовь проект к внедрению регистрации и
авторизации через Яндекс ID и Google ID и учитывай безопасное хранение данных».

Контекст: приложение однопользовательское (LAN-режим, сервер на компьютере
пользователя, телефон по QR). PIN-защита REST (P0-фикс) внедряется параллельно
и к моменту этой задачи уже есть — авторизация **не заменяет** PIN, а
сосуществует с ним (см. §7).

---

## 1. Выбор технологии: NextAuth.js v4

**Решение: NextAuth.js v4 (`next-auth@^4.24.11` — уже в зависимостях проекта) с
кастомным OAuth-провайдером YandexID и встроенным Google.**

Обоснование:

| Аргумент | Пояснение |
|---|---|
| Уже в зависимостях | next-auth v4 стоит в `package.json`; нулевая цена входа, никаких новых тяжёлых зависимостей |
| Сессии и CSRF из коробки | Cookie-сессии (httpOnly), встроенная CSRF-защита (`next-auth/csrf`), state-параметр и (для провайдеров с поддержкой) PKCE |
| Адаптер Prisma | `@next-auth/prisma-adapter` ложится на наши модели `User`/`Account`/`Session` без изменений имён |
| Готовый Google-провайдер | `Providers.Google` требует только clientId/secret |
| Кастомные провайдеры | Yandex описывается одним объектом (endpoints + маппинг профиля) — в v3 NextAuth такой провайдер был встроенным, в v4 добавляем сами |
| Зрелость и примеры | Многочисленные production-кейсы, предсказуемые механизмы |

Альтернативы отклонены: Auth.js v5 (не в зависимостях, breaking-имена,
стабильность на Next 16 — ⚠️ проверить при внедрении), own-brew OAuth
(дороже по аудиту, легко ошибиться в state/CSRF), Clerk/Supabase (внешний
vendor-lock, данные пользователей уходят за периметр — конфликт с принципом
минимизации).

⚠️ **Проверить при внедрении:** совместимость next-auth v4 с Next.js 16 App
Router (роут-хендлеры поддерживаются; проверить тонкости: экспорт
`GET/POST` из `route.ts`, работу `NEXTAUTH_URL`, поведение middleware).
Если найден блокер — точка отката: изолировать auth в собственный
роут-слой без глобального middleware (§7).

## 2. Провайдеры

### 2.1. Яндекс ID (кастомный провайдер)

Факты ✅ проверены по официальной документации API Яндекс ID (web-search,
2026-09-04):

| Элемент | Значение |
|---|---|
| Консоль регистрации приложения | OAuth-консоль Яндекса (`oauth.yandex.ru/client/new`); тип «Веб-сервисы» |
| Authorization endpoint | `https://oauth.yandex.ru/authorize?response_type=code&client_id=…&redirect_uri=…&scope=…&state=…` (поддерживает `optional_scope`, `force_confirm`, PKCE `code_challenge`) |
| Token endpoint | `POST https://oauth.yandex.ru/token`, `application/x-www-form-urlencoded`, `grant_type=authorization_code&code=…&client_id=…&client_secret=…` (допустима Basic-авторизация `client_id:client_secret`); время жизни кода — 10 минут |
| Userinfo | `GET https://login.yandex.ru/info?format=json`, заголовок `Authorization: OAuth <access_token>` (параметр `oauth_token` в URL документацией помечен как небезопасный — не используем) |
| Минимальные scope | `login:info login:email login:avatar` (логин/id, e-mail, аватар) |
| Поля ответа userinfo | `id`, `login`, `default_email`, `emails[]`, `default_avatar_id`, `is_avatar_empty`, `psuid`, `client_id` |
| Ответ token | `access_token`, `refresh_token`, `expires_in`, `token_type: bearer`, `scope` |

Маппинг в NextAuth-профиль (`profile()` колбэк провайдера):

```ts
// email → default_email (при наличии scope login:email)
// name  → login (display-имя пользователя Яндекса)
// id    → id (числовой id Яндекса, стабильный для аккаунта)
// image → https://avatars.yandex.net/get-yapic/<default_avatar_id>/islands-200
//          (⚠️ формат URL аватара проверить при внедрении)
```

⚠️ Проверить при внедрении: актуальный бренд-кит кнопки «Войти через Яндекс
ID» (требования к логотипу/надписи), поведение refresh-токена Яндекса
(сроки/ротация) — для политики обновления `Account.expires_at`.

### 2.2. Google ID (встроенный провайдер NextAuth)

Факты ✅ проверены (документация Google Identity / OpenID Connect):

| Элемент | Значение |
|---|---|
| Консоль | Google Cloud Console → APIs & Services → Credentials; OAuth consent screen (External) |
| Endpoints | `https://accounts.google.com/o/oauth2/v2/auth`, `https://oauth2.googleapis.com/token`, userinfo — OpenID Connect (`openidconnect.googleapis.com/v1/userinfo`) |
| Scope | `openid email profile` — NextAuth выставляет сам |
| Redirect URI | `https://<наш-домен>/api/auth/callback/google` |
| Брендинг кнопки | Официальные правила: стандартный цветной логотип «G» на белом фоне, без искажения пропорций (developers.google.com/identity/branding-guidelines) |

### 2.3. Кнопки входа

Две кнопки на экране входа: «Войти с Яндекс ID» и «Войти через Google» —
каждая по бренд-требованиям своего провайдера, обе — обычные `<a>` на
`/api/auth/signin/<provider>`. Дополнительно блок: «Продолжить без аккаунта»
(LAN-режим с PIN — остаётся полноценным).

## 3. Схема данных

Модели уже добавляются в `prisma/schema.prisma` параллельной задачей —
этот план использует их как контракт (имена не менять):

```prisma
model User {
  id            String    @id @default(cuid())
  email         String?   @unique
  name          String?
  image         String?
  emailVerified DateTime?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  accounts      Account[]
  sessions      Session[]
  onboarding    OnboardingProfile?
  survey        SurveyResponse?
  payments      Payment[]
  subscriptions Subscription[]
  scripts       Script[]      // ownerUserId (nullable) — §7
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  provider          String  // 'yandex' | 'google'
  providerAccountId String
  access_token      String? // зашифрован — §6.2
  refresh_token     String? // зашифрован — §6.2
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String?
  session_state     String?
  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  expires      DateTime
}
```

Ключевые решения: стратегия сессий — **database sessions** (адаптер Prisma,
`session: { strategy: 'database' }`): cookie хранит только
`sessionToken`-указатель, отзывать сессии легко, данные сессии не
таскаются в JWT. `Script.ownerUserId` — nullable: старые «локальные»
сценарии остаются без владельца (§7).

## 4. Потоки

### 4.1. Desktop-редактор (браузер на компьютере)

1. Пользователь кликает «Войти с Яндекс ID» → `/api/auth/signin/yandex` →
   redirect на `oauth.yandex.ru/authorize` (state+PKCE от NextAuth).
2. Колбэк `/api/auth/callback/yandex` → обмен кода на токен → userinfo →
   link/create `User` + `Account` (адаптер) → cookie-сессия.
3. Дальше все запросы `/api/*` идут с сессионной cookie (httpOnly).

### 4.2. Мобильный суфлёр — LAN-режим (без изменений)

Телефон подключается по QR-pairing-токену, как сейчас: авторизация для
суфлёра **не нужна** (токен сценария — его «сессия», short-lived).
LAN-режим обязан работать без интернета: если OAuth недоступен — просто
остаётся локальный режим.

### 4.3. Мобильный суфлёр — облачный режим (APK)

Проблема: WebView APK обслуживает приложение с `https://localhost`
(androidScheme https, см. `apk/capacitor.config.ts`), а API в облаке — на
`https://app.<домен>`; cookie cross-origin в WebView — хрупкая история
(3rd-party cookie, CORS-credentials).

**Решение: JWT-сессия НЕ вводим; вместо этого APK в облачном режиме
загружает приложение с origin облака.** Варианты (по предпочтению):

| Вариант | Как | Плюсы/минусы |
|---|---|---|
| A (основной) | `server.url = https://app.<домен>` в Capacitor-конфиге «облачной» сборки: весь SPA и API — один origin, cookie сессии живут в WebView-хранилище | Проще всего; cookie не «третьи»; отдельная сборка APK для облака |
| B (фолбэк) | Встроенный браузер (Chrome Custom Tabs / `Browser.open`) для OAuth, затем глубокая ссылка `prompter://auth#token` в APK | Обходной путь, сложнее; ⚠️ проработать при внедрении |

Сами cookie в Capacitor WebView сохраняются между запусками
(Android WebView cookie store) — при чистке данных приложения логин
пропадает (допустимо; повторный вход по кнопке в настройках суфлёра).

### 4.4. Graceful degradation (LAN без интернета)

| Ситуация | Поведение |
|---|---|
| Сервер без интернета | Кнопки входа скрыты/диалог входа отвечает «Нет соединения с интернетом»; весь локальный функционал работает (PIN + pairing) |
| Аккаунт есть, сети нет | Локальный режим продолжает работать; в облако уедут данные при появлении сети (onboarding-статус и т.п.) |
| Публичный Wi-Fi | PIN остаётся обязательным для `/api/*` (локальная защита сети), сессия — надстройка (§7) |

## 5. Потоки данных и идентичность

- Один `User` может иметь оба аккаунта (Яндекс + Google) — связывание через
  подтверждённый e-mail (`allowDangerousEmailAccountLinking: false`;
  вручную связать можно в настройках профиля — фича M2.2).
- `providerAccountId` + `provider` — источник истины внешней идентичности;
  `User.id` — внутренний ключ (cuid), не утекает наружу.
- e-mail от провайдера сохраняется как есть (`email`), `emailVerified` —
  время подтверждения провайдером.

## 6. Безопасное хранение данных (ключевой пункт)

### 6.1. Принципы

1. **Refresh/access токены провайдеров — только на сервере, в таблице
   `Account`.** Никогда: localStorage браузера, постоянное хранилище APK,
   клиентский JS, логи. (В AndroidManifest уже `allowBackup=false` —
   резервные копии системы token-хранилище WebView не утаскивают; это
   фикс прошлой итерации остаётся.)
2. **Клиент получает только session-cookie** (httpOnly) и публичный профиль
   (name, image, email-маска/полный — своё же).
3. **Секреты в env, не в git**: `NEXTAUTH_SECRET`, `APP_SECRET`,
   `YANDEX_CLIENT_SECRET`, `GOOGLE_CLIENT_SECRET` — только в `.env`
   (`.gitignore` уже закрывает `.env*`).

### 6.2. Шифрование токенов at rest

- Поля `Account.access_token`, `Account.refresh_token`, `Account.id_token`
  шифруются **AES-256-GCM** при записи и расшифровываются при чтении
  (слой `src/lib/server/crypto.ts`, вызывается из адаптера-обёртки).
- Ключ выводится из `APP_SECRET` (env) через HKDF-SHA256 (salt = метка
  `ps-account-tokens`); сам `APP_SECRET` в БД не хранится.
- Формат колонки: `v1:<iv-base64>:<ciphertext-base64>:<authTag-base64>` —
  версионирование для ротации.
- **Ротация:** смена `APP_SECRET` → токены старой версии не читаются —
  потеря не фатальна (провайдеры переживут повторный вход): при неудаче
  расшифровки помечаем Account «требует перелогина». Ротация по процедуре:
  ключ-2 в env (`APP_SECRET_NEXT`), плавное перешифрование, затем свап.
- Удаление аккаунта → каскад удаляет `Account` (токены провайдеров
  аннулируются отзывом через API провайдера — ⚠️ проверить при внедрении
  наличие revoke-endpoint'ов у Яндекса/Google и вызвать при «Выйти из всех
  устройств»).

### 6.3. NEXTAUTH_SECRET

- Обязателен: `openssl rand -base64 32` → `.env` (пример-заготовка в
  `.env.example`, закомментирована). Без него v4 в проде падает —
  логично: он подписывает/шифрует cookie-значения и state.

### 6.4. Cookies

- `next-auth.session-token`: `httpOnly: true`, `sameSite: 'lax'`,
  `secure: true` при HTTPS (в LAN-HTTP — `secure: false`, иначе cookie не
  выставится; переключение по `NEXTAUTH_URL`-схеме).
- `next-auth.csrf-token`: httpOnly (стандарт v4).
- Итоговые требования к cookie-конфигу зафиксировать в
  `src/lib/auth.ts` (объект `cookies` в options) — не полагаться на дефолты.

### 6.5. Минимизация scope

- Яндекс: только `login:info login:email login:avatar` — без доступов к
  почте, диску и прочему.
- Google: `openid email profile` — только идентичность.
- В userinfo не запрашиваем телефон/адрес; из ответа сохраняем только поля
  §2 (email, имя, аватар, id).

### 6.6. Чек-лист соответствия 152-ФЗ

⚠️ Юр.пакет обязательный перед запуском регистрации (пометка: юр.консультация):

- [ ] Политика обработки персональных данных (публичная страница) —
      оператор, цели, состав, сроки хранения, права субъекта.
- [ ] Явное согласие на обработку ПДн при регистрации (чекбокс перед входом +
      ссылка на политику; согласие логируется с датой).
- [ ] Учёт оператора ПДн в Роскомнадторе (реестр операторов) при
      систематической обработке ПДн.
- [ ] Локализация: ПДн граждан РФ хранятся в БД на территории РФ
      (облачный инстанс — хостинг в РФ; для self-hosted у пользователя —
      его машина). Google-OAuth как «трансграничная передача» при хранении
      данных у нас: уведомление РКН о трансграничной передаче, если
      используем Google-данные (e-mail/имя от Google приходят с их
      серверов) — юр.проработка.
- [ ] Хранение: минимальные сроки (см. план 03 retention), удаление
      аккаунта = полное каскадное удаление (right to erasure).
- [ ] Брендинг кнопок: Яндекс — «Войти с Яндекс ID» по их бренд-киту;
      Google — «G»-логотип на белом, без стилизации под нашу тему.

### 6.7. Что НЕ храним и куда НЕ лезем

- **Содержимое сценариев не копируется в облако** без явного функционала
  «облачная синхронизация» (отдельная задача, вне M2). Текущая архитектура:
  данные — на машине пользователя (SQLite) / офлайн-кэш телефона.
  Регистрация синхронизирует только: профиль, онбординг-статус (план 01),
  опрос (план 03), подписку (план 04).
- Будущая опция «облако для сценариев» (кратко, границы): опциональный
  флаг в настройках, шифрование контента до выгрузки (E2E-ключ из парольной
  фразы, сервер видит шифротекст), право отзыва. Реализация — отдельным
  планом после M3.

## 7. Влияние на текущие API и middleware

Инвариант: **сессия ИЛИ PIN** (для локальных/LAN-запросов), pairing-флоу
без изменений:

| Роут | Авторизация после M2 |
|---|---|
| `GET/POST/PUT/DELETE /api/scripts*` | сессия (cookie) **или** PIN-bearer; фильтр по `ownerUserId` (для сессии) либо «локальные» (ownerUserId null, для PIN) |
| `/api/pair`, `/api/pair/validate`, `/api/mobile/script` | как сейчас: pairing-токен (не трогаем — суфлёр авторизован токеном) |
| `/api/ai/*`, `/api/takes*` | сессия или PIN (как scripts) |
| `/api/server-info` | публичный (нужен для UX подключения, сохраняется) |
| `/api/auth/*` | NextAuth (собственная защита) |
| `/api/onboarding`, `/api/survey`, `/api/payments/*` | только сессия (облачные фичи) |

Middleware-схема (файл `src/lib/server/guards.ts` + wrapper в route handlers;
глобальный `middleware.ts` не обязателен — можно явным helper'ом):

```ts
async function requireUser(req): Promise<
  | { kind: 'session'; userId: string }
  | { kind: 'pin'; local: true }        // валидный PIN — локальный контекст
  | HttpError(401)                       // ничего не предъявлено
>
```

- `Script.ownerUserId String?` — nullable: старые сценарии «ничьи» (видны
  в PIN-режиме и в сессии владельца после «привязать к аккаунту» —
  однокнопочная миграция на первом входе: `UPDATE Script SET ownerUserId
  WHERE ownerUserId IS NULL` — выполняется один раз, с подтверждением юзера).
- CSRF: переход на cookie-сессии делает REST-запросы «состоятельными» —
  проверяем `Origin`/`SameSite=lax` (JSON-POST не отправится cross-site
  из формы), для DELETE/PUT дополнительно сверка `Origin` с Host —
  усиливается текущая защита (замечание из локального аудита по поводу
  будущих cookie-сессий).
- Rate-limit на auth-роуты (защита от перебора state/колбэков) —
  простой in-memory счётчик (тот же механизм, что P1-роадмап аудита).

## 8. Этапы внедрения

| Шаг | Что | Файлы |
|---|---|---|
| 1 | Схема Prisma: User/Account/Session/OnboardingProfile/SurveyResponse (+ ownerUserId у Script) | `prisma/schema.prisma` (параллельная задача), `bun run db:push` |
| 2 | Крипто-слой для токенов | `src/lib/server/crypto.ts` (AES-256-GCM + HKDF) |
| 3 | Конфиг NextAuth: провайдеры, PrismaAdapter, database-сессии, cookies-политика | `src/lib/auth.ts` |
| 4 | Роут-хендлер | `src/app/api/auth/[...nextauth]/route.ts` |
| 5 | Env-заготовки | `.env.example` (закомментированные `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `YANDEX_CLIENT_ID/SECRET`, `GOOGLE_CLIENT_ID/SECRET`, `APP_SECRET`) |
| 6 | Кастомный провайдер Yandex (endpoints §2.1, маппинг профиля) | в `src/lib/auth.ts` |
| 7 | Адаптер-обёртка: шифрование `access/refresh/id_token` при записи | `src/lib/server/nextauth-adapter.ts` |
| 8 | UI: страница/диалог входа (2 кнопки по брендингу + «без аккаунта»), SessionProvider, меню профиля | `src/components/desktop/sign-in-dialog.tsx`, `src/components/desktop/user-menu.tsx`, layout |
| 9 | Guard `сессия ИЛИ PIN` + ownerUserId-фильтры в scripts/ai/takes | `src/lib/server/guards.ts` (расширение), роуты |
| 10 | Однокнопочная привязка локальных сценариев к аккаунту | `POST /api/account/claim-local` |
| 11 | Импорт онбординга (план 01 §6) + опрос (план 03) | `/api/onboarding`, `/api/survey` |
| 12 | E2E: вход Яндекс/Google (тест-аккаунты), LAN-режим без сети, cookie-политики, шифрование токенов (в БД — шифротекст), выход, «сессия ИЛИ PIN» | `.zscripts/` (не коммитится) |

## 9. Риски и открытые вопросы

| Риск/вопрос | Митигация |
|---|---|
| next-auth v4 ↔ Next 16 App Router | Шаг 3–4 сделать spike'ом первым; фолбэк §1 |
| Cookie в LAN-HTTP (`secure` флаг) | Конфиг cookies по схеме NEXTAUTH_URL (HTTP→secure:false) — осознанно, сеть защищена PIN |
| Привязка аккаунтов по e-mail | Только с подтверждённым emailVerified, вручную из настроек |
| Трансграничность Google | Юр.проработка (§6.6), приоритет кнопки Яндекс ID для RU-аудитории |
| Self-hosted пользователь без APP_SECRET | Генерация при первом старте в `.env` (setup-скрипт), предупреждение в README |
| Отзыв токенов провайдеров | ⚠️ проверить revoke-endpoint'ы; иначе — «мягкий» выход (токены не используются) |

## 10. Мультиинстанс: LAN + облако

Один аккаунт — разные машины (кратко):

- **LAN-инстанс (компьютер пользователя)** — суверенный: локальная SQLite,
  PIN, pairing; аккаунт тут — «паспорт» для облачных фич (онбординг/опрос/
  подписка синхронизируются через облако, сценарии остаются локальными).
- **Облачный инстанс** — центральная БД с User/Account/Session/Survey/
  Payment/Subscription; редактор в облаке работает с облачными сценариями
  (для этого — будущая фича, §6.7), суфлёр-APK подключается к облаку (§4.3).
- Конфликт-правило: LAN-данные никогда не выгружаются автоматически;
  выгрузка — только явные действия пользователя (export/import, будущая
  облачная синхронизация).
