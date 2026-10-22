Warning: truncated output (original token count: 7310)
Total output lines: 138

# Audit des mécanismes Livreurs ZupEat — 22 octobre 2026

## Portée et méthode

Audit local du dépôt courant, branche `audit/conformite-livreurs-belgique-2026`. L'arbre était propre avant les changements. L'analyse porte sur les parcours de dispatch, disponibilité/GPS, activité/statistiques, offres, aperçu du paiement des pourboires, versements, notation, suspension/incident et inscription. Ce n'est pas une certification de conformité ni un avis juridique. La production, les pratiques commerciales, l'intégralité des flux financiers et les contrats réellement acceptés restent à vérifier.

Les documents d'audit présents dans le dépôt sont datés et ne prouvent pas l'état déployé. La société exploitante et ses identifiants restent à confirmer : aucun numéro BCE/TVA ni raison sociale n'est déduit.

## Références juridiques consultées

- Les articles 328 à 343 de la loi-programme (I) du 27 décembre 2006, dont les critères sectoriels de l'article 337/3 : [texte consolidé Refli](https://refli.be/fr/lex/2006021362) et [SPF Emploi — nature de la relation](https://emploi.belgique.be/fr/themes/contrats-de-travail/nature-de-la-relation-de-travail-travail-salarie-ou-travail-independant).
- Loi du 3 octobre 2022, chapitre 4, section 2 sur l'assurance accidents des collaborateurs indépendants de plateformes : [texte consolidé Refli](https://refli.be/fr/lex/2022206360). L'arrêté royal du 19 décembre 2025 reporte cette entrée en vigueur au 1er janvier 2028 : [arrêté royal](https://refli.be/fr/lex/2025009799).
- Directive (UE) 2024/2831 : [EUR-Lex](https://eur-lex.europa.eu/eli/dir/2024/2831/oj). Le délai de transposition est le 2 décembre 2026. À la date de référence, les sources publiques consultées ne permettent pas d'attester une mesure belge de transposition promulguée applicable à ZupEat; cette vérification doit être répétée avant cette échéance.
- RGPD, notamment articles 5, 13–15, 22 et 35, et [APD — décisions automatisées](https://www.autoriteprotectiondonnees.be/professionnel/rgpd-/droits-des-citoyens/droit-de-ne-pas-etre-soumis-a-une-decision-individuelle-automatisee) et [APD — AIPD](https://www.autoriteprotectiondonnees.be/professionnel/rgpd-/analyse-d-impact-relative-a-la-protection-des-donnees).

La directive ne doit pas être traitée comme déjà transposée. Son échéance proche et ses obligations sur la gestion algorithmique justifient une préparation technique; l'applicabilité exacte dépend de la transposition, du champ d'application et de la qualification réelle.

## Constats prioritaires avant correction

| Niveau | Constat établi dans le code | Réponse de cette branche | Risque restant |
|---|---|---|---|
| ÉLEVÉ | Un refus explicite pouvait être suivi d'une nouvelle proposition automatique après 3 minutes. | Un statut `DECLINED` n'est plus sollicitable, même par appel manuel du dispatch. | Pas de mécanisme de réautorisation explicite; une nouvelle initiative du livreur n'est pas encore modélisée. |
| ÉLEVÉ | `livreurPrefere` contournait les délais, plafonds et une partie du dispatch. | Le commerçant suggère un candidat filtré par les mêmes règles; l'offre reste librement acceptée/refusée. | Les routes commerçant et interface sont à vérifier de bout en bout pour confirmer qu'elles ne modifient jamais directement l'attribution. |
| MODÉRÉ | La pause inscrivait les offres ouvertes comme `DECLINED`, polluant les statistiques de refus. | Nouveau statut `UNAVAILABLE_DURING_PAUSE`; le balayage GPS ignore les pauses en cours. | Les statistiques historiques antérieures conservent leur ancienne ambiguïté. |
| ÉLEVÉ | La page Analytics rendait le taux d'acceptation comme jauge visuelle. | Suppression du taux dans l'API et l'interface; les nombres descriptifs restent accompagnés d'une explication sans effet sur les offres. | Vérifier les consommateurs API non présents dans ce dépôt et les exports opérationnels. |
| MODÉRÉ | Le service de position acceptait de mettre à jour la position courante hors ligne ou en pause sans course. | Le backend ignore ces mises à jour; une course acceptée garde le suivi nécessaire. | L'arrêt de la collecte locale/du service en arrière-plan mobile reste à auditer. |
| ÉLEVÉ | L'écran d'offre affichait un montant agrégé sans isoler le pourboire et animait une barre de compte à rebours. | L'offre mobile affiche maintenant rémunération hors pourboire, pourboire déjà attribué, distances distinctes estimées et expiration sans animation ni compte à rebours chiffré. | L'offre expire toujours après le délai configuré (30 s par défaut); décision de durée à valider côté produit. |
| ÉLEVÉ | L'interface incident et le serveur demandaient par défaut la suspension après échec de livraison ou dépôt refusé. | Routes et service métier n'effectuent plus de suspension par défaut; un opérateur peut toujours demander explicitement une mesure temporaire pour un risque sérieux. | Pas de workflow de recours structuré, délai de réexamen ni état de dossier; vérifier la proportionnalité et le traitement des cas urgents. |
| MODÉRÉ | Le formulaire de pause demandait un motif personnel (repas, café, recharge, véhicule). | Le motif a été retiré de l'interface et de la route; le service remet le champ historique `pauseReason` à `null`. | Les anciennes valeurs déjà enregistrées ne sont pas purgées par ce changement. |
| ÉLEVÉ | Les incidents ouverts d'une tournée excluaient le livreur des offres supplémentaires (« bientôt libre » et tournée groupée). | Ces filtres ont été retirés : le dispatch ne classe plus les offres futures selon les incidents de suivi d'une course. | La surveillance continue de suivre la course acceptée pour prévenir ou traiter un problème de livraison; nécessité, seuils et messages restent à valider. |
| ÉLEVÉ | Le modèle Courier ne contenait pas de numéro BCE ni de contrôle d'inscription avant l'activité. | Numéro exigé selon la règle ZupEat choisie; vérification humaine dans le registre, chiffrée et journalisée, nécessaire avant disponibilité ou acceptation. | Le chiffre de contrôle n'établit pas existence, activité, titulaire ni indépendance; traitement des entreprises étrangères et critères d'assurance restent à valider. |

## Vérifications complémentaires des flux

- **Rémunération proposée :** `DispatchService.creerProposition` calcule `payout` à partir des frais de livraison plateforme (ou du barème alternatif) et du pourboire de commande; la valeur de l'offre est recopiée à l'acceptation dans `OrderDelivery.driverPayout`. Les flux de paiement créent un relevé à partir de cette valeur figée. L'écran mobile expose maintenant le montant total, le pourboire déjà attribué et des distances estimées. Il n'expose pas de ventilation base/km : en mode plateforme la paie est liée à `feesAmount`, et le modèle ne conserve pas de ventilation fiable de ce montant. Aucun mécanisme de contre-proposition n'existe. Une ventilation fiable ou une négociation demande une décision économique et une analyse de l'engagement déjà pris auprès du client et du commerce; aucun montant fictif n'a été ajouté.
- **Données client avant acceptation :** l'analyse des trois chemins de lecture (socket d'offre, `GET /offers`, liste et détail des propositions) a trouvé l'adresse de rue dans l'offre, malgré les coordonnées déjà obfusquées. Les interfaces d'offre reçoivent désormais ville/code postal seulement; la rue est retournée après attribution. Un test de caractérisation vérifie ce masquage. Données clientes restantes et accès opérateurs doivent encore être inclus dans une revue de confidentialité complète.
- **Accès support au GPS :** la route de consultation du chat superowner renvoyait aussi latitude/longitude même si l'interface ne les utilisait pas. Ces coordonnées ont été retirées de la sélection et un test de contrat vérifie l'API; les vues d'incident conservent les données qu'elles utilisent pour l'examen de l'incident et nécessitent une revue des rôles/durées.
- **Pourboires :** le pourboire après livraison utilise une ligne unique par commande, un identifiant Stripe unique, une intention idempotente et une mise à jour conditionnelle du statut avant l'incrément des gains (`backend/src/modules/orders/pourboire.service.ts`, `backend/prisma/schema.prisma:model CourierTip`). Les tests de paiement/remboursement existent dans le dépôt, mais n'ont pas été exécutés dans cette branche. Les scénarios d'annulation, litige, rapprochement de relevé et double webhook restent à vérifier par CI.
- **Notation :** `driver-rating.service.ts` calcule la moyenne et l'expose au livreur; aucune transition de statut liée à la note n'a été repérée dans les modules Drivers audités. Les avis restent contestables via le support général, mais aucun workflow spécifique de vérification/correction d'une note n'a été trouvé.
- **Suspension/recours :** l'API superowner accepte un motif et journalise l'action; le service notifie le livreur, et `reactiver` constitue un acte humain. Les routes de support restent accessibles après suspension; l'application mobile présente un accès direct au support. Une livraison échouée ou un dépôt refusé ne suspend plus par défaut : l'opérateur doit demander explicitement la mesure, et l'interface la décrit comme temporaire et motivée par un risque sérieux. Le support existant n'est pas un workflow de contestation structuré : aucun délai de réexamen, état de dossier ni journal métier dédié au réexamen humain n'a été trouvé. Une validation juridique/opérationnelle et des tests de procédure restent nécessaires.
- **Pauses :** l'application ne demande plus de motif personnel; l'API ne l'accepte plus et le service efface `pauseReason` à chaque mise en pause. Le champ historique est conservé dans le schéma pour éviter une migration destructive, mais les nouvelles pauses ne l'alimentent pas.
- **Inscription/admissibilité :** l'inscription collecte identité déclarée, contact, véhicule et un numéro BCE requis par la règle de plateforme choisie par le propriétaire; le compte reste inactif jusqu'à vérification humaine dans le registre officiel. Le service exige aussi les justificatifs liés au véhicule avant activation. Le contrôle de format ne confirme ni l'existence active de l'entreprise, ni l'identité du titulaire, ni l'adéquation de l'activité; le numéro BCE ne prouve pas à lui seul l'indépendance. La consultation du registre doit réellement être effectuée et sa procédure validée juridiquement.
- **Remplacement :** aucun flux de remplacement nominatif n'existe. Une architecture préparatoire (deux comptes vérifiés, consentement explicite, transfert atomique de la mission, rattachement des preuves et rémunérations, accès restreint) est décrite dans `docs/legal/ARCHITECTURE-REMPLACEMENT-LIVREUR.md`; elle attend une décision juridique et commerciale avant toute migration.
- **Conservation GPS :** aucun historique de traces de disponibilité n'a été repéré. La dernière position du profil et ses horodatages sont maintenant effacés en pause et hors disponibilité; la position attachée à une livraison acceptée reste suivie puis conservée dans les données de commande/preuve. Durées, accès opérateur, base juridique, chiffrement et nécessité d'une AIPD ne sont pas établis par cette seule revue.

## Matrice des huit critères de l'article 337/3

| Critère légal | Fonctionnalité | Fichiers et lignes | Constat | Risque | Correction | Test |
|---|---|---|---|---|---|---|
| 1. Exclusivité professionnelle | Contrôles de comptes et d'activité concurrente | Aucun contrôle repéré dans le dispatch; texte par défaut `backend/src/contenus/pages-legales.defaut.ts:210-248` | Pas de preuve de verrou technique dans le flux …1310 tokens truncated…travail en France, SIREN) et une localisation uniquement pendant course ou disponibilité. Le texte par défaut a été remplacé par un brouillon prudent pour la Belgique, mais il n'est pas prêt à publier : le texte effectivement accepté peut être administré en base et différer de ce fichier. Comparer les versions réellement acceptées avant publication et faire réviser par avocat belge et responsable du traitement.

| Clause actuelle | Comportement attendu | Code examiné | État |
|---|---|---|---|
| Acceptation volontaire, refus sans pénalité | Chaque offre requiert une action positive; le refus ne limite pas les offres suivantes | `DispatchService.accepter/refuser/proposerAuSuivant` | Correction du refus et de sélection manuelle réalisée; tests encore incomplets |
| Horaires libres | Disponibilité déclarée par le livreur | `DriverAvailabilityService` | Pause distincte; audit d'inactivité et de reprise restant |
| Non-exclusivité | Aucun contrôle de plateforme concurrente | Parcours d'inscription/dispatch non entièrement audité | Non démontré |
| Géolocalisation limitée | Collecte uniquement aux états/finalités nécessaires | `enregistrerPosition`, `useDriverLocation`, `backgroundLocation` | Effacement du point de profil et arrêt de collecte lors de la pause, déconnexion et logout volontaire; position de course conservée jusqu'à la fin. Tests backend ajoutés; rétention de l'historique de livraison et tests appareil restent ouverts |
| Rémunération transparente | Montant et distance présentés avant décision | offres backend/mobile | Le champ payout existe; décomposition de tous les compléments/frais non validée |
| Pourboires | Attribution et versement cohérents | paiements non audités dans ce lot | Non validé |
| Liberté des moyens | Consignes limitées au résultat, à la loi et à la sécurité | tournées, suivi | Non validé |
| Statistiques | Descriptives, sans effet adverse | activité + interface Analytics | Taux d'acceptation retiré; autres décisions indirectes restent à tracer |
| Suspension/contestation | Motif, revue humaine et recours | routes admin non auditées complètement | Non validé |
| Substitution / assurance | Remplacement nominatif, admissibilité professionnelle | aucun flux de remplacement repéré | Non implémenté; exigences juridiques à établir |

## Résultats techniques synthétiques

| Fonctionnalité | Avant | Après cette branche | Tests disponibles | Statut de validation |
|---|---|---|---|---|
| Refus des courses | Refus explicite susceptible de relance et offre préférée pouvait contourner les filtres. | Refus ferme la même course; le choix commerçant passe par l'éligibilité commune. | Tests dispatch ajoutés. | Code modifié; Jest et parcours commerçant non exécutés. |
| Relances | Expiration et refus entraient dans le même cycle de sollicitation. | Expiration sans réponse garde le délai de 3 min et le plafond de 3; refus ne réouvre pas la course. | Test de refus ajouté; horloge de test complète manquante. | Partiel. |
| Disponibilité | La pause pouvait être comptée comme refus et demander une raison. | Statut de pause distinct, aucune raison demandée; aucune nouvelle offre durant la pause. | Test de pause ajouté. | Code modifié; test de service non exécuté. |
| Paiements | Barème et pourboires actuels. | Aucun mouvement financier modifié; l'offre détaille le pourboire présent, et l'acceptation conserve le montant figé existant. | Tests financiers existants repérés. | Flux non régressé par changement financier; suite de paiement non exécutée. |
| Notation | Note moyenne présentée. | Aucun lien automatique note → suspension repéré; note d'acceptation supprimée. | Pas de test de contestation des avis ajouté. | Audit ciblé, recours de note incomplet. |
| Géolocalisation | Position de profil pouvait être actualisée hors ligne/en pause. | Backend ignore ces points sans course; profil effacé à pause/déconnexion; hook mobile arrêté en pause et hors ligne; GPS retiré de la réponse support. | Tests backend ajoutés mais Jest non exécuté localement; tests appareil manquants. | Partiel; rétention des données de course, permissions et AIPD ouverts. |
| Suspension | Incident d'échec/dépôt suspendait par défaut. | Aucun effet par défaut au niveau route ou service; action explicite d'opérateur possible et journalisée. | Tests route/service ajoutés. | Code modifié; Jest non exécuté; appel humain et recours formel non validés. |
| Remplacement | Aucun flux. | Architecture séparée documentée; aucun partage d'identifiants ni changement de modèle. | Test impossible avant décision et implémentation. | Proposition seulement. |
| Gestion algorithmique | Taux d'acceptation exposé; incident ouvert pouvait filtrer une offre future; ordre groupé imposé. | Taux et filtre incident retirés; ordre de tournée existant reste contraint et doit être validé. | Test de filtre incident ajouté; pas de revue de transparence utilisateur. | Partiel. |

## Niveaux de risque

- **CRITIQUE :** aucune défaillance critique résiduelle n'a été établie pour les chemins modifiés. Une troncature de fichiers dans une première publication de la branche a été détectée par CI puis corrigée; les SHA distants de 32 fichiers modifiés ont été comparés aux fichiers locaux avant la dernière publication.
- **ÉLEVÉ :** prix déterminé par la plateforme sans contre-proposition; délai de réponse de 30 secondes; ordre des lots figé; conservation et accès aux positions; absence de recours structuré aux suspensions.
- **ÉLEVÉ :** l'exigence de numéro BCE à tous a été demandée comme règle ZupEat et ajoutée; l'exigence belge applicable à chaque cas, la vérification officielle du titulaire/activité et l'équivalent France restent à valider avant ouverture commerciale.
- **MODÉRÉ :** le contrôle BCE reste manuel et son exécution réelle ne peut pas être prouvée par le logiciel; traitement des entreprises étrangères non défini; remplacement non implémenté; motifs de pause historiques non purgés; réautorisation explicite après refus non modélisée; versions effectives des conditions pas comparées.
- **FAIBLE :** aucun constat juridique ouvert n'est abaissé à ce niveau sur le seul fondement de cet audit. L'absence d'un verrou de concurrence dans le code ne prouve pas la liberté professionnelle réelle.

Ces niveaux priorisent le travail technique; ils ne chiffrent pas une probabilité de requalification.

## Décisions commerciales/juridiques non tranchées par le code

1. Si ZupEat doit permettre au livreur de négocier le prix avant que le client/commerçant soit engagé, et qui supporte l'écart.
2. Définir la personne morale exploitante, les contrats, les bases RGPD et les responsables de traitement.
3. Valider assurances des véhicules, responsabilité professionnelle et préparation de l'obligation plateforme prévue en 2028.
4. Réviser Conditions Livreurs et politique de confidentialité selon la Belgique et les flux réels.
5. Définir remplacement et sous-traitance avec critères objectifs, vérification et responsabilité.
6. Vérifier la transposition belge de la directive avant le 2 décembre 2026 et les obligations correspondantes.

## Preuves et limites de validation

- Un test unitaire de dispatch a été ajouté pour le refus explicite et le choix manuel commerçant.
- Deux tests mobiles Node sans dépendances ont passé : `tests/course-alerts.test.cjs` et `tests/renouvellement.test.cjs`. Parsing des messages FR/EN et `git diff --check` passent.
- Le CI GitHub run [#445](https://github.com/AmirGames/projet/actions/runs/39772422351), sur le commit `cbe06b5035433a5499adfde48deb371c32699d7a`, a réussi tous ses jobs : backend, frontend, migrations et alignement Prisma, tests PostgreSQL dédiés, apps mobiles, MFA et parcours navigateur E2E. Une première tentative (#444) avait échoué car la publication du schéma Prisma avait omis son accolade finale; le fichier complet a été republié et vérifié sur la branche avant le run #445.
- Les suites Jest et Playwright n'ont pas pu être lancées localement : les tentatives d'installation `npm ci` ont été interrompues avant leur achèvement et n'ont pas produit de dépendances utilisables. Les résultats CI ci-dessus sont ceux du dépôt distant, pas une exécution locale.
- La PR brouillon [#237](https://github.com/AmirGames/projet/pull/237) contient le commit validé par le run #445. Elle n'est pas fusionnée. Le succès du CI vérifie le code et les scénarios présents dans le dépôt; il ne valide pas les pratiques d'exploitation, le texte réellement accepté par les livreurs ni l'analyse juridique.
- Aucun mouvement financier n’a été modifié. La migration additive BCE a été générée/appliquée dans les jobs CI réussis. Elle ajoute les champs et l'index BCE puis rend indisponibles les dossiers existants non vérifiés; le propriétaire confirme que les comptes sont encore en test. Les états `DeliveryOffer.status` restent stockés dans un champ `String`.

## Niveau de risque global du périmètre

ÉLEVÉ : tarif fixé par la plateforme, absence de négociation repérée, historique GPS des livraisons et procédure de recours structurée à établir, ainsi que remplacement non implémenté. Les changements sur le refus, la pause, le dispatch manuel, la collecte GPS hors mission et la jauge d'acceptation réduisent des mécanismes de pression observables, mais ne garantissent pas une qualification indépendante.

## Checklist à remettre à un avocat belge en droit social

- Confirmer la qualification selon les articles 328–343, l'article 337/3 et les indices généraux, pour le service exploité et les profils de livreurs concernés.
- Évaluer individuellement les huit critères et les flux d'offre, de tournée, de disponibilité, de GPS, d'incident, de tarification, de suspension et de recours.
- Vérifier la transposition belge de la directive 2024/2831 publiée avant le 2 décembre 2026, son champ et les mesures techniques et procédurales exigées.
- Confirmer assurances RC professionnelle et véhicule, documents légalement requis et portée/date du régime plateforme 2028.
- Valider possibilité de négociation des prix, annulations, remboursements, pourboires et articulation avec les sommes déjà encaissées.
- Réviser les versions réellement acceptées des Conditions Livreurs et communications; ne pas se limiter au texte par défaut.
- Définir remplacement, sous-traitance, compte personnel, assurances, responsabilité et critères objectifs d'admissibilité.
- Examiner contestation, désactivation, décisions automatisées, information algorithmique et voie de recours.
- Confirmer entité exploitante, BCE/TVA, droit applicable, juridiction, médiation et identité/contact du responsable RGPD/DPO le cas échéant.

## Proposition de dossier pour la Commission administrative de règlement de la relation de travail

Constituer un dossier de faits et de preuves datées plutôt qu'une conclusion préparée : identité et activité de la plateforme; contrats proposés et versions acceptées; parcours d'inscription et de vérification professionnelle; règles et versions de l'algorithme; exemples anonymisés d'offres, montants, distances et expirations; règles observées de refus, pause, déconnexion et arrêt GPS; exemples vérifiables des effets du refus; possibilités de travailler via d'autres plateformes et de remplacer un livreur par une personne admissible; procédures de suspension et recours; facturation, frais, paiements, assurances, matériel et risques économiques; entretiens avec des livreurs aux situations variées. Préserver aussi les éléments défavorables et les exceptions, expliquer les limites de l'échantillon et demander au conseil si une demande formelle d'avis/décision est recevable et pertinente.
