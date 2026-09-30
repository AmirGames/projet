import { FileChauffeurs } from '../_file-chauffeurs';

/** Un dossier ouvert directement, depuis une notification. */
export default async function DossierChauffeurPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <FileChauffeurs idInitial={id} />;
}
