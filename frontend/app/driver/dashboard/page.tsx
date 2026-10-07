/**
 * Driver Dashboard - Real-time earnings, metrics, notifications
 * /driver/dashboard
 */

import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { DriverDashboardClient } from '@/components/zupdrive/DriverDashboardClient';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('driver');
  return {
    title: `${t('dashboard')} — ZupDrive`,
    description: t('dashboardDescription'),
  };
}

export default function DriverDashboard() {
  return <DriverDashboardClient />;
}
