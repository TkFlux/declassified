import { NextRequest, NextResponse } from 'next/server';
import {
  createDraft,
  getRecordById,
  isReadOnly,
  listDrafts,
  READ_ONLY_BANNER,
  updateDraftStatus,
} from '@/lib/store';
import { buildTweetDraft } from '@/lib/draft-text';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function readOnlyResponse() {
  return NextResponse.json(
    {
      error: READ_ONLY_BANNER,
      readOnly: true,
      drafts: [],
    },
    { status: 403 }
  );
}

export async function GET(req: NextRequest) {
  try {
    if (isReadOnly()) {
      return NextResponse.json({
        drafts: [],
        readOnly: true,
        banner: READ_ONLY_BANNER,
      });
    }
    const status = req.nextUrl.searchParams.get('status') || 'pending';
    const drafts = listDrafts(status);
    return NextResponse.json({ drafts, readOnly: false });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    if (isReadOnly()) return readOnlyResponse();
    const body = (await req.json()) as { recordId?: string; text?: string };
    if (!body.recordId) {
      return NextResponse.json({ error: 'recordId required' }, { status: 400 });
    }
    const record = getRecordById(body.recordId);
    if (!record) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 });
    }
    const text = body.text?.trim() || buildTweetDraft(record);
    const draft = createDraft(record.id, text);
    return NextResponse.json({ draft }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    if (isReadOnly()) return readOnlyResponse();
    const body = (await req.json()) as {
      id?: number;
      status?: 'pending' | 'approved' | 'rejected';
    };
    if (!body.id || !body.status) {
      return NextResponse.json(
        { error: 'id and status required' },
        { status: 400 }
      );
    }
    if (!['pending', 'approved', 'rejected'].includes(body.status)) {
      return NextResponse.json({ error: 'invalid status' }, { status: 400 });
    }
    const draft = updateDraftStatus(body.id, body.status);
    if (!draft) {
      return NextResponse.json({ error: 'Draft not found' }, { status: 404 });
    }
    return NextResponse.json({ draft });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}
