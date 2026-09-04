# План 04 — Платежи: разовые и рекуррентные (ЮKassa и Prodamus)

Статус: 📋 план (M3; зависимость — план 02: платежи привязаны к `User`).

Требование пользователя: «подготовь проект к внедрению платежей (разовых и
рекуррентных) через ЮKassa (yookassa.ru/developers) и Prodamus
(help.prodamus.ru/payform)».

Контекст: покупка Pro возможна только в облачном режиме (авторизованный
пользователь). LAN-режим (без аккаунта) остаётся Free и полнофункциональным
локально.

Факты API провайдеров, подтверждённые по официальной документации
(web-search, 2026-09-04), помечены ✅; требующие сверки — ⚠️.

---

## 1. Тарифная модель

| Фича | Free | Pro (разово, N мес.) | Pro (подписка месяц) | Pro (подписка год) |
|---|---|---|---|---|
| Сценарии и секции, неограниченно | ✅ | ✅ | ✅ | ✅ |
| Импорт .txt/.md, drag-and-drop | ✅ | ✅ | ✅ | ✅ |
| LAN-суфлёр по QR + APK | ✅ | ✅ | ✅ | ✅ |
| PIN-защита | ✅ | ✅ | ✅ | ✅ |
| AI-помощник BYOK | ✅ (свой ключ) | ✅ | ✅ | ✅ |
| AI встроенный провайдер | лимит ⚠️ | ✅ | ✅ | ✅ |
| Встроенный AI-лимит | — | определяет цена | определяется ценой | определяется ценой |
| Облачные сценарии (будущее, план 02 §6.7) | — | ✅ | ✅ | ✅ |
| Приоритетная поддержка | — | ✅ | ✅ | ✅ |

Ценовые точки (наполнение — бизнес-решение владельца; в плане — механика):
разовая покупка «Pro на 6/12 месяцев» (одна транзакция, N месяцев доступа)
и подписка месяц/год (рекуррентные списания). Бесплатный тариф никогда не
деградирует существующий локальный функционал — Pro добавляет облачное.

## 2. Внутренняя архитектура

Единый слой поверх двух провайдеров — магазин не знает различий API:

```ts
// src/lib/server/payments/provider.ts
export interface PaymentProvider {
  readonly name: 'yookassa' | 'prodamus';

  /** Создать платёж/ссылку; возвращает URL для перехода к оплате */
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
    // CreatePaymentInput: { userId, planId, kind: 'one_time'|'recurring',
    //   amountKopecks (серверное значение из тарифа!), currency: 'RUB',
    //   description, idempotencyKey, returnUrl, webhookKind }
    // CreatePaymentResult: { externalId, confirmationUrl, status: 'pending' }

  /** Разобрать и проверить вебхук; вернуть нормализованное событие */
  handleWebhook(req: Request): Promise<WebhookEvent>;
    // WebhookEvent: { externalId, status: 'succeeded'|'canceled',
    //   amountKopecks?, raw: unknown }

  /** Отменить незавершённый платёж */
  cancel(externalId: string): Promise<void>;

  /** Повторно прочитать статус у провайдера (доверенная сверка) */
  getStatus(externalId: string): Promise<'pending'|'succeeded'|'canceled'>;
}

// src/lib/server/payments/yookassa-adapter.ts
// src/lib/server/payments/prodamus-adapter.ts
```

REST-роуты:

| Роут | Метод | Назначение |
|---|---|---|
| `/api/payments/create` | POST | Создание платежа по `planId` (только сессия; сумма из тарифа, не из клиента) |
| `/api/payments/webhook/yookassa` | POST | Вебхук ЮKassa (без сессии — аутентификация подписью/IP) |
| `/api/payments/webhook/prodamus` | POST | Вебхук Prodamus (аутентификация HMAC-Sign) |
| `/api/payments/status` | GET | Статус платежа/подписки текущего пользователя |
| `/api/subscription/cancel` | POST | Отмена подписки пользователем |

Поток (одноразовый платёж):

