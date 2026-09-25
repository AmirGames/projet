import PageLegale, { metadataLegale } from '@/components/PageLegale';

export const generateMetadata = () => metadataLegale('mentions-legales');

export default function Page() {
  return <PageLegale slug="mentions-legales" />;
}
