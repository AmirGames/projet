import { etatPaiementTrajet } from '../zupdrive';

const exige = (statut: string | null) => ({ obligatoire: true, statut });
const libre = (statut: string | null) => ({ obligatoire: false, statut });

describe('état du paiement d\'un trajet', () => {
  it('exigé et pas encore payé : le formulaire carte s\'affiche, seulement pendant la recherche', () => {
    expect(etatPaiementTrajet('RECHERCHE', exige(null))).toBe('a_payer');
    expect(etatPaiementTrajet('RECHERCHE', exige('REQUIRES_PAYMENT_METHOD'))).toBe('a_payer');
    // L'API ne crée de paiement que pour une course en recherche.
    for (const statut of ['ACCEPTEE', 'ARRIVEE', 'EN_COURS', 'TERMINEE', 'ANNULEE', 'SANS_CHAUFFEUR']) {
      expect(etatPaiementTrajet(statut, exige(null))).toBe('aucun');
    }
  });

  it('non exigé : rien à montrer tant qu\'aucun paiement n\'existe', () => {
    expect(etatPaiementTrajet('RECHERCHE', libre(null))).toBe('aucun');
    expect(etatPaiementTrajet('EN_COURS', undefined)).toBe('aucun');
  });

  it('payé : confirmé par le serveur (webhook), le trajet suit son cours', () => {
    expect(etatPaiementTrajet('RECHERCHE', exige('SUCCEEDED'))).toBe('paye');
    expect(etatPaiementTrajet('TERMINEE', libre('SUCCEEDED'))).toBe('paye');
  });

  it('payé puis course non aboutie : remboursement en cours, puis remboursé', () => {
    expect(etatPaiementTrajet('ANNULEE', exige('SUCCEEDED'))).toBe('remboursement');
    expect(etatPaiementTrajet('SANS_CHAUFFEUR', exige('SUCCEEDED'))).toBe('remboursement');
    expect(etatPaiementTrajet('ANNULEE', exige('REFUND_REQUESTED'))).toBe('remboursement');
    expect(etatPaiementTrajet('ANNULEE', exige('REFUND_FAILED'))).toBe('remboursement');
    expect(etatPaiementTrajet('ANNULEE', exige('REFUNDED'))).toBe('rembourse');
  });

  it('un paiement remboursé ne remontre jamais le formulaire, même si la course est encore en recherche', () => {
    expect(etatPaiementTrajet('RECHERCHE', exige('REFUNDED'))).toBe('rembourse');
  });
});
