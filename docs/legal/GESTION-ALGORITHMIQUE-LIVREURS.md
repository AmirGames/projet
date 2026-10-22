# Gestion algorithmique des Livreurs

## Paramètres observés

Le dispatch ZupEat examine l'état actif, la connexion/disponibilité volontaire, la pause, l'existence d'une course, le signal GPS, la proximité du retrait, le type de véhicule et la compatibilité de distance. Des règles de tournées et des incidents ouverts interviennent aussi pour certaines offres. Après acceptation, l'ordre des remises est calculé puis figé; le livreur ne peut pas modifier l'ordre par l'API tant que la séquence le masque. La nécessité opérationnelle et la proportionnalité de cette contrainte restent à valider.

La rémunération proposée suit le mode de livraison : frais de livraison existants pour les courses plateforme ou barème distance pour l'autre branche; aucun découpage fiable base/km n'est stocké en mode plateforme. Le taux d'acceptation a été retiré de l'API Analytics Livreurs et de la jauge frontend. Un refus explicite clôt la possibilité de reproposer automatiquement la même course. L'expiration sans réponse peut être relancée après un délai plafonné; c'est un choix de prudence produit et non une règle légale expressément prescrite.

## Paramètres/effets à inventorier encore

- Toute décision humaine ou automatique de suspension, blocage, exclusion ou restriction.
- Les incidents de livraison et évaluations de clients, notamment leur poids en dispatch, classement ou renouvellement.
- La documentation lisible destinée au livreur, les raisons principales d'une offre et un canal de contestation.
- Les opérateurs habilités, le journal de décision nécessaire et la revue réellement humaine.
- Le support général est accessible après désactivation; l'application mobile offre un lien direct de contestation/réexamen. Il ne constitue pas encore un workflow structuré avec état, échéance ou journal séparé.
- Toute modification algorithmique substantielle, son analyse d'impact et son avis préalable aux personnes concernées.

Une validation d'une règle informatique n'est pas une revue humaine. Évaluer RGPD articles 13–15, 22 et 35, ainsi que les dispositions de la directive 2024/2831 après confirmation de leur transposition/champ.
