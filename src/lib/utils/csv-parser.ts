import { parse } from 'csv-parse/sync';
import { z } from 'zod';
import {
  CSVFileType,
  CSVValidationResult,
  ParsedCSVData,
} from '@/lib/types/csv';
import { schemaMap, SchemaMap } from '@/lib/validation/schemas';
import { logger } from './logger';

/**
 * Detect CSV file type from content or filename
 */
export function detectFileType(
  content: string,
  filename: string
): CSVFileType | null {
  const nameNormalized = filename.toLowerCase().replace(/\s+/g, '_');

  // Map filename patterns to file types
  const patterns: Record<string, CSVFileType> = {
    academic: CSVFileType.ACADEMIC_CALENDAR,
    calendar: CSVFileType.ACADEMIC_CALENDAR,
    batch: CSVFileType.BATCHES,
    constraint: CSVFileType.CONSTRAINTS,
    elective: CSVFileType.ELECTIVE_GROUPS,
    'lab_batch': CSVFileType.LAB_BATCHES,
    'lab-batch': CSVFileType.LAB_BATCHES,
    room: CSVFileType.ROOMS,
    'subject_room': CSVFileType.SUBJECT_ROOM_MAPPING,
    'subject-room': CSVFileType.SUBJECT_ROOM_MAPPING,
    subject_iot: CSVFileType.SUBJECTS_IOT,
    'iot': CSVFileType.SUBJECTS_IOT,
    subject_it: CSVFileType.SUBJECTS_IT,
    '_it': CSVFileType.SUBJECTS_IT,
    teacher: CSVFileType.TEACHERS,
    timeslot: CSVFileType.TIMESLOTS,
    slot: CSVFileType.TIMESLOTS,
  };

  for (const [pattern, type] of Object.entries(patterns)) {
    if (nameNormalized.includes(pattern)) {
      return type;
    }
  }

  return null;
}

/**
 * Parse CSV content into rows
 */
