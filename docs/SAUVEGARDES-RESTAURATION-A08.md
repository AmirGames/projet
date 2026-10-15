# Sauvegardes, restauration et clés — A08

**Version documentaire : 12 octobre 2026.** Cette procédure décrit le contrat
du script A08. Le transfert réel, l'accès au bucket, l'exercice sur une
infrastructure isolée et la validation en exploitation restent à prouver dans
le registre [d'état du projet](etat-projet.md#étape-11--a08-sauvegardes-distantes-et-restauration).

## Périmètre et preuves indépendantes

`deploy/zup.sh backup` produit deux flux chiffrés avec age : un `pg_dump` gzip
de PostgreSQL et une archive tar des répertoires persistants `/app/uploads`,
`/app/private-documents` et `/app/backups`. La base contient les données
métier, comptes, permissions, sessions, paiements et migrations Prisma. Redis
est éphémère et n'est pas une source de vérité.

Les pièces privées sont enregistrées dans les volumes locaux inclus. Les
visuels publics de boutique peuvent être stockés sur Cloudinary lorsque cette
configuration est active : les archives contiennent alors leurs références SQL,
pas les objets du fournisseur. Il faut conserver et exercer séparément la
récupération Cloudinary, ou vérifier qu'aucun visuel requis ne dépend encore du
fournisseur avant de déclarer les médias restaurés.

Les fichiers locaux sont écrits en `.partial` avec `umask 077`, puis renommés
uniquement après réussite des commandes productrices. Le dossier de sauvegarde
est en mode 0700. Un verrou `flock` interdit les passages concurrents. La
rétention locale reste de 14 jours. Une interruption laisse au plus des
`.partial`, qui ne sont jamais considérés comme complets.

La copie rclone est obligatoire par défaut (`BACKUP_REMOTE_REQUIRED=true`).
Une destination vide ne bloque pas la création des archives locales, mais
marque l'enregistrement `REMOTE_FAILED`, fait échouer la commande et conserve
les preuves locales. `BACKUP_REMOTE_REQUIRED=false` permet explicitement un
passage local uniquement : l'enregistrement reste `LOCAL_ONLY`, la commande
réussit avec un avertissement et l'indicateur de santé ne le compte pas.
`REMOTE_FAILED` et `LOCAL_ONLY` ne sont jamais `COMPLETED`.

Pour chaque archive, rclone envoie d'abord `<nom>.partial` dans un sous-dossier
horodaté, puis le script relit l'objet distant et compare son SHA-256 aux octets
locaux. Après promotion, il relit et compare encore l'objet final. Le manifeste
`manifest-<horodatage>.txt` contient les empreintes de la base et des fichiers ;
il n'est publié qu'après vérification des deux objets. **Le manifeste final est
le marqueur de commit distant** : un jeu sans manifeste final est incomplet.
Les transferts et lectures ont un délai maximal de deux heures par commande,
des timeouts réseau et trois retries rclone. Le timer systemd borne aussi un
passage à deux heures et reprend un déclenchement manqué après arrêt.

La ligne SQL `Backup.status=COMPLETED` n'est écrite qu'après vérification et
publication du manifeste. Elle alimente l'état « Sauvegardes » : alerte après
24 h (RPO de travail) et panne après 48 h sans copie complète distante.
L'écran ne prouve ni que l'objet existe encore, ni qu'une restauration a réussi.
Le journal d'exécution est disponible via `journalctl -u
zup-sauvegarde.service`. Un objet tronqué, un échec rclone ou un manifeste absent
laisse un statut d'échec et une commande non nulle ; le timer tentera la nuit
suivante et l'opérateur doit diagnostiquer les `.partial` distants avant
nettoyage.

Le contrat de `copyto`, `moveto`, `cat` et `--immutable` a été vérifié dans la
[documentation officielle rclone](https://rclone.org/commands/rclone_copyto/),
[moveto](https://rclone.org/commands/rclone_moveto/) et
[cat](https://rclone.org/commands/rclone_cat/) le 12 octobre 2026. rclone n'est
pas installé dans l'environnement de développement ; la version du serveur
reste à relever et doit être consignée à l'installation/exercice.

### Contrat API et interface

Les routes d'administration restent protégées par Bearer token et le contrôle
superowner ; aucun contrat HTTP de production n'est ajouté :

| Méthode et route | Comportement après A08 |
|---|---|
| `GET /api/superowner/data-management` | Même réponse `stats`/`backups`. `stats.lastBackup` ne prend que `COMPLETED` + nom `base-distant-*`; chaque ligne expose son statut (`LOCAL_ONLY`, `REMOTE_FAILED`, `COMPLETED`, etc.). |
| `POST /api/superowner/backups` | Crée toujours un export JSON partiel `export-partiel-*` ; `201`, `backupId`, `status`. Il ne remplace pas `deploy/zup.sh backup`. |
| `GET /api/superowner/backups/:backupId/download` | Télécharge seulement un export partiel. Une archive `base-*` gérée par l'exploitation répond `409 BACKUP_MANAGED_EXTERNALLY`. |
| `POST /api/superowner/backups/:backupId/restore` | Réinjecte seulement un export partiel selon le comportement existant ; une archive complète répond `409 BACKUP_MANAGED_EXTERNALLY`. |
| `DELETE /api/superowner/backups/:backupId` | Supprime seulement un export partiel ; les archives de rétention serveur répondent `409 BACKUP_MANAGED_EXTERNALLY`. |

L'écran affiche les états local/échec et n'offre download/restore/delete que sur
`export-partiel-*`. Aucune migration de schéma n'est requise : `Backup.status`
est une chaîne. Les anciens noms `base-*` ne constituent pas une preuve
distante ; le nouveau préfixe `base-distant-*` rend le contrôle conservateur
après déploiement.

## Cibles et limites mesurées

| Mesure | Cible de travail | Preuve disponible au 12 octobre 2026 |
|---|---:|---|
| RPO | 24 h, sauvegarde quotidienne à 03 h 15 ; alerte dès 24 h | Politique/configuration seulement ; aucun passage réel observé |
| RTO | 8 h provisoires pour rétablir API, base et fichiers | Non mesuré ; aucun exercice isolé exécuté |
| Rétention locale | 14 jours | Contrat script ; non inspecté sur serveur |
| Rétention distante | À définir dans la politique du bucket, cible initiale 90 jours | À configurer et prouver côté fournisseur |

Ces cibles sont des objectifs d'exploitation à faire approuver selon le volume
et les engagements réels, pas une promesse client. Elles ne sont pas mesurées
par les contrôles locaux du dépôt. Noter séparément le temps de transfert, le
temps de déchiffrement/restauration PostgreSQL, de restauration fichiers, de
migration, de contrôle applicatif et de remise en service lors d'un exercice.

## Configuration et planification

1. Installer `age`, `rclone`, `coreutils` (`timeout`) et `flock` sur le serveur.
   Configurer `rclone config` sous le compte Unix du service systemd, avec une
   identité à écriture/suppression limitée au préfixe de sauvegarde.
2. Enregistrer `AGE_BACKUP_RECIPIENT` (clé publique) et `BACKUP_REMOTE` dans
   `.env.production`; garder `BACKUP_REMOTE_REQUIRED=true`. Les objets ne
   contiennent que des archives age et empreintes, jamais le fichier d'identité.
3. Installer et contrôler le timer :

   ```bash
   ./deploy/zup.sh planifier-sauvegardes
   systemctl status zup-sauvegarde.timer
   systemctl list-timers zup-sauvegarde.timer --no-pager
   journalctl -u zup-sauvegarde.service --since yesterday
   ./deploy/zup.sh backup
   ```

4. Vérifier la ligne `COMPLETED` dans le panneau « Sauvegardes », le manifeste
   distant, les deux objets et leurs SHA-256. La ligne d'écran seule ne suffit
   pas. Surveillez `systemctl list-timers` et `journalctl`; une absence de
   `COMPLETED` après le passage doit déclencher l'astreinte.
5. Planifier un exercice trimestriel et après toute migration de serveur,
   stockage ou clé. Conserver date, SHA de l'application restaurée, fournisseur,
   versions, tailles, empreintes, résultats et durées dans le registre.

## Clés : sauvegarde, garde et récupération

- `AGE_BACKUP_RECIPIENT` est public ; l'identité age correspondante est privée,
  créée hors du serveur puis conservée dans le coffre d'équipe avec MFA,
  accès nominatif, historique et procédure de secours testée. Elle ne doit
  jamais résider en permanence sur le VPS, dans le dépôt, le bucket ou les
  journaux.
- Les secrets applicatifs ne sont **pas** empaquetés dans les archives :
  conserver `.env.production` dans le coffre de secrets, notamment
  `DATA_ENCRYPTION_KEYS`, `DATA_ENCRYPTION_ACTIVE_KEY`, `PRIVACY_AUDIT_KEY`,
  `FILE_SIGNING_SECRET`, secrets JWT, PostgreSQL, Redis, VAPID, SMTP, Stripe et
  credentials fournisseurs. Sans les clés de chiffrement de données et la
  configuration compatible, des champs ou documents restaurés peuvent rester
  illisibles. Sauvegarder les anciennes clés actives jusqu'à la rotation et la
  rétention de toutes les données chiffrées qu'elles couvrent.
- Lors d'une récupération, ouvrir un incident et récupérer une copie temporaire
  de l'identité age depuis le coffre sur une machine isolée, accès limité et
  disque chiffré. Vérifier le manifeste et les SHA avant déchiffrement. Garder
  les clés hors des arguments/logs autant que possible, restreindre les
  permissions à 0600, supprimer la copie temporaire et vérifier la suppression
  après l'exercice. Révoquer/renouveler les accès après exposition ou incident.
- La perte simultanée de l'identité age et de ses copies coffre rend les archives
  irrécupérables. Tester périodiquement la récupération du coffre lui-même.

## Exercice sur infrastructure isolée

Le contrôle ne restaure jamais dans la base de production. Provisionner d'abord
une base vide `zup_restore_test` sur une infrastructure PostgreSQL de test
distincte du VPS/cluster de production, joignable depuis le serveur d'exercice.
Ne pas réutiliser une base partagée. Exporter temporairement
`RESTORE_TEST_DATABASE_URL` dans le shell d'exercice uniquement ; ne pas
l'ajouter à `.env.production`, qui est transmis à l'application.
Télécharger depuis le bucket les deux objets associés au manifeste et comparer
leurs empreintes. Copier l'identité age temporaire sous droits 0600, puis :

```bash
RESTORE_TEST_DATABASE_URL='postgresql://…@hote-test:5432/zup_restore_test' \
  ./deploy/zup.sh restore-test \
  ~/sauvegardes/base-<horodatage>.sql.gz.age \
  ./identite-age.txt \
  ~/sauvegardes/uploads-<horodatage>.tar.gz.age
```

La commande vérifie le nom de base dédié, le vide avant usage, déchiffre et
contrôle gzip, restaure SQL dans cette base, valide la présence des tables et
migrations, puis extrait l'archive dans un conteneur éphémère sans réseau ni
volumes montés. Ce conteneur est supprimé ensuite. Une requête Prisma confirme
que le client applicatif lit la table des migrations. Elle affiche la durée du
contrôle complet et écrit un relevé sans secrets sous
`$SAUVEGARDES/restore-tests/restore-<date>.txt` en succès comme en échec. Elle ne
recrée pas une machine, ne bascule aucun trafic et ne vérifie pas les parcours
Stripe, courriels ou fournisseurs. Supprimer la base et l'identité temporaires
après inspection. Une base déjà remplie doit être supprimée et recréée
manuellement dans l'environnement de test.

### Remise en service après perte

L'exercice n'est pas un feu vert de bascule. Provisionner un environnement
isolé, récupérer images/configurations et secrets au coffre, restaurer le dump
et les volumes, appliquer les migrations compatibles, contrôler santé/API,
permissions, cloisonnement, documents et journaux. Réconcilier les demandes
d'effacement intervenues après le snapshot, les mouvements Stripe/banque,
webhooks, commandes et opérations en vol avant exposition. Faire approuver le
point de reprise et le plan de bascule par les responsables habilités. Ne
restaurer jamais directement sur l'instance exploitée avec la commande
`restore-test`.

## Injection de pannes et preuves

Exécuter ces cas dans un environnement de recette isolé avec un remote/bucket de
test et des données synthétiques : destination absente, kill du processus en
cours de transfert, objet de test tronqué, erreur rclone, et corruption d'une
archive age ou gzip. Attendus : code non nul pour les copies obligatoires,
statut différent de `COMPLETED`, absence de manifeste final valide, `.partial`
conservé pour diagnostic, alerte de santé et échec fermé de la restauration.
Restaurer enfin les deux archives synthétiques dans `zup_restore_test`, vérifier
la requête Prisma et relever chaque durée. Aucun de ces essais n'a été exécuté
sur une destination ou un serveur réel au moment de cette livraison.

## Vérification complémentaire — 13 octobre 2026

Documenter une restauration isolée effectivement réalisée depuis le stockage distant, avec empreintes, RPO/RTO observés et journal de vérification ; un manifeste ne prouve pas une restauration.

**Statut de cette vérification :** revue de cohérence documentaire, sans exécution de tests, déploiement ni transaction externe. Consigner SHA, preuves et risques résiduels dans [l'état du projet](etat-projet.md) et [la recette A16](RECETTE-PILOTE-A16-2026-10-12.md).
