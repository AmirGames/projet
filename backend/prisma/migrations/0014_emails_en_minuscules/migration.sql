-- Les adresses e-mail sont désormais ramenées en minuscules à l'entrée de
-- l'API : « TeST@test.com » et « test@test.com » sont la même boîte, mais la
-- base les distinguait. Cette migration convertit les adresses déjà
-- enregistrées.
--
-- Une adresse n'est convertie que si sa forme en minuscules n'appartient à
-- aucune autre ligne : deux comptes « Jean@x.fr » et « jean@x.fr » sont deux
-- personnes (ou une personne avec deux comptes) qu'une migration ne peut pas
-- fusionner à l'aveugle. Ces cas restent tels quels, sont signalés à la fin,
-- et la connexion les retrouve encore sans tenir compte de la casse quand un
-- seul compte répond.

UPDATE "User" u
SET email = lower(trim(u.email))
WHERE u.email <> lower(trim(u.email))
  AND (SELECT COUNT(*) FROM "User" v WHERE lower(trim(v.email)) = lower(trim(u.email))) = 1;

UPDATE "Customer" c
SET email = lower(trim(c.email))
WHERE c.email <> lower(trim(c.email))
  AND (SELECT COUNT(*) FROM "Customer" d WHERE lower(trim(d.email)) = lower(trim(c.email))) = 1;

UPDATE "Driver" c
SET email = lower(trim(c.email))
WHERE c.email <> lower(trim(c.email))
  AND (SELECT COUNT(*) FROM "Driver" d WHERE lower(trim(d.email)) = lower(trim(c.email))) = 1;

-- L'équipe d'une boutique : l'adresse n'est unique qu'au sein de la boutique.
UPDATE "Staff" s
SET email = lower(trim(s.email))
WHERE s.email <> lower(trim(s.email))
  AND (SELECT COUNT(*) FROM "Staff" t
       WHERE t."storeId" = s."storeId" AND lower(trim(t.email)) = lower(trim(s.email))) = 1;

-- L'adresse d'une commande sert à retrouver la fiche du client : sans
-- contrainte d'unicité, elle se convertit toujours.
UPDATE "Order"
SET "customerEmail" = lower(trim("customerEmail"))
WHERE "customerEmail" IS NOT NULL AND "customerEmail" <> lower(trim("customerEmail"));

DO $$
DECLARE
  restants integer;
BEGIN
  SELECT (SELECT COUNT(*) FROM "User" WHERE email <> lower(trim(email)))
       + (SELECT COUNT(*) FROM "Customer" WHERE email <> lower(trim(email)))
       + (SELECT COUNT(*) FROM "Driver" WHERE email <> lower(trim(email)))
       + (SELECT COUNT(*) FROM "Staff" WHERE email <> lower(trim(email)))
    INTO restants;

  IF restants > 0 THEN
    RAISE NOTICE '% adresse(s) laissée(s) avec leur casse : doublons à la casse près, à régler à la main.', restants;
  END IF;
END $$;
