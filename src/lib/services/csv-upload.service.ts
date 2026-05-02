import { dbConnect } from '@/lib/db/connection';
import { upsertCSVData } from '@/lib/db/service';
import {
  detectFileType,
  parseAndValidateCSV,
  transformRow,
} from '@/lib/utils/csv-parser';
import { logger } from '@/lib/utils/logger';
import { CSVFileType, UploadResponse } from '@/lib/types/csv';
import { fileToText, validateFile } from '@/lib/utils/file-utils';
import { ValidationError, DatabaseError } from '@/lib/utils/errors';

export class CSVUploadService {
  /**
   * Process a CSV file upload
   */
  static async processUpload(
    file: File,
    fileTypeHint?: string | null
  ): Promise<UploadResponse> {
    const startTime = Date.now();

    // 1. Validate file existence
    if (!file) {
      throw new ValidationError('No file provided');
    }

    // 2. Validate file metadata (size, type)
    const fileValidation = validateFile(file);
    if (!fileValidation.valid) {
      throw new ValidationError(fileValidation.error || 'Invalid file');
    }

    logger.info('File validated', {
      filename: file.name,
      size: file.size,
    });

    // 3. Read file content
    const csvContent = await fileToText(file);

    // 4. Detect file type
    let fileType = detectFileType(csvContent, file.name);

    if (!fileType && fileTypeHint) {
      const hintLower = fileTypeHint.toLowerCase().replace('-', '_');
      if (Object.values(CSVFileType).includes(hintLower as CSVFileType)) {
        fileType = hintLower as CSVFileType;
      }
    }

    if (!fileType) {
      logger.warn('Could not detect file type', { filename: file.name });
      throw new ValidationError(
        'Could not detect file type. Please specify fileType parameter or use descriptive filename'
      );
    }

    logger.info('File type detected', { fileType });

    // 5. Parse and validate CSV
    const parseResult = parseAndValidateCSV(csvContent, fileType);

    if (!parseResult.success) {
      logger.warn('CSV validation failed', {
        fileType,
        errors: parseResult.validation.errors,
      });
      
      throw new ValidationError('CSV validation failed', {
        fileType,
        errors: parseResult.validation.errors,
        details: {
          rowErrors: parseResult.validation.rowErrors,
          warnings: parseResult.validation.warnings,
        },
      });
    }

    if (!parseResult.data) {
      throw new ValidationError('Failed to parse CSV data');
    }

    // 6. Connect to database
    try {
      await dbConnect();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Database connection failed', { error: message });
      throw new DatabaseError('Database connection failed');
    }

    // 7. Transform and Upsert data
    const transformedRows = parseResult.data.rows.map((row) =>
      transformRow(row, fileType as CSVFileType)
    );

    const upsertResult = await upsertCSVData(
      fileType as CSVFileType,
      transformedRows
    );

    const duration = Date.now() - startTime;

    logger.info('CSV upload completed successfully', {
      fileType,
      duration: `${duration}ms`,
      created: upsertResult.createdCount,
      updated: upsertResult.updatedCount,
      errors: upsertResult.errors.length,
    });

    const response: UploadResponse = {
      success: true,
      message: `Successfully processed ${parseResult.data.rowCount} records`,
      fileType,
      rowsProcessed: parseResult.data.rowCount,
      rowsFailed: upsertResult.errors.length,
      details: {
        createdCount: upsertResult.createdCount,
        updatedCount: upsertResult.updatedCount,
      },
    };

    if (upsertResult.errors.length > 0) {
      response.errors = upsertResult.errors.map(
        (e) => `Row ${e.row}: ${e.error}`
      );
    }

    return response;
  }
}
