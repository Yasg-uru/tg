import { z } from 'zod';

// Room Validation Schema
export const RoomSchema = z.object({
  roomId: z.string().min(1, 'Room ID is required'),
  roomName: z.string().min(1, 'Room name is required'),
  type: z.string().min(1, 'Room type is required'),
  capacity: z.number().min(1, 'Capacity must be at least 1'),
  availableDays: z.array(z.string()).min(1, 'At least one day must be selected'),
  hasComputers: z.boolean(),
  computerCount: z.number().min(0, 'Computer count cannot be negative'),
  specialEquipment: z.string().optional(),
});

export type RoomFormData = z.infer<typeof RoomSchema>;

// Subject Validation Schema
export const SubjectSchema = z.object({
  subjectCode: z.string().min(1, 'Subject code is required'),
  subjectName: z.string().min(1, 'Subject name is required'),
  branch: z.string().min(1, 'Branch is required'),
  year: z.number().min(1, 'Year must be at least 1'),
  semester: z.number().min(1, 'Semester must be at least 1'),
  type: z.string().min(1, 'Subject type is required'),
  credits: z.number().min(0, 'Credits cannot be negative'),
  hoursPerWeek: z.number().min(1, 'Hours per week must be at least 1'),
  theoryHrsPerWeek: z.number().min(0, 'Theory hours cannot be negative'),
  labHrsPerWeek: z.number().min(0, 'Lab hours cannot be negative'),
  teacherId: z.string().min(1, 'Teacher ID is required'),
  coTeacherId: z.string().optional(),
  isElective: z.boolean().default(false),
});

export type SubjectFormData = z.infer<typeof SubjectSchema>;

// Teacher Validation Schema
export const TeacherSchema = z.object({
  teacherId: z.string().min(1, 'Teacher ID is required'),
  name: z.string().min(1, 'Name is required'),
  maxHrsPerDay: z.number().min(1, 'Max hours per day must be at least 1'),
  maxHrsPerWeek: z.number().min(1, 'Max hours per week must be at least 1'),
  notAvailable: z.array(z.string()).optional(),
  preferredSlots: z.array(z.string()).optional(),
  subjectCodes: z.array(z.string()).min(1, 'At least one subject must be selected'),
});

export type TeacherFormData = z.infer<typeof TeacherSchema>;

// Subject-Room Mapping Validation Schema
export const SubjectRoomMappingSchema = z.object({
  subjectCode: z.string().min(1, 'Subject code is required'),
  roomIds: z.array(z.string()).min(1, 'At least one room must be selected'),
  preferredRoomId: z.string().optional(),
  requiresSpecialEquipment: z.boolean().default(false),
  requiredEquipment: z.string().optional(),
});

export type SubjectRoomMappingFormData = z.infer<typeof SubjectRoomMappingSchema>;

// Batch Validation Schema
export const BatchSchema = z.object({
  batchId: z.string().min(1, 'Batch ID is required'),
  batchName: z.string().min(1, 'Batch name is required'),
  branch: z.string().min(1, 'Branch is required'),
  year: z.number().min(1, 'Year must be at least 1'),
  semester: z.number().min(1, 'Semester must be at least 1'),
  academicYear: z.string().min(1, 'Academic year is required'),
  totalStudents: z.number().min(1, 'Total students must be at least 1'),
  sections: z.string().min(1, 'Sections are required'),
  labBatchCount: z.number().min(0, 'Lab batch count cannot be negative'),
  labBatchSize: z.number().min(0, 'Lab batch size cannot be negative'),
});

export type BatchFormData = z.infer<typeof BatchSchema>;

export interface PaginationQuery {
  page: number;
  limit: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export function parsePaginationQuery(searchParams: URLSearchParams): PaginationQuery | null {
  const pageValue = searchParams.get('page');
  const limitValue = searchParams.get('limit');
  const search = searchParams.get('search')?.trim() || undefined;
  const sortBy = searchParams.get('sortBy')?.trim() || undefined;
  const sortOrderValue = searchParams.get('sortOrder');

  const page = pageValue ? Number(pageValue) : 1;
  const limit = limitValue ? Number(limitValue) : 10;
  const sortOrder = sortOrderValue === 'desc' || sortOrderValue === 'asc' ? sortOrderValue : undefined;

  if (!Number.isInteger(page) || page < 1) {
    return null;
  }

  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    return null;
  }

  if (pageValue && Number.isNaN(page)) {
    return null;
  }

  if (limitValue && Number.isNaN(limit)) {
    return null;
  }

  return {
    page,
    limit,
    search,
    sortBy,
    sortOrder,
  };
}
