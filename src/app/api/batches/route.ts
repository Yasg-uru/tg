import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db/connection';
import { Batch } from '@/lib/db/models';

export async function GET(request: NextRequest) {
  try {
    await dbConnect();

    const batches = await Batch.find({})
      .select('batchId batchName branch year semester')
      .lean();

    return NextResponse.json({
      success: true,
      count: batches.length,
      batches,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        message: error.message,
      },
      { status: 500 }
    );
  }
}
