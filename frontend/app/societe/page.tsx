import type { Metadata } from 'next';
import GestionSocieteDrive from './_gestion-societe';

export const metadata: Metadata = {
  title: 'Espace société taxi | ZupDrive',
  description: 'Gérez votre dossier, vos véhicules et vos chauffeurs ZupDrive.',
};

export default function SocieteDrivePage() {
  return <GestionSocieteDrive />;
}
