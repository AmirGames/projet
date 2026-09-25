import PageLegale, { metadataLegale } from '@/components/PageLegale';

export const generateMetadata = () => metadataLegale('cgv');

export default function Page() {
  return <PageLegale slug="cgv" />;
}
