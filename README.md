# Zupone - Groupe de Solutions pour la Livraison et la Restauration

## 📋 Vue d'ensemble

**Zupone** est un groupe technologique belge spécialisé dans les solutions digitales pour la mobilité urbaine et la livraison de repas. Nous développons deux écosystèmes distincts :

1. **Zupeat** : Livraison de repas (restaurants → clients via livreurs)
2. **ZupDrive** : Transport de passagers (type Uber/Bolt)

Notre mission : **Créer des solutions de mobilité et de livraison innovantes, sécurisées et centrées sur l'expérience utilisateur.**

---

## 🏢 Structure du Groupe

Le groupe Zupone est composé de trois produits interconnectés :

### 1️⃣ **Zupeat** - Plateforme de Livraison de Food
### 2️⃣ **Zupeat Driver App** - Application pour Livreurs de Repas
### 3️⃣ **ZupDrive** - Application de Transport de Passagers (VTC)

---

## 🍽️ Zupeat - Plateforme Principale

### Description
**Zupeat** est la plateforme centrale de livraison de repas qui connecte les restaurants, les livreurs et les clients. C'est le cœur de l'écosystème Zupone.

### Fonctionnalités Principales
- 🏪 **Gestion Restaurants** : Interface pour les restaurants partenaires pour gérer leurs menus, commandes et livraisons
- 👥 **Plateforme Client** : Application web et mobile permettant aux clients de commander des repas
- 📊 **Tableau de Bord** : Monitoring en temps réel des commandes, livreurs et métriques de performance
- 💰 **Gestion des Paiements** : Intégration de multiples moyens de paiement sécurisés
- 📈 **Analytics & Reporting** : Données détaillées sur les commandes, revenus et comportement utilisateur

### Stack Technologique
- **Backend** : API RESTful (détails selon architecture spécifique)
- **Frontend** : Web responsive + applications mobiles (iOS/Android)
- **Données** : Bases de données optimisées pour les transactions en temps réel
- **Infrastructure** : Cloud scalable pour gérer les pics de demande

### Objectifs
- Offrir une expérience fluide du début à la fin de la commande
- Optimiser les délais de livraison
- Maximiser la satisfaction clients et restaurants

---

## 🚚 Zupeat Driver App - Application Livreurs

### Description
L'**application Zupeat Driver** est une application native Android conçue spécifiquement pour les livreurs (livreurs) de la plateforme Zupone. Elle leur permet de gérer leurs livraisons directement depuis leur téléphone avec un maximum de confort et d'efficacité.

### Fonctionnalités Clés

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

## 🎯 Objectifs à Court Terme

**Zupeat**
- ✅ Lancer Zupeat Driver App en version stable
- ✅ Atteindre 500+ livreurs actifs
- ✅ Optimiser le temps moyen de livraison à <35 minutes
- 🔄 Expansion à 3 nouvelles villes

**ZupDrive**
- 🔄 Lancer MVP (app client + chauffeur)
- 🔄 Commencer recrutement chauffeurs (50+ minimum)
- 🔄 Vérification documents chauffeurs (licence, BCE)

## 🚀 Roadmap Long Terme

**Q4 2026 - Q1 2027**
- ZupDrive : MVP lancé et stable
- 500+ chauffeurs actifs ZupDrive
- Expansion Zupeat à 5 villes

**2027**
- Consolidation multi-villes (Zupeat + ZupDrive)
- Expansion régionale (Wallonie complète)
- Partenariats stratégiques restaurants/hôtels
- Rentabilité opérationnelle des deux services

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

## 📞 Contact & Support

- **Email** : [À définir]
- **Site Web** : [À définir]
- **Support Drivers** : In-app support
- **Support Restaurants** : [À définir]

---

## 📄 Licence

[À définir selon les besoins légaux du groupe]

---

**Dernière mise à jour** : Octobre 2026  
**Version** : 1.0
