import { z } from 'zod';

// Shared schemas
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)');
const emailSchema = z.string().email('Invalid email format');
const phoneSchema = z.string().regex(/^\d{10}$/, 'Phone number must be 10 digits');
const timeSchema = z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time format (HH:MM)');

// Academic Calendar Schema
export const academicCalendarSchema = z.object({
  eventId: z.string().min(1, 'eventId is required'),
  eventName: z.string().min(1, 'eventName is required'),
  eventType: z.enum(['national_holiday', 'festival_holiday', 'exam', 'event']),
  startDate: dateSchema,
  endDate: dateSchema,
  affectedBranches: z.string().min(1, 'affectedBranches is required'),
  affectedYears: z.string().min(1, 'affectedYears is required'),
  isHoliday: z.string().transform((val) => val.toLowerCase() === 'true'),
  isExam: z.string().transform((val) => val.toLowerCase() === 'true'),
  isEvent: z.string().transform((val) => val.toLowerCase() === 'true'),
  description: z.string().optional(),
});

export type AcademicCalendar = z.infer<typeof academicCalendarSchema>;

// Batches Schema
export const batchesSchema = z.object({
  batchId: z.string().min(1, 'batchId is required'),
  batchName: z.string().min(1, 'batchName is required'),
  branch: z.enum(['IT', 'IoT']),
  year: z.string().regex(/^\d+$/, 'year must be numeric'),
  semester: z.string().regex(/^\d+$/, 'semester must be numeric'),
  academicYear: z.string().regex(/^\d{4}-\d{2}$/, 'Invalid academic year format'),
  totalStudents: z.string().regex(/^\d+$/, 'totalStudents must be numeric'),
  sections: z.string().min(1, 'sections is required'),
  labBatchCount: z.string().regex(/^\d+$/, 'labBatchCount must be numeric'),
  labBatchSize: z.string().regex(/^\d+$/, 'labBatchSize must be numeric'),
  classTeacherId: z.string().min(1, 'classTeacherId is required'),
  classRoom: z.string().min(1, 'classRoom is required'),
  semesterType: z.enum(['odd', 'even']),
  startDate: dateSchema,
  endDate: dateSchema,
  examStartDate: dateSchema,
});

export type Batch = z.infer<typeof batchesSchema>;

// Constraints Schema
export const constraintsSchema = z.object({
  constraintId: z.string().min(1, 'constraintId is required'),
  constraintType: z.string().min(1, 'constraintType is required'),
  priority: z.enum(['hard', 'soft']),
  appliesTo: z.enum(['teacher', 'room', 'batch', 'student']),
  applyValue: z.string().min(1, 'applyValue is required'),
  description: z.string().optional(),
  rule: z.string().min(1, 'rule is required'),
  penaltyIfViolated: z.enum(['REJECT', 'WARN', 'PENALIZE']),
});

export type Constraint = z.infer<typeof constraintsSchema>;

// Elective Groups Schema
export const electiveGroupsSchema = z.object({
  electiveGroupId: z.string().min(1, 'electiveGroupId is required'),
  groupName: z.string().min(1, 'groupName is required'),
  branch: z.enum(['IT', 'IoT']),
  year: z.string().regex(/^\d+$/, 'year must be numeric'),
  semester: z.string().regex(/^\d+$/, 'semester must be numeric'),
  offeredSubjectCodes: z.string().min(1, 'offeredSubjectCodes is required'),
  offeredSubjectNames: z.string().min(1, 'offeredSubjectNames is required'),
  teacherIds: z.string().min(1, 'teacherIds is required'),
  maxStudentsPerElective: z.string().regex(/^\d+$/, 'maxStudentsPerElective must be numeric'),
  registrationDeadline: dateSchema,
  notes: z.string().optional(),
});

export type ElectiveGroup = z.infer<typeof electiveGroupsSchema>;

// Lab Batches Schema
export const labBatchesSchema = z.object({
  labBatchId: z.string().min(1, 'labBatchId is required'),
  batchId: z.string().min(1, 'batchId is required'),
  labNumber: z.string().regex(/^\d+$/, 'labNumber must be numeric'),
  parentBatchId: z.string().optional(),
  totalStudents: z.string().regex(/^\d+$/, 'totalStudents must be numeric'),
  assignedRoom: z.string().optional(),
  teacherIncharge: z.string().min(1, 'teacherIncharge is required'),
  labName: z.string().optional(),
  capacity: z.string().regex(/^\d+$/, 'capacity must be numeric'),
});

export type LabBatch = z.infer<typeof labBatchesSchema>;

// Rooms Schema
export const roomsSchema = z.object({
  roomId: z.string().min(1, 'roomId is required'),
  roomName: z.string().min(1, 'roomName is required'),
  building: z.string().min(1, 'building is required'),
  floor: z.string().min(1, 'floor is required'),
  type: z.enum(['classroom', 'lab', 'seminar', 'auditorium']),
  capacity: z.string().regex(/^\d+$/, 'capacity must be numeric'),
  hasProjector: z.string().transform((val) => val.toLowerCase() === 'true'),
  hasSmartBoard: z.string().transform((val) => val.toLowerCase() === 'true'),
  hasAC: z.string().transform((val) => val.toLowerCase() === 'true'),
  hasComputers: z.string().transform((val) => val.toLowerCase() === 'true'),
  computerCount: z.string().regex(/^\d*$/, 'computerCount must be numeric').transform((val) => val || '0'),
  specialEquipment: z.string().optional(),
  availableDays: z.string().min(1, 'availableDays is required'),
  notAvailableSlots: z.string().optional(),
  wing: z.string().optional(),
});

