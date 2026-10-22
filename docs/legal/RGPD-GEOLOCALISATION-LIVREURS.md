# Géolocalisation des Livreurs — registre technique de travail

## Flux constatés

`DispatchService.enregistrerPosition` met à jour les coordonnées courantes du profil, le dernier instant de position et, si le livreur a une course active, les coordonnées de suivi des livraisons. Les clients voient la position uniquement quand l'état de course le permet. La pause sans course et le mode hors ligne ne mettent pas à jour la position côté backend. Les changements de cette branche effacent également la dernière position du profil lors d'une pause, d'une déconnexion volontaire hors livraison, d'une mise hors ligne automatique et à la fin d'une livraison lorsque le livreur est hors ligne. Une déconnexion mobile volontaire demande au serveur de fermer la disponibilité avant d'effacer la session locale; une mission déjà acceptée n'est pas réattribuée de ce fait.

Le hook mobile arrête aussi la tâche système et efface la position gardée en mémoire quand le livreur passe hors ligne ou en pause. Si une livraison est active, le suivi de cette livraison reste techniquement possible; les positions `OrderDelivery.driverLat/driverLng`, les preuves de remise et les coordonnées des lieux de commande ne sont pas purgés par ces changements.

Le job de disponibilité marque une perte de signal et peut retirer un livreur de la disponibilité technique. Cela ne doit pas être présenté comme une faute ou une sanction. Il ignore maintenant les périodes de pause et efface le dernier point de profil lorsqu'il met hors ligne un livreur sans course. Une suspension ou désactivation sans course efface aussi ce point; une course acceptée conserve son suivi jusqu'à sa fin.

## Éléments à déterminer avec le responsable de traitement

Ne pas présumer d'une base légale ou d'un consentement. Documenter finalité par état, nécessité, base article 6, information, destinataires, accès, mesures de sécurité, conservation par données et procédure d'effacement. Vérifier si le traitement systématique de localisation et le contrôle des personnes nécessitent une AIPD au regard de l'article 35 RGPD et de la liste APD.

Le numéro BCE est une donnée d'admissibilité distincte de la géolocalisation. Le champ `Courier.bceNumber` est chiffré par la couche applicative et n'est transmis qu'au livreur concerné et au dossier superowner habilité. Le statut du contrôle, sa date et son opérateur sont tracés. La base légale, l'accès d'exploitation, la durée et l'effacement doivent encore être définis dans le registre des traitements et la politique avant lancement.

## Limites

Les coordonnées liées aux livraisons terminées, preuves et lieux restent conservées dans les enregistrements de commande : leurs finalités, destinataires, accès, chiffrement, durées et purge doivent être définis à partir des obligations réelles. Les coordonnées n'étaient pas nécessaires au chat d'assistance superowner : elles ne sont plus renvoyées par cette route; l'examen d'incident, plus restreint, peut encore afficher les données rattachées à une course. La tâche mobile utilise la permission système « toujours » lorsqu'elle est accordée; le suivi au premier plan reste le repli. Les combinaisons Android/iOS, arrêt forcé, perte de réseau, fin de session et tâche déjà en vol doivent encore être validées sur appareils réels. Aucune durée de conservation n'est inventée ici.
