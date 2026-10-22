# Conformité technique des Livreurs — Belgique

État au 22 octobre 2026. Ce document distingue les règles à prendre en compte et les corrections expérimentales du code. Ce n'est pas un avis juridique ni une garantie contre une requalification.

## Cadre légal et dates

- Qualification de la relation : articles 328 à 343 de la loi-programme (I) du 27 décembre 2006, en particulier article 337/3 et ses huit critères sectoriels. Les critères sont appréciés avec les éléments généraux et les faits de l'exploitation.
- Loi du 3 octobre 2022 : dispositions d'assurance spécifiques aux collaborateurs indépendants des plateformes. Les textes réglementaires consultés reportent l'entrée en vigueur pertinente au 1er janvier 2028; confirmer qu'aucun texte ultérieur ne modifie cette date et analyser la couverture d'assurance applicable avant cette échéance.
- Directive (UE) 2024/2831 : transposition au plus tard le 2 décembre 2026. À cette date de référence, ne pas traiter ses règles nationales de mise en œuvre comme déjà entrées en vigueur par simple affirmation. Surveiller publication au Moniteur belge et champ d'application.
- RGPD : minimisation, finalité, transparence, sécurité et droits; article 22 si la décision automatisée a un effet juridique ou similaire significatif; article 35 si le traitement est susceptible d'engendrer un risque élevé.

Références officielles et consolidées figurent dans le [rapport d'audit](../audits/AUDIT-LIVREURS-INDEPENDANTS-2026.md#références-juridiques-consultées).

## Corrections locales dans cette branche

- Le refus explicite ferme la course pour le livreur concerné; le dispatch commerçant n'annule plus ce refus ni le délai/plafond. Des tests Jest ciblés ont été ajoutés mais n'ont pu être exécutés faute de dépendances backend installées.
- La pause produit `UNAVAILABLE_DURING_PAUSE` et n'est plus agrégée avec le refus.
- Le motif personnel de pause n'est plus demandé ni transmis; la colonne historique est vidée lors d'une nouvelle pause. Les valeurs historiques ne sont pas purgées automatiquement.
- Les positions ne sont plus enregistrées par le backend hors ligne ou en pause sans course; l'app mobile bascule en suivi arrêté pendant la pause.
- Le balayage GPS ignore les pauses actives.
- Les incidents ouverts d'une course ne filtrent plus les offres futures de tournée; l'incident reste suivi sur la mission concernée.
- Une livraison échouée ou un dépôt refusé ne suspend plus le compte par défaut; une suspension temporaire reste possible sur décision explicite d'un opérateur.
- Le taux d'acceptation n'est plus envoyé par l'API Analytics et la jauge frontend est remplacée par un compte descriptif assorti d'une information sans effet sur l'accès futur.
- Les notifications de mission n'incitent plus à « répondre vite » et rappellent d'attendre d'être arrêté en sécurité.
- L'écran de proposition n'affiche plus de compte à rebours visuel dégressif; il présente la rémunération hors pourboire, le pourboire déjà attribué et des distances/durée estimées. Il ne décompose pas base/km, et le délai serveur (30 s par défaut) reste à évaluer avec l'équipe produit.
- Les interfaces de proposition ne reçoivent que la zone ville/code postal avant acceptation; la rue du client est donnée après attribution.
- Le texte juridique par défaut a été déplacé vers un brouillon belge prudent avec placeholders. Une architecture préparatoire de remplacement nominatif est documentée, sans fonctionnalité correspondante ni migration. La version en base, les versions déjà acceptées et les parcours réels doivent être comparés avant toute publication.

## À auditer avant ouverture commerciale

Parcours complet de refus/relance, consentement aux relances, durée de réponse, lots et itinéraire, tarif et possibilité de négociation, pourboires/reversements, suspensions/recours humains, notes/incidents, GPS en arrière-plan et conservation, droits RGPD, remplacement, assurances, filtrage d'admissibilité, accès aux justificatifs, opérateurs et paramétrage réel.

## Limite

Les changements réduisent quelques leviers techniques de pression identifiés. La qualification reste tributaire des textes applicables, des Conditions réellement acceptées et des pratiques effectives de la plateforme. Faire valider ce dossier par un spécialiste belge en droit social et le responsable de traitement/DPO.
