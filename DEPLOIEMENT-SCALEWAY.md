# Déployer sur un VPS Scaleway

**État au 4 octobre 2026 :** ZupEat est déjà déployé sur un VPS, avec l'API
à `https://api.zupeat.com`. Ce guide reste la procédure d'installation et
d'exploitation ; il s'applique aussi à un VPS compatible chez un autre
hébergeur. Les validations connues et celles restant à faire sont dans
[docs/etat-projet.md](docs/etat-projet.md).

Pour A04, préparer le [diagnostic en lecture seule et le rapprochement des
versements](docs/VERSEMENTS-CONCURRENCE.md) avant réouverture. Aucune migration
A04 ; éviter des instances backend anciennes et nouvelles simultanées pendant
des mutations de versements. L'intégration, le déploiement et le rapprochement
bancaire ne sont attestés que par le registre et leurs preuves respectives.

Toute la plateforme tient sur **un seul VPS** (offre `VPS-START-2-M`), dans
Docker :

```
Internet ──443──> Caddy ──> frontend:3000   site Next.js, tous les domaines
   (HTTPS auto)       └───> backend:3001    API Express + Socket.IO (api.…)
                                 ├──> postgres:5432   jamais exposé
                                 └──> redis:6379      réseau interne Docker
```

- **Caddy** obtient et renouvelle seul les certificats Let's Encrypt.
- Seuls les ports **22, 80 et 443** sont ouverts.
- Les migrations Prisma s'appliquent à chaque démarrage de l'API.
- Photos, pièces justificatives et base vivent dans des volumes Docker :
  une reconstruction ne les efface pas.

Fichiers utilisés :

| Fichier | Rôle |
|---|---|
| `docker-compose.prod.yml` | Les cinq services : Caddy, frontend, backend, PostgreSQL, Redis |
| `deploy/Caddyfile` | Reverse proxy + HTTPS |
| `deploy/env.production.example` | Modèle de `.env.production` (toutes les variables) |
| `deploy/installer-serveur.sh` | Prépare un VPS neuf (Docker, pare-feu, swap…) |
| `deploy/zup.sh` | Démarrer, mettre à jour, journaux, sauvegarder, restaurer |

---

## 0. Quel système choisir ?

**Ubuntu 24.04 LTS** (recommandé).

| | Ubuntu 24.04 LTS | Debian 12 |
|---|---|---|
| Support de sécurité | jusqu'en **2029** | support normal terminé en 2026 (Debian 13 est sortie) ; LTS jusqu'en 2028 |
| Noyau, paquets | plus récents | plus anciens |
| Mises à jour auto | `unattended-upgrades` | idem |

Les deux fonctionnent avec les scripts fournis (ils détectent le système), mais
partir sur Debian 12 aujourd'hui, c'est prévoir une montée de version bientôt.
Choisissez l'image **Ubuntu 24.04 (Noble Numbat) 64 bits**.

**Ubuntu 26.04 LTS** (proposée par défaut chez OVH) convient aussi : support
jusqu'en 2031, et Docker publie ses paquets pour elle. Le script d'installation
refuse de continuer si ce n'était pas le cas.

> **Chez OVH** (VPS-2 et suivants) tout le guide s'applique, à deux
> différences près : on se connecte en `ubuntu` et non en `root`
> (`ssh ubuntu@<IP>` puis `sudo bash installer.sh`), et le pare-feu réseau
> optionnel d'OVH (*Edge Network Firewall*) doit laisser passer 80 et 443 s'il
> est activé.

## 1. Commander le VPS

Dans la console Scaleway :

1. Commandez le `VPS-START-2-M` avec **Ubuntu 24.04 64 bits**.
2. **Ajoutez votre clé SSH publique** (sinon, créez-en une sur votre ordinateur :
   `ssh-keygen -t ed25519`, puis collez le contenu de `~/.ssh/id_ed25519.pub`).
3. Notez l'**adresse IPv4 publique** du serveur.

## 2. Faire pointer les domaines

