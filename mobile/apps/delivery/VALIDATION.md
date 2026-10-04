# Validation de ZupEat Livreur

Préparation locale du **4 octobre 2026**, sous Windows. L'application vise
`https://api.zupeat.com` et les pages publiques de `https://zupeat.com`.
Aucun parcours authentifié sur le VPS n'a été exécuté pendant cette préparation.

## Contrôles locaux

| Contrôle | Résultat |
|---|---|
| Dépendances Expo SDK 57 | Versions alignées ; `expo-speech` et `expo-dev-client` installés |
| `npm run typecheck` | Réussi |
| `npm run lint` | 0 erreur, 30 avertissements |
| `npx expo-doctor` | 21/21 contrôles réussis |
| Export JavaScript Android | Réussi |
| Compilation APK Android | Réussie : `assembleRelease`, ARM64, Android 10 minimum |
| Signature et contenu APK | Signature v2 valide ; JavaScript, adresse VPS et ressources Firebase vérifiés ; même certificat que l'APK précédent |
| Clé FCM V1 dans EAS | Attribuée à l'identifiant Android, projet Firebase `zupeat-a1e82` confirmé dans EAS |
| Push sur téléphone | Réception d'une push confirmée par l'opérateur après configuration Firebase |
| Tests des alertes `npm run test:alerts` | 4/4 : formats FCM, payloads rejetés, offres expirées/étrangères, lots |
| Fenêtre et son en silencieux | Module Android compilé ; affichage et actions à essayer sur téléphone |

Les 30 avertissements du lint concernent les mises à jour d'état dans des
effets (20) et les imports `require` (10), notamment les modules natifs chargés
à la demande. La règle `react-hooks/set-state-in-effect` reste visible au
niveau avertissement ; les autres erreurs de hooks ont été corrigées.
Le lint couvre `app`, `components`, `lib` et les sources TypeScript du module local.

## Compilation locale Android

Le dossier `android/` est généré avec Expo Prebuild et reste ignoré par Git.
Les sources natives présentes avant cette préparation ont été sauvegardées
dans `.expo/android-before-validation-20261004-162242/`.

Sous Windows, la première tentative a échoué dans Prefab avec le JDK 25
d'Android Studio. Un JDK 17 Temurin portable, téléchargé depuis Adoptium et
vérifié par SHA-256, a été placé dans `.expo/toolchains/` pour ce build.
Une deuxième tentative a dépassé la limite de métadonnées Java de 512 Mo ;
la relance utilise 1,5 Go pour ces métadonnées et deux tâches simultanées.
Les réglages sont transmis au build, sans modifier les fichiers Android générés.

Pour reproduire avec un JDK 17 et le SDK Android installés, définir
`JAVA_HOME` et `ANDROID_HOME`, puis depuis `mobile/apps/delivery` :

```powershell
$env:EXPO_PUBLIC_API_URL = 'https://api.zupeat.com'
$env:EXPO_PUBLIC_SITE_URL = 'https://zupeat.com'
npx expo prebuild --platform android --no-install
Push-Location android
try {
  & .\gradlew.bat ':app:assembleRelease' '--no-daemon' '--console=plain' `
    '--max-workers=2' '-Dorg.gradle.jvmargs=-Xmx3072m -XX:MaxMetaspaceSize=1536m' `
    '-Pkotlin.compiler.execution.strategy=in-process' '-PreactNativeArchitectures=arm64-v8a'
} finally {
  Pop-Location
}
```

Cette cible produit un APK ARM64 avec son JavaScript intégré. La signature
de test du projet généré ne constitue pas la signature de publication Google
Play. Pour la diffusion, utiliser les profils EAS de [PUBLICATION.md](PUBLICATION.md).
Le journal du premier build est `.expo/android-build-final.log` ; celui du
build avec le logo choisi est `.expo/android-build-logo-v2.log`, et celui
intégrant Firebase est `.expo/android-build-firebase.log` (réussi en 6 min 54 s).

Le premier fichier d'essai Firebase a été copié dans
`dist/zupeat-livreur-test-2026-10-04-firebase-arm64.apk` (90 606 694 octets,
environ 91 Mo). `dist/` est ignoré par Git : le fichier est disponible sur ce poste,
il doit être reconstruit ou transféré pour un autre poste.
SHA-256 : `DB929080CC9185FE897CDF2BB46DFDA28EEE26472D0974460876F12C13E08C1D`.

