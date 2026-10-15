-- ==========================================================
-- HairStudio PWA - Security & RLS Migration (v3.0)
-- File: migration_security_rls.sql
-- 
-- Полноценная защита базы данных:
-- 1. Row Level Security (RLS) для всех таблиц
-- 2. Защищенные RPC для онлайн-бронирования без утечки ПДн клиентов
-- 3. Серверная проверка прав администратора в RPC
-- 4. Защитный триггер от изменения чувствительных колонок мастерами
-- 5. Триггер автообновления updated_at и защита от коллизий слотов
-- ==========================================================

-- 1. СТОЛБЦЫ И ТРИГГЕРЫ UPDATED_AT ДЛЯ СИНХРОНИЗАЦИИ
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Добавление updated_at во все таблицы
ALTER TABLE public.masters ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now());
ALTER TABLE public.master_services ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now());
ALTER TABLE public.master_busy_slots ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now());
ALTER TABLE public.booking_requests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now());

-- Триггеры обновления updated_at
DROP TRIGGER IF EXISTS trigger_masters_updated_at ON public.masters;
CREATE TRIGGER trigger_masters_updated_at
    BEFORE UPDATE ON public.masters
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trigger_master_services_updated_at ON public.master_services;
CREATE TRIGGER trigger_master_services_updated_at
    BEFORE UPDATE ON public.master_services
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trigger_master_busy_slots_updated_at ON public.master_busy_slots;
CREATE TRIGGER trigger_master_busy_slots_updated_at
    BEFORE UPDATE ON public.master_busy_slots
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trigger_booking_requests_updated_at ON public.booking_requests;
CREATE TRIGGER trigger_booking_requests_updated_at
    BEFORE UPDATE ON public.booking_requests
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- 2. ТАБЛИЦА ЗАМЕТОК О КЛИЕНТАХ (CRM CLIENT NOTES)
CREATE TABLE IF NOT EXISTS public.client_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    master_id UUID NOT NULL REFERENCES public.masters(id) ON DELETE CASCADE,
    client_phone TEXT NOT NULL,
    client_name TEXT DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_client_notes_master_phone ON public.client_notes(master_id, client_phone);

DROP TRIGGER IF EXISTS trigger_client_notes_updated_at ON public.client_notes;
CREATE TRIGGER trigger_client_notes_updated_at
    BEFORE UPDATE ON public.client_notes
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ==========================================================
-- 3. ВКЛЮЧЕНИЕ И НАСТРОЙКА ROW LEVEL SECURITY (RLS)
-- ==========================================================
ALTER TABLE public.masters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_busy_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_notes ENABLE ROW LEVEL SECURITY;

-- Сброс старых политик для чистой установки
DROP POLICY IF EXISTS "Public can view active masters" ON public.masters;
DROP POLICY IF EXISTS "Allow master to insert own profile" ON public.masters;
DROP POLICY IF EXISTS "Allow master to update own profile" ON public.masters;
DROP POLICY IF EXISTS "Allow admin full access to masters" ON public.masters;

DROP POLICY IF EXISTS "Public can view active services" ON public.master_services;
DROP POLICY IF EXISTS "Allow master to manage own services" ON public.master_services;

DROP POLICY IF EXISTS "Public can view future busy slots" ON public.master_busy_slots;
DROP POLICY IF EXISTS "Allow master to manage own busy slots" ON public.master_busy_slots;

DROP POLICY IF EXISTS "Public can create pending bookings" ON public.booking_requests;
DROP POLICY IF EXISTS "Allow master to read own bookings" ON public.booking_requests;
DROP POLICY IF EXISTS "Allow master to update own bookings" ON public.booking_requests;
DROP POLICY IF EXISTS "Allow master to delete own bookings" ON public.booking_requests;

DROP POLICY IF EXISTS "Allow master to manage own client notes" ON public.client_notes;
DROP POLICY IF EXISTS "Allow admin to manage payments" ON public.subscription_payments;
DROP POLICY IF EXISTS "Allow master to view own payments" ON public.subscription_payments;

-- Политики MASTERS
CREATE POLICY "Public can view active masters"
    ON public.masters FOR SELECT
    USING (is_active = true OR (auth.uid() IS NOT NULL AND auth.uid() = user_id));

CREATE POLICY "Allow master to insert own profile"
    ON public.masters FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Allow master to update own profile"
    ON public.masters FOR UPDATE
    USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM public.masters m WHERE m.user_id = auth.uid() AND m.is_admin = true))
    WITH CHECK (auth.uid() = user_id OR EXISTS (SELECT 1 FROM public.masters m WHERE m.user_id = auth.uid() AND m.is_admin = true));

