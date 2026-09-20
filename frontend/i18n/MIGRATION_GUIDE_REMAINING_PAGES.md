# Guide de Migration i18n - 6 Pages Restantes

Ce guide détaille les modifications précises à apporter à chaque page pour la migration i18n.

---

## 1️⃣ PAYOUTS-PAGE.TSX
**Namespace**: `superownerPayouts`

### Imports à ajouter
```tsx
import { useTranslations } from 'next-intl';
```

### Hook à ajouter
```tsx
const t = useTranslations('superownerPayouts');
```

### Replacements clés (utiliser "Chercher/Remplacer"):

| Avant | Après |
|-------|-------|
| "Versements aux livreurs" | `{t('title')}` |
| "Une course livrée est due tant qu'aucun relevé ne la porte." | `{t('subtitle')}` |
| "Reste à devoir" | `{t('outstandingAmount')}` |
| "Courses non payées" | `{t('outstandingOrders')}` |
| "Livreurs concernés" | `{t('concernedDrivers')}` |
| "Arrêter les relevés d'une période" | `{t('stopPeriod')}` |
| "Du" | `{t('from')}` |
| "Au (exclu)" | `{t('to')}` |
| "Arrêter les relevés" | `{t('stopButton')}` |
| "À verser" | `{t('pending')}` |
| "Versés" | `{t('paid')}` |
| "Annulés" | `{t('cancelled')}` |
| "Aucun relevé dans cet état" | `{t('empty')}` |
| "Marquer versé" | `{t('markPaid')}` |
| "Moyen" | `{t('method')}` |
| "Référence" | `{t('reference')}` |
| "Confirmer le versement" | `{t('confirmPayout')}` |

### Sections spéciales

**En-tête** (ligne ~195-202):
```tsx
<h1 className="text-3xl font-bold text-white flex items-center gap-2">
  <Banknote className="w-8 h-8" />
  {t('title')}
</h1>
<p className="text-gray-400 mt-2">{t('subtitle')}</p>
```

**Filtre d'état** (ligne ~284-302):
```tsx
{ETATS.map((etat) => (
  <button key={etat.valeur} ...>
    {t(etat.valeur.toLowerCase())}
```

---

## 2️⃣ DRIVERS-PAGE.TSX
**Namespace**: `superownerDrivers`

### Imports
```tsx
import { useTranslations } from 'next-intl';
```

### Hook
```tsx
const t = useTranslations('superownerDrivers');
```

### Replacements clés

| Avant | Après |
|-------|-------|
| "Livreurs" | `{t('title')}` |
| "Un livreur ne reçoit de course qu'une fois..." | `{t('subtitle')}` |
| "À valider", "Actifs", "Suspendus", etc. | `{t(etat.valeur.toLowerCase())}` |
| "Voiture", "Scooter", "Vélo" | `{t('vehicle', { type: vehicule })}` ou `VEHICULES[type].libelle` |
| "Voir le dossier" | `{t('expandFile')}` |
| "Replier" | `{t('collapseFile')}` |
| "Pièces du dossier" | `{t('file_documents')}` |
| "Aucune pièce déposée..." | `{t('no_documents')}` |
| "validée", "refusée", "à examiner" | `{t('document_status_' + piece.status.toLowerCase())}` |
| "Ouvrir" | `{t('open')}` |
| "Motif (pour un refus...)" | `{t('reason_label')}` |
| "Valider le livreur" | `{t('approve_driver')}` |
| "Suspendre" | `{t('suspend_driver')}` |
| "Refuser le dossier" | `{t('reject_driver')}` |
| "Rétablir" | `{t('restore_driver')}` |

### Section spéciale - Affichage du statut (ligne ~321-336)
```tsx
{piece.status === 'APPROVED'
  ? t('document_status_approved')
  : piece.status === 'REJECTED'
    ? t('document_status_rejected')
    : t('document_status_pending')}
```

---

## 3️⃣ ORGANIZATIONS-_ORGID_-PAGE.TSX
**Namespace**: `superownerOrganizationDetail`

### Imports
```tsx
import { useTranslations } from 'next-intl';
```

### Hook
```tsx
const t = useTranslations('superownerOrganizationDetail');
```

