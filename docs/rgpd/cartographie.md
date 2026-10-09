# Cartographie et minimisation

## Périmètre et flux

Le backend Express et Prisma concentre les traitements. PostgreSQL stocke les comptes et les opérations ; Redis relaie les événements et limiteurs ; Socket.IO diffuse commandes et positions ; le frontend Next et les applications Expo consomment ces API. L'identité est commune aux espaces client, livreur, commerçant, équipe et chauffeur. Une suppression d'un espace ne supprime pas implicitement les autres.

Les documents privés passent par Multer → signature réelle / MIME / extension / taille → ClamAV INSTREAM → AES-GCM → volume privé. La lecture passe par `/api/files`, autorisation serveur, session valide, journal sécurisé et déchiffrement. Les images de vitrine restent publiques dans `uploads/stores` ou chez Cloudinary. Les pièces privées nouvelles ne sont plus envoyées à Cloudinary. Les anciennes pièces externes doivent être rapatriées puis supprimées chez le prestataire.

| Données / modèles | Finalité nécessaire | Base juridique proposée, à confirmer | Exposition autorisée | Conservation |
|---|---|---|---|---|
| `User`, `SessionConnexion`, refresh / SSO / reset | Connexion et protection du compte | Contrat ; intérêt légitime pour la sécurité | Titulaire ; équipe habilitée | Compte actif ; sessions jusqu'à échéance/révocation |
| `Customer` : téléphone, adresse, coordonnées, carnet | Livraison ; adresses explicitement sauvegardées | Contrat | Titulaire ; commerce pour sa commande, carnet personnel exclu par défaut | Profil actif, suppression à la demande |
| `CustomerCart`, `FavoriteStore`, avis / notes | Panier, favoris, retours utilisateur | Contrat ou consentement selon fonction | Titulaire ; avis publiés après modération | Effacement avec le profil |
| `Order`, `OrderDelivery`, `CourseDrive` | Exécuter et expliquer la prestation | Contrat | Parties concernées, suivant étape et permissions | Contacts / lieux précis 90 j après opération terminée ; montants comptables 10 ans proposés |
| Positions `Courier`, `ChauffeurDrive`, position en livraison | Attribution, suivi actif et sécurité | Contrat ; AIPD requise pour suivi systématique | Client de la course, commerce et équipe habilitée | Dernière position périmée après 24 h ; aucun historique GPS continu conservé |
| `CourierDocument`, `OrganizationDocument`, `DocumentChauffeurDrive` | Vérifier aptitude, assurance et statut professionnel | Obligation légale précise ou contrat proportionné | Titulaire / gérant et sections habilitées | Pendant relation et validité ; versions remplacées/refusées 30 j ; effacement à la clôture |
| Permis médical / `casier_judiciaire`, associés (`actionnaires`) | Exigence régionale alléguée, non démontrée dans le dépôt | **Articles 9/10 : fondement légal et garanties à établir avant collecte réelle** | Équipe habilitée DRIVE uniquement | Durée sectorielle à faire valider ; ne pas conserver par défaut un dossier complet au-delà du besoin |
| IBAN, BIC, titulaire `Organization` / `Courier` | Reversements SEPA | Contrat | Titulaire (IBAN masqué) ; personnel de paiement habilité | Jusqu'au dernier versement ; banque conserve ses propres preuves |
| `Payment`, `RefundOperation`, `RefundOperationEvent`, `CourierTip`, relevés, `Invoice`, `PlatformInvoice` | Encaissement, remboursements, comptabilité, Peppol | Contrat ; obligation comptable | Titulaire ; facturation habilitée | 10 ans proposés, puis purge ; exceptions ciblées |
| Identité légale / TVA / BCE des sociétés | Facturer et respecter obligations professionnelles | Obligation légale / contrat | Gérant ; facturation | Durée comptable ; numéros publics distingués des numéros de permis privés |
| `MerchantTicket`, messages support | Résoudre demandes et incidents | Contrat ; intérêt légitime | Parties et support habilité | 2 ans après résolution ; gel ciblé si litige |
| `PrivacyAuditEvent`, `SystemAuditLog`, `SecurityEvent` | Traçabilité, détection et investigation | Intérêt légitime, avec analyse de mise en balance | Personnel sécurité habilité | Audit 180 j ; événements techniques 90 j |
| `AcceptationConditions` | Prouver la version des conditions acceptée | Contrat / défense des droits | DPO et juridique habilités | 5 ans proposés ; IP et agent retirés lors de l'effacement |
| `MerchantArchive`, `Backup`, dumps et fichiers | Continuité et reprise | Intérêt légitime encadré | Exploitants habilités ; clés hors sauvegarde | Archive de restauration jusqu'à sa date limite ; sauvegardes 14 j |
| Push Expo / Web Push, notifications | Notification demandée | Contrat ; consentement pour marketing | Compte et prestataires push | Révocation / suppression ; messages selon politique support |
| `ApiKey`, `Webhook`, livraisons webhook | Intégrations métier | Contrat et sous-traitance | Administrateurs autorisés | Désactivation/révocation ; charges utiles limitées à la finalité |
| `Staff`, invitations société et équipe | Collaboration / habilitations | Contrat | Organisation et équipe habilitée | Relation active ; retrait des accès lors de la sortie |

