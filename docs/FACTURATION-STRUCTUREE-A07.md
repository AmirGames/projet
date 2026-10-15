# A07 — Facturation structurée, transport et pages légales

Mis à jour le 12 octobre 2026. Statut : protocole et contrôles locaux préparés ; transport fournisseur, réception réelle, publication des pages et validation comptable/exploitation bloqués par des données et accès non fournis.

## Circuit choisi à ce stade

Le code garde le modèle d'adaptateur vers un Access Point Peppol, mais aucun opérateur n'est choisi et aucun adaptateur réel n'est enregistré. `PEPPOL_PROVIDER` absent signifie « transport désactivé » : les factures existantes peuvent être produites/téléchargées, mais ne sont jamais présentées comme envoyées. Une valeur non vide inconnue échoue maintenant avec `503 PEPPOL_PROVIDER_UNKNOWN`. Chaque futur adaptateur doit valider ses secrets/options avant envoi via `verifierConfiguration()`.

Il n'y a pas encore d'API d'entrée, de webhook fournisseur ou d'import durable des factures reçues, ni d'accusé de réception/rejet Peppol. Le statut `SENT` représente seulement l'acceptation de la remise par l'adaptateur avec un identifiant externe, pas la livraison au destinataire. `DELIVERED` ne peut pas être affirmé avec le code actuel. `FAILED` conserve une erreur tronquée et un compteur d'essais ; l'envoi par un superowner peut être rejoué, mais sans idempotence fournisseur, politique de délai ou mécanisme de rapprochement automatique. N'activer aucun fournisseur avant qu'il fournisse ces capacités et que leurs contrats soient implémentés et testés.

## API, accès et persistance actuels

- `GET /api/superowner/platform-invoices` : liste récente, superowner uniquement.
- `GET /api/superowner/platform-invoices/overview?period=AAAA-MM` : aperçu, identité manquante et nom du transport ; superowner uniquement.
- `POST /api/superowner/billing/:orgId/invoice` (`{period}`) : crée une facture mensuelle figée, superowner uniquement.
- `POST /api/superowner/platform-invoices/issue-month` (`{period}`) : émission mensuelle idempotente ; le worker quotidien existant appelle aussi ce service.
- `GET /api/superowner/platform-invoices/:id/ubl` : téléchargement XML, superowner uniquement.
- `POST /api/superowner/platform-invoices/:id/send` : tentative explicite d'envoi, superowner uniquement ; l'action est journalisée.

`PlatformInvoice` garde le XML et les instantanés vendeur/acheteur/lignes, montants, état, identifiant de message, erreur, date et nombre de tentatives. La facture existante n'est pas réécrite ; toute correction exige le processus comptable adapté (notamment note de crédit si nécessaire). L'accès au XML et aux erreurs contient des données commerciales : ne pas l'exposer aux rôles boutique sans contrat spécifique. La conservation du document original, de ses accusés, des journaux et pièces de rapprochement doit suivre le calendrier légal validé par le comptable ; aucune durée n'est codée dans A07.

## Configuration et limites fonctionnelles

L'émetteur est actuellement une configuration serveur (`PLATFORM_LEGAL_NAME`, `PLATFORM_VAT_NUMBER`, `PLATFORM_ADDRESS`, `PLATFORM_POSTAL_CODE`, `PLATFORM_CITY`, facultativement `PLATFORM_REGISTRATION_NUMBER`, `PLATFORM_EMAIL`, `PLATFORM_COUNTRY`). Les taux et le traitement HT/TTC viennent de `PLATFORM_VAT_RATE` et `PLATFORM_AMOUNTS_INCLUDE_VAT`. Le code actuel ne gère que TVA belge pour l'identité vendeur, le pays BE de l'acheteur commerçant, une catégorie/taux TVA uniforme et EUR. Il ne faut pas activer les factures de sociétés, établissements, taux réduits/exonérations ou devises multiples avec ce périmètre.

