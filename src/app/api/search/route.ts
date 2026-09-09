import { NextRequest, NextResponse } from 'next/server';
import { queryRecords } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams.get('q') || '';
    if (!q) {
      return NextResponse.json({ error: 'q required' }, { status: 400 });
    }
    const { rows, total } = queryRecords({
      q,
      limit: Number(req.nextUrl.searchParams.get('limit') || 20),
      offset: 0,
    });
    return NextResponse.json({ rows, total });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}
