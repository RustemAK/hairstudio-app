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
    gis_url TEXT DEFAULT '',                                  -- ссылка на филиал в 2ГИС
    instagram TEXT DEFAULT '',
    work_start_hour INT NOT NULL DEFAULT 9,                   -- начало рабочего дня (09:00)
    work_end_hour INT NOT NULL DEFAULT 21,                    -- конец рабочего дня (21:00)
    slot_step_min INT NOT NULL DEFAULT 30,                    -- шаг сетки записи (30 мин)
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Добавляем колонки если таблица уже существовала
ALTER TABLE public.masters ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.masters ADD COLUMN IF NOT EXISTS gis_url TEXT DEFAULT '';

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
DROP POLICY IF EXISTS "Allow master to manage own services" ON public.master_services;

DROP POLICY IF EXISTS "Public can view future busy slots" ON public.master_busy_slots;
DROP POLICY IF EXISTS "Allow manage busy slots" ON public.master_busy_slots;
DROP POLICY IF EXISTS "Allow master to manage own busy slots" ON public.master_busy_slots;

DROP POLICY IF EXISTS "Public can create pending bookings" ON public.booking_requests;
DROP POLICY IF EXISTS "Allow read bookings for master" ON public.booking_requests;
DROP POLICY IF EXISTS "Allow update bookings for master" ON public.booking_requests;
DROP POLICY IF EXISTS "Allow delete bookings for master" ON public.booking_requests;
DROP POLICY IF EXISTS "Allow master to read own bookings" ON public.booking_requests;
DROP POLICY IF EXISTS "Allow master to update own bookings" ON public.booking_requests;
DROP POLICY IF EXISTS "Allow master to delete own bookings" ON public.booking_requests;

-- 1. MASTERS POLICIES:
-- Публичный просмотр профилей для онлайн-бронирования
CREATE POLICY "Public can view active masters"
    ON public.masters FOR SELECT
    USING (is_active = true);

-- Авторизованный мастер создает свой профиль
CREATE POLICY "Allow master to insert own profile"
    ON public.masters FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Авторизованный мастер обновляет только свой профиль
CREATE POLICY "Allow master to update own profile"
    ON public.masters FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);


-- 2. SERVICES POLICIES:
CREATE POLICY "Public can view active services"
    ON public.master_services FOR SELECT
    USING (is_active = true);

CREATE POLICY "Allow master to manage own services"
    ON public.master_services FOR ALL
    USING (
        auth.uid() IS NOT NULL AND 
        EXISTS (SELECT 1 FROM public.masters WHERE id = master_services.master_id AND user_id = auth.uid())
    )
    WITH CHECK (
        auth.uid() IS NOT NULL AND 
        EXISTS (SELECT 1 FROM public.masters WHERE id = master_services.master_id AND user_id = auth.uid())
    );


-- 3. BUSY SLOTS POLICIES:
CREATE POLICY "Public can view future busy slots"
    ON public.master_busy_slots FOR SELECT
    USING (date >= current_date);

CREATE POLICY "Allow master to manage own busy slots"
    ON public.master_busy_slots FOR ALL
    USING (
        auth.uid() IS NOT NULL AND 
        EXISTS (SELECT 1 FROM public.masters WHERE id = master_busy_slots.master_id AND user_id = auth.uid())
    )
    WITH CHECK (
        auth.uid() IS NOT NULL AND 
        EXISTS (SELECT 1 FROM public.masters WHERE id = master_busy_slots.master_id AND user_id = auth.uid())
    );


-- 4. BOOKINGS POLICIES:
-- Публичный клиент с улицы может только отправить новую заявку 'pending' на будущее/сегодня
CREATE POLICY "Public can create pending bookings"
    ON public.booking_requests FOR INSERT
    WITH CHECK (status = 'pending' AND date >= current_date);

-- СТРОГО: Только авторизованный мастер видит заявки клиентов (защита персональных данных!)
CREATE POLICY "Allow master to read own bookings"
    ON public.booking_requests FOR SELECT
    USING (
        auth.uid() IS NOT NULL AND 
        EXISTS (SELECT 1 FROM public.masters WHERE id = booking_requests.master_id AND user_id = auth.uid())
    );

-- Только авторизованный мастер может менять статус заявки:
CREATE POLICY "Allow master to update own bookings"
    ON public.booking_requests FOR UPDATE
    USING (
        auth.uid() IS NOT NULL AND 
        EXISTS (SELECT 1 FROM public.masters WHERE id = booking_requests.master_id AND user_id = auth.uid())
    )
    WITH CHECK (
        auth.uid() IS NOT NULL AND 
        EXISTS (SELECT 1 FROM public.masters WHERE id = booking_requests.master_id AND user_id = auth.uid())
    );

CREATE POLICY "Allow master to delete own bookings"
    ON public.booking_requests FOR DELETE
    USING (
        auth.uid() IS NOT NULL AND 
        EXISTS (SELECT 1 FROM public.masters WHERE id = booking_requests.master_id AND user_id = auth.uid())
    );


