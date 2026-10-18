-- Her urun / varyant icin direkt alis maliyeti (Ruth + ROSTA).
-- Her markanin KENDI self-host veritabaninda AYRI AYRI uygulanir.
-- Bu migration gecmis siparis maliyet snapshotlarini degistirmez.
-- Urunun dogrudan alis maliyeti varsa onu, yoksa mevcut set/kahve hesabini kullanir.
BEGIN;

CREATE OR REPLACE FUNCTION public.finance_unit_cost(
  p_product uuid,
  p_variant uuid DEFAULT NULL,
  p_at timestamptz DEFAULT now(),
  p_seen uuid[] DEFAULT '{}',
  p_currency text DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  c public.finance_costs;
  p jsonb;
  b jsonb;
  component numeric;
  total numeric := 0;
  base numeric;
BEGIN
  IF p_product = ANY(p_seen) OR cardinality(p_seen) > 10 THEN
    RETURN NULL;
  END IF;

  SELECT * INTO c
  FROM public.finance_costs
  WHERE product_id = p_product
    AND (variant_id = p_variant OR variant_id IS NULL)
    AND effective_at <= p_at
  ORDER BY (variant_id IS NOT NULL) DESC, effective_at DESC, id DESC
  LIMIT 1;

  SELECT to_jsonb(products) INTO p
  FROM public.products
  WHERE id = p_product;

  IF p IS NULL THEN RETURN NULL; END IF;
  IF p_currency IS NULL THEN
    p_currency := COALESCE(p->>'currency', 'TRY');
  END IF;
  IF c.id IS NOT NULL AND c.currency <> p_currency THEN
    RETURN NULL;
  END IF;
  IF c.id IS NULL THEN RETURN NULL; END IF;

  -- Urun, paket/set veya varyant icin dogrudan alis fiyati oncelikli.
  -- Sifir gecerli bir maliyettir; NULL ise otomatik maliyet hesabina donulur.
  IF c.purchase IS NOT NULL THEN
    RETURN c.purchase + COALESCE(c.packaging, 0)
      + COALESCE(c.label, 0) + COALESCE(c.labor, 0)
      + COALESCE(c.other, 0);
  END IF;

  IF COALESCE((p->>'is_bundle')::boolean, false)
     OR p->>'product_type' = 'bundle'
  THEN
    IF jsonb_typeof(p->'bundle_items') IS DISTINCT FROM 'array'
      OR jsonb_array_length(p->'bundle_items') = 0
    THEN RETURN NULL; END IF;
    FOR b IN SELECT value FROM jsonb_array_elements(p->'bundle_items') LOOP
      component := public.finance_unit_cost(
        (b->>'product_id')::uuid,
        NULLIF(b->>'variant_id', '')::uuid,
        p_at, p_seen || p_product, p_currency
      );
      IF component IS NULL THEN RETURN NULL; END IF;
      total := total + component *
        GREATEST(COALESCE((b->>'quantity')::integer, 1), 1);
    END LOOP;
    RETURN total + COALESCE(c.packaging, 0)
      + COALESCE(c.label, 0) + COALESCE(c.labor, 0)
      + COALESCE(c.other, 0);
  END IF;

  IF (SELECT brand FROM public.finance_settings WHERE id = true) = 'rosta' THEN
    IF c.coffee_per_kg IS NULL OR c.grams IS NULL THEN
      RETURN NULL;
    END IF;
    base := c.coffee_per_kg * c.grams / 1000;
  ELSE
    base := NULL;
  END IF;

  IF base IS NULL THEN RETURN NULL; END IF;
  RETURN base + COALESCE(c.packaging, 0)
    + COALESCE(c.label, 0) + COALESCE(c.labor, 0)
    + COALESCE(c.other, 0);
EXCEPTION
  WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RETURN NULL;
END;
$$;

COMMIT;
