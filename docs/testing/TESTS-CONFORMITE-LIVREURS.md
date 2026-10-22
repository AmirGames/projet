# Scénarios de test — conformité Livreurs

## Automatisés ajoutés dans cette branche

- `backend/src/modules/drivers/__tests__/dispatch-vehicule.test.ts`: un refus explicite antérieur ne génère pas une nouvelle proposition, y compris après 10 minutes et lorsque le commerçant nomme ce livreur; le dispatch propose un autre candidat admissible.
- `backend/src/modules/drivers/__tests__/drivers-routes-caracterisation.test.ts`: l'API des propositions expose le pourboire déjà attribué séparément du montant total (montant dans lequel il reste compris).
- `backend/src/modules/drivers/__tests__/drivers-routes-caracterisation.test.ts`: la liste et le détail d'une proposition ne révèlent que la ville et le code postal avant acceptation, pas la rue du client.
- `backend/src/modules/drivers/__tests__/dispatch-vehicule.test.ts`: les incidents ouverts d'une course n'excluent plus le livreur des nouvelles offres de tournée.
- `backend/src/modules/drivers/__tests__/drivers-admin-routes-caracterisation.test.ts`: la route du fil support ne sélectionne plus les coordonnées GPS du profil.
- `backend/src/modules/drivers/__tests__/drivers-admin-routes-caracterisation.test.ts`: un échec de livraison rembourse par défaut mais ne suspend plus automatiquement le compte; l'opérateur peut demander explicitement la suspension.
- `backend/src/modules/drivers/__tests__/surveillance-courses.test.ts`: le service ne suspend pas par défaut un livreur après une livraison échouée; le test vérifie aussi le chemin de suspension explicitement demandé.
- `backend/src/modules/drivers/__tests__/drivers-routes-caracterisation.test.ts`: la route de pause ne demande ni ne transmet de motif personnel, et une déconnexion hors course efface la dernière position de disponibilité.
- `backend/src/modules/drivers/__tests__/driver-availability-pause.test.ts`: la pause efface coordonnées et horodatages du profil.
- `backend/src/modules/drivers/__tests__/dispatch-vehicule.test.ts`: aucune nouvelle position de disponibilité n'est enregistrée hors ligne ou pendant une pause.
- `backend/src/modules/drivers/__tests__/dispatch-bientot-libre.test.ts`: la position de profil est effacée après une course si le livreur s'était déconnecté pendant la prestation.
- `backend/src/modules/drivers/__tests__/driver-approval-gps.test.ts`: une restriction de compte efface la position de profil sans course active et préserve le suivi d'une livraison déjà acceptée.
- `backend/src/modules/drivers/__tests__/driver-bce.test.ts`: le contrôle BCE est une décision humaine datée et rattachée à un opérateur; le refus exige un motif et l'activation échoue avant la vérification.
- `backend/src/modules/drivers/__tests__/drivers-routes-caracterisation.test.ts` et `drivers-admin-routes-caracterisation.test.ts`: inscription avec format invalide refusée et décision BCE superowner journalisée.

## Tests existants pertinents

- `backend/src/modules/drivers/__tests__/acceptation-concurrente.pg.test.ts`: attribution concurrente.
- `backend/src/modules/drivers/__tests__/dispatch-attribution-idor.test.ts` et `drivers-idor.test.ts`: accès aux offres et données d'autres livreurs.
- `backend/src/modules/payments/__tests__/refund.integration.test.ts` et `backend/src/modules/orders/__tests__/pourboire-acces.test.ts`: remboursements et accès aux pourboires.
- `backend/src/modules/payouts/__tests__/payout-concurrence.pg.test.ts` et tests de relevés: concurrence et paiements par lot.

Ces fichiers ne valident pas tous les scénarios exigés. Les tests correspondants ont été exécutés dans les jobs backend et PostgreSQL du CI #445 ci-dessous; la couverture fonctionnelle demeure partielle pour les cas indiqués ensuite.

## Statut d'exécution

