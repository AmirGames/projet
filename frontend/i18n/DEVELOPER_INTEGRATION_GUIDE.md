# 👨‍💻 Guide d'Intégration pour Développeurs

## 🎯 Objectif

Intégrer rapidement la migration i18n des 8 pages Superowner.

## ⏱️ Temps Estimé

- Intégration dictionnaires : **5 min**
- Test pages migrées : **10 min**  
- Migration 1 page : **5-10 min**
- Migration 6 pages : **30-60 min** (parallelizable)
- **Total : 1-2 heures**

---

## 🚀 Quick Start (5 min)

### 1. Copier les Dictionnaires

```bash
# Supposant que tu es à la racine du projet
cp fr.json apps/admin/messages/fr.json
cp en.json apps/admin/messages/en.json

# Vérifier que les fichiers existent
ls -la apps/admin/messages/
# fr.json ✅
# en.json ✅
```

### 2. Vérifier la Configuration i18n

Assure-toi que `apps/admin/i18n/request.ts` importe les bons fichiers :

```ts
// ✅ Correct
const messages = (await import(`../messages/${locale}.json`)).default;

// ❌ Incorrect
const messages = (await import(`../../messages/${locale}.json`)).default;
```

### 3. Tester le Fonctionnement

```bash
# Démarrer le serveur
npm run dev

# Dans le navigateur
# 1. Va sur http://localhost:3000/superowner/billing
# 2. Change la langue (si y'a un sélecteur)
# 3. Vérifying que le contenu change

# Vérifier les clés de traduction
# Si tu vois "t('key_missing')" → Une clé est manquante
```

---

## 📋 Workflow de Migration (Par Page)

### Exemple avec `payouts-page.tsx`

#### Étape 1: Préparer le Fichier

```bash
# Copier l'original
cp <ancien_path>/payouts-page.tsx payouts-page.tsx.backup

# Ouvrir le fichier
code payouts-page.tsx
```

#### Étape 2: Ajouter Imports et Hook

**Chercher** (tout en haut du fichier, après les autres imports) :
```tsx
import { useCallback, useEffect, useState } from 'react';
```

**Ajouter** après les imports React :
```tsx
import { useTranslations } from 'next-intl';
```

**À l'intérieur du composant**, tout en début de la fonction :
```tsx
export default function VersementsPage() {
  // ➕ Ajouter cette ligne
  const t = useTranslations('superownerPayouts');
  
  // Code existant...
  const [releves, setReleves] = useState<Releve[]>([]);
  // ...
}
```

#### Étape 3: Remplacer les Strings (Chercher/Remplacer)

Utiliser la fonction **Chercher/Remplacer** de ton éditeur (Ctrl+H ou Cmd+H)

| # | Chercher | Remplacer | Notes |
|---|----------|-----------|-------|
| 1 | `"Versements aux livreurs"` | `{t('title')}` | En haut de la page |
| 2 | `"Une course livrée est due..."` | `{t('subtitle')}` | Sous le titre |
| 3 | `"Reste à devoir"` | `{t('outstandingAmount')}` | Dans les cards |
| 4 | `"Arrêter les relevés"` | `{t('stopButton')}` | Le bouton |
| ... | (voir le guide complet) | ... | (continuer pour chaque clé) |

**Pro Tip**: Faire un remplacement à la fois et tester après chaque groupe.

#### Étape 4: Vérifier

```bash
# Chercher les chaînes en français non traduites
grep -n '".*[à-ÿ].*"' payouts-page.tsx | grep -v "//" | head -20

# Si 0 résultat → Migration complète !
```

#### Étape 5: Tester

```bash
# Démarrer le dev server
npm run dev

# Ouvrir http://localhost:3000/superowner/payouts
# Vérifier que tous les textes s'affichent correctement

# Tester la seconde langue
# (changer `NEXT_LOCALE` en .env ou dans l'URL)

# Vérifier la console pour les erreurs i18n
```

#### Étape 6: Commit

```bash
git add payouts-page.tsx
git commit -m "feat(i18n): migrate payouts page to i18n

- Add useTranslations hook
- Move all hardcoded strings to superownerPayouts namespace
- All 32 keys translated in fr.json and en.json"
```

