# Signalements de commandes et recette locale

## Parcours livré

Les suivis web invité `/track` et connecté `/client/orders/:id` proposent un
signalement pour article manquant, mauvaise commande, retard ou autre problème.
Le client peut demander un examen pour remboursement, sans montant libre ni
remboursement automatique. La réclamation existante après dépôt photo reste
séparée et conserve son traitement spécifique des preuves et versements livreur.

Le propriétaire ou le détenteur du jeton de suivi lit/dépose via
`GET/POST /api/orders/:id/incidents`. Les commerçants, livreurs et membres du
support n'utilisent pas cette route client. Ils ne peuvent pas réclamer à sa
place. Les articles et leurs quantités sont vérifiés sur la commande ; les noms
enregistrés viennent du serveur. Les champs inconnus sont refusés.

La première version permet un dossier par motif et par commande, pendant sept
jours depuis la création de la commande (constante du service, pas une durée
de conservation). Articles manquants et mauvaise commande nécessitent une
commande remise/terminée. Le retard est disponible après quinze minutes pour
une commande encore en cours. Une commande non soumise ou refusée n'ouvre pas
de nouveau dossier. Un doublon rend le dossier initial, même après expiration
du délai, sans remplacer le message initial. Le client peut consulter les
réponses et les dossiers existants tant que sa commande lui est accessible.

Le support dispose de la page
`/superowner/zupeat/support-tickets/incidents-commandes`, accessible depuis la
liste des tickets. La lecture et la réponse utilisent les permissions existantes
`support-tickets`. Une réponse résout ou refuse le dossier et est journalisée
dans la même transaction. Une réponse concurrente ne peut pas écraser une
décision déjà publiée. Le client relit ses dossiers ouverts toutes les vingt
secondes ; la file du support se relit toutes les trente secondes.

Répondre ne modifie pas les paiements. Un remboursement éventuel reste à traiter
dans les outils de facturation existants, avec leurs propres permissions et
contrôles. Aucun e-mail, SMS, remboursement ou paiement réel n'est exécuté par
ce changement.

## Données et installation

La migration `20261103140000_order_issues` ajoute `OrderIssue`, ses catégories,
statuts, la contrainte unique commande/motif et un index de traitement. Elle
vient après `20261103120000_kitchen_preparation` et doit être appliquée avant
le lancement du nouveau backend. Aucune migration de production n'a été faite.

Les messages et réponses suivent le chiffrement applicatif existant. Les
dossiers sont inclus dans l'export du client et effacés avec ses commandes,
sous réserve des gels légaux sur la commande. L'effacement différé les supprime
à la levée du gel. Les dossiers traités suivent la rétention de support
existante de 730 jours. Une suppression physique de commande les supprime
aussi en cascade ; les commandes supprimées ne figurent pas dans la file du
support. L'inventaire des champs classe ce modèle dans le support.

## Vérifications et limites

Les contrôles locaux couvrent les règles de signalement, lignes et quantités,
doublons, réponses concurrentes, chiffrement/export/effacement, affichage client
et réponse du support, puis les régressions des changements précédents
(préparation/rush, attribution, estimation d'arrivée, découverte et traductions).
TypeScript et lint sont contrôlés sur les deux projets ; le serveur est compilé
avec esbuild.

Les deux migrations ont été exécutées sur un PostgreSQL embarqué de test
(PGlite, tables initiales minimales). L'unicité des dossiers et la suppression
en cascade ont été vérifiées. Ce contrôle ne prouve pas la migration d'une
base représentative. Le client Prisma est généré avec les générateurs officiels
7.10.0, sans téléchargement natif, depuis un outillage temporaire.

Les tests web utilisent un transformateur TypeScript temporaire ; le build
Next reste à valider dans un environnement où SWC se charge correctement.
La relance finale des tests HTTP avec serveur local a été interrompue : les
nouveaux scénarios HTTP ajoutés au suivi doivent encore être exécutés dans la
recette serveur/CI. Les tests de services et d'interface sont distincts de
cette vérification. Aucun essai Stripe distant, commande de production,
téléphone physique ou déploiement n'est attesté.
