import { Feed } from '@/components/Feed';
import { isReadOnly, queryRecordsAsync } from '@/lib/store';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const { rows, total } = await queryRecordsAsync({ limit: 12, offset: 0 });
  return (
    <Feed
      initialRows={rows}
      initialTotal={total}
      initialReadOnly={isReadOnly()}
    />
  );
}
