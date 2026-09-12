# LISTE DE CLARIFICATIONS & AMÉLIORATIONS
## Cahier des charges SaaS Digitalisation Commerces Locaux

---

## 1. MULTI-STORE & INVENTAIRE

### ❓ Question 1.1 : Modèle d'inventaire
**Situation actuelle :** Flou sur comment gérer les stocks multi-store.

**Options :**

**Option A) Inventaire global par produit**
```
Produit "Margherita"
├── Stock global : 100 unités
├── Magasin Namur : 40
├── Magasin Charleroi : 60
```
→ Un produit existe une fois, le stock est distribué.

**Option B) Produit-store unique**
```
Produit "Margherita" @ Namur (40 unités)
Produit "Margherita" @ Charleroi (60 unités)
```
→ Chaque magasin a sa propre référence.

**Option C) Inventaire centralisé avec sync partielle**
```
Stock maestro = 100 unités
Allocation Namur = 40, Charleroi = 60
Sync en temps réel
```

**À clarifier :**
- Quel modèle préfères-tu ?
- Les produits sont-ils identiques entre stores ou peuvent-ils varier ?
- Un produit peut-il être "out of stock" dans une région mais disponible dans une autre ?

---

### ❓ Question 1.2 : Commandes cross-store
**Situation actuelle :** Non spécifié.

**Scénario :**
Un client commande :
- Pizza Namur
- Burger Charleroi
- Livraison à Namur

**Réalité :**
- Deux magasins différents
- Deux préparations
- Une seule livraison
- Deux paiements ou un seul ?

**À clarifier :**
- Les clients peuvent-ils commander à PLUSIEURS stores dans la même commande ?
  - OUI → complexité : split order, deux préparations, deux paiements, logistique
  - NON → commandes par store uniquement
- Par défaut, commencer par **NON** (une commande = un store) ?

---

### ❓ Question 1.3 : Livraison inter-store
**Situation actuelle :** Non spécifié.

**Scénario :**
Client à Namur commande une pizza à Charleroi (20 km).

**À clarifier :**
- Un magasin ne livre-t-il que dans son rayon ?
  - OUI (recommandé MVP) → périmètre de livraison par store
  - NON → complexité de livraison inter-store, tarif spécifique
- Les zones de livraison sont-elles définies par store ou globales par organisation ?

**Recommandation :** Chaque store a ses propres DeliveryZone (MVP).

---

## 2. IMPORT DE DESIGN EXISTANT

### ❓ Question 2.1 : Niveau de précision attendu
**Situation actuelle :** Très ambitieux, peu défini.

**À clarifier :**
- L'utilisateur s'attend-il à une **copie pixel-perfect** du site existant ?
  - Attente réaliste : ~70% de fidélité visuelle
- Ou à une **reproduction de l'identité** (couleurs, typographies, style) ?
  - Plus réaliste : ~90% atteignable

**Exemple concret :**
Site existant = design custom en HTML5/CSS/JS.
Boutique générée = design dans le theme engine du SaaS.
Résultat : ressemblant, mais pas identique (différentes technologies).

**À clarifier :**
- Quel est le **taux de satisfaction acceptable** ?
- Prévoir une **phase manuelle** où l'utilisateur peaufine ?

---

### ❓ Question 2.2 : Sources d'import acceptées
**Situation actuelle :** "Analyser un site web existant"

**À clarifier :**
- Import depuis URL web (scraping) ?
  - Faisable mais complexe (JS rendering, CORS, légal ?)
- Import d'une image (screenshot) ?
  - Faisable avec IA/ML
- Import manuel d'assets (logo, images, palette) ?
  - Très fiable, moins automatisé
- Import de fichier (CSS, HTML exporté) ?
  - Faisable si format défini

**Recommandation MVP :**
1. Importer manuellement des assets (images, logo)
2. Saisir manuellement ou picker les couleurs
3. Choisir les typographies parmi une liste
4. V2+ : ajouter l'analyse automatique

---

### ❓ Question 2.3 : Adaptation du CSS existant
**Situation actuelle :** "Analyser, nettoyer, scoper, transformer"

