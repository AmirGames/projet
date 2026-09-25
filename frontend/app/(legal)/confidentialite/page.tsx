import PageLegale, { metadataLegale } from '@/components/PageLegale';

export const generateMetadata = () => metadataLegale('confidentialite');

export default function Page() {
  return <PageLegale slug="confidentialite" />;
}
