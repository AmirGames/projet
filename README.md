# Zupone - Groupe de Solutions pour la Livraison et la Restauration

## 📋 Vue d'ensemble

**Zupone** est un groupe technologique belge spécialisé dans les solutions digitales pour la mobilité urbaine et la livraison de repas. Nous développons deux écosystèmes distincts :

1. **Zupeat** : Livraison de repas (restaurants → clients via livreurs)
2. **ZupDrive** : Transport de passagers (type Uber/Bolt)

Notre mission : **Créer des solutions de mobilité et de livraison innovantes, sécurisées et centrées sur l'expérience utilisateur.**

---

## 🏢 Structure du Groupe

Le groupe Zupone est composé de **deux écosystèmes** distincts :

### 1️⃣ **Zupeat** - Plateforme de Livraison de Repas
Composée de 3 applications :
- **zupeat.com** : App client (commande repas)
- **manager.zupeat.com** : App commerçant (gère restaurant)
- **delivery.zupeat.com** : App livreur (livraison repas)

### 2️⃣ **ZupDrive** - Application de Transport de Passagers (VTC)
Composée de 2 applications :
- **Client app** : Demande trajet (point A → point B)
- **Chauffeur app** : Accepte trajets et conduit passagers

---

## 🍽️ Zupeat - Plateforme de Livraison de Repas

### Description
**Zupeat** est la plateforme centrale de livraison de repas qui connecte les **restaurants**, les **livreurs** et les **clients**. Elle comprend 3 applications distinctes :

### 3 Applications Zupeat

#### 1️⃣ **zupeat.com** - App Client
- 👥 Les clients découvrent restaurants, consultent menus, passent commandes
- 🔍 Recherche/filtrage restaurants par cuisine, localisation, note
- 🛒 Panier, gestion commandes, suivi livraison en temps réel
- 💳 Paiement sécurisé (carte, PayPal, etc.)
- ⭐ Notation restaurant/livreur, historique commandes

