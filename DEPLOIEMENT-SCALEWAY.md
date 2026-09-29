# Déployer sur un VPS Scaleway

Toute la plateforme tient sur **un seul VPS** (offre `VPS-START-2-M`), dans
Docker :

```
Internet ──443──> Caddy ──> frontend:3000   site Next.js, tous les domaines
   (HTTPS auto)       └───> backend:3001    API Express + Socket.IO (api.…)
                                 └──> postgres:5432   jamais exposé
```

- **Caddy** obtient et renouvelle seul les certificats Let's Encrypt.
- Seuls les ports **22, 80 et 443** sont ouverts.
- Les migrations Prisma s'appliquent à chaque démarrage de l'API.
- Photos, pièces justificatives et base vivent dans des volumes Docker :
  une reconstruction ne les efface pas.

Fichiers utilisés :

| Fichier | Rôle |
|---|---|
| `docker-compose.prod.yml` | Les quatre services de production |
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
curl -fsSL https://raw.githubusercontent.com/AmirGames/projet/main/deploy/installer-serveur.sh -o installer.sh
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
| `STRIPE_*` | clés **live** |
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
4. **Sauvegardes automatiques** (chaque nuit à 3 h) :

   ```bash
   (crontab -l 2>/dev/null; echo "0 3 * * * $HOME/projet/deploy/zup.sh backup >> $HOME/sauvegardes.log 2>&1") | crontab -
   ```

   Elles restent 14 jours dans `~/sauvegardes`. **Copiez-les aussi hors du
   serveur** — si le VPS disparaît, elles disparaissent avec lui. Par exemple
   vers un bucket Scaleway Object Storage avec `rclone`, ou depuis votre
   ordinateur : `scp -r deploy@<IP>:sauvegardes ./`.

## Au quotidien

| Commande | Effet |
|---|---|
| `./deploy/zup.sh update` | `git pull` puis reconstruction et redémarrage |
| `./deploy/zup.sh up` | reconstruit et redémarre (après un changement de `.env.production`) |
| `./deploy/zup.sh logs [service]` | journaux en direct (`backend`, `frontend`, `caddy`, `postgres`, `redis`) |
| `./deploy/zup.sh ps` | état des services |
| `./deploy/zup.sh restart backend` | redémarre un service |
| `./deploy/zup.sh psql` | console SQL |
| `./deploy/zup.sh vapid` | crée les clés du push navigateur dans `.env.production` (une seule fois : les changer rend muets les abonnements existants) |
| `./deploy/zup.sh backup` | sauvegarde base + fichiers dans `~/sauvegardes` |
| `./deploy/zup.sh restore ~/sauvegardes/base-….sql.gz` | restaure la base (demande confirmation) |

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

Au démarrage de l'API, puis chaque nuit à 3 h, le commerce est recréé : une
boulangerie d'exemple avec ses catégories, ses produits et quelques commandes.
Ce que les visiteurs y ont changé disparaît.

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