export function parseCSVContent(content: string): Record<string, unknown>[] {
  try {
    const records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_quotes: true,
    });

    return records as Record<string, unknown>[];
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to parse CSV: ${message}`);
  }
}

/**
 * Validate a single row against schema
 */
export function validateRow(
  row: Record<string, unknown>,
  schema: z.ZodSchema,
  rowIndex: number
): { valid: boolean; errors: string[] } {
  const result = schema.safeParse(row);

  if (!result.success) {
    const errors = result.error.issues.map(
      (issue) =>
        `${issue.path.join('.')}: ${issue.message}`
    );
    return { valid: false, errors };
  }

  return { valid: true, errors: [] };
}

/**
 * Validate all rows in parsed CSV data
 */
export function validateCSVData(
  rows: Record<string, unknown>[],
  schema: z.ZodSchema
): CSVValidationResult {
  const errors: string[] = [];
  const rowErrors: Record<number, string[]> = {};
  const warnings: string[] = [];
  let validRowCount = 0;

  if (rows.length === 0) {
    errors.push('CSV file is empty');
    return { isValid: false, errors, rowErrors, warnings };
  }

  for (let i = 0; i < rows.length; i++) {
    const result = validateRow(rows[i], schema, i + 2); // +2 because CSV is 1-indexed and has header
    if (!result.valid) {
      rowErrors[i + 2] = result.errors;
    } else {
      validRowCount++;
    }
  }

  const errorCount = Object.keys(rowErrors).length;
  const errorPercentage = (errorCount / rows.length) * 100;

  if (errorPercentage > 50) {
    errors.push(
      `More than 50% of rows have validation errors (${errorCount}/${rows.length})`
    );
  }

  if (errorCount > 0 && errorPercentage <= 50) {
    warnings.push(
      `${errorCount} out of ${rows.length} rows have validation issues`
    );
  }

  const isValid = errors.length === 0 && errorPercentage <= 50;

  return {
    isValid,
    errors,
    rowErrors: errorCount > 0 ? rowErrors : {},
    warnings,
  };
}

/**
 * Parse and validate CSV file
 */
export function parseAndValidateCSV(
  content: string,
  fileType: CSVFileType
): {
  success: boolean;
  data?: ParsedCSVData;
  validation: CSVValidationResult;
} {
  try {
    // Parse CSV
    const rows = parseCSVContent(content);

    if (rows.length === 0) {
      return {
        success: false,
        validation: {
          isValid: false,
          errors: ['CSV file is empty or invalid'],
          rowErrors: {},
          warnings: [],
        },
      };
    }

    // Get schema for file type
    const schemaKey = fileType.replace(/_/g, '_') as keyof SchemaMap;
    const schema = schemaMap[schemaKey];

    if (!schema) {
      return {
        success: false,
        validation: {
          isValid: false,
          errors: [`No validation schema found for file type: ${fileType}`],
          rowErrors: {},
          warnings: [],
        },
      };
    }

    // Validate all rows
    const validation = validateCSVData(rows, schema);

    if (!validation.isValid) {
      return { success: false, validation };
    }

    const headers = rows.length > 0 ? Object.keys(rows[0]) : [];

    return {
      success: true,
      data: {
        fileType,
        rows,
        rowCount: rows.length,
        headers,
      },
      validation,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('CSV parsing error:', { message, fileType });

    return {
      success: false,
      validation: {
        isValid: false,
        errors: [message],
        rowErrors: {},
        warnings: [],
      },
    };
  }
}

/**
 * Convert parsed row values to proper types
 */
export function transformRow(
  row: Record<string, unknown>,
  fileType: CSVFileType
): Record<string, unknown> {
  // Helper functions for type conversion
  const toDate = (value: unknown): Date | null => {
    if (!value) return null;
    const date = new Date(value as string);
    return isNaN(date.getTime()) ? null : date;
  };

  const toNumber = (value: unknown): number | null => {
    const num = Number(value);
    return isNaN(num) ? null : num;
  };

  const toBoolean = (value: unknown): boolean => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true' || value === '1';
    }
    return Boolean(value);
  };

  const toArray = (value: unknown, separator = ';'): unknown[] => {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      return value.split(separator).map((v) => v.trim());
    }
    return [];
  };

  // Transform based on file type
  const transformed = { ...row };

  switch (fileType) {
    case CSVFileType.ACADEMIC_CALENDAR:
      transformed.startDate = toDate(transformed.startDate);
      transformed.endDate = toDate(transformed.endDate);
      transformed.isHoliday = toBoolean(transformed.isHoliday);
      transformed.isExam = toBoolean(transformed.isExam);
      transformed.isEvent = toBoolean(transformed.isEvent);
      transformed.affectedBranches = toArray(transformed.affectedBranches);
      transformed.affectedYears = toArray(
        transformed.affectedYears,
        ';'
      ).map((y) => toNumber(y));
      break;

    case CSVFileType.BATCHES:
      transformed.year = toNumber(transformed.year);
      transformed.semester = toNumber(transformed.semester);
      transformed.totalStudents = toNumber(transformed.totalStudents);
      transformed.labBatchCount = toNumber(transformed.labBatchCount);
      transformed.labBatchSize = toNumber(transformed.labBatchSize);
      transformed.startDate = toDate(transformed.startDate);
      transformed.endDate = toDate(transformed.endDate);
      transformed.examStartDate = toDate(transformed.examStartDate);
      break;

    case CSVFileType.ELECTIVE_GROUPS:
      transformed.year = toNumber(transformed.year);
      transformed.semester = toNumber(transformed.semester);
      transformed.offeredSubjectCodes = toArray(
        transformed.offeredSubjectCodes
      );
      transformed.offeredSubjectNames = toArray(
        transformed.offeredSubjectNames
      );
      transformed.teacherIds = toArray(transformed.teacherIds);
      transformed.maxStudentsPerElective = toNumber(
        transformed.maxStudentsPerElective
      );
      transformed.registrationDeadline = toDate(
        transformed.registrationDeadline
      );
      break;

    case CSVFileType.LAB_BATCHES:
      transformed.labNumber = toNumber(transformed.labNumber);
      transformed.totalStudents = toNumber(transformed.totalStudents);
      transformed.capacity = toNumber(transformed.capacity);
      break;

    case CSVFileType.ROOMS:
      transformed.capacity = toNumber(transformed.capacity);
      transformed.computerCount = toNumber(transformed.computerCount) || 0;
      transformed.hasProjector = toBoolean(transformed.hasProjector);
      transformed.hasSmartBoard = toBoolean(transformed.hasSmartBoard);
      transformed.hasAC = toBoolean(transformed.hasAC);
      transformed.hasComputers = toBoolean(transformed.hasComputers);
      transformed.availableDays = toArray(transformed.availableDays);
      transformed.notAvailableSlots = toArray(transformed.notAvailableSlots);
      break;

    case CSVFileType.SUBJECT_ROOM_MAPPING:
      transformed.roomIds = toArray(transformed.roomIds);
      transformed.requiresSpecialEquipment = toBoolean(
        transformed.requiresSpecialEquipment
      );
      break;

    case CSVFileType.SUBJECTS_IOT:
    case CSVFileType.SUBJECTS_IT:
      transformed.year = toNumber(transformed.year);
      transformed.semester = toNumber(transformed.semester);
      transformed.credits = toNumber(transformed.credits);
      transformed.hoursPerWeek = toNumber(transformed.hoursPerWeek);
      transformed.theoryHrsPerWeek = toNumber(transformed.theoryHrsPerWeek);
      transformed.labHrsPerWeek = toNumber(transformed.labHrsPerWeek);
      transformed.isElective = toBoolean(transformed.isElective);
      transformed.hasInternalExam = toBoolean(transformed.hasInternalExam);
      transformed.hasPracticalExam = toBoolean(transformed.hasPracticalExam);
      break;

    case CSVFileType.TEACHERS:
      transformed.subjectCodes = toArray(transformed.subjectCodes);
      transformed.maxHrsPerDay = toNumber(transformed.maxHrsPerDay);
      transformed.maxHrsPerWeek = toNumber(transformed.maxHrsPerWeek);
      transformed.joiningYear = toNumber(transformed.joiningYear);
      transformed.notAvailable = toArray(transformed.notAvailable);
      transformed.preferredSlots = toArray(transformed.preferredSlots);
      break;

    case CSVFileType.TIMESLOTS:
      transformed.durationMinutes = toNumber(transformed.durationMinutes);
      transformed.slotOrder = toNumber(transformed.slotOrder);
      transformed.isBreak = toBoolean(transformed.isBreak);
      transformed.isLunchBreak = toBoolean(transformed.isLunchBreak);
      transformed.allowLab = toBoolean(transformed.allowLab);
      transformed.allowTheory = toBoolean(transformed.allowTheory);
      break;

    case CSVFileType.CONSTRAINTS:
    default:
      break;
  }

  return transformed;
}
