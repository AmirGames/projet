# ZupDrive — périmètre du MVP

**Base produit retenue.** Pilote fermé dans la commune de Namur, sans date de lancement
annoncée. ZupDrive reste distinct du pilote ZupEat A16. Références :
[état du projet](etat-projet.md), [parcours chauffeur](zupdrive.md),
[app passager](../mobile/apps/zupdrive-passenger/CLAUDE.md) et
[app chauffeur](../mobile/apps/zupdrive-driver/README.md).

## Objectif

Permettre à un passager et à un chauffeur autorisé de réaliser une course de
bout en bout : prix annoncé avant commande, attribution, suivi, paiement et
gestion des incidents essentiels. Le service reste fermé tant que les
validations externes ne sont pas acquises.

## État de préparation — 3 novembre 2026

Le dépôt contient déjà l'essentiel des parcours web/API et les apps passager et
chauffeur : inscription, examen des pièces, devis signé, course, suivi,
paiement par carte, annulations, administration et SOS. La recette web de course
a passé 27/27 contrôles en local; ce relevé ne vaut pas validation réglementaire
ni mise en service.

Les pages légales ZupDrive ont maintenant leurs propres versions, routes,
sommaire et contact; les pages ZupEat ne peuvent plus s'afficher sur les domaines
ZupDrive. Les passagers acceptent CGU, CGV et confidentialité au trajet; les
chauffeurs et sociétés taxi acceptent leurs conditions lors de l'ouverture du
dossier. La date et les versions acceptées sont conservées. En production,
l'inscription et les dossiers restent fermés tant que les documents ZupDrive
ne sont pas publiés. Les textes présents sont des brouillons, pas des contrats
validés.

La recette navigateur du portail société taxi passe également 38/38 contrôles
en local : dossier et justificatifs, validation, véhicule, invitation du
chauffeur, affectation, confidentialité des pièces et retrait. Aucun message
d'erreur console n'a été relevé. Ces recettes locales ne remplacent pas la
validation externe ni les essais sur appareil.

Le rapport ZAP 2.17 du 1er novembre sur `https://zupdrive.com` compte 0 alerte
haute, 4 moyennes, 3 faibles et 6 informatives. Il signale notamment une CSP
active incomplète (le nonce complet n'était qu'en `report-only`) et l'absence
de trois en-têtes cross-origin. Le code local donne à `CSP_MODE_ZUPDRIVE` le
défaut `enforce` pour les deux domaines ZupDrive; le `CSP_MODE` partagé des
autres marques reste inchangé. En enforce, une seule CSP complète est servie;
`form-action` est vérifié et COOP/CORP sont ajoutés. COEP reste
absent car `require-corp` peut bloquer les ressources tierces sans accord
CORS/CORP ([documentation MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Embedder-Policy)).
La recette locale sur le build de production, avec `CSP_MODE=enforce` et
`REQUIRE_CSP_ENFORCE=1`, passe **130/130** : 11 pages, nonces distincts,
aucune CSP partielle concurrente, aucune violation de navigateur et blocage
d'une injection. Le test couvre aussi `/zupdrive`, `/trajet` et `/societe`.
Une requête HTTP locale avec `Host: zupdrive.com`, le mode partagé en
`report-only` et le mode ZupDrive en `enforce` reçoit bien une CSP complète
appliquée, sans en-tête report-only concurrent.
En revanche, le mode `report-only` ne nonce pas les scripts runtime Next : le
contrôle Chrome générique a 22 échecs et la réponse HTML testée avec le vrai
`Host: zupdrive.com` contient 19 scripts sans nonce. Le mode report-only
ZupDrive ne peut donc pas servir à mesurer proprement les violations avant
enforce; garder ZupDrive en `enforce` et utiliser la recette stricte ainsi qu'un
scan de préproduction. Une recette report-only fiable reste à corriger.
Le paiement 3DS réel n'est pas simulé; le style inline reste autorisé pour
React/Leaflet et devra être explicitement trié dans le prochain rapport ZAP.
Ce rapport est une
photo antérieure aux correctifs, issue d'un spider GET passif d'une minute,
sans authentification ni scan actif; il ne valide ni le code actuel ni les
parcours par rôle. Refaire le scan sur l'environnement de préproduction et
tester notamment Stripe/3DS avant de considérer cette vérification close
([rapport présent dans le dépôt](../zap-report-zupdrive.html)).

