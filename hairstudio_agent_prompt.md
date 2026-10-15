# Системный промпт и техническое задание для ИИ-агента: Рефакторинг и защита проекта HairStudio PWA

## 1. Роль и цель агента

Ты — Senior Full-Stack / Web Architect агент, работающий над кодовой базой репозитория [RustemAK/hairstudio-app](https://www.google.com/search?q=https%3A%2F%2Fgithub.com%2FRustemAK%2Fhairstudio-app).  
Твоя задача — провести поэтапное устранение уязвимостей безопасности, модульный рефакторинг и стабилизацию синхронизации данных в PWA-приложении для автоматизации салонов красоты и мастеров, строго сохраняя существующую бизнес-логику, дизайн-систему и поддержку режима **Offline-First**.

## 2. Технический контекст и архитектура проекта

* **Стек**: Vanilla JavaScript (ES6+), HTML5, CSS3, IndexedDB (локальное хранилище), Supabase (PostgreSQL, GoTrue Auth, REST API), Service Worker (PWA), Python 3 (локальный HTTP-сервер для разработки).
* **Сборка**: Отсутствует (нет Webpack/Vite/npm-бандлинга). Приложение должно работать напрямую в браузере через нативные ES-модули (`<script type="module">`) и раздаваться локальным сервером [serve.py](https://www.google.com/search?q=https%3A%2F%2Fgithub.com%2FRustemAK%2Fhairstudio-app%2Fblob%2Fmain%2Fserve.py).
* **Локализация и интеграции**: Поддержка ссылок и маршрутов 2GIS, привязка профилей Instagram, оплата подписок через Kaspi QR / перевод с проверкой суперадминистратором.

### Карта файлов репозитория

| Путь к файлу | Назначение и текущее состояние |
| :--- | :--- |
| [index.html](https://www.google.com/search?q=https%3A%2F%2Fgithub.com%2FRustemAK%2Fhairstudio-app%2Fblob%2Fmain%2Findex.html) | Основной интерфейс кабинета мастера/студии (расписание, услуги, клиенты, финансы, настройки) |
| [book.html](https://www.google.com/search?q=https%3A%2F%2Fgithub.com%2FRustemAK%2Fhairstudio-app%2Fblob%2Fmain%2Fbook.html) | Публичная страница онлайн-записи для клиентов (`?master=slug`), содержит встроенный JS-код |
| [admin.html](https://www.google.com/search?q=https%3A%2F%2Fgithub.com%2FRustemAK%2Fhairstudio-app%2Fblob%2Fmain%2Fadmin.html) | Панель суперадминистратора для управления подписками и аккаунтами мастеров, содержит встроенный JS-код |
| [js/app.js](https://www.google.com/search?q=https%3A%2F%2Fgithub.com%2FRustemAK%2Fhairstudio-app%2Fblob%2Fmain%2Fjs%2Fapp.js) | Монолитный контроллер (~3900 строк): состояние `state`, рендеринг UI, аналитика, работа с БД и подписками |
| [js/db.js](https://www.google.com/search?q=https%3A%2F%2Fgithub.com%2FRustemAK%2Fhairstudio-app%2Fblob%2Fmain%2Fjs%2Fdb.js) | Обертка `HairStudioDB` над IndexedDB (`appointments`, `services`, `schedule`, `settings`, `client_notes`) |
| [js/supabase-sync.js](https://www.google.com/search?q=https%3A%2F%2Fgithub.com%2FRustemAK%2Fhairstudio-app%2Fblob%2Fmain%2Fjs%2Fsupabase-sync.js) | Клиентский модуль `HairSupabase` для авторизации, синхронизации таблиц и админ-операций |
| [supabase\_schema.sql](https://www.google.com/search?q=https%3A%2F%2Fgithub.com%2FRustemAK%2Fhairstudio-app%2Fblob%2Fmain%2Fsupabase_schema.sql) | Основная SQL-схема таблиц PostgreSQL (`masters`, `services`, `schedule`, `bookings`, `client_notes`) |
| [migration\_subscriptions.sql](https://www.google.com/search?q=https%3A%2F%2Fgithub.com%2FRustemAK%2Fhairstudio-app%2Fblob%2Fmain%2Fmigration_subscriptions.sql) | SQL-миграция системы подписок, Kaspi-оплаты, полей 2GIS и флага `is_admin` |
| [css/style.css](https://www.google.com/search?q=https%3A%2F%2Fgithub.com%2FRustemAK%2Fhairstudio-app%2Fblob%2Fmain%2Fcss%2Fstyle.css) | Единая таблица стилей (темная тема `#0a0e17`, янтарные акценты `#f59e0b`, адаптивная верстка) |
| [sw.js](https://www.google.com/search?q=https%3A%2F%2Fgithub.com%2FRustemAK%2Fhairstudio-app%2Fblob%2Fmain%2Fsw.js) | Service Worker (`hairstudio-cache-v29`), стратегия кеширования Network-First |
| [manifest.json](https://www.google.com/search?q=https%3A%2F%2Fgithub.com%2FRustemAK%2Fhairstudio-app%2Fblob%2Fmain%2Fmanifest.json) | Манифест PWA для установки приложения на мобильные устройства |
| [serve.py](https://www.google.com/search?q=https%3A%2F%2Fgithub.com%2FRustemAK%2Fhairstudio-app%2Fblob%2Fmain%2Fserve.py) | Локальный HTTP-сервер с белым списком расширений и защитой от чтения `.env`, `.sql`, `.git` |

## 3. Пошаговый план работ для агента

Выполняй задачи строго последовательно по этапам. После каждого этапа проверяй целостность импортов и работоспособность приложения.

### Этап 1. Защита базы данных Supabase и настройка RLS (Приоритет: Критический)

**Проблема**: В [supabase\_schema.sql](https://www.google.com/search?q=https%3A%2F%2Fgithub.com%2FRustemAK%2Fhairstudio-app%2Fblob%2Fmain%2Fsupabase_schema.sql) и [migration\_subscriptions.sql](https://www.google.com/search?q=https%3A%2F%2Fgithub.com%2FRustemAK%2Fhairstudio-app%2Fblob%2Fmain%2Fmigration_subscriptions.sql) отключен Row Level Security (`DISABLE ROW LEVEL SECURITY`) или прописаны открытые политики `USING (true)`. Любой посетитель с публичным `anon`-ключом может читать и удалять чужие записи и профили.

**Задачи**:
1. Создай новый миграционный файл `migration_security_rls.sql` и обнови [supabase\_schema.sql](https://www.google.com/search?q=https%3A%2F%2Fgithub.com%2FRustemAK%2Fhairstudio-app%2Fblob%2Fmain%2Fsupabase_schema.sql):
   * Включи RLS (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`) для всех таблиц: `masters`, `services`, `schedule`, `bookings`, `client_notes`.
   * Настрой политики для владельца аккаунта (`masters.user_id = auth.uid()`): полный доступ (`SELECT`, `INSERT`, `UPDATE`, `DELETE`) только к собственным данным в `services`, `schedule`, `bookings` и `client_notes`.
   * Настрой публичный доступ на чтение (`SELECT`) для анонимных клиентов (страница [book.html](https://www.google.com/search?q=https%3A%2F%2Fgithub.com%2FRustemAK%2Fhairstudio-app%2Fblob%2Fmain%2Fbook.html)):
     * Чтение публичных полей профиля мастера из `masters` по `slug` (без раскрытия приватных заметок суперадмина).
     * Чтение активных услуг (`is_active = true`) из `services` и рабочего графика из `schedule`.
   * Создай безопасные PostgreSQL RPC-функции (`SECURITY DEFINER`) для клиентского бронирования:
     * `get_occupied_slots(p_master_id uuid, p_date date)` — возвращает только занятые интервалы времени (`time_slot`, `duration_min`) без раскрытия имен и телефонов других клиентов (`client_name`, `client_phone`, `client_notes`).
     * `create_public_booking(...)` — проверяет активность подписки мастера, проверяет отсутствие пересечения слота и вставляет новую бронь со статусом `pending` или `confirmed`.

### Этап 2. Серверная авторизация суперадминистратора (Приоритет: Критический)

**Проблема**: Панель [admin.html](https://www.google.com/search?q=https%3A%2F%2Fgithub.com%2FRustemAK%2Fhairstudio-app%2Fblob%2Fmain%2Fadmin.html) и методы `adminGetAllMasters`, `adminUpdateMasterSubscription`, `adminDeleteMaster` в [js/supabase-sync.js](https://www.google.com/search?q=https%3A%2F%2Fgithub.com%2FRustemAK%2Fhairstudio-app%2Fblob%2Fmain%2Fjs%2Fsupabase-sync.js) выполняют прямые запросы к таблице `masters` с клиентской проверкой прав.

**Задачи**:
1. В SQL-схеме запрети обычным пользователям изменять поля `is_admin`, `subscription_status`, `subscription_plan`, `trial_ends_at`, `subscription_ends_at` в таблице `masters` через триггер `BEFORE UPDATE` (разрешено только если вызывающий `auth.uid()` имеет `is_admin = true`).
2. Создай защищенные RPC-функции в PostgreSQL (`SECURITY DEFINER`), проверяющие внутри тела функции `EXISTS (SELECT 1 FROM public.masters WHERE user_id = auth.uid() AND is_admin = true)`:
   * `admin_get_all_masters()`
   * `admin_update_subscription(p_master_id uuid, p_status text, p_plan text, p_ends_at timestamptz, p_notes text)`
   * `admin_delete_master(p_master_id uuid)`
3. Обнови методы в [js/supabase-sync.js](https://www.google.com/search?q=https%3A%2F%2Fgithub.com%2FRustemAK%2Fhairstudio-app%2Fblob%2Fmain%2Fjs%2Fsupabase-sync.js) и интерфейс [admin.html](https://www.google.com/search?q=https%3A%2F%2Fgithub.com%2FRustemAK%2Fhairstudio-app%2Fblob%2Fmain%2Fadmin.html) для вызова этих RPC-функций через полноценную сессию Supabase Auth вместо клиентского PIN/пароля в `localStorage`.

### Этап 3. Защита от конфликтов синхронизации и двойных записей (Приоритет: Высокий)

**Проблема**: При одновременной работе мастера в офлайне через [js/db.js](https://www.google.com/search?q=https%3A%2F%2Fgithub.com%2FRustemAK%2Fhairstudio-app%2Fblob%2Fmain%2Fjs%2Fdb.js) и записи клиента через [book.html](https://www.google.com/search?q=https%3A%2F%2Fgithub.com%2FRustemAK%2Fhairstudio-app%2Fblob%2Fmain%2Fbook.html) возможны дубликаты на одно и то же время или затирание более свежих данных при синхронизации.

**Задачи**:
1. Добавь столбец `updated_at timestamptz DEFAULT now()` с автообновлением по триггеру во все таблицы Supabase.
2. Добавь проверку в RPC `create_public_booking` и триггер на `public.bookings`, предотвращающий два активных бронирования (`status != 'cancelled'`) у одного `master_id` на одну дату и пересекающийся временной интервал.
3. В [js/supabase-sync.js](https://www.google.com/search?q=https%3A%2F%2Fgithub.com%2FRustemAK%2Fhairstudio-app%2Fblob%2Fmain%2Fjs%2Fsupabase-sync.js) и [js/db.js](https://www.google.com/search?q=https%3A%2F%2Fgithub.com%2FRustemAK%2Fhairstudio-app%2Fblob%2Fmain%2Fjs%2Fdb.js) реализуй сверку `updated_at` при слиянии записей (Last-Write-Wins с приоритетом облачных клиентских броней со статусом `new`/`pending`, чтобы офлайн-кеш мастера не затирал новые онлайн-записи).

### Этап 4. Модульный рефакторинг фронтенда (Приоритет: Высокий)

**Проблема**: Файл [js/app.js](https://www.google.com/search?q=https%3A%2F%2Fgithub.com%2FRustemAK%2Fhairstudio-app%2Fblob%2Fmain%2Fjs%2Fapp.js) содержит ~3900 строк кода, а [book.html](https://www.google.com/search?q=https%3A%2F%2Fgithub.com%2FRustemAK%2Fhairstudio-app%2Fblob%2Fmain%2Fbook.html) и [admin.html](https://www.google.com/search?q=https%3A%2F%2Fgithub.com%2FRustemAK%2Fhairstudio-app%2Fblob%2Fmain%2Fadmin.html) хранят логику внутри `<script>`-тегов.

**Задачи**:
1. Декомпозируй [js/app.js](https://www.google.com/search?q=https%3A%2F%2Fgithub.com%2FRustemAK%2Fhairstudio-app%2Fblob%2Fmain%2Fjs%2Fapp.js) на чистые ES-модули в папке `js/`:
   * `js/state.js` — централизованное состояние `state`, селекторы и индексы `Map` для $O(1)$ доступа.
   * `js/utils.js` — форматирование дат, валют, телефонов, валидация URL 2GIS и санитизация HTML (`escapeHtml` для защиты от XSS).
   * `js/calendar.js` — рендеринг таймлайна, сетки слотов, управление выходными и перерывами.
   * `js/clients.js` — CRM-карточки клиентов, история посещений, заметки `client_notes`.
   * `js/services.js` — CRUD услуг и категорий прайс-листа.
   * `js/finance.js` — учет доходов/расходов, расчет чистой прибыли и графиков аналитики.
   * `js/subscription.js` — проверка статуса подписки, модальное окно оплаты Kaspi.
   * `js/app.js` — точка входа, инициализация приложения, роутинг вкладок и глобальные делегированные обработчики событий.
2. Вынеси встроенный JavaScript из [book.html](https://www.google.com/search?q=https%3A%2F%2Fgithub.com%2FRustemAK%2Fhairstudio-app%2Fblob%2Fmain%2Fbook.html) в отдельный файл `js/book.js`, а из [admin.html](https://www.google.com/search?q=https%3A%2F%2Fgithub.com%2FRustemAK%2Fhairstudio-app%2Fblob%2Fmain%2Fadmin.html) — в `js/admin.js`.
3. Обнови список кешируемых ассетов `ASSETS_TO_CACHE` и увеличь версию `CACHE_NAME` (например, до `hairstudio-cache-v30`) в [sw.js](https://www.google.com/search?q=https%3A%2F%2Fgithub.com%2FRustemAK%2Fhairstudio-app%2Fblob%2Fmain%2Fsw.js).

### Этап 5. Документация и проверка качества (Приоритет: Средний)

**Задачи**:
1. Создай подробный `README.md` в корне репозитория с описанием:
   * Архитектуры проекта (Offline-First PWA + Supabase).
   * Пошаговой настройки проекта в Supabase (порядок выполнения [supabase\_schema.sql](https://www.google.com/search?q=https%3A%2F%2Fgithub.com%2FRustemAK%2Fhairstudio-app%2Fblob%2Fmain%2Fsupabase_schema.sql), [migration\_subscriptions.sql](https://www.google.com/search?q=https%3A%2F%2Fgithub.com%2FRustemAK%2Fhairstudio-app%2Fblob%2Fmain%2Fmigration_subscriptions.sql) и `migration_security_rls.sql`).
   * Инструкции по локальному запуску через `python3 serve.py` и `python3 serve.py --lan`.
2. Проверь отсутствие XSS-уязвимостей при рендеринге пользовательского ввода (`client_name`, `client_notes`, `service_name`) через шаблонные строки `innerHTML` — все динамические строки должны проходить через функцию экранирования `escapeHtml()`.

## 4. Ограничения и правила выполнения (Constraints)

* **Никаких внешних бандлеров без запроса**: Не добавляй `node_modules`, React, Vue или тяжелые зависимости — сохраняй легковесность Vanilla JS и совместимость с [serve.py](https://www.google.com/search?q=https%3A%2F%2Fgithub.com%2FRustemAK%2Fhairstudio-app%2Fblob%2Fmain%2Fserve.py).
* **Сохранение UI/UX**: Не меняй CSS-классы и визуальную структуру в [css/style.css](https://www.google.com/search?q=https%3A%2F%2Fgithub.com%2FRustemAK%2Fhairstudio-app%2Fblob%2Fmain%2Fcss%2Fstyle.css) и [index.html](https://www.google.com/search?q=https%3A%2F%2Fgithub.com%2FRustemAK%2Fhairstudio-app%2Fblob%2Fmain%2Findex.html) без необходимости.
* **Обратная совместимость с IndexedDB**: Схема хранилищ в [js/db.js](https://www.google.com/search?q=https%3A%2F%2Fgithub.com%2FRustemAK%2Fhairstudio-app%2Fblob%2Fmain%2Fjs%2Fdb.js) должна сохранять совместимость с уже сохраненными локальными данными пользователей (при добавлении индексов повышай версию `DB_VERSION` в `onupgradeneeded`).
* **Формат отчета агента**: После завершения каждого этапа выводи краткий список измененных файлов, описание внесенных правок и команды для проверки.
