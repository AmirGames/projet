import { FileSocietes } from '../_file-societes';

/** Un dossier ouvert directement, depuis une notification. */
export default async function DossierSocietePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <FileSocietes idInitial={id} />;
}
