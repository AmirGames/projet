import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach } from '@jest/globals';
import type { ReactNode } from 'react';

jest.mock('next-intl/server', () => ({
  getLocale: jest.fn(async () => 'fr'),
  getTranslations: jest.fn(async () => (cle: string, valeurs: Record<string, string> = {}) => {
    const messages: Record<string, string> = {
      titre: 'Page légale',
      tableauDefilant: 'Tableau défilant',
      version: `Version ${valeurs.version}`,
      enVigueur: `En vigueur depuis ${valeurs.date}`,
      indisponible: 'Cette page est indisponible.',
    };
    return messages[cle] ?? cle;
  }),
}));

jest.mock('@/components/LienRegional', () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

import PageLegale from '../PageLegale';

describe('PageLegale', () => {
  const ancienFetch = global.fetch;
  afterEach(() => { global.fetch = ancienFetch; });

  it('affiche une table Markdown dans une région défilante accessible et la version publiée', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          slug: 'confidentialite',
          titre: 'Confidentialité',
          contenu: '| Donnée | Durée |\n| --- | --- |\n| Commandes | 14 jours |',
          version: '2026-10-31',
          publieLe: '2026-10-31T12:00:00.000Z',
        },
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const element = await PageLegale({ slug: 'confidentialite' });
    const html = renderToStaticMarkup(element);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/pages-legales/confidentialite'),
      { cache: 'no-store' },
    );
    expect(html).toContain('role="region"');
    expect(html).toContain('aria-label="Tableau défilant"');
    expect(html).toContain('overflow-x-auto');
    expect(html).toContain('<table');
    expect(html).toContain('Version 2026-10-31');
  });
});