```
клиент ──POST /api/payments/create {planId}──► сервер
         (сумма = тариф[planId], Payment{status:'pending', idempotencyKey} в БД)
сервер ──provider.createPayment──► ЮKassa/Prodamus ──► confirmationUrl
клиент ──redirect──► платёжная страница провайдера
провайдер ──POST /api/payments/webhook/<p>──► сервер
         (проверка подлинности §7.1 → provider.getStatus — сверка →
          Payment.status='succeeded' → активация Pro → идемпотентно)
клиент ──returnUrl (наш домен)──► GET /api/payments/status → «Оплачено»
```

Рендер статуса на фронтенде — поллинг `/api/payments/status` (интервал 3с,
максимум 2 минуты); источником истины остаётся вебхук+сверка (returnUrl —
только UX, у обоих провайдеров ✅).

## 3. Модели данных (контракт = prisma/schema.prisma)

```prisma
model Payment {
  id             String   @id @default(cuid())
  userId         String
  user           User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  provider       String   // 'yookassa' | 'prodamus'
  kind           String   // 'one_time' | 'recurring'
  status         String   // 'pending' | 'succeeded' | 'canceled'
  amount         Int      // копейки, RUB
  currency       String   // 'RUB'
  externalId     String   @unique  // id платежа у провайдера (payment_id / order_id)
  description    String
  meta           String   // JSON: planId, payment_method_id/binding_id, lastEvent…
  idempotencyKey String   @unique
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}

model Subscription {
  id              String    @id @default(cuid())
  userId          String
  user            User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  planId          String    // 'pro_month' | 'pro_year' | 'pro_pack_6' …
  provider        String    // 'yookassa' | 'prodamus'
  status          String    // 'active' | 'past_due' | 'canceled'
  currentPeriodEnd DateTime
  externalId      String    // id подписки у провайдера (Prodamus) / наш якорь (ЮKassa)
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
}
```

`amount` — копейки (Int): исключает float-погрешности; конвертация в
строку `"123.45"` — на границе адаптера (у обоих провайдеров суммы —
строки/дробные ✅).

## 4. Адаптер ЮKassa (факты ✅ проверены)

| Элемент | Значение |
|---|---|
| Base URL | `https://api.yookassa.ru/v3` |
| Аутентификация | Basic: `shopId:secretKey` (`-u` в curl) |
| Идемпотентность | Заголовок `Idempotence-Key` на создании платежей/вебхуков/возвратов (обязателен; повтор с тем же ключом возвращает тот же объект) |
| Создание | `POST /v3/payments` — `{amount:{value,currency}, capture, confirmation:{type:'redirect', return_url}, description, save_payment_method, metadata}`; сценарий «Умный платёж» — выбор способа оплаты происходит на стороне ЮKassa |
| Статусы | `pending → waiting_for_capture → succeeded` либо `canceled`; двухстадийность (`capture: false`) — для сценария «привязка на минимальную сумму» |
| Подтверждение | `POST /v3/payments/{id}/capture` |
| Вебхуки-события | `payment.succeeded`, `payment.canceled`, `payment.waiting_for_capture`, `refund.succeeded`, `payment_method.active` (привязка способа), `payment_method.canceled` |
| Регистрация вебхука | `POST /v3/webhooks` `{event, url}` (в примере документации — Bearer OAuth-токен; ⚠️ сверить тип ключа для этого вызова при внедрении) |
| Проверка вебхука | 1) IP источника в списке ЮKassa ✅: `185.71.76.0/27, 185.71.77.0/27, 77.75.153.0/25, 77.75.156.11, 77.75.156.35, 77.75.154.128/25, 2a02:5180::/32`; 2) **обязательная** повторная сверка: `GET /v3/payments/{id}` — статус/сумма из ответа, не из тела вебхука |
| Доставка | Повторные попытки при не-200 (система сама ретраит); наш роут обязан отвечать быстро (200 после постановки в обработку) |
| Возвраты | `POST /v3/refunds` |
| Чеки 54-ФЗ | Формирует сама ЮKassa при подключенной кассе (настройки магазина; отдельная опция «чеки» в тарифе — «2,8% + 1% за чек» ⚠️ тариф уточнить) |

## 5. Адаптер Prodamus (факты ✅ проверены)

