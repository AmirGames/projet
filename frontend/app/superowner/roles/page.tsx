'use client';

import { useCallback, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ShieldCheck, Save, RotateCcw, Plus, Trash2 } from 'lucide-react';
import { useEffectChargement } from '@/lib/use-effect-chargement';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

type Niveau = 'read' | 'write';
type Permissions = Record<string, Niveau>;

interface Section {
  id: string;
  label: string;
  groupe: string;
}

interface Role {
  code: string;
  label: string;
  permissions: Permissions;
  membres: number;
  /** SuperAdmin, Administrateur, Support : ne se suppriment pas. */
  deBase: boolean;
}

/**
 * La grille des droits de l'équipe : une ligne par section, deux cases par
 * groupe. « Modifier » entraîne « Voir » ; décocher « Voir » retire les deux.
 */
export default function RolesPage() {
  const t = useTranslations('superownerRoles');
  const [sections, setSections] = useState<Section[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  // Chaque plateforme du groupe a sa propre grille.
  const [plateforme, setPlateforme] = useState('EAT');
  const [plateformes, setPlateformes] = useState<{ code: string; label: string }[]>([]);
  const [brouillon, setBrouillon] = useState<Record<string, Permissions>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'ok' | 'erreur'; texte: string } | null>(null);
  const [nouveauRole, setNouveauRole] = useState('');
  const [creation, setCreation] = useState(false);

  const charger = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`${API_URL}/api/superowner/roles?plateforme=${plateforme}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(t('loadError'));
      const data: {
        sections: Section[];
        roles: Role[];
        plateformes: { code: string; label: string }[];
      } = await res.json();
      setSections(data.sections);
      setPlateformes(data.plateformes);
      setRoles(data.roles);
      setBrouillon(Object.fromEntries(data.roles.map((r) => [r.code, { ...r.permissions }])));
      setMessage(null);
    } catch (err) {
      setMessage({ type: 'erreur', texte: err instanceof Error ? err.message : t('loadError') });
    } finally {
      setLoading(false);
    }
  }, [t, plateforme]);

  useEffectChargement(() => {
    charger();
  }, [charger]);

  const groupes = useMemo(() => {
    const parGroupe: { nom: string; sections: Section[] }[] = [];
    for (const section of sections) {
      const dernier = parGroupe[parGroupe.length - 1];
      if (dernier && dernier.nom === section.groupe) dernier.sections.push(section);
      else parGroupe.push({ nom: section.groupe, sections: [section] });
    }
    return parGroupe;
  }, [sections]);

  const modifie = (code: string) => {
    const initial = roles.find((r) => r.code === code)?.permissions ?? {};
    const actuel = brouillon[code] ?? {};
    const cles = new Set([...Object.keys(initial), ...Object.keys(actuel)]);
    return [...cles].some((cle) => initial[cle] !== actuel[cle]);
  };

  const cocher = (code: string, section: string, niveau: Niveau, coche: boolean) => {
    setBrouillon((b) => {
      const permissions = { ...(b[code] ?? {}) };
      if (niveau === 'write') {
        if (coche) permissions[section] = 'write';
        else if (permissions[section] === 'write') permissions[section] = 'read';
      } else if (coche) {
        permissions[section] = permissions[section] ?? 'read';
      } else {
        delete permissions[section];
      }
      return { ...b, [code]: permissions };
    });
    setMessage(null);
  };

  const toutCocher = (code: string, niveau: Niveau | null) => {
    setBrouillon((b) => ({
      ...b,
      [code]: niveau ? Object.fromEntries(sections.map((s) => [s.id, niveau])) : {},
    }));
    setMessage(null);
  };

  const annuler = (code: string) => {
    const initial = roles.find((r) => r.code === code)?.permissions ?? {};
    setBrouillon((b) => ({ ...b, [code]: { ...initial } }));
  };

  const enregistrer = async (code: string) => {
    setSaving(code);
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`${API_URL}/api/superowner/roles/${code}?plateforme=${plateforme}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions: brouillon[code] ?? {} }),
      });
      if (!res.ok) throw new Error(t('saveError'));
      const data: { role: { permissions: Permissions } } = await res.json();
      setRoles((liste) =>
        liste.map((r) => (r.code === code ? { ...r, permissions: data.role.permissions } : r))
      );
      setBrouillon((b) => ({ ...b, [code]: { ...data.role.permissions } }));
      setMessage({ type: 'ok', texte: t('saved') });
    } catch (err) {
      setMessage({ type: 'erreur', texte: err instanceof Error ? err.message : t('saveError') });
    } finally {
      setSaving(null);
    }
  };

  const messageDErreur = async (res: Response, parDefaut: string) => {
    const data = await res.json().catch(() => ({}));
    return data?.error?.message || data?.message || parDefaut;
  };

  const creerRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (nouveauRole.trim().length < 2) return;
    setCreation(true);
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`${API_URL}/api/superowner/roles?plateforme=${plateforme}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: nouveauRole.trim() }),
      });
      if (!res.ok) throw new Error(await messageDErreur(res, t('createError')));
      const data: { role: Role } = await res.json();
      setRoles((liste) => [...liste, { ...data.role, permissions: {} }]);
      setBrouillon((b) => ({ ...b, [data.role.code]: {} }));
      setNouveauRole('');
      setMessage({ type: 'ok', texte: t('created', { role: data.role.label }) });
    } catch (err) {
      setMessage({ type: 'erreur', texte: err instanceof Error ? err.message : t('createError') });
    } finally {
      setCreation(false);
    }
  };

  const supprimerRole = async (role: Role) => {
    if (!confirm(t('deleteConfirm', { role: role.label }))) return;
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`${API_URL}/api/superowner/roles/${role.code}?plateforme=${plateforme}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await messageDErreur(res, t('deleteError')));
      setRoles((liste) => liste.filter((r) => r.code !== role.code));
      setMessage({ type: 'ok', texte: t('deleted', { role: role.label }) });
    } catch (err) {
      setMessage({ type: 'erreur', texte: err instanceof Error ? err.message : t('deleteError') });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShieldCheck className="text-red-500" />
          {t('title')}
        </h1>
        <p className="text-gray-400 mt-1">{t('subtitle')}</p>
      </div>

      <div role="tablist" aria-label={t('platform')} className="flex gap-2">
        {plateformes.map((p) => (
          <button
            key={p.code}
            role="tab"
            aria-selected={p.code === plateforme}
            onClick={() => setPlateforme(p.code)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
              p.code === plateforme ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <form onSubmit={creerRole} className="flex flex-wrap items-end gap-2">
        <label className="flex-1 min-w-[200px] max-w-sm">
          <span className="block text-sm text-gray-400 mb-1">{t('newRole')}</span>
          <input
            value={nouveauRole}
            onChange={(e) => setNouveauRole(e.target.value)}
            placeholder={t('newRolePlaceholder')}
            maxLength={40}
            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
          />
        </label>
        <button
          type="submit"
          disabled={creation || nouveauRole.trim().length < 2}
          className="flex items-center gap-1 px-4 py-2 rounded bg-green-600 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white"
        >
          <Plus size={16} />
          {t('create')}
        </button>
      </form>

      {message && (
        <div
          role="status"
          className={`p-3 rounded-lg text-sm ${
            message.type === 'ok'
              ? 'bg-green-900/30 border border-green-700 text-green-300'
              : 'bg-red-900/30 border border-red-700 text-red-300'
          }`}
        >
          {message.texte}
        </div>
      )}

      <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-700/50 border-b border-gray-700">
            <tr>
              <th rowSpan={2} className="px-4 py-3 text-left font-semibold align-bottom">
                {t('section')}
              </th>
              {roles.map((role) => (
                <th key={role.code} colSpan={2} className="px-4 pt-3 text-center font-semibold border-l border-gray-700">
                  <div className="flex items-center justify-center gap-1">
                    {role.label}
                    {!role.deBase && (
                      <button
                        onClick={() => supprimerRole(role)}
                        title={t('delete')}
                        aria-label={`${t('delete')} ${role.label}`}
                        className="p-1 text-red-400 hover:bg-red-900/30 rounded"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  <div className="text-xs font-normal text-gray-400">
                    {t('members', { count: role.membres })}
                  </div>
                  <div className="flex justify-center gap-2 mt-2 text-xs font-normal">
                    <button onClick={() => toutCocher(role.code, 'read')} className="text-blue-400 hover:underline">
                      {t('allView')}
                    </button>
                    <button onClick={() => toutCocher(role.code, 'write')} className="text-blue-400 hover:underline">
                      {t('allEdit')}
                    </button>
                    <button onClick={() => toutCocher(role.code, null)} className="text-gray-400 hover:underline">
                      {t('none')}
                    </button>
                  </div>
                </th>
              ))}
            </tr>
            <tr>
              {roles.map((role) => (
                <th key={role.code} colSpan={2} className="px-4 pb-2 border-l border-gray-700">
                  <div className="grid grid-cols-2 text-xs font-normal text-gray-400">
                    <span>{t('view')}</span>
                    <span>{t('edit')}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groupes.map((groupe) => (
              <GroupeLignes
                key={groupe.nom}
                nom={groupe.nom}
                sections={groupe.sections}
                roles={roles}
                brouillon={brouillon}
                cocher={cocher}
                libelles={{ view: t('view'), edit: t('edit') }}
              />
            ))}
          </tbody>
          <tfoot className="border-t border-gray-700">
            <tr>
              <td className="px-4 py-3"></td>
              {roles.map((role) => (
                <td key={role.code} colSpan={2} className="px-4 py-3 border-l border-gray-700">
                  <div className="flex flex-col items-center gap-2">
                    {modifie(role.code) && (
                      <span className="text-xs text-yellow-400">{t('unsaved')}</span>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={() => enregistrer(role.code)}
                        disabled={!modifie(role.code) || saving !== null}
                        className="flex items-center gap-1 px-3 py-1.5 rounded bg-green-600 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white"
                      >
                        <Save size={14} />
                        {saving === role.code ? t('saving') : t('save')}
                      </button>
                      {modifie(role.code) && (
                        <button
                          onClick={() => annuler(role.code)}
                          title={t('reset')}
                          aria-label={t('reset')}
                          className="p-1.5 rounded bg-gray-700 hover:bg-gray-600 text-white"
                        >
                          <RotateCcw size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function GroupeLignes({
  nom,
  sections,
  roles,
  brouillon,
  cocher,
  libelles,
}: {
  nom: string;
  sections: Section[];
  roles: Role[];
  brouillon: Record<string, Permissions>;
  cocher: (code: string, section: string, niveau: Niveau, coche: boolean) => void;
  libelles: { view: string; edit: string };
}) {
  return (
    <>
      <tr className="bg-gray-900/40">
        <td colSpan={1 + roles.length * 2} className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
          {nom}
        </td>
      </tr>
      {sections.map((section) => (
        <tr key={section.id} className="border-t border-gray-700/50 hover:bg-gray-700/30">
          <td className="px-4 py-2">{section.label}</td>
          {roles.map((role) => {
            const niveau = brouillon[role.code]?.[section.id];
            return [
              <td key={`${role.code}-r`} className="px-4 py-2 text-center border-l border-gray-700">
                <input
                  type="checkbox"
                  checked={!!niveau}
                  onChange={(e) => cocher(role.code, section.id, 'read', e.target.checked)}
                  aria-label={`${role.label} · ${section.label} · ${libelles.view}`}
                  className="w-4 h-4 accent-blue-500"
                />
              </td>,
              <td key={`${role.code}-w`} className="px-4 py-2 text-center">
                <input
                  type="checkbox"
                  checked={niveau === 'write'}
                  onChange={(e) => cocher(role.code, section.id, 'write', e.target.checked)}
                  aria-label={`${role.label} · ${section.label} · ${libelles.edit}`}
                  className="w-4 h-4 accent-red-500"
                />
              </td>,
            ];
          })}
        </tr>
      ))}
    </>
  );
}