-- Политики MASTER_SERVICES
CREATE POLICY "Public can view active services"
    ON public.master_services FOR SELECT
    USING (is_active = true OR EXISTS (SELECT 1 FROM public.masters m WHERE m.id = master_services.master_id AND m.user_id = auth.uid()));

CREATE POLICY "Allow master to manage own services"
    ON public.master_services FOR ALL
    USING (auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM public.masters m WHERE m.id = master_services.master_id AND m.user_id = auth.uid()))
    WITH CHECK (auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM public.masters m WHERE m.id = master_services.master_id AND m.user_id = auth.uid()));

-- Политики MASTER_BUSY_SLOTS
CREATE POLICY "Public can view future busy slots"
    ON public.master_busy_slots FOR SELECT
    USING (date >= current_date OR EXISTS (SELECT 1 FROM public.masters m WHERE m.id = master_busy_slots.master_id AND m.user_id = auth.uid()));

CREATE POLICY "Allow master to manage own busy slots"
    ON public.master_busy_slots FOR ALL
    USING (auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM public.masters m WHERE m.id = master_busy_slots.master_id AND m.user_id = auth.uid()))
    WITH CHECK (auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM public.masters m WHERE m.id = master_busy_slots.master_id AND m.user_id = auth.uid()));

-- Политики BOOKING_REQUESTS (СТРОГО: Клиенты не читают чужие брони напрямую)
CREATE POLICY "Allow master to read own bookings"
    ON public.booking_requests FOR SELECT
    USING (auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM public.masters m WHERE m.id = booking_requests.master_id AND m.user_id = auth.uid()));

CREATE POLICY "Allow master to update own bookings"
    ON public.booking_requests FOR UPDATE
    USING (auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM public.masters m WHERE m.id = booking_requests.master_id AND m.user_id = auth.uid()))
    WITH CHECK (auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM public.masters m WHERE m.id = booking_requests.master_id AND m.user_id = auth.uid()));

CREATE POLICY "Allow master to delete own bookings"
    ON public.booking_requests FOR DELETE
    USING (auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM public.masters m WHERE m.id = booking_requests.master_id AND m.user_id = auth.uid()));

-- Политики CLIENT_NOTES
CREATE POLICY "Allow master to manage own client notes"
    ON public.client_notes FOR ALL
    USING (auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM public.masters m WHERE m.id = client_notes.master_id AND m.user_id = auth.uid()))
    WITH CHECK (auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM public.masters m WHERE m.id = client_notes.master_id AND m.user_id = auth.uid()));

-- Политики SUBSCRIPTION_PAYMENTS
CREATE POLICY "Allow admin to manage payments"
    ON public.subscription_payments FOR ALL
    USING (EXISTS (SELECT 1 FROM public.masters m WHERE m.user_id = auth.uid() AND m.is_admin = true))
    WITH CHECK (EXISTS (SELECT 1 FROM public.masters m WHERE m.user_id = auth.uid() AND m.is_admin = true));

CREATE POLICY "Allow master to view own payments"
    ON public.subscription_payments FOR SELECT
    USING (auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM public.masters m WHERE m.id = subscription_payments.master_id AND m.user_id = auth.uid()));


-- ==========================================================
-- 4. ЗАЩИТНЫЙ ТРИГГЕР: Запрет самовольной смены подписки и эскалации прав
-- ==========================================================
CREATE OR REPLACE FUNCTION public.protect_master_sensitive_fields()
RETURNS trigger AS $$
DECLARE
    v_is_caller_admin BOOLEAN := FALSE;
BEGIN
    SELECT is_admin INTO v_is_caller_admin
    FROM public.masters
    WHERE user_id = auth.uid();

    -- Если вызывающий не администратор платформы, фиксируем оригинальные значения
    IF v_is_caller_admin IS NOT TRUE THEN
        NEW.is_admin := OLD.is_admin;
        NEW.subscription_status := OLD.subscription_status;
        NEW.subscription_plan := OLD.subscription_plan;
        NEW.trial_ends_at := OLD.trial_ends_at;
        NEW.subscription_ends_at := OLD.subscription_ends_at;
        NEW.subscription_notes := OLD.subscription_notes;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_protect_master_fields ON public.masters;
CREATE TRIGGER trigger_protect_master_fields
    BEFORE UPDATE ON public.masters
    FOR EACH ROW
    EXECUTE FUNCTION public.protect_master_sensitive_fields();


