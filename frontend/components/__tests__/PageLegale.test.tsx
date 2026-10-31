import { afterEach, jest } from '@jest/globals';
import type { ComponentType, ReactNode } from 'react';
import { render, screen } from '@testing-library/react';

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

jest.mock('remark-gfm', () => ({ __esModule: true, default: jest.fn() }));

jest.mock('react-markdown', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: ({ components }: { components?: { table?: ComponentType<{ children: ReactNode }> } }) => {
      const contenu = React.createElement(
        React.Fragment,
        null,
        React.createElement('thead', null, React.createElement('tr', null,
          React.createElement('th', null, 'Donnée'), React.createElement('th', null, 'Durée'))),
        React.createElement('tbody', null, React.createElement('tr', null,
          React.createElement('td', null, 'Commandes'), React.createElement('td', null, '14 jours'))),
      );
      return components?.table
        ? React.createElement(components.table, null, contenu)
        : React.createElement('table', null, contenu);
    },
  };
});

jest.mock('@/components/LienRegional', () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

import PageLegale from '../PageLegale';

describe('PageLegale', () => {
  const ancienFetch = global.fetch;
  afterEach(() => { global.fetch = ancienFetch; });

  it('affiche une table Markdown dans une région défilante accessible et la version publiée', async () => {
    const fetchMock = jest.fn(async () => ({
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
    }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const element = await PageLegale({ slug: 'confidentialite' });
    const { container } = render(element);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/pages-legales/confidentialite'),
      { cache: 'no-store' },
    );
    expect(screen.getByRole('region', { name: 'Tableau défilant' })).toBeTruthy();
    expect(container.querySelector('.overflow-x-auto table')).not.toBeNull();
    expect(screen.getByText('Version 2026-10-31')).toBeTruthy();
  });
});