| Элемент | Значение |
|---|---|
| Платёжная страница | `https://<subdomain>.payform.ru/` — единый endpoint и для ссылки, и для оплаты; запрос GET или POST, ответ можно получить JSON (`type=json`) |
| Инициация | Параметры: `do=link` (вернуть ссылку) \| `do=pay` (сразу редирект); `products[]` (name, price, quantity, sku, tax, paymentMethod, paymentObject — данные чека), `order_sum`, `customer_email/phone`, `urlSuccess`, `urlReturn`, `urlNotification` (только вместе с `sys`), `demo_mode=1`, `callbackType=json`, `currency` (rub/usd/eur/kzt), `payments_limit`, `_param_*` (сквозные) |
| Подпись запроса | `signature` — HMAC-SHA256 от канонизированного JSON: все значения → строки, рекурсивная сортировка ключей по алфавиту, JSON-строка, экранирование `/` → `\/`; ключ — «секретный ключ платёжной страницы» из настроек |
| Вебхук | POST `application/x-www-form-urlencoded` (при `callbackType=json` — JSON в теле); **обязан** получать HTTP 200; иначе — повторы по расписанию интервалов |
| Проверка вебхука | Заголовок `Sign` (⚠️ имя заголовка уточнить при внедрении): HMAC-SHA256 от параметров запроса тем же алгоритмом и секретным ключом страницы; при несовпадении — код ≠ 200 и стоп |
| Статусы в вебхуке | `payment_status`: `success` \| `order_canceled` \| `order_denied`; `payment_init`: `manual` \| `api` (списание по связке) \| `auto` (робот подписки) |
| Идемпотентность вебхука | По `order_id` (ID заказа в Prodamus) / `order_num` (наш номер, передаём в `order_id` запроса) — повторная доставка не должна повторять эффект (✅ прямо в чек-листе провайдера) |
| Демо | `demo_mode=1` — тестовые оплаты без денег (кроме оплаты по связке — там демо недоступен ✅) |
| Чеки 54-ФЗ | Prodamus фискализирует сам (касса подключается к платёжной странице; атрибуты НДС/предмета расчёта — в `products[]`); для самозанятых — интеграция с «Мой налог» |
| Юр.формы | Подходит самозанятым, ИП, ООО; тарифы/подключение — см. §10 |

## 6. Рекуррентные платежи

### 6.1. ЮKassa (модель «merchant-managed»)

✅ Подтверждено: ЮKassa **не хранит расписание подписки** — продавец сам
создаёт периодические платежи по сохранённому способу оплаты:

1. Первый платёж: `save_payment_method: true` (сохранение подтверждает
   пользователь на платёжной странице; есть режимы безусловного/условного
   сохранения) → в успешном объекте платежа приходит
   `payment_method.saved` + `payment_method_id`.
2. `payment_method_id` сохраняем в `Payment.meta` (и ссылку на подписку).
3. Планировщик (cron-задача на сервере, `node-cron` в мини-сервисе или
   внешний таймер): за N дней до `currentPeriodEnd` → создаёт новый платёж
   `POST /v3/payments` с `payment_method_id` (+ свой `Idempotence-Key`,
   например `sub:<subscriptionId>:<period>`); деньги списываются без 3DS
   для карт с рекуррентной поддержкой (⚠️ поведение 3DS по картам —
   проверить).
4. Альтернатива (✅ существует): «привязка на нулевую сумму» — двухстадийный
   платёж на 1 ₽ с отменой после `payment_method.active` — для сохранения
   метода без списания.

### 6.2. Prodamus

Два официальных сценария (✅):

| Сценарий | Как | Когда выбираем |
|---|---|---|
| **Клубная система (подписочные продукты)** | Подписка создаётся в ЛК Prodamus; в ссылке передаём `subscription` (ID подписки) + `subscription_date_start`, `subscription_demo_period`, `subscription_limit_autopayments`; при переданном `subscription` корзина `products` игнорируется. Списания и повторы делает робот Prodamus (программа ретраев `max_attempts`, интервалы) | Основной сценарий для Prodamus-подписок: меньше своей логики |
| **Оплата по связке (binding)** | Первый платёж с `client_id` (наш стабильный ID покупателя, ≤32 симв.) → вебхук возвращает `binding_id` → повторные списания сами: `GET/POST https://<domain>.payform.ru/rest/payment/do/` с `{products, client_id, binding_id, sys, customer_email, signature}` (отдельный секретный ключ, выдаёт поддержка; демо-режим не поддерживается) | Когда нужен свой график/гибкие суммы |

