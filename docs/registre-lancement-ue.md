# Registre de lancement — conformité UE

Registre spécialisé des actions conformité. Le statut des lots de livraison
techniques (SHA, tests, intégration, déploiement, exploitation) est tenu dans
[docs/etat-projet.md](etat-projet.md) ; une entrée vide ci-dessous ne constitue
pas une preuve.

Mis à jour le 12 octobre 2026. Chaque ligne doit avoir un responsable, une date et une preuve avant l'ouverture publique. Aucune ligne n'est cochée par le code : seuls l'exploitant, le DPO ou un conseil peuvent les clore. Historique antérieur conservé.

## Périmètre de recette A16

La [décision A16](RECETTE-PILOTE-A16-2026-10-12.md) porte sur un pilote fermé
ZupEat. **ZupDrive est exclu** et ne doit pas être inclus dans les résultats de
recette. Au commit intégré `6439e36a51c6262b4781937c217a4063df6a90db`, aucune
preuve d'environnement actif, de contrôle juridique en pages publiées, de
facture opérateur ou de validation réglementaire n'est fournie. Le statut du
pilote est bloqué en attente des contrôles et responsables listés dans le
compte rendu ; cette entrée ne clôt aucune obligation du registre.

## Livré dans le dépôt

| Sujet | Base | Ce qui est fait |
|---|---|---|
| Allergènes | Règlement (UE) 1169/2011 | Champs sur `Product` ; saisie obligatoire côté commerçant (web, mobile) ; affichage au client avant commande (web, mobile) ; copie à la duplication de boutique. |
| Alcool | Code de la santé publique L3342-1 | Champ `containsAlcohol` ; case d'attestation d'âge au paiement (web, mobile) ; refus serveur `AGE_CONFIRMATION_REQUIRED`. |
| Signalement de contenu, point de contact | DSA 2022/2065 art. 11, 12, 16, 17 | Procédure et point de contact dans les mentions légales. |
| Déclaration des revenus | DAC7 (UE) 2021/514 | Clauses de collecte dans les conditions commerçants et livreurs. |
| Accessibilité | Directive (UE) 2019/882 | Page `/accessibilite` (état « partiellement conforme »). |
| Facturation structurée A07 | Belgique : obligation B2B structurée depuis le 01.01.2026, exceptions à valider | UBL généré en code ; transport Access Point et réception non intégrés ; aucune conformité réelle affirmée. [Guide A07](FACTURATION-STRUCTUREE-A07.md). |

## Reste à faire — hors code

| # | Action | Responsable | Date | Preuve |
|---|---|---|---|---|
| 1 | Identifier l'exploitant et sa forme juridique, puis renseigner les mentions légales belges (nom, adresse, BCE, TVA si applicable, e-mail, téléphone, hébergeur et médiation compétente) depuis l'espace superowner ; faire valider et publier avant les commandes publiques | | | |
| 2 | Migration réelle du chiffrement, `privacy:check`, preuve de chiffrement disque/WAL, sauvegardes hors site testées | | | |
| 3 | Test ClamAV réel (fichier EICAR, arrêt du moteur) | | | |
| 4 | Rôle PostgreSQL d'exécution distinct du rôle de migration ; MFA administrateur | | | |
| 5 | Registre des traitements, AIPD (géolocalisation, suivi livreur), clauses art. 28, DPO désigné | | | |
| 6 | Valider ou arrêter la collecte casier / médecine / associés (art. 9 et 10 RGPD) | | | |
| 7 | Déclaration DAC7 : procédure annuelle auprès de l'administration fiscale | | | |
| 8 | Audit d'accessibilité RGAA / WCAG 2.1 AA, puis mise à jour de `/accessibilite` | | | |
| 9 | Facturation électronique B2B (factures plateforme → commerçants) : confirmer opérateur/pays/statut TVA, choisir et intégrer Access Point, tester en sandbox et conserver preuves | Exploitant + comptable | 12 octobre 2026 : ouvert | [Guide et validations A07](FACTURATION-STRUCTUREE-A07.md) ; aucune preuve de transport réel |
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
