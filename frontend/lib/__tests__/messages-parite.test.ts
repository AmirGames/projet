/**
 * Les deux langues portent exactement les mêmes clés, et chaque message garde
 * les mêmes variables ICU (`{nom}`) : une clé absente d'un côté s'affiche brute
 * (ou lève une erreur) pour tout un public.
 */
import fr from '../../messages/fr.json';
import en from '../../messages/en.json';

/** Un message, ou un groupe de messages (objet ou liste, imbriqués sans limite). */
type Arbre = string | { [cle: string]: Arbre } | Arbre[];

function aplatir(arbre: Arbre, prefixe = ''): Record<string, string> {
  if (typeof arbre === 'string') return { [prefixe.replace(/\.$/, '')]: arbre };
  const sortie: Record<string, string> = {};
  for (const [cle, valeur] of Object.entries(arbre)) Object.assign(sortie, aplatir(valeur, `${prefixe}${cle}.`));
  return sortie;
}

/** Les variables d'un message ICU : `{nom}` et `{nombre, plural, …}` (le premier mot seulement). */
function variables(message: string): string[] {
  const noms = new Set<string>();
  const profondeur: string[] = [];
  for (let i = 0; i < message.length; i++) {
    const c = message[i];
    if (c === '{') {
      if (profondeur.length === 0 || profondeur.length % 2 === 0) {
        const m = /^\{\s*([A-Za-z0-9_]+)/.exec(message.slice(i));
        if (m) noms.add(m[1]);
      }
      profondeur.push('{');
    } else if (c === '}') profondeur.pop();
  }
  return [...noms].sort();
}

const messagesFr = aplatir(fr);
const messagesEn = aplatir(en);

describe('messages fr.json / en.json', () => {
  it('ont les mêmes clés', () => {
    const manquantesEn = Object.keys(messagesFr).filter((cle) => !(cle in messagesEn));
    const manquantesFr = Object.keys(messagesEn).filter((cle) => !(cle in messagesFr));
    expect({ manquantesEn, manquantesFr }).toEqual({ manquantesEn: [], manquantesFr: [] });
  });

  it('gardent les mêmes variables dans chaque message', () => {
    const differences = Object.keys(messagesFr)
      .filter((cle) => cle in messagesEn)
      .filter((cle) => variables(messagesFr[cle]).join() !== variables(messagesEn[cle]).join())
      .map((cle) => `${cle} : fr {${variables(messagesFr[cle])}} ≠ en {${variables(messagesEn[cle])}}`);
    expect(differences).toEqual([]);
  });

  it("n'ont aucun message vide", () => {
    const vides = [
      ...Object.entries(messagesFr).filter(([, v]) => v.trim() === '').map(([c]) => `fr:${c}`),
      ...Object.entries(messagesEn).filter(([, v]) => v.trim() === '').map(([c]) => `en:${c}`),
    ];
    expect(vides).toEqual([]);
  });
});
