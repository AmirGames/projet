import type { Marque } from '@/lib/marques';

/** Wordmark text shared by the platform headers and footers. */
export function NomMarque({ marque, className = '' }: { marque: Marque; className?: string }) {
  const suffixe = marque === 'zupone' ? 'One' : marque === 'zupeat' ? 'Eat' : 'Drive';
  const couleurSuffixe = marque === 'zupone'
    ? 'text-[#D8B274]'
    : marque === 'zupeat'
      ? 'text-[#FF7A00]'
      : '';

  return (
    <span className={className}>
      <span>Zup</span><span className={couleurSuffixe}>{suffixe}</span>
    </span>
  );
}