- Le serveur refuse les devis et les commandes dont le code postal ou les
  coordonnées de départ/arrivée sont hors commune. La géométrie communale
  officielle est incluse dans le backend et vérifiée côté serveur. Les
  suggestions belges du géocodeur sont signées par le backend pendant 30 min;
  le devis ne lit que les champs contenus dans la preuve, jamais des coordonnées
  modifiables envoyées séparément par l'app. Les favoris ne sont utilisables
  qu'après enregistrement de cette preuve. Les favoris hérités sans preuve
  devront être re-sélectionnés avant utilisation.
- L'approbation des titres officiels `licence`, `certificat_capacite` et
  `certificat_acces_profession` exige une attestation de vérification humaine,
  conservée dans la note d'examen / l'audit. En Wallonie, les deux certificats
  font partie des pièces requises; le certificat de capacité et la licence
  doivent porter une date d'expiration.
- L'alerte SOS affiche les numéros belges 101 (police) et 112 (ambulance et
  pompiers), et les messages à la personne de confiance donnent les mêmes
  consignes. La police fédérale recommande le 101 pour une urgence policière
  afin d'éviter le transfert depuis le 112
  ([numéros d'urgence de la Police Fédérale](https://www.police.be/5998/fr/contact/numeros-durgence),
  [numéro 112](https://112.be/fr/how-call/comment-appeler-le-112)).
  Le 2 novembre 2026, ce parcours a été corrigé et vérifié : test SOS backend
  11/11, tests passager 21/21, lint et typecheck de l'application.
- Le verrou d'agrément d'intermédiation électronique wallon est désactivé par
  défaut en production. Les devis wallons et l'activation d'un tarif wallon
  restent bloqués jusqu'à confirmation et configuration explicite de cet
  agrément. En production, confirmer l'agrément exige aussi sa référence SPW et
  sa date d'expiration; une date invalide ou expirée est refusée. Le test de
  préparation pilote vérifie l'absence de confirmation, de référence ou de
  validité documentée.
- Le paiement reste désactivé par défaut. En production, les devis wallons
  refusent également de s'ouvrir tant que Stripe n'est pas actif et que le
  paiement n'est pas obligatoire; la configuration refuse cette combinaison
  incohérente et rejette les clés d'exemple. Le `.env.test` actuel utilise des
  valeurs de démonstration; Stripe TEST n'a donc pas encore été essayé avec un
  vrai compte sur l'environnement cible.
- En production, un devis exige un itinéraire OSRM réel. Le serveur renvoie une
  indisponibilité sans calculer de distance approximative si OSRM manque,
  répond en erreur ou dépasse le délai de 3 secondes. Le modèle de production
  configure une instance OSRM privée; le mode estimation reste pour le
  développement et les démonstrations.
- Catégories choisies : Standard (1–4 passagers) et XL (5–6). Le matching
  respecte la classe et la capacité; pour Namur, les deux catégories suivent
  le même barème communal verrouillé. La classe XL doit être activée par l'équipe
  quand une offre de véhicules suffisante sera autorisée.
- La commission globale par défaut est de 20 %, mais doit être validée avant
  paiement réel. L'assistance surveillée et les horaires restent à définir.
- Vérifications locales : les 76 migrations Prisma sont appliquées à la base
  de test `privacy_test`. Le 2 novembre, les 46 suites ZupDrive passent
  (605 tests) avec `--detectOpenHandles` et sans handle ouvert signalé, dont
  les intégrations PostgreSQL course, chauffeur et société;
  les 12 tests de configuration passent également. Backend et frontend passent
  TypeScript; le build et le lint backend, le lint frontend ciblé et le
  lint/typecheck des deux apps mobiles passent. Les tests mobiles passent
  (70 au total : 21 passager, 49 chauffeur). Avec la suite de recherche
  d'adresses signées et les tests d'environnement, la validation backend
  ciblée passe 48/48 suites et 619/619 tests.
  Les deux apps Expo ont été exportées vers web, iOS et Android; l'app passager
  a été ré-exportée après le changement d'adresse. Le cache SWC
  Windows par défaut reste bloqué par les ACL de la session, mais un cache
  dédié aux permissions restreintes a permis au build de production Next de
  réussir le 2 novembre (108 routes générées) et au test Jest du portail de
  passer (2/2). SWC documente son cache natif et le problème de permissions
  Windows
  ([guide cache](https://github.com/swc-project/swc/blob/main/docs/native-addon-carriers.md),
  [incident Windows](https://github.com/swc-project/swc/issues/12527)). La
  compilation native signée et les courses réelles sur appareil restent à
  exécuter.
- Le 2 novembre, le parcours web Chrome passager/chauffeur/administration a
  passé 27/27 contrôles sur une base PostgreSQL locale jetable : tarif Standard,
  commande Namur–Jambes, attribution, suivi, fin de course, notes et liste admin,
  sans erreur console. La carte et ses repères ont fonctionné, avec des tuiles
  blanches et une position GPS simulées. Les deux champs d'adresse ont effectué
  une vraie recherche dans l'interface, puis sélectionné des suggestions
  signées par l'API. Le paiement Stripe/3DS et les appareils ne faisaient pas
  partie de ce scénario; la base a été supprimée après la recette.
- Depuis ces vérifications, le portail gestionnaire société `/societe` a été
  ajouté le 2 novembre. L'inscription et la connexion depuis ce portail
  reprennent le parcours société après authentification. Son typecheck et son
  lint ciblé passent; son test Jest passe 2/2 avec le cache SWC dédié.
- Revue des sources officielles SPW/WALLEX et renforcement de l'examen des
  titres le 2 novembre : l'équipe doit enregistrer une référence de consultation
  pour chaque titre officiel; licence et certificat de capacité doivent aussi
  confirmer la commune de Namur, et une licence doit consigner taxi de rue ou
  taxi de station. Les échéances de date civile restent valides jusqu'à la fin
  du jour à Bruxelles; le formulaire du chauffeur décrit la revalidation
  annuelle. Le TypeScript backend/frontend et le lint ciblé passent; la suite
  ZupDrive passe maintenant 46/46 suites et 605/605 tests. Avec la suite
  d'adresse signée et celle de configuration d'environnement, la validation
  combinée passe 48/48 suites et 619/619 tests. La configuration Jest utilise maintenant l'option
  ts-jest supportée. Aucune consultation de registre n'est automatisée.
- Le 3 novembre, la revue du règlement communal taxi de Namur adopté le
  18 mars 2025 après modifications demandées par le SPW. Tout véhicule doit
  être identifié par la police avant mise en service et porter les plaques
  communales prévues. L'espace véhicule demande désormais l'attestation
  d'identification et les photos de la plaque avant et de son rappel intérieur.
  L'indépendant dépose cette preuve dans son dossier; une société la dépose
  pour chaque véhicule. L'entrée en vigueur dépend de la publication (art. 13);
  sa date doit être confirmée auprès de la Ville avant ouverture.

## Inclus dans le MVP proposé

- Compte ZupOne et connexion dans les apps passager et chauffeur.
- Portail société taxi sur `/societe` : dossier et pièces de l'exploitant,
  véhicules avec licences, invitations/affectations de chauffeurs et historique
  des courses. La décision d'accepter le rattachement reste au chauffeur.
- Dossier chauffeur et examen des justificatifs. Pour la Wallonie, les sources
  SPW/WALLEX distinguent le certificat d'accès à la profession de l'exploitant,
  la licence taxi par véhicule et le certificat communal de capacité du
  chauffeur; ce dernier est revalidé chaque année entre le 1er janvier et le
  31 mars. Le titre de capacité est délivré par la commune compétente. Le dépôt
  n'est pas une connexion automatique au registre : pour approuver une licence
  ou un certificat de capacité, l'équipe doit consigner la référence qu'elle a
  vérifiée, confirmer la commune de Namur et, pour une licence, le service taxi
  (« rue » ou « station »). Cette attestation est conservée dans la note et
  l'audit d'examen. Le règlement communal adopté ajoute une promesse d'embauche
  écrite au dossier de certificat et impose que le casier judiciaire soit
  établi pour une activité réglementée de taxis. Le certificat communal délivré
  est la preuve à examiner dans ZupDrive : il matérialise le contrôle municipal
  des conditions, y compris l'âge minimum de 21 ans, le permis B et l'aptitude
  médicale (sauf mention sur le permis), ainsi que les pièces d'honorabilité
  requises. Pour un indépendant, demander à la Ville quel justificatif remplace
  la promesse d'embauche si elle ne s'applique pas à son statut. Le portail ne
  consulte pas le registre communal; un contrôle humain réel reste obligatoire
  ([démarches taxi du SPW](https://mobilite.wallonie.be/fr_FR/home/je-suis/un-citoyen/en-taxi.html),
  [décret wallon du 28 septembre 2023](https://wallex.wallonie.be/eli/loi-decret/2023/09/28/2023206356/2024/12/01),
  [arrêté d'exécution du 16 mai 2024](https://wallex.wallonie.be/eli/arrete/2024/05/16/2024007213/2024/12/01),
  [règlement communal adopté par Namur le 18 mars 2025, art. 3 à 7](https://www.namur.be/fr/ma-ville/vie-politique/conseil-communal/seances-du-conseil/18-03-2025/pvcc20250318-ville.pdf)).
- L'échéance du certificat annuel du chauffeur et celle de la licence de chaque
  véhicule sont enregistrées et obligatoires dans le dossier. La licence
  wallonne est liée à l'âge du véhicule : 7 ans pour un véhicule standard,
  10 ans pour un véhicule adapté ou électrique/hydrogène. L'admin doit donc
  contrôler le document et sa date réelle avant approbation
  ([démarche SPW pour la licence d'exploitation](https://wallonie.be/fr/demarches/transport-de-moins-de-9-personnes-obtenir-une-licence-dexploitation-dun-service-de-taxis)).
  Les dates saisies sans heure sont conservées comme dates civiles belges et
  restent valides jusqu'à 23 h 59 min 59 s à Bruxelles le jour indiqué.
- L'exploitation du service d'intermédiation électronique est conditionnée en
  Wallonie à un agrément distinct. Le verrou de production reste fermé jusqu'à
  ce que ZupDrive confirme et documente cet agrément auprès du SPW. La demande
  requiert notamment une unité d'établissement belge, le numéro d'entreprise
  pour l'activité d'intermédiation, le code BCE NACE relatif aux services
  auxiliaires des transports terrestres et, pour une société, sa mention dans
  l'objet social. L'agrément est valable cinq ans. Un exploitant de taxis doit
  aussi avoir un établissement stable et effectif en Wallonie, le code NACE
  49.330 à la BCE, un certificat d'accès à la profession et une licence
  communale par véhicule. Ce sont deux contrôles distincts — opérateur de
  plateforme et exploitant taxi — à documenter séparément
  ([demande d'agrément SPW](https://infrastructures.wallonie.be/fr/demandes/4261_transport-de-moins-de-9-personnes-demande-d-agrement-en-tant-que-service-d-intermediation-electronique.html),
  [décret wallon du 28 septembre
  2023](https://wallex.wallonie.be/eli/loi-decret/2023/09/28/2023206356/2024/12/01),
  [démarches taxi du SPW](https://mobilite.wallonie.be/fr_FR/home/je-suis/un-citoyen/en-taxi.html),
  [certificat de capacité chauffeur](https://www.wallonie.be/fr/demarches/transport-de-moins-de-9-personnes-demande-de-certificat-de-capacite-pour-un-chauffeur-de-taxis-taxis-de-station-ou-taxis-de-rue)).
- Devis à prix fixe calculé côté serveur, commande idempotente et attribution
  à un chauffeur disponible.
- Pour le pilote initial, départ et arrivée doivent appartenir à la commune de
  Namur. Le backend vérifie les codes postaux des sections communales :
  5000–5004, 5020–5022, 5024, 5100 et 5101 (liste
  [WalStat/IWEPS](https://walstat.iweps.be/walstat-fiche-entite.php?entite_id=92094)),
  ainsi que les coordonnées contre le polygone officiel inclus dans
  `backend/src/modules/zupdrive/data/limite-commune-namur.json` (GeoJSON). Source :
  [AGDP / SPF Finances, via le Géoportail de la Wallonie](https://geoportail.wallonie.be/catalogue/56d7efe4-b25b-4d82-adca-c2c193b1b4fa.html),
  situation 2026-10-06, licence CC BY 4.0. Le 2 novembre, le vrai service
  Photon, la signature de sélection et le polygone ont été exercés ensemble sur
  deux résultats réels : « Rue de Bricgniot, 5002, Namur » (≈443 m à l'intérieur,
  accepté) et « Chaussée de la Gare, 5080, La Bruyère » (≈290 m à l'extérieur,
   refusé). La distance au bord est une approximation locale; ce contrôle
   ponctuel n'était pas à lui seul un parcours complet. Le backend reçoit
  une preuve signée par son service de géocodage et reconstitue lui-même
  l'adresse, le code postal et les coordonnées comparées à la zone officielle
  ([Photon](https://photon.komoot.io/)).
- Acceptation/refus d’une proposition, puis arrivée, démarrage et fin de course.
- Suivi et historique passager ; position chauffeur quand son app est au
  premier plan.
- Annulation avant prise en charge, paiement par carte et affichage du résultat
  confirmé par le serveur.
- Outils d’administration pour examiner les dossiers et superviser les courses.
- Gestion d’une course interrompue : absence de chauffeur, annulation, échec de
  paiement et remboursement selon les règles serveur.
- Classe déterminée par le nombre de passagers : Standard (1–4), XL (5–6).
  Le chauffeur indépendant déclare les places passagers de son véhicule ; la
  société les déclare par véhicule. Une course n'est proposée qu'à un véhicule
  de la classe correspondante et ayant assez de places pour le groupe demandé.
- Pour le pilote Namur, la course Standard ou XL est calculée au même barème :
  **1,90 €/km, minimum 8,20 €, sans prise en charge, attente ni majoration
  dynamique**. L'article 12 §2 du règlement communal impose pour les courses
  réservées via plateforme le prix/km maximum de l'article 19 §2 AGW et le
  minimum de course de l'article 19 §3. Les montants sont indexés en 2026;
  l'admin ne peut pas enregistrer un autre barème wallon et le devis refuse une
  configuration non conforme. Le règlement a été adopté mais son article 13
  subordonne l'entrée en vigueur à la publication : la Ville doit en confirmer
  la date et l'interprétation pour ZupDrive avant mise en service
  ([règlement communal de Namur, art. 12-13](https://www.namur.be/fr/ma-ville/vie-politique/conseil-communal/seances-du-conseil/18-03-2025/pvcc20250318-ville.pdf),
  [arrêté wallon du 16 mai 2024, art. 19](https://wallex.wallonie.be/eli/arrete/2024/05/16/2024007213/2024/12/01),
  [circulaire d'indexation 2026 du SPW](https://mobilite.wallonie.be/files/taxis-reforme-2024/circulaire%20indexant%20tarif%20min%20et%20max%20services%20taxis.pdf)).

### Obligations Namur à contrôler avant l'activation d'un véhicule

- Certificat de capacité communal valide; licence d'exploitation du véhicule,
  commune et service taxi; certificat d'accès à la profession pour l'exploitant.
- En cas de nouvelle acquisition qui remplace définitivement un véhicule,
  vérifier la règle locale hybride/électrique (hors mild-hybrid), quatre portes
  au minimum et blanc uni non métallisé, sous réserve des exceptions prévues
  pour les véhicules PMR, de réserve ou de remplacement.
- Attestation d'identification par la police avant service; plaque communale
  conforme à l'avant droit et numéro reproduit dans l'habitacle. La pièce est
  obligatoire dans le dossier véhicule; son contenu reste contrôlé manuellement.
- Les véhicules PMR suivent les prescriptions communales d'équipement et la
  priorité de service. Le produit n'a pas encore de catégorie ni de matching
  PMR : confirmer avec la Ville si le pilote peut démarrer sans véhicule PMR
  et quelles obligations d'accueil s'appliquent.
- Le conseil de Namur a adopté le 9 décembre 2025 un règlement taxe 2026–2031
  fixant 500 € par véhicule/an, avec une réduction de 30 % pour les véhicules
  éligibles et une exonération PMR. Confirmer publication, enrôlement et
  critères avec la Ville; intégrer ce coût au modèle des chauffeurs et sociétés
  ([PV du conseil du 9 décembre 2025, art. 1 à 4](https://www.namur.be/fr/ma-ville/vie-politique/conseil-communal/seances-du-conseil/archives/2025/09-12-2025/pvcc20251209-ville.pdf)).

Le 3 novembre, le typecheck backend/frontend, le lint ciblé et le typecheck de
l'app passager passent après ces changements. Le build de production Next
16.4.3 passe via Webpack, avec TypeScript et 110 routes générées. Le script standard `npm run build` utilise
maintenant `next build --webpack`, car Turbopack panique au lancement de son
sous-processus CSS. Les workers Webpack ont dû être lancés hors du bac à sable
Windows avec le cache SWC privé du profil utilisateur. Le backend régénère
Le build backend passe via `cmd.exe` : Prisma est généré, TypeScript passe et
les cinq bundles API/CLI sont produits avec un code de sortie 0. Les comptes de
tests détaillés plus haut sont ceux du 2 novembre; aucune suite automatisée
n'a été relancée dans cette mise à jour.

## Hors périmètre de cette première mise en service

- Ouverture publique ou lancement national.
- Paiement obligatoire avant les essais Stripe sur l’environnement cible.
- Notifications push fiables, suivi chauffeur en arrière-plan et temps réel
  sans relecture périodique.
- Reversements automatisés et règles financières définitives, notamment pour
  les chauffeurs en société.
- Toute affirmation de conformité certifiée ou tout avis juridique.

## Repères de concurrence — consultés le 1 novembre 2026

- **Bolt indique proposer des trajets à Namur**, avec la catégorie « Confort »
  (1–4 passagers) sur sa page ville. Cette page établit une présence de l’offre,
  pas le nombre de chauffeurs disponibles à un instant donné
  ([Bolt à Namur](https://bolt.eu/fr-fr/cities/namur/)).
- **Uber référence également Namur** dans son guide de déplacement, et son
  annonce de lancement en Wallonie cite Namur pour UberTaxi selon la
  disponibilité des chauffeurs. La disponibilité exacte doit être vérifiée
  dans l’app au moment d’une course
  ([Uber à Namur](https://www.uber.com/global/fr/r/cities/namur-namur-be/?valueOf=7c984a),
  [annonce du lancement en Wallonie](https://uber-be.prezly.com/translation-uber-breidt-uit-naar-wallonie)).
- La page Uber Namur affiche une course UberX moyenne de **21 € pour 9 minutes**.
  C'est un indicateur agrégé, pas une estimation d'itinéraire ni un tarif garanti.
  Bolt ne publie pas de prix fixe Namur : son prix apparaît après saisie du
  trajet. Une comparaison utile devra donc saisir les mêmes trajets aux mêmes
  horaires dans les deux apps
  ([prix Uber à Namur](https://www.uber.com/be/fr/r/cities/taxi/namur-namur-be/),
  [Bolt à Namur](https://bolt.eu/fr-be/cities/namur/)).
- Bolt indique une commission de **19,8 % en Belgique**, appliquée aux courses
  et aux frais d’annulation, mais pas aux pourboires ni à certains suppléments
  ([aide Bolt](https://bolt.eu/fr-be/support/articles/24918/)). C’est un repère
  public, pas une recommandation automatique pour ZupDrive.
- Uber décrit des frais d’annulation variables selon le produit et la ville.
  La page belge consultée donne des montants pour Bruxelles et plusieurs
  autres villes, mais pas Namur
  ([politique Uber publiée en 2023](https://www.uber.com/be/fr/blog/nouvelle-politique-sur-les-frais-dannulation/)).
- Pour les véhicules, Uber Belgique publie des seuils généraux de 4 places
  passagers, une option Van à 6 places passagers et des critères d’âge/état
  pour certaines catégories. La disponibilité des catégories varie par ville
  ([exigences véhicules Uber Belgique](https://www.uber.com/be/fr/drive/requirements/vehicle-requirements/)).
- Les conditions belges de Bolt prévoient des frais après le délai de réflexion
  et permettent au chauffeur de refuser ou annuler, sous réserve des obligations
  réglementaires ([conditions passagers Bolt](https://bolt.eu/fr-be/legal/rides/tnc-be-passengers/)).

**Piste proposée :** comparer les offres actives à Namur et demander aux
chauffeurs leurs coûts avant de fixer une commission. Ne pas copier un taux ou
des frais sans modèle économique et validation locale.

**Conséquence produit :** commencer avec Standard et XL, conformément au choix
produit, et confirmer qu'il y a assez de véhicules XL autorisés avant de les
activer. Éviter d'ajouter des catégories confort ou premium avant d'avoir une
offre locale suffisante.

## Conditions de validation avant pilote fermé

1. La recette web Chrome passe 27/27 contrôles avec la vraie autocomplétion et
   deux preuves signées obtenues de Photon, sur des adresses centrales Namur–Jambes.
   Tester aussi des adresses proches des limites dans le navigateur et sur
   appareil; confirmer que la zone commerciale correspond à la frontière
   administrative.
2. Obtenir de la Ville la preuve de publication et la date d'entrée en vigueur
   du règlement taxi du 18 mars 2025; clarifier le justificatif de promesse
   d'embauche pour les indépendants, le régime taxi reconnu pour ZupDrive, les
   exigences PMR et la taxe 2026. Confirmer les documents à garder à bord et
   le tarif plateforme retenu. Le règlement d'exécution prévoit notamment la
   licence, la feuille de route quotidienne et la carte d'assurance; le véhicule
   doit aussi afficher la fiche signalétique et le certificat du chauffeur.
3. Obtenir puis documenter l'agrément wallon du service d'intermédiation
   électronique avant d'activer le verrou de production. La demande se fait
   dans Mon Espace avec eID. Préparer : identité/dénomination, numéro national
   ou d'entreprise, adresse du siège et des unités, téléphone et e-mail, preuve
   BCE du code d'activité « services auxiliaires des transports terrestres »
   et, pour une société, sa présence dans l'objet social. L'opérateur doit être
   constitué dans l'EEE, disposer d'un identifiant d'entreprise ou TVA, respecter
   les règles de transport et la transparence sociale, fiscale et opérationnelle.
   S'il n'a pas encore d'unité belge à la demande, il doit s'engager à en avoir
   une au plus tard la veille de la première mise à disposition publique.
   Demander au SPW si un pilote fermé sur invitation compte comme cette mise à
   disposition publique et à quelle étape l'unité belge doit être effective.
   Le SPW annonce un accusé de réception sous 30 jours ouvrables; si le dossier
   est incomplet, le demandeur dispose de 30 jours ouvrables pour le compléter;
   après réception d'un dossier complet, l'agrément est délivré sous 30 jours
   ouvrables. Le décret fixe sa validité à cinq ans : reprendre la référence et
   l'échéance exactes de la décision dans la configuration de production. Pour
   l'accompagnement, la Cellule Taxis indique `taxis@spw.wallonie.be`. Ces
   démarches sont distinctes des certificats/licences des sociétés taxi
   partenaires. Sources : [procédure SPW, mise à jour le 27 mai 2026](https://mobilite.wallonie.be/fr/demandes/4261_transport-de-moins-de-9-personnes-demande-d-agrement-en-tant-que-service-d-intermediation-electronique.html),
   [décret wallon du 28 septembre 2023, art. 8–9](https://www.ejustice.just.fgov.be/eli/decret/2023/09/28/2023206356/justel).
4. Compiler et installer les apps sur appareils ou émulateurs, puis tester la
   localisation, les notifications et la reprise après perte réseau.
5. Vérifier sur Stripe TEST le paiement, le webhook signé, le rejeu sans doublon
   et le remboursement.
6. Garder le tarif Namur configuré à 1,90 €/km et 8,20 € minimum; confirmer la
   commission de 20 % déjà prévue comme valeur par défaut, la facturation, le
   traitement des chauffeurs en société et les éventuels frais d’annulation.
7. Définir l’assistance pendant une course : pour le pilote, afficher des
   horaires limités et un canal de contact surveillé par un responsable désigné.
   L’app peut orienter vers les services d’urgence locaux en cas de danger
   immédiat ; elle ne doit pas promettre une intervention ZupDrive sans
   permanence. Le responsable et les horaires restent à nommer.
8. Faire valider le modèle d’exploitation et les obligations belges par les
   responsables compétents avant toute course réelle.
9. Confirmer l'identité et les coordonnées de l'exploitant, faire rédiger et
    valider les mentions légales, CGU, CGV, politique de confidentialité,
    cookies, accessibilité, conditions chauffeurs et conditions sociétés taxi,
    puis les publier dans l'espace superowner. Renseigner l'adresse de contact
    ZupDrive après confirmation. Ces brouillons bloquent volontairement les
    inscriptions et dossiers en production jusqu'à publication. Le porteur du
    projet indique qu'aucune entité juridique n'est désignée pour l'instant;
    cette étape n'a pas commencé.

Les étapes et preuves sont à consigner dans [l’état du projet](etat-projet.md).
Les tests automatisés ne remplacent pas les essais sur appareil, avec les
fournisseurs externes ou en exploitation.

## Points encore ouverts

- Recette web de course passée 27/27 avec l'autocomplétion réelle; vérification
  de points proches des limites dans l'interface et recette sur appareil encore
  à faire; confirmer la zone commerciale avec la Ville.
- Agrément SPW de l'intermédiation électronique pour lancer en Wallonie.
- Confirmation de publication et du régime taxi applicable par SPW/Namur,
  clarification du justificatif indépendant, des exigences PMR, de la taxe
  2026 et des pièces embarquées.
- Vérification des titres officiels encore humaine, sans accès direct au registre.
- Confirmation de l'application du tarif Namur pour les courses réservées par
  plateforme, de sa publication et des montants indexés; le code est déjà
  verrouillé à 1,90 €/km et 8,20 € minimum, identiques en Standard et XL.
- Commission, après comparaison des coûts et offres réellement actives à Namur.
- Responsable, horaires et canal d’assistance/SOS.
- Les heures d'exploitation.

Ces décisions ne sont pas déduites des fonctionnalités déjà présentes dans le
code.
