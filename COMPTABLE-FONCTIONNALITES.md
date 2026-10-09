# ZupEat — Espace comptable : fonctionnalités attendues

Document de travail pour le comptable de la plateforme (et pour l'équipe qui
construira son espace). Il dit **qui il est**, **d'où viennent les chiffres**,
**ce qui existe déjà dans le code** et **ce qui reste à construire**, par
priorité.

Légende : ✅ existe · 🟡 existe en partie · ❌ à construire

---

## 1. Le contexte en une page

ZupEat encaisse **pour le compte des commerçants** : le client paie par Stripe,
l'argent arrive chez la plateforme, qui le redistribue.

```
Client ──carte──▶ Stripe ──▶ compte de la plateforme
                                   │
        chaque lundi (arrêté) ─────┤
                                   ├──▶ commerçants : articles − remises − commission − frais
                                   └──▶ livreurs    : gain de course + pourboires
```

Ce que la plateforme **gagne** : la commission sur les ventes (par formule
d'abonnement : 8 / 5 / 3 %), les frais de service (0,25 € par défaut, jamais à
la charge du commerçant), le prix de l'abonnement.

Ce qui **n'est pas** à elle : les articles (au commerçant), la livraison quand
elle est faite par un livreur ZupEat (au livreur), les pourboires (100 % au
livreur), la TVA collectée par les commerçants.

Pays : Belgique par défaut, France aussi. Devise : EUR.

### Qui est le comptable dans l'outil ?

Le panneau `/superowner` gère déjà des **rôles par section** (lecture ou
modification), dont un rôle « Facturation » qui est le seul à recevoir les
chiffres financiers. Le comptable est donc un **rôle plateforme** :

| Droit | Accès |
|---|---|
| Facturation, versements, exports | Lecture (écriture réservée à la personne qui verse) |
| Dossier commerçant / livreur | Lecture des identités de facturation, TVA, IBAN masqué |
| Commandes | Lecture seule, sans données de livraison inutiles |
| Modifier une commande, un prix, une commission | **Non** |

Recommandation : un rôle « Comptable » dédié, en **lecture seule** partout, plus
« modifier » sur les seuls exports, clôtures et notes de crédit.

---

## 2. Les chiffres et leur source

Tout ce qui touche à l'argent est **figé sur la commande** au moment où elle est
passée : changer la formule d'un commerçant ne réécrit pas l'historique.

| Donnée | Champ (`Order`) | Note |
|---|---|---|
| Total payé par le client | `totalAmount` | Hors pourboire |
| TVA comprise dans le prix | `taxAmount`, `taxRate` | Calculée au serveur, prix TTC |
| Frais de livraison | `feesAmount` | Au livreur ZupEat, ou au commerçant s'il livre lui-même (`deliveryMode = OWN`) |
| Frais de service | `serviceFeeAmount` | Toujours à la plateforme |
| Remise (code promo) | `discountAmount` | Accordée par le commerçant |
| Commission | `commissionPercent`, `commissionAmount`, `tierAtOrder` | `commissionWaived` = promo « zéro commission » |
| Pourboire | `tipAmount` | Hors chiffre d'affaires et hors assiette de commission |
| Paiement | `Payment` (`stripePaymentIntentId`, `paidAt`, `refundedAmount`, `stripeRefundId`) | Une commande sans `paymentId` = payée sur place |
| Facture client | `Invoice` (numéro `FAC-AAAA-n` par boutique et par année, TVA ventilée par taux) | Figée à l'émission |

**Trois flux à ne jamais mélanger** :
1. **Ventes du commerçant** (articles TTC − remise) : ce n'est pas un produit de la plateforme.
2. **Produits de la plateforme** : commission + frais de service + abonnements.
3. **Flux de tiers** : livraison (livreur), pourboire (livreur), TVA (État).

---

## 3. Ce qui existe déjà

