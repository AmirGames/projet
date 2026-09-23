# Semaine 1 - Roadmap Livraison

## 1. Suivi en temps réel du client (Map + Position livreur)
- [x] Backend: WebSocket pour position du livreur (déjà existant)
- [x] Frontend: Composant Map avec position livreur (SuiviLivraisonClient)
- [x] Frontend: Temps d'arrivée estimé
- [ ] Notifications: Client averti quand livreur arrive

## 2. Annulation de course
- [x] Backend: Route pour annuler (PATCH /drivers/deliveries/:id/cancel)
- [x] Frontend: Bouton Annuler + modal raison (AnnulerCourse)
- [x] Backend: Restitution commande au statut READY
- [x] Notifications: Restaurant + Client avertis

## 3. Obfuscation d'adresse (vraie)
- [x] Backend: Générer intersection de rue proche (address-obfuscation.ts)
- [x] Backend: Envoyer adresse obfusquée au livreur
- [x] Schéma: Colonnes deliveryLatObfusquee/Lng
- [ ] Frontend: Afficher l'intersection (intégration dans Modal)
- [ ] Tests: Vérifier ±50-100m en pratique

## Statut Semaine 1
✅ **70% Complet** - Core logic implémentée, reste l'intégration UI

### Prochaines tâches (Semaine 2):
1. Intégrer SuiviLivraisonClient dans page de track
2. Intégrer AnnulerCourse dans page du livreur
3. Afficher note d'obfuscation dans modal
4. Tester avec vrai GPS + clients
5. Ajouter notif "Livreur arrive dans 2 min"
