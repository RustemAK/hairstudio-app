-- ==========================================================
-- HairStudio - Миграция для системы подписок и супер-админа
-- Выполните этот SQL-скрипт в Supabase SQL Editor
-- ==========================================================

-- 1. Добавляем поля подписки и флага администратора в таблицу masters
ALTER TABLE public.masters 
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'trial',
  ADD COLUMN IF NOT EXISTS subscription_plan TEXT DEFAULT 'trial',
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ DEFAULT (timezone('utc'::text, now()) + interval '14 days'),
  ADD COLUMN IF NOT EXISTS subscription_ends_at TIMESTAMPTZ DEFAULT (timezone('utc'::text, now()) + interval '14 days'),
  ADD COLUMN IF NOT EXISTS subscription_notes TEXT DEFAULT '';

-- 2. Назначаем мастера Рустем администратором платформы
UPDATE public.masters 
SET is_admin = TRUE,
    subscription_status = 'lifetime',
    subscription_plan = 'lifetime',
    subscription_ends_at = timezone('utc'::text, now()) + interval '100 years'
WHERE slug = 'rustem';

-- Также обновим существующего демо-мастера на trial
UPDATE public.masters 
SET subscription_status = 'lifetime',
    subscription_plan = 'lifetime',
    subscription_ends_at = timezone('utc'::text, now()) + interval '100 years'
WHERE slug = 'demo';

-- 3. Создаем таблицу для учета оплат (Kaspi переводы, QR, наличные)
CREATE TABLE IF NOT EXISTS public.subscription_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    master_id UUID NOT NULL REFERENCES public.masters(id) ON DELETE CASCADE,
    amount INT NOT NULL,                  -- сумма в тенге (например: 2990)
    period_months INT NOT NULL DEFAULT 1, -- количество месяцев
    payment_method TEXT DEFAULT 'kaspi',  -- 'kaspi', 'transfer', 'qr', 'cash'
    status TEXT DEFAULT 'confirmed',      -- 'confirmed', 'pending', 'cancelled'
    confirmed_by TEXT DEFAULT 'admin',    -- кто подтвердил
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_payments_master_id ON public.subscription_payments(master_id);

-- 4. Включаем RLS для платежей
ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;

-- Удаляем старые политики для пересоздания
DROP POLICY IF EXISTS "Public can view active masters" ON public.masters;
DROP POLICY IF EXISTS "Allow master to update own profile" ON public.masters;
DROP POLICY IF EXISTS "Admin can manage all masters" ON public.masters;
DROP POLICY IF EXISTS "Admin can view all payments" ON public.subscription_payments;
DROP POLICY IF EXISTS "Admin can manage payments" ON public.subscription_payments;

-- Публичный просмотр профилей (включая статус подписки для book.html)
CREATE POLICY "Public can view active masters"
    ON public.masters FOR SELECT
    USING (true);

-- Мастер обновляет свой профиль, а Админ может обновлять любые профили
CREATE POLICY "Allow master or admin to update profile"
    ON public.masters FOR UPDATE
    USING (
        auth.uid() = user_id OR 
        EXISTS (SELECT 1 FROM public.masters m WHERE m.user_id = auth.uid() AND m.is_admin = TRUE)
    )
    WITH CHECK (
        auth.uid() = user_id OR 
        EXISTS (SELECT 1 FROM public.masters m WHERE m.user_id = auth.uid() AND m.is_admin = TRUE)
    );

-- Политики для таблицы платежей (только администратор управляет платежами)
CREATE POLICY "Allow admin to manage payments"
    ON public.subscription_payments FOR ALL
    USING (
        EXISTS (SELECT 1 FROM public.masters m WHERE m.user_id = auth.uid() AND m.is_admin = TRUE)
    )
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.masters m WHERE m.user_id = auth.uid() AND m.is_admin = TRUE)
    );

-- 5. RPC Функция для быстрого продления подписки администратором
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
    -- Находим мастера
    SELECT * INTO v_master FROM public.masters WHERE id = p_master_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Мастер не найден');
    END IF;

    -- Базовая дата продления: если подписка еще действует, продлеваем от нее, иначе от текущего момента
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

    -- Обновляем статус мастера
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

    -- Записываем факт оплаты если сумма указана
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