Chez votre registrar (OVH, Gandi, Scaleway Domains…), créez un
**enregistrement A** vers l'IP du VPS pour chaque domaine :

```
zupeat.com            A   <IP du VPS>
www.zupeat.com        A   <IP du VPS>
manager.zupeat.com    A   <IP du VPS>
delivery.zupeat.com   A   <IP du VPS>
driver.zupdrive.com   A   <IP du VPS>
api.zupeat.com        A   <IP du VPS>
manager.zupone.com    A   <IP du VPS>
```

Vérifiez avant de continuer (la propagation prend de quelques minutes à
quelques heures) : `dig +short api.zupeat.com` doit rendre l'IP du VPS.
**Sans cela, Let's Encrypt refuse les certificats.**

## 3. Préparer le serveur (une seule fois)

Depuis votre ordinateur :

```bash
ssh root@<IP du VPS>
```

Puis, sur le serveur :

```bash
curl -fsSL https://raw.githubusercontent.com/AmirGames/projet/claude/awesome-ride-m9lci8/deploy/installer-serveur.sh -o installer.sh
bash installer.sh
```

> Dépôt privé ? Le `curl` ci-dessus échouera : copiez le script depuis votre
> ordinateur avec `scp deploy/installer-serveur.sh root@<IP>:installer.sh`.

Le script installe les mises à jour de sécurité automatiques, Docker et
Compose (dépôt officiel), le pare-feu UFW (22/80/443), fail2ban, 4 Go de swap
(le build Next.js en a besoin sur une petite machine), et crée l'utilisateur
**`deploy`** avec votre clé SSH. Il désactive la connexion SSH par mot de passe.
On peut le relancer sans risque.

À partir de maintenant, connectez-vous en `deploy` :

```bash
ssh deploy@<IP du VPS>
```

## 4. Récupérer le code

**Dépôt public :**

```bash
git clone https://github.com/AmirGames/projet.git
cd projet
git switch claude/awesome-ride-m9lci8
```

**Dépôt privé** — une *deploy key* en lecture seule :

```bash
ssh-keygen -t ed25519 -f ~/.ssh/github_deploy -N ""
cat ~/.ssh/github_deploy.pub
```

Collez la clé dans GitHub → dépôt → *Settings* → *Deploy keys* → *Add deploy
key* (sans cocher « write access »), puis :

```bash
cat >> ~/.ssh/config <<'EOF'
Host github.com
  IdentityFile ~/.ssh/github_deploy
EOF
git clone git@github.com:AmirGames/projet.git
cd projet
git switch claude/awesome-ride-m9lci8
```

## 5. Configurer `.env.production`

```bash
cp deploy/env.production.example .env.production
nano .env.production
```

À remplir au minimum :

| Variable | Valeur |
|---|---|
| `DOMAINES_SITE` | les domaines du site, séparés par des virgules |
| `DOMAINE_API` | `api.zupeat.com` |
| `EMAIL_LETSENCRYPT` | votre adresse |
| `FRONTEND_URL`, `SITE_URL`, `ALLOWED_ORIGINS` | adresses `https://` du site |
| `POSTGRES_PASSWORD` | `openssl rand -hex 24` |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | deux `openssl rand -hex 32` **différents** |
| `STRIPE_*` | clés **TEST** pendant la validation ; clés LIVE après validation du compte Stripe, avec le secret du webhook de ce même mode |
| `SMTP_*`, `EMAIL_FROM` | votre service d'envoi de courriels |
| `SUPEROWNER_EMAIL`, `SUPEROWNER_PASSWORD_HASH` | le compte propriétaire de la plateforme, créé au premier démarrage (empreinte bcrypt **entre apostrophes**, commande dans le fichier modèle) |

Générer les secrets d'un coup :

```bash
sed -i \
  -e "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$(openssl rand -hex 24)/" \
  -e "s/^JWT_SECRET=.*/JWT_SECRET=$(openssl rand -hex 32)/" \
  -e "s/^JWT_REFRESH_SECRET=.*/JWT_REFRESH_SECRET=$(openssl rand -hex 32)/" \
  .env.production
chmod 600 .env.production
```

