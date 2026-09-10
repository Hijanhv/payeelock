import { PayeeLockDashboard } from '@/components/payeelock-dashboard';
import { getPayeeLockCase } from '@/lib/payeelock-case';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const data = await getPayeeLockCase();
  return <PayeeLockDashboard data={data} />;
}
