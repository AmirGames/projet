import { describe, expect, it } from '@jest/globals';
import { etatPaiementTrajet } from './paiement';

const sans = { obligatoire: true, statut: null };

describe('etatPaiementTrajet', () => {
  it('à payer : paiement obligatoire, course en recherche, rien de payé', () => {
    expect(etatPaiementTrajet('RECHERCHE', sans)).toBe('a_payer');
  });

  it("à payer aussi quand un paiement existe sans être réglé (carte pas encore confirmée)", () => {
    expect(etatPaiementTrajet('RECHERCHE', { obligatoire: true, statut: 'REQUIRES_PAYMENT_METHOD' })).toBe('a_payer');
  });

  it('rien à payer quand le paiement n\'est pas obligatoire', () => {
    expect(etatPaiementTrajet('RECHERCHE', { obligatoire: false, statut: null })).toBe('aucun');
  });

  it("une course déjà acceptée, annulée ou terminée non payée ne montre rien (l'API refuse de la payer)", () => {
    for (const statut of ['ACCEPTEE', 'ARRIVEE', 'EN_COURS', 'TERMINEE', 'ANNULEE', 'SANS_CHAUFFEUR']) {
      expect(etatPaiementTrajet(statut, sans)).toBe('aucun');
    }
  });

  it('payé seulement quand le serveur le dit (SUCCEEDED)', () => {
    for (const statut of ['RECHERCHE', 'ACCEPTEE', 'ARRIVEE', 'EN_COURS', 'TERMINEE']) {
      expect(etatPaiementTrajet(statut, { obligatoire: true, statut: 'SUCCEEDED' })).toBe('paye');
    }
  });

  it('payé puis course non aboutie : remboursement en cours', () => {
    expect(etatPaiementTrajet('ANNULEE', { obligatoire: true, statut: 'SUCCEEDED' })).toBe('remboursement');
    expect(etatPaiementTrajet('SANS_CHAUFFEUR', { obligatoire: true, statut: 'SUCCEEDED' })).toBe('remboursement');
  });

  it('remboursement demandé ou en échec : remboursement en cours, quel que soit le statut de la course', () => {
    expect(etatPaiementTrajet('ANNULEE', { obligatoire: true, statut: 'REFUND_REQUESTED' })).toBe('remboursement');
    expect(etatPaiementTrajet('SANS_CHAUFFEUR', { obligatoire: true, statut: 'REFUND_FAILED' })).toBe('remboursement');
  });

  it('remboursé', () => {
    expect(etatPaiementTrajet('ANNULEE', { obligatoire: true, statut: 'REFUNDED' })).toBe('rembourse');
  });

  it("l'absence d'information de paiement ne montre rien", () => {
    expect(etatPaiementTrajet('RECHERCHE', null)).toBe('aucun');
    expect(etatPaiementTrajet('RECHERCHE', undefined)).toBe('aucun');
  });
});