**À clarifier :**
- Veux-tu vraiment **appliquer le CSS existant** à la boutique SaaS ?
  - Risques : conflits, surcharges, incompatibilités
  - Bénéfices : fidélité visuelle

**Recommandation :**
- ❌ Ne **pas** appliquer aveuglément le CSS externe
- ✅ **Extraire** les valeurs (couleurs, espacements, border-radius)
- ✅ **Recréer** les styles avec les Design Tokens du SaaS

Exemple :
```css
/* CSS existant */
button { background: red; padding: 10px 20px; }

/* Extraction */
primary-color: red
button-padding: 10px 20px

/* Appliqué au SaaS */
--primary: red;
--button-padding: 10px 20px;
```

---

## 3. DEVELOPER MODE & SANDBOXING

### ❓ Question 3.1 : Quels fichiers modifier en Developer Mode ?
**Situation actuelle :** "CSS personnalisé, JS contrôlé, HTML en emplacements autorisés"

**À clarifier précisément :**

| Type | MVP | V2+ | Raison |
|------|-----|-----|--------|
| CSS personnalisé | ✅ | ✅ | Safe si scopé |
| Variables CSS | ✅ | ✅ | Safe |
| JS personnalisé | ❓ | ✅ | À décider : exécution côté client ? |
| HTML personnalisé | ❌ | ❓ | Risque XSS |
| Assets (images) | ✅ | ✅ | Safe |
| Composants React | ❌ | ❓ | Complexe, sécurité |
| API calls | ❓ | ✅ | À limiter |

**À clarifier :**
- Le JS personnalisé s'exécute **côté client** (navigateur) ou **côté serveur** ?
  - Côté client = safe (contexte du navigateur), mais limité
  - Côté serveur = risqué (accès backend)
- Les composants React peuvent-ils être personnalisés ?
  - Très complexe, probablement non pour MVP

**Recommandation MVP :**
- ✅ CSS (scopé avec namespace)
- ✅ Variables CSS
- ✅ Assets (images, fonts)
- ✅ HTML dans slots définis (avec sanitization)
- ✅ JavaScript côté client (avec restrictions CSP)
- ❌ Accès à la DB
- ❌ Appels API non autorisés
- ❌ Modification de composants core

---

### ❓ Question 3.2 : Authentification du Developer Mode
**Situation actuelle :** Non spécifié.

**Scénario :**
Une agence travaille sur le thème du client.

**À clarifier :**
- L'agence a-t-elle un **rôle spécifique** (THEME_DEVELOPER) ?
- **Authentification unique** (JWT) ou **invitations temporaires** ?
- **Permissions** : peut modifier le thème mais pas les commandes/paiements ?
- **Accès au code source** du SaaS ou juste au thème ?

**Recommandation :**
```
Rôle: THEME_DEVELOPER
Permissions:
  - theme.read
  - theme.write
  - theme.preview
  - theme.publish
Restrictions:
  - NO orders.read
  - NO customers.read
  - NO payments.read
```

---

## 4. PAIEMENTS & STRIPE

### ❓ Question 4.1 : Stripe, seul provider ?
**Situation actuelle :** "Compatible avec Stripe"

**À clarifier :**
- Stripe est-il le **seul** payment processor ?
  - Oui pour MVP ?
  - Non → ajouter Paypal, Adyen, locaux ?

**Contexte Belgique :**
- Stripe fonctionne mais n'a pas tous les opérateurs belges
- Alternatives : Adyen, Worldline, Ingenico

**À clarifier :**
- **Commerçants belges acceptent-ils Stripe ?**
  - Oui → MVP Stripe only
  - Non → intégrer alternatives
- Prévoir d'autres providers en V2 ou dès MVP ?

**Recommandation MVP :**
- ✅ Stripe (carte bancaire, Apple Pay, Google Pay)
- Ajouter Paypal/Adyen/locaux en V2 si demande client

---

### ❓ Question 4.2 : Gestion des commissions
**Situation actuelle :** Mentionné ("Commission configurable") mais pas détaillé.