---

## 🔄 Migration en Parallèle (Équipe)

### Répartition Suggérée

Si vous êtes plusieurs :

| Développeur | Pages | Temps |
|------------|-------|-------|
| Dev 1 | payouts + drivers | 20 min |
| Dev 2 | organizations + webhooks | 20 min |
| Dev 3 | stores + system-config | 20 min |
| QA | Tests tous | 15 min |

### Synchronisation

```bash
# Avant de commencer
git pull origin main

# Après avoir terminé
git add <pages-migrées>
git commit -m "feat(i18n): migrate <page-names> to i18n"
git push origin <ta-branche>
```

---

## ⚠️ Pièges Courants

### Piège 1: Clé Manquante dans JSON

```tsx
{t('nonExistent')} // ❌ Affiche "t.nonExistent"
```

**Solution** : Vérifier que la clé existe dans fr.json et en.json

```json
{
  "superownerPayouts": {
    "nonExistent": "Valeur ici"
  }
}
```

### Piège 2: Mauvais Namespace

```tsx
const t = useTranslations('wrongNamespace');
{t('title')} // ❌ Clé non trouvée
```

**Solution** : Utiliser le bon namespace (voir le guide par page)

```tsx
const t = useTranslations('superownerPayouts'); // ✅
```

### Piège 3: Texte en Dur qui Reste

```tsx
<p>Mon texte en français</p> // ❌ Pas traduit
<p>{t('myText')}</p> // ✅ Traduit
```

**Solution** : Chercher/Remplacer TOUS les textes utilisateur

### Piège 4: Paramètres Mal Utilisés

```tsx
{t('showing', { from: 1, to: 10 })} 
// Clé JSON doit avoir les mêmes paramètres
```

**Dans JSON** :
```json
"showing": "Showing {from} to {to}" // ✅ Correct
"showing": "Showing items" // ❌ Paramètres ignorés
```

---

## 🧪 Stratégie de Test

### Test 1: Vérification Visuelle (2 min)

```bash
# French
NEXT_LOCALE=fr npm run dev
# Visiter chaque page migrée
# Vérifier que le texte est en français

# English
NEXT_LOCALE=en npm run dev
# Visiter chaque page migrée
# Vérifier que le texte est en anglais
```

### Test 2: Vérification Console (1 min)

```bash
# Ouvrir DevTools (F12)
# Aller au tab "Console"
# Il ne doit y avoir AUCUNE erreur i18n

# ✅ Bon : Console vide ou erreurs autres
# ❌ Mauvais : "Error: Key 'xyz' not found"
```

### Test 3: Vérification Avec GitHub Actions (Auto)

```yaml
# .github/workflows/i18n-check.yml (exemple)
- name: Check i18n keys
  run: |
    npm run i18n:validate
    # Cherche les clés manquantes dans JSON
```

---

## 📊 Checklist par Page

### Template à Copier

```markdown
## Page: payouts-page.tsx
- [ ] Imports ajoutés (useTranslations)
- [ ] Hook t = useTranslations('superownerPayouts') ajouté
- [ ] Titre changé en {t('title')}
- [ ] Sous-titre changé en {t('subtitle')}
- [ ] Messages d'erreur traduits
- [ ] Boutons traduits
- [ ] Labels traduits
- [ ] Placeholders traduits
- [ ] Colonnes de tableaux traduites
- [ ] Aucune chaîne en français restante (vérifié avec grep)
- [ ] Tests en FR passés
- [ ] Tests en EN passés
- [ ] Commit poussé
```

---

## 🔍 Commandes Utiles

### Chercher les Textes Non Traduits

```bash
# Fichier spécifique
grep -n '".*[à-ÿ].*"' app/superowner/billing/page.tsx | grep -v "//"

# Tous les fichiers Superowner
grep -rn '".*[à-ÿ].*"' app/superowner/ | grep -v "//" | grep -v ".json"
```

### Vérifier la Structure JSON

```bash
# Valider la syntaxe
node -c messages/fr.json
node -c messages/en.json

# Afficher les clés
jq '.superownerBilling | keys' messages/fr.json
```

