-- Date du dernier changement de mot de passe : les jetons émis avant ne sont
-- plus acceptés, ce qui déconnecte les autres sessions.
ALTER TABLE "User" ADD COLUMN "passwordChangedAt" TIMESTAMP(3);