**À clarifier :**
- **Modèle économique** :
  - FREE plan = 3% + frais Stripe (2.9% + €0.30) ?
  - PREMIUM = 2% + frais Stripe ?
  - PRO = 1% + frais Stripe ?
- **Qui paie les frais Stripe** ?
  - Commerçant paie tout ?
  - Platform absorbe une partie ?
- **Frais de livraison** :
  - Platform prend commission sur livraison ?
  - Ou commerçant garde 100% ?

**À clarifier :**
- Structure tarifaire exacte ?
- Partage des frais de transaction ?

---

### ❓ Question 4.3 : Payout & trésorerie
**Situation actuelle :** Mentionné ("Payout") mais pas détaillé.

**À clarifier :**
- **Quand** le commerçant reçoit l'argent ?
  - J+1 après la commande ?
  - J+3 (cycle bancaire Stripe) ?
  - Batch daily/weekly/monthly ?
- **Quel compte ?**
  - Virement bancaire ?
  - Portefeuille virtuel ?
  - Dashboard platform ?
- **Frais** ?
  - SEPA gratuit ?
  - Frais par payout ?

**Recommandation MVP :**
- Payout automatique J+1 ou J+3 (via Stripe Connect)
- Virement SEPA gratuit
- Visible dans dashboard

---

## 5. TERMINAL ANDROID & IMPRIMANTE

### ❓ Question 5.1 : Architecture du terminal
**Situation actuelle :** "Connexion, réception, notification, accepter, refuser, imprimer"

**À clarifier :**
- **Où tourne le code du terminal** ?
  - Application Android propriétaire (à développer)
  - WebView (application web dans une app Android)
  - Progressive Web App (PWA)
- **Connectivité** :
  - WiFi uniquement ?
  - 4G aussi ?
  - Offline-first (sync quand connecté) ?
- **Authentication** :
  - Login/password sur le terminal ?
  - QR code unique par magasin/terminal ?
  - JWT persisté ?

**À clarifier :**
- Commencer par simple (WebView + WiFi) ou robuste (app native + offline) ?

**Recommandation MVP :**
- WebView Android simple (moins coûteux)
- WiFi requis (plus simple)
- Auth via QR code unique par terminal
- Sync en temps réel

---

### ❓ Question 5.2 : Imprimante thermique
**Situation actuelle :** "80 mm, Android Terminal → Printer"

**À clarifier :**
- **Type d'imprimante** :
  - Bluetooth (Zebra, Star, Epson) ?
  - USB direct ?
  - Network (Ethernet) ?
- **Format du ticket** :
  - Recette simple (texte) ?
  - Barcode ?
  - Logo du commerçant ?
- **Intégration logicielle** :
  - Librairie ESC/POS (standard) ?
  - Driver propriétaire ?
- **Coût** :
  - Imprimante fournie ou commerçant achète ?

**Recommandation MVP :**
- ✅ Support Bluetooth (Zebra/Star/Epson)
- ✅ Format ESC/POS standard
- ✅ Ticket simple : produits + total + horaire
- Logo commerçant optionnel
- V2 : améliorations format

---

### ❓ Question 5.3 : Synchronisation en cas de perte de connexion
**Situation actuelle :** Non spécifié.

**Scénario :**
Terminal perd WiFi pendant une commande.

**À clarifier :**
- Le terminal :
  - Refuse la commande ?
  - La met en queue locale ?
  - La synchronise quand reconnecté ?
- **Ordre des commandes** :
  - Respecté même si offline ?
  - Timestamp local ou serveur ?

**Recommandation MVP :**
- Queue locale
- Sync quand reconnecté
- Timestamp serveur (source de vérité)

---

## 6. MULTI-STORE & AGENCES

### ❓ Question 6.1 : Agence travaillant pour plusieurs clients
**Situation actuelle :** "THEME_DEVELOPER sans accès orders/customers/payments"

**À clarifier :**
- Une agence peut-elle travailler sur **plusieurs clients** ?
  - Oui → elle voir les boutiques de tous ses clients (avec restriction)
  - Non → une agence = un client
- **Isolation des données** :
  - L'agence voit-elle les orders/stats d'un client ?
  - Ou juste le thème ?
