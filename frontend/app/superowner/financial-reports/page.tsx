'use client';

import { useEffect, useState } from 'react';
import { FileText, Calendar } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface FinancialReport {
  id: string;
  period: string;
  totalRevenue: number;
  platformFee: number;
  commissions: number;
  taxes: number;
  netRevenue: number;
  transactions: number;
  status: 'FINALIZED' | 'DRAFT' | 'PENDING';
}

export default function FinancialReportsPage() {
  const [reports, setReports] = useState<FinancialReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('month');

  useEffect(() => {
    fetchReports();
  }, [dateRange]);

  const fetchReports = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/api/superowner/financial-reports?range=${dateRange}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Failed to fetch');
      const data = await response.json();
      setReports(data.reports || []);
    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  };

  const downloadReport = (reportId: string, format: 'pdf' | 'csv') => {
    const link = document.createElement('a');
    link.href = `${API_URL}/api/superowner/financial-reports/${reportId}/download?format=${format}`;
    link.download = `report-${reportId}.${format}`;
    link.click();
  };

  if (loading) return <div className="text-center py-8">Chargement...</div>;

  const totalRevenue = reports.reduce((sum, r) => sum + r.totalRevenue, 0);
  const totalCommissions = reports.reduce((sum, r) => sum + r.commissions, 0);
  const totalTaxes = reports.reduce((sum, r) => sum + r.taxes, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <FileText size={32} />
          Rapports Financiers
        </h1>
        <p className="text-gray-400 mt-1">Analyses détaillées des revenus et dépenses</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <p className="text-gray-400 text-sm mb-2">Revenu Total</p>
          <p className="text-3xl font-bold text-green-400">${(totalRevenue / 100).toFixed(0)}</p>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <p className="text-gray-400 text-sm mb-2">Commissions</p>
          <p className="text-3xl font-bold text-blue-400">${(totalCommissions / 100).toFixed(0)}</p>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <p className="text-gray-400 text-sm mb-2">Impôts</p>
          <p className="text-3xl font-bold text-yellow-400">${(totalTaxes / 100).toFixed(0)}</p>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <p className="text-gray-400 text-sm mb-2">Rapports Totaux</p>
          <p className="text-3xl font-bold text-purple-400">{reports.length}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
        <div className="flex items-center gap-2">
          <Calendar size={20} className="text-gray-400" />
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
          >
            <option value="month">Ce mois</option>
            <option value="quarter">Ce trimestre</option>
            <option value="year">Cette année</option>
            <option value="all">Tous les rapports</option>
          </select>
        </div>
      </div>

      {/* Reports Table */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
        {reports.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            Aucun rapport trouvé.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-700 border-b border-gray-600">
              <tr>
                <th className="px-6 py-4 text-left">Période</th>
                <th className="px-6 py-4 text-right">Revenu</th>
                <th className="px-6 py-4 text-right">Frais Plateforme</th>
                <th className="px-6 py-4 text-right">Commissions</th>
                <th className="px-6 py-4 text-right">Impôts</th>
                <th className="px-6 py-4 text-right">Net</th>
                <th className="px-6 py-4 text-center">Statut</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((report) => (
                <tr key={report.id} className="border-b border-gray-700 hover:bg-gray-700/50">
                  <td className="px-6 py-4 font-medium">{report.period}</td>
                  <td className="px-6 py-4 text-right font-bold text-green-400">
                    ${(report.totalRevenue / 100).toFixed(2)}
                  </td>
                  <td className="px-6 py-4 text-right text-gray-400">
                    ${(report.platformFee / 100).toFixed(2)}
                  </td>
                  <td className="px-6 py-4 text-right text-blue-400">
                    ${(report.commissions / 100).toFixed(2)}
                  </td>
                  <td className="px-6 py-4 text-right text-yellow-400">
                    ${(report.taxes / 100).toFixed(2)}
                  </td>
                  <td className="px-6 py-4 text-right font-bold">
                    ${(report.netRevenue / 100).toFixed(2)}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        report.status === 'FINALIZED'
                          ? 'bg-green-600/20 text-green-400'
                          : report.status === 'DRAFT'
                          ? 'bg-yellow-600/20 text-yellow-400'
                          : 'bg-blue-600/20 text-blue-400'
                      }`}
                    >
                      {report.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => downloadReport(report.id, 'pdf')}
                        className="p-2 hover:bg-gray-600 rounded transition-colors text-red-400 text-xs"
                        title="PDF"
                      >
                        PDF
                      </button>
                      <button
                        onClick={() => downloadReport(report.id, 'csv')}
                        className="p-2 hover:bg-gray-600 rounded transition-colors text-green-400 text-xs"
                        title="CSV"
                      >
                        CSV
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Info */}
      <div className="bg-blue-600/20 border border-blue-600/50 rounded-lg p-4">
        <p className="text-blue-400 text-sm">
          💡 Les rapports financiers sont générés automatiquement à la fin de chaque période. Les données incluent tous les revenus, commissions et taxes.
        </p>
      </div>
    </div>
  );
}
