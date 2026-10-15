# ✂️ HairStudio PWA — Система онлайн-записи и учета для мастеров и салонов красоты

**HairStudio** — это ультрабыстрое, мобильно-ориентированное веб-приложение (Progressive Web Application) с архитектурой **Offline-First**, созданное специально для частных мастеров (парикмахеров, барберов, колористов, стилистов) и студий красоты.

Приложение позволяет вести расписание, CRM клиентов с формулами окрашивания, учет расходов и аналитику чистой прибыли, а также принимать заявки клиентов через персональную страницу онлайн-записи с автоматическим контролем наложения времени и интеграцией с WhatsApp и Kaspi.

---

## 🏗️ 1. Архитектура и стек технологий

* **Frontend**: Vanilla JavaScript (Modern ES Modules), HTML5 Semantic markup, Vanilla CSS3 (с поддержкой темной/светлой темы, glassmorphism и микроанимаций).
* **Сборка**: **No-build / Zero-bundler** — отсутствие `npm`, Webpack или Vite. Модули импортируются нативно браузером через `<script type="module">`.
* **Локальное хранилище (Offline-First)**: [IndexedDB](file:///c:/Users/user/Documents/Git/hairstudio-app/js/db.js) (`HairStudioDB` v2) для мгновенного отклика (< 50мс) и полноценной работы без интернета.
* **Облачный бэкенд**: [Supabase](file:///c:/Users/user/Documents/Git/hairstudio-app/js/supabase-sync.js) (PostgreSQL 15+, GoTrue Auth, Realtime, Row Level Security, защищенные RPC-функции `SECURITY DEFINER`).
* **PWA & Кэширование**: [sw.js](file:///c:/Users/user/Documents/Git/hairstudio-app/sw.js) (Service Worker v31, стратегия Network-First с fallback в кэш).
* **Синхронизация и разрешение конфликтов**:
  * Каждая запись снабжена меткой `updated_at`.
  * При синхронизации применяется алгоритм **Last-Write-Wins** с приоритетом облачных клиентских заявок (`pending`/`confirmed`), чтобы локальный кэш мастера не перезаписывал новые онлайн-бронирования.
  * Защита от двойных записей на уровне базы данных PostgreSQL через триггер и транзакционный RPC `create_public_booking`.
* **Безопасность**:
  * Вся динамическая интерполяция пользовательских данных защищена функцией `escapeHtml()` против XSS.
  * Row Level Security (RLS) на всех таблицах базы данных.
  * Прямой доступ к персональным данным клиентов (PII) закрыт: публичная страница записи получает только занятые слоты через RPC `get_occupied_slots`.
  * Эскалация привилегий (подмена `is_admin`, продление подписки) пресекается серверным триггером `protect_master_sensitive_fields`.

---

## 🗄️ 2. Структура проекта

```text
hairstudio-app/
├── index.html                   # Кабинет мастера/студии (расписание, клиенты, услуги, финансы)
├── book.html                    # Публичная страница онлайн-записи клиента (?m=slug)
├── admin.html                   # Защищенная панель управления суперадминистратора
├── serve.py                     # Легковесный локальный HTTP-сервер Python (защита от чтения .env/.git)
├── sw.js                        # Service Worker (PWA-кэш v31)
├── manifest.json                # Манифест PWA (установка как мобильное приложение)
│
├── css/
│   ├── style.css                # Основная дизайн-система (темная палитра #0a0e17, янтарный #d4af37)
│   ├── book.css                 # Стили страницы бронирования
│   └── admin.css                # Стили панели суперадминистратора
│
├── js/
│   ├── app.js                   # Точка входа, координатор приложения, модальные окна, роутинг
│   ├── state.js                 # Централизованное реактивное состояние и O(1) Map-индексы
│   ├── utils.js                 # Форматирование дат, санитизация escapeHtml, нормализация телефонов
│   ├── calendar.js              # Расписание, таймлайн, карточки записей, проверка коллизий
│   ├── clients.js               # CRM база клиентов, формулы окрашивания, история визитов
│   ├── services.js              # Прайс-лист услуг, длительность, категории и автосинхронизация
│   ├── finance.js               # Учет расходов, расчет чистой прибыли, маржинальности и топ-услуг
│   ├── subscription.js          # Тарифные планы, проверка статуса, перевод Kaspi QR
│   ├── book.js                  # Контроллер публичной онлайн-записи
│   ├── admin.js                 # Контроллер панели суперадминистратора
│   ├── db.js                    # Обертка IndexedDB (HairStudioDB v2, схемы, LWW-слияние)
│   └── supabase-sync.js         # API-клиент Supabase (Auth, RPC, безопасные запросы)
│
└── SQL Migrations:
    ├── supabase_schema.sql          # Каноническая схема PostgreSQL
    ├── migration_subscriptions.sql  # Миграция подписок, Kaspi и 2GIS
    └── migration_security_rls.sql   # Включение RLS, безопасные RPC, защита админки
```

---

## 🚀 3. Пошаговая настройка Supabase

Для подключения облачной синхронизации и онлайн-записи выполните следующие шаги в личном кабинете [Supabase Dashboard](https://supabase.com):

### Шаг 1: Создание проекта
1. Создайте новый проект в Supabase.
2. Скопируйте **Project URL** и **anon public key** из раздела *Project Settings -> API*.
3. Укажите их в файле `.env` или параметрах `SUPABASE_CONFIG` в [js/supabase-sync.js](file:///c:/Users/user/Documents/Git/hairstudio-app/js/supabase-sync.js).

### Шаг 2: Выполнение SQL-миграций в SQL Editor
Откройте вкладку **SQL Editor** в консоли Supabase и выполните миграции **строго в следующем порядке**:

1. **Базовая схема**: [supabase_schema.sql](file:///c:/Users/user/Documents/Git/hairstudio-app/supabase_schema.sql)  
   * Создает таблицы `masters`, `services`, `schedule`, `bookings`, `client_notes`.
   * Настраивает автоматическое обновление поля `updated_at`.
2. **Система подписок и гео-ссылок**: [migration_subscriptions.sql](file:///c:/Users/user/Documents/Git/hairstudio-app/migration_subscriptions.sql)  
   * Добавляет поля подписок (`subscription_status`, `subscription_plan`, `trial_ends_at`, `subscription_ends_at`), поля для ссылок 2GIS (`gis_url`), Instagram и флаг `is_admin`.
3. **Безопасность, RLS и RPC**: [migration_security_rls.sql](file:///c:/Users/user/Documents/Git/hairstudio-app/migration_security_rls.sql)  
   * Включает Row Level Security (`ENABLE ROW LEVEL SECURITY`) для всех таблиц.
   * Настраивает изоляцию данных между мастерами (`user_id = auth.uid()`).
   * Устанавливает триггер `protect_master_sensitive_fields` для блокировки несанкционированного изменения статуса подписки или прав администратора.
   * Устанавливает триггер `check_booking_collision` против наложения броней на один временной интервал.
   * Разворачивает RPC-функции:
     * `get_occupied_slots` — получение занятого времени без утечки PII клиентов.
     * `create_public_booking` — атомарная вставка онлайн-заявки с валидацией подписки и наложений.
     * `admin_get_all_masters`, `admin_update_subscription`, `admin_delete_master` — защищенные функции для суперадминистратора.

### Шаг 3: Назначение первого суперадминистратора
В SQL Editor выполните:
```sql
UPDATE public.masters 
SET is_admin = true, subscription_status = 'lifetime'
WHERE email = 'ваш_email@example.com';
```

---

## 💻 4. Локальный запуск приложения

Для запуска локального сервера разработки не требуется установка Node.js или npm. Достаточно установленного Python 3.

### Стандартный запуск (localhost):
```bash
python serve.py
```
После запуска откройте в браузере: **http://localhost:8000**

### Запуск в локальной сети Wi-Fi (для тестирования на смартфоне):
```bash
python serve.py --lan
```
Сервер выведет IP-адрес в вашей локальной сети (например, `http://192.168.1.45:8000`). Откройте этот адрес в Safari на iPhone или Chrome на Android для тестирования PWA-режима и установки на домашний экран.

---

## 🔒 5. Безопасность и защита данных

* **Защита от XSS**: Все строковые данные, введенные пользователями (`clientName`, `clientPhone`, `notes`, `materialsUsed`, `serviceName`), экранируются через [escapeHtml()](file:///c:/Users/user/Documents/Git/hairstudio-app/js/utils.js) перед вставкой в DOM.
* **Защита от утечки PII**: Неавторизованные пользователи на странице `book.html` не имеют прямого доступа на чтение таблицы `bookings`. Они вызывают PostgreSQL RPC `get_occupied_slots`, который возвращает только таймслоты (`start_time`, `end_time`) без имен и номеров телефонов.
* **Защита от спуфинга цен и услуг**: При подтверждении онлайн-заявки в кабинете мастера сопоставление услуг и пересчет стоимости производятся по актуальному локальному прайс-листу мастера.
* **Защита исходного кода на сервере**: [serve.py](file:///c:/Users/user/Documents/Git/hairstudio-app/serve.py) блокирует запросы к служебным файлам `.env`, `.git`, `.sql`, предотвращая утечку секретов и дампов БД.

---

## 📱 6. Использование PWA

1. **Установка на смартфон**: В браузере (Safari на iOS: «Поделиться» -> «На экран "Домой"»; Chrome на Android: «Добавить на главный экран»).
2. **Работа офлайн**: Приложение открывается и функционирует при полном отсутствии интернета. При появлении соединения данные автоматически синхронизируются с облаком Supabase.
3. **Резервные копии**: В настройках доступен экспорт базы в формате `.json`, а также автоматическое локальное резервное копирование с заданным интервалом (ежедневно, еженедельно, ежемесячно).
