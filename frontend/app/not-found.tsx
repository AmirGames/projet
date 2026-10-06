import Link from '@/components/LienRegional';
import { useTranslations } from 'next-intl';

export default function NotFound() {
  const t = useTranslations('pageIntrouvable');
  return (
    <div className="min-h-screen bg-[#F7F7F6] text-gray-900 flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <h1 className="text-8xl font-extrabold tracking-tight mb-4 text-orange-600">404</h1>
        <h2 className="text-3xl font-extrabold tracking-tight mb-4">{t('titre')}</h2>
        <p className="text-lg text-gray-500 mb-8">
          {t('texte')}
        </p>
        <div className="flex flex-wrap gap-3 justify-center">
          <Link
            href="/"
            className="px-6 py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-full font-bold"
          >
            {t('accueil')}
          </Link>
          <Link
            href="/dashboard"
            className="px-6 py-3 bg-white border border-gray-200 hover:border-gray-400 text-gray-900 rounded-full font-bold"
          >
            {t('tableau')}
          </Link>
        </div>
      </div>
    </div>
  );
}
