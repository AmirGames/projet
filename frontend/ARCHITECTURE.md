# Guide du frontend

Le frontend est une application **Next.js 16** (routeur `app/`), **React 19**,
**TypeScript**, **Tailwind 3** et **next-intl** pour les traductions. Elle
parle à l'API REST du backend (`backend/`, voir `backend/ARCHITECTURE.md`).

> ⚠️ **Ce n'est pas le Next.js de vos habitudes.** `frontend/AGENTS.md` prévient
> que cette version a des changements incompatibles (par exemple `middleware.ts`
> s'appelle ici `proxy.ts`). Avant d'écrire du code qui touche au routage, aux
> composants serveur, à la mise en cache ou aux métadonnées, lisez le guide
> correspondant dans `node_modules/next/dist/docs/` (par exemple
> `01-app/01-getting-started/`).

- [Vue d'ensemble](#vue-densemble)
- [Espaces, domaines et routage](#espaces-domaines-et-routage)
- [Anatomie d'une page](#anatomie-dune-page)
- [Recettes](#recettes)
  - [A. Une page de l'espace superowner](#a-une-page-de-lespace-superowner)
  - [B. Une page de l'espace commerçant](#b-une-page-de-lespace-commerçant)
  - [C. Une page de l'espace livreur](#c-une-page-de-lespace-livreur)
  - [D. Une page publique (client, vitrine, SEO)](#d-une-page-publique-client-vitrine-seo)
  - [E. Un nouvel espace](#e-un-nouvel-espace)
  - [F. Traductions](#f-traductions)
  - [G. Un composant réutilisable](#g-un-composant-réutilisable)
  - [H. Appeler l'API](#h-appeler-lapi)
  - [I. Mettre à jour un écran en temps réel](#i-mettre-à-jour-un-écran-en-temps-réel)
  - [J. Déplacer ou supprimer une page](#j-déplacer-ou-supprimer-une-page)
- [Style](#style)
- [Vérifier son travail](#vérifier-son-travail)
- [Pièges fréquents](#pièges-fréquents)
- [Checklist](#checklist)

---

## Vue d'ensemble

```
frontend/
├── app/                 les pages : un dossier = une adresse, avec un page.tsx
│   ├── layout.tsx       gabarit racine : langue, région, session, temps réel
│   ├── superowner/      espace de l'équipe du groupe (administration)
│   ├── merchant/        espace commerçant (/merchant/[orgId]/…)
│   ├── driver/          espace livreur
│   ├── client/, store/, restaurant/, checkout/, track/…   côté client final
│   ├── (legal)/         pages légales (le groupe (legal) n'apparaît pas dans l'URL)
│   ├── devenir-*/       pages de recrutement (commerçant, livreur, chauffeur)
│   ├── login/, signup/, dashboard/…   pages communes à tous les espaces
│   └── api/             relais vers l'API pour /api/auth et /api/sso (cookies)
├── components/          composants réutilisables (un fichier PascalCase chacun)
├── lib/                 logique partagée : session, temps réel, formats, domaines…
├── i18n/                langues, régions, configuration next-intl
├── messages/            fr.json et en.json : tous les textes traduits
├── proxy.ts             aiguille chaque requête (domaines, régions) — ex-middleware
├── scripts/             vérifications de bout en bout dans un vrai navigateur
└── next.config.js       redirections des anciennes adresses, images, plugin next-intl
```

Ce qui est utilisé, et ce qui ne l'est pas :

- **REST uniquement.** Il n'y a pas d'API GraphQL (`.env.example` le dit) :
  n'ajoutez pas d'appel GraphQL.
- **Pas de segment `[locale]` dans les URL.** La langue vit dans un cookie
  (`NEXT_LOCALE`), ou dans la région de l'adresse pour les pages publiques.
- **Pas de bibliothèque de requêtes imposée.** Les pages existantes appellent
  `fetch` directement (voir [H](#h-appeler-lapi)).
- Bibliothèques présentes : `lucide-react` (icônes), `socket.io-client` (temps
  réel), `leaflet` (cartes), `@stripe/react-stripe-js` (paiement),
  `react-hook-form` et `zod` (formulaires), `zustand` (état partagé).

## Espaces, domaines et routage

Un seul code sert **six publics** qui n'ont rien à faire les uns chez les
autres. C'est le point d'architecture le plus important du frontend.

| Espace | Segment d'URL | Domaine (variable d'environnement) |
|---|---|---|
| `groupe` — l'équipe (superowner) | `/superowner` | `NEXT_PUBLIC_DOMAINE_GROUPE` |
| `pro` — les commerçants | `/merchant`, `/devenir-commercant`, `/store/new` | `NEXT_PUBLIC_DOMAINE_PRO` |
| `livreur` | `/driver`, `/devenir-livreur` | `NEXT_PUBLIC_DOMAINE_LIVREUR` |
| `public` — les clients | `/client`, `/store`, `/restaurant`, `/restaurants`, `/checkout`, `/payment`, `/order-confirmation`, `/track` | `NEXT_PUBLIC_DOMAINE_PUBLIC` |
| `vitrine` — présentation ZupOne | `/zupone` | `NEXT_PUBLIC_DOMAINE_VITRINE` |
| `drive` — ZupDrive | `/zupdrive`, `/devenir-chauffeur` | `NEXT_PUBLIC_DOMAINE_DRIVE` |
| `chauffeur` — chauffeurs ZupDrive (pas les livreurs) | `/chauffeur` | `NEXT_PUBLIC_DOMAINE_CHAUFFEUR` |
| `commun` — accessible partout | `/login`, `/signup`, `/mot-de-passe-oublie`, `/reinitialiser`, `/verifier-email`, `/dashboard` | — |

**Comment ça marche.** `lib/domaines.ts` associe le **premier segment** d'une
URL à un espace. `proxy.ts` lit le nom d'hôte de chaque requête : une page
d'un espace demandée sur le domaine d'un autre est **redirigée** vers le bon
domaine. Cela cloisonne les sessions (chaque domaine a son propre stockage
navigateur) et garde les espaces professionnels hors des moteurs de recherche.

**Conséquences pour vous :**

1. **Sans domaines configurés** (cas de `localhost`), tout est servi sur un
   seul domaine : rien de tout cela ne vous gêne en développement.
2. **Une page dont le premier segment est inconnu** est traitée comme
   « commune » : elle s'affiche partout. Pour qu'une nouvelle page appartienne
   à un espace, elle doit vivre **sous le segment de cet espace**
   (`/merchant/…`, `/superowner/…`), ou son segment doit être ajouté dans
   `SEGMENTS` de `lib/domaines.ts`.
3. **Les liens qui traversent les espaces** (« Voir la boutique », « Espace
   commerçant ») ne s'écrivent pas en dur : utilisez `lienVersEspace(espace,
   chemin)` ou `accueilDe(espace)` de `lib/domaines.ts`.

**Les régions.** Les pages publiques que les moteurs indexent (accueil,
commerces, pages légales) existent aussi sous un préfixe de région
(`/be-fr/restaurants`, `/fr-fr/store/…`). Le proxy retire le préfixe et réécrit
la requête vers la page d'origine : **aucune page n'est dupliquée**. La liste
des segments régionaux est `SEGMENTS_REGIONAUX` dans
`i18n/chemins-regionaux.ts`. Les espaces derrière une connexion et le tunnel de
commande restent sans préfixe.

## Anatomie d'une page

Presque toutes les pages sont des **composants client** (`'use client'` en
première ligne), qui chargent leurs données au montage. Voici le squelette
que suivent les pages existantes :

```tsx
'use client';

import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useEffectChargement } from '@/lib/use-effect-chargement';
import { signalerErreur } from '@/lib/erreurs';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Element {
  id: string;
  name: string;
}

export default function MaPage() {
  const t = useTranslations('monNamespace');
  const [elements, setElements] = useState<Element[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const charger = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`${API_URL}/api/ma-ressource`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(t('loadError'));
      const data = await res.json();
      setElements(data.elements);
      setError('');
    } catch (err) {
      signalerErreur('Chargement impossible :', err);
      setError(err instanceof Error ? err.message : t('genericError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffectChargement(() => {
    charger();
  }, [charger]);

  if (loading) return <p className="text-gray-400">{t('loading')}</p>;
  if (error) return <p className="text-red-400">{error}</p>;

  return (
    <div>
      <h1 className="text-3xl font-bold text-white">{t('title')}</h1>
      {/* … */}
    </div>
  );
}
```

Trois particularités à connaître :

- **`useEffectChargement`** remplace `useEffect` pour lancer un chargement.
  Un `useEffect` qui appelle une fonction contenant un `setState` est signalé
  par la règle `react-hooks/set-state-in-effect` ; ce hook nomme ce cas au lieu
  de le faire taire, et ses dépendances sont vérifiées comme celles d'un effet
  (voir `eslint.config.mjs`).
- **`signalerErreur`** (`lib/erreurs.ts`) remplace `console.error` : elle ne
  journalise pas quand le navigateur quitte la page (les requêtes coupées par
  le départ du visiteur ne sont pas des pannes).
- **Le jeton d'accès** se lit par `localStorage.getItem('accessToken')`.
  Rassurez-vous : `lib/jeton-session.ts` redirige cette clé **vers la mémoire**
  de l'onglet — rien n'est écrit sur le disque, et le jeton est renouvelé en
  silence avant son expiration (15 minutes) grâce à un cookie `httpOnly`. Ne
  stockez jamais un jeton ailleurs.

---

## Recettes

### A. Une page de l'espace superowner

Exemple : une page « Campagnes » à `/superowner/campagnes`.

**1. La page** — `app/superowner/campagnes/page.tsx`, sur le squelette
ci-dessus, avec `useTranslations('superownerCampagnes')` et un appel à
`/api/superowner/campagnes` (voir la recette 3 de `backend/ARCHITECTURE.md`).
Aucune garde à écrire dans la page : le layout de l'espace s'en charge
(`useProtectedRoute`, chargement des droits de l'équipe).

**2. Le lien dans la barre latérale** — `app/superowner/layout.tsx`, dans le
groupe voulu :

```tsx
{ label: t('nav.campagnes'), icon: Megaphone, href: '/superowner/campagnes', section: 'campagnes' },
```

`section` est l'identifiant de droit : le lien n'apparaît que si le rôle de
l'utilisateur ouvre cette section. `null` = réservé au superowner lui-même.
Par défaut, `sectionDuChemin` (`lib/acces-plateforme.ts`) prend le segment
d'URL (`/superowner/<section>/…`) comme nom de section ; les exceptions sont
listées dans le tableau `PAGES` de ce fichier.

**3. Les droits — côté backend** (à ne pas oublier, sinon la page reste
réservée au superowner ou la route est refusée) :

- ajouter la section dans `SECTIONS` de
  `backend/src/modules/auth/permissions-plateforme.service.ts` ;
- y associer les chemins de la route dans le tableau `ROUTES.superowner`
  du même fichier ;
- si des rôles de base doivent l'ouvrir, la cocher dans leurs permissions par
  défaut (même fichier).

**4. Les textes** — `messages/fr.json` **et** `messages/en.json` (voir F) :
le namespace `superownerCampagnes`, et la clé `superowner.nav.campagnes`.

**5. Vérifier** — voir [Vérifier son travail](#vérifier-son-travail).

### B. Une page de l'espace commerçant

Les pages d'une boutique vivent sous `/merchant/[orgId]/…` : le segment
dynamique `orgId` désigne l'organisation.

**1. La page** — `app/merchant/[orgId]/ma-page/page.tsx`. Pour connaître la
boutique et l'organisation courantes :

```tsx
import { useParams } from 'next/navigation';
import { useCurrentStore } from '@/lib/current-store';

const { orgId } = useParams<{ orgId: string }>();
const { storeId, currentStore } = useCurrentStore();   // voir lib/current-store.tsx
```

**2. Le lien de navigation** — `app/merchant/[orgId]/layout.tsx`, dans le
tableau des rubriques :

```tsx
{ label: 'Ma page', icon: Star, href: `/merchant/${orgId}/ma-page` },
```

⚠️ Dans ce layout, **les libellés sont écrits en français en dur** (ils ne
passent pas par `next-intl`), contrairement à l'espace superowner. Suivez
l'usage du fichier, ou traduisez la rubrique que vous ajoutez si vous
souhaitez la rendre bilingue.

**3. Compte suspendu ou fermé.** Le backend refuse l'écriture à un compte
restreint. Côté page, `useStatutCompte(orgId)` (`lib/use-statut-compte.ts`)
donne `restreint` ; le layout en tient déjà compte pour la navigation.

**4. Si la page suit des données modifiées ailleurs** (une commande acceptée
par un collègue), branchez le temps réel : voir [I](#i-mettre-à-jour-un-écran-en-temps-réel).

### C. Une page de l'espace livreur

Sous `app/driver/`. L'espace livreur a **sa propre session** : le jeton est
lu sous la clé `driverToken`, pas `accessToken`.

```tsx
const token = localStorage.getItem('driverToken');
```

Le lien de navigation s'ajoute dans le tableau `navItems` de
`app/driver/layout.tsx` (libellés en français en dur). Les pages `/driver/login`
et `/driver/signup` sont les seules accessibles sans session.

### D. Une page publique (client, vitrine, SEO)

- Les pages client vivent sous `app/client/`, `app/store/`, `app/restaurant/`,
  `app/checkout/`… (voir le tableau des espaces). **Respectez ces segments** :
  une page à un autre premier segment serait traitée comme « commune ».
- **Pages légales** : `app/(legal)/<nom>/page.tsx`. Le groupe entre
  parenthèses n'apparaît pas dans l'URL. Ajoutez le segment dans
  `SEGMENTS_REGIONAUX` (`i18n/chemins-regionaux.ts`) pour qu'elle existe sous
  `/fr-fr/<nom>`.
- **Une page publique doit-elle être indexée par région ?** Si oui, ajoutez
  son segment à `SEGMENTS_REGIONAUX`. Sinon elle reste sans préfixe.
- **Métadonnées** : `app/layout.tsx` définit `canonical` et `hreflang` pour
  toutes les pages publiques (`lib/seo-regional.ts`). Une page qui exporte ses
  propres `metadata` ou `generateMetadata` en hérite. Comme la plupart des
  pages sont des composants client, ces exports vont plutôt dans un
  `layout.tsx` serveur placé à côté (voir `app/store/[slug]/layout.tsx`).
- **Redirection** plutôt que page : `permanentRedirect()` de
  `next/navigation` (exemple : `app/restaurants/page.tsx`).

### E. Un nouvel espace

Un nouvel espace (par exemple un espace « partenaires ») touche plusieurs
fichiers, à faire **ensemble** :

1. `app/partenaires/…` : les pages et un `layout.tsx` (cadre, navigation).
2. `lib/domaines.ts` : ajouter l'espace au type, à `SEGMENTS`, à `ACCUEIL`, à
   `ESPACES_HEBERGES`, et sa variable `NEXT_PUBLIC_DOMAINE_…` (et la documenter
   dans `.env.example`).
3. `lib/auth-context.tsx` : `connexionDeLEspace` renvoie la page de connexion de
   l'espace. **Sans cela, une session expirée laisse l'utilisateur devant un
   écran qui ne charge plus rien.**
4. `components/RootLayoutContent.tsx` : si l'espace porte sa propre navigation,
   l'ajouter à `ESPACES_AVEC_NAVIGATION` (sinon la barre globale s'empile
   par-dessus la vôtre) ; si c'est un espace de travail plein écran, voir
   `estUnEspaceDeTravail` (pas de pied de page).
5. `lib/espaces.ts` : le sélecteur d'espace (`components/SelecteurEspace.tsx`),
   pour les utilisateurs qui ont plusieurs rôles, liste quatre espaces (`client`,
   `driver`, `merchant`, `superowner`) : ajoutez le vôtre au type `Espace` et à
   `ESPACES`.

### F. Traductions

Les textes sont dans `messages/fr.json` et `messages/en.json` (**111
namespaces** aujourd'hui, à parité exacte). Un namespace par page ou par
composant : `superownerApiKeys`, `nav`, `common`…

```tsx
const t = useTranslations('superownerCampagnes');
<h1>{t('title')}</h1>
<p>{t('count', { n: 3 })}</p>          // « … {n} … » dans le JSON
```

Dans un composant **serveur** : `const t = await getTranslations('ns')` (import
`next-intl/server`).

**Règles :**

- Ajoutez chaque clé **dans les deux fichiers**, au même endroit.
- Les textes communs (boutons, « chargement… ») sont dans `common` : ne les
  redéfinissez pas.
- Pour les montants et les dates, utilisez `lib/format.ts` (`euro(...)`) et
  `useLocale()` de `next-intl` pour les dates.

**Ce n'est pas encore généralisé.** Environ **81 pages sur 121** utilisent
`next-intl`. Les autres sont encore en français en dur (espace livreur, pages
légales, certaines pages commerçant…). Une page neuve doit être traduite ; en
modifiant une page ancienne, vous pouvez la migrer au passage (le guide
`i18n/MIGRATION_GUIDE_REMAINING_PAGES.md` en décrit le principe).

**Vérifier la parité** des deux fichiers (à lancer depuis `frontend/`) :

```bash
node -e '
const fr=require("./messages/fr.json"), en=require("./messages/en.json");
const cles=(o,p="")=>Object.entries(o).flatMap(([k,v])=>typeof v==="object"&&v?cles(v,p+k+"."):[p+k]);
const a=new Set(cles(fr)), b=new Set(cles(en));
const m=(x,y)=>[...x].filter(k=>!y.has(k));
console.log("absentes de en:",m(a,b)); console.log("absentes de fr:",m(b,a));
process.exit(m(a,b).length+m(b,a).length?1:0)'
```

**Ajouter une langue** : l'ajouter dans `LANGUES_SUPPORTEES`
(`i18n/langues.ts`), créer `messages/<code>.json`, et vérifier les régions
(`i18n/regions.ts`).

### G. Un composant réutilisable

- Fichier `components/MonComposant.tsx`, nom en **PascalCase** (souvent en
  français : `ChoixPourboire`, `SuiviLivraison`).
- `'use client'` en tête s'il utilise un état, un effet ou le navigateur.
- Il reçoit ses données par `props` et ne connaît pas la page qui l'utilise.
- **Un composant qui touche à `window`** (cartes Leaflet…) se charge sans
  rendu serveur :
  ```tsx
  import dynamic from 'next/dynamic';
  const CarteZones = dynamic(() => import('@/components/CarteZones'), { ssr: false });
  ```
- Un composant réutilisé dans **plusieurs pages d'un même espace** reste dans
  `components/`. Un morceau propre à **une seule page** peut rester dans le
  fichier de la page.
- Import par l'alias `@/` (ex. `@/components/…`, `@/lib/…`), jamais par des
  chemins relatifs qui remontent (`../../..`).

### H. Appeler l'API

L'adresse de base est `process.env.NEXT_PUBLIC_API_URL` (par défaut
`http://localhost:3001`). Le motif habituel, avec le jeton :

```ts
const token = localStorage.getItem('accessToken');
const res = await fetch(`${API_URL}/api/…`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify(donnees),
});
```

- **Format d'erreur de l'API** : `{ error, code }`. Le texte à afficher est
  `error` ; `code` est stable et sert à distinguer les cas.
- **Connexion, inscription, renouvellement, SSO** : ne passez **pas** par
  `API_URL`, mais par le site lui-même (`fetch('/api/auth/login')`). Ces appels
  sont relayés par `app/api/auth` et `app/api/sso`, pour que le cookie de
  renouvellement soit posé par le domaine que visite l'utilisateur (les
  navigateurs refusent les cookies de domaine tiers).
- **Session morte** : `lib/auth-context.tsx` efface la session et renvoie vers
  la connexion de l'espace (`connexionDeLEspace`). Une page n'a pas à gérer
  elle-même l'expiration.
- `lib/api.ts` regroupe une vingtaine d'appels (compte, organisation, boutique,
  produits, catégories, commande). Si un appel y existe déjà, réutilisez-le plutôt
  que d'en réécrire un ; la plupart des écrans, eux, appellent `fetch` directement.

### I. Mettre à jour un écran en temps réel

Une seule connexion Socket.IO par onglet (`lib/temps-reel.tsx`). Pour relire un
écran quand des données changent ailleurs :

```tsx
import { useDonneesModifiees } from '@/lib/temps-reel';

useDonneesModifiees(
  ['delivery-zones', 'stores'],        // familles de données qui vous intéressent
  () => { charger(); },                // relire
  { storeId, actif: Boolean(storeId) } // filtrer par boutique
);
```

**Rien à ajouter côté backend pour une route ordinaire.** Le backend annonce
tout seul, après **chaque écriture réussie**, que « telle famille de données a
changé chez tel commerçant » (`backend/src/modules/realtime/diffusion.middleware.ts`).
Il n'envoie aucune donnée : les écrans concernés se relisent par l'API, qui
applique ses propres droits.

- **Le nom de la famille** est le premier segment après `/api/` :
  `POST /api/delivery-zones` annonce `delivery-zones`, `PUT /api/products/…`
  annonce `products`. C'est ce nom qu'on donne à `useDonneesModifiees`.
- **Exceptions** : les routes d'administration (`/api/superowner/…`,
  `/api/admin/…`) auraient toutes pour famille « superowner » ou « admin » ; le
  tableau `ROUTES` du même fichier leur donne un vrai nom (`tickets`, `drivers`,
  `payouts`, `organizations`, `stores`…). Pour une **nouvelle route
  d'administration**, ajoutez-y une entrée, sans quoi l'écran ne saura pas quelle
  donnée a changé.
- **Visiteurs de la vitrine** : seules les familles listées dans
  `RESSOURCES_PUBLIQUES` du même fichier (produits, catégories, horaires,
  zones, avis…) préviennent aussi les visiteurs non connectés.

`useDonneesModifiees` regroupe les écritures rapprochées en une seule relecture
(300 ms par défaut) et relit aussi l'écran après une coupure de connexion.

### J. Déplacer ou supprimer une page

Une adresse peut être dans des signets, des e-mails ou un moteur de recherche.
Ne la laissez pas casser : ajoutez une redirection dans `next.config.js`
(`redirects()`), comme celles déjà présentes de `/admin` et `/super-admin` vers
`/superowner`. Pour une page publique, `permanentRedirect()` dans l'ancienne
page fait le même travail.

---

## Style

- **Tailwind**, classes dans le JSX. **Tout le site est en thème clair** : la
  vitrine, le client, le commerçant, le livreur, l'administration, les pages
  d'erreur. Il n'y a plus d'espace sombre ; ne réintroduisez pas
  `bg-gray-900` comme fond de page. Reprenez les classes d'une page voisine.
  - **Fond de page** `bg-[#F7F7F6]`, posé par le cadre de l'espace (une page
    n'ajoute ni fond ni `min-h-screen`, ni une seconde marge : le `<main>` du
    cadre a déjà `p-4 sm:p-6`).
  - **Cartes** `bg-white` avec `border border-[#ECECEA]` (ou
    `ring-1 ring-gray-200`), coins `rounded-[18px]` pour les blocs principaux.
  - **Texte** `text-gray-900`, secondaire `text-gray-500` ; titres en
    `font-extrabold tracking-tight`.
  - **Barres latérales** blanches, rubrique active en `bg-orange-50
    text-orange-700` (gris foncé sur fond gris pâle dans l'administration).
- **Les couleurs ont un sens, une par marque** (`lib/marques.ts`) :
  - **ZupEat** (client, commerçant, livreur) : l'action principale est
    **orange** — `bg-orange-600 hover:bg-orange-700 text-white`, en pilule
    (`rounded-full`) ;
  - **ZupOne** (le groupe, la connexion, l'administration) : **noir** —
    `bg-gray-900 hover:bg-black text-white` ;
  - **ZupDrive** : **bleu**, sur ses pages et dans sa partie de
    l'administration ;
  - partout : le **filtre ou l'onglet choisi** en noir, les petits boutons
    **Modifier** en gris (`bg-gray-100`), **Supprimer** en rouge pâle
    (`bg-red-50 text-red-700`). Le **vert** reste pour accepter, valider,
    reprendre, et le **rouge plein** pour les vraies confirmations de
    suppression et les interrupteurs Ouvert / Fermé.
- **Un fond saturé porte toujours sa couleur de texte** (`text-white`) dans
  la même chaîne de classes : hérité d'un parent, le texte peut être foncé et
  devenir illisible. Même règle pour les icônes posées sur de l'orange.
- **Bouton désactivé** : `disabled:opacity-50`, jamais
  `disabled:bg-gray-100` ou `-200` sur un bouton à texte blanc — le texte
  disparaît. Une variante désactivée qui change le fond change aussi le texte
  (`disabled:text-gray-500`).
- **Pas de variantes `dark:`** : la configuration Tailwind n'a pas de
  `darkMode`, elles suivraient le réglage du système et repasseraient une page
  en sombre au milieu d'un espace clair.
- **Composants partagés avec une variante `clair`** : certains servaient à des
  espaces sombres et en gardent la variante par défaut. Sur une page, passez
  `clair` : `SelecteurEspace`, `LanguageSwitcher`, `NotificationBell`,
  `StoreSwitcher`, `AddressAutocomplete`, `AcceptationConditions`,
  `ChangerMotDePasse`, `TicketConversation`, `FilSupport`,
  `GraphiqueColonnes`. Sans elle, le menu ou le champ s'affiche en sombre.
- **Couleurs du thème** : `primary`, `accent`… sont des variables CSS
  (`app/globals.css`, `lib/theme-config.ts`), modifiables par la plateforme
  (Administration → Configuration). Les espaces repris en clair utilisent les
  couleurs de marque ci-dessus, écrites en entier : Tailwind ne génère pas une
  classe composée à l'exécution (`bg-${couleur}-600`).
- **Numéro de commande affiché** : `#` et les 8 **derniers** caractères de
  l'identifiant, en majuscules (`numeroCourt()` de
  `components/CarteCommandeCuisine.tsx`), comme la fiche commande et le ticket
  imprimé. Le début d'un identifiant est horodaté, presque le même d'une
  commande à l'autre.
- **Icônes** : `lucide-react`.
- **Responsive** : pensez téléphone d'abord. Les espaces à barre latérale la
  transforment en tiroir sur petit écran, fermé par défaut et refermé à chaque
  lien suivi (`app/merchant/[orgId]/layout.tsx`, `app/merchant/layout.tsx`,
  `app/superowner/layout.tsx`) ; sur grand écran, elle se replie en icônes.

## Vérifier son travail

Depuis `frontend/` :

```bash
npx tsc --noEmit     # typage — sans erreur aujourd'hui, à garder ainsi (~15 s)
npm run lint         # ESLint (next core-web-vitals + règles du projet) — sans message aujourd'hui (~25 s)
npm run build        # build de production
npm run dev          # http://localhost:3000, l'API doit tourner sur :3001
```

**Vérifications de bout en bout.** Le dossier `scripts/` contient des scripts
`verif-*.mjs` qui pilotent un **vrai navigateur** (Playwright) contre le site
et l'API en marche :

```bash
VERIF_SITE_URL=http://localhost:3000 VERIF_API_URL=http://localhost:3001 \
  node scripts/verif-zones-livraison.mjs
# ou, via npm : npm run verif:zones
```

Chacun s'exécute avec un backend et une base réels (il crée un compte de test).
Pour une nouvelle fonctionnalité importante, écrire un script `verif-*.mjs` sur
le modèle des existants est la manière du projet de la prouver ; ajoutez-le
aux `scripts` de `package.json` (`verif:<nom>`).

**La session d'un script passe par le cookie, comme un vrai navigateur.** Le
jeton d'accès ne vit qu'en mémoire et le renouvellement dans un cookie
`httpOnly` (`lib/jeton-session.ts`) : poser `accessToken` dans `localStorage`
avant d'ouvrir une page ne connecte plus personne, l'appli renvoie vers la
connexion. Utilisez `connecterNavigateur(page, SITE, { email, password })` de
`scripts/inscription.mjs` avant d'ouvrir la page voulue, un contexte
Playwright par compte.

En mode développement, le premier passage après une modification du code peut
dépasser le délai d'un script, le temps que les pages se compilent : relancez
avant de conclure à une régression.

## Pièges fréquents

1. **Une page « au mauvais endroit »** : son premier segment n'est dans aucun
   espace, donc elle s'affiche partout et échappe au cloisonnement. Rangez-la
   sous le bon segment.
2. **Lien en dur vers un autre espace** (`href="https://…"`, ou un chemin qui
   marche en local mais pas en production multi-domaines) : utilisez
   `lienVersEspace` / `accueilDe`.
3. **Clé de traduction dans un seul des deux fichiers** : la page affiche la clé
   brute (ou plante) dans l'autre langue. Lancez le contrôle de parité.
4. **`useEffect` pour charger des données** : le lint le refuse dès qu'un
   `setState` s'y trouve. Utilisez `useEffectChargement`.
5. **`window` ou `localStorage` au rendu serveur** : réservé aux composants
   client, dans un effet ou un gestionnaire ; `dynamic(..., { ssr: false })`
   pour les bibliothèques qui l'exigent.
6. **Page livreur avec le mauvais jeton** : `driverToken`, pas `accessToken`.
7. **Un texte devenu illisible après un changement de fond** : une classe
   `text-white` héritée d'un parent sombre disparaît sur fond clair, et un
   bouton saturé sans couleur de texte prend celle du parent. Voir « Style ».
8. **Nouvelle page superowner qui n'apparaît pas, ou renvoie 403** : la section
   n'existe pas côté backend (`SECTIONS` et `ROUTES`), ou le lien n'a pas le
   bon `section` dans le layout.
9. **Oublier que Next 16 a changé** : `proxy.ts` (et non `middleware.ts`),
   comportements de cache et de composants serveur différents. Lisez
   `node_modules/next/dist/docs/` avant de vous fier à vos habitudes.

## Checklist

- [ ] La page est sous le bon segment d'URL (et le segment est connu de
      `lib/domaines.ts` s'il est nouveau)
- [ ] Le lien de navigation est ajouté dans le layout de l'espace, avec le bon
      `section` pour le superowner
- [ ] Les droits existent côté backend (`SECTIONS` et `ROUTES`) pour une page
      superowner
- [ ] Les textes sont dans `fr.json` **et** `en.json`, parité vérifiée
- [ ] Le chargement, l'erreur et l'état vide sont gérés
- [ ] Aucun jeton stocké ailleurs qu'en `localStorage` (qui est en mémoire)
- [ ] `npx tsc --noEmit` et `npm run lint` passent
- [ ] Thème clair et couleurs de la marque (voir « Style »), variante `clair`
      passée aux composants partagés
- [ ] Vérifiée dans un navigateur, sur téléphone aussi
- [ ] Un ancien lien déplacé a sa redirection dans `next.config.js`
