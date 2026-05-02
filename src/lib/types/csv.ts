export enum CSVFileType {
  ACADEMIC_CALENDAR = 'academic_calendar',
  BATCHES = 'batches',
  CONSTRAINTS = 'constraints',
  ELECTIVE_GROUPS = 'elective_groups',
  LAB_BATCHES = 'lab_batches',
  ROOMS = 'rooms',
  SUBJECT_ROOM_MAPPING = 'subject_room_mapping',
  SUBJECTS_IOT = 'subjects_iot',
  SUBJECTS_IT = 'subjects_it',
  TEACHERS = 'teachers',
  TIMESLOTS = 'timeslots',
}

export interface CSVValidationResult {
  isValid: boolean;
  errors: string[];
  rowErrors: Record<number, string[]>;
  warnings: string[];
}

export interface ParsedCSVData {
  fileType: CSVFileType;
  rows: Record<string, unknown>[];
  rowCount: number;
  headers: string[];
}

export interface UploadResponse {
  success: boolean;
  message: string;
  fileType: CSVFileType;
  rowsProcessed: number;
  rowsFailed: number;
  errors?: string[];
  details?: {
    createdCount: number;
    updatedCount: number;
  };
}