Вебхуки по подпискам содержат блок `subscription` (✅: `id`, `profile_id`,
`active_manager/active_user`, `cost`, `limit_autopayments`,
`autopayments_num`, `date_next_payment`, `current_attempt`, `max_attempts`,
`last_attempt`) + события `action_code` (`auto_payment`, `deactivation`,
`finish`) и `notification_code` (`auto_payment`, `auto_payment_reminder`),
коды ошибок списаний (`card_expired`, `insufficient_funds`, `3ds_error`,
`system_error`…). Управление подпиской — REST-методы Prodamus
(`setActivity` и др. — ⚠️ перечень методов уточнить при внедрении).

### 6.3. Общая логика подписок (наша сторона)

- `Subscription.status`: `active` → `past_due` (списание не прошло, идут
  повторы) → `canceled` (отменена пользователем или истощены попытки).
- **Dunning:** цепочка повторных попыток. ЮKassa — наша (cron: 1-й день,
  +3, +5, +7; потом `past_due` → grace 7 дней → `canceled`); Prodamus
  клубная — их робот (`max_attempts`), мы только слушаем вебхуки.
- **Próroga (grace-период):** при `past_due` Pro остаётся активным до
  `currentPeriodEnd + 7 дней`, баннер «Продлите доступ» в UI.
- **Отмена:** `POST /api/subscription/cancel` → у ЮKassa прекращаем
  создавать плановые платежи (и отзываем право списания отменой платёжного
  метода, если API позволяет — ⚠️ проверить); у Prodamus — вызов REST
  деактивации/отключение в ЛК; пользователю доступ сохраняется до конца
  оплаченного периода.
- Смена плана (месяц→год): от текущей подписки — отмена + новая с первого
  числа следующего периода (без двойных списаний; даты сверяются по
  `currentPeriodEnd`).

## 7. Безопасность

1. **Подлинность вебхуков:**
   - ЮKassa: IP-фильтр по официальным диапазонам (§4) **+ повторное чтение
     статуса через `GET /v3/payments/{id}`** — тело вебхука не считается
     истиной. Проверка «сумма в объекте == Payment.amount, currency == RUB».
   - Prodamus: проверка HMAC-SHA256 (заголовок Sign) до любой обработки;
     несовпадение → HTTP ≠ 200, лог без чувствительных данных.
   - Вебхук-роуты — без cookie-сессии (внешние вызовы); единственная
     защита — подпись/IP, никаких «ключей в query».
2. **Идемпотентность:** `Payment.externalId @unique` + `idempotencyKey
   @unique`; повторный вебхук — обновление только при переходе статуса
   (`pending → succeeded`), повторная выдача Pro запрещена транзакционно
   (условный UPDATE по статусу).
3. **Суммы:** клиент передаёт только `planId`; `amount` формируется сервером
   из таблицы тарифов (env/конфиг, не из запроса). Сверка суммы в вебхуке
   с ожидаемой — обязательна.
4. **HTTPS обязателен** для платёжных роутов и returnUrl (middleware:
   reject не-HTTPS на `/api/payments/*` в проде).
5. **Redirect-URL только на наш домен:** `YOOKASSA_RETURN_URL` /
   Prodamus `urlSuccess`/`urlReturn` — фиксированные env-значения; из
   запроса пользователя не принимаются.
6. **Логи без карточных данных:** в `Payment.meta` и логах — только ID,
   статусы, суммы; PAN/CVV к нам не попадают вовсе (оба провайдера держат
   карту у себя) — **PCI DSS SAQ-A** (данные карт не касаются нашего
   сервера; отдельной сертификации не требуется, комплаенс-чек-лист SAQ-A
   ведём формально).
