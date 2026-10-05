# Politique de chiffrement

## Algorithme et couverture

`backend/src/modules/privacy/crypto.ts` utilise **AES-256-GCM**, clé aléatoire de 256 bits, nonce aléatoire de 96 bits pour chaque écriture, tag d'intégrité de 128 bits. Le contexte (`Model.champ`, `file:chemin`, `backup:id`) est authentifié comme AAD : déplacer un cryptogramme vers un autre champ ou fichier fait échouer la lecture. Le format versionné `zupenc:v1:kid:nonce:tag:contenu` porte seulement l'identifiant de clé. Il n'utilise ni secret JWT ni mot de passe utilisateur.

L'extension Prisma protège les écritures normales, lots, upsert et écritures relationnelles imbriquées, puis déchiffre les lectures et relations incluses. Elle s'applique également aux transactions. Les filtres et tris sur les champs chiffrés sont refusés explicitement. Les tableaux / objets JSON sont enveloppés dans un objet `_encrypted`. Les données retournées à une API restent en clair après autorisation : le chiffrement au repos ne remplace pas un contrôle d'accès.

Liste exacte : `ENCRYPTED_FIELDS` dans `encrypted-fields.ts`, reprise dans l'inventaire CSV. Elle couvre notamment IBAN/BIC/titulaire, téléphones privés, adresses, numéros de licence, numéros administratifs non indexés, instantanés de factures/archives, messages et détails des journaux. Les fichiers privés et exports de sauvegarde sont chiffrés intégralement.

**Limite explicite :** e-mails de connexion et autres clés de recherche, noms recherchés, plaques uniques, dates et coordonnées numériques restent lisibles par le moteur PostgreSQL. Chiffrer les volumes PostgreSQL/WAL, documents, logs et snapshots de l'hébergeur est donc une exigence P1 complémentaire. Les hashes de mots de passe/tokens restent des hashes, jamais des mots de passe/tokens en clair. Le chiffrement du volume n'empêche pas un administrateur SQL habilité de voir les champs non chiffrés applicativement. Des index aveugles et schémas dédiés sont une amélioration P2.

## Gestion des clés

- `DATA_ENCRYPTION_KEYS` : objet JSON `kid → base64`, chaque valeur exactement 32 octets aléatoires. `DATA_ENCRYPTION_ACTIVE_KEY` choisit les nouvelles écritures.
- Provisionner dans un coffre KMS/Vault/gestionnaire de secrets. Le code charge les clés par environnement ; ce n'est pas une intégration KMS automatique. Accès limité à l'identité de l'API et aux opérateurs de rotation habilités.
- `PRIVACY_AUDIT_KEY` : secret HMAC indépendant pour pseudonymiser l'acteur et authentifier chaque événement ; conserver sa version pour vérifier les anciens événements.
- `FILE_SIGNING_SECRET` : secret indépendant pour les capacités documentaires temporaires ; rotation avec redémarrage des instances invalide les anciens liens.
- Ne jamais stocker les clés dans Git, une image, les logs, la base protégée, ni dans l'archive contenant les données chiffrées. Sauvegarde séparée des clés dans le coffre, avec procédure de récupération à deux personnes.
- En test uniquement, sans configuration, une clé éphémère en mémoire permet les tests unitaires. Aucun repli analogue n'est permis en développement ou production.

Générer les valeurs avec un CSPRNG dans le coffre ; ne pas copier une valeur de test. Restreindre permissions des fichiers de secrets à 0600. Garder clés et sauvegardes hors de la même frontière d'accès.

## Rotation

1. Tous les 90 jours par politique initiale, et immédiatement après suspicion de compromission : ajouter un nouveau `kid` sans retirer les anciens.
2. Déployer le trousseau élargi sur toutes les instances ; rendre la nouvelle clé active.
3. Sur fenêtre de maintenance, API et tâches arrêtées, exécuter `privacy:rotate`. Les champs, documents et sauvegardes sont réécrits sous la clé active.
4. Exécuter `privacy:check`, tester une restauration isolée et les lectures autorisées, archiver les compteurs et preuves sans PII.
5. Garder les anciennes clés tant qu'une sauvegarde autorisée les nécessite. Après expiration des sauvegardes et vérification, retirer la clé ancienne du coffre actif suivant la procédure de destruction approuvée.

La rotation HMAC d'audit doit conserver les anciennes clés de vérification dans le coffre et la date du changement. Les événements ne sont pas réécrits. L'API n'offre pas de vérification automatique d'un historique multi-clé HMAC : exporter chaque segment avec sa version et son attestation dans le stockage immuable (P1 exploitation).

## Migration de l'existant

Avant déploiement, réaliser une sauvegarde chiffrée et un essai sur une copie isolée. Arrêter API, workers et écritures externes. Appliquer `0040_privacy_protection`, puis :

```sh
# Depuis backend, avec secrets fournis par le coffre et une base autorisée.
PRIVACY_MAINTENANCE_ACK=stopped npm run privacy:migrate
npm run privacy:check
```

Le CLI parcourt la base par lots, chiffre les champs en clair, supprime les copies inutiles des archives, scanne et migre `uploads/{drivers,merchants,deliveries,chauffeurs}` vers le volume privé, vérifie la copie avant de supprimer l'original, et chiffre les sauvegardes applicatives existantes. `--check` échoue si données ciblées en clair, document externe/manquant, fichier illisible ou clé absente. `--rotate` utilise aussi la même fenêtre de maintenance. Les sorties donnent des compteurs, jamais des valeurs personnelles.

Dans l'image construite, le CLI est `node dist/privacy-storage.js --apply|--check|--rotate`, à lancer avec une entrée de conteneur dédiée pendant que l'API est arrêtée. Le contrôle n'évalue ni le chiffrement des disques, ni les objets restants chez Cloudinary, ni les dumps anciens hors du périmètre applicatif : preuve de nettoyage externe requise. Les dumps SQL gzip antérieurs doivent être chiffrés puis détruits selon procédure, en tenant compte des snapshots et sauvegardes hors site.

À la moindre erreur, conserver le service fermé, réparer sur copie, réexécuter la vérification. Une mauvaise clé ne doit jamais provoquer un repli en clair.
