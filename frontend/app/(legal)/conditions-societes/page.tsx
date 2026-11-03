import PageLegale, { metadataLegale } from '@/components/PageLegale';

export const generateMetadata = () => metadataLegale('conditions-societes');

export default function Page() {
  return <PageLegale slug="conditions-societes" />;
}