| Besoin | État | Où |
|---|---|---|
| Rôle « Facturation » qui restreint les chiffres financiers | ✅ | `permissions-plateforme.service.ts` |
| Facture client numérotée, TVA par taux, mentions de l'émetteur | ✅ | modèles `Invoice`, `InvoiceSeq` |
| Commission figée par commande, historique mensuel | ✅ | `Order.commission*`, `CommissionHistory` |
| Relevé de reversement hebdomadaire commerçant, ligne par ligne (codes 100, 110, 120, 200, 230, 240, 300) | ✅ | `MerchantPayout`, `utils/reversement.ts` |
| Report d'un solde négatif sur le relevé suivant | ✅ | `MerchantPayout.status = CARRIED` |
| Relevé de versement livreur (gains + pourboires après livraison) | ✅ | `CourierPayout`, `CourierTip` |
| Fichier SEPA `pain.001.001.03`, IBAN/montants figés et empreinte conservée | Développé ; voir preuves A04 | `GET /versements/lots/:id/sepa.xml`, `/superowner/zupeat/versements` |
| Confirmer un lot avec référence ; annuler un relevé libre non versé | Développé ; voir preuves A04 | `POST /versements/lots/:id/confirmer`, `/payouts/:id/cancel` |
| Exclusion entre paiement, annulation et rattachement au lot ; gains payés conservés | Développé ; validation PostgreSQL dans le registre | [Guide et rapprochement A04](docs/VERSEMENTS-CONCURRENCE.md), [preuves](docs/preuves-a04-2026-10-09.md) |
| Remboursement Stripe (automatique au refus, manuel par la plateforme) | ✅ | `POST /orders/:id/refund` |
| Facturation mensuelle de la commission (commandes d'avant `PAYOUTS_START_DATE`) | 🟡 | `/superowner/billing` |
| Rapports financiers 12 mois | 🟡 | `/superowner/financial-reports` : à vérifier qu'il utilise la commission figée et non le taux global de la config |
| Export CSV des ventes d'une boutique | 🟡 | `GET /reports/export/:type` — commerçant seulement, pas de vue plateforme |
| Journal des actions administratives | ✅ | `SystemAuditLog` |
| Identité de facturation, TVA, IBAN du commerçant (IBAN jamais réaffiché en entier) | ✅ | profil commerçant |

---

## 4. Fonctionnalités à construire

### Priorité 1 — Sans elles, pas de clôture comptable

**4.1 Journal des ventes exportable (toutes boutiques)**
- Une ligne par commande livrée ou remboursée : date, n° de commande, n° de
  facture, commerçant, boutique, mode de paiement (Stripe / sur place),
  HT, TVA par taux, TTC, livraison, frais de service, remise, commission,
  pourboire, statut, montant remboursé.
- Filtres : période, commerçant, boutique, statut, moyen de paiement.
- Formats : **CSV** (séparateur `;`, décimale `,`, UTF-8 avec BOM pour Excel) et **XLSX**.
- Les totaux affichés à l'écran doivent égaler le fichier exporté.

**4.2 Tableau de bord de TVA**
- TVA **collectée** par taux (Belgique : 6 % / 12 % / 21 % ; France : 5,5 % /
  10 % / 20 %), par période et par commerçant.
- TVA sur les **produits de la plateforme** (commission, frais de service,
  abonnements) : c'est celle que la plateforme doit elle-même déclarer.
- TVA sur remboursements et notes de crédit, en négatif.
- Sortie prête pour la déclaration périodique (grilles belges / CA3 française).
- ⚠️ Question à trancher avec le comptable : la plateforme est-elle
  **mandataire** (elle encaisse pour le commerçant, la TVA des articles reste
  chez lui) ou **commissionnaire** (elle est réputée vendre elle-même) ?
  Toute l'écriture comptable en dépend.

**4.3 Facture de commission aux commerçants**
- Aujourd'hui, depuis les reversements hebdomadaires, la commission est
  **retenue** sur le relevé mais aucune facture n'est émise (la facturation
  mensuelle ne couvre que les commandes d'avant `PAYOUTS_START_DATE`).
- Il faut une **facture mensuelle** (ou l'équivalent légal par auto-facturation)
  au nom de la plateforme, avec : numéro séquentiel sans trou, période, base,
  taux, commission HT, TVA, TTC, et le détail par commande en annexe.
- Numérotation propre à la plateforme, distincte des `FAC-…` des boutiques.
- Une fois émise, une facture n'est **jamais modifiée** : on la corrige par une
  note de crédit.

**4.4 Notes de crédit**
- Remboursement total ou partiel → note de crédit liée à la facture d'origine,
  numérotée, avec TVA inversée.
- Aujourd'hui `Payment.refundedAmount` existe mais **aucun document** ne
  documente le remboursement pour le commerçant.

**4.5 Rapprochement bancaire et Stripe**
- Écran « Stripe » : encaissements, remboursements, **frais Stripe**,
  virements Stripe → banque, par jour.
- Le modèle `Payment` ne garde pas les **frais Stripe** ni l'identifiant du
  virement (payout) : à ajouter, sinon impossible de rapprocher le solde.
- Import d'un relevé bancaire (CODA en Belgique, CSV/OFX en France) et
  pointage automatique avec : virements Stripe reçus, virements sortants du
  fichier SEPA (par référence), frais bancaires.
- État « à pointer » / « pointé » / « écart » avec le montant de l'écart.

**4.6 Clôture de période**
- Verrouiller un mois : plus aucune facture, note de crédit ni relevé ne peut
  être créé ou modifié dedans (les rectifications partent sur la période
  ouverte suivante).
- Journal de qui a clôturé, quand, et possibilité de rouvrir avec motif
  (tracé dans `SystemAuditLog`).

### Priorité 2 — Pour une compta propre et rapide

**4.7 Export vers le logiciel comptable**
Format à choisir avec le comptable, à faire dans un seul lot :
- France : **FEC** (obligatoire en cas de contrôle), 18 colonnes.
- Belgique : import **Winbooks / Exact / BOB / Yuki** (CSV ou XML) ; **UBL / Peppol** pour les factures (obligatoire en B2B belge depuis 2026).
- Écritures générées automatiquement (voir §6), avec journal de ventes, banque et opérations diverses.
- Plan comptable **paramétrable** (comptes de produits, TVA, tiers clients/fournisseurs, banque, Stripe).

**4.8 Grand livre des tiers**
- Une fiche par commerçant et par livreur : ce qui est dû, arrêté, versé, en
  report, avec les pièces (relevés, factures, notes de crédit).
- **Balance âgée** : soldes négatifs reportés, versements en attente depuis plus de N jours.
- Solde global « dû aux tiers » = ce que la plateforme détient qui ne lui appartient pas (à rapprocher du solde Stripe + banque).

**4.9 Vue détaillée d'un relevé de versement**
- Aujourd'hui lisible ligne par ligne ; ajouter : **export PDF** du relevé (à envoyer au commerçant ou au livreur), lien vers les commandes concernées, et écriture comptable correspondante.

**4.10 Vue « Frais de service, pourboires, livraisons »**
- Trois rubriques séparées, pour montrer à tout moment que ce qui n'est pas à la plateforme n'entre pas dans son chiffre d'affaires.
- Pourboires : total encaissé vs total versé aux livreurs (doit être à zéro à la clôture, aux délais de paiement près).

**4.11 Suivi des espèces**
- Commandes payées sur place : la plateforme n'a pas l'argent mais le commerçant lui doit commission et frais de service (lignes 200 / 230 / 240 du relevé).
- Écran des **créances** sur commerçants (montants retenus sur relevés futurs, soldes négatifs qui traînent).

**4.12 Pièces justificatives**
- Pour chaque écriture : lien vers la facture, le relevé, le justificatif de remboursement Stripe, le fichier SEPA du lot.
- Téléversement de pièces annexes (facture Stripe mensuelle, relevé bancaire PDF).

### Priorité 3 — Confort et contrôle

**4.13 Alertes comptables**
- Commande payée sans facture · facture sans commande livrée · remboursement Stripe sans note de crédit · relevé arrêté mais jamais versé après 10 jours · IBAN invalide ou manquant · commerçant sans numéro de TVA · écart de rapprochement.

**4.14 Rapports de pilotage**
- Marge nette plateforme = commission + frais de service + abonnements − frais Stripe − remboursements.
- Évolution mensuelle, par formule, par commerçant, par pays.
- Taux de remboursement, taux de commande annulée.

**4.15 Journal d'audit dédié**
- Qui a exporté quoi, quand ; qui a clôturé ; qui a marqué un lot versé. Filtrable par utilisateur et par période.

**4.16 Notifications**
- Courriel récapitulatif mensuel au comptable : chiffres du mois, anomalies, liens de téléchargement.

---

## 5. Règles de gestion que le comptable doit connaître

1. **Une commande n'est « payée » que sur la parole de Stripe** (webhook signé).
2. **Le montant du reversement est figé** à la création du relevé : il ne se recalcule pas si une commande change plus tard.
3. **Un relevé négatif est reporté** (`CARRIED`) sur le suivant, ligne code 300.
4. **La commission est calculée sur les articles après remise** ; elle ne l'est pas sur la livraison, les frais de service ni le pourboire.
5. **Le pourboire** est à part : il n'entre ni dans le total de la commande ni dans le chiffre d'affaires. Celui laissé après livraison est payé séparément (`CourierTip`) et part avec le relevé suivant du livreur.
6. **Un livreur qui supprime son compte** est payé une dernière fois avant la clôture (`suppressionDemandeeLe`).
7. **Un commerçant fermé** voit ses données archivées puis effacées à 60 jours : les pièces comptables (factures, relevés) doivent être **conservées** au-delà — durée légale : 7 ans en Belgique, 10 ans en France pour les pièces comptables. À vérifier que la purge n'efface pas `Invoice` ni `MerchantPayout` (les relations `onDelete: Restrict` sur `Invoice` protègent déjà les factures).
8. **La suppression d'un compte client** conserve les commandes sans lien avec la personne, pour la comptabilité.

---

## 6. Écritures comptables types (à valider avec le comptable)

Hypothèse : la plateforme est **mandataire** (cf. 4.2). Comptes à titre
d'exemple, à remplacer par le plan réel.

| Événement | Débit | Crédit |
|---|---|---|
| Encaissement carte d'une commande de 30 € (dont 0,25 € de service, 3 € de livraison) | Stripe à recevoir 30,00 | Dettes commerçant (articles) 26,75 · Dettes livreur (livraison) 3,00 · Produit frais de service 0,25 |
| Commission (8 % de 26,75) | Dettes commerçant 2,14 | Produit commission HT 1,77 · TVA collectée 0,37 |
| Frais Stripe | Frais bancaires | Stripe à recevoir |
| Virement Stripe → banque | Banque | Stripe à recevoir |
| Arrêté du lundi | — (pas d'écriture, simple pointage) | — |
| Virement SEPA au commerçant | Dettes commerçant | Banque |
| Virement SEPA au livreur | Dettes livreur | Banque |
| Remboursement client | Dettes commerçant + produits (proportionnel) | Stripe à recevoir |
| Pourboire | Stripe à recevoir | Dettes livreur |

*(Chiffres purement illustratifs.)*

---

## 7. Critères d'acceptation

Une fonctionnalité est terminée quand :

- Le total affiché à l'écran = le total du fichier exporté = la somme des commandes source, au centime.
- Un mois clôturé donne **les mêmes chiffres** quand on le rouvre six mois plus tard.
- Toute écriture est **traçable** jusqu'à la commande, la facture ou le relevé qui l'a produite.
- Un rôle sans la section « Facturation » n'obtient **aucun** montant, par l'API comme par l'écran.
- Les suites de vérification existantes (`verif:versements`, tests des reversements et du SEPA) restent vertes, et chaque nouvelle règle de calcul a son test.

---

## 8. Questions à poser au comptable avant de coder

1. Mandataire ou commissionnaire pour la TVA sur les ventes ?
2. Belgique, France, ou les deux dès le départ (plan comptable, déclaration TVA, format d'export) ?
3. Quel logiciel comptable : Winbooks, Exact, BOB, Yuki, Odoo, autre ?
4. La commission est-elle facturée **par la plateforme** ou en **auto-facturation** au nom du commerçant ?
5. Les livreurs sont-ils **indépendants** (facture ou auto-facture de leurs courses) ou salariés / sous statut particulier ?
6. Fréquence de clôture : mensuelle, trimestrielle ?
7. Faut-il conserver les factures en PDF archivé (horodaté) en plus de la base ?
8. Qui a le droit de rouvrir une période clôturée ?

---

## 9. Ordre de construction proposé

1. **Rôle « Comptable »** en lecture seule + audit des exports (§1, 4.15).
2. **Journal des ventes** CSV/XLSX plateforme (4.1) — c'est le socle de tout le reste.
3. **Frais Stripe et virements Stripe** dans `Payment` + écran Stripe (4.5, première moitié).
4. **Tableau de TVA** (4.2) et **facture de commission** (4.3), après réponse aux questions 1 et 4.
5. **Notes de crédit** (4.4).
6. **Clôture de période** (4.6).
7. **Export logiciel comptable** (4.7) une fois le logiciel choisi.
8. Grand livre des tiers, alertes, rapports de pilotage (4.8 à 4.14).
