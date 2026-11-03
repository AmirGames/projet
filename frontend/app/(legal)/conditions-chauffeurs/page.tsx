import PageLegale, { metadataLegale } from '@/components/PageLegale';

export const generateMetadata = () => metadataLegale('conditions-chauffeurs');

export default function Page() {
  return <PageLegale slug="conditions-chauffeurs" />;
}
