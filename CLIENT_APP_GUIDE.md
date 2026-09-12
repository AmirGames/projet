# Client App - Guide Complet

## 🚀 Vue d'ensemble

Le **Client App** est l'interface cliente pour la plateforme Uber Eats-like. Les clients peuvent:
- ✅ Chercher et découvrir restaurants
- ✅ Voir le menu avec détails produits
- ✅ Commander de plusieurs restaurants dans une seule commande
- ✅ Paiement unique pour multi-restaurants
- ✅ Suivi en temps réel de la commande
- ✅ Historique de commandes
- ✅ Sauvegarder restaurants favoris

---

## 📁 Structure de l'Application

```
frontend/app/client/
├── page.tsx                    # Homepage - Découverte restaurants
├── layout.tsx                  # Navigation principale du client
├── restaurant/
│   └── [id]/
│       └── page.tsx           # Détail restaurant + menu
├── cart/
│   ├── page.tsx               # Page panier (optionnel)
│   └── layout.tsx             # Layout du panier
├── checkout/
│   └── page.tsx               # Finalisation commande
├── orders/
│   ├── page.tsx               # Liste commandes
│   └── [id]/
│       └── page.tsx           # Suivi commande en temps réel
└── favorites/
    └── page.tsx               # Restaurants sauvegardés

lib/
└── cart-context.tsx           # State management pour panier multi-restaurants
```

---

## 🛣️ Routes & Flux Client

### 1. **Homepage (`/client`)**
**Objectif**: Découvrir restaurants

- [x] Search bar pour restaurants/plats
- [x] Localisation GPS ou adresse entrée
- [x] Grid restaurants avec:
  - Note (rating)
  - Distance
  - Temps livraison
  - Frais livraison
- [x] Filtres (note, distance, frais)
- [x] Sorts (meilleure note, plus proche, frais réduits)

**API Calls**:
- `GET /api/client/stores` - Tous les restaurants
- `GET /api/client/stores/nearby?lat=X&lng=Y` - Restaurants proches
- `GET /api/client/stores/search?q=query` - Recherche

### 2. **Restaurant Detail (`/client/restaurant/[id]`)**
**Objectif**: Voir menu et ajouter articles au panier

- [x] Infos restaurant (nom, description, adresse, hours)
- [x] Menu catégorisé
- [x] Click produit = modal avec détails
- [x] Panier sidebar en temps réel
- [x] Quantité +/- directement dans la liste
- [x] Bouton "Ajouter au panier"
- [x] Favoris (coeur icon)
- [x] Totals: sous-total, frais livraison, total

**API Calls**:
- `GET /api/client/stores/:id` - Détails restaurant
- `GET /api/client/stores/:id/menu` - Menu seul
- `POST /api/client/me/favorites` - Ajouter favoris
- `DELETE /api/client/me/favorites/:storeId` - Retirer favoris

**State Management**:
- Uses `CartContext` to share cart across restaurants
- Automatically handles multi-restaurant cart
- Persists cart to localStorage

### 3. **Checkout (`/client/checkout`)**
**Objectif**: Finaliser commande

- [x] Recap articles de TOUS les restaurants
- [x] Adresse livraison
- [x] Numéro téléphone
- [x] Notes spéciales
- [x] Choix méthode paiement (carte/espèces)
- [x] Calculs: sous-total, frais livraison, total
- [x] Bouton commander

**API Calls**:
- `POST /api/orders` - Créer commande(s)
- `POST /api/payments` - Initier paiement Stripe (si carte)

**Flux**:
1. Valide données livraison
2. Crée commande(s) groupées par restaurant
3. Si paiement carte → redirect Stripe
4. Si cash → affiche confirmation

### 4. **Order Tracking (`/client/orders/[id]`)**
**Objectif**: Suivre commande en temps réel

- [x] Statut commande avec barre progression:
  - PENDING → CONFIRMED → PREPARING → READY → PICKED_UP → DELIVERED
- [x] Infos livreur:
  - Nom, photo, note
  - Bouton appeler
  - Bouton message
  - Numéro plaque
- [x] Localisation GPS (placeholder - à intégrer Google Maps)
- [x] Temps estimé livraison
- [x] Articles commandés
- [x] Adresse livraison
- [x] Auto-refresh toutes 5 secondes
- [x] Toggle refresh auto

**API Calls**:
- `GET /api/orders/:id` - Détails commande
- `GET /api/deliveries/:id` - Info livraison + driver

