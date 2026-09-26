import PageLegale, { metadataLegale } from '@/components/PageLegale';

export const generateMetadata = () => metadataLegale('conditions-livreurs');

export default function Page() {
  return <PageLegale slug="conditions-livreurs" />;
}
