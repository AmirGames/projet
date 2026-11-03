import { describe, expect, it, jest } from '@jest/globals';
import { adresseTrajet, type SuggestionAdresse } from './adresses';

jest.mock('./api', () => ({ apiFetch: jest.fn() }));

const namur: SuggestionAdresse = {
  label: "Place d'Armes, 5000 Namur, Belgique",
  street: "Place d'Armes",
  city: 'Namur',
  postalCode: '5000',
  latitude: 50.4632,
  longitude: 4.8665,
  preuveAdresse: 'preuve-signee-par-le-serveur',
};

describe('sélection géocodée d’une adresse ZupDrive', () => {
  it('conserve la preuve signée pour le devis et les favoris', () => {
    expect(adresseTrajet(namur)).toEqual({
      adresse: namur.label,
      latitude: namur.latitude,
      longitude: namur.longitude,
      codePostal: namur.postalCode,
      preuveAdresse: namur.preuveAdresse,
    });
  });

  it('refuse une suggestion sans preuve signée', () => {
    expect(adresseTrajet({ ...namur, preuveAdresse: null })).toBeNull();
  });

  it('refuse une suggestion sans coordonnées ou code postal', () => {
    expect(adresseTrajet({ ...namur, latitude: null })).toBeNull();
    expect(adresseTrajet({ ...namur, postalCode: '' })).toBeNull();
  });
});
