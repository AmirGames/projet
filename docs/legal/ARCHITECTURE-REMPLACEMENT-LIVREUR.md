# Analyse préparatoire — remplacement d'un Livreur

## Décision produit

Le 22 octobre 2026, le propriétaire a indiqué que le remplacement ne lui semble pas utile et ne souhaite pas l'inclure dans le modèle actuel. Aucun développement ni migration n'est prévu sur cette base. Cette décision produit doit être présentée à un avocat belge pour évaluer l'effet de l'absence de remplacement sur la liberté d'organisation; ce document ne conclut pas que le remplacement est obligatoire.

## État constaté

Le modèle `Courier` représente la personne qui détient le compte. Aucun mécanisme ZupEat n'a été trouvé pour déclarer un remplaçant ou transférer de façon contrôlée une mission. Le partage d'identifiants ne doit pas servir de contournement.

## Flux cible à valider

1. Le remplaçant crée son propre compte nominatif et passe les mêmes contrôles d'identité, d'admissibilité, de véhicule, d'assurance et de paiement qui lui sont applicables.
2. La plateforme vérifie uniquement des critères d'admissibilité publiés et documentés; elle ne choisit pas discrétionnairement le remplaçant.
3. Le titulaire de la mission demande une substitution avant la prise en charge ou, si le client/commerce a déjà été engagé, selon un mécanisme de transfert explicite défini par les contrats et le droit belge.
4. Le remplaçant reçoit une proposition distincte et doit l'accepter. Les commandes, montants, distances estimées, contraintes et identité de la partie responsable sont affichés avant son acceptation.
5. Une transaction atomique clôt l'attribution précédente puis rattache la mission au compte du remplaçant, sous réserve que la course n'ait pas changé d'état. Les sommes déjà acquises et les pourboires restent rapprochés de la personne qui les a gagnés; aucun montant n'est recalculé rétroactivement.
6. Les événements conservent l'identité des deux livreurs, l'auteur de la demande, les consentements, l'état de course et l'heure. Le remplaçant ne reçoit que les informations nécessaires aux courses qui lui sont proposées ou transférées.

## Modèle technique à étudier

- `CourierSubstitutionRequest`: `id`, `requesterCourierId`, `substituteCourierId`, statut (demandée, acceptée, refusée, expirée, annulée), raison facultative liée à la mission, horodatages et décisions de transfert.
- Une attribution de prestation distincte doit conserver l'historique plutôt que remplacer silencieusement `driverId`. Paiement et preuve de livraison doivent référencer l'identité ayant réellement effectué chaque prestation.
- Une acceptation concurrente, l'expiration, une mission déjà récupérée, une suspension de sécurité, les notifications et la déduplication de paiement doivent être protégées par transaction et contraintes d'unicité.
- Les rôles d'accès doivent empêcher le remplaçant de lire l'historique, les paiements et les messages privés du titulaire. Les justificatifs restent visibles uniquement par les opérateurs habilités.

## Conditions préalables

Cette architecture nécessite une décision juridique sur le transfert d'une mission déjà acceptée, la responsabilité contractuelle, la facturation, les assurances, la sous-traitance et la rémunération. La conception ne prouve pas qu'un remplacement sans autorisation convient à chaque mission. Aucun modèle de données ou flux d'API n'est ajouté sans cette validation, car une migration touchant les attributions et les paiements serait significative.
