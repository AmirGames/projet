# Scénarios de test — conformité Livreurs

## Automatisés ajoutés dans cette branche

- `backend/src/modules/drivers/__tests__/dispatch-vehicule.test.ts`: un refus explicite antérieur ne génère pas une nouvelle proposition, y compris après 10 minutes et lorsque le commerçant nomme ce livreur; le dispatch propose un autre candidat admissible.
- `backend/src/modules/drivers/__tests__/drivers-routes-caracterisation.test.ts`: l'API des propositions expose le pourboire déjà attribué séparément du montant total (montant dans lequel il reste compris).
- `backend/src/modules/drivers/__tests__/drivers-routes-caracterisation.test.ts`: la liste et le détail d'une proposition ne révèlent que la ville et le code postal avant acceptation, pas la rue du client.
- `backend/src/modules/drivers/__tests__/dispatch-vehicule.test.ts`: les incidents ouverts d'une course n'excluent plus le livreur des nouvelles offres de tournée.
- `backend/src/modules/drivers/__tests__/drivers-admin-routes-caracterisation.test.ts`: la route du fil support ne sélectionne plus les coordonnées GPS du profil.
- `backend/src/modules/drivers/__tests__/drivers-admin-routes-caracterisation.test.ts`: un échec de livraison rembourse par défaut mais ne suspend plus automatiquement le compte; l'opérateur peut demander explicitement la suspension.
- `backend/src/modules/drivers/__tests__/drivers-routes-caracterisation.test.ts`: la route de pause ne demande ni ne transmet de motif personnel.

## Tests existants pertinents (non exécutés ici)

- `backend/src/modules/drivers/__tests__/acceptation-concurrente.pg.test.ts`: attribution concurrente.
- `backend/src/modules/drivers/__tests__/dispatch-attribution-idor.test.ts` et `drivers-idor.test.ts`: accès aux offres et données d'autres livreurs.
- `backend/src/modules/payments/__tests__/refund.integration.test.ts` et `backend/src/modules/orders/__tests__/pourboire-acces.test.ts`: remboursements et accès aux pourboires.
- `backend/src/modules/payouts/__tests__/payout-concurrence.pg.test.ts` et tests de relevés: concurrence et paiements par lot.

Ces fichiers ne valident pas tous les scénarios exigés et leur présence ne vaut pas résultat de CI.

## Statut d'exécution

Les deux tests mobiles Node sans dépendances (`tests/course-alerts.test.cjs` et `tests/renouvellement.test.cjs`) passent. Les tests Jest backend n'ont pas pu être exécutés faute de dépendances. Les scénarios frontend Playwright n'ont pas démarré faute de module `playwright`. Une installation `npm ci` a été interrompue avant son achèvement. Le run CI sur la PR #237 est en cours; son résultat devra être consigné après achèvement.

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
| 07 | GPS selon les états de disponibilité | Changement de code; tests de domaine et appareil à ajouter |
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
| 18 | Perte GPS sans sanction disciplinaire | À ajouter |
| 19 | Remplacement avec identité et permissions distinctes | Fonction non repérée; test après implémentation |
| 20 | Information et recours contre décision automatisée | À ajouter après définition du workflow |