Le logo source `output/mobile-icons/zupeat-delivery-app-v2.png` est copié sans
modification dans `assets/images/icon.png`. Expo a généré l'icône Android et
le lancement sur fond bleu. L'icône native a été inspectée visuellement, puis
sa présence dans l'APK a été vérifiée par empreinte du fichier. Le build avec
le logo réussit ; TypeScript et lint ont été relancés avec les mêmes résultats.

Transférer cet APK sur un téléphone Android ARM64 sous Android 10 ou supérieur,
l'ouvrir depuis ses fichiers et autoriser cette installation si Android le
demande. Il contient son JavaScript : Metro et Expo Go ne sont pas nécessaires
pour cet essai. Ouvrir ZupEat Livreur et utiliser un compte livreur ; la
validation du dossier reste nécessaire pour recevoir des courses.

L'opérateur a installé un APK précédent sur son Android et signalé le défaut
des push. Aucun appareil n'était connecté au PC lors du contrôle. Le nouvel
APK Firebase a ensuite permis la réception d'une push, confirmée par
l'opérateur. La fenêtre automatique et le son en silencieux sont ajoutés
dans la version 1.0.1 décrite ci-dessous ; les parcours complets restent à essayer.

Les callbacks du GPS, de la carte, des alertes et des écrans sont maintenant
synchronisés après validation du rendu. Le curseur de confirmation initialise
ses gestes après montage ; le compteur de proposition conserve son heure de
première apparition. Leur comportement doit encore être vérifié sur appareil.

## Configuration des notifications

Le projet EAS est déjà référencé : `face34d3-1569-4bfa-ab6f-2b830dffa311`.
L'accès à `@zupone/zupeat-delivery` est confirmé. La consultation initiale
des identifiants Android dans EAS affichait « None assigned yet » pour FCM V1.
Après configuration, EAS confirme la clé attribuée à
`com.amir_games.zupeatdelivery`, projet `zupeat-a1e82` et compte
`firebase-adminsdk-fbsvc@zupeat-a1e82.iam.gserviceaccount.com`.

Le projet Firebase **ZupEat** (`zupeat-a1e82`, numéro `78834912802`) a été
créé avec l'accord de l'opérateur, sur le forfait Spark affiché sans frais.
L'application **ZupEat Livreur**, package `com.amir_games.zupeatdelivery`,
y est enregistrée sous l'identifiant
`1:78834912802:android:2cf6a4bfc5b2e5205ac47b`. La console confirme que
l'API Firebase Cloud Messaging V1 est activée.

L'opérateur a fourni `google-services.json` après téléchargement manuel.
Le projet, le package et l'identifiant de l'application ont été vérifiés,
puis le fichier a été placé dans le dossier de l'application et relié dans
`app.json` par `android.googleServicesFile: "./google-services.json"`.
Expo Prebuild a généré `android/app/google-services.json` à l'identique et
les plugins Google Services dans Gradle. La reconstruction est réussie.
La signature v2 de l'APK est valide. Les ressources `google_app_id`,
`gcm_defaultSenderId` et `project_id` de l'APK correspondent au projet ;
le JavaScript intégré contient l'adresse VPS et aucune clé privée.

