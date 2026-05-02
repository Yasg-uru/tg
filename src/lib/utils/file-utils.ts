import { logger } from './logger';

// Max file size: 10MB
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Validate file before processing
 */
export function validateFile(file: File): { valid: boolean; error?: string } {
  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File size exceeds maximum of 10MB (got ${(file.size / 1024 / 1024).toFixed(2)}MB)`,
    };
  }

  // Check file type
  if (!file.type.includes('csv') && !file.name.endsWith('.csv')) {
    return {
      valid: false,
      error: 'File must be a CSV file',
    };
  }

  return { valid: true };
}

/**
 * Convert uploaded file to text
 * Using the native .text() method of the File/Blob object
 */
export async function fileToText(file: File): Promise<string> {
  try {
    return await file.text();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to read file content', { error: message });
    throw new Error('Failed to read file content');
  }
}
