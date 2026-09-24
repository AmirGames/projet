'use client';

import { useRef, useState } from 'react';
import { ChevronsRight, Loader } from 'lucide-react';

interface Props {
  libelle: string;
  /** Appelé une fois le curseur mené au bout. */
  onValide: () => void;
  desactive?: boolean;
  enCours?: boolean;
}

/**
 * Un curseur à faire glisser jusqu'au bout pour valider.
 *
 * Un bouton se touche par mégarde, une poche suffit : pour une étape qui ne se
 * défait pas — la commande quitte le commerce —, le geste doit être voulu.
 * Relâché avant le bout, le curseur revient à sa place.
 */
export function GlisserPourValider({ libelle, onValide, desactive, enCours }: Props) {
  const piste = useRef<HTMLDivElement>(null);
  const depart = useRef<number | null>(null);
  const [decalage, setDecalage] = useState(0);
  const [glisse, setGlisse] = useState(false);

  const TAILLE_CURSEUR = 56;
  const course = () => Math.max(0, (piste.current?.clientWidth ?? 0) - TAILLE_CURSEUR - 8);

  const bloque = desactive || enCours;

  const commencer = (e: React.PointerEvent<HTMLDivElement>) => {
    if (bloque) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    depart.current = e.clientX - decalage;
    setGlisse(true);
  };

  const suivre = (e: React.PointerEvent<HTMLDivElement>) => {
    if (depart.current == null) return;
    setDecalage(Math.min(course(), Math.max(0, e.clientX - depart.current)));
  };

  const lacher = () => {
    if (depart.current == null) return;
    depart.current = null;
    setGlisse(false);

    // Mené à 90 % du bout : c'est voulu. En deçà, il revient.
    if (decalage >= course() * 0.9) {
      setDecalage(course());
      onValide();
      // Le curseur revient si l'étape échoue : la page reste la même.
      setTimeout(() => setDecalage(0), 1500);
    } else {
      setDecalage(0);
    }
  };

  // Au clavier, sans glisser : Entrée ou espace sur le curseur.
  const auClavier = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (bloque) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onValide();
    }
  };

  const avancement = course() > 0 ? decalage / course() : 0;

  return (
    <div
      ref={piste}
      className={`relative h-16 w-full select-none overflow-hidden rounded-full border ${
        bloque ? 'border-gray-700 bg-gray-800' : 'border-green-700 bg-green-900/40'
      }`}
    >
      <div
        className="absolute inset-y-0 left-0 bg-green-600/40"
        style={{ width: decalage + TAILLE_CURSEUR }}
      />
      <p
        className={`absolute inset-0 flex items-center justify-center pl-12 text-sm font-semibold ${
          bloque ? 'text-gray-500' : 'text-green-200'
        }`}
        style={{ opacity: 1 - avancement }}
      >
        {libelle}
      </p>
      <div
        role="button"
        tabIndex={bloque ? -1 : 0}
        aria-label={libelle}
        aria-disabled={bloque}
        onPointerDown={commencer}
        onPointerMove={suivre}
        onPointerUp={lacher}
        onPointerCancel={lacher}
        onKeyDown={auClavier}
        className={`absolute top-1 left-1 flex items-center justify-center rounded-full touch-none ${
          bloque ? 'bg-gray-600 cursor-not-allowed' : 'bg-green-500 cursor-grab active:cursor-grabbing'
        } ${glisse ? '' : 'transition-transform duration-200'}`}
        style={{
          width: TAILLE_CURSEUR,
          height: TAILLE_CURSEUR,
          transform: `translateX(${decalage}px)`,
        }}
      >
        {enCours ? (
          <Loader size={24} className="animate-spin text-white" />
        ) : (
          <ChevronsRight size={28} className="text-white" />
        )}
      </div>
    </div>
  );
}
