# Configuration et préparation au pilote — A16

Mis à jour le 12 octobre 2026. Ce guide décrit le code de cette révision ; il
ne constitue pas une preuve de configuration ou d'exploitation d'un serveur.

## Configuration du backend

`backend/src/config/env.ts` valide la configuration au démarrage. En production,
`DATABASE_URL_APP` est la seule URL de connexion utilisée par l'API et
`DATABASE_URL_MIGRATION` est exigée pour les migrations. Le service de migration
doit recevoir explicitement cette dernière ; aucun repli vers les identifiants
de l'API ou du propriétaire n'est autorisé. En développement, `DATABASE_URL`
reste la configuration locale. Le rôle applicatif doit lire/écrire les données
et ne pas avoir `CREATE` sur le schéma.

Après `cd backend && npm run build`, la sonde `npm run db:role` ouvre la base désignée par le rôle
applicatif et n'exécute que des `SELECT` : elle rapporte `current_user`,
`session_user`, la base/le schéma, le droit `CREATE` et la correspondance avec
le nom du rôle dans `DATABASE_URL_APP`. Elle échoue en production si le rôle peut
créer dans le schéma ou ne correspond pas à l'URL applicative. Ne lui passez pas
une URL propriétaire en guise d'URL applicative.

Stripe est désactivé par défaut dans le backend (`ENABLE_STRIPE=false`). Quand
il est activé, les clés secrète/publique doivent être valides, de même mode
`test` ou `live`, et `STRIPE_WEBHOOK_SECRET` doit être un secret `whsec_`.
L'API ne construit aucun client de substitution quand Stripe est coupé ; toute
tentative non gardée échoue explicitement. La clé frontend reste une variable
publique `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, jamais la clé secrète.

Cloudinary est facultatif et doit être configuré avec ses trois identifiants ou
aucun. En production, `PRIVATE_DOCUMENTS_DIR` doit désigner un chemin absolu
inscriptible par l'API ; le démarrage le crée s'il manque et refuse s'il est
relatif ou non inscriptible. Il doit être monté sur un volume persistant par le
déploiement. Le stockage des pièces justificatives reste privé, chiffré et
analysé par ClamAV ; Cloudinary ne le remplace pas. SMTP accepte les
défauts locaux de Mailpit ; si un relais est configuré, le port doit être valide,
`EMAIL_FROM` doit être fourni et identifiant/mot de passe doivent être présents
ensemble. La vérification SMTP au démarrage est informative : une panne du relais
dégrade le courrier, elle ne rend pas les commandes indisponibles.

Une activation de `ROUTING_PROVIDER=osrm` exige maintenant `OSRM_API_URL` ;
`ASSISTANT_MODE=real` exige le modèle et les secrets du fournisseur choisi ;
`ZUPDRIVE_WEBHOOKS_ENABLED=true` exige son secret de signature. Sans ces choix,
le routage reste en estimation, l'assistant suit son mode non réel et les
webhooks sortants restent désactivés.

Les clés d'accès et de renouvellement JWT doivent être distinctes. En production,
la configuration de chiffrement RGPD, secrets de signature/audit, ClamAV et
validation de migration restent exigés par `assertPrivacyConfiguration()`.
Le résumé `Capabilities` des journaux énonce les capacités désactivées ou en
mode estimation ; il ne révèle aucune valeur de secret.

## CSP progressive et parcours de paiement

`CSP_MODE=report-only` est le défaut d'observation ; `enforce` applique la CSP
à nonce définie dans `frontend/lib/csp.ts`. Les violations arrivent à
`POST /api/csp-report` sans être considérées comme une preuve de réussite du
parcours. `off` est forcé en `enforce` en production. Les directives pour Stripe
incluent ses frames et connexions 3DS, ainsi que les autres origines utilisées
par le site. Une valeur CSP inconnue refuse le démarrage en production. Toute
nouvelle origine doit être justifiée et testée.

Progression recommandée : (1) déployer en report-only et collecter les violations
sur le checkout et les pages qui intègrent Stripe ; (2) corriger chaque violation
applicative et répéter la vérification avec cartes de test Stripe, y compris un
paiement nécessitant 3DS ; (3) déployer `CSP_MODE=enforce`, puis répéter les mêmes
parcours et surveiller les rapports ; (4) revenir en report-only seulement après
analyse d'une régression, sans couper les en-têtes de protection. Le script
`cd frontend && npm run verif:csp` couvre les pages, le checkout, les nonces,
l'injection de script et le format de rapport. Il n'émule pas un authentificateur
3DS distant : cette preuve doit être conservée séparément.

## Vérifications et limites

Commandes locales : `cd backend && npx jest src/config/__tests__/env.test.ts --runInBand`,
`npm run db:role` après build (base dédiée uniquement), `npx tsc --noEmit`, `npm run lint`,
`npm run build`; frontend : `npx jest lib/__tests__/csp.test.ts --runInBand`,
`npx tsc --noEmit`, `npm run lint`, `npm run build`, puis `npm run verif:csp`
contre un serveur configuré en report-only et ensuite enforce. Les chemins et
résultats effectivement exécutés sont consignés dans
[le registre courant](etat-projet.md#étape-16--a16-vérification-du-pilote-et-décision-de-lancement)
et [le compte rendu de recette](RECETTE-PILOTE-A16-2026-10-12.md).

Pas de migration Prisma attendue. Une correction ultérieure de configuration
de déploiement doit conserver les contrats REST/webhook existants, les permissions,
le cloisonnement multi-tenant et les transactions financières. Tant qu'une base
isolée et un Stripe TEST avec moyen 3DS ne sont pas disponibles, ces contrôles
restent « non exécutés », pas « réussis ».