- **Permissions granulaires** :
  - Une agence peut-elle voir la config d'un store (adresse, horaires) ?
  - Une agence peut-elle modifier les produits ?

**À clarifier :**
- Besoin d'un rôle **AGENCY** distinct de **THEME_DEVELOPER** ?

**Recommandation :**
```
Rôle: THEME_DEVELOPER
Peut voir:
  - Theme (lecture/écriture)
  - Store metadata (adresse, horaires)
  - Products (lecture, pour preview)
  - Preview data

NE peut pas voir:
  - Orders
  - Customers
  - Payments
  - Finance
  - Employee list
```

---

### ❓ Question 6.2 : Agence gère plusieurs stores d'une organisation
**Situation actuelle :** Non spécifié.

**Scénario :**
Organisation "Pizza Group" a 10 magasins.
Agence crée un thème global pour tous les 10.

**À clarifier :**
- L'agence crée 1 thème ou 10 thèmes ?
  - 1 thème + 10 déploiements ?
  - 10 thèmes (avec clonage possible) ?
- Peut-elle ensuite appliquer le thème à tous les stores ?
  - Oui → 1 action
  - Non → doit dupliquer 10 fois

**Recommandation :**
- 1 thème global
- Applicable à N stores
- Stores peuvent avoir overrides locaux

---

## 7. DOMAINES PERSONNALISÉS

### ❓ Question 7.1 : Domaine personnalisé obligatoire ou optionnel ?
**Situation actuelle :** "Slug.platform.com puis domaine personnalisé"

**À clarifier :**
- **Domaine par défaut** :
  - slug.plateforme.be (gratuit) ?
  - slug.shop.be ?
  - slug.command.be ?
- **Domaine personnalisé** :
  - Optionnel ou inclus dans certains plans ?
  - Commerçant achète son domaine ailleurs (GoDaddy, Gandi, etc.) ?
  - Platform vend des domaines ?
- **Gestion DNS** :
  - Auto (CNAME) ?
  - Manuel (instructions DNS) ?
  - Platform fournit nameservers ?

**Recommandation MVP :**
- Domaine par défaut : slug.platform.be (gratuit)
- Domaine personnalisé : optionnel (plan PREMIUM/PRO)
- Gestion : CNAME simple (commerçant ajoute DNS)

---

### ❓ Question 7.2 : SSL/HTTPS
**Situation actuelle :** Mentionné ("SSL") mais pas détaillé.

**À clarifier :**
- **Certificats** :
  - Let's Encrypt automatique ?
  - Wildcard *.platform.be ?
  - Certificat personnalisé pour domaines custom ?
- **Coût** :
  - Inclus ou frais supplémentaires ?

**Recommandation MVP :**
- ✅ Let's Encrypt automatique
- ✅ Wildcard pour slug.platform.be
- ✅ Custom domain = certificat wildcard auto

---

## 8. TYPES DE COMMERCES & SECTORS

### ❓ Question 8.1 : Secteurs supportés au MVP
**Situation actuelle :** "Pizzerias, restaurants, snacks..." mais pas priorisé.

**À clarifier :**
- **Commencer par quel secteur ?**
  - Restauration rapide (pizza, burger) = plus simple
  - Restaurant assis = plus complexe (réservations)
  - Boulangerie = plus simple (pas de configuration)
- **MVP strict** :
  - 1 secteur (pizza/fast-food) ?
  - 3 secteurs (pizza, boulangerie, fleuriste) ?
  - Tous (risque de non-focus) ?

**Recommandation MVP :**
```
Phase 1 : Pizzeria/Fast-Food (click & collect + livraison)
Phase 2 : Ajouter Boulangerie (simpler)
Phase 3 : Ajouter autres secteurs
```

---

### ❓ Question 8.2 : Adaptation automatique par secteur
**Situation actuelle :** "Adapter automatiquement : catalogue, options, champs, templates"

**À clarifier :**
- **Quels champs diffèrent** ?
  - Pizza : taille (S/M/L) + garnitures
  - Fleur : couleur + message
  - Boucherie : poids + type de coupe