### Replacements clés

| Avant | Après |
|-------|-------|
| "Retour" | `{t('back')}` |
| "Commerçant introuvable" | `{t('merchantNotFound')}` |
| "Status", "Actif", "Suspendu", "Fermé" | `{t('status')}`, `{t('active')}`, etc. |
| "Raison de la suspension" | `{t('suspension_reason')}` |
| "Actions rapides" | `{t('quick_actions')}` |
| "Suspendre" | `{t('suspend')}` |
| "Fermer le compte" | `{t('close_account')}` |
| "Réactiver" | `{t('reactivate')}` |
| "Restaurer depuis backup" | `{t('restore_backup')}` |
| "Plan" | `{t('plan')}` |
| "Mettre à jour" | `{t('update')}` |
| "Sauvegarde..." | `{t('updating')}` |
| "Suspendre le compte" | `{t('modal_suspend')}` |
| "Fermer le compte" | `{t('modal_close')}` |
| "Restaurer le compte" | `{t('modal_restore')}` |
| "Chiffre d'affaires" | `{t('revenue')}` |
| "Commission" | `{t('commission_amount')}` |
| "Commandes" | `{t('order_count')}` |
| "Boutiques" | `{t('stores')}` |
| "Équipe" | `{t('team')}` |
| "Tickets récents" | `{t('recent_tickets')}` |

### Section spéciale - Modal (ligne ~389-447)
```tsx
<h3 className="text-xl font-bold">
  {showActionModal === 'suspend' && t('modal_suspend')}
  {showActionModal === 'close' && t('modal_close')}
  {showActionModal === 'restore' && t('modal_restore')}
</h3>
```

---

## 4️⃣ WEBHOOKS-PAGE.TSX
**Namespace**: `superownerWebhooks`

### Imports
```tsx
import { useTranslations } from 'next-intl';
```

### Hook
```tsx
const t = useTranslations('superownerWebhooks');
```

### Replacements clés

| Avant | Après |
|-------|-------|
| "Webhooks" | `{t('title')}` |
| "Prévenir un système extérieur..." | `{t('subtitle')}` |
| "Créer un abonnement" | `{t('create_webhook')}` |
| "Nouvel abonnement" | `{t('new_webhook')}` |
| "URL" | `{t('url')}` |
| "Événements" | `{t('events', { count: formulaire.events.length })}` |
| "Créer l'abonnement" | `{t('create_button')}` |
| "Création..." | `{t('creating')}` |
| "Choisissez au moins un événement" | `{t('no_events')}` |
| "Aucun abonnement pour l'instant." | `{t('empty')}` |
| "Actif", "En pause", "Coupé" | `{t('active')}`, `{t('inactive')}`, `{t('failed')}` |
| "Envoi d'essai" | `{t('test_send')}` |
| "Derniers envois" | `{t('history')}` |
| "Mettre en pause" | `{t('pause')}` |
| "Réactiver" | `{t('resume')}` |
| "Supprimer" | `{t('delete')}` |
| "Supprimer l'abonnement vers..." | `{t('delete_confirm', { url: abonnement.url })}` |

### Section spéciale - Tableau historique (ligne ~514-557)
```tsx
<thead>
  <tr className="text-left text-gray-500 text-xs">
    <th className="pb-2">{t('history_event')}</th>
    <th className="pb-2">{t('history_response')}</th>
    <th className="pb-2">{t('history_attempts')}</th>
    <th className="pb-2">{t('history_when')}</th>
  </tr>
</thead>
```

---

## 5️⃣ STORES-_STOREID_-PAGE.TSX
**Namespace**: `superownerStoreDetail`

### Imports
```tsx
import { useTranslations } from 'next-intl';
```

### Hook
```tsx
const t = useTranslations('superownerStoreDetail');
```

### Replacements clés

