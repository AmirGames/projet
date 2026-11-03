# Découverte des restaurants — 2 novembre 2026

La page web `/restaurants` recherche désormais les noms de commerces, les
plats disponibles, la cuisine, la ville et la description. Les mots sont
normalisés sans accents et chaque mot saisi doit correspondre. Une insertion,
suppression ou substitution est tolérée pour les termes d'au moins quatre
caractères. Les correspondances exactes priment sur les approximations.

Les listes publiques `/api/client/stores` et `/stores/nearby` ajoutent
`searchProducts`, un index léger contenant uniquement les identifiants et noms
de tous les produits actifs, disponibles et non supprimés. Une requête groupée
complète les aperçus existants de trois à cinq produits : ceux-ci ne limitent
plus la recherche. L'index est limité aux boutiques déjà retenues par la
liste publique. Les aperçus et les contrats existants restent disponibles.

Le tri recommandé privilégie successivement :

1. L'ouverture connue, puis la livraison confirmée à l'adresse.
2. La pertinence des mots recherchés.
3. Le délai connu, puis une note pondérée par le nombre d'avis.
4. Les frais, la distance et enfin un ordre stable par nom/identifiant.

La note de classement utilise un a priori de 4/5 avec un poids de dix avis.
Elle ne remplace pas la vraie note affichée sur les cartes. Les horaires,
délais ou frais inconnus ne sont pas présentés comme confirmés par les filtres.
Les délais proviennent des données existantes, sans prédiction de trafic.

Deux filtres sont ajoutés : livraison confirmée à l'adresse et frais maximum
(gratuit, 3 €, 5 €). Ils se combinent avec les filtres existants et se
réinitialisent ensemble. Les frais affichés restent soumis au panier et aux
conditions de la zone. Le filtre rapide n'inclut plus un commerce hors zone.
Sans adresse géocodée et verdict positif, le filtre de livraison ne retient
pas le commerce.

L'API `/api/client/stores/search` recherche aussi dans les plats disponibles.
La ville devient un filtre cumulatif au lieu d'une alternative aux mots
recherchés. La requête est bornée à 120 caractères et à 100 résultats. La
tolérance aux fautes est propre à l'annuaire web, pas à cette API historique.

Ce changement concerne l'annuaire web et les API publiques partagées. Les
écrans natifs, la page personnelle `/client`, les favoris et les recommandations
fondées sur l'historique ne sont pas modifiés. Aucun régime alimentaire n'est
déduit du nom d'un plat. Pas de nouvelle dépendance applicative ni migration.

## Vérification locale

- API : 49 tests réussis (routes publiques et espace client, base simulée).
- Web : 11 tests réussis sur recherche/classement, interactions des filtres et
  parité des traductions FR/EN.
- TypeScript et lint complets backend/frontend réussis ; compilation esbuild
  du serveur réussie.
- `next build` est bloqué par `ERR_SWC_NATIVE_CACHE` dans cet environnement.
  Les tests web ont utilisé temporairement `ts-jest` installé dans le backend,
  avec une configuration située dans `/tmp`, sans modifier celle du projet.

Les tests couvrent notamment un plat absent de l'aperçu, une faute de frappe,
les recherches à plusieurs mots, l'absence de résultat, la réinitialisation,
les hors zone, les horaires inconnus, les frais sérialisés en chaîne et les
bornes de l'API. Aucun déploiement ou résultat de charge n'est attesté.