### 5. **Order History (`/client/orders`)**
**Objectif**: Voir toutes les commandes

- [x] Liste toutes commandes
- [x] Filter tabs: Toutes, En cours, Terminées
- [x] Card par commande avec:
  - Numéro commande
  - Date
  - Adresse
  - Montant
  - Statut (badge coloré)
  - Restaurant
- [x] Click = détails complète

**API Calls**:
- `GET /api/client/me/orders` - Mes commandes

### 6. **Favorites (`/client/favorites`)**
**Objectif**: Accéder rapidement aux restaurants favoris

- [x] Grid restaurants sauvegardés
- [x] Bouton voir menu
- [x] Bouton supprimer
- [x] Infos restaurant (note, adresse, frais)
- [x] Empty state si aucun favori

**API Calls**:
- `GET /api/client/me/favorites` - Mes favoris
- `DELETE /api/client/me/favorites/:storeId` - Retirer favori

---

## 🛒 Cart Context (Multi-Restaurant)

### Features
- ✅ Ajouter articles de plusieurs restaurants
- ✅ LocalStorage persistence
- ✅ Calcul automatique des totals
- ✅ Support variants/options (structure prête)

### Usage
```typescript
import { useCart } from '@/lib/cart-context';

const { cart, addToCart, removeFromCart, updateQuantity, getTotalWithDelivery } = useCart();

// Ajouter au panier
addToCart({
  productId: '123',
  storeId: 'rest1',
  storeName: 'Restaurant A',
  name: 'Pizza',
  price: 1200, // en centimes
  quantity: 1
});

// Panier structure:
// {
//   storeId: 'rest1',
//   storeName: 'Restaurant A',
//   items: [{ productId, name, price, quantity }, ...]
// }
```

### Cart State
```typescript
// LocalStorage key: 'cart'
// Format: { storeId, storeName, items[] }[]
// Persiste automatiquement
```

---

## 🎨 Design & Styling

