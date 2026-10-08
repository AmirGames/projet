import PageLegale, { metadataLegale } from '@/components/PageLegale';

export const generateMetadata = () => metadataLegale('accessibilite');

export default function Page() {
  return <PageLegale slug="accessibilite" />;
}