`PEPPOL_PROVIDER` doit rester vide tant que le nom réel de l'Access Point n'est pas décidé. Ne mettre ni clé ni donnée d'identité réelle dans le dépôt. Une valeur inventée ou incomplète échoue ; aucun fournisseur n'est implicitement choisi. Aucun numéro fiscal, adresse, raison sociale ou condition commerciale de démonstration ne peut servir en exploitation.

## Vérification locale et exploitation à préparer

Les tests unitaires vérifient les identifiants, les sommes HT/TVA/TTC en centimes, le prépaiement, l'échappement XML, les lignes invalides et le refus du fournisseur inconnu/d'une configuration incomplète. Ils n'effectuent pas de validation contre les artefacts XSD/EN 16931/Peppol BIS, ne contactent aucun Access Point et n'attestent pas une conformité. Aucune migration A07 n'est prévue.

Avant branchement fournisseur, il faut compléter :

1. adaptateur officiel, authentification par secret serveur, timeouts, idempotence/rejeu sûr et masquage des données sensibles des erreurs ;
2. transport des statuts asynchrones (acceptation, livraison, rejet), signature et déduplication de webhook ou polling, historique et droit d'accès ;
3. entrée des factures fournisseurs structurées, stockage immuable, rapprochement comptable, rejet, doublons et corrections ;
4. conservation/restauration des originaux, XML, accusés, correspondance métier et traces d'audit selon avis comptable ;
5. recette Access Point (envoyer/recevoir, rejets, indisponibilité, doublons, reprises) et rapprochement avec l'outil comptable.

Commandes depuis `backend/` après installation locale :

```bash
npx jest src/modules/invoicing/__tests__ --runInBand
npx tsc --noEmit
npm run lint
npm run build
```

Pour la base, ajouter un test PostgreSQL isolé couvrant l'API superowner et les factures générées à partir de données synthétiques uniquement ; ne pas lancer sur la base de production. Ajouter les scénarios de transport/réception en sandbox du fournisseur retenu une fois ses accès fournis.

## Obligations, territoires et questions au comptable

Vérification de sources officielles le 12 octobre 2026 :