- **Quels templates** ?
  - Pizza : affichage simple produit
  - Fleur : affichage avec couleur dominante
  - Boucherie : affichage avec image haute résolution
- **Quelles options** ?
  - Pizza : suppléments additionnels
  - Fleur : options supplémentaires (enveloppe, message)

**À clarifier :**
- Hardcoder les secteurs ou système flexible ?

**Recommandation MVP :**
- Hardcoder 2-3 secteurs (plus rapide)
- Système flexible en V2 si plus de secteurs

---

## 9. NOTIFICATIONS

### ❓ Question 9.1 : Canaux de notification
**Situation actuelle :** Non spécifié au-delà du terminal Android.

**À clarifier :**
- **Notifications pour le commerçant** :
  - Push (smartphone) ?
  - Email ?
  - SMS ?
  - In-app (dashboard) ?
  - Terminal Android ?
- **Notifications pour le client** :
  - Email (confirmé, prêt, livré) ?
  - SMS ?
  - Push (si app) ?
  - Tracking en temps réel ?

**Recommandation MVP :**
```
Commerçant:
  - Push Android terminal
  - In-app dashboard
  - Email (optionnel)

Client:
  - Email (confirmation, status)
  - SMS (optionnel)
```

---

### ❓ Question 9.2 : Quand notifier ?
**Situation actuelle :** Non spécifié.

**À clarifier :**
- Événements à notifier :
  - Nouvelle commande ?
  - Commande acceptée/refusée ?
  - Commande prête ?
  - Livreur en route ?
  - Commande livrée ?
  - Paiement reçu ?
  - Refund ?

**Recommandation MVP :**
```
Commerçant:
  - Nouvelle commande ✅
  - Heure de retrait proche ✅
  - Livreur affecté (si livraison) ✅

Client:
  - Confirmation commande ✅
  - Commande prête ✅
  - Livreur en route (si livraison) ✅
```

---

## 10. ANALYTICS & STATISTICS

### ❓ Question 10.1 : Profondeur des analytics
**Situation actuelle :** "Commandes/jour, CA/jour, panier moyen, produits populaires"

**À clarifier :**
- **Métriques MVP** :
  ```
  Commandes (nombre, statut)
  CA (jour, semaine, mois)
  Panier moyen
  Produits populaires
  Clients (nouveau vs retour)
  Heure de pointe
  ```
- **Métriques V2+** :
  ```
  Conversion rate
  Panier abandonné
  Cohortes clients
  Prévisions
  Seasonal trends
  ```

**À clarifier :**
- Quelles métriques ajouter après MVP ?

---

### ❓ Question 10.2 : Granularité temporelle
**Situation actuelle :** Non spécifié.

**À clarifier :**
- Vue par :
  - Jour (MVP) ?
  - Semaine (MVP) ?
  - Mois (MVP) ?
  - Heure (V2) ?
  - Année (V2) ?

**Recommandation MVP :**
- Jour (par défaut)
- Semaine (optionnel)
- Mois (optionnel)

---

## 11. SECTEUR D'ACTIVITÉ

### ❓ Question 11.1 : Configuration d'un secteur
**Situation actuelle :** "Choisir son secteur d'activité" lors de création

**À clarifier :**
- Peut-on **changer** de secteur après création ?
  - Oui → complexe (migration de structure)
  - Non → figé pour MVP
- Peut-on en avoir **plusieurs** (multi-secteur) ?
  - Oui → boulangerie + salon de thé
  - Non → un seul par store

**Recommandation MVP :**
- Secteur figé (pas de changement)
- Un seul secteur par store
- Changement possible en V2

---

## 12. FORMULES D'ABONNEMENT

### ❓ Question 12.1 : Structure tarifaire
**Situation actuelle :**
```
FREE : 0€ + commission
PREMIUM : 29,90€ + commission réduite
PRO : 59,90€ + commission faible
ENTERPRISE : custom
```

**À clarifier :**
- **FREE** :
  - Commission exacte ?
  - Limitations (nombre de produits, stores, commandes) ?
- **PREMIUM/PRO** :
  - Commission exacte ?
  - Différences en features ?
- **ENTERPRISE** :
  - Conditions pour y accéder ?
  - Volume minimum ?

