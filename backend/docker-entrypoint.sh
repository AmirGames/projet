#!/bin/sh
# Démarre le conteneur sans droits root.
#
# Les volumes (photos, documents privés, sauvegardes, journaux) existent déjà
# en production, créés par l'ancienne image qui tournait en root : leurs
# fichiers n'appartiennent pas à l'utilisateur « node ». On rend d'abord ces
# dossiers à « node » (une seule fois : on ne parcourt que si le propriétaire
# diffère), puis on abandonne les droits root avant de lancer la commande.
# Un sous-dossier ou un fichier créé en root (outil lancé sans cet entrypoint)
# est détecté aussi : sinon l'API ne peut plus le lire.
set -e

for dossier in uploads backups private-documents logs; do
  if [ -d "$dossier" ] && [ -n "$(find "$dossier" ! -user node -print -quit)" ]; then
    chown -R node:node "$dossier"
  fi
done

# su-exec ne change pas HOME : sans cela, npm viserait /root, inaccessible à « node ».
export HOME=/home/node
exec su-exec node "$@"