- Belgique : les factures structurées B2B entre assujettis TVA établis en Belgique sont obligatoires pour les factures émises/reçues à compter du 1er janvier 2026, sous réserve d'exceptions. La référence est Peppol BIS, et Peppol est la voie normale ; les alternatives exigent accord mutuel et respect EN 16931. Les factures PDF restent valables hors champ (p.ex. B2C et international). Voir [e-facture Belgique — champ d'application et exceptions](https://efacture.belgium.be/fr/article/pour-qui-la-facturation-electronique-deviendra-t-elle-obligatoire), [format/canal et distinctions](https://efacture.belgium.be/fr/article/quest-ce-quune-facture-electronique) et [FAQ B2B](https://efacture.belgium.be/fr/FAQ/questions-generales-b2b).
- France : depuis le 1er septembre 2026, les entreprises doivent pouvoir recevoir les factures électroniques via une plateforme agréée ; l'émission et le e-reporting s'appliquent dès cette date aux grandes entreprises/ETI, puis au 1er septembre 2027 aux PME/micro-entreprises. Ce régime français n'est pas le même que Peppol belge. Voir [Ministère de l'Économie — calendrier en vigueur](https://www.economie.gouv.fr/tout-savoir-sur-la-facturation-electronique-pour-les-entreprises?lang=en) et [impots.gouv.fr — dates par catégorie](https://www.impots.gouv.fr/professionnel/questions/partir-de-quand-suis-je-concerne-par-la-reforme-de-la-facturation).

À valider avant ouverture avec comptable/conseil : identité et établissement de l'opérateur qui facture les commerçants ; assujettissement et pays d'établissement ; qui est le fournisseur juridique de chaque frais/commission ; pays et statuts TVA des clients concernés ; ventilation et traitement TVA des commissions, frais de livraison/service, retenues sur reversements et paiements ; numérotation, échéance, mentions et corrections ; périmètre de réception des factures fournisseurs ; conservation légale et outil d'archivage ; cas des clients non belges, entités non assujetties, régimes d'exemption/franchise, avoirs et éventuels établissements stables.

## Pages légales publiées et versions acceptées

Les pages sont servies par `GET /api/pages-legales/:slug`; l'API expose la dernière version publiée ou le texte par défaut `2026-10-08`. L'historique se lit via `PagesLegalesService.historique`; la publication superowner crée une version immuable. Les preuves d'acceptation commande couvrent aujourd'hui `cgv` et `confidentialite`, pas les conditions commerçants ni une annexe de facturation.

Au 12 octobre 2026, les versions présentes en base de l'environnement public et les acceptations effectives n'ont pas pu être vérifiées depuis ce dépôt. Les URL publiques `zupeat.com/mentions-legales` et `/conditions-commercants` n'ont pas été accessibles à l'outil de lecture web lors de cette vérification. Ne pas annoncer les textes par défaut comme publiés. Avant lancement, exporter l'historique depuis l'environnement réel, relever slug/version/date/hash/auteur, rapprocher les versions acceptées et vérifier les pages sur les domaines réellement exploités.

Les textes de départ contiennent des champs inconnus entre crochets dans les mentions légales et autres pages ; ils restent à remplacer à partir de justificatifs de l'opérateur. Les mentions de droit français (LCEN, médiateur) dans un document générique ne prouvent pas leur applicabilité à l'opérateur belge. Faire valider des notices séparées ou explicitement territorialisées pour Belgique et France, les langues, entités contractantes, médiation, TVA et facturation, puis publier une nouvelle version sans écraser l'historique. Les corrections concrètes sur identité, clauses commerciales et conservation sont bloquées jusqu'à réception de ces données attestées.

## Registre des preuves A07

| État | Date | SHA / environnement | Preuve |
|---|---|---|---|
| Développé | 12 octobre 2026 | Branche `claude/awesome-ride-m9lci8-a07-facturation-structuree`, commit code `d6c9480a92a1ea1ce1a577e609fb1be040efc765`, base `0dad7379e89128ee143a226341e46b6ed2bb005c` | Refus configuration fournisseur inconnue/incomplète ; garde des entrées UBL ; procédures ci-dessus |
| Testé localement | 12 octobre 2026 | Commit tests `516fee48d619cc4a37da7f8e94f20334c70efb3e` (code applicatif `d6c9480a92a1ea1ce1a577e609fb1be040efc765`), Windows, Node 24.21.0, npm 12.0.2, Prisma/client 7.10.0 | Tests facturation 15/15 (TVA 6/12/21 %, EUR, arrondis, prépaiement, configuration transport) ; tests autorisation/journal superowner 177/177 ; typecheck, lint et build backend réussis. Aucun test de schéma EN 16931 ni accès externe. |
| CI GitHub | 12 octobre 2026 | Head observé `7bc79199993f6082759c878cf240c132275cbf27` | Run [38179656367](https://github.com/AmirGames/projet/actions/runs/38179656367) en attente lors de la vérification ; ne pas considérer comme réussi. |
| Intégré | Non | PR #216 ouverte le 12 octobre 2026, base `claude/awesome-ride-m9lci8` | [PR A07](https://github.com/AmirGames/projet/pull/216) ; pas fusionnée |
| Déployé | Non | Aucun environnement confirmé | Aucune preuve |
| Validé en exploitation | Non | Fournisseur, accès sandbox et opérateur inconnus | Aucune preuve ; essais externes bloqués |

## Vérification complémentaire — 13 octobre 2026

Le transport vers un fournisseur et la réception de factures structurées ne sont pas validés par le seul adaptateur. Obtenir preuves de réception, validation comptable et publication légale avant ouverture.

**Statut de cette vérification :** revue de cohérence documentaire, sans exécution de tests, déploiement ni transaction externe. Consigner SHA, preuves et risques résiduels dans [l'état du projet](etat-projet.md) et [la recette A16](RECETTE-PILOTE-A16-2026-10-12.md).
