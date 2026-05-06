import { NextRequest, NextResponse } from 'next/server';
import { ensureApiAuth } from '@/lib/auth/api';
import { dbConnect } from '@/lib/db/connection';
import { Batch } from '@/lib/db/models';

export async function GET(request: NextRequest) {
  try {
    const unauthorized = await ensureApiAuth(request);
    if (unauthorized) {
      return unauthorized;
    }

    await dbConnect();

    const batches = await Batch.find({})
      .select('batchId batchName branch year semester academicYear')
      .lean();

    return NextResponse.json({
      success: true,
      count: batches.length,
      batches,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      {
        success: false,
        message,
      },
      { status: 500 }
    );
  }
}