> Un seul domaine ? Mettez `DOMAINES_SITE=zupeat.com` et laissez les quatre
> `NEXT_PUBLIC_DOMAINE_*` vides.

**Confirmation d'adresse (`REQUIRE_EMAIL_VERIFICATION`).** En production, un
compte ne peut se connecter qu'une fois son adresse confirmée par le lien reçu
à l'inscription : c'est le comportement quand la variable n'est pas définie.
`REQUIRE_EMAIL_VERIFICATION=false` suspend l'exigence, par exemple le temps
que des comptes créés avant cette règle confirment leur adresse (« Renvoyer le
lien » sur la page de connexion) ; `true` l'impose partout. Dans tous les cas,
les commandes passées sans compte avec une adresse ne rejoignent le compte de
même adresse qu'après confirmation. **Le SMTP doit donc fonctionner avant
l'ouverture.**

**Courriels.** Le port 25 sortant est généralement bloqué sur les VPS : passez
par un service SMTP. Scaleway Transactional Email (`smtp.tem.scw.cloud`,
port 465) fonctionne bien ; déclarez-y votre domaine et ajoutez les
enregistrements SPF/DKIM qu'il indique, sinon les messages partent en
indésirables.

## 6. Lancer

```bash
./deploy/zup.sh up
```

Le premier lancement construit les images (compter 5 à 15 minutes selon la
machine), démarre PostgreSQL, applique les migrations, puis demande les
certificats. Suivre :

```bash
./deploy/zup.sh ps            # tout doit être « Up », backend « healthy »
./deploy/zup.sh logs backend
./deploy/zup.sh logs caddy    # obtention des certificats
```

Vérifier :

```bash
curl https://api.zupeat.com/health/ready    # {"status":"ok","pret":true,…}
```

puis ouvrez `https://zupeat.com`.

## 7. Juste après le lancement

1. **Vérifiez le compte plateforme.** Aucune inscription ne donne les droits
   de superowner : le conteneur de l'API le crée au démarrage à partir de
   `SUPEROWNER_EMAIL` et `SUPEROWNER_PASSWORD_HASH` (ou `SUPEROWNER_PASSWORD`)
   de `.env.production` (voir §5), et ne fait plus rien ensuite. Les journaux
   le disent :

   ```bash
   ./deploy/zup.sh logs backend | grep -i superowner   # « Superowner créé : … »
   ```

   Variables oubliées : remplissez-les, puis `./deploy/zup.sh up` (ou
   `./deploy/zup.sh superowner` après avoir recréé le conteneur). Une fois le
   compte créé, videz ces lignes. Connectez-vous ensuite sur
   `https://manager.zupone.com`. La base n'admet qu'un superowner : l'équipe
   s'ajoute depuis le panneau, avec des rôles.
2. **Webhook Stripe** : tableau de bord Stripe → *Développeurs* → *Webhooks* →
   endpoint `https://api.zupeat.com/api/payments/webhook`, événements
   `payment_intent.succeeded`, `payment_intent.payment_failed`,
   `payment_intent.canceled`, `charge.refunded`, `refund.failed`,
   `refund.updated`. Copiez le secret `whsec_…` dans `STRIPE_WEBHOOK_SECRET`,
   puis `./deploy/zup.sh up`.
