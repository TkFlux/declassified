import { NextRequest, NextResponse } from 'next/server';
import { getAgenciesAsync, isReadOnly, queryRecordsAsync } from '@/lib/store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const q = sp.get('q') || undefined;
    const agency = sp.get('agency') || 'all';
    const download = (sp.get('download') || 'all') as
      | 'all'
      | 'available'
      | 'page-only';
    const limit = Number(sp.get('limit') || 24);
    const offset = Number(sp.get('offset') || 0);

    const { rows, total } = await queryRecordsAsync({
      q,
      agency,
      download,
      limit,
      offset,
    });

    return NextResponse.json({
      rows,
      total,
      limit,
      offset,
      agencies: await getAgenciesAsync(),
      readOnly: isReadOnly(),
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}
