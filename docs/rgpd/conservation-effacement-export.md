# Conservation, effacement et portabilité

## Politique initiale et automatisation

Les durées sont des paramètres de politique dans `retention.service.ts`. La tâche `PrivacyJobs`, démarrée avec l'API, passe au démarrage et chaque heure, sous verrou PostgreSQL distribué. Ses résultats et erreurs apparaissent dans la surveillance existante ; un effacement encore en attente après 30 jours fait échouer la tâche et doit être pris en charge par le DPO.

| Catégorie | Déclencheur / durée initiale | Action automatique |
|---|---|---|
| Position courante livreur/chauffeur | Dernière position de plus de 24 h | Coordonnées mises à NULL |
| Position finale du livreur en livraison | Livraison terminée/inactive depuis 24 h | Dernière position mise à NULL |
| Contacts et lieux précis de commande / trajet | Opération terminée de plus de 90 j | Nom de contact générique, téléphone/adresse/coordonnées/notes et suivi supprimés ; montants conservés |
| Photos et coordonnées de preuve | Preuve de plus de 90 j, livraison terminale | Suppression du fichier, de son URL et des coordonnées ; préservation si examen financier, incident ouvert ou gel |
| Pièces remplacées ZupDrive et pièces refusées | Remplacement ou décision de plus de 30 j | Suppression du fichier et de l'enregistrement, sauf gel légal |
| Pièces professionnelles valides | Relation active et obligation justifiée | Suppression lors de l'effacement ; maintien de la pièce courante pendant la relation, y compris attente de renouvellement |
| Tickets support | Résolution/fermeture depuis 2 ans | Ticket et messages supprimés, sauf gel |
| Messages support livreur | Création depuis 2 ans | Suppression, sauf gel |
| Audit sensible et administratif | 180 j | Suppression au-delà de la période ; audit RGPD garde un jour de marge pour le trigger SQL |
| Événements sécurité | 90 j | Suppression |
| Logs fichiers | 90 j | Configuration logrotate fournie ; installation sur VPS obligatoire, distincte de la purge SQL |
| Sessions, codes SSO, refresh | Échéance ; session révoquée depuis 1 j | Suppression ; refresh et codes liés partent en cascade |
| Secret d'intention Stripe | Paiement réussi, remboursé ou échoué | Secret client mis à NULL |
| Profil client effacé | 30 j après suppression | Enregistrement pseudonymisé supprimé ; commandes déjà détachées |
| Demande d'effacement terminée | 30 j après achèvement | Suppression de la demande ; marqueur de non-restauration conservé selon durée des sauvegardes/archives qu'il protège |
| Sauvegardes applicatives et exploitation | 14 j | Fichiers applicatifs et métadonnées supprimés ; script d'exploitation supprime les archives age anciennes |
| Archives de restauration commerçant | Date limite de restauration existante | Suppression ; commandes/clients ne sont plus dupliqués dans le snapshot |
| Commandes/paiements/factures/relevés comptables | 10 ans proposés (3653 j, marge années bissextiles) | Suppression des ensembles terminés et réglés, sous réserve de gel / examen ; factures avant commandes pour respecter les FK |
| Preuves d'acceptation des conditions | 5 ans proposés | Suppression sauf gel ; identité et réseau retirés lors de l'effacement selon la portée du compte |

Les opérations actives et créances non réglées ne sont pas supprimées. Les coordonnées d'une adresse explicitement enregistrée restent une donnée d'adresse du profil, et non un historique GPS de déplacements. Les purges documentaires et financières sont bornées (lots de 500) : surveiller le rattrapage, ajuster cadence/capacité si le volume dépasse le rythme de traitement. Les données à échéance ne doivent pas continuer à servir une autre finalité.

Les factures et relevés doivent être conservés selon la juridiction de l'entité émettrice et le régime fiscal effectif. **La valeur de 10 ans ne constitue pas une consultation juridique belge/française.** Valider aussi les litiges, contentieux et textes sectoriels de transport. Les demandes d'effacement sont traitées dans un mois conformément à l'article 12 ; une prolongation motivée et notifiée n'est pas automatique dans le logiciel.

## Gels légaux

`PrivacyLegalHold` isole une pièce/enregistrement par modèle et identifiant, motif codé (`LITIGATION`, `LEGAL_OBLIGATION`, `SECURITY_INCIDENT`), acteur et échéance de 1 à 365 jours. Création/renouvellement par le superowner réauthentifié via `POST /api/privacy/legal-holds`, avec journalisation. Réexaminer chaque mois et avant échéance, documenter l'obligation exacte dans le dossier juridique externe ; ne pas mettre de contenu sensible dans le motif.