-- ==========================================================
-- 5. ПРЕДОТВРАЩЕНИЕ ПЕРЕСЕЧЕНИЯ СЛОТОВ (Anti-Collision Trigger)
-- ==========================================================
CREATE OR REPLACE FUNCTION public.check_booking_collision()
RETURNS trigger AS $$
BEGIN
    -- Проверяем только активные бронирования
    IF NEW.status IN ('pending', 'confirmed') THEN
        IF EXISTS (
            SELECT 1 FROM public.booking_requests b
            WHERE b.master_id = NEW.master_id
              AND b.date = NEW.date
              AND b.id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
              AND b.status IN ('pending', 'confirmed')
              AND (b.start_time, b.end_time) OVERLAPS (NEW.start_time, NEW.end_time)
        ) THEN
            RAISE EXCEPTION 'Выбранный временной слот уже занят другим бронированием.';
        END IF;

        IF EXISTS (
            SELECT 1 FROM public.master_busy_slots s
            WHERE s.master_id = NEW.master_id
              AND s.date = NEW.date
              AND (s.start_time, s.end_time) OVERLAPS (NEW.start_time, NEW.end_time)
        ) THEN
            RAISE EXCEPTION 'Выбранное время заблокировано в графике мастера.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_check_booking_collision ON public.booking_requests;
CREATE TRIGGER trigger_check_booking_collision
    BEFORE INSERT OR UPDATE ON public.booking_requests
    FOR EACH ROW
    EXECUTE FUNCTION public.check_booking_collision();


-- ==========================================================
-- 6. БЕЗОПАСНЫЕ RPC-ФУНКЦИИ ДЛЯ КЛИЕНТСКОГО БРОНИРОВАНИЯ
-- ==========================================================

-- А) Получение занятых слотов без раскрытия персональных данных клиентов
CREATE OR REPLACE FUNCTION public.get_occupied_slots(p_master_id UUID, p_date DATE)
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

GRANT EXECUTE ON FUNCTION public.get_occupied_slots(UUID, DATE) TO anon, authenticated, service_role;

-- Псевдоним для совместимости со старыми клиентами
CREATE OR REPLACE FUNCTION public.get_master_busy_intervals(p_master_id UUID, p_date DATE)
RETURNS TABLE (date DATE, start_time TIME, end_time TIME) AS $$
BEGIN
    RETURN QUERY SELECT * FROM public.get_occupied_slots(p_master_id, p_date);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_master_busy_intervals(UUID, DATE) TO anon, authenticated, service_role;


-- Б) Безопасное создание публичной брони
CREATE OR REPLACE FUNCTION public.create_public_booking(
    p_master_id UUID,
    p_client_name TEXT,
    p_client_phone TEXT,
    p_date DATE,
    p_start_time TIME,
    p_end_time TIME,
    p_service_names TEXT,
    p_duration_min INT DEFAULT 60,
    p_client_note TEXT DEFAULT ''
)
RETURNS JSONB AS $$
DECLARE
    v_master public.masters%ROWTYPE;
    v_booking_id UUID;
    v_is_sub_valid BOOLEAN := FALSE;