export type Room = z.infer<typeof roomsSchema>;

// Subject Room Mapping Schema
export const subjectRoomMappingSchema = z.object({
  mappingId: z.string().min(1, 'mappingId is required'),
  subjectCode: z.string().min(1, 'subjectCode is required'),
  roomIds: z.string().min(1, 'roomIds is required'),
  preferredRoomId: z.string().optional(),
  requiresSpecialEquipment: z.string().transform((val) => val.toLowerCase() === 'true'),
  requiredEquipment: z.string().optional(),
  notes: z.string().optional(),
});

export type SubjectRoomMapping = z.infer<typeof subjectRoomMappingSchema>;

// Subjects IT Schema
export const subjectsSchema = z.object({
  subjectCode: z.string().min(1, 'subjectCode is required'),
  subjectName: z.string().min(1, 'subjectName is required'),
  branch: z.string().min(1, 'branch is required'),
  year: z.string().regex(/^\d+$/, 'year must be numeric'),
  semester: z.string().regex(/^\d+$/, 'semester must be numeric'),
  type: z.enum(['theory', 'lab', 'practical', 'tutorial']),
  credits: z.string().regex(/^\d+\.?\d*$/, 'credits must be numeric'),
  hoursPerWeek: z.string().regex(/^\d+\.?\d*$/, 'hoursPerWeek must be numeric'),
  theoryHrsPerWeek: z.string().regex(/^\d+\.?\d*$/, 'theoryHrsPerWeek must be numeric'),
  labHrsPerWeek: z.string().regex(/^\d+\.?\d*$/, 'labHrsPerWeek must be numeric'),
  teacherId: z.string().min(1, 'teacherId is required'),
  coTeacherId: z.string().optional(),
  isElective: z.string().transform((val) => val.toLowerCase() === 'true'),
  electiveGroup: z.string().optional(),
  category: z.string().optional(),
  universityCode: z.string().optional(),
  hasInternalExam: z.string().transform((val) => val.toLowerCase() === 'true'),
  hasPracticalExam: z.string().transform((val) => val.toLowerCase() === 'true'),
});

export type Subject = z.infer<typeof subjectsSchema>;

// Teachers Schema
export const teachersSchema = z.object({
  teacherId: z.string().min(1, 'teacherId is required'),
  name: z.string().min(1, 'name is required'),
  designation: z.string().min(1, 'designation is required'),
  department: z.string().min(1, 'department is required'),
  branch: z.enum(['IT', 'IoT', 'both']),
  email: emailSchema,
  phone: phoneSchema,
  specialization: z.string().optional(),
  subjectCodes: z.string().min(1, 'subjectCodes is required'),
  maxHrsPerDay: z.string().regex(/^\d+$/, 'maxHrsPerDay must be numeric'),
  maxHrsPerWeek: z.string().regex(/^\d+$/, 'maxHrsPerWeek must be numeric'),
  notAvailable: z.string().optional(),
  preferredSlots: z.string().optional(),
  cabinNo: z.string().optional(),
  joiningYear: z.string().regex(/^\d{4}$/, 'joiningYear must be a year'),
});

export type Teacher = z.infer<typeof teachersSchema>;

// Timeslots Schema
export const timeslotsSchema = z.object({
  slotId: z.string().min(1, 'slotId is required'),
  periodLabel: z.string().min(1, 'periodLabel is required'),
  startTime: timeSchema,
  endTime: timeSchema,
  durationMinutes: z.string().regex(/^\d+$/, 'durationMinutes must be numeric'),
  isBreak: z.string().transform((val) => val.toLowerCase() === 'true'),
  breakType: z.string().optional(),
  isLunchBreak: z.string().transform((val) => val.toLowerCase() === 'true'),
  dayType: z.enum(['regular', 'weekend', 'holiday']),
  slotOrder: z.string().regex(/^\d+$/, 'slotOrder must be numeric'),
  allowLab: z.string().transform((val) => val.toLowerCase() === 'true'),
  allowTheory: z.string().transform((val) => val.toLowerCase() === 'true'),
  notes: z.string().optional(),
});

export type Timeslot = z.infer<typeof timeslotsSchema>;

// Map file types to schemas
export const schemaMap = {
  academic_calendar: academicCalendarSchema,
  batches: batchesSchema,
  constraints: constraintsSchema,
  elective_groups: electiveGroupsSchema,
  lab_batches: labBatchesSchema,
  rooms: roomsSchema,
  subject_room_mapping: subjectRoomMappingSchema,
  subjects_iot: subjectsSchema,
  subjects_it: subjectsSchema,
  teachers: teachersSchema,
  timeslots: timeslotsSchema,
};

export type SchemaMap = typeof schemaMap;