Le CI GitHub run [#445](https://github.com/AmirGames/projet/actions/runs/39772422351) a réussi tous ses jobs (backend, typecheck/lint/build, migrations, apps mobiles, MFA, tests PostgreSQL dédiés et E2E) sur le commit `cbe06b5035433a5499adfde48deb371c32699d7a`. Les tests concernés passent dans cet environnement CI; les suites n'ont pas été relancées localement dans cette session faute de dépendances installées.

Les runs #442 et #444 ont révélé puis corrigé des défauts de validation : index `bceStatus` manquant du modèle Prisma, fixtures et test d'inscription sans numéro BCE, mise à jour d'état synchrone dans l'effet GPS, puis accolade finale omise lors de la publication du schéma. Le CI #445 valide les corrections et a réussi tous ses jobs.

## Couverture encore requise

Créer des tests de domaine pour : refus répétés et compte actif; expiration/relais et plafond avec horloge contrôlée; pause distincte et absence de nouvelles offres; GPS hors ligne/en pause/en course; déconnexion prolongée; tarif et lots visibles avant acceptation; paiement figé et pourboires idempotents; évaluation sans suspension seule; suspension motivée, notification, contestation et examen humain; IDOR; courses longues; non-exclusivité; acceptation concurrente; perte GPS; remplacement nominatif; recours contre décision automatisée. Ajouter les non-régressions financières existantes plutôt que modifier les données financières.

La perte GPS sans sanction disciplinaire automatique, l'absence d'impact de plusieurs refus, l'inactivité de plusieurs semaines, la contestation d'une suspension, le véhicule incompatible, l'absence d'exclusivité, les lots complets, la protection du montant figé, l'arrêt GPS sur appareil, le remplacement et la procédure de recours restent sans scénario automatisé couvrant complètement les exigences du prompt.

| N° | Scénario | État dans cette branche |
|---|---|---|
| 01 | Refus simple, accès au compte et futures offres | Test de réoffre ajouté; effet compte actif à ajouter |
| 02 | Refus multiples sans déclassement | À ajouter |
| 03 | Inactivité de plusieurs semaines sans sanction | À ajouter |
| 04 | Pause, absence d'offres et état distinct | Changement de code; test de service à ajouter |
| 05 | Refus suivi d'une affectation manuelle | Couvert par le test de dispatch ajouté |
| 06 | Expiration, délais et plafond avec horloge de test | À ajouter |
| 07 | GPS selon les états de disponibilité | Tests backend d'absence d'enregistrement et d'effacement du dernier point ajoutés; tests appareil à ajouter |
| 08 | Transparence prix, frais, distance, lot et refus | Test de champ pourboire ajouté; couverture complète UI/API à ajouter |
| 09 | Note faible sans suspension automatique et contestation | À ajouter |
| 10 | Pourboire payé une seule fois / remboursements associés | Tests financiers existants, non exécutés; scénario bout en bout à confirmer |
| 11 | Suspension motivée, avis, contestation, revue et réactivation | Lien mobile vers le support ajouté; scénario automatisé et workflow structuré à ajouter |
| 12 | Accès indu aux données d'un autre livreur | Tests IDOR existants, non exécutés |
| 13 | Refus d'une course longue sans pénalité | À ajouter |
| 14 | Absence de contrôle d'exclusivité | À ajouter |
| 15 | Deux acceptations simultanées pour une course | Test PostgreSQL existant, non exécuté |
| 16 | Lot complet visible avant acceptation et refus libre | À ajouter |
| 17 | Rémunération figée malgré un nouveau barème | À confirmer dans les tests existants; non exécuté |
| 18 | Perte GPS sans sanction disciplinaire | Le job reste un état opérationnel et ne suspend pas le compte; test de perte GPS et appareil à ajouter |
| 19 | Remplacement avec identité et permissions distinctes | Non prévu par décision produit du 22 octobre 2026; test non applicable tant qu'aucun remplacement n'est implémenté. Risque de cette restriction à faire évaluer juridiquement. |
| 20 | Information et recours contre décision automatisée | À ajouter après définition du workflow |
| 21 | Numéro BCE avant activation | Format obligatoire, examen superowner journalisé et verrou d'activation ajoutés; exécution Jest/CI requise |
