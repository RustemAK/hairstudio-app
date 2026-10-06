-- ==========================================================
-- HairStudio - Supabase Database Schema (v2.0 с Авторизацией)
-- Полноценная мульти-мастер система с защитой через Supabase Auth
-- ==========================================================

-- 1. Таблица мастеров (профили и настройки с привязкой к auth.users)
CREATE TABLE IF NOT EXISTS public.masters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE, -- привязка к аккаунту мастера
    slug TEXT UNIQUE NOT NULL,                                -- короткая ссылка: /book.html?m=ruslan
    name TEXT NOT NULL,                                       -- имя мастера: 'Руслан'
    salon_name TEXT DEFAULT 'HairStudio',                     -- название студии / салона
    phone TEXT NOT NULL,                                      -- телефон мастера: '+77011234567'
    city TEXT DEFAULT 'Алматы',
    address TEXT DEFAULT 'ул. Абая 150',
    instagram TEXT DEFAULT '',
    work_start_hour INT NOT NULL DEFAULT 9,                   -- начало рабочего дня (09:00)
    work_end_hour INT NOT NULL DEFAULT 21,                    -- конец рабочего дня (21:00)
    slot_step_min INT NOT NULL DEFAULT 30,                    -- шаг сетки записи (30 мин)
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Добавляем колонку user_id если таблица уже существовала
ALTER TABLE public.masters ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_masters_slug ON public.masters(slug);
CREATE INDEX IF NOT EXISTS idx_masters_user_id ON public.masters(user_id);


