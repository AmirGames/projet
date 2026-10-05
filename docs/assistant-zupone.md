# Assistant ZupOne — installation et exploitation

## Intégration réalisée

Le dépôt conserve Next.js 16 / React 19, Express 5, Prisma 7 / PostgreSQL, le
compte ZupOne et ses sessions, les memberships et les permissions de plateforme.
Le widget est monté une seule fois dans `RootLayoutContent`, hors impression et
transition SSO. Il couvre les surfaces web existantes ; les applications natives
Expo ne sont pas modifiées par cette intégration web.

Le backend REST vit sous `/api/assistant`. Le navigateur passe par le relais
Next.js homonyme. Le relais résout un **Host explicitement configuré**, ignore
`X-Forwarded-Host`, et signe hôte, surface, méthode, chemin, corps et identité de
session. Express vérifie la signature et le même mapping. Aucun champ `brand`,
`role`, `userId` ou `orgId` reçu du navigateur ne donne de droit. Les URL avec
query string sont refusées par ce relais. Les clés fournisseur et de signature
ne portent jamais le préfixe `NEXT_PUBLIC`.

### Surfaces effectivement trouvées

| Surface prévue | Code de surface | État du dépôt |
| --- | --- | --- |
| zupone.com | one | Vitrine `/zupone`, domaine configurable existant |
| zupeat.com | eat | Parcours client, boutiques, commandes |
| zupdrive.com | drive | Présentation publique et trajets V1 |
| manager.zupeat.com | eat-manager | Espace marchand existant |
| delivery.zupeat.com | eat-delivery | Espace **livreur de repas**, `/driver` ; ce n'est pas un chauffeur ZupDrive |
| manager.zupdrive.com | drive-manager | Les fonctions société existent dans l'API (`/api/zupdrive/societe`) ; aucun domaine manager ZupDrive distinct n'est déclaré dans `lib/domaines.ts`. Ne l'activer que lorsque son hébergement/routage a été configuré. |
| driver.zupdrive.com | drive-driver | Chauffeurs et portail sécurisé existants |
| manager.zupone.com | one-manager | Administration commune existante |

Ces noms sont des exemples de configuration, **pas la preuve d'un déploiement
ou d'un DNS actif**. Le mapping assistant doit correspondre aux domaines
`NEXT_PUBLIC_DOMAINE_*` et à `DOMAINES_SITE` réellement configurés. N'ajouter
aucune entrée pour une surface non servie.

## Configuration

1. Installer les dépendances avec `npm ci` dans `backend` et `frontend`.
2. Renseigner la configuration existante (PostgreSQL, secrets JWT distincts,
   URL internes, SSO). Redis reste obligatoire en production pour les quotas.
3. Renseigner `ASSISTANT_HOSTS` et `ASSISTANT_GATEWAY_SECRET` **sur les deux
   serveurs**. Les exemples sans secret sont dans leurs `.env.example`.
4. Après sauvegarde et revue, appliquer la migration additive
   `20261005160000_assistant_zupone`, selon le processus habituel du projet,
   puis générer Prisma Client. Cette migration crée cinq tables et leurs index,
   sans suppression de table ni transformation de données métier.
5. Construire et démarrer les services selon les instructions du dépôt. Le
   compose de production transmet les deux paramètres de relais à Next.js.

Exemple de mapping **à adapter aux surfaces déployées**, en JSON sur une seule
ligne dans les variables d'environnement :

```json
{"zupone.com":"one","zupeat.com":"eat","zupdrive.com":"drive","manager.zupeat.com":"eat-manager","delivery.zupeat.com":"eat-delivery","driver.zupdrive.com":"drive-driver","manager.zupone.com":"one-manager"}
```

En développement : `{"localhost:3000":"one","127.0.0.1:3000":"one"}`.
Changer une valeur de ce mapping puis redémarrer les deux serveurs permet de
vérifier un accueil ZupEat/ZupDrive. Il n'existe pas de sélecteur de marque de
développement exposé au navigateur. Les boutons « Changer de service » changent
le sujet de conversation, jamais l'identité ni la surface du déploiement.
Les entrées localhost sont refusées en production.

### Variables de l'assistant