**À clarifier :**
- Éventuellement ajuster les prix pour Belgique ?

---

### ❓ Question 12.2 : Features par plan
**Situation actuelle :** Mentionné ("Commission configurable") mais pas détaillé.

**À clarifier :**

| Feature | FREE | PREMIUM | PRO | ENTERPRISE |
|---------|------|---------|-----|------------|
| Stores | 1 | 3 | Illimité | Illimité |
| Users | 1 | 3 | Illimité | Illimité |
| Domaine custom | ❌ | ✅ | ✅ | ✅ |
| Theme custom | ❌ | ✅ | ✅ | ✅ |
| API access | ❌ | ❌ | ✅ | ✅ |
| Theme Dev Mode | ❌ | ❌ | ✅ | ✅ |
| Support | Email | Email | Chat | Dédié |

**À clarifier :**
- Qui décide des limites ?

---

## 13. AUTHENTIFICATION & SÉCURITÉ

### ❓ Question 13.1 : SSO/OAuth
**Situation actuelle :** Mentionné (NextAuth) mais pas de détails.

**À clarifier :**
- **Authentication MVP** :
  - Email/Password uniquement ?
  - Google/Apple login aussi ?
  - OAuth (GitHub, Microsoft) ?
- **Enterprise** :
  - SAML/OIDC en V2/V3 ?

**Recommandation MVP :**
- Email/Password + Google
- SAML/OIDC en V3 (Enterprise)

---

### ❓ Question 13.2 : 2FA
**Situation actuelle :** Non spécifié.

**À clarifier :**
- 2FA obligatoire ou optionnel ?
  - MVP : optionnel
- Types :
  - SMS (coûteux) ?
  - TOTP (Google Authenticator) ?
  - Email (simple) ?

**Recommandation MVP :**
- Optionnel
- TOTP (gratuit)
- Email (gratuit)

---

### ❓ Question 13.3 : Audit log
**Situation actuelle :** "Tracer les opérations sensibles"

**À clarifier :**
- **Actions à logger** :
  - Création produit ?
  - Modification prix ?
  - Création ordre ?
  - Accès données sensibles ?
  - Changement permission ?
  - Export données ?
- **Rétention** :
  - 1 an ?
  - 7 ans (légal) ?

**Recommandation MVP :**
```
Logger:
  - Theme modifications
  - Store settings changes
  - User access changes
  - Payment-related actions
  - Export data

Rétention: 1 an (MVP) → 7 ans (si légal obligatoire)
```

---

## 14. DONNÉES LÉGALES & GDPR

### ❓ Question 14.1 : Droit à l'oubli
**Situation actuelle :** "Suppression" mentionnée

**À clarifier :**
- Client demande suppression :
  - On supprime tout (commandes, adresses) ?
  - On anonymise les commandes ?
  - On garde pour audit/comptabilité ?
- **Légalement en Belgique/UE** :
  - Obligatoire de garder 7 ans (facturation) ?
  - Anonymiser possible (GDPR) ?

**À clarifier :**
- Quelle stratégie légale ?

---

### ❓ Question 14.2 : Consentement cookies
**Situation actuelle :** Mentionné ("Consentement")

**À clarifier :**
- **Types de cookies** :
  - Session (obligatoire) ?
  - Analytics (Google Analytics ?) ?
  - Marketing (tracking tiers) ?
  - Essentiels (oui) vs optionnels (à consentir)

**Recommandation MVP :**
```
Essentiels:
  - Session (JWT)
  - CSRF
  - Préférences

Optionnels (avec consentement):
  - Google Analytics
  - Hotjar (UX tracking)
```

---

### ❓ Question 14.3 : Données du commerçant
**Situation actuelle :** Non spécifié.

**À clarifier :**
- **Export des données** :
  - Format CSV ?
  - JSON ?
  - PDF ?
- **Quoi exporter** :
  - Produits ?
  - Commandes ?
  - Clients ?
  - Tout ?

**Recommandation MVP :**
- Export possible des commandes (CSV, JSON)
- Autres données en V2+

---

## 15. INFRASTRUCTURE & OPS

