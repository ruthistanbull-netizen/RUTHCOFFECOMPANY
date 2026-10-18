-- Monthly automatic expense on a chosen calendar day.
-- Run separately on Ruth and ROSTA SELF-HOST databases.
-- No historical backfill or changes to already entered finance records.
BEGIN;

-- Save the expense once and create exactly one recurring rule in the same transaction.
CREATE OR REPLACE FUNCTION public.finance_save_monthly_expense(
  p_data jsonb,
  p_actor uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_saved jsonb;
  v_id uuid;
  v_rule_id uuid;
  v_day integer;
  v_base date;
  v_month date;
  v_first date;
  v_end date;
  v_template jsonb;
BEGIN
  IF COALESCE(p_data->>'direction','') <> 'expense' THEN
    RAISE EXCEPTION 'Aylık otomasyon yalnız giderler için oluşturulabilir';
  END IF;
  IF p_data ? 'version' AND NULLIF(p_data->>'version','') IS NOT NULL THEN
    RAISE EXCEPTION 'Düzenleme sırasında yeni otomasyon oluşturulamaz';
  END IF;
  v_day := (p_data->>'monthly_day')::integer;
  IF v_day IS NULL OR v_day < 1 OR v_day > 31 THEN
    RAISE EXCEPTION 'Her ay için 1–31 arasında bir gün seç';
  END IF;

  v_end := NULLIF(p_data->>'monthly_end_on','')::date;

  -- The manual expense is booked now. The next cycle begins NEXT month,
  -- so we never create the same month's expense a second time by surprise.
  v_base := GREATEST(
    (now() at time zone 'Europe/Istanbul')::date,
    COALESCE(NULLIF(p_data->>'occurred_on','')::date,
      (now() at time zone 'Europe/Istanbul')::date)
  );
  v_month := (date_trunc('month',v_base::timestamp) + interval '1 month')::date;
  v_first := v_month + LEAST(
    v_day,
    extract(day from (v_month + interval '1 month' - interval '1 day'))::integer
  ) - 1;

  IF v_end IS NOT NULL AND v_end < v_first THEN
    RAISE EXCEPTION 'Tekrar bitiş tarihi ilk otomatik gider tarihinden önce olamaz';
  END IF;

  v_saved := public.finance_save(
    'entry',
    p_data - 'monthly_day' - 'monthly_end_on' - 'recurrence',
    p_actor
  );
  v_id := (v_saved->>'id')::uuid;
  -- Serialize retries for this one manually created expense.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_id::text, 0));

  SELECT id INTO v_rule_id
  FROM public.finance_recurring
  WHERE template->>'origin_entry_id' = v_id::text
  ORDER BY id
  LIMIT 1;

  IF v_rule_id IS NULL THEN
    v_template := (
      p_data - 'id' - 'version' - 'recurrence'
      - 'monthly_day' - 'monthly_end_on'
    ) || jsonb_build_object(
      'origin_entry_id',v_id::text,
      'monthly_day',v_day
    );

    INSERT INTO public.finance_recurring(
      template,start_on,next_on,end_on,frequency,interval_days,active,created_by
    ) VALUES (
      v_template,v_first,v_first,v_end,'monthly',NULL,true,p_actor
    )
    RETURNING id INTO v_rule_id;
  END IF;

  RETURN v_saved || jsonb_build_object(
    'monthly_rule_id',v_rule_id::text,
    'next_expense_on',v_first::text
  );
END;
$$;

-- Preserve the day originally selected, including months with fewer days:
-- 31 January -> 28 February (29 leap year) -> 31 March.
CREATE OR REPLACE FUNCTION public.finance_run_recurring(
  p_today date DEFAULT (now() at time zone 'Europe/Istanbul')::date
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  r public.finance_recurring;
  d date;
  next_d date;
  next_month date;
  preferred_day integer;
  step_months integer;
  e jsonb;
  n integer := 0;
BEGIN
  FOR r IN
    SELECT * FROM public.finance_recurring
    WHERE active AND next_on <= p_today
    FOR UPDATE SKIP LOCKED
  LOOP
    d := r.next_on;
    WHILE d <= p_today
      AND (r.end_on IS NULL OR d <= r.end_on)
      AND n < 500
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.finance_entries
        WHERE source='recurring'
          AND source_id=r.id::text||':'||d::text
      ) THEN
        e := public.finance_save(
          'entry',
          r.template || jsonb_build_object(
            'occurred_on',d,
            'due_on',d
          ),
          r.created_by
        );
        UPDATE public.finance_entries
        SET source='recurring',
            source_id=r.id::text||':'||d::text
        WHERE id=(e->>'id')::uuid;
      END IF;

      IF r.frequency='weekly' THEN
        next_d := d + 7;
      ELSIF r.frequency='custom' THEN
        next_d := d + r.interval_days;
      ELSE
        step_months := CASE r.frequency
          WHEN 'monthly' THEN 1
          WHEN 'quarterly' THEN 3
          ELSE 12
        END;
        next_month := (
          date_trunc('month',d::timestamp)
          + (step_months * interval '1 month')
        )::date;
        preferred_day := COALESCE(
          NULLIF((r.template->>'monthly_day')::integer,0),
          extract(day from r.start_on)::integer
        );
        next_d := next_month + LEAST(
          preferred_day,
          extract(day from (
            next_month + interval '1 month' - interval '1 day'
          ))::integer
        ) - 1;
      END IF;

      d := next_d;
      n := n + 1;
    END LOOP;

    UPDATE public.finance_recurring
    SET next_on=d,
        active=CASE
          WHEN end_on IS NOT NULL AND d>end_on THEN false
          ELSE active
        END
    WHERE id=r.id;
  END LOOP;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.finance_save_monthly_expense(jsonb,uuid)
FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finance_save_monthly_expense(jsonb,uuid)
TO service_role;
REVOKE ALL ON FUNCTION public.finance_run_recurring(date)
FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finance_run_recurring(date)
TO service_role;

COMMIT;