L'opérateur a autorisé la création de la clé privée du compte de service
Firebase et son envoi au projet Expo/EAS, puis fourni le fichier téléchargé.
Son type, le projet et le compte de service ont été vérifiés. Il est conservé
dans `.expo/credentials/firebase-fcm.json`, ignoré par Git et absent de l'APK.
L'envoi de la clé et son attribution FCM V1 dans EAS sont réussis.
L'opérateur confirme désormais la réception d'une push sur son Android.
Cela confirme le chemin d'envoi pour ce téléphone ; l'affichage natif et les
actions sur le verrouillage nécessitent leurs propres essais.
Voir [PUBLICATION.md](PUBLICATION.md#4-notifications-push).

**Retour de l'opérateur, le 4 octobre :** les propositions et la sonnerie
apparaissent au retour dans l'application, mais aucune alerte n'est reçue
pendant qu'elle est en arrière-plan. Le code distingue le temps réel en
premier plan des notifications Android : l'APK construit sans configuration
Firebase ne valide pas ce second chemin. Le serveur contient l'envoi Expo
sur le canal `new-courses-v2`, avec son et bouton « Accepter » ; son exécution
sur le VPS reste à confirmer. La clé FCM V1 est désormais attribuée dans EAS.
Relever l'état « Notifications push » dans les paramètres de l'application
après installation du nouvel APK avant de tester une nouvelle proposition.

Le message fourni ensuite par l'opérateur confirme le blocage : état
« Inactives », instance Firebase Messaging indisponible et `Default FirebaseApp`
non initialisée pour `com.amir_games.zupeatdelivery`. Le fichier
`google-services.json` et son lien `android.googleServicesFile` sont maintenant
ajoutés pour la reconstruction. La clé FCM V1 est également configurée
pour le projet Expo. Une push est désormais reçue. Les boutons et les nouvelles
alertes doivent être essayés pendant qu'une autre application est affichée
et écran verrouillé. Le changement de logo ne corrige pas cette configuration manquante.

## Alertes Android 1.0.1

Le module local `modules/course-alerts` est lié par Expo. Android est généré
avec `versionCode: 2` et le runtime OTA suit la version applicative 1.0.1.
Les APK 1.0.0 ne peuvent pas recevoir ce nouveau module par une simple mise à
jour JavaScript. Le journal de compilation est `.expo/android-build-course-alerts.log`.

Les options **Fenêtre Nouvelle course** et **Sonner même en silencieux** sont
désactivées par défaut. La première ouvre le réglage Android d'affichage
au-dessus des autres applications ; l'Activity dédiée utilise `showWhenLocked`
et `turnScreenOn`, sans déverrouiller le téléphone. Elle expose uniquement la
proposition, avec Accepter/Refuser, délai, commerce, villes et montant.
La seconde joue la sonnerie avec `USAGE_ALARM` et un service `mediaPlayback`
pendant la proposition. Aucun volume, mode silencieux ou réglage DND n'est
modifié ; alarmes à zéro ou DND bloquant les alarmes restent muets.

La tâche de notification relit les propositions authentifiées avant affichage,
rejette les expirées et celles absentes de cette réponse, puis transmet des
données sans secret au module natif. Les réponses natives utilisent la tâche
Expo existante et sa session SecureStore, pas un jeton dans un Intent.
Le service s'arrête à la réponse/expiration, hors ligne ou à la déconnexion ;
sa notification permet aussi de couper la sonnerie. La notification push
habituelle reste le recours si Android bloque le démarrage natif.

**Essais restant sur appareil** : activer les deux options, accorder
l'affichage, régler un volume d'alarmes audible, puis « Tester la fenêtre dans
5 s » en quittant l'application et en verrouillant l'écran. Cette démo de
15 s n'appelle aucun endpoint de réponse. Tester ensuite une vraie course en
ligne : accepter/refuser, expiration, push en double, lot, retrait d'autorisation,
déconnexion/hors ligne, volume nul, DND et retour dans l'application.
Aucun téléphone n'est connecté au PC : ces comportements ne sont pas encore
déclarés validés.

## Essais à effectuer sur un téléphone Android

- [ ] Installer la build et vérifier connexion, déconnexion et reprise de session.
- [ ] Créer un dossier livreur, envoyer une photo et un PDF, puis vérifier son statut.
- [ ] Avec un livreur validé, passer en ligne ; accepter et refuser la localisation.
- [ ] Recevoir une proposition : son, vibration, compteur, acceptation et expiration.
- [ ] Glisser pour prendre en charge ; un geste incomplet revient sans confirmer.
- [ ] Vérifier carte, itinéraire et guidage vocal, y compris les coordonnées à zéro.
- [ ] Vérifier le suivi écran verrouillé, retour au premier plan et arrêt forcé.
- [ ] Effectuer une remise au code, puis un scénario d'absence avec dépôt photo.
- [ ] Couper le réseau pendant une course, reprendre, contrôler chaque étape envoyée.
- [ ] Effectuer une tournée : retraits, remises dans l'ordre et écran de fin.
- [ ] Avec le nouvel APK Firebase, vérifier « Notifications push : Activées »
  dans Paramètres, puis recevoir une notification en arrière-plan,
  accepter depuis l'écran verrouillé et ouvrir la bonne course au toucher.
- [ ] Vérifier pause, message du support, thèmes clair/sombre et petit écran.
- [ ] Activer les deux nouveaux réglages, accorder l'affichage et essayer la
  démo de fenêtre sur une autre application et sur l'écran verrouillé.
- [ ] Essayer une vraie proposition en silencieux : accepter/refuser, expiration,
  doublons, lot, retrait d'autorisation, hors ligne, déconnexion, alarmes à zéro et DND.

Pour iOS, la compilation et les essais restent à réaliser séparément.
Les icônes définitives, comptes des stores et soumissions restent à préparer.