3. **Applications mobiles** : faites-les pointer vers `https://api.zupeat.com`.
4. **Sauvegardes automatiques** (chaque nuit vers 3 h 15) :

   ```bash
   ./deploy/zup.sh planifier-sauvegardes
   ```

   C'est un timer systemd : une nuit où le serveur était éteint est rattrapée
   au redémarrage, et chaque passage est dans `journalctl -u zup-sauvegarde.service`.
   (Sans systemd, planifiez `zup.sh backup` avec cron.)

   Elles restent 14 jours dans `~/sauvegardes`. **Copiez-les aussi hors du
   serveur** — si le VPS disparaît, elles disparaissent avec lui. Installez
   `rclone`, configurez un remote vers un bucket Scaleway Object Storage, puis
   renseignez `BACKUP_REMOTE=<remote>:<bucket>/zupone` dans `.env.production` :
   `zup.sh backup` y copie alors chaque sauvegarde (déjà chiffrée) et sort en
   erreur si la copie échoue. Sans cette variable, le script le signale à
   chaque passage.

   Chaque sauvegarde réussie est enregistrée en base : la carte « Sauvegardes »
   de la santé de la plateforme passe à l'orange si la dernière a plus de deux
   jours. L'export partiel de l'écran *Données* n'en fait pas partie : ce n'est
   pas une sauvegarde.

   **Une sauvegarde jamais restaurée n'est qu'une hypothèse.** Chaque trimestre,
   et après tout changement de serveur : copiez la clé privée age depuis le
   coffre, lancez
   `./deploy/zup.sh restore-test ~/sauvegardes/base-….sql.gz.age ./identite-age.txt ~/sauvegardes/uploads-….tar.gz.age`
   (restauration dans une base jetable, comparaison avec la production, lecture
   de l'archive des fichiers, base supprimée ensuite), puis supprimez la clé du
   serveur. La commande affiche la **durée de la restauration** : notez-la, c'est
   votre délai de reprise réel, à comparer à ce que vous promettez aux commerçants.

## Au quotidien

| Commande | Effet |
|---|---|
| `./deploy/zup.sh update` | `git pull` puis reconstruction et redémarrage |
| `./deploy/zup.sh up` | reconstruit et redémarre (après un changement de `.env.production`) |
| `./deploy/zup.sh logs [service]` | journaux en direct (`backend`, `frontend`, `caddy`, `postgres`, `redis`) |
| `./deploy/zup.sh ps` | état des services |
| `./deploy/zup.sh version` | le commit qui tourne vraiment (API et site), lu sur leurs sondes de vie |
| `./deploy/zup.sh restart backend` | redémarre un service |
| `./deploy/zup.sh psql` | console SQL |
| `./deploy/zup.sh vapid` | crée les clés du push navigateur dans `.env.production` (une seule fois : les changer rend muets les abonnements existants) |
| `./deploy/zup.sh backup` | sauvegarde base + fichiers dans `~/sauvegardes` |
| `./deploy/zup.sh planifier-sauvegardes` | installe la sauvegarde nocturne (timer systemd) |
| `./deploy/zup.sh restore-test <base-….sql.gz.age> <identite.txt>` | exercice de restauration dans une base jetable, sans toucher à la production |
| `./deploy/zup.sh restore` | explique la restauration de production, volontairement manuelle (voir `docs/rgpd/exploitation.md`) |

> **Migrations.** Elles ne sont plus lancées au démarrage de chaque instance de
> l'API : le service `migrate` les applique une seule fois, avant elle
> (`docker compose … logs migrate`). S'il échoue, l'API de la version précédente
> reste en place et `zup.sh up` s'arrête. Pour que l'API ne puisse pas modifier le
> schéma, créez un rôle d'exécution avec `deploy/roles-sql.sql` (voir le fichier :
> `DATABASE_URL_APP` pour l'API, `DATABASE_URL_MIGRATION` pour les migrations).
>
> **Utilisateur des conteneurs.** L'API et le site tournent sans droits root
> (utilisateur `node`). Au premier démarrage de cette version, l'API rend ses
> volumes existants (photos, documents privés, sauvegardes, journaux) à cet
> utilisateur : cela peut prendre un moment sur de gros volumes.

> Les variables `NEXT_PUBLIC_*` (domaines, clé Stripe publique, adresse de
> l'API) sont inscrites dans le site **au moment du build** : après les avoir
> changées, relancez `./deploy/zup.sh up`, un simple redémarrage ne suffit pas.

## En cas de problème

- **Certificat refusé** (`logs caddy`) : un domaine ne pointe pas encore vers
  le VPS (`dig +short <domaine>`), ou les ports 80/443 sont fermés dans le
  *groupe de sécurité* Scaleway du serveur.
- **Le build du site s'arrête sans message** (`Killed`) : manque de mémoire.
  Vérifiez le swap (`swapon --show`) ou relancez l'installation avec
  `SWAP_GO=6 bash installer.sh`.
- **L'API redémarre en boucle** : `./deploy/zup.sh logs backend`. En tête,
  « Invalid environment variables » liste ce qui manque dans
  `.env.production` (les secrets JWT font au moins 32 caractères).
- **Erreurs CORS dans le navigateur** : le domaine affiché dans la barre
  d'adresse doit figurer dans `FRONTEND_URL` ou `ALLOWED_ORIGINS`.
- **Disque plein** : `docker system df`, puis `docker builder prune -f`.

---

## Compte démo commerçant

Un compte commerçant public, pour qu'un prospect essaie l'espace pro sans
s'inscrire. Ses identifiants s'affichent sur la page de connexion, avec un
bouton qui remplit le formulaire.

Dans `.env.production`, puis `./deploy/zup.sh up` :

```
DEMO_MERCHANT_ENABLED=true
DEMO_MERCHANT_EMAIL=demo@zupeat.com
DEMO_MERCHANT_PASSWORD=<un mot de passe à part : il est public>
```

Le commerce est recréé : une boulangerie d'exemple avec ses catégories, ses
produits et quelques commandes. Ce que les visiteurs y ont changé disparaît
dans ces cas :

- au démarrage de l'API, et chaque nuit à 3 h ;
- quand le visiteur se déconnecte ;
- quand un autre visiteur (autre adresse IP ou autre navigateur) se connecte
  alors que le précédent n'a rien fait depuis 5 minutes ;
- quand plus personne n'a rien fait depuis 15 minutes (onglet fermé sans
  déconnexion).

Un visiteur qui arrive pendant qu'un autre est encore actif ne remet rien à
zéro : il partagerait sinon son travail. Il voit l'état de l'autre. Le
visiteur est reconnu à son IP et à son navigateur : deux personnes sur la même
connexion avec le même navigateur comptent pour une. La démo tient sur une
seule instance de l'API.

Il reste hors du réel :

- la boutique n'est jamais listée aux clients et refuse toute commande ;
- les reversements l'ignorent ;
- coordonnées bancaires, pièces justificatives, envois marketing, équipe,
  support, fichiers et changement de mot de passe sont fermés en écriture
  (réponse `403`, code `DEMO_ACCOUNT`) ;
- les clients d'exemple ont une adresse en `.invalid` : aucun courriel n'y part.

Il apparaît dans la liste des commerçants de la plateforme (organisation
« Boulangerie Démo », slug `commerce-demo`). Pour le retirer : retirer
`DEMO_MERCHANT_ENABLED`, puis le supprimer depuis l'espace plateforme.

## Content-Security-Policy (CSP_MODE)

Le site envoie une CSP à nonces (`frontend/lib/csp.ts`, posée par `proxy.ts`).
`CSP_MODE` (serveur uniquement, `.env.production`) :

| Valeur | Effet |
|---|---|
| `report-only` (défaut) | observation : rien n'est bloqué, les violations arrivent dans la page Monitoring (erreurs navigateur, message `CSP …`) |
| `enforce` | la politique est appliquée |
| `off` | plus d'en-tête CSP dynamique (retour arrière immédiat) |

Passage à `enforce` : laisser tourner en `report-only` sur tous les domaines,
dont un paiement Stripe de test et les pages à carte (suivi de livraison,
zones, ZupDrive), jusqu'à ce qu'il ne reste que des violations d'extensions de
navigateur. Ajouter toute origine légitime dans `construireCsp`, relancer
`node scripts/verif-csp.mjs`, puis basculer et redémarrer le conteneur
`frontend`. Les violations CSP ne comptent pas dans le seuil d'incident
« erreurs navigateur ».