| Variable | Usage / défaut |
| --- | --- |
| ASSISTANT_HOSTS | JSON d'hôtes exacts avec port si nécessaire ; identique sur Next et Express ; vide en production = aucune surface acceptée |
| ASSISTANT_GATEWAY_SECRET | Secret aléatoire partagé, au moins 32 caractères ; obligatoire en production. Valeur locale fixe réservée au développement/test |
| ASSISTANT_MODE | `auto` par défaut ; `real`, `degraded`, `simulation` disponibles. Simulation interdite en production |
| ASSISTANT_PROVIDER | `ollama` par défaut : local gratuit, aucun repli payant. `openai` uniquement sur sélection explicite |
| ASSISTANT_OLLAMA_URL | `http://127.0.0.1:11434` en local, `http://ollama:11434` dans le réseau Docker. Seuls localhost, les boucles IPv4/IPv6 et le service Docker `ollama` sont acceptés ; aucun chemin, identifiant, query ou fragment |
| ASSISTANT_OLLAMA_MODEL | Modèle local installé ; vide = mode dégradé. Exemple officiel compact : `qwen3:1.7b` |
| ASSISTANT_OLLAMA_IMAGE | Image Docker officielle ; `ollama/ollama:latest` pour démarrer. Fixer une release/digest vérifiée avant production |
| ASSISTANT_OPENAI_KEY | Facultatif, côté backend uniquement ; utilisé seulement avec `ASSISTANT_PROVIDER=openai` |
| ASSISTANT_OPENAI_MODEL | Modèle autorisé dans votre compte, compatible Responses, fonctions strictes et sorties structurées ; utilisé seulement avec le fournisseur OpenAI explicitement sélectionné |
| ASSISTANT_DAILY_MESSAGES | Budget collectif de messages IA par fenêtre de 24 h ; 1000 par défaut |
| ASSISTANT_RETENTION_DAYS | Expiration absolue des conversations connectées : 30 jours |
| ASSISTANT_GUEST_DAYS | Session visiteur et conversations : 1 jour |
| ASSISTANT_PRIVACY_URL | `/confidentialite` par défaut ; chemin local ou HTTPS sur un hôte configuré |
| ASSISTANT_DISABLED_AGENTS | IDs stables séparés par virgules ; chargés au démarrage |
| ASSISTANT_TEST_DATABASE_URL | Base locale explicite `*_test`, uniquement pour tests d'intégration |
| TRUST_PROXY_CIDRS | IP/CIDR réels des proxys autorisés, séparés par virgules ; remplace `TRUST_PROXY` s'il est renseigné |

Les valeurs de conservation sont bornées de 1 à 365 jours. Le budget est une
limite d'appels/messages, **pas une garantie de dépense en euros**. Chaque
message est borné à 4000 caractères, 12 messages de contexte au plus, 3 tours
fournisseur, 4 appels d'outils au maximum, 1200 tokens de sortie par appel OpenAI
(512 pour Ollama, contexte de 8192 tokens et requête bornée à 24 000 caractères) et
25 secondes de génération ; le classificateur ambigu peut ajouter un appel de
5 secondes. Limites supplémentaires : 100 messages utilisateur par conversation,
15 messages/minute par utilisateur/session, 60 requêtes/minute par utilisateur
ou IP du relais. Les quotas utilisent le stockage Redis existant en production
et refusent les appels si la protection partagée est indisponible.

Le Caddyfile accepte les hôtes `DOMAINES_SITE`, retire les en-têtes de signature
entrants, et bloque l'accès public à `/api/assistant` sur le domaine de l'API.
Le relais joint Express via `API_INTERNAL_URL`. Ne pas publier directement les
ports des serveurs Next/Express. Configurer `TRUST_PROXY_CIDRS` avec les adresses
réelles de votre réseau ; à défaut le nombre de sauts `TRUST_PROXY` existant
suppose que Caddy est la seule entrée de l'API. Aucun en-tête d'hôte arbitraire
ne doit être ajouté au mapping pour faire disparaître un refus.

## IA locale gratuite : démarrage

Le fournisseur par défaut est désormais **Ollama local**, sans clé d'API IA et
sans facturation au message par un fournisseur externe. Il utilise la machine
où il tourne : un hébergement VPS et l'électricité conservent leurs coûts.
Une ancienne clé OpenAI ne suffit plus à sélectionner le fournisseur payant.
Il n'existe **aucune bascule automatique d'Ollama vers OpenAI**.

