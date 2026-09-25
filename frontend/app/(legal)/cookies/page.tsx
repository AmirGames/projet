import PageLegale, { metadataLegale } from '@/components/PageLegale';

export const generateMetadata = () => metadataLegale('cookies');

export default function Page() {
  return <PageLegale slug="cookies" />;
}
