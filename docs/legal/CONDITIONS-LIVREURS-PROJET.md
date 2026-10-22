# Conditions Livreurs — propositions de cohérence (brouillon)

Ce document n'est pas un contrat prêt à publier. Faire relire par un avocat belge avant utilisation. La société exploitante n'est pas confirmée; conserver `[Raison sociale]`, `[adresse]`, `[numéro BCE]`, `[numéro TVA]` et `[contact protection des données]` tant qu'ils ne sont pas établis.

La source par défaut se trouve dans `backend/src/contenus/pages-legales.defaut.ts`, entrée `conditions-livreurs`. Avant cette branche, elle mentionnait des notions françaises (micro-entreprise, droit au travail en France, SIREN); le texte local a été remplacé par un brouillon belge prudent. La version effective peut différer si elle a été éditée en base ou déjà acceptée par des utilisateurs.

À revoir avant publication :

- Remplacer les références françaises par les catégories belges effectivement applicables sans faire du numéro BCE une preuve suffisante du statut indépendant.
- Décrire l'exigence BCE choisie par ZupEat, le contrôle humain dans le registre officiel, les motifs de refus/correction et les droits sur ce numéro. Vérifier la compatibilité du formulaire France avec cette politique et les numéros d'entreprises étrangers avant toute extension géographique.
- Décrire la proposition, son délai commercial, l'acceptation explicite et la clôture sans pénalité après refus.
- Décrire la pause choisie librement, sans motif personnel ni validation d'absence; les anciennes valeurs `pauseReason` ne sont pas purgées par le seul changement de code.
- Décrire le montant réellement affiché, son caractère estimatif éventuel, les frais, les pourboires et leur traitement financier vérifié.
- Décrire sans ambiguïté que l'ordre des remises d'un lot accepté est actuellement fixé par l'application, puis faire valider la nécessité et la proportionnalité de cette contrainte avant publication.
- Aligner la géolocalisation sur les états et la conservation réels; expliquer les destinataires et droits.
- Distinguer évaluations, incidents vérifiés, contestations et décisions de suspension avec intervention humaine appropriée.
- Distinguer le remboursement du client d'une suspension du livreur : le code ne demande plus la suspension par défaut, mais un opérateur peut toujours la demander explicitement pour un risque sérieux; une procédure de réexamen structurée reste à concevoir.
- Définir les assurances actuellement exigibles et examiner le régime spécial dont l'entrée en vigueur est reportée au 1er janvier 2028.
- Décider si le remplacement est permis, avec compte personnel, contrôles d'admissibilité et responsabilités.
- Une architecture préparatoire de remplacement nominatif est décrite dans `ARCHITECTURE-REMPLACEMENT-LIVREUR.md`; elle n'est pas une fonctionnalité disponible.

Ne pas utiliser une déclaration contractuelle d'indépendance pour contredire les mécanismes réellement déployés.