Le modèle compact documenté est [Qwen3 1.7b](https://ollama.com/library/qwen3:1.7b),
dont les poids occupent environ 1,4 Go et dont la fiche annonce les outils,
plusieurs langues et une licence Apache 2.0. Sa qualité et sa vitesse doivent
être évaluées sur vos usages ; un petit modèle peut se tromper. Les permissions,
accès aux objets et confirmations restent entièrement contrôlés par le backend.
Les neuf agents partagent une seule instance du modèle avec des prompts et
outils distincts ; neuf copies du modèle ne sont pas nécessaires.

### Développement sur votre ordinateur

Avec Ollama installé selon sa [documentation officielle](https://docs.ollama.com/quickstart) :

```bash
OLLAMA_NO_CLOUD=1 ollama serve
# Dans un second terminal : téléchargement initial seulement, pas à chaque chat.
ollama pull qwen3:1.7b
```

Ou avec Docker, depuis la racine du dépôt :

```bash
docker compose -f docker-compose.assistant.yml up -d
docker compose -f docker-compose.assistant.yml exec ollama ollama pull qwen3:1.7b
```

Le compose de développement publie uniquement `127.0.0.1:11434`. Dans le `.env`
**backend**, en complément de la configuration existante :

```dotenv
ASSISTANT_PROVIDER=ollama
ASSISTANT_MODE=auto
ASSISTANT_OLLAMA_URL=http://127.0.0.1:11434
ASSISTANT_OLLAMA_MODEL=qwen3:1.7b
ASSISTANT_OPENAI_KEY=
ASSISTANT_OPENAI_MODEL=
```

Vérifier depuis `backend` après avoir configuré les variables Ollama dans son
`.env` :

```bash
npm run assistant:check-local
# Vérification supplémentaire d'une génération réelle, uniquement publique :
npm run assistant:check-local -- --generate
```

Ce contrôle charge uniquement le transport Ollama et les connaissances publiques.
Il ne démarre pas l’API, ne valide pas les variables JWT, ne se connecte pas à
PostgreSQL et n’exécute aucun outil métier. Il utilise un contexte de 4096 tokens ;
le backend conserve son contexte de 8192. Pour démarrer l’application complète,
la configuration habituelle reste obligatoire, notamment `JWT_EXPIRES_IN=15m`
et `JWT_REFRESH_EXPIRES_IN=7d`, valeurs imposées par la politique existante.

Le premier appel du modèle peut prendre plus de temps. Le backend refuse un
résultat incomplet ou trop lent et garde alors les catégories, les outils métier
et le relais humain. Il n'installe ni ne télécharge un modèle depuis une demande
de chat. Un modèle sans capacité `tools` peut répondre aux questions, tandis que
les boutons métier sécurisés continuent à fonctionner indépendamment du modèle.

### Serveur Docker existant

Le service `ollama` du compose de production est **optionnel**, sous le profil
`assistant-local`, sans port publié. Les variables sont fournies dans
`deploy/env.production.example` ; le backend joint `http://ollama:11434`.
Lors d'un déploiement explicitement autorisé, démarrer ce profil et télécharger
le modèle via `docker compose ... --profile assistant-local exec ollama ollama pull qwen3:1.7b`.
Conserver les mêmes options `--env-file .env.production -f docker-compose.prod.yml`
que le déploiement existant. Le service ne démarre pas avec le déploiement
habituel sans activation du profil. Fixer l'image vérifiée à un digest avant
production, dimensionner RAM/CPU/GPU et tester le temps de réponse. Aucun
déploiement ni téléchargement sur un serveur de production n'a été effectué.

`OLLAMA_NO_CLOUD=1` désactive les fonctions cloud et la recherche web de ce
service. Le backend refuse les noms contenant `cloud`, les modèles annoncés
comme distants et les origines publiques. Les seuls appels fournisseur permis
sont `/api/show` et `/api/chat` sur l'origine locale configurée ; aucune clé
OpenAI n'y est transmise. Le contrôle de disponibilité est mis en cache pendant
30 secondes (3 secondes après un échec), et le widget affiche le mode dégradé
si le service/modèle n'est pas disponible. Les champs de pensée internes ne
sont ni persistés, ni affichés.

L'adaptateur utilise [l'API chat officielle](https://docs.ollama.com/api/chat),
[les appels d'outils](https://docs.ollama.com/capabilities/tool-calling) et
[les sorties JSON structurées](https://docs.ollama.com/capabilities/structured-outputs),
avec validation Zod des réponses et suggestions. Limites locales : 512 tokens
de sortie, fenêtre de 8192 tokens, historique de 12 messages et 10 000 caractères
au maximum, corps de contexte de 24 000 caractères, réponse de 128 Ko,
25 secondes par génération et 5 secondes pour le classement. Les boucles restent
bornées à 3 tours et 4 outils. Un contexte trop grand déclenche un retour explicite
au mode dégradé ; les contrôles métier côté serveur restent applicables.

## Agents, connaissances et routage

Les neuf IDs stables sont `one-orientation`, `eat-customer`, `eat-commercial`,
`eat-restaurant`, `eat-courier`, `drive-passenger`, `drive-driver`,
`drive-partner`, `drive-commercial`. Chaque définition porte un prompt versionné
`1.0.0`, son service, audience, outils, authentification par outil et règles de
relais. ZupOne Orientation ne possède aucun outil privilégié.

Les documents de `knowledge.ts` contiennent uniquement des faits techniques
confirmés par le dépôt, avec service, audience, validation, version, date et
source. Les documents privés sont exclus **avant** récupération ; leur ingestion
reste désactivée. Faire valider les contenus métier par les responsables avant
d'enrichir cette base. Aucune politique ou grille tarifaire de concurrent n'est
importée. Les connaissances sont des données séparées du prompt système.

Les boutons donnent une catégorie explicite. Les règles déterministes couvrent
les demandes évidentes, secours, relais et confidentialité. Un classificateur
strict (Ollama local ou Responses selon le fournisseur sélectionné) intervient seulement si la catégorie manque et les règles
sont incertaines. Sa sortie est validée par Zod puis limitée aux agents actifs du
service courant ; elle n'exécute rien et ne change aucun droit. Une catégorie
choisie reste stable. Un autre service exige la sélection explicite de l'utilisateur.

Un changement de service, catégorie ou établissement ouvre un nouveau segment,
annule les propositions en attente et efface le périmètre précédent. L'historique
conserve son service/agent/segment ; il peut être relu par son propriétaire, mais
seuls les messages du segment actif sont transmis au fournisseur. Une nouvelle
conversation ne supprime pas les précédentes. Aucun historique ne migre
automatiquement entre domaines, ni d'une session invitée vers un compte.

## Aide guidée gratuite, sans clé ni modèle

Sans fournisseur disponible, le widget affiche explicitement « Aide guidée, IA
indisponible ». Les questions fréquentes sont filtrées par service et spécialité.
Cliquer sur une question envoie un message normal ; cela n’exécute pas d’action
métier et ne crée pas de ticket automatiquement.

`backend/src/modules/assistant/faq.ts` contient des fiches publiques versionnées,
reliées aux connaissances autorisées et aux parcours réellement intégrés : suivi,
retards, articles manquants, annulation, paiements, allergènes, impression,
disponibilités, horaires, retrait/remise, objets perdus et démarches commerciales.
Une demande inconnue reçoit une question courte. Une demande d’une autre
spécialité invite à changer explicitement de catégorie.

Les réponses indiquent quand se connecter ou sélectionner un établissement.
Ces indications ne constituent pas des permissions : les outils restent
contrôlés côté serveur. Les relances courtes utilisent seulement le dernier
message utilisateur du segment courant ; un changement de service, catégorie
ou établissement coupe ce contexte. Les urgences, demandes de conseiller,
suppression de données et secrets suivent les règles déterministes prioritaires.

Ce fonctionnement ne fait aucun appel IA et ne coûte pas de consommation API.
L’hébergement habituel de l’application reste nécessaire. Il ne prétend pas
connaître un statut actuel sans lecture métier, ni comprendre librement toutes
les formulations. Faire valider et maintenir les fiches lors des changements
de parcours ou de règles métier. Les fonctions financières absentes restent
explicitement désactivées.

## Fonctionnalités réellement actives

En mode dégradé comme en mode IA, les boutons métier peuvent lire les commandes
du client connecté, les commandes/catalogue/horaires d'un établissement choisi
et autorisé, les courses attribuées et gains enregistrés d'un livreur, et les
courses du contexte passager, chauffeur ou société dont le compte est gérant.
Les champs retournés excluent les contacts clients, données bancaires, adresses
privées des courses et identité privée du chauffeur/passager.
Chaque outil possède aussi un schéma de sortie Zod strict : champs supplémentaires,
statuts de commande inconnus et résultats hors limites sont refusés avant transmission.

Disponibilité d'un produit et horaires d'un jour utilisent une proposition
persistée, avec établissement, objet, conséquences et expiration de 5 minutes.
La confirmation n'accepte aucun nouveau paramètre, relit les permissions, le
statut de l'organisation et la version de la cible, puis consomme l'action et
modifie l'objet dans une transaction sérialisable. La validation des plages et
le helper de permissions sont partagés avec les parcours existants. Un employé
peut lire les boutiques autorisées, sans les gérer. Un périmètre vide est un
refus explicite ; ce contrôle commun a été corrigé pendant les tests.
Un verrou atomique de conversation empêche les messages, outils, confirmations,
changements de contexte et suppressions de se croiser pendant une opération.

L'annulation passager ZupDrive réutilise `CourseDriveService` et ses états
autorisés avant début de course. L'action est verrouillée avant exécution ; après
un timeout le serveur consulte le résultat métier sans la rejouer. Un état
incertain reste signalé et demande un conseiller. Aucun paiement ni remboursement
ZupDrive n'est exécuté. Les actions sensibles alimentent le journal d'audit
existant, sans contenu du chat ni secret.

Les pièces jointes, l'IA en streaming, la recherche de connaissances privées,
le remboursement/gestes commerciaux automatisés, l'annulation client ZupEat
depuis le bot, les changements bancaires, sanctions et contrats sont
**désactivés**. Leurs demandes sont orientées vers les parcours sécurisés ou le
support. L'application existante conserve ses fonctions métier classiques.
La rémunération/les reversements ZupDrive ne sont pas disponibles en V1.
La tarification commerciale et les allergènes ne sont jamais inventés.

## Relais humain et administration

« Parler à un conseiller » demande un motif et l'accord de transmission. Une
demande explicite dans le chat déclenche également le relais. Le backend ne
confirme l'enregistrement qu'après persistance. Le résumé ne copie pas le fil
de discussion ni les résultats privés : service, spécialité, identité vérifiée
ou non, motif déclaré, état confirmé de la demande et prochaine étape.

Pour un établissement sélectionné et un membre de son organisation, le relais
crée un `MerchantTicket` et réutilise la notification d'ouverture existante.
Les réponses administratives dans ce ticket sont reprises dans le widget.
Les autres demandes vivent dans la boîte minimale `/superowner/assistant` :
prise en charge, réponse et résolution. Le serveur filtre lecture et écriture
par la permission existante `support-tickets` de chaque plateforme. ZupOne
Orientation est réservé au superowner pour le traitement humain, puisqu'aucune
permission de plateforme ONE n'existe. Le compte de démonstration ne peut pas
transmettre de demande réelle.

Le widget relit les réponses humaines toutes les 15 secondes pendant l'ouverture
de la conversation. Il n'annonce ni conseiller en ligne, ni délai, ni attente
synchrone. Les tickets marchands conservent leur propre politique de rétention,
indépendamment de la suppression du chat.

## Confidentialité et exploitation

Les conversations sont contrôlées sur chaque objet par propriétaire **et hôte**,
ou par empreinte d'un cookie visiteur aléatoire httpOnly/SameSite Strict, Secure
et préfixé `__Host-` en production. Un identifiant seul ne donne aucun accès.
Un JWT annoncé mais invalide est refusé, sans passage silencieux en invité.
Les écritures exigent une origine exacte et du JSON, le relais borne le corps
avant parsing. Les réponses utilisent Markdown sans HTML, images ou liens
externes arbitraires ; seuls des chemins locaux validés sont rendus comme liens.
Un changement de compte détruit immédiatement l'état privé du widget.

Les formats courants de clés API, JWT/Bearer, mots de passe identifiés, numéros
de carte et IBAN sont masqués avant stockage et transmission. Ce filtrage ne
peut pas reconnaître tous les secrets exprimés librement : ne pas inviter les
utilisateurs à en saisir, ne pas journaliser les corps et faire tourner une clé
exposée via son portail sécurisé. Les journaux d'outils contiennent acteur,
outil, cible, résultat utile sous forme d'état/code et dates, sans résultats
privés ni erreurs fournisseur brutes.

La purge horaire supprime les conversations expirées avec leurs messages,
propositions, relais et traces d'outils ; les opérations incertaines sont
préservées pour réconciliation. L'expiration bloque immédiatement la lecture,
même avant purge. La suppression explicite du chat est proposée avec
confirmation, refusée pendant une opération en cours. La suppression du compte
utilise la relation propriétaire en cascade ; la suppression du profil client
ZupEat efface aussi ses conversations du contexte client ZupEat. Les parcours
existants d'accès/rectification/suppression et la page de confidentialité restent
les références pour les autres données et tickets.

À valider avant activation réelle : compte fournisseur, modèle autorisé,
localisation/traitement des données, contrat et conservation du fournisseur,
budget, politique de confidentialité publiée, durée du support et des audits,
procédures d'exercice des droits, responsable du traitement et équipe de support.
`store:false` est utilisé pour les réponses OpenAI ; il ne constitue pas à lui
seul une garantie juridique ou une suppression de tous les journaux fournisseur.

## Tests reproductibles

```bash
cd backend
npm run test:assistant
# Tests d'intégration facultatifs : préparer uniquement une base locale *_test
# avec le schéma/migrations du dépôt ; ne jamais utiliser une base de production.
ASSISTANT_TEST_DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/zup_assistant_test npm run test:assistant:integration
```

La garde refuse une URL distante ou un nom ne finissant pas par `_test`.
Les tests d'intégration créent puis effacent uniquement leurs fixtures dédiées.
Sans URL explicite, ils sont signalés comme ignorés dans la suite habituelle.

Vérifications : TypeScript frontend/backend, lint des nouveaux fichiers frontend,
bundle backend, tests de routage/signature/SDK, autorisations sur PostgreSQL réel,
isolation d'établissements, refus employé, confirmations/idempotence, expiration,
cible modifiée, permission révoquée, timeout réconcilié, session invitée,
conversations étrangères, CSRF, refus des actions financières, relais marchand,
changement de service et fournisseur indisponible. Les tests de cloisonnement et
permissions de plateforme existants sont également relancés.

Le script `frontend/scripts/verif-assistant.mjs` utilise Playwright et un
Chromium local configurables, sur les serveurs de développement. Il vérifie le
widget à 1440×1000 et 390×844, HTML/liens malveillants, focus/Escape et relais.
La réduction du viewport mobile à 420 pixels vérifie l'adaptation à un clavier.
Les captures et résultats de validation locale figurent sous
`docs/assistant-verification`. Le parcours crée une vraie demande sur la base
de développement : ne pas le lancer contre la production.

Résultats de cette validation : **193 tests backend dans 10 suites**, dont
**20 tests d'intégration de l'assistant sur PostgreSQL réel**, **27 tests d’aide
guidée**, **16 tests du fournisseur local** et **4 tests du contrôle CLI indépendant
du backend**, ainsi que **3 tests du
relais Next.js** passent. TypeScript, lint ciblé et bundle backend passent.
Le build Next.js complet passe avec `next build --webpack` ; Turbopack rencontre
une restriction de processus/ports de la sandbox pendant PostCSS. La stack et
le script de build existants sont conservés. Un parcours navigateur connecté a
également vérifié la sélection d'établissement et une modification de
disponibilité réellement exécutée, exclusivement après confirmation.

Les fournisseurs réels n'ont pas généré de réponse durant cette validation :
aucune clé OpenAI n’était configurée et le proxy réseau refuse l’accès à
`registry.ollama.ai` (HTTP 403), empêchant le téléchargement du modèle local.
Les adaptateurs et leurs refus/limites sont testés avec des réponses contrôlées ;
le transport Ollama est également vérifié sur un serveur HTTP local de test.
Cela ne constitue pas une mesure de qualité ou de vitesse d’un vrai modèle.
Le contrôle `assistant:check-local` confirme explicitement l’indisponibilité
sans annoncer d’IA connectée. Les compositions Docker sont validées sans être
lancées et sans déploiement. Les
SDK du projet n'ont pas été remplacés. Documentation officielle consultée :
[Responses et function calling](https://developers.openai.com/api/docs/guides/function-calling),
[sorties structurées](https://developers.openai.com/api/docs/guides/structured-outputs),
et les guides de Route Handlers et d’accessibilité inclus dans Next.js installé.
Les références officielles Ollama utilisées figurent dans la section locale.

L'environnement de validation refuse le téléchargement natif de Prisma depuis
`binaries.prisma.sh`. Le client et la migration ont donc été générés avec les
packages officiels Prisma 7.10.0 et leur moteur WASM installés dans `/tmp`, puis
vérifiés sur PostgreSQL local. Aucun de ces outils temporaires n'est ajouté aux
dépendances de l'application. La commande standard `prisma generate` reste celle
du build/deploiement normal lorsque le réseau permet ce téléchargement.
