import { PayeeLockDashboard } from '@/components/payeelock-dashboard';
import { getPayeeLockCase } from '@/lib/payeelock-case';

export const dynamic = 'force-dynamic';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const [data, query] = await Promise.all([getPayeeLockCase(), searchParams]);
  const step = Number(query.step);
  const view = typeof query.view === 'string' ? query.view : '';
  return (
    <PayeeLockDashboard
      data={data}
      initialMode={query.mode === 'use' ? 'use' : 'review'}
      initialStep={Number.isInteger(step) && step >= 1 && step <= 7 ? step : 1}
      initialView={['case', 'evidence', 'permissions'].includes(view) ? view : 'case'}
    />
  );
}
