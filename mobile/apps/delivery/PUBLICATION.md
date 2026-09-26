# Publier Zupone Livreur

Ce qui est prêt dans le dépôt, puis ce qui reste à faire (comptes, clés,
fiches des stores), dans l'ordre.

## Déjà prêt

- **`app.json`** : nom, icônes (iOS, Android adaptative et monochrome),
  écran de démarrage orange, icône des notifications et du suivi de position,
  identifiants `com.amirgames.zuponedelivery` (iOS) et
  `com.amir_games.zuponedelivery` (Android), `runtimeVersion`, déclaration de
  chiffrement pour Apple (`ITSAppUsesNonExemptEncryption: false`).
- **Autorisations réduites au nécessaire**. Android : position (y compris en
  arrière-plan), service au premier plan « localisation », Internet, vibreur,
  réglages audio, lecture des images. Retirées : micro, superposition
  d'écran, écriture du stockage, lecture audio en arrière-plan. iOS : appareil
  photo, photos, position (à l'usage et « Toujours ») ; modes d'arrière-plan
  `location` et `fetch` seulement.
- **`eas.json`** : profils `development` (build de développement),
  `preview` (APK à installer à la main, pour les essais) et `production`
  (App Bundle Android, numéro de build incrémenté par EAS).
- **Paramètres › Vos données** : politique de confidentialité, conditions des
  livreurs, demande de suppression du compte (courriel au DPO).

> Les icônes sont **provisoires** (un « Z » blanc sur l'orange Zupone) :
> remplacez les fichiers de `assets/images/` par le vrai logo en gardant les
> mêmes noms et tailles (icône 1024 × 1024 sans transparence ; premier plan
> Android 1024 × 1024 transparent, logo dans le cercle central de 66 % ;
> icônes de notification 96 × 96 blanches sur fond transparent).

## 1. À vérifier dans `eas.json`

`EXPO_PUBLIC_API_URL` vaut `https://api.zupone.com` et `EXPO_PUBLIC_SITE_URL`
`https://zupone.com` : **corrigez-les si l'adresse réelle diffère**. Le
serveur doit répondre en **HTTPS** (Android refuse le HTTP simple dans une
version publiée).

## 2. Comptes (une fois)

| Quoi | Où | Coût |
|---|---|---|
| Compte Expo | expo.dev | gratuit |
| Apple Developer Program | developer.apple.com | 99 $/an |
| Google Play Console | play.google.com/console | 25 $ une fois |
| Projet Firebase (notifications Android) | console.firebase.google.com | gratuit |

## 3. Relier le projet à EAS

```bash
cd mobile/apps/delivery
npx eas-cli@latest login
npx eas-cli@latest init        # ajoute extra.eas.projectId dans app.json : à commiter
```

Sans `projectId`, les notifications push ne s'activent pas (voir `lib/push.ts`).

## 4. Notifications push

- **Android** : dans Firebase, ajoutez une application Android
  `com.amir_games.zuponedelivery`, téléchargez `google-services.json`, placez-le
  dans `mobile/apps/delivery/`, et ajoutez dans `app.json` :
  `"android": { "googleServicesFile": "./google-services.json", … }`.
  Puis `npx eas-cli@latest credentials` › Android › *Google Service Account
  Key for Push Notifications (FCM V1)* : envoyez la clé JSON du compte de
  service Firebase.
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

- Connexion, passage en ligne, autorisation « Toujours » acceptée et refusée.
- Téléphone verrouillé : une course proposée sonne ; « Accepter » depuis la
  notification ; la position continue (pastille qui bouge côté client).
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

**Nom** : Zupone Livreur
**Sous-titre (iOS, 30 caractères)** : Vos courses, en temps réel
**Catégorie** : Économie et entreprise (iOS) / Business (Android)
**Âge** : 18 ans et plus (activité professionnelle)

**Description courte (Android, 80 caractères)** :
Recevez des courses près de vous, livrez, suivez vos gains. Pour livreurs Zupone.

**Description** :

> Zupone Livreur est l'application des livreurs partenaires de Zupone.
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
> Un compte livreur validé par Zupone est nécessaire. Inscription sur zupone.com.

**Mots-clés (iOS)** : livreur,livraison,coursier,courses,repas,scooter,vélo,gains,zupone

## 9. Déclarations des stores

### Google Play

- **Localisation en arrière-plan** (*Contenu de l'application › Autorisations
  de localisation*) : fonction « Suivi de la livraison et attribution des
  courses au livreur le plus proche, pendant qu'il est en ligne ». Google exige
  une **courte vidéo** : passage en ligne, message d'explication, choix
  « Toujours autoriser », téléphone verrouillé, notification Zupone visible.
- **Service au premier plan de type « localisation »** : même justification
  (la notification permanente est affichée tant que la position est suivie).
- **Sécurité des données** :
  - position précise et approximative : collectée, liée au compte, pour les
    fonctionnalités de l'application ; en arrière-plan ;
  - nom, e-mail, téléphone : compte ;
  - photos : preuve de dépôt et pièces justificatives ;
  - identifiants de l'appareil (jeton de notification) : notifications ;
  - chiffrement en transit : oui ; suppression sur demande : oui.
- **Suppression du compte** : Google demande **une page web** où la demander.
  À créer sur le site (par exemple `/suppression-compte`, qui explique la
  démarche et renvoie vers dpo@zupone.com), puis à indiquer dans la Console.
- **Politique de confidentialité** : `https://zupone.com/confidentialite`.
- **Accès pour l'examen** : un compte livreur de démonstration, déjà validé.

### Apple

- **Confidentialité de l'app** (App Store Connect) : mêmes données que
  ci-dessus, « liées à l'utilisateur », aucune utilisée pour le pistage.
- **Notes pour l'examen** : identifiants d'un livreur de démonstration validé
  et en ligne ; expliquer que la position « Toujours » sert à proposer les
  courses proches et au suivi du client, et qu'elle s'arrête hors ligne.
  Idéalement, une commande de démonstration à proposer pendant l'examen.
- Apple n'exige la suppression du compte dans l'application que si le compte
  peut y être créé : ici l'inscription se fait sur le site, le lien
  « Demander la suppression de mon compte » des paramètres suffit.

### Politique de confidentialité à mettre à jour

Le texte publié ne mentionne la position du livreur que **pendant la course**.
Depuis le suivi en arrière-plan, elle est transmise **dès qu'il est en
ligne**. Publiez une **nouvelle version** de la page (Espace plateforme ›
pages légales, nouveau numéro de version) avec ces deux lignes dans le
tableau des traitements :

| Finalité | Données | Base légale | Durée |
| --- | --- | --- | --- |
| Attribution des courses | position du livreur tant qu'il est en ligne, y compris application en arrière-plan ou téléphone verrouillé (application Zupone Livreur) ; rien n'est transmis hors ligne | contrat | seule la dernière position est conservée |
| Preuve de livraison | photo du dépôt et endroit indiqué, ou validation par le code du client | contrat | durée de la relation, puis 5 ans |

## Mises à jour suivantes

Augmentez `version` dans `app.json` (1.0.1, 1.1.0…) à chaque version
publiée ; le numéro de build, lui, est incrémenté par EAS.
