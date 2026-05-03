import { NextRequest, NextResponse } from 'next/server';

import { generateTimetable } from '@/lib/services/timetable-generation.service';
import { AppError } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import { generateTimetableRequestSchema } from '@/lib/validation/schemas';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const payload = await request.json();
    const parsed = generateTimetableRequestSchema.parse(payload);
    const result = await generateTimetable(parsed);

    return NextResponse.json(
      {
        success: true,
        message: result.validation.conflictFree
          ? 'Timetable generated without hard conflicts.'
          : 'Timetable generated with review items.',
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