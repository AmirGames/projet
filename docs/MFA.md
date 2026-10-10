# MFA des comptes privilégiés — A05

## Périmètre et fraîcheur

Le compte `User.isSuperOwner` et chaque `User.isSystemAdmin` exigent le second
facteur. Cela couvre les rôles EAT/DRIVE `SUPER_ADMIN`, `ADMIN`, `SUPPORT` et
les groupes personnalisés (dont facturation/comptabilité). Les permissions
effectives continuent d'être relues dans `AccesEquipe`/`PlatformRole` ; la MFA
ne donne ni section supplémentaire ni accès à une autre organisation.
Les administrateurs sans rôle de plateforme restent concernés et refusés par
les autorisations habituelles. Les appartenances commerçantes `ADMIN`, les
livreurs, chauffeurs et clients ordinaires ne deviennent pas administrateurs
de plateforme : leur propre activité reste hors de cette obligation A05.

Une preuve TOTP de **cinq minutes au maximum** est exigée pour :

- toute mutation authentifiée effectuée par un compte privilégié (POST, PUT,
  PATCH, DELETE), y compris équipe/rôles, suspension, clôture, configuration,
  clés, webhooks, données bancaires et gestion des dossiers ;
- remboursements/reprises, commissions, préparation/annulation/confirmation
  des relevés et lots SEPA EAT, traitement/refus des versements DRIVE ;
- lectures/exportations des sections `billing`, `payouts`, `exports`,
  `financial-reports`, `api-keys`, `webhooks`, `system-config`,
  `advanced-settings`, et des chemins API financiers `billing`, `payouts`,
  `payout-batches`, `exports`, `api-keys`, `webhooks`, `financial-reports`,
  `payments` ;
- rotation et révocation du facteur. Une preuve de récupération récente ne
  permet que ces opérations de gestion du facteur, aucun accès administratif.

Les autres lectures privilégiées exigent une session ayant terminé la MFA.
Les seuls chemins HTTP de préparation autorisés avant MFA sont `/api/auth/me`,
`/api/auth/me/roles`, `/api/auth/mfa` et ses opérations ci-dessous. Login,
renouvellement, déconnexion et transfert SSO restent disponibles ; ils ne
créent jamais une preuve MFA. Les jetons sans `sid` ne peuvent pas franchir une
garde MFA. Les sessions historiques ont des champs de preuve nuls.

## Facteur, secrets et sessions

