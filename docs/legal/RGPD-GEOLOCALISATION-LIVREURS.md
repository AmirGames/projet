# Géolocalisation des Livreurs — registre technique de travail

## Flux constatés

`DispatchService.enregistrerPosition` met à jour les coordonnées courantes du profil, le dernier instant de position et, si le livreur a une course active, les coordonnées de suivi des livraisons. Les clients voient la position uniquement quand l'état de course le permet. La pause sans course et le mode hors ligne ne mettent désormais pas à jour la position courante côté backend. Les coordonnées de preuve de livraison sont un flux distinct à analyser selon finalité et conservation.

Le job de disponibilité marque une perte de signal et peut retirer un livreur de la disponibilité technique. Cela ne doit pas être présenté comme une faute ou une sanction. Il ignore maintenant les périodes de pause.

## Éléments à déterminer avec le responsable de traitement

Ne pas présumer d'une base légale ou d'un consentement. Documenter finalité par état, nécessité, base article 6, information, destinataires, accès, mesures de sécurité, conservation par données et procédure d'effacement. Vérifier si le traitement systématique de localisation et le contrôle des personnes nécessitent une AIPD au regard de l'article 35 RGPD et de la liste APD.

## Limites

Le dernier point de position peut rester dans les colonnes du profil après une déconnexion; la politique publiée doit décrire exactement le comportement retenu et la purge. Les coordonnées n'étaient pas nécessaires au chat d'assistance superowner : elles ne sont plus renvoyées par cette route. Le hook mobile passe en suivi arrêté pendant une pause et hors ligne, mais la matrice complète des tâches d'arrière-plan, permissions système et états après déconnexion doit encore être validée sur appareil. Aucune durée de conservation n'est inventée ici.
