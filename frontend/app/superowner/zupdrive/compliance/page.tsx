'use client';

/**
 * ZupDrive Admin — Compliance & Audit
 * Audit logs, document verification workflows, compliance reports.
 */

import { useState, useCallback } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Shield, FileCheck, AlertCircle, Loader2, Clock } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface AuditLog {
  id: string;
  action: string;
  actorId: string;
  actorType: string;
  resourceType: string;
  resourceId: string;
  createdAt: string;
  reason?: string;
}

interface ComplianceReport {
  id: string;
  reportType: string;
  totalDrivers: number;
  driversWithValidDocuments: number;
  driversWithExpiringDocuments: number;
  complianceRate: number;
  riskScore: number;
  generatedAt: string;
}

export default function CompliancePage() {
  const t = useTranslations('superownerZupdriveCompliance');
  const locale = useLocale() === 'en' ? 'en-US' : 'fr-FR';
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [reports, setReports] = useState<ComplianceReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'audit' | 'reports'>('audit');
  const [resourceTypeFilter, setResourceTypeFilter] = useState<string>('');

  const loadAuditLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (resourceTypeFilter) params.append('resourceType', resourceTypeFilter);
      params.append('limit', '100');

      const response = await fetch(`${API_URL}/api/zupdrive/compliance/admin/audit-logs?${params}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });

      if (!response.ok) throw new Error(t('logsLoadError'));
      const { logs } = await response.json();
      setAuditLogs(logs);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('unknownError'));
    } finally {
      setLoading(false);
    }
  }, [resourceTypeFilter, t]);

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/zupdrive/compliance/admin/reports?limit=20`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });

      if (!response.ok) throw new Error(t('reportsLoadError'));
      const { reports: data } = await response.json();
      setReports(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('unknownError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const handleGenerateReport = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/zupdrive/compliance/admin/reports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          reportType: 'AD_HOC',
          generatedBy: 'ADMIN',
        }),
      });

      if (!response.ok) throw new Error(t('generateError'));
      alert(t('generated'));
      await loadReports();
    } catch (err) {
      alert(err instanceof Error ? err.message : t('unknownError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">{t('title')}</h1>
        <p className="text-gray-600 mt-2">{t('subtitle')}</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => {
            setActiveTab('audit');
            loadAuditLogs();
          }}
          className={`px-4 py-2 font-medium ${
            activeTab === 'audit'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Clock className="w-4 h-4 inline mr-2" />
          {t('tabAudit')}
        </button>
        <button
          onClick={() => {
            setActiveTab('reports');
            loadReports();
          }}
          className={`px-4 py-2 font-medium ${
            activeTab === 'reports'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <FileCheck className="w-4 h-4 inline mr-2" />
          {t('tabReports')}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600" />
          <div>
            <h3 className="font-medium text-red-900">{t('errorTitle')}</h3>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-gray-400" />
        </div>
      ) : (
        <>
          {activeTab === 'audit' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('filterByType')}</label>
                <select
                  value={resourceTypeFilter}
                  onChange={(e) => setResourceTypeFilter(e.target.value)}
                  className="w-full md:w-64 px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="">{t('allTypes')}</option>
                  <option value="DRIVER">{t('type_DRIVER')}</option>
                  <option value="DOCUMENT">{t('type_DOCUMENT')}</option>
                  <option value="INFRACTION">{t('type_INFRACTION')}</option>
                  <option value="PAYMENT">{t('type_PAYMENT')}</option>
                </select>
              </div>

              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-gray-700 font-medium">{t('colAction')}</th>
                      <th className="px-4 py-3 text-left text-gray-700 font-medium">{t('colType')}</th>
                      <th className="px-4 py-3 text-left text-gray-700 font-medium">{t('colActor')}</th>
                      <th className="px-4 py-3 text-left text-gray-700 font-medium">{t('colResource')}</th>
                      <th className="px-4 py-3 text-left text-gray-700 font-medium">{t('colDate')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.map((log) => (
                      <tr key={log.id} className="border-b border-gray-200 hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium">{log.action}</td>
                        <td className="px-4 py-3">
                          <span className="inline-block px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">
                            {t.has(`type_${log.resourceType}`) ? t(`type_${log.resourceType}`) : log.resourceType}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{log.actorType}</td>
                        <td className="px-4 py-3 text-gray-600">{log.resourceId}</td>
                        <td className="px-4 py-3 text-gray-600">
                          {new Date(log.createdAt).toLocaleDateString(locale)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'reports' && (
            <div className="space-y-4">
              <button
                onClick={handleGenerateReport}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                {t('generate')}
              </button>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {reports.map((report) => (
                  <div key={report.id} className="bg-white rounded-lg border border-gray-200 p-4">
                    <div className="flex justify-between items-start mb-3">
                      <h3 className="font-semibold">{report.reportType}</h3>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        report.riskScore > 50
                          ? 'bg-red-100 text-red-700'
                          : report.riskScore > 25
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-green-100 text-green-700'
                      }`}>
                        {t('riskScore', { score: report.riskScore.toFixed(0) })}
                      </span>
                    </div>

                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">{t('totalDrivers')}</span>
                        <span className="font-medium">{report.totalDrivers}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">{t('validDocuments')}</span>
                        <span className="font-medium">{report.driversWithValidDocuments}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">{t('expiringDocuments')}</span>
                        <span className="font-medium">{report.driversWithExpiringDocuments}</span>
                      </div>
                      <div className="flex justify-between border-t pt-2">
                        <span className="text-gray-600">{t('complianceRate')}</span>
                        <span className="font-medium">{report.complianceRate.toFixed(1)}%</span>
                      </div>
                    </div>

                    <p className="text-xs text-gray-500 mt-3">
                      {t('generatedOn', { date: new Date(report.generatedAt).toLocaleDateString(locale) })}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
