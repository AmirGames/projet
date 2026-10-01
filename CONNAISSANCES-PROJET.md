# ZupEat (groupe ZupOne) — connaissances du projet

Document de référence : ce qu'est le projet, comment on y travaille, ce qui a
été fait, et ce qui reste. À relire avant de reprendre le travail.

Dernière mise à jour (27 septembre) : la marque ZupEat au sein du groupe
ZupOne, l'équipe et ses rôles par plateforme sur un seul panneau
(`/superowner`), les reversements hebdomadaires et le fichier SEPA, les montants
justes pour chacun (commerçant, livreur, client), la tournée de trois courses,
l'application livreur prête pour les stores (hors réseau, position en
arrière-plan, suppression du compte) et la surveillance du site. Puis les
comptes : une adresse déjà prise refusée en 409 à chaque porte, les adresses
e-mail sans casse, le mot de passe de 8 caractères avec chiffre, minuscule et
majuscule, et l'inscription réparée dans l'application client ; la suite
d'API passe aussi sous Windows.

---

## 1. Le projet

**ZupEat** est une plateforme de commande en ligne pour les commerces de
proximité, dans l'esprit d'Uber Eats ou Glovo. Trois métiers cohabitent :

- **le client** commande depuis la vitrine d'un commerce, avec ou sans compte ;
- **le commerçant** tient son catalogue, ses horaires, ses zones et ses commandes ;
- **le livreur** reçoit les courses et les mène à leur terme ;
- **la plateforme** (superowner et son équipe) surveille l'ensemble, valide
  commerces et livreurs, retient ses commissions et verse chaque semaine à
  chacun ce qui lui revient.

Plusieurs commerçants cohabitent sur la même installation, chacun chez lui
(multi-tenant). Restaurants, boulangeries, épiceries — tout commerce qui vend
à emporter ou à livrer.

### Le groupe ZupOne

ZupEat est la première plateforme du groupe **ZupOne** ; **ZupDrive** (courses
de taxi / VTC) viendra ensuite, sur le même code et le même compte.

| Domaine | Rôle |
|---|---|
| `zupone.com` | Vitrine du groupe (à faire) |
| `manager.zupone.com` | L'équipe du groupe : un seul panneau (`/superowner`) pour toutes les plateformes |
| `zupeat.com` | Les clients de ZupEat |
| `manager.zupeat.com` | Les commerçants |
| `delivery.zupeat.com` | Les livreurs |
| `zupdrive.com`, `manager.zupdrive.com` | ZupDrive : clients, sociétés de taxi (à faire) |
| `driver.zupdrive.com` | Les chauffeurs ZupDrive (transport de personnes) — pas les livreurs |

- **Un seul compte ZupOne** par personne (`User`), client sur toutes les
  plateformes, commerçant ou livreur s'il l'est.
- **Les rôles de l'équipe sont propres à chaque plateforme** (`AccesEquipe`,
  énumération `Plateforme` : `EAT`, `DRIVE`) : on peut être SuperAdmin sur
  ZupEat et Support sur ZupDrive. Les groupes et leurs permissions
  (`PlatformRole`) se règlent aussi plateforme par plateforme.
- Le **nom visible** partout est ZupEat ; ZupOne n'apparaît que pour le compte
  et l'équipe du groupe.

Le site se répartit sur ces domaines (`NEXT_PUBLIC_DOMAINE_GROUPE`, `_PUBLIC`,
`_PRO`, `_LIVREUR`) ou tient sur un seul. **Rien n'est déployé : tout se passe
en local.**

---

## 2. Les règles de travail

Ces règles sont permanentes, elles ne se redemandent pas.

| Règle | Détail |
|---|---|
| **Langue** | Tout en français : réponses, code, commentaires, messages de commit, interfaces. |
| **Dépôt** | `https://github.com/AmirGames/projet` — le remote a tendance à revenir tout seul sur `AmirGames/saas-project`, qui est injoignable. **Vérifier `git remote set-url origin` avant chaque push.** |
| **Branche** | `claude/awesome-ride-m9lci8`, qui est aussi la branche par défaut du dépôt. `main` existe en double mais n'est plus suivie. |
| **Environnement** | Développement sous Windows (`C:\projet`), assistance dans un bac à sable Linux. |
| **Déploiement** | Aucun. Tout reste local tant que le site n'est pas fini. |

### Ce qui est volontairement reporté

- **Le stock par ingrédient** (une pizza consomme de la mozzarella), abandonné
  au profit du simple bouton disponible / épuisé.

---

## 3. La pile technique

