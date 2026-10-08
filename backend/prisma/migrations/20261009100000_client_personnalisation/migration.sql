-- Opposition du client à la personnalisation (suggestions fondées sur ses commandes).
ALTER TABLE "Customer" ADD COLUMN "personnalisationDesactivee" BOOLEAN NOT NULL DEFAULT false;
