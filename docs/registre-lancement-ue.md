# Registre de lancement — conformité UE

Mis à jour le 8 octobre 2026. Chaque ligne doit avoir un responsable, une date et une preuve avant l'ouverture publique. Aucune ligne n'est cochée par le code : seuls l'exploitant, le DPO ou un conseil peuvent les clore.

## Livré dans le dépôt

| Sujet | Base | Ce qui est fait |
|---|---|---|
| Allergènes | Règlement (UE) 1169/2011 | Champs `allergens` / `allergensDeclared` sur `Product`, validés par l'API, exposés au catalogue public, copiés à la duplication de boutique. |
| Alcool | Code de la santé publique L3342-1 | Champ `containsAlcohol` sur `Product` et exposé publiquement. |
| Signalement de contenu, point de contact | DSA 2022/2065 art. 11, 12, 16, 17 | Procédure et point de contact dans les mentions légales. |
| Déclaration des revenus | DAC7 (UE) 2021/514 | Clauses de collecte dans les conditions commerçants et livreurs. |
| Accessibilité | Directive (UE) 2019/882 | Page `/accessibilite` (état « partiellement conforme »). |

## Reste à faire — hors code

| # | Action | Responsable | Date | Preuve |
|---|---|---|---|---|
| 1 | Renseigner les mentions légales (raison sociale, RCS, TVA, hébergeur, directeur de publication, médiateur de la consommation) depuis l'espace superowner, puis publier | | | |
| 2 | Migration réelle du chiffrement, `privacy:check`, preuve de chiffrement disque/WAL, sauvegardes hors site testées | | | |
| 3 | Test ClamAV réel (fichier EICAR, arrêt du moteur) | | | |
| 4 | Rôle PostgreSQL d'exécution distinct du rôle de migration ; MFA administrateur | | | |
| 5 | Registre des traitements, AIPD (géolocalisation, suivi livreur), clauses art. 28, DPO désigné | | | |
| 6 | Valider ou arrêter la collecte casier / médecine / associés (art. 9 et 10 RGPD) | | | |
| 7 | Déclaration DAC7 : procédure annuelle auprès de l'administration fiscale | | | |
| 8 | Audit d'accessibilité RGAA / WCAG 2.1 AA, puis mise à jour de `/accessibilite` | | | |
| 9 | Facturation électronique B2B (factures plateforme → commerçants) | | | |
| 10 | Fiches de stores : confidentialité, suppression de compte, déclaration de collecte | | | |

## Reste à faire — code (suites de ce lot)

- Saisie des allergènes et de l'alcool dans les interfaces commerçant (web et mobile) ; affichage chez le client avant commande.
- Contrôle de majorité à la commande lorsqu'un produit contient de l'alcool (changement côté clients web et mobile : à coordonner).
- Revue des 26 + 44 vulnérabilités de dépendances (`docs/audit-dependances.md`).
