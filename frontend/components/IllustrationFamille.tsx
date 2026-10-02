import { visuelDeFamille } from '@/lib/visuels-familles';

/**
 * L'image par défaut d'un commerce sans photo : le dégradé de sa famille et
 * son emoji, en grand et en écho. Elle remplit son parent (positionné), comme
 * le ferait la photo de couverture.
 */
export function IllustrationFamille({
  famille,
  grande = false,
}: {
  famille: string | null | undefined;
  /** La bannière d'une vitrine : emojis plus grands et plus espacés. */
  grande?: boolean;
}) {
  const { emoji, de, a } = visuelDeFamille(famille);

  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 overflow-hidden"
      style={{ backgroundImage: `linear-gradient(135deg, ${de}, ${a})` }}
    >
      <div className="absolute -right-10 -top-12 h-48 w-48 rounded-full bg-white/10" />
      <div className="absolute -bottom-16 -left-10 h-40 w-40 rounded-full bg-black/10" />
      <div
        className={`absolute inset-0 flex select-none items-center justify-center ${
          grande ? 'gap-10 md:gap-16' : 'gap-4'
        }`}
      >
        <span className={`-rotate-12 opacity-60 ${grande ? 'text-6xl md:text-7xl' : 'text-4xl'}`}>{emoji}</span>
        <span className={`drop-shadow-xl ${grande ? 'text-7xl md:text-[7rem]' : 'text-6xl'}`}>{emoji}</span>
        <span className={`rotate-12 opacity-60 ${grande ? 'text-6xl md:text-7xl' : 'text-4xl'}`}>{emoji}</span>
      </div>
    </div>
  );
}
