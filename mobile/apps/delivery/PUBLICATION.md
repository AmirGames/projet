# Publier ZupEat Livreur

**Suivi au 4 octobre 2026 :** l'API est déployée sur le VPS. La préparation
présente dans le dépôt ne vaut pas publication ni validation sur appareils
réels. Les comptes, clés, essais et soumissions ci-dessous restent à finaliser.
Voir [l'état du projet](../../../docs/etat-projet.md). Les indications de coût
et de procédure des stores doivent être revérifiées au moment de la soumission.

La préparation locale du livreur est consignée dans [VALIDATION.md](VALIDATION.md).
L'accès au projet Expo `@zupone/zupeat-delivery` est confirmé. Le projet
Firebase `zupeat-a1e82` (ZupEat, forfait Spark) a été créé avec l'accord de
l'opérateur et l'application Android ZupEat Livreur y est enregistrée.
Aucune soumission aux stores n'a été effectuée.
Un APK ARM64 a été construit localement et sa signature vérifiée ; son
APK Firebase a permis à l'opérateur de recevoir les push. La version 1.0.1
ajoute les alertes natives, à essayer avec le nouvel APK de [VALIDATION.md](VALIDATION.md).

Ce qui est prêt dans le dépôt, puis ce qui reste à faire (comptes, clés,
fiches des stores), dans l'ordre.

## Déjà prêt

- **`app.json`** : nom, logo « Z Delivery ZupEat » fourni pour les icônes
  iOS/Android et le favicon, écran de démarrage bleu avec ce même logo,
  icône des notifications et du suivi de position,
  identifiants `com.amirgames.zupeatdelivery` (iOS) et
  `com.amir_games.zupeatdelivery` (Android), `runtimeVersion`, déclaration de
  chiffrement pour Apple (`ITSAppUsesNonExemptEncryption: false`).
- **Autorisations réduites au nécessaire**. Android : position (y compris en
  arrière-plan), service au premier plan « localisation », Internet, vibreur,
  réglages audio, lecture des images. La version 1.0.1 ajoute la superposition
  `SYSTEM_ALERT_WINDOW` (accord explicite dans les réglages du téléphone) et
  un service `mediaPlayback` borné à la durée de la proposition, pour la
  sonnerie en silencieux choisie dans l'application. Retirées : micro et
  écriture du stockage. iOS : appareil
  photo, photos, position (à l'usage et « Toujours ») ; modes d'arrière-plan
  `location` et `fetch` seulement.
- **`eas.json`** : profils `development` (build de développement),
  `preview` (APK à installer à la main, pour les essais) et `production`
  (App Bundle Android, numéro de build incrémenté par EAS).
- **Inscription dans l'application** (« Créer un compte » sur l'écran de
  connexion), avec acceptation des conditions ; le compte attend la
  validation de la plateforme.
- **Paramètres › Vos données** : politique de confidentialité, conditions des
  livreurs, **suppression du compte** depuis l'application (désactivation
  immédiate, demande transmise au support de la plateforme, données effacées
  sous 30 jours sauf obligations légales).

Le logo choisi est `output/mobile-icons/zupeat-delivery-app-v2.png`, copié
à l'identique dans `assets/images/icon.png` (PNG carré opaque de 1254 × 1254).
Expo génère les tailles natives. Android utilise l'icône complète pour
préserver le dessin et les textes ; l'ancienne configuration adaptative et
monochrome n'est plus référencée. Le lancement utilise un fond bleu `#2161EF`.
Les petites icônes blanches des notifications et du suivi de position restent
des ressources système distinctes du logo couleur.

## 1. À vérifier dans `eas.json`

`EXPO_PUBLIC_API_URL` vaut `https://api.zupeat.com` et `EXPO_PUBLIC_SITE_URL`
`https://zupeat.com` : **corrigez-les si l'adresse réelle diffère**. Le
serveur doit répondre en **HTTPS** (Android refuse le HTTP simple dans une
version publiée).

## 2. Comptes (une fois)

| Quoi | Où | Coût |
|---|---|---|
| Compte Expo | expo.dev | gratuit |
| Apple Developer Program | developer.apple.com | 99 $/an |
| Google Play Console | play.google.com/console | 25 $ une fois |
| Projet Firebase (notifications Android) | console.firebase.google.com | gratuit |

## 3. Vérifier l'accès au projet EAS existant

`app.json` contient déjà le projet
`face34d3-1569-4bfa-ab6f-2b830dffa311`, également utilisé par `updates.url`.
Se connecter au compte qui possède ce projet et vérifier son accès :

```bash
cd mobile/apps/delivery
npx eas-cli@latest login
npx eas-cli@latest project:info
```

Conserver cet identifiant. Ne relancer `init` que pour une migration volontaire
du projet. Sa présence ne prouve pas que les clés push sont configurées.

