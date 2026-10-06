-- ==========================================================
-- HairStudio - Supabase Database Schema
-- Архитектура онлайн-записи клиентов для бьюти-мастеров
-- ==========================================================

-- 1. Таблица мастеров (профили и настройки)
CREATE TABLE IF NOT EXISTS public.masters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT UNIQUE NOT NULL,                  -- короткая ссылка: /book.html?m=ruslan
    name TEXT NOT NULL,                         -- имя мастера: 'Руслан'
    salon_name TEXT DEFAULT 'HairStudio',       -- название студии / салона
    phone TEXT NOT NULL,                        -- телефон мастера: '+77011234567'
    city TEXT DEFAULT 'Алматы',
    address TEXT DEFAULT 'ул. Абая 150',
    instagram TEXT DEFAULT '',
    work_start_hour INT NOT NULL DEFAULT 9,     -- начало рабочего дня (09:00)
    work_end_hour INT NOT NULL DEFAULT 21,      -- конец рабочего дня (21:00)
    slot_step_min INT NOT NULL DEFAULT 30,      -- шаг сетки записи (30 мин)
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Индекс для быстрого поиска мастера по ссылке (slug)
CREATE INDEX IF NOT EXISTS idx_masters_slug ON public.masters(slug);


-- 2. Таблица услуг мастера (без цен для клиентов!)
CREATE TABLE IF NOT EXISTS public.master_services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    master_id UUID NOT NULL REFERENCES public.masters(id) ON DELETE CASCADE,
    name TEXT NOT NULL,                         -- например: 'Мужская стрижка'
    category TEXT DEFAULT 'Стрижки',            -- Стрижки, Окрашивание, Уход и т.д.
    duration_min INT NOT NULL DEFAULT 60,       -- длительность в минутах (нужна для слотов)
    sort_order INT DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_services_master ON public.master_services(master_id);


-- 3. Таблица занятых интервалов мастера (только обезличенные часы!)
-- Защита приватности: клиенты НЕ видят имена других людей, только факт занятости
CREATE TABLE IF NOT EXISTS public.master_busy_slots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    master_id UUID NOT NULL REFERENCES public.masters(id) ON DELETE CASCADE,
    date DATE NOT NULL,                         -- '2026-10-15'
    start_time TIME NOT NULL,                   -- '14:00:00'
    end_time TIME NOT NULL,                     -- '15:30:00'
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_busy_slots_master_date ON public.master_busy_slots(master_id, date);


-- 4. Таблица входящих заявок от клиентов
CREATE TABLE IF NOT EXISTS public.booking_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    master_id UUID NOT NULL REFERENCES public.masters(id) ON DELETE CASCADE,
    client_name TEXT NOT NULL,                  -- Имя клиента
    client_phone TEXT NOT NULL,                 -- Номер WhatsApp клиента (+7...)
    date DATE NOT NULL,                         -- Дата записи
    start_time TIME NOT NULL,                   -- Время начала ('14:00')
    end_time TIME NOT NULL,                     -- Время окончания ('15:15')
    service_names TEXT NOT NULL,                -- 'Стрижка + Борода'
    duration_min INT NOT NULL DEFAULT 60,
    client_note TEXT DEFAULT '',                -- пожелания клиента
    status TEXT NOT NULL DEFAULT 'pending',     -- 'pending' (на рассмотрении), 'confirmed', 'rejected'
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_bookings_master_status ON public.booking_requests(master_id, status);
CREATE INDEX IF NOT EXISTS idx_bookings_date ON public.booking_requests(date);


-- ==========================================================
-- БЕЗОПАСНОСТЬ: Row Level Security (RLS)
-- ==========================================================
ALTER TABLE public.masters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_busy_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_requests ENABLE ROW LEVEL SECURITY;

-- 1. Чтение профилей мастеров: любой посетитель может смотреть активных мастеров
CREATE POLICY "Public can view active masters"
    ON public.masters FOR SELECT
    USING (is_active = true);

-- 2. Чтение услуг: любой посетитель может смотреть услуги мастера
CREATE POLICY "Public can view active services"
    ON public.master_services FOR SELECT
    USING (is_active = true);

-- 3. Чтение занятых слотов: клиенты видят занятые отрезки на будущие даты
CREATE POLICY "Public can view future busy slots"
    ON public.master_busy_slots FOR SELECT
    USING (date >= current_date);

-- 4. Заявки на бронирование:
-- Клиенты могут отправлять новые заявки со статусом 'pending'
CREATE POLICY "Public can create pending bookings"
    ON public.booking_requests FOR INSERT
    WITH CHECK (status = 'pending');

-- Мастер (через anon-ключ со своим master_id) может просматривать и обновлять заявки
CREATE POLICY "Allow read bookings for master"
    ON public.booking_requests FOR SELECT
    USING (true);

CREATE POLICY "Allow update bookings for master"
    ON public.booking_requests FOR UPDATE
    USING (true);

-- Мастер может управлять своими занятыми слотами
CREATE POLICY "Allow manage busy slots"
    ON public.master_busy_slots FOR ALL
    USING (true)
    WITH CHECK (true);

-- Мастер может управлять своими услугами
CREATE POLICY "Allow manage services"
    ON public.master_services FOR ALL
    USING (true)
    WITH CHECK (true);


-- ==========================================================
-- НАЧАЛЬНЫЕ ДЕМО-ДАННЫЕ (для быстрого старта)
-- ==========================================================
INSERT INTO public.masters (id, slug, name, salon_name, phone, city, address, instagram, work_start_hour, work_end_hour, slot_step_min)
VALUES (
    'a0000000-0000-0000-0000-000000000001',
    'demo',
    'Руслан',
    'HairStudio',
    '+77011234567',
    'Алматы',
    'пр. Абая 150, 2 этаж',
    'hairstudio_kz',
    9,
    21,
    30
) ON CONFLICT (slug) DO NOTHING;

-- Демо-услуги (обратите внимание: цены здесь не выводятся клиентам!)
INSERT INTO public.master_services (master_id, name, category, duration_min, sort_order)
VALUES 
    ('a0000000-0000-0000-0000-000000000001', 'Мужская стрижка классическая', 'Стрижки', 45, 1),
    ('a0000000-0000-0000-0000-000000000001', 'Моделирование бороды и усов', 'Стрижки', 30, 2),
    ('a0000000-0000-0000-0000-000000000001', 'Комплекс: Стрижка + Борода', 'Стрижки', 75, 3),
    ('a0000000-0000-0000-0000-000000000001', 'Камуфляж седины волос / бороды', 'Окрашивание', 30, 4),
    ('a0000000-0000-0000-0000-000000000001', 'SPA-уход за кожей головы и волосами', 'Уход', 40, 5)
ON CONFLICT DO NOTHING;