-- ==========================================================
-- 5. БЕЗОПАСНАЯ RPC-ФУНКЦИЯ ДЛЯ ОПРЕДЕЛЕНИЯ ЗАНЯТЫХ СЛОТОВ
-- Отдает только дату и часы без раскрытия персональных данных клиентов
-- ==========================================================
CREATE OR REPLACE FUNCTION public.get_master_busy_intervals(p_master_id UUID, p_date DATE)
RETURNS TABLE (date DATE, start_time TIME, end_time TIME) AS $$
BEGIN
  RETURN QUERY
    SELECT s.date, s.start_time, s.end_time 
    FROM public.master_busy_slots s
    WHERE s.master_id = p_master_id AND s.date = p_date
    UNION
    SELECT b.date, b.start_time, b.end_time
    FROM public.booking_requests b
    WHERE b.master_id = p_master_id AND b.date = p_date AND b.status IN ('pending', 'confirmed');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_master_busy_intervals(UUID, DATE) TO anon, authenticated, service_role;


-- ==========================================================
-- 6. ТРИГГЕР: АВТО-СИНХРОНИЗАЦИЯ ПОДТВЕРЖДЕННЫХ ЗАЯВОК В СЛОТЫ
-- ==========================================================
CREATE OR REPLACE FUNCTION public.sync_confirmed_booking_to_busy_slots()
RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'confirmed' AND (OLD.status IS NULL OR OLD.status != 'confirmed') THEN
    INSERT INTO public.master_busy_slots (master_id, date, start_time, end_time)
    VALUES (NEW.master_id, NEW.date, NEW.start_time, NEW.end_time);
  ELSIF OLD.status = 'confirmed' AND (NEW.status = 'rejected' OR NEW.status = 'cancelled') THEN
    DELETE FROM public.master_busy_slots 
    WHERE master_id = OLD.master_id 
      AND date = OLD.date 
      AND start_time = OLD.start_time 
      AND end_time = OLD.end_time;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_sync_confirmed_booking ON public.booking_requests;
CREATE TRIGGER trigger_sync_confirmed_booking
  AFTER UPDATE OR INSERT ON public.booking_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_confirmed_booking_to_busy_slots();


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


-- ==========================================================
-- 7. СИСТЕМА ПОДПИСОК И АДМИНИСТРАТИВНАЯ ПАНЕЛЬ
-- ==========================================================
ALTER TABLE public.masters 
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'trial',
  ADD COLUMN IF NOT EXISTS subscription_plan TEXT DEFAULT 'trial',
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ DEFAULT (timezone('utc'::text, now()) + interval '14 days'),
  ADD COLUMN IF NOT EXISTS subscription_ends_at TIMESTAMPTZ DEFAULT (timezone('utc'::text, now()) + interval '14 days'),
  ADD COLUMN IF NOT EXISTS subscription_notes TEXT DEFAULT '';

-- Учет оплат подписок
CREATE TABLE IF NOT EXISTS public.subscription_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    master_id UUID NOT NULL REFERENCES public.masters(id) ON DELETE CASCADE,
    amount INT NOT NULL,                  -- сумма в тенге (2990, 7990, 24900)
    period_months INT NOT NULL DEFAULT 1, -- количество месяцев
    payment_method TEXT DEFAULT 'kaspi',  -- 'kaspi', 'transfer', 'qr', 'cash'
    status TEXT DEFAULT 'confirmed',      -- 'confirmed', 'pending', 'cancelled'
    confirmed_by TEXT DEFAULT 'admin',
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow admin to manage payments"
    ON public.subscription_payments FOR ALL
    USING (
        EXISTS (SELECT 1 FROM public.masters m WHERE m.user_id = auth.uid() AND m.is_admin = TRUE)
    )
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.masters m WHERE m.user_id = auth.uid() AND m.is_admin = TRUE)
    );

-- RPC функция быстрого продления подписки
CREATE OR REPLACE FUNCTION public.admin_extend_subscription(
    p_master_id UUID, 
    p_months INT, 
    p_amount INT DEFAULT 0,
    p_payment_method TEXT DEFAULT 'kaspi',
    p_notes TEXT DEFAULT ''
)
RETURNS JSONB AS $$
DECLARE
    v_master public.masters%ROWTYPE;
    v_new_end TIMESTAMPTZ;
    v_base_date TIMESTAMPTZ;
BEGIN
    SELECT * INTO v_master FROM public.masters WHERE id = p_master_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Мастер не найден');
    END IF;

    IF v_master.subscription_ends_at IS NOT NULL AND v_master.subscription_ends_at > now() THEN
        v_base_date := v_master.subscription_ends_at;
    ELSE
        v_base_date := now();
    END IF;

    IF p_months = 999 THEN
        v_new_end := now() + interval '100 years';
    ELSE
        v_new_end := v_base_date + (p_months || ' months')::INTERVAL;
    END IF;

    UPDATE public.masters 
    SET subscription_status = CASE WHEN p_months = 999 THEN 'lifetime' ELSE 'active' END,
        subscription_plan = CASE 
            WHEN p_months = 1 THEN 'monthly' 
            WHEN p_months = 3 THEN 'quarterly' 
            WHEN p_months = 12 THEN 'yearly' 
            WHEN p_months = 999 THEN 'lifetime'
            ELSE 'custom'
        END,
        subscription_ends_at = v_new_end,
        is_active = TRUE
    WHERE id = p_master_id;

    IF p_amount > 0 THEN
        INSERT INTO public.subscription_payments (master_id, amount, period_months, payment_method, notes)
        VALUES (p_master_id, p_amount, p_months, p_payment_method, p_notes);
    END IF;

    RETURN jsonb_build_object(
        'success', true, 
        'master_id', p_master_id, 
        'new_ends_at', v_new_end,
        'subscription_status', CASE WHEN p_months = 999 THEN 'lifetime' ELSE 'active' END
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.admin_extend_subscription(UUID, INT, INT, TEXT, TEXT) TO authenticated, anon;