7. **Секреты:** `YOOKASSA_SECRET_KEY`, `PRODAMUS_SECRET_KEY`,
   `PRODAMUS_WEBHOOK_SECRET` (+ключ связок, если используется) — env,
   обращение — как ко всем секретам (план 02 §6.1).
8. **Возвраты:** через API провайдера (refund/`POST /v3/refunds`) — по
   политике возврата §8; только владелец сервиса из админки.

## 8. Юридическое

- [ ] **Оферта/договор** для Pro-тарифов (публичная страница + чекбокс при
      покупке); для ЮKassa — договор с банком/юрлицом продавца, для
      Prodamus — их оферта (актуальную редакцию смотреть в разделе
      «Документы» ЛК).
- [ ] **Политика возврата:** разовая покупка — возврат в течение 14 дней,
      если Pro не активирован (автоматический критерий: не было облачных
      действий); подписка — отмена до конца периода без возврата текущего
      списания (закон о защите прав потребителей — консультация ⚠️).
- [ ] **Правовой статус продавца:** Prodamus работает с самозанятыми
      (интеграция «Мой налог», тип плательщика `FROM_INDIVIDUAL`), ИП и
      ООО (✅); ЮKassa — юрлицо/ИП с эквайринг-договором. Выбор статуса —
      за владельцем продукта.
- [ ] **54-ФЗ:** чеки отправляют сами провайдеры (✅ оба) — включить в
      настройках магазина/платёжной страницы, передавать корректные
      `paymentMethodObject`/НДС в чеке; предмет расчёта для ПО — «услуга»
      (paymentObject=4) с признаком предоплаты при подписке.
- [ ] Политика ПДн дополняется разделом «платёжные данные» (мы храним только
      ID/суммы/статусы — см. §7.6).

## 9. Env-переменные (заготовки — в `.env.example`, закомментированы)

```bash
# ===== Auth (план 02) =====
# NEXTAUTH_URL=https://app.example.ru
# NEXTAUTH_SECRET=            # openssl rand -base64 32
# APP_SECRET=                 # ключ шифрования токенов (AES-256-GCM)
# YANDEX_CLIENT_ID=
# YANDEX_CLIENT_SECRET=
# GOOGLE_CLIENT_ID=
# GOOGLE_CLIENT_SECRET=

# ===== Payments (план 04) =====
# YOOKASSA_SHOP_ID=
# YOOKASSA_SECRET_KEY=
# YOOKASSA_RETURN_URL=https://app.example.ru/billing/return
# PRODAMUS_PAYMENT_URL=       # https://<subdomain>.payform.ru/
# PRODAMUS_SECRET_KEY=        # секретный ключ платёжной страницы
# PRODAMUS_WEBHOOK_SECRET=    # ключ проверки Sign вебхуков (если отличается)
# PRODAMUS_SYS=               # идентификатор интеграции (выдаёт поддержка)
# PRODAMUS_BINDING_SECRET_KEY= # отдельный ключ оплаты по связке (если используется)
# PAYMENTS_CRON_ENABLED=true   # планировщик рекуррентных списаний (ЮKassa)
```

## 10. Сравнение провайдеров

Комиссии — ориентиры из открытых источников (2026-09); **точные тарифы —
уточнить при подключении** (зависят от оборота/статуса; с 2026 комиссии
облагаются НДС ⚠️):

