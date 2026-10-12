# Recette pilote ZupEat — A16

**Décision au 12 octobre 2026 — version intégrée :** commit de fusion
[`6439e36a51c6262b4781937c217a4063df6a90db`](https://github.com/AmirGames/projet/commit/6439e36a51c6262b4781937c217a4063df6a90db),
PR [#222](https://github.com/AmirGames/projet/pull/222). La CI de la PR a
passé les 11 jobs au head `3085ff4dc09974fc99d6c7361cff79fbe67dff15`
([run 38287957646](https://github.com/AmirGames/projet/actions/runs/38287957646)).
La CI n'atteste ni le commit actif d'un serveur, ni un appareil, ni une obligation
réglementaire ou une transaction bancaire.

## Périmètre décidé

Le pilote visé couvre **ZupEat en recette fermée** : API, site, comptes et MFA,
catalogue, commande, paiement Stripe TEST avec 3DS, remboursement TEST,
livraison par l'app ZupEat Livreur et contrôle des reversements sans virement.
Les apps Customer, Merchant et Delivery font partie du parcours à éprouver.
L'ouverture publique n'est pas autorisée par cette décision.

**ZupDrive est exclu du pilote.** Sont hors périmètre les espaces, API, apps
Chauffeur et Passager, leurs domaines, règles de transport de personnes,
webhooks A11 et obligations correspondantes. Les comptes et données Drive ne
doivent pas servir de données de recette ZupEat. Cette exclusion doit rester
visible dans le registre de lancement et dans le procès-verbal de recette.

## Décision

**Bloqué pour démarrer le pilote de recette utilisateur.** Le code A16 est
intégré et la CI du head de PR est verte, mais aucune preuve ne relie le SHA
`6439e36a…` à un environnement de recette actif. Les scénarios externes
ci-dessous n'ont pas de résultat observé. Il ne s'agit pas d'un échec de CI ;
la validation est en attente d'accès et d'exécution. Aucun mouvement d'argent
réel, déploiement ou ouverture publique n'est autorisé par ce compte rendu.

## Historique A01–A16

Les PR ci-dessous sont dans l'ascendance du commit intégré indiqué ci-dessus.
« Intégré » ne signifie ni déployé ni validé en exploitation. Les preuves de
tests sont datées et liées à leurs SHA ; elles ne sont pas extrapolées au VPS.

| Étape | Développé / testé et intégré | Déployé / exploitation au 12 octobre |
|---|---|---|
| A01–A02 | Inscription atomique, liens et reprise de session dans PR [#211](https://github.com/AmirGames/projet/pull/211) ; intégrations PostgreSQL incluses dans la CI A16 [11/11](https://github.com/AmirGames/projet/actions/runs/38287957646), job Auth A01/A02/A09. | SHA serveur et exercice de recette non fournis. Email réel, appareil et contrôles d'accès restent à exécuter. |
| A03 | Remboursements durables/idempotents, PR [#202](https://github.com/AmirGames/projet/pull/202), code et tests dans [l'état A03](etat-projet.md#étape-02--a03-remboursements-durables) ; migration historique exercée en CI A16. | VPS, Stripe TEST externe et alerte reçue non prouvés. |
| A04 | Concurrence des lots/relevés, PR [#203](https://github.com/AmirGames/projet/pull/203), CI documentée dans [l'état A04](etat-projet.md#étape-03--a04-concurrence-des-versements) et tests PostgreSQL relancés par la CI A16. | Pas de rapprochement des historiques bancaires ni de virement pilote prouvé. |
| A05 | MFA privilégiée, PR [#204](https://github.com/AmirGames/projet/pull/204), essais et run CI dans [l'état A05](etat-projet.md#étape-04--a05-mfa-des-comptes-privilégiés) ; job MFA A16 réussi. | Enrôlement nominatif, secours et appareils du serveur non attestés. |
| A06 | App chauffeur ZupDrive, PR [#212](https://github.com/AmirGames/projet/pull/212), intégrée ; détails et limites dans [l'état A06](etat-projet.md#étape-08--a06-contrat-de-lapplication-chauffeur-zupdrive). | Hors périmètre par décision ; aucun essai appareil revendiqué. |
| A07 | Facturation structurée, PR [#216](https://github.com/AmirGames/projet/pull/216), intégrée ; UBL et validations distincts dans [le guide](FACTURATION-STRUCTUREE-A07.md). | Transport Access Point, réception et conformité du fournisseur non prouvés ; obligations à confirmer par exploitant/comptable. |
| A08 | Sauvegardes distantes et procédure de restauration, PR [#217](https://github.com/AmirGames/projet/pull/217), intégrée ; contrôles locaux et limites dans [l'état A08](etat-projet.md#étape-11--a08-sauvegardes-distantes-et-restauration). | Copie distante et restauration isolée non attestées pour le serveur ciblé. |
| A09 | Rotation atomique/reprenante, PRs [#209](https://github.com/AmirGames/projet/pull/209) et [#210](https://github.com/AmirGames/projet/pull/210), intégrées ; tests dédiés CI A16 réussis. | Sessions en production et comportement des anciennes sessions à mesurer après déploiement. |
| A10 | Liens de compte à usage unique, PR [#208](https://github.com/AmirGames/projet/pull/208), intégrée ; test PostgreSQL A16 réussi. | Courriel et liens sur domaine réel non exercés dans cette recette. |
| A11 | Webhooks sortants ZupDrive, PR [#215](https://github.com/AmirGames/projet/pull/215), intégrée ; [contrat](WEBHOOKS-ZUPDRIVE-A11.md). | Hors périmètre ; flag désactivé par défaut, aucun endpoint partenaire éprouvé. |
| A12 | Audit/correction dépendances, PRs [#219](https://github.com/AmirGames/projet/pull/219) et [#220](https://github.com/AmirGames/projet/pull/220), intégrées ; 11 jobs du [run 38265964207](https://github.com/AmirGames/projet/actions/runs/38265964207). | Image OCI exécutée et dépendances de l'hôte en exploitation non établies. |
| A13 | Contrats API/parcours, PR [#211](https://github.com/AmirGames/projet/pull/211), intégrée ; [matrice de tests](CONTRATS-API-A13.md) et CI antérieure datée. | Stripe TEST/3DS distant, vrais terminaux et parcours serveur non prouvés. |
| A14 | Santé dépendances, PR [#218](https://github.com/AmirGames/projet/pull/218), intégrée ; tests locaux datés dans [l'état A14](etat-projet.md#étape-12--a14-indicateurs-de-santé-représentatifs). | Coupures isolées et alertes réellement reçues non attestées. |
| A15 | Rapports bornés, PR [#221](https://github.com/AmirGames/projet/pull/221), intégrée ; 130 tests backend ciblés et limites locales dans [l'état A15](etat-projet.md#étape-14--a15-rapports-bornés-et-coûts-de-lecture). | Plans de requête/charge sur copie représentative et cloisonnement en exploitation à éprouver. |
| A16 | Configuration et documentation pilote, PR [#222](https://github.com/AmirGames/projet/pull/222), intégrée au SHA indiqué en tête. CI du head `3085ff4d…` : 11/11 jobs réussis, migrations sur base vide, suites backend, E2E avec Stripe coupé, types/lint/tests/build mobiles concernés. | Pas de déploiement ni validation en exploitation prouvés. Les parcours de recette ci-dessous restent ouverts. |

Les audits d'origine demeurent dans leurs comptes rendus datés. Cette table ne
remplace pas leur portée, leurs résultats détaillés ou leurs limites.

## Faits observés et limites

| Contrôle | Résultat connu | Limite pour le pilote |
|---|---|---|
| CI A16 | Run `38287957646`, head `3085ff4d…`, 11 jobs réussis ; migrations sur PostgreSQL neuf, job A01/A02/A09, paiements contractuels, E2E navigateur, builds backend/frontend et types/lint/suites mobiles sélectionnées. | E2E indique explicitement « Couper Stripe pour les parcours » ; ce n'est pas Stripe TEST/3DS. Les étapes de tests de certaines apps mobiles sont sautées dans ce run ; aucun APK natif n'est bâti par ces jobs. La CI n'a pas accédé au VPS ni à des téléphones physiques. |
| Paiement TEST antérieur | [L'état historique du projet](etat-projet.md#déploiement-et-validations-acquises) note un paiement Stripe TEST sur le VPS le 4 octobre, webhook `payment_intent.succeeded` reçu puis rejoué sans doublon visible. | Aucun SHA/version active ni contrôle SQL des effets lié à cette note ; remboursement sur VPS explicitement restant à vérifier. Ce fait antérieur ne valide pas A16 ni le parcours 3DS. |
| Validation locale A16 | Backend configuration/Stripe/dépendances activées/stockage 10/10 ; TypeScript, lint backend et build réussis ; frontend TypeScript, lint ciblé, assertions CSP Node et liens Markdown réussis. | Résultats consignés avant les derniers commits A16 et non réexécutés ici sur la fusion. Frontend Jest/build bloqués par SWC natif absent dans le relevé local A16. |
| Schéma A16 | Aucune migration A16 attendue ; la CI a appliqué l'ensemble des migrations sur une base vide. | Une base vide ne prouve pas la mise à niveau ni la compatibilité avec les données/sessions existantes. |
| Environnement et commit actif | Aucun SHA de recette ou de production obtenu. | Ne pas assimiler la branche Git, le run CI et l'image réellement démarrée. |
| Appareils/pages/facturation | Aucun relevé de builds publiés, versions Android/iOS, pages légales actives ou factures opérateur fourni. | Pages officielles, consentements, mentions, stores et appareils restent à inspecter. |
| Sauvegarde/alertes | Les procédures A08/A14 existent. | Aucun manifeste distant, restauration d'exercice isolée ni alerte reçue pour le serveur n'est joint. |

## Blocages, responsables et prochain contrôle

Les noms sont **à confirmer par l'exploitant** ; aucune personne n'est assignée
par ce document.

| Blocage / preuve manquante | Responsable à confirmer | Prochain contrôle concret |
|---|---|---|
| Aucun accès à une recette représentative, au manifeste de déploiement, aux logs, au SHA actif `/version` ni au résultat `/health/ready`. | Exploitant / responsable déploiement | Fournir URL/auth de recette et fenêtre de contrôle ; comparer les SHA frontend/API au commit exact avant toute session. |
| Aucun clone PostgreSQL représentatif, rôle SQL observé, ancienneté des sessions, état des jobs ou interdictions inter-organisations vérifiés. | DBA + responsable backend | Créer/assainir un clone isolé ; appliquer migration; relever rôle via `npm run db:role`, migrations, sessions, jobs et tests IDOR sans données réelles. |
| Inscription, MFA, commande complète, remboursement et livraison non traversés de bout en bout en recette. | QA + responsables produit/ops | Exécuter la matrice ci-dessous avec comptes et données synthétiques, collecter traces API/DB et preuve d'interface. |
| Stripe TEST/3DS externe non exécuté, remboursement TEST et rapprochement des reversements absents. | Finance + responsable paiement | Fournir clés TEST, endpoint webhook public de staging, moyen 3DS, Stripe CLI et identifiant de relevé simulé ; suivre la procédure A13 sans basculer LIVE. |
| Appareils, versions d'apps, pages publiées, facture, backup/restauration et alertes serveur non vérifiés. | QA mobile + juridique/comptable + exploitation | Inventorier chaque binaire/domaine/page ; joindre manifeste distant, rapport de restauration et accusés d'alertes ; responsable conformité valide le contenu juridique. |

**Reprise de décision :** après collecte, inscrire date, environnement, SHA CI,
SHA API/site réellement servis, données synthétiques, scénarios et liens de
preuve. Tout scénario bloquant en échec garde la décision bloquée. Une réussite
de CI seule ne la fait pas passer à « prêt ».

## Procédure opérateur — copie représentative, migrations et retour arrière

1. Préparer une base PostgreSQL isolée à partir d'une copie expurgée conforme
   aux règles de confidentialité ; réseau et secrets séparés, Stripe en mode
   TEST uniquement. Conserver identifiant de snapshot, date et empreinte sans
   exporter de données client dans le ticket.
2. Sur le SHA candidat, exécuter `npm ci`, `npm run prisma:generate`, les tests
   métier A01/A02, A03, A04, A05 et A13 documentés, puis
   `npx prisma migrate status` avec l'URL de cette base. Pour le déploiement,
   faire appliquer les migrations une seule fois avec `DATABASE_URL_MIGRATION`;
   garder `DATABASE_URL_APP` séparée et exécuter ensuite `npm run db:role`.
   Vérifier droits, rôle réellement connecté, migration avant/après et absence
   d'altération des lignes métier critiques.
3. Capturer état initial, révision d'image, statut des sessions et files/jobs.
   Après migration, relire les sessions historiques, rejouer un job de test
   interrompu et vérifier l'idempotence. Aucun rollback SQL destructif ou
   `migrate reset` n'est permis sur cette copie représentative.
4. Préparer la version précédente et un backup distant vérifié. Pour A16, pas
   de migration dédiée : le retour applicatif vers l'image précédente est
   possible après vérification des versions de schéma. Si une migration
   ultérieure n'est pas rétrocompatible, arrêter le retour applicatif et suivre
   une restauration isolée approuvée ; ne pas modifier une migration déjà
   appliquée ni restaurer par-dessus la production.
5. Après déploiement de recette, consigner `./deploy/zup.sh version`,
   `./deploy/zup.sh ps`, `/health`, `/health/ready`, logs du service `migrate`,
   et compare SHA aux deux conteneurs. Toute différence, readiness 503 ou job
   durable bloqué arrête la recette. Le manifeste `docker-compose.prod.yml`
   n'est pas présent dans cet instantané versionné : vérifier son wiring des
   deux rôles, des volumes privés et des images avant d'agir.

## Matrice de recette — aucun résultat encore déclaré

Enregistrer pour chaque ligne le **SHA exact**, date/heure Europe/Brussels,
environnement, build/appareil, identifiants synthétiques, résultat attendu et
observé, trace corrélée et opérateur. À ce jour, toutes les lignes sont en
attente faute d'accès à une instance de recette dans cette étape.

| Scénario | Contrôle obligatoire | Résultat actuel |
|---|---|---|
| Inscription + email A01/A02 | Inscription et confirmation; double requête et reprise; aucun compte privilégié; rattachement cohérent. | En attente — CI PostgreSQL seulement. |
| MFA A05 | Enrôlement TOTP admin, session fraîche, refus sans preuve, récupération à usage unique et audit. | En attente — job CI isolé seulement. |
| Cloisonnement | Deux organisations/commerces synthétiques : varier IDs de commande, store, fichiers, rapports et exports; vérifier 403/404 et absence de fuite/effet. | En attente — tests existants ne remplacent pas le parcours de la build déployée. |
| Commande complète | Catalogue → panier → commande, frais/taxes/total côté serveur, commerçant → acceptation → préparation → livreur → remise/preuve → statut final; invités et compte. | En attente — E2E CI avec Stripe coupé. |
| Paiement Stripe TEST/3DS | Paiement test sans 3DS et avec action 3DS; `requires_action` ne confirme pas; webhook signé, doublon/hors ordre et état relu. | En attente — aucun Stripe TEST externe. |
| Remboursement TEST A03 | Refus/abandon puis paiement tardif; état durable; reprise idempotente; remboursement testé et webhook/DB rapprochés. | En attente — simulations/CI seulement. |
| Livraison ZupEat | App réelle, permissions GPS, attribution, transitions, push, photo/code de remise, hors-ligne puis reprise; vérifier API/DB. | En attente — aucun appareil ciblé dans cette recette. |
| Reversements A04 | Relever commandes et frais, générer relevé simulé, confirmer une seule fois, rejouer/concurrencer; comparer centimes/transactions et rapport de rapprochement. | En attente — tests PostgreSQL CI, aucun virement. |
| Sessions/jobs/migrations | Session antérieure au déploiement, refresh/perte de réponse/révocation; migration sur snapshot; job arrêté puis repris une fois. | En attente — CI base vide et tests ciblés seulement. |
| CSP/3DS | Revue des rapports `report-only`, checkout test en 3DS, passage `enforce`, répétition, retour `report-only` documenté si régression. | En attente — assertions CSP locales seulement. |
| Pages, facturation, backup et alertes | Vérifier domaines/versions publiées, preuve de facture réelle de test, backup distant et checksum, restauration sur base isolée, réception d'alertes injectées. | En attente — aucune preuve d'exploitation. |

## Préparer LIVE / banque comme opérations distinctes

Ne jamais réutiliser les clés TEST pour LIVE ou faire basculer un flux de recette.
Après décision séparée, un opérateur autorisé documente avant l'action : compte
Stripe et mode, montant/devise, commerce et commande synthétiques autorisés,
frais attendus, endpoint et événements webhook, 3DS éventuel, plafond,
approbateur, fenêtre et procédure d'annulation/remboursement. Après l'opération,
rapprocher identifiants Stripe, commande, événements, transaction financière,
relevé bancaire et comptabilité, sans supprimer d'écriture. Pour un virement,
documenter bénéficiaire, montant/devise, lot, référence SEPA et double contrôle.
Ces paramètres sont actuellement **à fournir et confirmer** ; aucun mouvement
LIVE ou bancaire n'a été déclenché.
