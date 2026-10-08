# Registre de lancement — conformité UE

Mis à jour le 8 octobre 2026. Chaque ligne doit avoir un responsable, une date et une preuve avant l'ouverture publique. Aucune ligne n'est cochée par le code : seuls l'exploitant, le DPO ou un conseil peuvent les clore.

## Livré dans le dépôt

| Sujet | Base | Ce qui est fait |
|---|---|---|
| Allergènes | Règlement (UE) 1169/2011 | Champs sur `Product` ; saisie obligatoire côté commerçant (web, mobile) ; affichage au client avant commande (web, mobile) ; copie à la duplication de boutique. |
| Alcool | Code de la santé publique L3342-1 | Champ `containsAlcohol` ; case d'attestation d'âge au paiement (web, mobile) ; refus serveur `AGE_CONFIRMATION_REQUIRED`. |
| Signalement de contenu, point de contact | DSA 2022/2065 art. 11, 12, 16, 17 | Procédure et point de contact dans les mentions légales. |
| Déclaration des revenus | DAC7 (UE) 2021/514 | Clauses de collecte dans les conditions commerçants et livreurs. |
| Accessibilité | Directive (UE) 2019/882 | Page `/accessibilite` (état « partiellement conforme »). |

## Reste à faire — hors code

| # | Action | Responsable | Date | Preuve |
|---|---|---|---|---|
| 1 | Renseigner les mentions légales (raison sociale, RCS, TVA, hébergeur, directeur de publication, médiateur de la consommation) depuis l'espace superowner, puis publier | | | |
| 2 | Migration réelle du chiffrement, `privacy:check`, preuve de chiffrement disque/WAL, sauvegardes hors site testées | | | |
| 3 | Test ClamAV réel (fichier EICAR, arrêt du moteur) | | | |
| 4 | Rôle PostgreSQL d'exécution distinct du rôle de migration ; MFA administrateur | | | |
| 5 | Registre des traitements, AIPD (géolocalisation, suivi livreur), clauses art. 28, DPO désigné | | | |
| 6 | Valider ou arrêter la collecte casier / médecine / associés (art. 9 et 10 RGPD) | | | |
| 7 | Déclaration DAC7 : procédure annuelle auprès de l'administration fiscale | | | |
| 8 | Audit d'accessibilité RGAA / WCAG 2.1 AA, puis mise à jour de `/accessibilite` | | | |
| 9 | Facturation électronique B2B (factures plateforme → commerçants) | | | |
| 10 | Fiches de stores : confidentialité, suppression de compte, déclaration de collecte | | | |

## Contrat d'API modifié (additif, non cassant)

| Route | Changement |
|---|---|
| `POST /api/products`, `PUT /api/products/:id` (marchand, rôle catalogue) | Champs optionnels `allergens` (liste parmi les 14 codes UE, doublons écartés ; liste vide = « aucun ») et `containsAlcohol`. Envoyer `allergens` (même vide) marque `allergensDeclared = true`. |
| `GET /api/client/stores/:id`, `/menu`, catalogue public | Renvoient `allergens`, `allergensDeclared`, `containsAlcohol`. |
| `POST /api/orders` (public / connecté) | Champ optionnel `ageMinimumConfirme`. Si un article contient de l'alcool et que le champ n'est pas `true` : 400 `AGE_CONFIRMATION_REQUIRED`. Aucun produit n'est marqué alcool tant qu'un commerçant ne le coche pas : les anciennes applications continuent de fonctionner pour tout le reste. |

Consommateurs mis à jour : site web (formulaire produit commerçant, vitrine, tunnel de commande), app mobile commerçant (fiche produit), app mobile client (vitrine, panier, paiement). Les apps mobiles déjà publiées sans l'attestation recevront l'erreur 400 uniquement pour un panier contenant de l'alcool.

## Dépendances

- Frontend : Next.js 16.3.6 → 16.4.0 (correctifs d'empoisonnement de cache SSG/ISR, SSRF image, fuites d'informations — pertinents en auto-hébergement). Il reste des alertes sur la chaîne Tailwind (`braces`, `micromatch`, `fast-glob`) : outils de build, non exécutés en production.
- Backend : alertes restantes (`prisma`, `mysql2`, `deepmerge-ts`) uniquement via la CLI Prisma. Le correctif proposé rétrograderait Prisma (6.19) et n'est pas appliqué ; à traiter lors d'une montée de version Prisma planifiée.

## Reste à faire — code

- Contrôle effectif de la pièce d'identité à la remise (preuve de remise du livreur) pour les commandes contenant de l'alcool.
- Reprise d'un ancien panier enregistré sur mobile (« Commander à nouveau ») : l'attestation est demandée par le serveur ; l'écran n'affiche la case qu'après un nouvel ajout depuis la carte.

## Acceptation des conditions de commande

La case « J'ai lu et j'accepte les CGV… » n'est plus redemandée tant que les versions en vigueur de `cgv` et `confidentialite` n'ont pas changé.

- `GET /api/pages-legales/acceptation/commande` (jeton facultatif) → `{ aJour, versions }`. `aJour` est vrai si le compte connecté a une preuve (`AcceptationConditions`) couvrant les versions actuelles.
- `POST /api/orders` : `conditionsAcceptees` devient facultatif ; sans `true`, le serveur exige `aJour` (sinon 400 `CONDITIONS_REQUIRED`). La preuve de chaque commande est rattachée au compte (`userId`).
- Republier une page légale (nouveau numéro de version) fait réapparaître la case pour tous.
- Visiteur sans compte (site) : le navigateur retient la version acceptée ; la preuve par commande reste enregistrée à l'envoi.
