import { NextRequest, NextResponse } from 'next/server';

import { generateTimetable } from '@/lib/services/timetable-generation.service';
import { dbConnect } from '@/lib/db/connection';
import { GeneratedTimetable } from '@/lib/db/generated-timetable.model';
import { AppError } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import { generateTimetableRequestSchema } from '@/lib/validation/schemas';

export async function GET(): Promise<NextResponse> {
  try {
    await dbConnect();

    const latest = await GeneratedTimetable.findOne({ status: { $in: ['draft', 'published'] } })
      .sort({ createdAt: -1 })
      .lean<{
        generationId: string;
        status: 'draft' | 'published' | 'failed';
        provider: string;
        aiModel: string;
        assignments: Array<Record<string, unknown>>;
        validation: Record<string, unknown>;
        score: Record<string, unknown>;
        summary: Record<string, unknown>;
      } | null>();

    if (!latest) {
      return NextResponse.json(
        {
          success: true,
          message: 'No generated timetable found',
          data: null,
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Latest generated timetable fetched successfully',
        data: {
          generationId: latest.generationId,
          status: latest.status === 'published' ? 'published' : 'draft',
          provider: latest.provider,
          model: latest.aiModel,
          assignments: latest.assignments,
          validation: latest.validation,
          score: latest.score,
          summary: latest.summary,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Unexpected error while fetching generated timetable', {
      error: message,
    });

    return NextResponse.json(
      {
        success: false,
        message: 'An unexpected error occurred while fetching generated timetable',
        errors: [message],
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const payload = await request.json();
    const parsed = generateTimetableRequestSchema.parse(payload);
    const result = await generateTimetable(parsed);

    if (!result.persisted && parsed.persist !== false) {
      logger.error('Timetable generated but failed to persist to database', {
        generationId: result.generationId,
      });

      return NextResponse.json(
        {
          success: false,
          message: 'Timetable generated but failed to save to database. Check server logs for details.',
          errors: ['Database persistence failed'],
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: result.validation.conflictFree
          ? 'Timetable generated and saved successfully.'
          : 'Timetable generated and saved with review items.',
        data: result,
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    if (error instanceof AppError) {
      logger.warn(`Application error: ${message}`, {
        statusCode: error.statusCode,
        details: error.details,
      });

      return NextResponse.json(
        {
          success: false,
          message: error.message,
          ...(error.details || {}),
        },
        { status: error.statusCode }
      );
    }

    logger.error('Unexpected error during timetable generation', {
      error: message,
    });

    return NextResponse.json(
      {
        success: false,
        message: 'An unexpected error occurred during timetable generation',
        errors: [message],
      },
      { status: 500 }
    );
  }
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}