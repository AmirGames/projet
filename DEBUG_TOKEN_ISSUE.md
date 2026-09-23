# 🔧 Diagnostic: "Invalid token" 401 Error

## Problème
L'API retourne `401 Invalid token` pour POST `/api/delivery-zones` même après configuration du `.env`

## Cause racine
**Les tokens stockés dans le navigateur ont été générés avec une clé secrète différente de celle actuellement configurée dans `.env`**

### Timeline:
1. ❌ Ancien: Backend sans `.env` → tokens ne pouvaient pas être générés
2. ✅ Nouveau: Backend avec `.env` configuré → nouveau `JWT_SECRET`
3. ❌ Problème: Le navigateur utilise les anciens tokens incompatibles

## Solution

### Option 1: Nettoyer le localStorage (Rapide ⚡)

**Dans la console du navigateur:**
```javascript
// Vider tous les tokens
localStorage.removeItem('accessToken');
localStorage.removeItem('refreshToken');
localStorage.removeItem('user');
console.log('✅ Tokens supprimés');

// Recharger la page pour se reconnecter
location.reload();
```

Puis **se reconnecter** avec vos identifiants. Un nouveau token sera généré avec le `JWT_SECRET` correct.

### Option 2: Utiliser DevTools du navigateur
1. Ouvrir **DevTools** (F12 ou Cmd+Opt+I)
2. Aller à **Application** → **Local Storage** → votre domaine
3. Supprimer les clés:
   - `accessToken`
   - `refreshToken`
   - `user`
4. Recharger la page
5. Se reconnecter

### Option 3: Redémarrer complet

```bash
# Terminal 1: Backend
cd backend
npm run dev

# Terminal 2: Frontend
cd frontend
npm run dev

# Dans le navigateur: déconnexion + reconnexion
```

## Vérification

Une fois les tokens supprimés et la reconnexion effectuée:

```bash
# Vérifier le token dans la console
curl -X POST http://localhost:3001/api/delivery-zones \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <YOUR_NEW_TOKEN>" \
  -d '{
    "storeId": "your-store-id",
    "name": "Zone de test",
    "type": "RADIUS",
    "radiusKm": 5,
    "baseFee": 2.50
  }'
```

## Pourquoi cela se produit

Le JWT (JSON Web Token) est **signé** avec un secret:
- ✅ Ancien secret → Token signé correctement (mais différent du nouveau)
- ✅ Nouveau secret dans `.env` → Vérifie uniquement les tokens signés avec ce secret
- ❌ Ancien token → Impossible à vérifier avec le nouveau secret

C'est un mécanisme de sécurité: un token volé devient invalide dès que le secret change.

## Prévention

Pour éviter ce problème à l'avenir:
- ✅ Configurer `.env` **avant** de créer les premiers comptes/tokens
- ✅ Garder les secrets sécurisés (jamais en git)
- ✅ Renouveler les secrets régulièrement en production