L'inventaire CSV énumère aussi les données métier sans finalité personnelle directe. Un identifiant, un montant ou une note deviennent des données personnelles lorsqu'ils permettent de retrouver une personne : les historiques conservés sont **pseudonymisés**, pas déclarés anonymes au sens juridique.

## Minimisation effectuée

- Suppression des copies de commandes et clients dans les archives de restauration commerçants : la restauration utilise le catalogue, pas ces copies.
- Nouveaux tickets/factures client : la facture conserve le nom du destinataire ; le téléphone et l'e-mail ne sont plus recopiés dans le snapshot comptable.
- Recherche par téléphone supprimée : elle demandait une donnée privée en clair. La recherche client utilise nom et e-mail.
- IBAN masqué dans les présentations existantes ; chiffrement transparent pour les paiements autorisés.
- Secrets de connexion, empreintes, clés push, codes de livraison et secrets Stripe exclus de l'export utilisateur ; secrets Stripe terminés purgés.
- Journaux expurgés ; aucun corps de demande RGPD ou mot de passe n'est journalisé.
- Positions périmées et preuves purgées ; pas de nouvelle collecte GPS historique ajoutée.

## Points nécessitant une décision métier

Date de naissance du propriétaire, notes libres, `Staff`, invitations anciennes, destinataires marketing et charges utiles webhook doivent être revus fonction par fonction. Le dépôt ne prouve pas leurs usages réels en production. Aucun champ utilisé par un autre espace n'a été supprimé arbitrairement. Les finalités marketing, la collecte de casier et de justificatifs médicaux ne peuvent être validées sur la seule base d'une demande technique.

Sur mobile, les sessions utilisent Expo SecureStore ; les paniers sont dans AsyncStorage. Le web garde le jeton d'accès uniquement en mémoire (module unique `frontend/lib/jeton-session.ts`, aucune clé de jeton dans `localStorage`, les anciennes clés sont purgées au chargement), et utilise un cookie refresh HttpOnly. Le carnet/adresse local et les caches doivent être vérifiés sur appareils réels après effacement, réinstallation et sauvegarde OS.

## Destinataires et sous-traitants à inscrire au registre

Hébergeur/VPS et sauvegardes ; Stripe ; banque SEPA ; SMTP ; fournisseur SMS ; Expo, Apple/Google/Web Push ; Cloudinary pour visuels et anciennes pièces ; Access Point Peppol ; fournisseurs de géocodage/cartographie/OSRM ; destinations webhook et éventuels services de surveillance. Répertorier pays de stockage, transferts, sous-traitants ultérieurs, contrats article 28, garanties de transfert et délais de suppression. La présence d'un module ne prouve pas son activation réelle.

Remboursements A03 (9 octobre 2026) : la demande et son historique portent des
identifiants financiers, montant/devise, motif et codes d'erreur. Accès limité
à la facturation habilitée ; aucun secret/réponse SDK dans le journal. Ils suivent
la conservation comptable du paiement et sa purge avec la commande. Voir
[la procédure](../REMBOURSEMENTS-REPRISE.md).
