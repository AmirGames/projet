-- Les boutiques créées par l'inscription commerçant ou « Devenir commerçant »
-- rangeaient leur genre dans settings (« Restaurant », « RESTAURANT »,
-- « FastFood »…) au lieu du champ "businessType" que lit la recherche.
-- On le recopie, traduit comme le fait normaliserGenre, puis on le retire des
-- réglages. Une valeur inconnue est laissée telle quelle dans settings.

WITH lus AS (
  SELECT
    id,
    lower(regexp_replace(settings->>'businessType', '[[:space:]_-]+', '', 'g')) AS brut
  FROM "Store"
  WHERE "businessType" IS NULL
    AND jsonb_typeof(settings::jsonb -> 'businessType') = 'string'
),
traduits AS (
  SELECT
    id,
    CASE brut
      WHEN 'restaurant' THEN 'restaurant'
      WHEN 'fastfood' THEN 'restaurant'
      WHEN 'cafe' THEN 'restaurant'
      WHEN 'bakery' THEN 'restaurant'
      WHEN 'grocery' THEN 'grocery'
      WHEN 'supermarket' THEN 'supermarket'
      WHEN 'deli' THEN 'deli'
      WHEN 'liquor' THEN 'liquor'
      WHEN 'florist' THEN 'florist'
      WHEN 'pharmacy' THEN 'pharmacy'
      WHEN 'shop' THEN 'shop'
      WHEN 'other' THEN 'shop'
    END AS genre,
    CASE brut
      WHEN 'cafe' THEN 'coffee-tea'
      WHEN 'bakery' THEN 'bakery-pastry'
    END AS cuisine
  FROM lus
)
UPDATE "Store" s
SET
  "businessType" = t.genre,
  "cuisineType" = COALESCE(s."cuisineType", t.cuisine),
  settings = s.settings::jsonb - 'businessType'
FROM traduits t
WHERE s.id = t.id AND t.genre IS NOT NULL;
