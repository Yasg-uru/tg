import { NextRequest, NextResponse } from 'next/server';
import { CSVUploadService } from '@/lib/services/csv-upload.service';
import { logger } from '@/lib/utils/logger';
import { AppError } from '@/lib/utils/errors';

/**
 * POST handler for CSV upload
 * Refactored to use CSVUploadService for clean separation of concerns
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    logger.info('CSV upload request received', { method: 'POST' });

    // Parse form data
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const fileTypeHint = formData.get('fileType') as string | null;

    // Delegate processing to the service layer
    const response = await CSVUploadService.processUpload(file, fileTypeHint);

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    
    // Handle application-specific errors
    if (error instanceof AppError) {
      logger.warn(`Application error: ${message}`, { 
        statusCode: error.statusCode,
        details: error.details 
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

    // Handle unexpected errors
    logger.error('Unexpected error during CSV upload', { error: message });

    return NextResponse.json(
      {
        success: false,
        message: 'An unexpected error occurred during upload',
        errors: [message],
      },
      { status: 500 }
    );
  }
}

/**
 * OPTIONS handler for CORS
 */
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
