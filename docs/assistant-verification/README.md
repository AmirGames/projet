# Vérification locale — 5 octobre 2026

Les captures utilisent exclusivement une base PostgreSQL locale jetable et des
comptes de validation. Aucune donnée ou migration de production n'a été modifiée.

- `desktop.png`, `mobile.png`, `ui-results.json` : parcours visiteur ZupOne →
  ZupEat → Support clients, allergènes sans information inventée, HTML et lien
  malveillants neutralisés, relais humain persisté, questions fréquentes ciblées,
  relance « et ensuite ? » sans fournisseur, focus et touche Escape.
- `business.png`, `business-results.json` : session réelle de gestionnaire via
  le login et cookie existants, choix d'établissement, lecture du catalogue,
  disponibilité inchangée avant confirmation et modification confirmée après.
  Les fixtures de ce parcours ont été supprimées à la fin.

Résultats : 193 tests backend passent dans 10 suites, dont 20 tests d'intégration
de l'assistant sur PostgreSQL réel, 27 tests d’aide guidée et 16 tests du
fournisseur local et 4 tests du contrôle CLI indépendant du backend ; 3 tests du
relais Next.js passent. Le CLI est exécuté avec durées JWT invalides et secrets
backend absents : le contrôle et la génération publique fonctionnent quand le
serveur HTTP de test répond, sans charger la configuration ou la base de l’API.
TypeScript backend/frontend et lint frontend ciblé passent. Le bundle backend
et le build Next.js complet (`next build --webpack`) passent.

Le build Turbopack échoue dans cet environnement sur une restriction de
processus/ports pendant PostCSS ; la configuration du projet n'a pas été changée.
Le téléchargement du moteur natif Prisma est refusé par le réseau de validation ;
la génération a utilisé les packages officiels Prisma 7.10.0 et leur moteur WASM
temporaires. L'adaptateur OpenAI est testé avec des réponses contrôlées ; aucun
appel réel n'a été fait sans clé fournisseur. Ollama est testé avec des réponses
contrôlées, notamment via un serveur HTTP local. Le proxy refuse le registre
Ollama (HTTP 403) : aucun vrai modèle n’a été téléchargé ni évalué. Le contrôle
local signale son absence explicitement, et l’aide guidée fonctionne sans modèle.
Les compositions Docker locale et production (profil optionnel) passent la
validation de configuration ; aucun conteneur n’a été démarré ni déployé.

Reproduction du parcours visiteur sur les serveurs locaux :

```bash
cd frontend
PLAYWRIGHT_MODULE_PATH=/chemin/vers/playwright/index.mjs \
CHROMIUM_PATH=/chemin/vers/chromium \
VERIF_SITE_URL=http://127.0.0.1:3000 node scripts/verif-assistant.mjs
```

Pour reproduire le parcours métier, utiliser un compte de test gérant d'une
boutique active, choisir Support restaurants puis un établissement autorisé.
Lire les produits, proposer « Rendre indisponible », vérifier l'absence de
modification, puis confirmer. Utiliser exclusivement une base de développement
jetable : la confirmation modifie réellement le produit.
