-- Migration : TVA par ligne de commande + numérotation séquentielle des factures
-- À appliquer avec : npx prisma migrate deploy
-- Ou manuellement avec psql si vous préférez

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. TVA figée sur chaque ligne de commande
--
-- Jusqu'ici la commande gardait un seul taxRate — celui du produit dont le
-- montant était le plus élevé. Une pizza à 6 % et une bière à 21 % dans la
-- même commande produisaient un ticket avec un seul taux, toujours le mauvais
-- pour l'une des deux. La taxe sur la commande (taxAmount) était juste parce
-- que le calcul est par ligne, mais le justificatif ne pouvait pas le montrer.
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE "OrderItem"
  ADD COLUMN IF NOT EXISTS "taxRate"   DECIMAL(5,2)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "taxAmount" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. Compteur de numéros de facture
--
-- INV-abc12345 n'est pas une numérotation comptable : elle n'est ni
-- séquentielle ni sans trou — deux factures générées en même temps peuvent
-- prendre le même numéro avec count()+1, et une commande annulée laisse un
-- trou. Ce compteur, incrémenté dans la même transaction que la création de
-- la facture, garantit les deux propriétés.
--
-- Structure : une ligne par (storeId, année, série).
-- Ça permet d'avoir des séquences séparées par boutique et de recommencer
-- à 1 chaque janvier sans changer la table.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "InvoiceSeq" (
  "id"      TEXT      NOT NULL DEFAULT gen_random_uuid()::text,
  "storeId" TEXT      NOT NULL,
  "year"    INTEGER   NOT NULL,
  "serie"   TEXT      NOT NULL DEFAULT 'FAC',
  "last"    INTEGER   NOT NULL DEFAULT 0,

  CONSTRAINT "InvoiceSeq_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InvoiceSeq_store_year_serie_key" UNIQUE ("storeId", "year", "serie"),
  CONSTRAINT "InvoiceSeq_store_fkey" FOREIGN KEY ("storeId")
    REFERENCES "Store"("id") ON DELETE CASCADE
);

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. Table des factures émises
--
-- Une facture ne se réécrit pas : si une erreur est découverte après
-- émission, on émet une note de crédit, on ne touche pas à la facture.
-- Stocker la facture figée en base plutôt que de la regénérer à chaque
-- ouverture, c'est cette garantie.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "Invoice" (
  "id"            TEXT          NOT NULL DEFAULT gen_random_uuid()::text,
  "number"        TEXT          NOT NULL,  -- FAC-2026-00042
  "storeId"       TEXT          NOT NULL,
  "orderId"       TEXT          NOT NULL,
  "issuedAt"      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  -- Snapshot de l'émetteur au moment de l'émission.
  -- Si le commerçant change de raison sociale ou de numéro de TVA après
  -- coup, les factures déjà émises n'en sont pas affectées.
  "emetteurJson"  JSONB         NOT NULL DEFAULT '{}',
  -- Snapshot du destinataire.
  "destinataireJson" JSONB      NOT NULL DEFAULT '{}',
  -- Lignes et totaux figés.
  "lignesJson"    JSONB         NOT NULL DEFAULT '[]',
  "subtotal"      DECIMAL(10,2) NOT NULL DEFAULT 0,
  "taxJson"       JSONB         NOT NULL DEFAULT '[]',  -- [{ taux, base, taxe }]
  "taxTotal"      DECIMAL(10,2) NOT NULL DEFAULT 0,
  "fees"          DECIMAL(10,2) NOT NULL DEFAULT 0,
  "discount"      DECIMAL(10,2) NOT NULL DEFAULT 0,
  "total"         DECIMAL(10,2) NOT NULL DEFAULT 0,

  CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Invoice_number_store_key" UNIQUE ("number", "storeId"),
  CONSTRAINT "Invoice_order_fkey"  FOREIGN KEY ("orderId")  REFERENCES "Order"("id")  ON DELETE RESTRICT,
  CONSTRAINT "Invoice_store_fkey"  FOREIGN KEY ("storeId")  REFERENCES "Store"("id")  ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS "Invoice_storeId_idx"  ON "Invoice"("storeId");
CREATE INDEX IF NOT EXISTS "Invoice_orderId_idx"  ON "Invoice"("orderId");
CREATE INDEX IF NOT EXISTS "Invoice_issuedAt_idx" ON "Invoice"("issuedAt");
