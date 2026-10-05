# Alertes de course Android

Module Expo local, lié automatiquement lors du Prebuild de ZupEat Livreur.
Ne pas recopier ses sources dans le dossier Android généré.

- `CourseAlertsModule` : réglages non secrets, état des autorisations/volume,
  ouverture des réglages Android, présentation et test différé.
- `CourseAlertController` : actif seulement en ligne et connecté (hors démo),
  contrôle de l'expiration, suppression des doublons et arrêt des alertes.
- `CourseAlertActivity` : tâche séparée, visible sur le verrouillage sans le
  lever ; carte et fiche de proposition avec montant, adresses, arrêts et
  actions. Les coordonnées de livraison restent obfusquées par l'API.
- `CourseAlertService` : lecture `USAGE_ALARM` via un service `mediaPlayback`,
  notification visible avec bouton d'arrêt, délai réel et limite de 120 s,
  libération du lecteur/audio focus. Le volume des alarmes et DND sont respectés.

La JS utilise `/api/drivers/offers` et la session SecureStore pour valider la
push. `Notifier.pushMobileLivreur` conserve la notification visible pour tous
les APK et ajoute un message Android de données, sans titre/canal/son, avec
`priority: high`, `contentAvailable: true` et TTL 60 s. La notification visible
seule ne lance pas la tâche quand l'application est en arrière-plan.
Les actions natives sont sérialisées en réponses Expo et envoyées
explicitement aux tâches de notification enregistrées. La détection de premier
plan d'Expo voit aussi cette Activity native : le dispatch explicite évite
qu'une action soit retenue jusqu'au retour dans l'application React.
`getStatus` et `presentOffer` distinguent le cycle de vie React du popup natif.

Le module dépend des API Android d'`expo-notifications` 57 : sa dépendance de
compilation suit la publication AAR installée ou le sous-projet si compilé
depuis les sources. Vérifier cette intégration à chaque migration Expo.
L'APK doit être reconstruit après un changement natif. La version applicative
1.0.2 sépare son runtime OTA de ceux des anciens APK 1.0.0 et 1.0.1.

L'écran 1.0.2 utilise les fichiers `android/src/main/assets/course-alert/` :
HTML/CSS/JS locaux et Leaflet 1.9.4 embarqué (licence BSD et empreintes du CDN
officiel contrôlées). Le fond de carte vient d'OpenStreetMap et l'itinéraire
d'OSRM, comme la carte de l'application ; un trait direct reste visible si
OSRM ne répond pas. Les arrêts viennent uniquement de l'offre API authentifiée ;
aucune adresse n'est géocodée pour retrouver un point client exact.

La WebView utilise une origine HTTPS réservée `.invalid`, avec interception
des seules ressources locales autorisées et CSP. L'accès aux fichiers et
contenus Android est désactivé, sans stockage DOM ni `addJavascriptInterface`.
Les textes API passent par `textContent` ; seuls trois liens de commande
locaux dans le cadre principal sont consommés : accepter, refuser, fermer.
Aucun jeton n'est transmis à la page. L'expiration est contrôlée par Android,
y compris si le JavaScript ou le réseau cartographique ne répond plus.

Références : [restrictions d'ouverture Android](https://developer.android.com/guide/components/activities/secure-bal),
[audio des alarmes](https://developer.android.com/reference/android/media/AudioAttributes#USAGE_ALARM),
[services depuis l'arrière-plan](https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start).
Voir aussi [les types de push Expo](https://docs.expo.dev/push-notifications/what-you-need-to-know/).

La compilation ne prouve pas que chaque fabricant laissera démarrer la fenêtre
ou le service. Utiliser le test différé, puis une vraie push sur un compte
livreur validé. Si l'autorisation est refusée, la notification habituelle reste
le moyen d'accès. Aucun `USE_FULL_SCREEN_INTENT`, service d'accessibilité,
changement de DND ou de volume global n'est utilisé.