### Theme
- **Primary**: Orange (#ff6600)
- **Background**: Gray-900 (#111827)
- **Secondary Bg**: Gray-800 (#1f2937)
- **Accent**: Red (#dc2626) pour danger actions

### Responsive
- Mobile first
- Desktop (md breakpoint)
- Tailwind CSS dark theme

### Components
- Cards avec hover effects
- Badge colored pour status
- Modal pour détails produit
- Sidebar sticky pour panier
- Progress bar animée

---

## 🔐 Authentication

### Requirements
- JWT token in localStorage (key: `accessToken`)
- Auto-redirect to login if no token

### Protected Routes
- `/client/checkout` - Nécessite token
- `/client/orders` - Nécessite token
- `/client/orders/[id]` - Nécessite token
- `/client/favorites` - Nécessite token

### Public Routes
- `/client` - Homepage (peut être guest ou auth)
- `/client/restaurant/[id]` - Détails restaurant (public, add-to-cart nécessite auth)

---

## 📡 API Endpoints Requis

### Public (pas d'auth)
```
GET    /api/client/stores                    - Tous les restaurants
GET    /api/client/stores/nearby             - Restaurants proches
GET    /api/client/stores/search?q=query     - Recherche restaurants
GET    /api/client/stores/:id                - Détails + menu
GET    /api/client/stores/:id/menu           - Menu seul
```

### Protected (auth required)
```
GET    /api/client/me/favorites              - Mes favoris
POST   /api/client/me/favorites              - Ajouter favori
DELETE /api/client/me/favorites/:storeId     - Retirer favori

GET    /api/orders/:id                       - Détails commande
GET    /api/client/me/orders                 - Mes commandes
POST   /api/orders                           - Créer commande

GET    /api/deliveries/:id                   - Info livraison + driver

POST   /api/payments                         - Initier paiement
GET    /api/customers/me                     - Profil client
```

---

## 🚦 Status Codes & Workflow

### Order Status
```
PENDING      → Commande créée, en attente confirmation
CONFIRMED    → Restaurant a accepté
PREPARING    → En préparation en cuisine
READY        → Prête, attend livreur
PICKED_UP    → Livreur l'a prise, en route
DELIVERED    → Livrée au client
CANCELLED    → Annulée
```

### Delivery Status
```
PENDING      → En attente assignation livreur
ACCEPTED     → Livreur accepté la livraison
PICKED_UP    → Livreur a pris la commande au resto
DELIVERED    → Livrée
FAILED       → Impossible de livrer
```

---

## 🗺️ Fonctionnalités Futures

### À court terme (Phase 2)
- [ ] Intégration Google Maps/Mapbox
- [ ] Upload image restaurant/products
- [ ] Reviews & ratings post-commande
- [ ] Promotions & coupons
- [ ] Estimated delivery time calculation
- [ ] Live GPS tracking du livreur
- [ ] Chat temps réel avec livreur
- [ ] Paiement Stripe complet
- [ ] Annulation commande partielle

### À moyen terme (Phase 3)
- [ ] WebSockets pour live updates
- [ ] Notifications push
- [ ] Schedule commandes futures
- [ ] Programmes fidélité
- [ ] Multiple adresses livraison
- [ ] Profil client complet
- [ ] Historique favoris
- [ ] Recommandations personnalisées

### À long terme (Phase 4)
- [ ] Offline mode (PWA)
- [ ] AR menu preview
- [ ] Voice search
- [ ] AI recommendations
- [ ] Multi-language support
- [ ] App mobile native

---

## 🧪 Testing Checklist

### Homepage
- [ ] Search bar fonctionne
- [ ] GPS geolocation fonctionne
- [ ] Restaurants affichés correctement
- [ ] Filtres fonctionnent
- [ ] Sorts fonctionnent
- [ ] Click restaurant → détail page

### Restaurant Detail
- [ ] Menu charge correctement
- [ ] Categories affichées
- [ ] Click produit → modal
- [ ] Ajouter au panier fonctionne
- [ ] Quantité +/- fonctionne
- [ ] Favoris toggle fonctionne
- [ ] Totals calculés correctement

### Checkout
- [ ] Articles des 2+ restaurants affichent
- [ ] Adresse/phone requises
- [ ] Paiement methods affichés
- [ ] Totals corrects
- [ ] Click commander → crée commande

### Order Tracking
- [ ] Statut progress bar affiche
- [ ] Driver info affiche si assigné
- [ ] Auto-refresh marche
- [ ] Bouton appel driver fonctionne
- [ ] Status updates en temps réel

### Order History
- [ ] Liste commandes affiche
- [ ] Filters fonctionnent
- [ ] Click commande → tracking page

### Favorites
- [ ] Favoris affichent
- [ ] Supprimer fonctionne
- [ ] Voir menu fonctionne

---

## 📊 Performance Notes

- Lazy load images (à implémenter)
- Debounce search input (à implémenter)
- Pagination orders si besoin
- Cart persiste localStorage (implementé)
- Auto-refresh configurable (implementé)

---

## 🔗 Lien à la Homepage

Depuis la homepage principale (`/`), ajouter un lien:
```
"Commencer à commander" → /client
```

Ou créer une route `/restaurants` qui redirige `/client`.

---

## 📝 Notes Développement

1. **Multi-Restaurant Cart**: CartContext gère plusieurs restaurants dans une seule commande - le backend reçoit `orders: [{storeId, items}, ...]`

2. **Persiste locale**: Cart sauvegardé en localStorage sous clé `'cart'`, auto-restore au mount

3. **Responsive**: Mobile-first, Tailwind dark theme, flexbox/grid

4. **Auth**: Toutes pages protégées check token localStorage, redirect login si absent

5. **Erreurs**: Catch et affichage user-friendly, pas de console logs en production

6. **Performance**: Auto-refresh configurable (5 sec default), debounce search si besoin

---

## 🎯 Prochaines Étapes

1. ✅ Structure Client App (FAIT)
2. ✅ Endpoints API (FAIT)
3. ✅ Frontend pages (FAIT)
4. ⏳ Intégration Google Maps
5. ⏳ Implémentation paiement Stripe
6. ⏳ WebSockets pour tracking temps réel
7. ⏳ Notifications push
8. ⏳ App mobile native

---

## 🚀 Lancement Plateforme

Pour tester le Client App complet:

```bash
# 1. Backend
cd backend
npx prisma migrate dev  # Apply schema v8
npm run dev            # Start backend (port 3001)

# 2. Frontend
cd frontend
npm run dev            # Start frontend (port 3000)

# 3. Access
- Merchant: http://localhost:3000/login
- Client:   http://localhost:3000/client
```

**Flux de test**:
1. Signup merchant → create restaurant
2. Add products + menu
3. Logout
4. Signup client → go to /client
5. Search restaurants
6. Order multi-restaurant
7. Track delivery

---

**Date**: September 2024
**Version**: 1.0 (Phase 1 - MVP)
**Status**: ✅ Complete
