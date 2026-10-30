'use client';

import { jetonAcces } from '@/lib/jeton-session';
import { signalerErreur } from '@/lib/erreurs';
import { useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Users, Search, Eye, Pencil, Ban, CheckCircle, XCircle } from 'lucide-react';
import { useEffectChargement } from '@/lib/use-effect-chargement';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

type StatutClient = 'active' | 'suspended' | 'inactive';
type StatutApiClient = 'ACTIVE' | 'BLOCKED';

interface Client {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  status: StatutClient;
  joinDate: string;
  totalOrders?: number;
  totalSpent?: number;
}

interface DetailClient extends Client {
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  orders: Array<{
    id: string;
    status: string;
    totalAmount: number;
    createdAt: string;
    store: { name: string };
  }>;
}

interface ConfirmationStatut {
  client: Client;
  status: StatutApiClient;
}

export default function ClientsPage() {
  const t = useTranslations('superownerMembers');
  const locale = useLocale();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatutClient | 'all'>('all');
  const [details, setDetails] = useState<DetailClient | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editReason, setEditReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState('');
  const [message, setMessage] = useState('');
  const [statusConfirmation, setStatusConfirmation] = useState<ConfirmationStatut | null>(null);
  const [statusReason, setStatusReason] = useState('');
  const [statusSaving, setStatusSaving] = useState(false);

  const fetchClients = async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const response = await fetch(`${API_URL}/api/superowner/members/clients?limit=100`, {
        headers: { Authorization: `Bearer ${jetonAcces()}` },
      });
      if (!response.ok) throw new Error('Failed to fetch clients');
      const data = await response.json();
      setClients((data.clients || []).map((row: Omit<Client, 'status'> & { status: string }) => ({
        ...row,
        status: row.status === 'BLOCKED' || row.status.toLowerCase() === 'blocked'
          ? 'suspended'
          : row.status.toLowerCase() as StatutClient,
      })));
    } catch (error) {
      setLoadError(true);
      signalerErreur('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffectChargement(() => {
    fetchClients();
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-50 text-green-600';
      case 'suspended': return 'bg-orange-50 text-orange-600';
      case 'inactive': return 'bg-gray-100 text-gray-600';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const formatDate = (value?: string | null) => {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(locale);
  };

  const ouvrirDetails = async (client: Client) => {
    setEditingClient(null);
    setActionError('');
    setMessage('');
    setDetails(null);
    setDetailLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/superowner/members/clients/${encodeURIComponent(client.id)}`, {
        headers: { Authorization: `Bearer ${jetonAcces()}` },
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || t('clientLoadError'));
      const clientData = data.client as Omit<DetailClient, 'status' | 'orders'> & {
        status: string;
        orders?: DetailClient['orders'];
      };
      setDetails({
        ...clientData,
        status: clientData.status === 'BLOCKED' ? 'suspended' : clientData.status.toLowerCase() as StatutClient,
        orders: clientData.orders ?? [],
      });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : t('clientLoadError'));
    } finally {
      setDetailLoading(false);
    }
  };

  const ouvrirEdition = (client: Client) => {
    setDetails(null);
    setEditingClient(client);
    setEditName(client.name);
    setEditPhone(client.phone || '');
    setEditReason('');
    setActionError('');
    setMessage('');
  };

  const enregistrer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingClient) return;
    setSaving(true);
    setActionError('');
    setMessage('');
    try {
      const response = await fetch(`${API_URL}/api/superowner/members/clients/${encodeURIComponent(editingClient.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jetonAcces()}` },
        body: JSON.stringify({
          name: editName.trim(),
          phone: editPhone.trim() || null,
          reason: editReason.trim(),
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || t('editError'));
      const updated = data.client as Client;
      setClients((current) => current.map((client) => client.id === updated.id
        ? { ...client, name: updated.name, phone: updated.phone }
        : client));
      setEditingClient(null);
      setMessage(t('editSuccess'));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : t('editError'));
    } finally {
      setSaving(false);
    }
  };

  const confirmerStatut = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!statusConfirmation) return;
    setStatusSaving(true);
    setActionError('');
    setMessage('');
    try {
      const response = await fetch(`${API_URL}/api/superowner/members/clients/${encodeURIComponent(statusConfirmation.client.id)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jetonAcces()}` },
        body: JSON.stringify({ status: statusConfirmation.status, reason: statusReason.trim() }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || t('statusError'));
      const status: StatutClient = data.client.status === 'BLOCKED' ? 'suspended' : 'active';
      setClients((current) => current.map((client) => client.id === data.client.id ? { ...client, status } : client));
      setDetails((current) => {
        if (!current || current.id !== data.client.id) return current;
        return { ...current, status };
      });
      setMessage(statusConfirmation.status === 'BLOCKED' ? t('suspendSuccess') : t('reactivateSuccess'));
      setStatusConfirmation(null);
      setStatusReason('');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : t('statusError'));
    } finally {
      setStatusSaving(false);
    }
  };

  const filteredClients = clients.filter((client) => {
    const query = searchTerm.trim().toLowerCase();
    const matchesSearch = !query || client.name.toLowerCase().includes(query) || client.email.toLowerCase().includes(query);
    return matchesSearch && (statusFilter === 'all' || client.status === statusFilter);
  });

  if (loading && clients.length === 0) return <div className="py-8 text-center" role="status">{t('loading')}</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold"><Users size={32} className="text-blue-600" />{t('clientsTitle')}</h1>
        <p className="mt-1 text-gray-500">{t('clientsSubtitle')}</p>
      </div>

      {(actionError || loadError) && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800" role="alert">
          <span>{actionError || t('clientLoadError')}</span>
          {loadError && <button type="button" onClick={fetchClients} className="rounded-md border border-red-300 px-3 py-2 font-medium hover:bg-red-100">{t('retry')}</button>}
        </div>
      )}
      {message && <p role="status" className="rounded-lg border border-green-200 bg-green-50 p-4 text-green-700">{message}</p>}

      {detailLoading && <p role="status" className="text-sm text-gray-500">{t('loading')}</p>}
      {details && (
        <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-6" aria-labelledby="client-detail-title">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="client-detail-title" className="text-xl font-semibold text-gray-900">{t('clientDetailsTitle')}</h2>
              <p className="mt-1 text-sm text-gray-500">{details.name} · {details.email}</p>
            </div>
            <button type="button" onClick={() => setDetails(null)} className="rounded-sm bg-gray-100 px-3 py-2 text-sm text-gray-900 hover:bg-gray-200">{t('close')}</button>
          </div>
          <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <div><dt className="text-gray-500">{t('phone')}</dt><dd className="font-medium text-gray-900">{details.phone || '—'}</dd></div>
            <div><dt className="text-gray-500">{t('joinDate')}</dt><dd className="font-medium text-gray-900">{formatDate(details.joinDate)}</dd></div>
            <div><dt className="text-gray-500">{t('statusColumn')}</dt><dd className="font-medium text-gray-900">{t(`status.${details.status}`)}</dd></div>
            <div><dt className="text-gray-500">{t('address')}</dt><dd className="font-medium text-gray-900">{[details.address, details.postalCode, details.city].filter(Boolean).join(', ') || '—'}</dd></div>
            <div><dt className="text-gray-500">{t('ordersLabel')}</dt><dd className="font-medium text-gray-900">{details.totalOrders ?? details.orders.length}</dd></div>
            <div><dt className="text-gray-500">{t('spendingLabel')}</dt><dd className="font-medium text-gray-900">{Number(details.totalSpent || 0).toLocaleString(locale, { style: 'currency', currency: 'EUR' })}</dd></div>
          </dl>
          <div>
            <h3 className="mb-2 font-semibold text-gray-900">{t('recentOrdersTitle')}</h3>
            {details.orders.length === 0 ? <p className="text-sm text-gray-500">{t('recentOrdersEmpty')}</p> : (
              <ul className="divide-y divide-gray-100">
                {details.orders.map((order) => (
                  <li key={order.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <span className="text-gray-700">{order.store.name} · {new Date(order.createdAt).toLocaleDateString(locale)} · {order.status}</span>
                    <span className="font-medium text-gray-900">{order.totalAmount.toLocaleString(locale, { style: 'currency', currency: 'EUR' })}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {editingClient && (
        <form onSubmit={enregistrer} className="space-y-4 rounded-lg border border-gray-200 bg-white p-6">
          <div>
            <h2 className="font-semibold text-gray-900">{t('editClientTitle')}</h2>
            <p className="mt-1 text-sm text-gray-500">{t('editClientInfo')}</p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="client-edit-name" className="mb-1 block text-sm text-gray-500">{t('name')}</label>
              <input id="client-edit-name" required minLength={2} maxLength={100} value={editName} onChange={(event) => setEditName(event.target.value)} className="w-full rounded-sm border border-gray-300 bg-gray-100 px-3 py-2 text-sm text-gray-900" />
            </div>
            <div>
              <label htmlFor="client-edit-phone" className="mb-1 block text-sm text-gray-500">{t('phone')}</label>
              <input id="client-edit-phone" type="tel" maxLength={32} value={editPhone} onChange={(event) => setEditPhone(event.target.value)} className="w-full rounded-sm border border-gray-300 bg-gray-100 px-3 py-2 text-sm text-gray-900" />
            </div>
            <div className="md:col-span-2">
              <label htmlFor="client-edit-reason" className="mb-1 block text-sm text-gray-500">{t('editReason')}</label>
              <textarea id="client-edit-reason" required minLength={3} maxLength={500} rows={3} value={editReason} onChange={(event) => setEditReason(event.target.value)} className="w-full rounded-sm border border-gray-300 bg-gray-100 px-3 py-2 text-sm text-gray-900" />
            </div>
          </div>
          {actionError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">{actionError}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="rounded-sm bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-50">{saving ? t('loading') : t('save')}</button>
            <button type="button" disabled={saving} onClick={() => { setEditingClient(null); setActionError(''); }} className="rounded-sm bg-gray-100 px-4 py-2 text-sm text-gray-900 hover:bg-gray-200 disabled:opacity-50">{t('cancel')}</button>
          </div>
        </form>
      )}

      <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
        <div className="relative">
          <Search size={18} aria-hidden="true" className="absolute left-3 top-3 text-gray-500" />
          <input type="search" aria-label={t('searchPlaceholder')} placeholder={t('searchPlaceholder')} value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} className="w-full rounded-lg border border-gray-300 bg-gray-100 py-2 pl-10 pr-4 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-hidden" />
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('filters')}>
          {(['all', 'active', 'suspended', 'inactive'] as const).map((status) => (
            <button key={status} type="button" aria-pressed={statusFilter === status} onClick={() => setStatusFilter(status)} className={`rounded-lg border px-4 py-2 transition-colors ${statusFilter === status ? 'border-blue-600 bg-blue-50 text-blue-600' : 'border-gray-300 bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
              {status === 'all' ? t('allStatuses') : t(`status.${status}`)}
            </button>
          ))}
        </div>
      </div>

      {loading && clients.length > 0 && <p role="status" className="text-sm text-gray-500">{t('loading')}</p>}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        {filteredClients.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-gray-300 bg-gray-100">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">{t('name')}</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">{t('email')}</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">{t('joinDate')}</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">{t('statusColumn')}</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">{t('actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredClients.map((client) => {
                  const active = client.status === 'active';
                  return (
                    <tr key={client.id} className="transition-colors hover:bg-gray-50">
                      <td className="px-6 py-4 font-medium text-gray-900">{client.name}</td>
                      <td className="px-6 py-4 text-sm text-gray-500">{client.email}</td>
                      <td className="px-6 py-4 text-sm text-gray-500">{formatDate(client.joinDate)}</td>
                      <td className="px-6 py-4"><span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${getStatusColor(client.status)}`}>{active ? <CheckCircle size={16} /> : <XCircle size={16} />}{t.has(`status.${client.status}`) ? t(`status.${client.status}`) : client.status}</span></td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          <button type="button" onClick={() => ouvrirDetails(client)} className="rounded-sm p-2 text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600" title={t('view')} aria-label={`${t('view')} — ${client.name}`}><Eye size={18} /></button>
                          <button type="button" onClick={() => ouvrirEdition(client)} className="rounded-sm p-2 text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600" title={t('edit')} aria-label={`${t('edit')} — ${client.name}`}><Pencil size={18} /></button>
                          <button type="button" onClick={() => { setStatusConfirmation({ client, status: active ? 'BLOCKED' : 'ACTIVE' }); setStatusReason(''); setActionError(''); }} className={`rounded-sm p-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 ${active ? 'text-orange-700 hover:bg-orange-50' : 'text-green-700 hover:bg-green-50'}`} title={active ? t('suspendClient') : t('reactivateClient')} aria-label={`${active ? t('suspendClient') : t('reactivateClient')} — ${client.name}`}>{active ? <Ban size={18} /> : <CheckCircle size={18} />}</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-12 text-center"><Users size={48} className="mx-auto mb-4 text-gray-400" /><p className="text-gray-500">{t('empty')}</p></div>
        )}
      </div>

      {statusConfirmation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <section role="alertdialog" aria-modal="true" aria-labelledby="client-status-title" aria-describedby="client-status-description" className="w-full max-w-lg space-y-4 rounded-xl bg-white p-6 shadow-xl">
            <div>
              <h2 id="client-status-title" className="text-xl font-semibold text-gray-900">{statusConfirmation.status === 'BLOCKED' ? t('suspendClientTitle') : t('reactivateClientTitle')}</h2>
              <p id="client-status-description" className="mt-2 text-sm text-gray-600">{statusConfirmation.status === 'BLOCKED' ? t('suspendClientInfo', { name: statusConfirmation.client.name }) : t('reactivateClientInfo', { name: statusConfirmation.client.name })}</p>
            </div>
            <form onSubmit={confirmerStatut} className="space-y-4">
              <div>
                <label htmlFor="client-status-reason" className="mb-1 block text-sm text-gray-500">{t('statusReason')}</label>
                <textarea id="client-status-reason" required minLength={3} maxLength={500} rows={3} value={statusReason} onChange={(event) => setStatusReason(event.target.value)} className="w-full rounded-sm border border-gray-300 bg-gray-100 px-3 py-2 text-sm text-gray-900" />
              </div>
              {actionError && <p role="alert" className="text-sm text-red-700">{actionError}</p>}
              <div className="flex justify-end gap-2">
                <button type="button" disabled={statusSaving} onClick={() => { setStatusConfirmation(null); setActionError(''); }} className="rounded-sm bg-gray-100 px-4 py-2 text-sm text-gray-900 hover:bg-gray-200 disabled:opacity-50">{t('cancel')}</button>
                <button type="submit" disabled={statusSaving} className={`rounded-sm px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${statusConfirmation.status === 'BLOCKED' ? 'bg-orange-600 hover:bg-orange-500' : 'bg-green-600 hover:bg-green-500'}`}>{statusSaving ? t('loading') : statusConfirmation.status === 'BLOCKED' ? t('confirmSuspendClient') : t('confirmReactivateClient')}</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