#### 2️⃣ **manager.zupeat.com** - App Commerçant
- 🏪 Commerçants gèrent leur établissement et catalogue
- 📋 Gestion menus (catégories, articles, prix, photos)
- 📊 Tableau de bord (commandes en temps réel, chiffre d'affaires, statistiques)
- ✅ Acceptation/refus commandes, notification livreur
- 💰 Gestion paiements, reversements, analytics détaillées
- 🚚 Gestion livraisons associées, suivi livreurs

#### 3️⃣ **delivery.zupeat.com** - App Livreur
- 📱 Application mobile native Android (voir section Zupeat Driver App)
- 📦 Réception commandes à livrer, acceptation/refus
- 🗺️ Navigation GPS intégrée (Google Maps)
- 📍 Suivi temps réel pour client et restaurant
- 💬 Chat avec client et restaurant
- 💵 Gestion revenus et paiements

### Infrastructure Commune
- 📊 **Tableau de Bord** : Monitoring en temps réel des commandes, livreurs et métriques de performance
- 💰 **Gestion des Paiements** : Intégration Stripe, multiples moyens de paiement sécurisés
- 📈 **Analytics & Reporting** : Données détaillées sur les commandes, revenus et comportement utilisateur
- 🔔 **Notifications** : Email, SMS, push pour tous les acteurs
- 📱 **Support Multi-plateforme** : Web responsive + apps mobiles

### Stack Technologique Zupeat
- **Backend API** : Node.js/Express, TypeScript, PostgreSQL, Redis (Prisma ORM)
- **Frontend Client** : Next.js 16, React 19, Tailwind CSS, next-intl
- **App Commerçant** : Next.js 16 (dashboard responsive)
- **App Livreur** : Android Native (Kotlin), Google Maps SDK (voir section Zupeat Driver App)
- **Paiements** : Stripe API, webhooks pour confirmation
- **Infrastructure** : Docker, Kubernetes, Scaleway (deployment)
- **Temps réel** : WebSockets/Redis pour notifications et suivi GPS
- **Emails** : Mailpit (local), service externe (production)

### Objectifs Zupeat
- ✅ Offrir expérience fluide pour les 3 acteurs (client, commerçant, livreur)
- ✅ Optimiser délais de livraison (<35 min)
- ✅ Sécuriser paiements et données
- ✅ Maximiser satisfaction clients et restaurants

---

## 🚚 Zupeat Driver App - Application Livreurs (delivery.zupeat.com)

### Description
L'**application Zupeat Driver** est l'application native Android accessible à **delivery.zupeat.com** pour les livreurs de repas Zupeat. Elle leur permet de gérer leurs livraisons directement depuis leur téléphone avec un maximum de confort et d'efficacité.

### Fonctionnalités Clés (Complément à delivery.zupeat.com)

#### 📦 Gestion des Commandes
- Affichage en temps réel des livraisons disponibles
- Système d'acceptation/refus simple et rapide
- Historique et suivi des commandes assignées
- Notifications push prioritaires

#### 🗺️ Navigation Intégrée (Feature Premium)
- **Google Maps SDK intégré** : Navigation turn-by-turn sans quitter l'app
- Itinéraires optimisés pour plusieurs livraisons
- Estimation de temps d'arrivée en temps réel
- Évaluation du trafic et suggestions d'itinéraires alternatifs

#### 📍 Localisation et Suivi
- GPS en temps réel
- Partage de localisation avec restaurant et client
- Historique des trajets pour optimisation future

#### ✅ Confirmation de Livraison
- Signature électronique des clients (optionnel)
- Photo de livraison
- Commentaires et notes
- Prise de photo du client avec la commande

#### 💬 Communication
- Chat intégré avec clients
- Chat avec restaurants
- Support technique in-app

#### 💵 Gestion Financière
- Suivi des revenus en temps réel
- Historique des paiements
- Détails des commissions et bonus

### Stack Technologique
- **Plateforme** : Android Native (Java/Kotlin)
- **Navigation** : Google Maps SDK
- **Networking** : Retrofit pour les appels API
- **Architecture** : ViewModel + LiveData (MVVM Pattern)
- **Services** : Location Services pour le GPS en continu
- **Base Données Locale** : Room Database pour cache offline

### Avantages pour les Livreurs
✨ Interface intuitive et facile à maîtriser  
⚡ Performances optimisées pour batterie et données mobiles  
🛡️ Sécurité des données personnelles  
📱 Fonctionne sur tous les appareils Android modernes  

---

## 🚗 ZupDrive - Application de Transport de Passagers (En Développement)

### Description
**ZupDrive** est le projet émergent du groupe Zupone. Il s'agit d'une **plateforme de transport urbain de passagers** (VTC - Véhicules de Transport avec Chauffeur), similaire à Uber ou Bolt. Les clients demandent un trajet, les chauffeurs acceptent et les conduisent d'un point A à un point B.

### Modèle de Fonctionnement
- 👤 **Clients** : Téléchargent l'app, demandent un trajet (point A → point B)
- 🚕 **Chauffeurs** : Reçoivent les demandes de trajet et acceptent les courses
- 📍 **Géolocalisation** : Suivi en temps réel du trajet et localisation du chauffeur
- 💰 **Paiements** : Tarification dynamique selon la distance, demande et trafic
- ⭐ **Notation** : Système de notation client ↔ chauffeur pour la qualité

### Fonctionnalités Principales
- **App Client** : Demander un trajet, tracker le chauffeur, payer
- **App Chauffeur** : Recevoir demandes de trajet, navigation intégrée, historique des courses
- **Gestion Administrativa** : Vérification des documents (licence, assurance, BCE)
- **Système de Paiement** : Paiement sécurisé, payout chauffeurs
- **Support & Feedback** : Chat support, signalement de problèmes, notation
- **Analytics** : Dashboard chauffeur (revenus, trajets) et admin (métriques)

### Stack Technologique
- **Backend** : API Node.js/Express, PostgreSQL, Redis pour temps réel
- **Frontend Web** : Dashboard admin (Next.js)
- **App Client** : iOS/Android (React Native ou Expo)
- **App Chauffeur** : iOS/Android (React Native ou Expo)
- **Localisation** : Google Maps API, tracking temps réel
- **Paiements** : Stripe, gestion des payouts

### Objectifs Stratégiques
🎯 Lancer MVP en Belgique (Namur, Bruxelles, Liège)  
🎯 Atteindre 500+ chauffeurs actifs en Q1 2027  
🎯 Générer stabilité opérationnelle et rentabilité  
🎯 Expansion régionale en Wallonie/Flandre  

---

## 🔗 Écosystème Zupone

Deux écosystèmes **indépendants** mais appartenant au même groupe :

```
┌──────────────────────────────────────────────────┐
│            GROUPE ZUPONE                         │
├──────────────────────────────────────────────────┤
│                                                  │
│  ┌─────────────────────────┐                    │
│  │    ZUPEAT (Food)        │                    │
│  ├─────────────────────────┤                    │
│  │ Restaurants → Livreurs  │                    │
│  │ → Clients de repas      │                    │
│  │                         │                    │
│  │ Platform + Driver App   │                    │
│  └─────────────────────────┘                    │
│                                                  │
│  ┌─────────────────────────┐                    │
│  │  ZUPDRIVE (Mobility)    │                    │
│  ├─────────────────────────┤                    │
│  │ Chauffeurs → Passagers  │                    │
│  │ (Point A → Point B)     │                    │
│  │                         │                    │
│  │ Client App + Driver App │                    │
│  └─────────────────────────┘                    │
│                                                  │
└──────────────────────────────────────────────────┘
```

### Structure
- **Zupeat** : Plateforme de livraison de repas (restaurants partenaires)
  - App Client (web/mobile) : clients commandent repas
  - App Livreur (Android) : livreurs livrent les commandes
  
- **ZupDrive** : App de transport urbain (type Uber/Bolt)
  - App Client (mobile) : clients demandent trajets
  - App Chauffeur (mobile) : chauffeurs prennent les trajets

Les deux écosystèmes partagent la même infra backend/tech mais ont des modèles métier distincts.

---

## 🚀 Timeline et Roadmap

### **Début 2027 - Lancement Zupeat** 📅
**Objectifs**
- 🎯 Onboarder **10 restaurants partenaires** 
- 🎯 Recruter **quelques livreurs** (5-10 initialement)
- 🎯 Stabiliser plateforme zupeat.com + manager.zupeat.com + delivery.zupeat.com
- 🎯 Validater modèle économique et satisfactions clients/restaurants/livreurs

**Focus**
- Intégration restaurants (menus, paiements)
- Formation livreurs et support
- Bug fixes et optimisations
- Analytics et feedback utilisateurs

---

### **Fin 2027 - Lancement ZupDrive** 📅
**Objectifs**
- 🎯 Lancer app transport passagers (client + chauffeur)
- 🎯 MVP stable et opérationnel
- 🎯 Recrutement chauffeurs (50+ minimum)
- 🎯 Vérification documents (licence, assurance, BCE)

**Focus**
- Intégration paiements et géolocalisation
- Vérifications et compliance chauffeurs
- Formation chauffeurs
- Support et notifications

---

### **2028+ - Consolidation et Expansion** 📈
**Zupeat**
- Expansion à 5-10 villes belges
- 100+ restaurants partenaires
- 200+ livreurs actifs
- Partenariats stratégiques (chaînes restaurants, hôtels)

**ZupDrive**
- Expansion régionale (Wallonie)
- 500+ chauffeurs actifs
- Rentabilité opérationnelle
- Intégration avec services complémentaires

**Groupe**
- Plateforme consolidée multi-services
- Analytics et optimisations cross-platform
- Expansion nationale (Flandre, Bruxelles)

---

## 👨‍💻 Stack Technologique Global

| Composant | Technologies |
|-----------|--------------|
| **Backend** | Node.js / Python / autres |
| **Frontend Web** | React / Vue.js / Angular |
| **Mobile Clients** | React Native / Flutter |
| **Mobile Drivers** | Android Native (Kotlin/Java) |
| **Base Données** | PostgreSQL / MongoDB |
| **Infra** | Docker / Kubernetes / AWS/GCP |
| **IA/ML** | TensorFlow / scikit-learn |
| **Mapping** | Google Maps API / Mapbox |

---

## 🌐 Domaines Web

| Service | Domaine | Purpose |
|---------|---------|---------|
| **Groupe** | zupone.com | Présentation groupe, blog, infos générales |
| **Zupeat** | zupeat.com | App client (commande repas) |
| **Zupeat** | manager.zupeat.com | Dashboard commerçant (gestion restaurant) |
| **Zupeat** | delivery.zupeat.com | App livreur (gestion livraisons) |
| **ZupDrive** | zupdrive.com | Présentation et app client transport |
| **ZupDrive** | driver.zupdrive.com | App chauffeur (gestion trajets) |

---

## 📞 Contact & Support

- **Email** : [À définir]
- **Support Clients** : In-app chat + email
- **Support Restaurants/Chauffeurs** : In-app support + email
- **Signalements Bugs** : GitHub Issues (ce repo)

---

## 📄 Licence

[À définir selon les besoins légaux du groupe]

---

**Dernière mise à jour** : Octobre 2026  
**Version** : 1.0