### ❓ Question 15.1 : Déploiement
**Situation actuelle :** Non spécifié.

**À clarifier :**
- **Où héberger** ?
  - Vercel (Next.js) ?
  - AWS ?
  - Digital Ocean ?
  - On-premise (si Enterprise) ?
- **Base de données** ?
  - PostgreSQL managé (AWS RDS, Heroku Postgres) ?
  - Self-hosted ?
- **CDN/Assets** ?
  - Cloudinary ?
  - AWS S3 + CloudFront ?
  - Vercel Blob ?

**Recommandation MVP :**
- Frontend : Vercel (simple, gratuit tier)
- Backend : Node.js (serverless ou Docker)
- DB : PostgreSQL managé (AWS RDS ou Heroku)
- Assets : Cloudinary ou S3 (scalable)

---

### ❓ Question 15.2 : Monitoring & Observabilité
**Situation actuelle :** "Error tracking, logging, health checks"

**À clarifier :**
- **Tools** :
  - Sentry (erreurs) ?
  - DataDog (observabilité) ?
  - Splunk (logs) ?
  - Prometheus (metrics) ?
- **Budget** :
  - Gratuit tier possible ?

**Recommandation MVP :**
```
Error tracking: Sentry (gratuit tier)
Logs: console + stockage (simple)
Monitoring: Health checks basiques
Alertes: Slack/email simples
Metrics: Pas de tool premium (trop cher)
```

---

## 16. ROADMAP PRIORISATION

### ❓ Question 16.1 : MVP final
**Situation actuelle :** Bien défini mais à valider.

**À clarifier :**
- MVP doit-il inclure :
  - Terminal Android ? (exclure pour MVP ?)
  - Livraison ? (exclure pour Click & Collect seul ?)
  - Import de design ? (exclure, juste design tokens ?)
  - Multi-store ? (inclure ou exclure pour MVP ?) 
  - Developer Mode ? (exclure pour MVP ?)

**Recommandation MVP super strict :**
```
✅ Auth + Org/Store
✅ Products + Categories
✅ Simple theme (colors/fonts)
✅ Cart + Checkout
✅ Paiement Stripe
✅ Click & Collect
✅ Order management
✅ Dashboard simple
❌ Livraison (V1.1)
❌ Terminal Android (V2)
❌ Import design (V2)
❌ Developer Mode (V3)
❌ Multi-store (V1.5)
```

**À clarifier :**
- Acceptes-tu cette réduction de scope ?

---

### ❓ Question 16.2 : Timeline
**Situation actuelle :** Non spécifié.

**À clarifier :**
- **Durée MVP** :
  - 3 mois ?
  - 6 mois ?
  - 12 mois ?
- **Équipe** :
  - Combien de développeurs ?
  - Full-time ou part-time ?

---

## 17. GÉNÉRAL & VISION

### ❓ Question 17.1 : Public cible exact
**Situation actuelle :** "Commerces locaux"

**À clarifier :**
- **Segments** :
  - Très petit (1 magasin, 1 personne) ?
  - PME (10-50 magasins) ?
  - Franchise (50-500 magasins) ?
  - Tous ?
- **Géographie MVP** :
  - Belgique uniquement ?
  - France aussi ?
  - Europe ?
  - Monde ?

