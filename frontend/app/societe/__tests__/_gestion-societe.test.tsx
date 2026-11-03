import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import GestionSocieteDrive from '../_gestion-societe';
import { useAuth } from '@/lib/auth-context';

jest.mock('@/lib/auth-context', () => ({ useAuth: jest.fn() }));
jest.mock('@/lib/jeton-session', () => ({ jetonAcces: () => 'jeton-test' }));
jest.mock('@/lib/erreurs', () => ({ signalerErreur: jest.fn() }));
jest.mock('@/components/LienPiece', () => ({
  LienPiece: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));

const authentifier = jest.mocked(useAuth);

function reponse(data: unknown) {
  return Promise.resolve({ ok: true, json: async () => ({ data }) } as Response);
}

const dossier = {
  id: 'societe-1',
  raisonSociale: 'Taxi Namur',
  numeroEntreprise: '0123456749',
  numeroTva: 'BE0123456749',
  region: 'WALLONIE',
  telephone: '+32 470 00 00 00',
  statut: 'BROUILLON',
  motifStatut: null,
  documents: [],
  piecesExigees: [{ type: 'tva', libelle: 'Attestation TVA' }, { type: 'certificat_acces_profession', libelle: 'Certificat' }],
  piecesManquantes: ['tva', 'certificat_acces_profession'],
  piecesAValider: [],
  champsManquants: [],
  peutSoumettre: false,
  dossierValidable: false,
  vehicules: [],
  chauffeurs: [],
  invitations: [],
};

describe('portail société taxi ZupDrive', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authentifier.mockReturnValue({ user: null, isLoading: false } as ReturnType<typeof useAuth>);
    global.fetch = jest.fn(async (input) => {
      const url = String(input);
      if (url.endsWith('/me')) return reponse(null);
      return reponse([]);
    }) as jest.Mock;
  });

  it('demande la connexion quand le compte n’est pas connecté', async () => {
    render(<GestionSocieteDrive />);
    expect(await screen.findByRole('link', { name: 'Se connecter' })).toHaveAttribute('href', '/login?next=%2Fsociete');
  });

  it('permet d’ajouter un véhicule avec sa capacité passagers', async () => {
    authentifier.mockReturnValue({ user: { id: 'gerant-1', email: 'gerant@example.be' }, isLoading: false } as ReturnType<typeof useAuth>);
    const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/me/courses?limit=20')) return reponse([]);
      if (url.endsWith('/me/vehicules') && init?.method === 'POST') return reponse({ id: 'vehicule-1' });
      if (url.endsWith('/me')) return reponse(dossier);
      return reponse([]);
    });
    global.fetch = fetchMock as jest.Mock;

    render(<GestionSocieteDrive />);
    await screen.findByRole('heading', { name: '2. Véhicules' });
    fireEvent.change(screen.getByLabelText('Marque'), { target: { value: 'Toyota' } });
    fireEvent.change(screen.getByLabelText('Modèle'), { target: { value: 'Prius' } });
    fireEvent.change(screen.getByLabelText('Plaque'), { target: { value: '1-ABC-123' } });
    fireEvent.change(screen.getByLabelText('Places passagers'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter le véhicule' }));

    await screen.findByText('Véhicule ajouté. Déposez maintenant ses justificatifs.');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/zupdrive/societe/me/vehicules'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer jeton-test' }),
        body: JSON.stringify({ marque: 'Toyota', modele: 'Prius', plaque: '1-ABC-123', placesPassagers: 5, numeroLicence: '' }),
      })
    ));
  });
});
