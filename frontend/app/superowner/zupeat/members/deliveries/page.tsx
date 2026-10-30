import { redirect } from 'next/navigation';

export default function LegacyDeliveriesMembersPage() {
  redirect('/superowner/zupeat/drivers?status=ALL');
}
