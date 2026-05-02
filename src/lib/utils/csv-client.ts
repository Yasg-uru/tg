import { CSVFileType, UploadResponse } from '@/lib/types/csv';
import { logger } from './logger';

export interface UploadOptions {
  fileType?: CSVFileType;
  onProgress?: (progress: number) => void;
}

/**
 * Upload a CSV file to the server
 */
export async function uploadCSV(
  file: File,
  options?: UploadOptions
): Promise<UploadResponse> {
  try {
    logger.info('Starting CSV upload', { filename: file.name });

    const formData = new FormData();
    formData.append('file', file);

    if (options?.fileType) {
      formData.append('fileType', options.fileType);
    }

    const response = await fetch('/api/upload/csv', {
      method: 'POST',
      body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
      logger.error('CSV upload failed', data);
      throw new Error(data.message || 'Upload failed');
    }

    logger.info('CSV upload successful', data);
    return data as UploadResponse;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('CSV upload error', { message });
    throw error;
  }
}

/**
 * Get supported file types
 */
export function getSupportedFileTypes(): CSVFileType[] {
  return Object.values(CSVFileType);
}

/**
 * Format file type to readable name
 */
export function formatFileTypeName(fileType: CSVFileType): string {
  const nameMap: Record<CSVFileType, string> = {
    [CSVFileType.ACADEMIC_CALENDAR]: 'Academic Calendar',
    [CSVFileType.BATCHES]: 'Batches',
    [CSVFileType.CONSTRAINTS]: 'Constraints',
    [CSVFileType.ELECTIVE_GROUPS]: 'Elective Groups',
    [CSVFileType.LAB_BATCHES]: 'Lab Batches',
    [CSVFileType.ROOMS]: 'Rooms',
    [CSVFileType.SUBJECT_ROOM_MAPPING]: 'Subject Room Mapping',
    [CSVFileType.SUBJECTS_IOT]: 'Subjects (IoT)',
    [CSVFileType.SUBJECTS_IT]: 'Subjects (IT)',
    [CSVFileType.TEACHERS]: 'Teachers',
    [CSVFileType.TIMESLOTS]: 'Timeslots',
  };

  return nameMap[fileType] || fileType;
}
