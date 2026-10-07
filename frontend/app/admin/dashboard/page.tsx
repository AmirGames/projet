/**
 * Admin Dashboard - Platform monitoring, compliance, payouts
 * /admin/dashboard
 */

import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AdminDashboardClient } from '@/components/zupdrive/AdminDashboardClient';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin');
  return {
    title: `${t('dashboard')} — ZupDrive`,
    description: t('dashboardDescription'),
  };
}

export default function AdminDashboard() {
  return <AdminDashboardClient />;
}
