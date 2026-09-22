'use client';

import { useTranslations } from 'next-intl';

import { useState } from 'react';
import { FileJson, FileText } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function ExportsPage() {
  const t = useTranslations('superadminExports');
  const [loading, setLoading] = useState('');
  const [message, setMessage] = useState('');

  const exportData = async (type: string, format: 'csv' | 'json') => {
    setLoading(type);
    try {
      const token = localStorage.getItem('accessToken');

      if (type === 'merchants') {
        const response = await fetch(`${API_URL}/api/admin/merchants?limit=10000`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json();
        downloadFile(data.merchants, `merchants-${new Date().toISOString().split('T')[0]}`, format);
      } else if (type === 'commissions') {
        const response = await fetch(`${API_URL}/api/admin/commissions?limit=10000`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json();
        downloadFile(data.commissions, `commissions-${new Date().toISOString().split('T')[0]}`, format);
      } else if (type === 'stats') {
        const response = await fetch(`${API_URL}/api/admin/stats`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json();
        downloadFile([data], `stats-${new Date().toISOString().split('T')[0]}`, format);
      }

      setMessage(t('success'));
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      console.error('Erreur:', error);
      setMessage(t('error'));
      setTimeout(() => setMessage(''), 3000);
    } finally {
      setLoading('');
    }
  };

  const downloadFile = (data: any, filename: string, format: 'csv' | 'json') => {
    let content, type, extension;

    if (format === 'json') {
      content = JSON.stringify(data, null, 2);
      type = 'application/json';
      extension = 'json';
    } else {
      // Convert to CSV
      const array = Array.isArray(data) ? data : [data];
      const headers = array.length > 0 ? Object.keys(array[0]) : [];
      const csv = [
        headers.join(','),
        ...array.map(obj =>
          headers.map(h => {
            const val = obj[h];
            if (typeof val === 'object') return JSON.stringify(val);
            if (typeof val === 'string' && val.includes(',')) return `"${val}"`;
            return val;
          }).join(',')
        ),
      ].join('\n');
      content = csv;
      type = 'text/csv';
      extension = 'csv';
    }

    const blob = new Blob([content], { type });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.${extension}`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <p className="text-gray-400 mt-1">{t('subtitle')}</p>
      </div>

      {/* Message */}
      {message && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          {message}
        </div>
      )}

      {/* Export Options */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Merchants Export */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 space-y-4">
          <div>
            <h3 className="text-lg font-bold mb-2">📊 Commerçants</h3>
            <p className="text-gray-400 text-sm">Données de tous les commerçants</p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => exportData('merchants', 'csv')}
              disabled={loading === 'merchants'}
              className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg px-4 py-2 font-medium transition-colors"
            >
              <FileText size={18} />
              CSV
            </button>
            <button
              onClick={() => exportData('merchants', 'json')}
              disabled={loading === 'merchants'}
              className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg px-4 py-2 font-medium transition-colors"
            >
              <FileJson size={18} />
              JSON
            </button>
          </div>
        </div>

        {/* Commissions Export */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 space-y-4">
          <div>
            <h3 className="text-lg font-bold mb-2">💰 Commissions</h3>
            <p className="text-gray-400 text-sm">Historique des commissions</p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => exportData('commissions', 'csv')}
              disabled={loading === 'commissions'}
              className="flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-lg px-4 py-2 font-medium transition-colors"
            >
              <FileText size={18} />
              CSV
            </button>
            <button
              onClick={() => exportData('commissions', 'json')}
              disabled={loading === 'commissions'}
              className="flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-lg px-4 py-2 font-medium transition-colors"
            >
              <FileJson size={18} />
              JSON
            </button>
          </div>
        </div>

        {/* Stats Export */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 space-y-4">
          <div>
            <h3 className="text-lg font-bold mb-2">📈 Statistiques</h3>
            <p className="text-gray-400 text-sm">Vue d'ensemble du système</p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => exportData('stats', 'csv')}
              disabled={loading === 'stats'}
              className="flex-1 flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded-lg px-4 py-2 font-medium transition-colors"
            >
              <FileText size={18} />
              CSV
            </button>
            <button
              onClick={() => exportData('stats', 'json')}
              disabled={loading === 'stats'}
              className="flex-1 flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded-lg px-4 py-2 font-medium transition-colors"
            >
              <FileJson size={18} />
              JSON
            </button>
          </div>
        </div>

        {/* Audit Logs Export */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 space-y-4">
          <div>
            <h3 className="text-lg font-bold mb-2">📝 Journaux d'audit</h3>
            <p className="text-gray-400 text-sm">Historique des actions admin</p>
          </div>

          <div className="flex gap-2">
            <button
              disabled
              className="flex-1 flex items-center justify-center gap-2 bg-gray-700 opacity-50 rounded-lg px-4 py-2 font-medium"
            >
              <FileText size={18} />
              CSV
            </button>
            <button
              disabled
              className="flex-1 flex items-center justify-center gap-2 bg-gray-700 opacity-50 rounded-lg px-4 py-2 font-medium"
            >
              <FileJson size={18} />
              JSON
            </button>
          </div>
          <p className="text-xs text-gray-500">Voir la page Journaux d'audit</p>
        </div>
      </div>

      {/* Info */}
      <div className="bg-blue-600/20 border border-blue-600/50 rounded-lg p-4">
        <p className="text-blue-400 text-sm">
          💡 Les exports contiennent toutes les données de la catégorie sélectionnée.
          Les formats CSV et JSON sont compatibles avec Excel et les outils d'analyse.
        </p>
      </div>
    </div>
  );
}