| | |
|---|---|
| **Frontend** | Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS |
| **Backend** | Express 5, TypeScript, Prisma 7.10 (adaptateur `@prisma/adapter-pg`) |
| **Base de données** | PostgreSQL |
| **Temps réel** | Socket.IO — une connexion par onglet, annonce de chaque écriture (`donnees-modifiees`), Redis pour relier plusieurs instances |
| **Authentification** | JWT (jeton d'accès + jeton de renouvellement) |
| **Courriel** | SMTP via nodemailer, Mailpit en développement |
| **Adresses** | BAN pour la France + Photon pour la Belgique (`ADDRESS_PROVIDER=ban+photon`) |
| **Paiement** | Stripe — intention liée à la commande, webhook signé, remboursement au refus |
| **Virements** | Fichier SEPA `pain.001.001.03` généré chaque semaine, importé à la main dans la banque |
| **Notifications** | Web Push (VAPID), SMS Twilio, push Expo pour les applications — chacun facultatif |
| **Mobile** | Expo (React Native) : `mobile/apps/customer`, `merchant`, `delivery` |

```
backend/    API REST — 40 fichiers de routes, 69 services (hors tests), 57 modèles Prisma, 14 migrations
frontend/   Next.js — 116 pages
mobile/     trois applications Expo
```

**Aucune inscription ne donne les droits de la plateforme.** Le superowner se
crée en ligne de commande (`npm run create-superowner`, depuis
`SUPEROWNER_EMAIL` et `SUPEROWNER_PASSWORD` ou `SUPEROWNER_PASSWORD_HASH`) ; le
conteneur de production le fait au démarrage. Rejouable sans effet, et la base
n'en admet qu'un (index unique partiel, migration `0020`). Le superowner nomme
ensuite son équipe, avec des rôles.

Avant, le premier compte inscrit devenait superowner : deux inscriptions
simultanées sur une base vide en créaient deux, et sur un serveur neuf le
premier robot venu prenait la plateforme. Les **scripts de vérification**
gardent cette règle pour eux seuls : sur leur base vidée, ils promeuvent en SQL
le premier compte qu'ils inscrivent (`plateformeSiAucune`, voir §6).

---

## 4. Ce que fait la plateforme aujourd'hui

### Le client
- Parcourt les commerces, par recherche ou par proximité
- Menu rangé par catégories, plats épuisés signalés en direct
- Déclinaisons d'un plat (taille, type de pâtes…)
- **Un panier par commerce** : passer de l'un à l'autre ne mélange rien
- **Commande sans compte** : coordonnées, adresse de livraison avec suggestions,
  ou créneau de retrait tenu aux horaires réels
- Frais de livraison et minimum de commande annoncés **avant** de valider ;
  **livraison offerte** dès un montant de panier quand la zone le prévoit
  (`DeliveryZone.freeAbove`), avec « Encore X € pour la livraison offerte »
- **Prix affichés TTC** même quand le commerçant saisit HT
  (`TaxService.prixAuClient` sur les routes publiques du menu) : le total
  annoncé est celui qui est payé
- **Détail du total** (`DetailDuTotal`) sur le suivi et « Mes commandes » :
  sous-total, livraison, frais de service, remise, total, dont TVA
- **Frais de service** de la plateforme (0,25 € par défaut, réglables dans
  Configuration système) ajoutés à chaque commande, annoncés au tunnel
- Code promo et choix du moyen de paiement au tunnel
- Suivi de la commande : distance restante, durée estimée, position du livreur
- **Code de remise** à quatre chiffres, donné au livreur à la porte
- Retrouve une commande passée sans compte par son lien de suivi
- **Favoris** : le cœur de chaque carte de l'accueil ajoute ou retire le
  commerce ; la page Favoris montre son logo (ou son initiale à défaut)
- **Client injoignable** : il voit sur son suivi le compte à rebours des
  6 minutes d'attente du livreur, puis reçoit la photo et l'endroit du dépôt
- **Suppression du compte ZupEat** (application, `POST /api/client/me/suppression`,
  aperçu en `GET`) : profil, adresses, favoris, paniers et notifications ZupEat
  effacés, adresse libérée, commandes gardées détachées ; refusée pendant une
  commande en cours. Seul client, la connexion ZupOne disparaît ; aussi livreur
  ou commerçant, elle reste

### Le commerçant
- Inscription, puis **validation du commerce par la plateforme** : pièces
  exigées Kbis/BCE, identité, RIB. En attendant, il prépare sa boutique mais
  **ni ouverture, ni commande, ni présence dans les listes du client** — verrou
  côté serveur (`Organization.approvedAt`, distinct de `Store.isOpen`)
- Rappel **30 jours avant l'expiration** d'une pièce (espace + courriel, une
  seule fois) ; à échéance la pièce passe `EXPIRED`, la plateforme est prévenue,
  le commerce n'est pas fermé d'office
- Plusieurs boutiques par compte, selon la formule souscrite ; **duplication**
  d'une boutique (`POST /api/stores/:id/duplicate`) : catalogue, taxes, zones,
  promotions, thème, horaires et réglages copiés, jamais les commandes, avis,
  factures ni le personnel ; quota de la formule appliqué, copie annulée en
  bloc si elle échoue. Le slug se génère depuis le nom dans tous les formulaires
- Catalogue : catégories et plats réordonnables au glisser-déposer,
  déclinaisons, disponibilité basculable en direct
- Commandes : liste, détail, changement d'état, facture imprimable. Partout
  (web et application) le montant est **`montantCommercant`** = total −
  livraison − frais de service : ses articles, remise déduite. La livraison
  qu'il assure lui-même s'affiche sur sa ligne
- Nouvelle commande qui sonne aussi sur `/merchant` (toutes ses boutiques)
- **Reversements** (`/merchant/[orgId]/payouts`) : un relevé par semaine
- Horaires **service par service** (midi et soir dans la même journée,
  fermetures après minuit), créneaux de retrait, ouverture et fermeture
  immédiate
- Genre du commerce et type de cuisine, demandés dès la création
- Zones de livraison en anneaux, **réglées sur une carte** : la boutique se pose
  d'un clic, le rayon se tire à la poignée — rayon, frais et minimum par zone
- Codes promo, moyens de paiement, taxes, clientèle
- Statistiques de vente, exports
- **Son profil** : identité de facturation, propriétaire du commerce, numéro de
  TVA, compte bancaire, justificatifs — avec ce qui manque encore pour être
  facturé et pour être payé
- Support par tickets avec fil de discussion

### Le livreur
- Inscription, puis **dossier examiné par la plateforme** : dépôt des pièces
  (identité, permis, assurance, carte grise — seule l'identité à vélo), suivi
  de leur examen, motif lisible en cas de refus
- **Tant que le dossier n'est pas validé, ni mise en ligne ni course proposée**
- Passage en ligne, position transmise
- Pièces : identité, permis, assurance, carte grise (seule l'identité à vélo)
  et, pour tous, le **sac isotherme** (photo ou facture) — sans lui, pas de
  validation. Dépôt en photo ou en **PDF**. La liste vient du serveur
- Inscription possible **dans l'application** (écran « Devenir livreur »)
- Courses attribuées automatiquement au livreur disponible le plus proche
- Acceptation, refus, étapes de la course, rémunération calculée. Il voit
  **son gain** (`payout`, figé à l'attribution), jamais le total du client
- **Tournée** (`tournee.service.ts`) : jusqu'à `driverMaxCourses` courses
  (3 par défaut). Une course rejoint la tournée si son client est à
  `driverGroupClientKm` d'un autre ou sur le trajet, et si son commerce est le
  même ou à `driverGroupDetourKm` de détour. Un **lot** (`batchId`) se propose
  et s'accepte d'un bloc ; une course « sur votre trajet » s'ajoute en route.
  `GET /api/drivers/tournee` rend les arrêts dans l'ordre
- **Écran de fin de course** : gain, distance, durée, heures, mode de remise,
  gains du jour (`bilanCourse`, renvoyé par `GET /api/drivers/deliveries/:id`)
- **Sait s'il est payé** : ce qui reste dû, ce qui est arrêté et attend le
  virement, ce qui est arrivé, et le détail de chaque relevé
- **La prise en charge se déverrouille au commerce** : à moins de 150 m, un
  curseur « glisser pour prendre en charge » apparaît (repli déclaré quand le GPS
  ne le situe pas), et le GPS part aussitôt vers le client
- **Le client est prévenu à 300 m** qu'il peut descendre : une seule fois, et
  seulement une fois la commande récupérée (`OrderDelivery.nearCustomerNotifiedAt`)
- **Prouve la remise** : le code du client, vérifié seul au quatrième chiffre,
  ou la photo du dépôt prise avec l'appareil du téléphone, que le client voit
- **Est noté par ses clients**, et lit leurs remarques sur son tableau de bord
- **Client injoignable** : attente de 6 minutes
  (`POST /api/drivers/deliveries/:id/attente`, `OrderDelivery.customerWaitStartedAt`)
  avant que le serveur accepte la photo du dépôt. **« Tout va bien ? »** :
  immobile plus de 3 minutes hors commerce et client, il confirme ou appelle
  le 112, le support reçoit sa position
- **Course acceptée surveillée** (`surveillance-courses.service.ts`, toutes
  les 30 s avec la surveillance des livreurs). Commande au commerce : averti à
  20 min sans y être (ou après 5 min à plus du rayon d'attribution + 3 km),
  la course lui est **retirée et reproposée** à 30 min (ou 10 min d'écart) —
  sauf s'il est au commerce, ou à moins de 2 km d'une commande pas encore
  prête. Elle ne lui revient plus d'office et reste dans son historique,
  annulée avec le motif. Commande récupérée : à 30 min (4 min/km + 10 min si
  plus long, + 10 min par autre remise de la tournée) ou 5 min à plus de 5 km
  de détour, **alerte** au livreur, au commerce, au client et à la plateforme,
  sans rien retirer. Chaque constat est unique par attribution
  (`DeliveryIncident`) ; un livreur en incident ne reçoit pas de course en plus
- **Le client voit le retard** sur son suivi (`/track`, `/client/orders/:id`,
  application client) : champ `retard` (`LIVRAISON` ou `NOUVEAU_LIVREUR`,
  `retard-livraison.ts`), relu en base et poussé en direct, sans détail sur
  le livreur
- **Application** : course gardée et étapes mises en file **sans réseau**
  (envoyées au retour, `effectueLe` garde l'heure réelle) ; position en
  **arrière-plan** (expo-location + expo-task-manager) ; course proposée
  acceptable depuis la notification, téléphone verrouillé ; thème sombre,
  clair ou comme le téléphone
- **Suppression du compte livreur** (application et `/suppression-compte`) :
  `POST /api/drivers/me/suppression` passe le livreur `INACTIVE`, refusée
  pendant une course, et en `409 IBAN_REQUIRED` tant qu'il reste de l'argent
  dû sans IBAN valide ; `DriverPayoutService.soldeFinal` annonce le dernier
  versement et son lundi. Son compte client ZupEat reste actif

### La plateforme (superowner et équipe)
- **Un seul panneau, `/superowner`**, sur `manager.zupone.com` : `/admin`,
  `/super-admin` et le routeur `/api/super-admin` ont été supprimés. Le
  routeur `/api/admin` reste, des pages superowner s'en servent
- **Équipe et rôles** : SuperAdmin, Administrateur, Support (non supprimables)
  et les rôles créés par le superowner (« Facturation »…), supprimables une fois
  sans membre. Chaque rôle coche, **section par section**
  (`SECTIONS`, `permissions-plateforme.service.ts`), la lecture ou la
  modification. **Un rôle par plateforme** (`AccesEquipe`, `Plateforme` :
  `EAT`, `DRIVE`) ; `User.platformRole` a disparu. La gestion de l'équipe et
  des rôles reste au superowner seul. Les chiffres financiers ne partent
  qu'aux rôles qui ont `billing`
- **Incidents de livraison** (`/superowner/incidents-livraison`, section
  `driver-support`) : les courses qui dérapent, avec livreur, commerce et
  client à joindre. **Retirer la course** (commande au commerce, elle repart
  en recherche) ou **la déclarer échouée** (commande partie avec le livreur :
  `FAILED`, `cancelledBy: PLATFORM`, livreur libéré sans paiement ; le
  remboursement se fait depuis la facturation), ou **marquer traité** — tout
  journalisé. Alerte aussi par courriel et webhook (`prevenirPlateforme`,
  `vigie.service.ts`)
- Commerçants : formule, suspension, fermeture (**section à part**,
  `organizations-close` : elle archive puis efface à 60 jours ; le Support
  suspend et réactive mais ne ferme pas), réouverture depuis sauvegarde
  (section Organisations)
- Formules réglables : nom, prix, quota de boutiques, **commission sur les
  ventes** — deux taux par formule : propre livraison, et livreurs de la
  plateforme (plus élevé) —, arguments de vente
- **Qui livre** (réglage boutique « J'utilise ma propre livraison ») :
  coché, zones et frais du commerçant, taux de base, pas de livreur plateforme ;
  non coché, rayon et barème de Configuration système (base + km × distance
  boutique → client), frais reversés tels quels au livreur, taux majoré calculé
  hors frais. Le mode est figé sur la commande (`Order.deliveryMode`).
  **Tant que le paiement en ligne n'est pas branché, le client paie le
  commerçant, frais compris** : le commerçant encaisse ces frais pour le compte
  de la plateforme, ils sortent de son chiffre d'affaires et lui sont réclamés
  avec la commission du mois (`fraisDusALaPlateforme`, commandes livrées
  seulement)
- Facturation : commission du mois par commerçant, avec le détail par commande,
  **seulement pour les commandes d'avant `PAYOUTS_START_DATE`** : ensuite, la
  commission est retenue sur le reversement de la semaine
- **Versements SEPA** (`/superowner/versements`) : relevés commerçants
  (`MerchantPayout`) et livreurs de la semaine, fichier `pain.001.001.03`
  unique, IBAN contrôlés, bénéficiaires invalides écartés, « marquer le lot
  versé »
- **Pièces** : notification à chaque dépôt (`notifierPlateforme`),
  prévisualisation (le type réel est lu dans les premiers octets, les anciens
  `.bin` compris), **correction de la date d'expiration** d'une pièce
  commerçant ou livreur (journalisée, l'intéressé prévenu, une pièce expirée
  redatée repart en examen)
- **Boutiques** : une fiche par commerce, avec la correction des seuls champs
  dont la plateforme répond (voir la règle ci-dessous)
- **Dossier d'un commerçant** : son identité de facturation, reportée sur sa
  facture du mois, et l'examen de ses justificatifs — un refus se motive, et le
  commerçant en est prévenu. **Validation du commerce** une fois les pièces
  exigées validées ; filtre « À valider » dans la liste des commerçants
- **Livreurs** : dossiers à traiter, examen des pièces, validation, suspension,
  rétablissement — chaque geste motivé et journalisé
- **Versements** : ce qu'elle doit et à qui, arrêté des relevés d'une période,
  versement avec sa référence, annulation d'un relevé non versé
- Santé du système : cinq relevés chiffrés et la conduite à tenir
- **Surveillance** (`/superowner/monitoring`) : trafic, serveur, services
  externes, tâches de fond, pannes 5xx et erreurs des navigateurs ; vigie
  toutes les 30 s qui ouvre et ferme des incidents ; disponibilité relevée
  chaque minute et gardée 90 jours (`UptimeCheck`) ; sonde externe par
  GitHub Actions (`.github/workflows/disponibilite.yml`)
- Réglages de la **tournée** dans Configuration système (`driverMaxCourses` de
  1 à 5, `driverGroupClientKm`, `driverGroupDetourKm`), et le thème du site
- Journal des actions et journal des accès (avec IP et durée réelles)
- Sauvegardes, mode maintenance, clés d'API, webhooks
- Support : tous les tickets, y compris archivés, réponses, priorités

---

## 5. Ce qui a été fait, par thème

Le dépôt porte environ 200 commits. Les premiers (en anglais) sont la
construction initiale ; le travail en français qui suit est un long effort de
**mise en vérité** : beaucoup de fonctionnalités existaient à l'écran ou dans le
schéma sans être réellement branchées.

### Le fil rouge

> **Le motif qui revient : une fonctionnalité est configurable mais n'est jamais
> appliquée.** Des prix de commande venaient du client et étaient crus sur
> parole. Une boutique fermée acceptait quand même les commandes. Les montants
> minimum et maximum se réglaient dans l'interface sans agir nulle part. Le
> modèle `CourierDocument` existait sans aucune route. Un livreur naissait
> `ACTIVE`. La commission était globale alors que les formules en annonçaient
> une par palier. La durée des requêtes était écrite en dur à `0`. L'IP n'était
> jamais enregistrée. Treize routes d'API renvoyaient des données inventées.
>
> **Réflexe à garder : ne jamais croire l'écran ni le schéma, vérifier que la
> règle s'applique vraiment, avec un script qui relit la donnée.**

### Les grands chantiers

**Espace commerçant**
Navigation groupée, sélecteur de boutique et pages qui suivent la boutique
choisie, tableau de bord réel, correction de huit pages qui envoyaient un
`orgId` là où l'API attendait un `storeId`, unité monétaire corrigée dans tout
le site, barre latérale réparée.

**Espace plateforme**
Les trois espaces d'administration (`/admin`, `/super-admin`, `/superowner`)
réunis sous `/superowner`, puis les deux premiers supprimés pour de bon : ils
contournaient les rôles (`POST /api/super-admin/admins` nommait un
administrateur sans passer par l'équipe). Analytics, journal, support,
administrateurs, réglages rendus opérationnels. Clés d'API, webhooks,
sauvegardes (téléchargement, restauration, suppression), audit de sécurité,
mode maintenance réellement appliqué. Suppression des treize routes fictives.

**Formules et facturation**
Grille tarifaire sortie du code et rendue réglable, quota de boutiques appliqué,
formule visible et changeable côté commerçant, **commission par formule**
(8 / 5 / 3 %), détail des commandes derrière chaque ligne de facturation, bornes
minimum et maximum enfin appliquées à la commande.

**Catalogue et commande**
Disponibilité en direct via Socket.IO, ordre des produits respecté côté client,
catégories affichées, déclinaisons (avec calcul des prix côté serveur),
**un panier par commerce**, créneaux de retrait tenus aux horaires réels,
**commande en invité avec saisie de l'adresse**, zones de livraison réellement
appliquées, code promo et moyens de paiement au tunnel.

**Livraison**
Attribution automatique de la course au livreur disponible le plus proche,
suivi côté client (distance, durée, position), domaine propre aux livreurs,
puis **la validation des dossiers livreurs**, **les versements** — une course
livrée est due tant qu'aucun relevé ne la porte — et enfin **la preuve de la
remise** : un code à quatre chiffres chez le client, une photo du dépôt en son
absence.

**Identité du commerçant**
La plateforme lui prélevait une commission et lui devait des versements sans
rien savoir de lui : ni raison sociale, ni adresse de facturation, ni numéro de
TVA, ni compte où virer — et aucun écran ne le lui demandait. `/merchant/profil`
réunit les quatre, avec ses justificatifs et l'examen que la plateforme en fait.
La facture du mois porte enfin ces mentions, et dit ce qui lui manque encore.
L'autocomplétion d'adresse, elle, connaît désormais la Belgique.

**Comptes et sécurité**
Mot de passe de 8 caractères avec chiffre, minuscule et majuscule à chaque
création, récupération de mot de passe, confirmation d'adresse e-mail, suspension et
fermeture de compte en direct, **cloisonnement des commerçants** (une boutique
n'accepte plus l'identifiant d'une autre), sessions périmées répondant un 401
explicite, erreurs de validation rendues en français plutôt qu'un
« Validation error » muet.

**Support**
Fil de discussion sur les tickets, cloche de notifications branchée partout,
archivage à la clôture, priorités, alerte de la plateforme à l'ouverture,
tickets archivés consultables et ré-ouvrables.

**Nettoyage des vitrines**
Le site portait **trois vitrines** pour la même chose — `/restaurant/<id>`,
`/client/restaurant/<id>`, `/store/<slug>` — plus une maquette `/store` à
l'identifiant écrit en dur, vers laquelle la page d'accueil pointait. Il n'en
reste qu'une, `/store/<slug>` ; les anciennes adresses redirigent. Le panier
global (`cart-context`) a disparu avec l'ancien tunnel `/client/checkout` :
seul `lib/paniers.ts`, un panier par commerce, subsiste.

**Le groupe ZupOne et son équipe**
Marque visible ZupEat partout (site, courriels, applications, fiches des
stores, identifiants `com.amir_games.zupeat*`, cookie `ZUPEAT_REGION`, en-têtes
`x-zupeat-*`) ; ZupOne pour le compte et l'équipe. Rôles cochables, rôles
personnalisés, un rôle par plateforme, domaine propre au panneau de l'équipe,
barre latérale en tiroir sur téléphone.

**L'argent juste pour chacun**
Chacun voyait le total payé par le client comme si c'était le sien : le
commerçant comptait dans son chiffre la livraison du livreur et les frais de
service, le livreur lisait 20,25 € pour une course qui lui rapportait 5 €, le
client un « Total HT » faux et un suivi qui oubliait la remise, et des prix
saisis HT faisaient payer plus que le total annoncé. Puis **les reversements
hebdomadaires** : ce que la plateforme doit à chaque commerçant, figé chaque
lundi, et le fichier SEPA qui les paie avec les livreurs — la facturation
mensuelle cessant de réclamer ce que le reversement retient déjà.

**L'application livreur**
Tournée de trois courses, course sans réseau, position téléphone verrouillé,
acceptation depuis la notification, client injoignable, « Tout va bien ? »,
écran de fin, dépôt de pièces en PDF, inscription et suppression du compte
dans l'application, préparation de la publication (`PUBLICATION.md`).

**Surveillance**
Métriques en mémoire, vigie, incidents et alertes, disponibilité sur 90 jours,
sonde externe.

**Infrastructure de vérification**
Les scripts de vérification versés dans le dépôt, un `README.md`, et le présent
document.

---

## 6. Comment on vérifie — le point le plus important

**Pas de tests unitaires à simulacres.** Le projet se vérifie avec :

- des **scripts qui interrogent une vraie API branchée sur une vraie base** ;
- des scripts qui **pilotent un vrai navigateur** (Playwright).

**Un contrôle n'affirme jamais un code HTTP : il relit la donnée pour vérifier
qu'elle a bougé.** C'est ce qui attrape les fonctionnalités en trompe-l'œil.

### Les totaux actuels

| | Suites | Contrôles |
|---|---|---|
| **API** (`backend/scripts/verification/`) | 57 | **1896** |
| **Navigateur** (`frontend/scripts/`) | 29 | **716** au dernier décompte |

Dernier passage de la suite d'API : **27 septembre**, tout est vert — 1841
contrôles dans la suite complète, plus les 31 de `verif-paiement`, qui se joue
à part contre une API à Stripe actif (voir le `LISEZ-MOI`) : son interruption
dans la suite complète est attendue. Rejouée aussi sous Windows, session
PostgreSQL en UTC (voir le `LISEZ-MOI`).

La suite navigateur n'a pas été rejouée depuis le 24 septembre (716 contrôles,
alors 27 suites).

Trois réglages rendent les suites indépendantes des nouveautés du produit :
- la remise à zéro pose une configuration aux **frais de service nuls**
  (`reinitialiser.mjs`) : sans cela, chaque total relu au centime prendrait
  0,25 € de plus. `verif-frais-service` les remet ;
- les commerces qu'elles créent sont **validés d'office** en base (la
  validation elle-même se vérifie dans `verif-validation-commerce`) ;
- leurs boutiques sont **ouvertes toute la journée**
  (`ouvrirToutLeJour()`, `scripts/inscription.mjs`) : la vitrine refuse
  une boutique fermée, et une suite lancée à 7 h échouait. Les suites des
  zones cochent en plus « J'utilise ma propre livraison ».

Les suites navigateur ont besoin de `DATABASE_URL` (même base que l'API),
pour valider leurs commerces.

`verif-domaines` n'a pas tourné : il demande un site construit avec les
trois domaines.

Depuis la refonte d'identité, `/auth/signup` ne crée plus d'organisation.
Les suites s'inscrivent par `inscription()` (API, `outils.mjs`) et
`inscriptionVia()` (navigateur, `scripts/inscription.mjs`), qui ajoutent
l'organisation par `POST /api/organizations` ; après la connexion, un
commerçant passe par l'écran de choix d'espace
(`entrerEspaceCommercant()`, `scripts/connexion.mjs`).

### Lancer

```bash
# API
cd backend
createdb zupone_test
DATABASE_URL="postgresql://.../zupone_test" npx prisma migrate deploy
DATABASE_URL="postgresql://.../zupone_test" PORT=3099 npm run dev   # un terminal
DATABASE_URL="postgresql://.../zupone_test" VERIF_API_URL=http://localhost:3099 npm run verif

# Navigateur
cd frontend
npm i -D playwright && npx playwright install chromium
VERIF_SITE_URL=http://localhost:3000 VERIF_API_URL=http://localhost:3099 npm run verif:invite
```

`backend/scripts/verification/LISEZ-MOI.md` et `frontend/scripts/LISEZ-MOI.md`
détaillent chaque suite et ses prérequis.

> La base visée est **vidée** avant chaque script d'API. Un garde-fou refuse de
> s'exécuter si le nom de la base ne contient pas `test`.

### Prérequis particuliers

- **Base vierge** pour `verif:courses`, `verif:suivi`, `verif:livreurs`,
  `verif:versements`, `verif:preuve` et `verif:vitrine` : ces scripts créent leur propre compte
  plateforme, et seul le premier compte inscrit y est promu superowner. Lancer
  `node scripts/verification/reinitialiser.mjs` avant.
- **Jeu de démonstration** pour `verif:admin` et `verif:menu` :
  `node scripts/seed-demo.mjs`.
- **Faux service d'adresses** pour `verif:invite` côté navigateur :
  `node backend/scripts/verification/faux-service-adresses.mjs &` puis
  `ADDRESS_API_URL=http://127.0.0.1:4599/ban/` côté API. **À arrêter avant la
  suite d'API** : `verif-adresses` ouvre son propre service sur le même port
  4599 et s'interrompt si celui-ci est occupé.
- Côté API, **aucune suite ne dépend d'Internet** : celles qui situent une
  adresse (`verif-boutique-situee`, `verif-fiche-boutique`) démarrent leur
  propre serveur branché sur le faux fournisseur, via
  `scripts/verification/api-geocodante.mjs`. Une vérification qui appelait le
  vrai service échouait dès que le réseau manquait, et passait pour une
  régression.
- **Trois domaines renseignés** pour `verif:domaines`
  (`NEXT_PUBLIC_DOMAINE_PUBLIC`, `_PRO`, `_LIVREUR`), les mêmes des deux côtés.

---

## 7. Pièges connus

Chacun a déjà coûté du temps. À relire avant d'écrire un script ou une route.

**Base et Prisma**
- Une base fraîche **n'a aucune ligne `SystemConfig`** : passer par
  `PUT /api/admin/config` (qui la crée), jamais par un `UPDATE` direct.
- Le schéma vit dans des **migrations** : une base neuve se crée par
  `npx prisma migrate deploy` (migration de référence `0001_initial_schema`),
  et tout changement de `schema.prisma` s'accompagne d'une migration créée par
  `npx prisma migrate dev --name <nom>`, committée avec lui. Plus de `db push`
  (y compris sous Windows) : il laisserait la base en avance sur l'historique.
- Une base créée avant la remise à plat des migrations s'aligne une fois par
  `npx prisma migrate resolve --applied 0001_initial_schema`.
- `npm run dev` passe par `predev` (`prisma migrate deploy && prisma
  generate`) : sans lui, un serveur démarré après un changement de schéma
  gardait l'ancien client (« Unknown argument batchId »).
- Le backend est en **ESM** : un `require(...)` passe sous `tsx` mais casse une
  fois compilé (`node dist/server.js`). Toujours `import`.

**Scripts de vérification**
- `sqlScalaire()` ne renvoie que **la première colonne**. Jamais
  `SELECT a, b` : faire deux appels.
- Le premier compte inscrit y est le seul superowner : `plateformeSiAucune`
  (outils.mjs, inscription.mjs) le promeut en base — l'API ne le fait plus.

**Routes Express**
- **Les segments littéraux doivent être déclarés avant les routes
  paramétrées.** `/:storeId/:orderId` avale `/:storeId/today` s'il passe
  devant. Déjà rencontré sur `order-management` et `payment-method`.

**Formats attendus**
- La création de promotion veut `discountValue`, pas `value`.
- Les codes promo sont stockés **en majuscules**.
- `PaymentMethodType` : `CREDIT_CARD`, `DEBIT_CARD`, `PAYPAL`, `STRIPE`,
  `BANK_TRANSFER`, `CASH`, `APPLE_PAY`, `GOOGLE_PAY` — **pas de `CARD`**.
- La création de ticket attend `subject`, pas `title`.
- `Order` **n'a pas de `orderNumber`** : les commandes se désignent par leur
  `id`, que l'interface raccourcit à ses huit derniers caractères.

**Droits de l'équipe**
- Toute route d'administration passe par `exigerPermission(routeur,
  plateforme)` : le superowner passe partout, un membre seulement si **une
  section couvre la route** (`sectionDeLaRoute`) — lecture pour un `GET`,
  modification sinon. Une nouvelle route superowner sans section répond 403 à
  toute l'équipe : l'ajouter à la table des sections. Les routeurs actuels
  sont ceux de ZupEat (`EAT`).

**Applications mobiles**
- L'adresse de l'API se trouve seule : `EXPO_PUBLIC_API_URL` si définie,
  sinon, en développement, la machine qui sert Metro (port 3001), sinon
  `localhost`. Ne jamais écrire `localhost` en dur : sur un téléphone, c'est le
  téléphone.
- **Rattrapage du 29 septembre** : les trois applications suivent le site sur
  les suppléments payants (client : choix sur la fiche du plat, ligne de panier
  par combinaison, `supplements` envoyé à la commande ; commerçant : éditeur sur
  la fiche produit, suppléments et déclinaison sur la commande), le pourboire
  (client : au tunnel et après la livraison ; livreur : tableau de bord,
  revenus, historique, course), « Commander à nouveau » et le changement de mot
  de passe (les trois profils ; le serveur remet des jetons neufs à conserver).
  Pièces déposées : 2 Mo pour une image, 5 Mo pour un PDF.
- Les modules natifs ajoutés (`expo-task-manager`, `expo-file-system`,
  `expo-image-manipulator`…) exigent une recompilation ; ceux qui peuvent
  manquer dans une ancienne version sont chargés à la demande.
- Les envois de fichiers passent par `FileSystem.uploadAsync` (multipart
  natif) : le `fetch` multipart de React Native échouait sur Android.

**Fichiers servis par l'API**
- Helmet pose `Cross-Origin-Resource-Policy: same-origin` et interdit
  l'encadrement : l'aperçu d'une pièce dans le panneau télécharge le fichier et
  l'affiche en URL `blob:` plutôt que de le charger directement.

**Next.js**
- Next 16 écrit `frontend/AGENTS.md` (et `CLAUDE.md`) à chaque `next dev` : ils
  sont versionnés, et demandent de lire `node_modules/next/dist/docs` avant
  d'écrire du code.
- `useSearchParams()` dans un composant client impose une frontière `Suspense`
  au build. Lire `window.location.search` dans un `useEffect` à la place.
- Un commentaire JSX `{/* … */}` ne peut pas être **frère** de l'élément que
  rend une flèche : il casse la compilation. Le placer avant le `.map(…)`.
- **Ne jamais enregistrer un état avant de l'avoir lu.** Sur la vitrine, l'effet
  qui persiste le panier partait avant celui qui le relit, et écrasait le panier
  gardé du dernier passage. Un garde (`panierLu`) ordonne les deux.

**Temps réel**
- **Une seule connexion par onglet** : `frontend/lib/temps-reel.tsx`. Ne jamais
  rappeler `io(...)` dans un composant — passer par `useTempsReel`,
  `useSalon`, `useDonneesModifiees` ou `connexionTempsReel()`. Et ne jamais
  la fermer (`disconnect`) au démontage : retirer seulement ses écouteurs,
  **avec la fonction** (`off(evenement, ecouteur)`), sinon on retire aussi
  ceux des autres écrans.
- **Toute écriture réussie est annoncée** par `middleware/diffusion.ts` :
  `donnees-modifiees { ressource, action, storeId?, orgId?, id? }`, où
  `ressource` est le premier segment après `/api/` (`products`, `orders`,
  `order-management`…). Aux membres de l'organisation, à la plateforme, à
  l'auteur, aux suiveurs de la commande, et aux visiteurs de la vitrine pour
  les ressources publiques. L'annonce ne porte aucune donnée : l'écran relit
  l'API. Une route qui écrit sans que ce soit utile à relayer (la position du
  livreur, un calcul) va dans `IGNOREES`.
- Pour qu'un écran suive : `useDonneesModifiees('orders', charger, { storeId })`.
- **Les commandes sont annoncées depuis la base** (`services/db.ts`, middleware
  Prisma) : toute écriture sur `Order` ou `OrderDelivery`, même d'une tâche de
  fond ou de l'espace livreur, part en `ressource: 'orders'` vers le
  commerçant, la plateforme, le client, le livreur et les suiveurs de la
  commande. Les écritures d'une même commande sont regroupées (150 ms). La
  position GPS seule (`driverLat`, `driverLng`…) n'est pas annoncée.
- Pour toute autre donnée écrite par une tâche de fond (hors requête HTTP),
  le relais ne voit rien : l'annoncer avec `signalerModification()`.
- Une page qui se relit en direct ne doit pas se remplacer par
  « Chargement… » : lui passer un chargement `silencieux`.
- **Le nom de la famille et le propriétaire** d'une route se règlent dans
  `ROUTES` et `LOCALISATEURS` (`middleware/diffusion.ts`) : sans entrée, la
  famille est le premier segment après `/api/` (`superowner` ne dirait rien à
  l'écran des tickets). Les tickets remontent à leur organisation, un livreur
  ou un versement à l'e-mail du livreur.
- Pages branchées :
  - commandes : commerçant (liste, fiche, tableau de bord), client (liste,
    fiche), livreur (accueil, historique, course), plateforme (tableau de
    bord, fiche boutique) — `verif-commandes-direct` ;
  - catalogue du commerçant (produits, catégories, horaires, zones,
    promotions) et vitrine, dont le panier se remet d'accord avec le menu
    (plat retiré ou épuisé sorti, nouveau prix repris) ;
  - tickets (support du commerçant, tickets de la plateforme, conversation
    ouverte) ;
  - plateforme : commerçants (liste, fiche, dossier), livreurs (file et
    dossier ouvert), versements, statistiques, boutiques ; côté livreur, son
    dossier et ses versements — `verif-catalogue-support-direct`.

**La vitrine (`/store/<slug>`)**
- Son panier est un **panneau replié** : un script qui veut lire ses lignes doit
  d'abord cliquer sur « Panier ».
- Elle titre ses catégories en `h2` et ses plats en `h3`, dans des `<section>`.

**Les régions (`/be-fr/`, `/fr-fr/`, `/gb-en/`…)**
- Seules les pages publiques indexables portent le préfixe : accueil,
  `/restaurant/*`, `/store/*` (sauf `/store/new`), pages
  légales, pages « devenir ». Liste dans `frontend/i18n/chemins-regionaux.ts`.
- **Aucune page n'est déplacée** : le proxy (`frontend/proxy.ts`) retire le préfixe, réécrit
  vers la page d'origine et transmet la région par l'en-tête
  `x-zupeat-region`. Une page publique appelée sans préfixe est redirigée
  (307) vers la région du visiteur : cookie `ZUPEAT_REGION`, sinon langue
  choisie, sinon `Accept-Language`, sinon `fr-fr`.
- Un script de vérification qui ouvre `/store/<slug>` atterrit donc sur
  `/fr-fr/store/<slug>` : comparer les adresses sans le préfixe.
- `/restaurants`, l'ancienne liste des commerces, n'est plus qu'une
  redirection vers l'accueil public (`/client`, la racine de zupeat.com) :
  les liens « Commerces » passent par `accueilDe('public')`.
- Sur les pages publiques, importer `Link` depuis `@/components/LienRegional`
  plutôt que `next/link`, pour éviter un détour par la redirection.
- `usePathname()` renvoie l'adresse visible, préfixe compris.
- **Chaque boutique a un pays** (`Store.countryCode`, « fr », « be »…), déduit
  de son adresse à chaque changement (`paysDeLAdresse` : le texte d'abord, le
  géocodage ensuite). `GET /api/client/stores?pays=be` ne liste que les
  boutiques belges **et celles dont le pays est inconnu** — une boutique de
  trop plutôt qu'un commerce introuvable. `/stores/nearby` ne filtre pas : la
  distance prime, frontière comprise.
- Les boutiques d'avant ce champ : la migration donne `fr` aux codes postaux à
  cinq chiffres ; les autres restent vides jusqu'à leur prochain changement
  d'adresse ou leur prochaine commande sans position.
- **SEO** (`frontend/lib/seo-regional.ts`) : chaque page régionale porte une
  balise `canonical` et des `hreflang` (fr-BE, en-GB…, plus `x-default` vers
  l'adresse sans préfixe). La vitrine ne les déclare que dans les régions du
  pays de son commerce, et sa canonique y renvoie. `/sitemap.xml` et
  `/robots.txt` sont générés (`app/sitemap.ts`, `app/robots.ts`).

---

## 8. Ce qui est actif en ce moment

### Terminé et poussé

**Le plan de livraison en trois temps est terminé** : validation des livreurs,
versements, preuve de la remise. Tout est vert et poussé.

Deux invariants à ne jamais casser :

- **Une course livrée est due tant qu'aucun relevé ne la porte.** Le champ
  `OrderDelivery.payoutId` interdit qu'une course soit payée deux fois : un
  arrêté ne prend que les courses qui n'en ont pas, et l'annulation d'un relevé
  non versé les relâche.
- **La plateforme ne corrige d'une boutique que l'adresse et ses coordonnées,
  l'adresse publique, le téléphone et l'e-mail.** Le nom, le catalogue, les
  prix et les horaires appartiennent au commerçant : c'est lui qui répond de ce
  que paie un client. Tout autre champ est refusé explicitement, chaque
  correction part au journal avec son avant et son après, et le commerçant est
  prévenu.
- **Tout se paie par Stripe, sauf les espèces.** Une commande qui n'est pas en
  `CASH` — y compris sans moyen de paiement choisi — n'arrive au commerçant
  qu'encaissée, dès que `ENABLE_STRIPE` est vrai avec une clé. Elle naît
  avec `Order.submittedAt` vide : absente de ses listes, de ses chiffres, de
  l'acceptation, et sans délai de réponse. L'encaissement (webhook ou
  `/confirm`) la lui transmet une seule fois, sonnerie comprise, et son délai
  court de là. Toute requête côté commerçant filtre avec `TRANSMISE`
  (`backend/src/utils/commande-transmise.ts`). Jamais payée au bout de trente
  minutes, elle est retirée (`deletedAt`) et son intention annulée.
- **Une commande n'est « payée » que sur la parole de Stripe.** Le montant de
  l'intention est lu sur la commande, jamais dans la requête. Le webhook
  (`POST /api/payments/webhook`, monté avant le lecteur JSON pour vérifier la
  signature sur le corps brut) passe `paymentStatus` à `SUCCEEDED`, `FAILED`
  ou `REFUNDED` ; `/api/payments/confirm` relit aussi Stripe pour ne pas
  attendre le webhook. Un refus rembourse de lui-même (clé d'idempotence
  `remboursement-<orderId>`), ou annule l'intention si rien n'est encore payé ;
  un paiement arrivé après le refus repart aussitôt. Le reste — commande déjà
  prise par un livreur, litige — passe par le support :
  `POST /api/superowner/orders/:id/refund`. Un remboursement que Stripe
  n'arrive pas à faire (`refund.failed`) remet la commande en `SUCCEEDED`.
- **Les frais de service ne sont jamais au commerçant.** Figés sur la
  commande (`Order.serviceFeeAmount`), ils sortent de l'assiette de sa
  commission, de son chiffre et de sa facture, et lui sont réclamés sur le
  relevé du mois pour toute commande terminée (`serviceFeesDue`). Changer le
  réglage ne réécrit pas les commandes passées.
- **Les frais d'une course de la plateforme ne sont pas au commerçant.** Il
  les encaisse pour elle tant que le paiement en ligne n'existe pas : ils
  sortent de son chiffre et figurent sur son relevé du mois, avec la
  commission (`deliveryFeesDue`, `totalDue`). `amount` reste la seule
  commission. Le jour où Stripe Connect sera branché, le partage se fera au
  paiement et ce relevé n'aura plus de frais à réclamer.
- **Le client suivant ne se montre qu'une fois le précédent livré.** Tant
  qu'une commande de la tournée attend au commerce, le serveur ne rend le
  client d'aucune course (champ `masque`) et refuse remise, attente et photo
  (`409 TOURNEE_RETRAITS`). Toutes en main, l'ordre des remises est figé
  (`OrderDelivery.ordreRemise`) et seule la première se remet
  (`409 TOURNEE_ORDRE`). Le livreur n'est libéré qu'à la fin de sa dernière
  course (`DispatchService.liberer`).
- **Ce qu'un reversement retient ne se facture pas au mois.** La facturation
  mensuelle ne compte que les commandes d'avant `PAYOUTS_START_DATE` : sinon
  le commerçant payait deux fois sa commission et ses frais.
- **Un livreur qui part est payé.** L'arrêté du lundi et le fichier SEPA ne
  regardent pas le statut du livreur ; la suppression est refusée tant qu'il
  reste un montant dû sans IBAN valide, et le support ne doit rien effacer
  avant le dernier versement (`Driver.suppressionDemandeeLe`).
- **À chacun son montant.** Commerçant : `montantCommercant` (total − livraison
  − frais de service). Livreur : `payout`. Client : le détail complet. Aucun
  écran ne présente le total du client comme l'argent d'un autre.
- **Le code de remise appartient au client, jamais au livreur.** Aucune route
  côté livreur ne le rend ; il sait seulement qu'un code est attendu et combien
  d'essais lui restent. Cinq essais ratés le bloquent, et la photo du dépôt
  devient la seule preuve possible.

**Le profil du commerçant est en place** : il renseigne son identité de
facturation, son propriétaire, son compte et ses pièces depuis
`/merchant/profil` ; la plateforme les retrouve sur la fiche du commerçant et
sur sa facture du mois.

Un invariant de plus :

- **La règle du mot de passe vaut à la création, jamais à la connexion.**
  `champMotDePasse()` (`backend/src/utils/validation.ts`) : 8 caractères
  minimum, un chiffre, une minuscule, une majuscule, caractères spéciaux
  permis ; un message par manque. Il sert à `/auth/signup`,
  `/auth/merchant-register`, `/drivers/register` et `/auth/reset-password`.
  `loginSchema` garde l'ancienne tolérance : durcir la connexion aurait
  enfermé dehors les comptes créés avec six caractères. La même règle est
  recopiée côté site (`frontend/lib/mot-de-passe.ts`, affichée par
  `ReglesMotDePasse`) et dans les applications (`lib/motDePasse.ts`) pour un
  retour immédiat — le serveur reste juge. Toute nouvelle route qui fixe un
  mot de passe passe par `champMotDePasse()`.
- **Un compte suspendu garde son dossier.** `/api/merchant-profile` est la
  seule route commerçante ouverte à un compte suspendu, en plus du support et
  des notifications : une suspension tient presque toujours à ce qui manque là
  — un justificatif, un numéro de TVA, un IBAN —, et fermer cette page ferait de
  la suspension une impasse. Un compte **fermé**, lui, n'a plus de dossier à
  tenir : la porte se referme.
- **Une journée d'ouverture porte une liste de plages, pas un couple
  d'heures.** `{ closed, plages: [{ open, close }] }`, et une plage dont la
  fermeture précède l'ouverture se termine le lendemain. L'ancienne forme
  `{ open, close, closed }` reste lue (`lireLeJour`) : pas de migration, pas de
  temps d'arrêt, et le nouveau format s'écrit dès la première modification.
- **Une adresse e-mail n'a pas de casse.** `champEmail()`
  (`utils/validation.ts`) retire les espaces et met en minuscules avant de
  valider ; il sert à toute adresse qui identifie quelqu'un (inscriptions,
  connexion, mot de passe oublié, fiche client, commande sans compte, équipe
  d'une boutique, nomination dans l'équipe). La migration 0014 a converti
  l'existant, sauf les doublons à la casse près, laissés tels quels : une
  migration ne fusionne pas deux comptes. La connexion retrouve encore un
  compte resté en majuscules, s'il est seul. Toute nouvelle route qui reçoit
  une adresse de personne passe par `champEmail()`.
- **Une adresse déjà prise est un 409, jamais un 500.** Chaque porte
  d'inscription vérifie l'adresse (`EMAIL_EXISTS`) ; le gestionnaire
  d'erreurs traduit en plus toute violation d'unicité Prisma (P2002) en 409
  `ALREADY_EXISTS`, pour deux requêtes simultanées. À l'inscription, la fiche
  client née d'une commande sans compte est reprise et rattachée au compte,
  au lieu d'être recréée.
- **Un champ e-mail facultatif accepte la chaîne vide** (`emailFacultatif`,
  `utils/validation.ts`). `z.string().email().optional()` la refuse : une
  boutique sans adresse de contact ne pouvait ni être créée, ni voir le moindre
  de ses réglages enregistré, sur un « Invalid email address » qui ne nommait
  même pas le champ.
- **Les nomenclatures vivent côté serveur** (`store-type.service.ts`) et sont
  servies par `GET /api/stores/types`. Recopiées dans un `<select>`, elles
  auraient dérivé dès la première addition — c'est exactement ce qui était
  arrivé aux publics d'annonce.
- **Une clé de service ne quitte jamais le serveur.** Google Places est
  interrogé depuis l'API, pas depuis le navigateur : la clé se restreint alors
  par adresse IP plutôt que par référent HTTP, et n'apparaît dans aucune page.
  `ADDRESS_PROVIDER=google` suffit à basculer ; sans `GOOGLE_MAPS_API_KEY` le
  fournisseur se déclare injoignable au lieu de rendre une liste vide qu'on
  lirait « aucune adresse ne correspond ».
- **Un refus attendu n'est pas une panne.** Le gestionnaire d'erreurs trie sur
  le code : un 4xx part en `WARN` sans pile, un 5xx garde `ERROR` et sa pile.
  Tout partait en `ERROR` : une session à refaire, une TVA mal saisie et une
  page inexistante faisaient le même bruit qu'une vraie panne, au point qu'on ne
  distinguait plus ce qui appelle une intervention.
- **L'IBAN n'est jamais rendu en entier.** Ni dans une réponse d'API — côté
  commerçant comme côté plateforme —, ni dans un journal : les écrans n'en
  montrent que les quatre derniers caractères. Le champ de saisie part vide, et
  un enregistrement qui le laisse vide n'efface pas le compte enregistré.
- **Fermer une boutique n'est pas suspendre un compte.** La plateforme n'avait
  que la suspension — qui ferme aussi l'espace du commerçant, donc sa
  remédiation — là où l'incident du jour ne demandait que de couper les
  commandes d'une boutique. Le bouton est sur sa fiche, la fermeture exige un
  motif que le commerçant reçoit, la réouverture n'en demande pas, et les deux
  gestes sont journalisés (`CLOSE_STORE`, `OPEN_STORE`).
- **Ce qui touche à l'argent est figé sur la commande.** La commission se
  recalculait à l'affichage de la facturation, au taux de la formule *actuelle* :
  changer la formule d'un commerçant refacturait tout son historique au nouveau
  taux — la plateforme perdait de l'argent dans un sens, en réclamait indûment
  dans l'autre. `commissionPercent`, `commissionAmount` et `tierAtOrder` sont
  désormais inscrits sur chaque commande, et la facturation les additionne. Un
  mois peut donc porter deux taux, et l'écran le dit.
- **La TVA est calculée au serveur, et comprise dans le prix.** `taxAmount`
  arrivait du navigateur ; aucun écran ne l'envoyant, toute commande naissait
  avec zéro de taxe, et le taux réglé ne servait à rien. Le calcul retient
  **une seule taxe par ligne**, la plus précise (produit, puis catégorie, puis
  « sur tout ») — les cumuler aurait taxé deux fois la même limonade. Et le prix
  affiché étant TTC, la taxe s'en **extrait** (`TaxSetting.included`, vrai par
  défaut) : ajouter 12 % au passage en caisse ferait payer au client autre chose
  que ce qu'il a vu sur la carte.
- **Une facture porte les mentions de son émetteur.** Numéro de TVA et
  immatriculation, pris sur la boutique quand elle a sa propre identité de
  facturation, sinon sur la société. Sans numéro de TVA, une facture ne permet
  ni de récupérer la taxe ni de justifier la dépense : l'écran le signale au
  commerçant plutôt que d'imprimer un document inutilisable.
- **`zone-impression` n'imprime que le document.** « Imprimer » sortait presque
  tout le site : seule la barre d'action portait un `print:hidden`, le châssis
  restait sur le papier. La règle est dans `globals.css`, et se pose sur le
  document à imprimer, quelle que soit sa profondeur dans la page.
- **Les webhooks sont branchés pour de bon.** L'écran proposait dix événements
  dont neuf n'existaient pas côté serveur, et l'abonnement était accepté sans un
  mot ; sur les six réels, trois n'étaient émis nulle part. La liste est
  maintenant celle du serveur (`EVENEMENTS_WEBHOOK`), un événement inconnu est
  refusé en nommant ce qui ne va pas, et les six partent réellement. Le secret
  n'est rendu qu'à la création — l'écran le montre une fois, comme l'IBAN il ne
  reparaît jamais. Un envoi raté est relancé trois fois (une minute, cinq,
  trente) : la file est en base, pas dans un `setTimeout`, pour survivre au
  redémarrage. Les délais se raccourcissent par `WEBHOOK_RELANCES_MS` — c'est
  ainsi que la vérification les observe. Tout est écrit dans
  `DOCUMENTATION-WEBHOOKS.md`.
- **Un corps JSON illisible est un refus, pas une panne.** `body-parser` marque
  son erreur d'un `status` 400 ; personne ne le lisait, et une accolade
  manquante sortait en 500 avec sa pile d'appels. Le gestionnaire d'erreurs le
  lit maintenant. Corollaire pour les vérifications : un corps tronqué n'est
  plus un moyen de provoquer une vraie panne — `verif-journal.mjs` appelle
  désormais le gestionnaire dans un processus à part pour contrôler qu'un 5xx
  garde bien son `ERROR` et sa pile.
- **Un composant chargé par `next/dynamic` s'exporte par défaut.** Repris par
  `import(...).then((m) => m.CarteZones)`, il atterrissait dans un morceau que
  le manifeste ne retrouvait plus après un changement de dépendances :
  « Loading chunk … failed (`/_next/undefined`) ». `export default` règle le
  chargement, et `ssr: false` reste indispensable — Leaflet touche `window`.

**Le suivi de livraison est sur la carte.** Le trajet se lisait sur un plan
dessiné à la main — un trait, trois repères, une pastille qui glissait de l'un à
l'autre. Un livreur « aux deux tiers » pouvait aussi bien être dans la rue d'à
côté qu'à l'autre bout de la ville : le trait était le même. Le client voit
maintenant les trois points là où ils sont, le parcouru plein et le restant
pointillé, et la pastille du livreur qui bouge sans recharger — la position
arrive par la socket. Deux garde-fous s'y lisent : **le cadrage ne se refait
qu'à l'ouverture**, sinon la carte sauterait sous les doigts de qui vient de la
déplacer ; et **la pastille du livreur disparaît une fois la course remise**,
plutôt que de rester figée comme s'il roulait encore. Une commande dont
l'adresse n'a pas pu être située garde son plan dessiné : une carte sans points
ne montrerait qu'un fond vide.

**La carte des zones est en place** : Leaflet et le fond OpenStreetMap, sans clé
ni compte. Le commerçant pose sa boutique d'un clic, tire une poignée pour
régler le rayon, et voit ses anneaux. La plateforme dispose de la même carte sur
la fiche d'une boutique, pour poser à la main un commerce que le service
d'adresses ne sait pas situer.

**Le livreur est noté par ses clients.** `Driver.rating` valait 5,00 pour tout
le monde : c'était la valeur par défaut de la colonne, et aucune route ne
l'écrivait jamais. Le livreur lisait « 5 » sur son tableau de bord le jour de
son inscription, la plateforme classait ses livreurs sur un chiffre identique
pour tous, et le client qui avait attendu une heure n'avait nulle part où le
dire. Une note va de 1 à 5 et se donne **une fois par course remise**, par le
client de cette course : c'est `deliveryId` qui est unique dans `CourierRating`,
pas le couple client/livreur. Trois choses à retenir :

- **La moyenne est recalculée depuis les notes, jamais ajustée au fil de
  l'eau.** Une moyenne entretenue par additions successives dérive au premier
  incident, et plus rien ne permet de la remettre d'aplomb. `Driver.rating`
  n'est que le reflet de `CourierRating`.
- **Un livreur jamais noté n'a pas de note.** Les routes renvoient `rating: null`
  et `avis: 0` tant que `totalRatings` vaut zéro, et les écrans affichent « Pas
  encore noté » — plutôt qu'un sans-faute qu'il n'a pas gagné.
- **Le livreur lit ce qu'on lui reproche, jamais qui le lui reproche.**
  `/api/drivers/ratings` ne renvoie pas le client : une note nominative se
  réglerait à la course suivante.

À savoir pour les vérifications : **deux pages du même contexte Playwright
partagent le `localStorage`, donc le jeton**. Une suite qui connecte la
plateforme dans un `contexte.newPage()` écrase le jeton du livreur, et l'espace
livreur repart ensuite avec le mauvais compte — un 404 « aucun profil livreur »
que rien dans le scénario n'explique. Chaque rôle prend son `nav.newContext()`.

À savoir pour les vérifications : **les tuiles sont bloquées dans le bac à
sable**. Les suites navigateur ne les contrôlent donc pas — elles contrôlent ce
que le navigateur dessine (anneaux, poignée, point) et ce que le serveur
enregistre. Leurs filtres d'erreurs ignorent explicitement `tile.openstreetmap`
et `net::ERR_`.

**Favoris depuis l'accueil client.** Le cœur des cartes de `/client` était
décoratif, et placé dans le lien de la carte : un clic ouvrait la boutique.
Il appelle maintenant `POST` / `DELETE /api/client/me/favorites`, avec
`preventDefault` + `stopPropagation`, met à jour l'affichage tout de suite et
revient en arrière si le serveur refuse. Sans jeton, il renvoie vers `/login`.
La page Favoris affiche `settings.logo` du commerce, comme l'accueil.

**Dépendances des hooks.** Tout le frontend (client, livreur, commerçant,
super-admin, superowner, composants) passe `react-hooks/exhaustive-deps` :
les fonctions de chargement sont en `useCallback` et l'effet en dépend. Quand
une dépendance est une prop recréée à chaque rendu du parent (un `onSelect`),
elle va dans une `useRef` — sinon l'effet boucle. La règle
`@next/next/no-img-element` est désactivée : les logos viennent d'URL
quelconques, `next/image` ne convient pas.

### À faire ensuite

Le carnet ci-dessous.

### Le reste du carnet

- **Les commandes en mode test**, pour qu'un commerçant s'entraîne sans polluer
  ses statistiques.
- **Des suites pour les derniers chantiers** : reversements commerçants et
  fichier SEPA, rôles de l'équipe et `exigerPermission`, duplication de
  boutique, livraison offerte, et côté livreur la pause, la perte du signal,
  le support en direct et les statistiques.
- **ZupDrive** et la vitrine du groupe : prévus par `Plateforme.DRIVE` et les
  domaines, rien d'autre n'est écrit.
- **Publier les applications** : icônes définitives, comptes des stores, et un
  service de cartes et d'itinéraires hébergé à la place des serveurs publics
  d'OpenStreetMap et d'OSRM.
- **Se servir de la note à l'attribution** : elle est écrite et lue, mais le
  dispatch départage toujours à la distance seule.
- **Prisma 7 → 8**, rien d'urgent : le projet est sur Prisma 7.10, toujours
  maintenu, et Prisma 8 n'en est qu'aux versions candidates. À planifier quand
  il sera stable.
- Ni file d'attente, ni hébergement d'images externe, ni remontée d'erreurs :
  les variables correspondantes sont commentées dans `.env.example`.

---

**Pages légales et acceptation des conditions.** Mentions légales, CGU, CGV,
conditions commerçants et livreurs, confidentialité et cookies s'affichent sous
`frontend/app/(legal)` mais leur texte vient de l'API (`/api/pages-legales`).
Il se modifie dans l'espace superowner, **Pages légales** : chaque publication
crée une version (`PageLegaleVersion`) qui n'est plus jamais réécrite ; tant
qu'aucune n'est publiée, le texte de départ de
`backend/src/contenus/pages-legales.defaut.ts` est servi (champs entre crochets à
remplir avant l'ouverture). Les quatre points d'entrée — `/auth/signup`,
`/auth/merchant-register`, `/drivers/register`, `POST /orders` — exigent
`conditionsAcceptees: true` et enregistrent la preuve dans
`AcceptationConditions`, avec la version en vigueur de chaque document
(« cgu@v2 cgv@2026-09-25 … »). Tout script qui appelle ces routes doit
envoyer le champ.

## 9. Conventions d'écriture

Elles se lisent dans le code existant, mais autant les dire.

- **Tout en français**, y compris les noms de variables et de fonctions dans le
  code récent (`piecesAttendues`, `validerLivreur`, `dossierComplet`).
- **Les commentaires disent pourquoi, pas quoi.** Ils expliquent le défaut
  qu'on répare ou le piège qu'on évite, jamais ce que la ligne fait déjà voir.
- **Les messages de commit racontent le problème**, pas la liste des fichiers :
  ce qui n'allait pas, ce qui change, ce que ça coûte.
- **Chaque chantier apporte sa suite de vérifications**, et les suites
  existantes doivent rester vertes.
