'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { Send, Check, CheckCheck, Package } from 'lucide-react';

export interface MessageSupport {
  id: string;
  driverId: string;
  sender: 'DRIVER' | 'SUPPORT';
  body: string;
  deliveryId: string | null;
  readAt: string | null;
  createdAt: string;
}

interface Props {
  messages: MessageSupport[];
  /** Qui regarde le fil : ses messages s'alignent à droite. */
  moi: 'DRIVER' | 'SUPPORT';
  /** Renvoie false si l'envoi a échoué, pour garder le texte saisi. */
  surEnvoi: (texte: string) => Promise<boolean>;
  vide?: string;
  hauteur?: string;
}

const heure = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Un fil de discussion livreur ↔ support, commun aux deux espaces. */
export function FilSupport({ messages, moi, surEnvoi, vide, hauteur = 'h-[60vh]' }: Props) {
  const [texte, setTexte] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const bas = useRef<HTMLDivElement>(null);

  // Le dernier message reste en vue à chaque arrivée.
  useEffect(() => {
    bas.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length]);

  const envoyer = async (e: FormEvent) => {
    e.preventDefault();
    const contenu = texte.trim();
    if (!contenu || envoi) return;

    setEnvoi(true);
    if (await surEnvoi(contenu)) setTexte('');
    setEnvoi(false);
  };

  return (
    <div className="flex flex-col bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
      <div className={`${hauteur} overflow-y-auto p-4 space-y-3`}>
        {messages.length === 0 && (
          <p className="text-center text-gray-500 text-sm py-12">{vide || 'Aucun message pour le moment.'}</p>
        )}

        {messages.map((m) => {
          const deMoi = m.sender === moi;
          return (
            <div key={m.id} className={`flex ${deMoi ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                  deMoi ? 'bg-orange-600 text-white rounded-br-sm' : 'bg-gray-700 text-gray-100 rounded-bl-sm'
                }`}
              >
                {!deMoi && (
                  <p className="text-xs font-semibold text-orange-300 mb-0.5">
                    {m.sender === 'SUPPORT' ? 'Support' : 'Livreur'}
                  </p>
                )}
                <p className="whitespace-pre-wrap break-words text-sm">{m.body}</p>
                <div className={`flex items-center gap-2 mt-1 text-[11px] ${deMoi ? 'text-orange-100/80' : 'text-gray-400'}`}>
                  {m.deliveryId && (
                    <span className="inline-flex items-center gap-1" title="Envoyé pendant une course">
                      <Package size={11} /> course
                    </span>
                  )}
                  <span>{heure(m.createdAt)}</span>
                  {deMoi && (m.readAt ? <CheckCheck size={13} aria-label="Lu" /> : <Check size={13} aria-label="Envoyé" />)}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bas} />
      </div>

      <form onSubmit={envoyer} className="border-t border-gray-700 p-3 flex gap-2">
        <textarea
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          onKeyDown={(e) => {
            // Entrée envoie, Maj+Entrée va à la ligne.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              envoyer(e as unknown as FormEvent);
            }
          }}
          rows={1}
          maxLength={2000}
          placeholder="Votre message…"
          className="flex-1 resize-none bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
        />
        <button
          type="submit"
          disabled={envoi || !texte.trim()}
          className="px-4 bg-orange-600 hover:bg-orange-700 disabled:opacity-40 rounded-lg text-white"
          aria-label="Envoyer"
        >
          <Send size={18} />
        </button>
      </form>
    </div>
  );
}