**Recommandation MVP :**
- Belgique uniquement (plus simple : TVA, devises, langue)
- Petit commerce (1-3 magasins max)
- Scalabilité architecturale (mais pas d'usage).

---

### ❓ Question 17.2 : Différenciation vs concurrence
**Situation actuelle :** Non spécifié.

**À clarifier :**
- **Concurrents connus** ?
  - Wix, Shopify, Squarespace (génériques) ?
  - Resto (spécialisé restaurants) ?
  - Frichti, EatTender (commandes) ?
- **Points forts à exploiter** :
  - Design importation (vs Shopify) ?
  - Multi-store local (vs concurrence) ?
  - Pas de marketplace (vs Amazon Local, Uber Eats) ?

**À clarifier :**
- Qu'est-ce qui rend ce produit unique ?

---

## RÉSUMÉ DES CLARIFICATIONS

| # | Domaine | Priorité | État |
|-|---------|----------|------|
| 1.1 | Multi-store inventory | 🔴 HAUTE | ❓ À clarifier |
| 1.2 | Cross-store orders | 🔴 HAUTE | ❓ À décider |
| 1.3 | Multi-store delivery | 🟡 MOYEN | ❓ À clarifier |
| 2.1 | Design import precision | 🟡 MOYEN | ❓ À réduire |
| 2.2 | Import sources | 🟡 MOYEN | ❓ À clarifier |
| 2.3 | CSS adaptation | 🟡 MOYEN | ⚠️ Risqué |
| 3.1 | Developer Mode files | 🔴 HAUTE | ❓ À clarifier |
| 3.2 | Dev auth/permissions | 🔴 HAUTE | ❓ À clarifier |
| 4.1 | Stripe seul ? | 🟡 MOYEN | ❓ À clarifier |
| 4.2 | Commission structure | 🟡 MOYEN | ❓ À clarifier |
| 4.3 | Payout timing | 🔴 HAUTE | ❓ À clarifier |
| 5.1 | Terminal architecture | 🟡 MOYEN | ❓ À clarifier |
| 5.2 | Printer specs | 🟡 MOYEN | ❓ À clarifier |
| 5.3 | Offline sync | 🟡 MOYEN | ❓ À clarifier |
| 6.1 | Agency model | 🟡 MOYEN | ❓ À clarifier |
| 6.2 | Agency multi-store | 🟡 MOYEN | ❓ À clarifier |
| 7.1 | Domain model | 🔴 HAUTE | ❓ À clarifier |
| 7.2 | SSL/HTTPS | 🟡 MOYEN | ✅ Simple |
| 8.1 | Sector MVP | 🔴 HAUTE | ❓ À décider |
| 8.2 | Auto-adaptation sectors | 🟡 MOYEN | ❓ À clarifier |
| 9.1 | Notification channels | 🟡 MOYEN | ❓ À clarifier |
| 9.2 | Notification events | 🟡 MOYEN | ❓ À clarifier |
| 10.1 | Analytics depth | 🟡 MOYEN | ❓ À clarifier |
| 10.2 | Analytics granularity | 🟡 MOYEN | ✅ À affiner |
| 11.1 | Sector configuration | 🟡 MOYEN | ❓ À clarifier |
| 12.1 | Pricing structure | 🔴 HAUTE | ❓ À clarifier |
| 12.2 | Features per plan | 🔴 HAUTE | ❓ À décider |
| 13.1 | SSO/OAuth | 🟡 MOYEN | ✅ À affiner |
| 13.2 | 2FA | 🟡 MOYEN | ✅ À affiner |
| 13.3 | Audit log scope | 🟡 MOYEN | ❓ À clarifier |
| 14.1 | GDPR deletion | 🔴 HAUTE | ❓ À clarifier |
| 14.2 | Cookies consent | 🟡 MOYEN | ✅ À affiner |
| 14.3 | Data export | 🟡 MOYEN | ✅ À affiner |
| 15.1 | Deployment | 🟡 MOYEN | ❓ À clarifier |
| 15.2 | Monitoring tools | 🟡 MOYEN | ✅ À affiner |
| 16.1 | MVP scope exact | 🔴 HAUTE | ⚠️ Trop large |
| 16.2 | Timeline/resources | 🔴 HAUTE | ❓ À clarifier |
| 17.1 | Target market | 🔴 HAUTE | ❓ À clarifier |
| 17.2 | Differentiation | 🟡 MOYEN | ❓ À clarifier |

---

## FORMAT DE RÉPONSE SUGGÉRÉ

Pour chaque question, tu peux répondre ainsi :

**1.1 Inventaire multi-store :**
- [ ] Option A (inventaire global)
- [ ] Option B (produit-store unique)
- [ ] Option C (centralisé avec sync)
- [ ] Détails supplémentaires : ...

**1.2 Commandes cross-store :**
- [ ] OUI (complexe mais meilleur UX)
- [ ] NON (MVP simple)
- [ ] Détails : ...

Etc.

---

**FIN DE LA LISTE**
