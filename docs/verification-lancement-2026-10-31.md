# État de préparation au lancement — 31 octobre 2026

## État vérifié du dépôt

- Base du worktree : `a24ffc196ca369f4d1058b198a4ec7f71939f063`; les correctifs décrits ci-dessous sont présents localement et proposés dans la PR.
- La PR brouillon [#241](https://github.com/AmirGames/projet/pull/241), branche `codex/zupeat-legal-cache-refresh-20261031`, propose 11 fichiers de code et deux fichiers documentaires : cache des routes légales, rechargement protégé des versions dans l’admin, tables légales adaptées aux petits écrans, audit runtime frontend bloquant et classement correct de Zod dans le lockfile. Les fins de ligne ont été normalisées : diff de code ramené à 83 ajouts et 21 suppressions au lieu d’une réécriture massive des fichiers.
- Le run CI GitHub 481 sur `07e53f83a2050ad3896648176448f7904a665f4e` s’est terminé avec succès pour les 11 jobs : backend, frontend, E2E navigateur, MFA, tests PostgreSQL et six applications mobiles.
- La révision de code `8c13d04824b96b80ffd4b2383c3749f9308700fa` a réussi le run [CI 482](https://github.com/AmirGames/projet/actions/runs/41225694593) est terminé avec succès, 11/11 jobs. L’intégrabilité GitHub est signalée comme possible.
- La PR n’est pas intégrée. Aucun workflow de déploiement automatique n’est présent dans `.github/workflows` : seuls `ci.yml` et `disponibilite.yml` existent. Une procédure manuelle VPS est documentée dans `DEPLOIEMENT-SCALEWAY.md`, avec `docker-compose.prod.yml` et `deploy/zup.sh update` (pull fast-forward puis build/redémarrage). La sonde de disponibilité ne s’exécute que si la variable GitHub `UPTIME_URLS` est configurée.
- Aucun `.env.production` n’existe dans le worktree et aucun accès SSH au VPS n’est disponible dans cette session ; les valeurs effectives, migrations et SHA des conteneurs ne peuvent donc pas être contrôlés. La version de production n’a pas été redéployée. Le dernier contrôle de santé décrit dans le rapport précédent indiquait `ok/ready` sur le SHA de base `a24ffc...`; ce point n’a pas été recontrôlé dans cette session.

## Correctifs techniques dans la PR

- Réponses légales publiques : `Cache-Control: no-store`.
- Réponses de l’administration légale : `Cache-Control: private, no-store`; les lectures frontend demandent également `cache: 'no-store'`.
- Bouton de rechargement des versions avec confirmation avant d’écraser un brouillon ou des informations société modifiés.
- Tableaux Markdown utilisables par défilement horizontal sur mobile et libellé accessible traduit.
- ESLint ignore `coverage/**`; Zod n’est plus une dépendance directe frontend et le lockfile marque son occurrence transitivement requise par ESLint comme dépendance de développement.
- Les valeurs BCE, TVA et hébergeur sont exclues de ces changements.

## Juridique et exploitation

- L’exploitant a confirmé ne pas connaître les modalités réelles de rétractation, d’annulation et de remboursement, la couverture d’assurance des livreurs, ni la base légale et la durée de conservation de la géolocalisation hors course. Ces textes ne peuvent pas être complétés sans faits vérifiés.
- Pour les litiges de consommation d’une entreprise belge, le Service de Médiation pour le Consommateur est l’interlocuteur général lorsque aucune entité sectorielle ne s’applique; le SPF Économie précise qu’il transmet la demande à l’entité compétente ou la traite lui-même ([SPF Économie](https://economie.fgov.be/fr/themes/protection-des-consommateurs/reglement-extrajudiciaire-des)). Coordonnées officielles : [Service de Médiation pour le Consommateur](https://mediationconsommateur.be/contact/).
- Une vérification antérieure du 31/10 indique que l’API publique renvoyait les versions légales et que la page publique des mentions affichait la même version. Le gestionnaire doit être recontrôlé après intégration du correctif pour vérifier que l’historique et le formulaire reflètent les mêmes données.
- Le domaine/URL d’une recette séparée, Stripe en mode test, les secrets et migrations de production, les essais de paiement/refus/remboursement, la couverture réelle de livraison, et une restauration de sauvegarde n’ont pas été prouvés dans le worktree actuel.

## Conclusion

Le code correctif a passé la CI complète, mais n’est pas encore intégré ni déployé. Le lancement ne peut pas être qualifié de prêt tant que les informations légales et opérationnelles manquantes ne sont pas confirmées et que les parcours production/recette ne sont pas contrôlés. BCE, TVA et hébergeur n’ont pas été modifiés.