[otplib 13.5.0](https://github.com/yeojz/otplib) vérifie TOTP SHA1, six chiffres,
période 30 secondes, période courante ou précédente uniquement. Le compteur
accepté est conservé par utilisateur ; un code accepté, même pendant
l'activation, ne peut pas servir dans une autre session. La base PostgreSQL
verrouille la ligne utilisateur pour sérialiser confirmation, consommation,
rotation, récupération et révocation. Les compteurs d'échecs sont committés
même lorsque la réponse est un refus : cinq échecs bloquent quinze minutes.
Le limiteur Redis existant ajoute vingt opérations POST MFA par compte en
quinze minutes, sur toutes les instances. Une panne Redis ferme les opérations
en production (503). Les lectures de statut ne consomment pas ce budget.

`MfaFactor` est un modèle distinct : aucune inclusion dans les réponses
utilisateur usuelles. Ses secrets actif/en attente sont chiffrés AES-256-GCM
avec le trousseau `DATA_ENCRYPTION_KEYS`/`DATA_ENCRYPTION_ACTIVE_KEY` existant,
AAD lié à l'ID utilisateur. Garder les anciennes clés jusqu'au rechiffrement
des facteurs et à la vérification des sauvegardes ; le CLI RGPD ne rechiffre
pas automatiquement ces enveloppes explicites. La rotation du facteur dans
l'interface réécrit son secret avec la clé active. Ne jamais retirer une clé
encore référencée par un facteur ou une sauvegarde nécessaire.

Les dix codes de récupération contiennent chacun 128 bits aléatoires ; seules
leurs empreintes SHA256 liées au compte sont persistées. La clé d'inscription
et les codes ne sont livrés que dans les réponses exceptionnelles `begin` et
`confirm`, sous `Cache-Control: no-store`. Ils restent en mémoire dans les
interfaces, sans stockage navigateur/mobile, URL, QR distant ni journal.
L'ajout manuel dans une application indépendante utilise « ZupOne », TOTP,
SHA1, 6 chiffres, 30 secondes. Conserver les codes hors de l'appareil habituel.

La preuve et la version du facteur sont dans `SessionConnexion`, pas le JWT.
Le SSO réutilise le même `sid` sur les domaines autorisés : le renouvellement
ou le transfert ne rajeunit pas la preuve. Les contrôles HTTP et Socket.IO
relisent la base (connexion, message et diffusion privée). Rotation et
activation ferment les autres sessions ; révocation ferme toutes les sessions.
Les droits retirés, comptes suspendus et cloisonnements restent vérifiés.

## Contrat API

Toutes les opérations sont sur `/api/auth/mfa`, sous bearer access token et
session active. Les corps sont des objets Zod stricts ; aucun ID utilisateur
client n'est accepté. Le backend dérive l'identité du jeton. Utiliser POST avec
corps JSON, jamais de code/secret dans la query ou le chemin.

| Méthode / suffixe | Corps | Réponse / effet |
|---|---|---|
| GET `/` | Aucun | `enabled`, `required`, `verified`, `recent`, `recovery` uniquement |
| POST `/begin` | `{password}` | `{secret, expiresIn:600}` ; préparation liée au `sid`, valide dix minutes. Si facteur actif : preuve récente également obligatoire |
| POST `/confirm` | `{code}` TOTP | `{recoveryCodes:[…]}` une fois ; active/remplace, consomme le TOTP et renouvelle la preuve de cette session |
| POST `/verify` | `{code}` TOTP | `{ok:true}` ; termine la connexion ou renouvelle la preuve récente |
| POST `/recover` | `{code}` hexadécimal 32 caractères | `{ok:true}` ; consomme atomiquement, ferme les autres sessions et limite la session au remplacement du facteur |
| POST `/revoke` | `{}` | `{ok:true}` ; efface secrets/codes et ferme toutes les sessions |

Erreurs stables : 403 `MFA_ENROLLMENT_REQUIRED`, `MFA_REQUIRED`,
`MFA_RECENT_REQUIRED`, `MFA_ROTATION_REQUIRED`, `MFA_INVALID` ; 429 `MFA_LOCKED`
ou `TOO_MANY_REQUESTS` ; 401 `SESSION_INVALIDE` ; erreurs de validation Zod
existantes. Une opération financière refusée n'est pas rejouée automatiquement :
après confirmation, relire l'état et recommencer explicitement l'action.

## Migration et enrôlement existant avant obligation

La migration additive `0068_mfa` ajoute le modèle facteur et trois champs de
session. Aucun facteur n'est inventé pour les comptes existants, aucune session
historique n'est attestée. `npx prisma migrate deploy`, `npx prisma generate`
puis `npx prisma migrate diff --from-config-datasource --to-schema
prisma/schema.prisma --exit-code` sur l'environnement cible avec le rôle de
migration. Le rôle runtime n'a pas de droits DDL. Aucun déploiement n'est
réalisé par cette étape.

1. Vérifier le trousseau/sauvegarde, Redis partagé, HTTPS, horloge NTP et
   confidentialité des logs/proxies. Interdire l'enregistrement des corps MFA
   dans les observateurs HTTP et outils d'assistance côté client.
2. Déployer clients web/admin et migration avec `MFA_MODE=enrollment` (défaut).
   Cette phase **n'atteste pas une protection obligatoire** : les comptes
   jamais enrôlés conservent provisoirement leurs accès. Un compte déjà enrôlé
   ou précédemment révoqué ne peut pas utiliser cette exception.
3. Exécuter `npm run mfa:operator -- inventory` dans backend (source), ou
   `node dist/mfa-operator.js inventory` dans l'image compilée. Le résultat
   ne contient ni e-mail, ni secret, ni code. Faire correspondre les IDs à
   l'annuaire nominatif par le canal opérateur autorisé ; retirer les droits
   des comptes obsolètes. Vérifier l'identité des titulaires avant la première
   inscription ; le vol du mot de passe avant cet enrôlement reste un risque
   de la période préparatoire.
4. Enrôler superowner et équipes EAT/DRIVE via le web ou l'app admin. Chaque
   titulaire confirme le vrai TOTP, conserve les codes et effectue un essai
   de récupération/remplacement accompagné. Préparer deux opérateurs de
   secours et conserver un ticket d'exercice avec preuves d'identité hors Git.
5. Refaire l'inventaire jusqu'à couverture complète des comptes actifs et
   vérifier les groupes facturation/comptabilité personnalisés. Activer
   `MFA_MODE=enforced` sur **toutes** les instances ; redémarrer et vérifier
   la configuration effective. Tester un compte/session non enrôlé, le SSO,
   les deux plateformes, le mobile et un versement simulé refusé après 5 min.
6. Consigner date, SHA, environnement, inventaire, exercices et preuves dans
   le registre. Revenir en `enrollment` après obligation réouvre l'exception
   pour les comptes jamais enrôlés : décision opérateur tracée, pas rollback
   automatique. Garder la migration additive au rollback du code.

## Récupération, révocation et secours opérateur

Avec un code de récupération : se connecter par mot de passe, utiliser le
code, remplacer immédiatement le facteur (mot de passe + possession du nouveau
TOTP), conserver les nouveaux codes. L'ancien facteur et les anciens codes
cessent de servir après confirmation. La session récupérée ne peut pas lire
l'administration ni faire un mouvement financier avant remplacement.

Sans application ni code : aucune récupération par e-mail/mot de passe seul.
L'opérateur ouvre un incident, vérifie l'identité via un canal indépendant
(annuaire connu, rappel au numéro déjà enregistré et pièce/contrôle interne
adapté), et obtient l'accord d'un second opérateur distinct. Les preuves et
la raison sont conservées dans le dossier à accès restreint ; ne pas les mettre
dans les paramètres de commande, logs ou Git. Avec accès OS/DB autorisé :

```bash
node dist/mfa-operator.js recover <userId> <référence-ticket> <vérificateur> <approbateur-distinct>
# En checkout de développement : npm run mfa:operator -- recover …
```

Le CLI exige les références et deux identités distinctes, mais **ne vérifie pas
lui-même une pièce d'identité** : cette vérification appartient aux opérateurs
avant exécution. La transaction ferme les sessions, détruit facteurs/codes,
incrémente la version et enregistre `MFA_OPERATOR_RECOVERY` critique avec ticket
et approbateur. Elle ne fournit aucun accès privilégié : le titulaire doit
refaire login et enrôlement. Ne pas effacer les compteurs anti-abus pour contourner
un blocage. Contrôler le journal et l'inventaire après l'intervention.

En cas de facteur compromis, le titulaire révoque après preuve récente ; s'il
n'en dispose plus, appliquer cette procédure opérateur et examiner les actions
administratives/financières associées. La révocation ne retire pas les droits :
les retirer aussi si le compte doit cesser d'appartenir à l'équipe.

## Tests et limites

Backend : `MFA_INTEGRATION=true DATABASE_URL=…/mfa_test npx jest
src/modules/auth/__tests__/mfa.pg.test.ts --runInBand` (après migration ; base
de test dédiée obligatoire), `npm test`, `npx tsc --noEmit`, `npm run lint`,
`npm run build`. Les plugins ESM d'otplib sont transformés par esbuild dans
Jest ; cela ne modifie pas l'API ni les builds de production.

Frontend : `npx jest --runInBand`, `npx tsc --noEmit`, `npm run lint`,
`npm run build`. Admin : `npx tsc --noEmit`, `npm run lint`,
`npx expo export --platform web --output-dir ../../../.tmp/a05-admin-web`.
Le runner `frontend/scripts/verif-mfa.mjs` ouvre le site compilé et cet export
sur l'API réelle, avec une fixture nominative supprimée en fin d'essai.
`backend/scripts/verification/mfa-test-server.ts` exige NODE_ENV=test et une
base mfa_test ; il n'exécute aucun worker financier. Ne jamais le lancer en
production. Les journaux de la fixture restent comme preuve chiffrée.

Les [preuves datées](preuves-a05-2026-10-10.md) distinguent exécution locale,
CI, intégration, déploiement et exploitation. La preuve Expo web ne vaut pas
validation Android/iOS : effectuer sur appareils connexion, reprise SecureStore,
expiration, révocation distante et perte réseau. Les domaines réels/horloges,
identités d'opérateurs et couverture du roster nécessitent un accès exploitation.
TOTP n'est pas résistant au phishing ; WebAuthn/passkeys pourra faire une étape
séparée. Les automatismes financiers durables Stripe/outbox/jobs n'utilisent
pas une session humaine et restent inchangés.
