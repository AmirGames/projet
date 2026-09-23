-- Un avis sur le commerce lui-même ne porte sur aucun plat
ALTER TABLE "Review" ALTER COLUMN "productId" DROP NOT NULL;