### Voir les Statistiques

```bash
# Nombre de clés par namespace
jq 'to_entries | map({namespace: .key, count: (.value | keys | length)})' messages/fr.json

# Clés manquantes (FR vs EN)
comm <(jq -r 'keys_unsorted[]' messages/fr.json | sort) <(jq -r 'keys_unsorted[]' messages/en.json | sort)
```

---

## 📚 Ressources

- **next-intl docs** : https://next-intl-docs.vercel.app/
- **i18n best practices** : https://www.i18next.com/
- **React-intl patterns** : https://formatjs.io/docs/react-intl/

---

## 💡 Tips & Tricks

### Tip 1: Copier les Clés d'un Namespace

```bash
# Afficher toutes les clés d'un namespace
jq '.superownerBilling | keys' messages/fr.json

# Comparer deux namespaces
diff <(jq '.superownerBilling | keys | sort' messages/fr.json) \
     <(jq '.superownerBilling | keys | sort' messages/en.json)
```

### Tip 2: Ajouter une Clé Rapidement

```bash
# Pour ajouter une clé manquante
# 1. Ouvrir messages/fr.json
# 2. Chercher le namespace (ex: superownerBilling)
# 3. Ajouter la clé : "myNewKey": "Mon nouveau texte"
# 4. Faire la même chose dans en.json

# ✅ Format correct
{
  "superownerBilling": {
    "existingKey": "Texte",
    "myNewKey": "Nouveau texte"
  }
}
```

### Tip 3: Format vs Clé Simple

```tsx
// ✅ Clé simple (recommandé)
{t('save')}

// ✅ Clé avec paramètres
{t('showing', { from: 1, to: 10 })}

// ❌ N'existe pas - ne pas essayer
{t('save', 'extra params')} // 2e argument est l'objet options
```

---

## 🎓 Exemple Complet de Migration

### Avant (À Migrer)

```tsx
'use client';

import { useState } from 'react';

export default function BillingPage() {
  const [error, setError] = useState('');

  return (
    <div>
      <h1>Facturation & Abonnements</h1>
      <p>Gestion des abonnements et des revenus</p>
      {error && <div className="error">{error}</div>}
      <button onClick={() => setError('Erreur lors du chargement')}>
        Charger
      </button>
    </div>
  );
}
```

### Après (Migré)

```tsx
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

export default function BillingPage() {
  const t = useTranslations('superownerBilling');
  const [error, setError] = useState('');

  return (
    <div>
      <h1>{t('title')}</h1>
      <p>{t('subtitle')}</p>
      {error && <div className="error">{error}</div>}
      <button onClick={() => setError(t('loadError'))}>
        {t('loading')}
      </button>
    </div>
  );
}
```

### JSON Correspondant

```json
{
  "superownerBilling": {
    "title": "Facturation & Abonnements",
    "subtitle": "Gestion des abonnements et des revenus",
    "loadError": "Erreur lors du chargement",
    "loading": "Chargement…"
  }
}
```

---

## ✅ Validation Finale

Avant de commit :

```bash
# 1. Pas de texte en dur restant
✓ grep -rn '".*[à-ÿ].*"' app/superowner/billing/ | grep -v "//" | wc -l
# Doit retourner 0

# 2. JSON valide
✓ node -c messages/fr.json
✓ node -c messages/en.json

# 3. Pas d'erreurs TypeScript
✓ npm run type-check

# 4. Tests passent
✓ npm run test

# 5. Visuellement correct
✓ npm run dev
✓ NEXT_LOCALE=fr npm run dev
✓ NEXT_LOCALE=en npm run dev
```

---

## 🚀 Vous Êtes Prêt !

Vous avez maintenant tout ce qu'il faut pour :

1. ✅ Intégrer les dictionnaires (5 min)
2. ✅ Tester les pages migrées (10 min)
3. ✅ Migrer rapidement les 6 pages restantes (30-60 min)
4. ✅ Valider et merger le tout

**Bon courage ! 🎉**

---

*Pour toute question, consulte MIGRATION_GUIDE_REMAINING_PAGES.md*
