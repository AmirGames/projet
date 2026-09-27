-- Le livreur a demandé la suppression de son compte : désactivé aussitôt,
-- effacé seulement après le dernier versement de ses courses.
ALTER TABLE "Driver" ADD COLUMN "suppressionDemandeeLe" TIMESTAMP(3);