| Критерий | ЮKassa | Prodamus |
|---|---|---|
| Тип | Эквайринг ЮMoney (банк) | Агентская платформа (не банк) |
| Комиссия карты | ~2,8–3,5% (свой чек +1%) ⚠️ | ~2,9–3,5% по обороту ⚠️ |
| СБП | ✅ 0–0,7% ⚠️ | ✅ (QR) ⚠️ |
| Иностранные карты | ✅ (ограниченно) | ✅ ~7,9–10% ⚠️ |
| Кошельки/быстрые платежи | ЮMoney, SberPay, T-Pay, Яндекс Пэй ⚠️ | Sberbank-СМС, T-Pay, Яндекс Пэй, Долями, рассрочки (Т-Банк/Сбер/Хоум/МТС…) ✅ |
| Рекуррентные | ✅ сохранение `payment_method_id` + свои списания по cron; привязки на 0 ₽ | ✅ клубная система (их робот) и/или «связки» `binding_id` через `/rest/payment/do/` |
| API | Зрелый REST v3 (идемпотентность из коробки, виджеты, смарт-платежи) | Форм-ориентированный: GET/POST payform + HMAC; вебхуки form-urlencoded; REST управления подписками |
| Вебхуки | JSON, события `payment.*`, проверка по IP-листу + чтению объекта | form-urlencoded/JSON, HMAC-Sign, повторы по интервалам |
| Чеки 54-ФЗ | ✅ сами (настройка кассы) | ✅ сами (касса на платёжной странице; самозанятые — «Мой налог») |
| Юр. требования | Юрлицо/ИП, договор эквайринга | Самозанятый/ИП/ООО, оферта |
| Для кого в проекте | Основной (более зрелый API, проще автоматизация) | Резерв/альтернатива для самозанятых и рассрочек |

## 11. Этапы внедрения

| Шаг | Что | Файлы |
|---|---|---|
| 1 | Тарифы (конфиг: planId → сумма/период/вид) | `src/lib/server/payments/plans.ts` |
| 2 | Интерфейс `PaymentProvider` + юнит-мок | `src/lib/server/payments/provider.ts` |
| 3 | `YooKassaAdapter` (create/cancel/getStatus/webhook: IP-список + сверка GET) | `yookassa-adapter.ts` |
| 4 | `ProdamusAdapter` (канонизация+HMAC подпись, разбор form-urlencoded, Sign-проверка) | `prodamus-adapter.ts`, `src/lib/server/payments/prodamus-sign.ts` |
| 5 | Модели Payment/Subscription — уже в схеме (контракт §3) | `prisma/schema.prisma` |
| 6 | Роуты: create/webhook×2/status/cancel | `src/app/api/payments/**` |
| 7 | Гейт Pro-фич (helper `requirePro(userId)`) + UI биллинга (тарифы, история, статус) | `src/components/desktop/billing/**` |
| 8 | Cron-планировщик рекуррентных списаний ЮKassa + dunning | `mini-services/` или серверный шедулер |
| 9 | Юр. пакет: оферта, политика возврата, настройки чеков у провайдеров | `docs/legal/` (публичные страницы) |
| 10 | E2E в demo-режимах: ЮKassa тест-магазин ⚠️, Prodamus `demo_mode=1` ✅; вебхуки через публичный туннель | `.zscripts/` |
| 11 | Production-выкатка по чек-листу §12 | — |

## 12. Чек-лист перед продом

- [ ] HTTPS на всём платёжном пути; returnUrl только наш домен
- [ ] Вебхуки: IP-фильтр/Sign + сверка статуса через API провайдера
- [ ] Идемпотентность вебхуков (повторная доставка не выдаёт Pro дважды)
- [ ] Суммы серверные; сверка суммы из объекта провайдера
- [ ] Отмена подписки работает у обоих; dunning-цепочка журналится
- [ ] Чеки 54-ФЗ формируются (тестовая покупка с чеком на e-mail)
- [ ] Возврат через API отрабатывает и гасит Pro
- [ ] Логи: PAN/CVV не встречаются (grep по логам)
- [ ] Оферта/политика возврата опубликованы; чекбокс при покупке
- [ ] Тестовая покупка + автосписание + отмена + возврат — пройдены живьём
- [ ] Rate-limit на create/статус-поллинг; lint 0

## 13. Открытые вопросы

| Вопрос | Что делать |
|---|---|
| ЮKassa: тестовый магазин для E2E | Уточнить у поддержки наличие стендовых ключей; иначе — только Prodamus demo + ручные проверки |
| Имя заголовка Prodamus-Sign | Сверить в тех.документации при внедрении (в примерах — заголовок с подписью) |
| Приоритет провайдера в UI | Показывать ЮKassa первичным, Prodamus — при его недоступности/для рассрочек; выбор за пользователем |
| Цены Pro | Бизнес-решение (владелец); план не фиксирует |