| Avant | Après |
|-------|-------|
| "Retour" | `{t('back')}` |
| "Cette boutique est introuvable" | `{t('storeNotFound')}` |
| "Coordonnées" | `{t('coordinates')}` |
| "Adresse" | `{t('address')}` |
| "Adresse publique" | `{t('publicAddress')}` |
| "Téléphone" | `{t('phone')}` |
| "E-mail" | `{t('email')}` |
| "Position" | `{t('position')}` |
| "non située" | `{t('notLocated')}` |
| "Activité" | `{t('activity')}` |
| "Produits" | `{t('products')}` |
| "Catégories" | `{t('categories')}` |
| "Commandes" | `{t('orders')}` |
| "Chiffre d'affaires" | `{t('revenue')}` |
| "Note" | `{t('rating')}` |
| "Dernière commande" | `{t('lastOrder')}` |
| "Livraison" | `{t('delivery')}` |
| "Dernières commandes" | `{t('recentOrders')}` |
| "Aucune commande pour l'instant." | `{t('noRecentOrders')}` |
| "Qui contacter" | `{t('contact')}` |

### Section spéciale - Edition (ligne ~121-182)
```tsx
const ouvrirEdition = () => {
  setMessage(t('editing') || '');
  // ...
};
```

---

## 6️⃣ SYSTEM-CONFIG-PAGE.TSX
**Namespace**: `superownerSystemConfig`

### Imports
```tsx
import { useTranslations } from 'next-intl';
```

### Hook
```tsx
const t = useTranslations('superownerSystemConfig');
```

### Replacements clés

| Avant | Après |
|-------|-------|
| "Configuration Système" | `{t('title')}` |
| "Paramètres de la plateforme..." | `{t('subtitle')}` |
| "Bornes des commandes" | `{t('order_bounds')}` |
| "Ces deux montants encadrent..." | `{t('order_bounds_note')}` |
| "Commande minimum (€)" | `{t('min_order')}` |
| "Commande maximum (€)" | `{t('max_order')}` |
| "Activer le mode maintenance" | `{t('maintenance_mode')}` |
| "La vitrine et les espaces..." | `{t('maintenance_on')}` |
| "Message affiché aux visiteurs..." | `{t('maintenance_message')}` |
| "Enregistrer" | `{t('save')}` |
| "Enregistrement..." | `{t('saving')}` |
| "Base de données" | `{t('database')}` |
| "PostgreSQL" | `{t('database_status')}` |
| "Webhooks" | `{t('webhooks')}` |
| "actifs" | `{t('webhooks_active')}` |
| "Environnement" | `{t('environment')}` |
| "API v" | `{t('api_version')}` |
| "Clés API" | `{t('api_keys')}` |
| "clés" | `{t('api_keys_count')}` |
| "Nouvelle clé" | `{t('new_key')}` |
| "Nom de la clé" | `{t('key_name')}` |
| "Générer" | `{t('generate_key')}` |
| "Copiez cette clé maintenant..." | `{t('key_created')}` |

### Section spéciale - Headers (ligne ~160-179)
```tsx
<h2 className="text-xl font-bold text-white">{t('order_bounds')}</h2>
<p className="text-sm text-gray-400">
  {t('order_bounds_note')} 
  <Link href="/superowner/formules" className="text-blue-400">
    {t('formules')}
  </Link>
</p>
```

---

## 🎯 Checklist de Migration

Pour chaque page :

- [ ] Importer `useTranslations` et créer le hook `t`
- [ ] Remplacer tous les titres/sous-titres par `t('title')` et `t('subtitle')`
- [ ] Remplacer les labels de formulaire
- [ ] Remplacer les messages d'erreur et de succès
- [ ] Remplacer les textes de boutons
- [ ] Remplacer les textes des colonnes de tableaux
- [ ] Vérifier que toutes les clés existent dans fr.json et en.json
- [ ] Tester avec `NEXT_LOCALE=en` pour l'anglais
- [ ] Tester avec `NEXT_LOCALE=fr` pour le français

## ✅ Vérification Finale

Pour chaque page migrée, lancer :

```bash
# Rechercher les chaînes en français non traduites (sauf les commentaires)
grep -n "text\|message\|placeholder" pages/new-page.tsx | grep -E "[à-ÿ]" | grep -v "//"
```

Si aucun résultat : migration complète ! ✅

---

**Durée estimée** : ~30-45 minutes pour migrer les 6 pages
**Difficulté** : Faible (rechercher/remplacer systématique)
