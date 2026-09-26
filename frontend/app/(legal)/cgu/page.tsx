import PageLegale, { metadataLegale } from '@/components/PageLegale';

export const generateMetadata = () => metadataLegale('cgu');

export default function Page() {
  return <PageLegale slug="cgu" />;
}