La purge préserve les pièces, preuves, tickets et écritures comptables visés. Le gel ne réactive ni connexion, ni marketing, ni accès normal du titulaire ; les données restantes sont réservées aux fonctions habilitées. Un gel ciblé doit être étendu explicitement aux éléments connexes nécessaires au litige. Le code ne déduit pas automatiquement une procédure judiciaire à partir d'un message libre.

## Effacement

Deux portées sont distinguées :

1. **Suppression client existante** (`CustomerAccountService`) : adresses, favoris, paniers, avis et notes client, coordonnées de commande et tokens de suivi sont supprimés. Les commandes sont détachées ; le profil résiduel est pseudonymisé puis purgé. Un compte exclusivement client est supprimé avec ses sessions et tokens en cascade. Un compte possédant un autre rôle reste disponible pour ce rôle, et le message le précise, y compris ZupDrive.
2. **Compte ZupOne complet** (`DELETE /api/privacy/account`) : session et mot de passe requis, corps strict `{ "password": "…" }`. Refus pendant activité en cours ou pour le superowner qui doit d'abord transférer sa fonction. Toutes les sessions, refresh/codes liés, appareils et accès d'équipe sont révoqués ; les profils et documents sont effacés/pseudonymisés. Un identifiant technique de compte peut rester pour les relations légales ZupDrive, sans nom, e-mail réel, mot de passe utilisable ni accès.

Si un dernier versement reste dû, seule sa donnée bancaire nécessaire est conservée jusqu'au règlement. La tâche reprend l'effacement ; les autres coordonnées, pièces et accès sont déjà effacés/révoqués. Les dossiers en examen financier doivent être réglés par une personne habilitée ; alerte après 30 jours. La suppression livreur seule existante est désormais finalisée automatiquement après règlement, sans supprimer le compte client.

**Ce qui peut rester :** factures émises (identité minimale légalement exigée, numéro, date, lignes, TVA), montants et références d'encaissement/remboursement/versement, identité minimale du bénéficiaire dans le relevé chiffré, preuve versionnée des conditions pseudonymisée, audit de sécurité à durée bornée, et pièces faisant l'objet d'un gel légal motivé. Ces éléments ne servent plus à la prospection ni au profil client. Les historiques ne sont pas qualifiés d'anonymes s'ils restent indirectement rattachables à des archives comptables.

Les snapshots de factures **anciens** pouvaient contenir e-mail et téléphone : ils sont chiffrés, mais leur expurgation nécessite une règle approuvée conciliant minimisation et intégrité documentaire. Aucune altération arbitraire des factures déjà émises n'est opérée. Revue juridique prioritaire avant ouverture.

`ErasureRecord` empêche la réintroduction d'un profil par restauration. Les sauvegardes antérieures à un effacement sont refusées par la restauration applicative. Les sauvegardes isolées peuvent garder les anciennes données pendant leur fenêtre de 14 jours, avec accès restreint et destruction programmée ; elles ne sont pas remises en service sans réconciliation. Répercuter séparément la demande aux sous-traitants quand le responsable de traitement doit le faire.

## Export utilisateur

`POST /api/privacy/export`, session Bearer valide, mot de passe actuel, corps strict :

```json
{"password":"mot de passe actuel","format":"zip"}
```

`format` vaut `json`, `zip` ou `pdf`. La demande ne permet pas de choisir un autre `userId`. Limite de cinq demandes authentifiées par heure. L'export est produit en mémoire et rendu sous HTTPS avec `Cache-Control: private, no-store`, sans fichier public persistant. Demande et émission sont journalisées avant délivrance.

- **JSON** : profil, profils client vérifiés, commandes/items, paiements, adresses, favoris/paniers, livreur et documents/relevés/activité, chauffeur et trajets, société gérée, sociétés dont l'utilisateur est propriétaire identifié, consentements, notifications, messages dont il est auteur et son audit.
- **ZIP** : `donnees.json`, `recapitulatif.pdf`, fichiers documentaires réellement accessibles dans `documents/`. L'autorisation est revérifiée pour chaque pièce. Le manifeste signale une pièce externe/absente ; son absence n'est pas présentée comme un export documentaire complet.
- **PDF** : résumé d'une page ; le JSON porte le détail exhaustif des catégories prises en charge.

Les mots de passe/hashes, tokens de session/push, secrets Stripe, codes de remise et secrets techniques sont exclus. Les profils client invités ne sont associés par e-mail que si l'e-mail du compte est confirmé. Les données d'autres commerçants ou collègues ne sont pas copiées par simple appartenance à une équipe.

Limites : JSON plafonné à 50 Mio et pièces à 100 Mio. Un dépassement renvoie une erreur explicite et demande un traitement DPO, sans archive tronquée. Les données de prestataires (Stripe complet, SMS, appareils/cache OS) nécessitent coordination externe. L'interface web/mobile de téléchargement peut être ajoutée autour de cette API ; les endpoints et formats sont déjà utilisables et documentés.