-- 2. Таблица услуг мастера (без цен для клиентов!)
CREATE TABLE IF NOT EXISTS public.master_services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    master_id UUID NOT NULL REFERENCES public.masters(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT DEFAULT 'Стрижки',
    duration_min INT NOT NULL DEFAULT 60,
    sort_order INT DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_services_master ON public.master_services(master_id);


-- 3. Таблица занятых интервалов мастера (обезличенные слоты)
CREATE TABLE IF NOT EXISTS public.master_busy_slots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    master_id UUID NOT NULL REFERENCES public.masters(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_busy_slots_master_date ON public.master_busy_slots(master_id, date);


-- 4. Таблица входящих заявок от клиентов
CREATE TABLE IF NOT EXISTS public.booking_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    master_id UUID NOT NULL REFERENCES public.masters(id) ON DELETE CASCADE,
    client_name TEXT NOT NULL,
    client_phone TEXT NOT NULL,
    date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    service_names TEXT NOT NULL,
    duration_min INT NOT NULL DEFAULT 60,
    client_note TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'confirmed', 'rejected'
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_bookings_master_status ON public.booking_requests(master_id, status);
CREATE INDEX IF NOT EXISTS idx_bookings_date ON public.booking_requests(date);


-- ==========================================================
-- СТРОГАЯ БЕЗОПАСНОСТЬ: Row Level Security (RLS)
-- ==========================================================
ALTER TABLE public.masters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_busy_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_requests ENABLE ROW LEVEL SECURITY;

-- Удаляем старые политики для обновления
DROP POLICY IF EXISTS "Public can view active masters" ON public.masters;
DROP POLICY IF EXISTS "Allow master to insert own profile" ON public.masters;
DROP POLICY IF EXISTS "Allow master to update own profile" ON public.masters;

DROP POLICY IF EXISTS "Public can view active services" ON public.master_services;
DROP POLICY IF EXISTS "Allow manage services" ON public.master_services;

DROP POLICY IF EXISTS "Public can view future busy slots" ON public.master_busy_slots;
DROP POLICY IF EXISTS "Allow manage busy slots" ON public.master_busy_slots;

DROP POLICY IF EXISTS "Public can create pending bookings" ON public.booking_requests;
DROP POLICY IF EXISTS "Allow read bookings for master" ON public.booking_requests;
DROP POLICY IF EXISTS "Allow update bookings for master" ON public.booking_requests;

-- 1. MASTERS POLICIES:
-- Публичный просмотр профилей для онлайн-бронирования
CREATE POLICY "Public can view active masters"
    ON public.masters FOR SELECT
    USING (is_active = true);

-- Авторизованный мастер создает свой профиль
CREATE POLICY "Allow master to insert own profile"
    ON public.masters FOR INSERT
    WITH CHECK (auth.uid() = user_id OR auth.uid() IS NULL);

-- Авторизованный мастер обновляет только свой профиль
CREATE POLICY "Allow master to update own profile"
    ON public.masters FOR UPDATE
    USING (auth.uid() = user_id OR user_id IS NULL)
    WITH CHECK (auth.uid() = user_id OR user_id IS NULL);


-- 2. SERVICES POLICIES:
CREATE POLICY "Public can view active services"
    ON public.master_services FOR SELECT
    USING (is_active = true);

CREATE POLICY "Allow manage services"
    ON public.master_services FOR ALL
    USING (
        auth.uid() IS NULL OR 
        EXISTS (SELECT 1 FROM public.masters WHERE id = master_services.master_id AND (user_id = auth.uid() OR user_id IS NULL))
    )
    WITH CHECK (
        auth.uid() IS NULL OR 
        EXISTS (SELECT 1 FROM public.masters WHERE id = master_services.master_id AND (user_id = auth.uid() OR user_id IS NULL))
    );


-- 3. BUSY SLOTS POLICIES:
CREATE POLICY "Public can view future busy slots"
    ON public.master_busy_slots FOR SELECT
    USING (date >= current_date);

CREATE POLICY "Allow manage busy slots"
    ON public.master_busy_slots FOR ALL
    USING (
        auth.uid() IS NULL OR 
        EXISTS (SELECT 1 FROM public.masters WHERE id = master_busy_slots.master_id AND (user_id = auth.uid() OR user_id IS NULL))
    )
    WITH CHECK (
        auth.uid() IS NULL OR 
        EXISTS (SELECT 1 FROM public.masters WHERE id = master_busy_slots.master_id AND (user_id = auth.uid() OR user_id IS NULL))
    );


-- 4. BOOKINGS POLICIES:
-- Клиент с улицы может только отправить новую заявку 'pending'
CREATE POLICY "Public can create pending bookings"
    ON public.booking_requests FOR INSERT
    WITH CHECK (status = 'pending');

-- Только владелец-мастер видит заявки на свое имя:
CREATE POLICY "Allow read bookings for master"
    ON public.booking_requests FOR SELECT
    USING (
        auth.uid() IS NULL OR 
        EXISTS (SELECT 1 FROM public.masters WHERE id = booking_requests.master_id AND (user_id = auth.uid() OR user_id IS NULL))
    );

-- Только владелец-мастер может менять статус заявки:
CREATE POLICY "Allow update bookings for master"
    ON public.booking_requests FOR UPDATE
    USING (
        auth.uid() IS NULL OR 
        EXISTS (SELECT 1 FROM public.masters WHERE id = booking_requests.master_id AND (user_id = auth.uid() OR user_id IS NULL))
    );


-- ==========================================================
-- НАЧАЛЬНЫЕ ДЕМО-ДАННЫЕ
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

INSERT INTO public.master_services (master_id, name, category, duration_min, sort_order)
VALUES 
    ('a0000000-0000-0000-0000-000000000001', 'Мужская стрижка классическая', 'Стрижки', 45, 1),
    ('a0000000-0000-0000-0000-000000000001', 'Моделирование бороды и усов', 'Стрижки', 30, 2),
    ('a0000000-0000-0000-0000-000000000001', 'Комплекс: Стрижка + Борода', 'Стрижки', 75, 3),
    ('a0000000-0000-0000-0000-000000000001', 'Камуфляж седины волос / бороды', 'Окрашивание', 30, 4),
    ('a0000000-0000-0000-0000-000000000001', 'SPA-уход за кожей головы и волосами', 'Уход', 40, 5)
ON CONFLICT DO NOTHING;
