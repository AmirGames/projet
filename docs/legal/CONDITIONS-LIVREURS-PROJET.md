# Conditions Livreurs — propositions de cohérence (brouillon)

Ce document n'est pas un contrat prêt à publier. Faire relire par un avocat belge avant utilisation. La société exploitante n'est pas confirmée; conserver `[Raison sociale]`, `[adresse]`, `[numéro BCE]`, `[numéro TVA]` et `[contact protection des données]` tant qu'ils ne sont pas établis.

La source par défaut se trouve dans `backend/src/contenus/pages-legales.defaut.ts`, entrée `conditions-livreurs`. Avant cette branche, elle mentionnait des notions françaises (micro-entreprise, droit au travail en France, SIREN); le texte local a été remplacé par un brouillon belge prudent. Le service d'inscription conserve les identifiants des documents acceptés, leurs versions en vigueur, l'heure, le compte et les métadonnées de requête dans `AcceptationConditions`. Il faut quand même vérifier le contenu actuellement publié et l'écran réellement montré au livreur : le fichier par défaut peut être remplacé par une version publiée dans la base. Aucun accès à la base de production ni preuve de ce qui est actuellement affiché n'est inclus dans cet audit.

À revoir avant publication :

- Remplacer les références françaises par les catégories belges effectivement applicables sans faire du numéro BCE une preuve suffisante du statut indépendant.
- Décrire l'exigence BCE choisie par ZupEat, le contrôle humain dans le registre officiel, les motifs de refus/correction et les droits sur ce numéro. Vérifier la compatibilité du formulaire France avec cette politique et les numéros d'entreprises étrangers avant toute extension géographique.
- Décrire la proposition, son délai commercial, l'acceptation explicite et la clôture sans pénalité après refus.
- Décrire la pause choisie librement, sans motif personnel ni validation d'absence; les anciennes valeurs `pauseReason` ne sont pas purgées par le seul changement de code.
- Décrire le montant réellement affiché, son caractère estimatif éventuel, les frais, les pourboires et leur traitement financier vérifié.
- Le propriétaire confirme le 22 octobre 2026 que le prix proposé ne sera pas négociable. Décrire clairement le calcul et le montant garanti à l'acceptation, puis faire évaluer ce modèle de tarification au regard du droit social belge; ne pas ajouter de clause laissant croire à une négociation qui n'existe pas.
- Décrire sans ambiguïté que l'ordre des remises d'un lot accepté est actuellement fixé par l'application, puis faire valider la nécessité et la proportionnalité de cette contrainte avant publication.
- Aligner la géolocalisation sur les états et la conservation réels; expliquer les destinataires et droits.
- Distinguer évaluations, incidents vérifiés, contestations et décisions de suspension avec intervention humaine appropriée.
- Distinguer le remboursement du client d'une suspension du livreur : le code ne demande plus la suspension par défaut, mais un opérateur peut toujours la demander explicitement pour un risque sérieux; une procédure de réexamen structurée reste à concevoir.
- Définir les assurances actuellement exigibles et examiner le régime spécial dont l'entrée en vigueur est reportée au 1er janvier 2028.
- Décider si le remplacement est permis. Si oui, préciser qui reste contractuellement responsable, qui accepte la proposition transférée, et comment les identités, autorisations, assurances, rémunérations et données sont vérifiées et séparées.
- Une architecture préparatoire de remplacement nominatif est décrite dans `ARCHITECTURE-REMPLACEMENT-LIVREUR.md`; elle n'est pas une fonctionnalité disponible.

Ne pas utiliser une déclaration contractuelle d'indépendance pour contredire les mécanismes réellement déployés.