## 4. Notifications push

**État vérifié le 4 octobre :** le projet Firebase `zupeat-a1e82` contient
ZupEat Livreur (`com.amir_games.zupeatdelivery`) et l'API Cloud Messaging V1
est activée. L'accès au projet EAS existant est confirmé et la clé FCM V1
du compte `firebase-adminsdk-fbsvc@zupeat-a1e82.iam.gserviceaccount.com` est
attribuée à `com.amir_games.zupeatdelivery` dans EAS. Le fichier Android `google-services.json`
fourni par l'opérateur est intégré au dossier de l'application et relié par
`android.googleServicesFile: "./google-services.json"` dans `app.json`.
La configuration a été copiée dans Android par Expo Prebuild, puis vérifiée
dans l'APK compilé. L'opérateur confirme désormais la réception des push.

- **Android** : l'application `com.amir_games.zupeatdelivery` et son fichier
  `google-services.json` sont configurés. Pour un autre environnement, utiliser
  un fichier Firebase correspondant exactement au package et au projet visés.
  La clé a été attribuée avec `npx eas-cli@latest credentials` › Android › *Google Service Account
  Key for Push Notifications (FCM V1)*, après accord de l'opérateur.
  L'application a été reconstruite après l'ajout de `google-services.json`.
  Installer la version 1.0.1 pour essayer également la fenêtre native et la
  sonnerie avec le volume des alarmes : voir [README.md](README.md#alertes-android-sur-les-autres-écrans).
  Guide : [configuration FCM officielle Expo](https://docs.expo.dev/push-notifications/fcm-credentials/).
  `google-services.json` contient la configuration publique de l'application.
  La clé privée JSON du compte de service est un fichier distinct : la conserver
  dans `.expo/credentials/` (ignoré par Git), puis l'attribuer dans EAS au
  projet `@zupone/zupeat-delivery`. Ne jamais la placer dans l'APK ni le dépôt.
- **iOS** : `npx eas-cli@latest credentials` crée la clé APNs lors du premier
  build ; rien d'autre à faire.

## 5. Construire

```bash
npx eas-cli@latest build --profile preview --platform android     # APK d'essai
npx eas-cli@latest build --profile production --platform all      # versions des stores
```

EAS gère les certificats (signature Android, profils Apple) : acceptez ce
qu'il propose.

## 6. Essais avant soumission (sur de vrais téléphones)

- Création d'un compte, envoi des pièces, validation depuis l'espace
  plateforme, puis connexion.
- Passage en ligne, autorisation « Toujours » acceptée et refusée.
- Suppression du compte (Paramètres › Vos données) : compte désactivé, message
  reçu par le support.
- Téléphone verrouillé : une course proposée sonne ; « Accepter » depuis la
  notification ; la position continue (pastille qui bouge côté client).
- Fenêtre Android : autorisation accordée puis retirée, autre application et
  écran verrouillé ; accepter, refuser, expiration, aucun doublon au retour.
- Sonnerie en silencieux : volume des alarmes positif puis nul, « Ne pas
  déranger » avec alarmes autorisées puis bloquées ; arrêt de la sonnerie à
  la réponse, à l'expiration, hors ligne et à la déconnexion.
- Course complète : retrait (à moins de 150 m), code, dépôt avec photo, écran
  de fin.
- Mode avion pendant une course : prise en charge et remise enregistrées,
  envoyées au retour du réseau.
- Tournée de deux courses : retraits d'abord, un client à la fois.
- Thème clair et sombre, petit écran.

## 7. Envoyer aux stores

```bash
npx eas-cli@latest submit --profile production --platform android   # piste « interne », brouillon
npx eas-cli@latest submit --profile production --platform ios       # TestFlight
```

## 8. Fiches des stores

**Nom** : ZupEat Livreur
**Sous-titre (iOS, 30 caractères)** : Vos courses, en temps réel
**Catégorie** : Économie et entreprise (iOS) / Business (Android)
**Âge** : 18 ans et plus (activité professionnelle)

**Description courte (Android, 80 caractères)** :
Recevez des courses près de vous, livrez, suivez vos gains. Pour livreurs ZupEat.

**Description** :

> ZupEat Livreur est l'application des livreurs partenaires de ZupEat.
>
> • Passez en ligne et recevez les courses proches de vous : montant garanti,
>   distance et durée affichés avant d'accepter.
> • Acceptez même téléphone verrouillé, d'un seul geste depuis la notification.
> • Plusieurs commandes pour le même quartier ? Prenez-les ensemble.
> • Carte et itinéraire intégrés, ou votre application GPS préférée.
> • Remise sécurisée par le code du client, ou dépôt avec photo s'il est absent.
> • Fonctionne sans réseau : vos étapes partent dès que vous captez.
> • Gains du jour, de la semaine et du mois, historique, avis clients.
> • Support en direct et bouton d'urgence pendant les courses.
>
> Un compte livreur validé par ZupEat est nécessaire. Inscription sur zupeat.com.

**Mots-clés (iOS)** : livreur,livraison,coursier,courses,repas,scooter,vélo,gains,zupeat

## 9. Déclarations des stores

### Google Play

- **Localisation en arrière-plan** (*Contenu de l'application › Autorisations
  de localisation*) : fonction « Suivi de la livraison et attribution des
  courses au livreur le plus proche, pendant qu'il est en ligne ». Google exige
  une **courte vidéo** : passage en ligne, message d'explication, choix
  « Toujours autoriser », téléphone verrouillé, notification ZupEat visible.
- **Service au premier plan de type « localisation »** : même justification
  (la notification permanente est affichée tant que la position est suivie).
- **Sécurité des données** :
  - position précise et approximative : collectée, liée au compte, pour les
    fonctionnalités de l'application ; en arrière-plan ;
  - nom, e-mail, téléphone : compte ;
  - photos : preuve de dépôt et pièces justificatives ;
  - identifiants de l'appareil (jeton de notification) : notifications ;
  - chiffrement en transit : oui ; suppression sur demande : oui.
- **Suppression du compte** : elle se fait dans l'application (Paramètres ›
  Vos données) et sur le site, pour ceux qui n'ont plus l'application :
  **`https://zupeat.com/suppression-compte`** — l'adresse à indiquer dans la
  Console. Dans les deux cas, ce qui reste dû au livreur n'est pas perdu :
  ses courses de la semaine sont arrêtées le lundi suivant et versées sur son
  IBAN (sans IBAN valide, la demande est refusée jusqu'à ce qu'il le donne) ;
  ses données ne s'effacent qu'après ce dernier versement.
  Seul le **compte livreur** est supprimé : le compte ZupOne (même e-mail,
  même mot de passe) reste, et avec lui le compte client ZupEat — c'est dit
  au livreur avant et après la suppression.
- **Politique de confidentialité** : `https://zupeat.com/confidentialite`.
- **Accès pour l'examen** : un compte livreur de démonstration, déjà validé.

### Apple

- **Confidentialité de l'app** (App Store Connect) : mêmes données que
  ci-dessus, « liées à l'utilisateur », aucune utilisée pour le pistage.
- **Notes pour l'examen** : identifiants d'un livreur de démonstration validé
  et en ligne ; expliquer que la position « Toujours » sert à proposer les
  courses proches et au suivi du client, et qu'elle s'arrête hors ligne.
  Idéalement, une commande de démonstration à proposer pendant l'examen.
- Le compte se crée dans l'application : Apple exige donc sa **suppression
  dans l'application** (règle 5.1.1(v)). C'est fait : Paramètres › Vos données
  › Supprimer mon compte livreur. Préciser dans les notes d'examen que la suppression
  définitive est traitée par la plateforme sous 30 jours.
- **Suppression limitée au compte livreur** (choix assumé : le compte client
  ZupEat n'est pas supprimé). À coller dans les notes d'examen :

  > The account created and managed in this app is the courier (driver)
  > account. It can be deleted in the app: Settings › Vos données › Supprimer
  > mon compte livreur (also on https://zupeat.com/suppression-compte). This
  > deletes the courier account and its data (documents, vehicle, bank
  > details, location); outstanding earnings are paid on the following Monday,
  > then the courier data is erased within 30 days. The same login can also
  > be used on our separate consumer service ZupEat (food ordering), which is
  > not part of this app and remains available; its account can be deleted
  > from the ZupEat app.

- Le compte de démonstration peut être créé depuis l'application, mais il
  doit être **validé** depuis l'espace plateforme pour recevoir des courses.

### Politique de confidentialité à mettre à jour

Le texte publié ne mentionne la position du livreur que **pendant la course**.
Depuis le suivi en arrière-plan, elle est transmise **dès qu'il est en
ligne**. Publiez une **nouvelle version** de la page (Espace plateforme ›
pages légales, nouveau numéro de version) avec ces deux lignes dans le
tableau des traitements :

| Finalité | Données | Base légale | Durée |
| --- | --- | --- | --- |
| Attribution des courses | position du livreur tant qu'il est en ligne, y compris application en arrière-plan ou téléphone verrouillé (application ZupEat Livreur) ; rien n'est transmis hors ligne | contrat | seule la dernière position est conservée |
| Preuve de livraison | photo du dépôt et endroit indiqué, ou validation par le code du client | contrat | durée de la relation, puis 5 ans |

## Mises à jour suivantes

Augmentez `version` dans `app.json` (1.0.1, 1.1.0…) à chaque version
publiée ; le numéro de build, lui, est incrémenté par EAS.
