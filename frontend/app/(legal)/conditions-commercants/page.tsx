import PageLegale, { metadataLegale } from '@/components/PageLegale';

export const generateMetadata = () => metadataLegale('conditions-commercants');

export default function Page() {
  return <PageLegale slug="conditions-commercants" />;
}