BEGIN
    -- 1. Валидация мастера
    SELECT * INTO v_master FROM public.masters WHERE id = p_master_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Мастер не найден');
    END IF;

    IF v_master.is_active IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Мастер временно не принимает записи');
    END IF;

    -- 2. Проверка подписки мастера (активна, триал или бессрочная)
    IF v_master.subscription_status IN ('active', 'lifetime') THEN
        v_is_sub_valid := TRUE;
    ELSIF v_master.subscription_status = 'trial' AND (v_master.trial_ends_at IS NULL OR v_master.trial_ends_at >= now()) THEN
        v_is_sub_valid := TRUE;
    ELSIF v_master.subscription_ends_at IS NOT NULL AND v_master.subscription_ends_at >= now() THEN
        v_is_sub_valid := TRUE;
    END IF;

    IF NOT v_is_sub_valid THEN
        RETURN jsonb_build_object('success', false, 'error', 'Онлайн-запись к данному мастеру временно приостановлена');
    END IF;

    -- 3. Проверка наложения слота
    IF EXISTS (
        SELECT 1 FROM public.booking_requests b
        WHERE b.master_id = p_master_id
          AND b.date = p_date
          AND b.status IN ('pending', 'confirmed')
          AND (b.start_time, b.end_time) OVERLAPS (p_start_time, p_end_time)
    ) OR EXISTS (
        SELECT 1 FROM public.master_busy_slots s
        WHERE s.master_id = p_master_id
          AND s.date = p_date
          AND (s.start_time, s.end_time) OVERLAPS (p_start_time, p_end_time)
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Выбранное время уже занято, выберите другой слот');
    END IF;

    -- 4. Создание брони
    INSERT INTO public.booking_requests (
        master_id,
        client_name,
        client_phone,
        date,
        start_time,
        end_time,
        service_names,
        duration_min,
        client_note,
        status
    ) VALUES (
        p_master_id,
        trim(p_client_name),
        trim(p_client_phone),
        p_date,
        p_start_time,
        p_end_time,
        trim(p_service_names),
        COALESCE(p_duration_min, 60),
        COALESCE(trim(p_client_note), ''),
        'pending'
    ) RETURNING id INTO v_booking_id;

    RETURN jsonb_build_object(
        'success', true,
        'booking_id', v_booking_id,
        'message', 'Заявка успешно оформлена'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.create_public_booking(UUID, TEXT, TEXT, DATE, TIME, TIME, TEXT, INT, TEXT) TO anon, authenticated, service_role;


-- ==========================================================
-- 7. ЗАЩИЩЕННЫЕ RPC-ФУНКЦИИ СУПЕРАДМИНИСТРАТОРА
-- ==========================================================

-- А) Получение списка всех мастеров платформы (только для is_admin = true)
CREATE OR REPLACE FUNCTION public.admin_get_all_masters()
RETURNS JSONB AS $$
DECLARE
    v_masters JSONB;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.masters WHERE user_id = auth.uid() AND is_admin = TRUE) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Отказано в доступе: требуются права суперадминистратора');
    END IF;

    SELECT jsonb_agg(to_jsonb(m.*)) INTO v_masters
    FROM (
        SELECT 
            m.id,
            m.user_id,
            m.slug,
            m.name,
            m.salon_name,
            m.phone,
            m.city,
            m.address,
            m.gis_url,
            m.instagram,
            m.work_start_hour,
            m.work_end_hour,
            m.slot_step_min,
            m.is_active,
            m.is_admin,
            m.subscription_status,
            m.subscription_plan,
            m.trial_ends_at,
            m.subscription_ends_at,
            m.subscription_notes,
            m.created_at,
            m.updated_at,
            (SELECT count(*)::int FROM public.master_services s WHERE s.master_id = m.id) AS services_count,
            (SELECT count(*)::int FROM public.booking_requests b WHERE b.master_id = m.id) AS bookings_count
        FROM public.masters m
        ORDER BY m.created_at DESC
    ) m;

    RETURN jsonb_build_object('success', true, 'masters', COALESCE(v_masters, '[]'::jsonb));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE EXECUTE ON FUNCTION public.admin_get_all_masters() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_all_masters() TO authenticated, service_role;


-- Б) Обновление подписки мастера суперадминистратором
CREATE OR REPLACE FUNCTION public.admin_update_subscription(
    p_master_id UUID,
    p_status TEXT,
    p_plan TEXT,
    p_ends_at TIMESTAMPTZ,
    p_notes TEXT DEFAULT ''
)
RETURNS JSONB AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.masters WHERE user_id = auth.uid() AND is_admin = TRUE) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Отказано в доступе: требуются права суперадминистратора');
    END IF;

    UPDATE public.masters
    SET subscription_status = COALESCE(p_status, subscription_status),
        subscription_plan = COALESCE(p_plan, subscription_plan),
        subscription_ends_at = p_ends_at,
        subscription_notes = COALESCE(p_notes, subscription_notes),
        updated_at = timezone('utc'::text, now())
    WHERE id = p_master_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Мастер не найден');
    END IF;

    RETURN jsonb_build_object('success', true, 'master_id', p_master_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE EXECUTE ON FUNCTION public.admin_update_subscription(UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_update_subscription(UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT) TO authenticated, service_role;


-- В) Удаление мастера суперадминистратором
CREATE OR REPLACE FUNCTION public.admin_delete_master(p_master_id UUID)
RETURNS JSONB AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.masters WHERE user_id = auth.uid() AND is_admin = TRUE) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Отказано в доступе: требуются права суперадминистратора');
    END IF;

    DELETE FROM public.masters WHERE id = p_master_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Мастер не найден');
    END IF;

    RETURN jsonb_build_object('success', true, 'deleted_master_id', p_master_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE EXECUTE ON FUNCTION public.admin_delete_master(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_master(UUID) TO authenticated, service_role;
