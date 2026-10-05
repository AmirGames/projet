# Phase 6 — RGPD et protection des données

Audit du code au **5 octobre 2026**, ZupEat / ZupOne / ZupDrive. Ce dossier contient les politiques techniques, la cartographie, les risques et le plan de remédiation. Les durées proposées doivent être validées par le responsable de traitement, son DPO et son conseil juridique pour chaque pays d'exploitation.

**État : protections implémentées et en cours de validation locale ; ouverture publique non validée.** Le code et les tests locaux ne prouvent ni la configuration du VPS, ni la licéité de tous les traitements.

- [Cartographie, finalités et minimisation](cartographie.md)
- [Chiffrement, clés et migration](chiffrement.md)
- [Conservation, effacement et export](conservation-effacement-export.md)
- [Exploitation, incidents et sauvegardes](exploitation.md)
- [Rapport, risques P1 / P2 / P3 et preuves](rapport-conformite.md)
- [Inventaire de chaque champ Prisma](inventaire-champs.csv) — décrit le schéma, ne contient aucune donnée utilisateur.

L'API refuse de démarrer en production si les clés, l'antivirus ou l'attestation de migration manquent. `PRIVACY_MIGRATION_VERIFIED=true` n'est permis qu'après exécution réussie de la vérification et archivage des preuves. Il ne vaut pas approbation juridique ou autorisation d'ouverture publique.
