import {
  AcademicCalendar,
  Batch,
  Constraint,
  ElectiveGroup,
  LabBatch,
  Room,
  SubjectRoomMapping,
  Subject,
  Teacher,
  Timeslot,
} from './models';
import { CSVFileType } from '@/lib/types/csv';
import { logger } from '@/lib/utils/logger';

export interface UpsertResult {
  createdCount: number;
  updatedCount: number;
  errors: Array<{ row: number; error: string }>;
}

/**
 * Get the appropriate model for a file type
 */
function getModelForFileType(fileType: CSVFileType) {
  const modelMap = {
    [CSVFileType.ACADEMIC_CALENDAR]: AcademicCalendar,
    [CSVFileType.BATCHES]: Batch,
    [CSVFileType.CONSTRAINTS]: Constraint,
    [CSVFileType.ELECTIVE_GROUPS]: ElectiveGroup,
    [CSVFileType.LAB_BATCHES]: LabBatch,
    [CSVFileType.ROOMS]: Room,
    [CSVFileType.SUBJECT_ROOM_MAPPING]: SubjectRoomMapping,
    [CSVFileType.SUBJECTS_IOT]: Subject,
    [CSVFileType.SUBJECTS_IT]: Subject,
    [CSVFileType.TEACHERS]: Teacher,
    [CSVFileType.TIMESLOTS]: Timeslot,
  };

  return modelMap[fileType];
}

/**
 * Get the unique identifier field for each model
 */
function getUniqueIdField(fileType: CSVFileType): string {
  const idFieldMap: Record<CSVFileType, string> = {
    [CSVFileType.ACADEMIC_CALENDAR]: 'eventId',
    [CSVFileType.BATCHES]: 'batchId',
    [CSVFileType.CONSTRAINTS]: 'constraintId',
    [CSVFileType.ELECTIVE_GROUPS]: 'electiveGroupId',
    [CSVFileType.LAB_BATCHES]: 'labBatchId',
    [CSVFileType.ROOMS]: 'roomId',
    [CSVFileType.SUBJECT_ROOM_MAPPING]: 'mappingId',
    [CSVFileType.SUBJECTS_IOT]: 'subjectCode',
    [CSVFileType.SUBJECTS_IT]: 'subjectCode',
    [CSVFileType.TEACHERS]: 'teacherId',
    [CSVFileType.TIMESLOTS]: 'slotId',
  };

  return idFieldMap[fileType];
}

/**
 * Upsert (create or update) CSV data into MongoDB
 */
export async function upsertCSVData(
  fileType: CSVFileType,
  rows: Record<string, unknown>[]
): Promise<UpsertResult> {
  const Model = getModelForFileType(fileType);
  const idField = getUniqueIdField(fileType);
  const result: UpsertResult = {
    createdCount: 0,
    updatedCount: 0,
    errors: [],
  };

  if (!Model) {
    throw new Error(`No model found for file type: ${fileType}`);
  }

  for (let i = 0; i < rows.length; i++) {
    try {
      const row = rows[i];
      const uniqueId = row[idField];

      if (!uniqueId) {
        result.errors.push({
          row: i + 2,
          error: `Missing unique identifier: ${idField}`,
        });
        continue;
      }

      // Try to update first (remove invalid `new` option for updateOne)
      const updateResult = await Model.updateOne({ [idField]: uniqueId }, { $set: row });

      if (updateResult.matchedCount > 0) {
        result.updatedCount++;
      } else {
        // If update didn't match, create new document
        await Model.create(row);
        result.createdCount++;
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      result.errors.push({
        row: i + 2,
        error: errorMessage,
      });

      logger.error(`Error upserting row ${i + 2}:`, { error: errorMessage });
    }
  }

  logger.info(`Upsert complete for ${fileType}:`, {
    created: result.createdCount,
    updated: result.updatedCount,
    errors: result.errors.length,
  });

  return result;
}

/**
 * Delete all data for a specific file type (useful for re-uploads)
 */
export async function deleteByFileType(fileType: CSVFileType): Promise<number> {
  const Model = getModelForFileType(fileType);

  if (!Model) {
    throw new Error(`No model found for file type: ${fileType}`);
  }

  const result = await Model.deleteMany({});
  logger.info(`Deleted ${result.deletedCount} documents of type ${fileType}`);

  return result.deletedCount;
}

/**
 * Get statistics for a file type
 */
export async function getFileTypeStats(
  fileType: CSVFileType
): Promise<{ count: number; error?: string }> {
  try {
    const Model = getModelForFileType(fileType);

    if (!Model) {
      return { count: 0, error: `No model found for file type: ${fileType}` };
    }

    const count = await Model.countDocuments();
    return { count };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return { count: 0, error: errorMessage };
  }
}
