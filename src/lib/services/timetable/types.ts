import type { TimetableSessionType } from '@/lib/types/timetable';

export type PlainDocument<T> = T & { _id?: unknown };

export type BatchRecord = PlainDocument<{
  batchId: string;
  batchName: string;
  branch: string;
  year: number;
  semester: number;
  academicYear?: string;
  totalStudents: number;
  sections: string;
  labBatchCount?: number;
  labBatchSize?: number;
}>;

export type SubjectRecord = PlainDocument<{
  subjectCode: string;
  subjectName: string;
  branch: string;
  year: number;
  semester: number;
  type: string;
  credits: number;
  hoursPerWeek: number;
  theoryHrsPerWeek: number;
  labHrsPerWeek: number;
  teacherId: string;
  coTeacherId?: string;
  isElective: boolean;
}>;

export type TeacherRecord = PlainDocument<{
  teacherId: string;
  name: string;
  maxHrsPerDay: number;
  maxHrsPerWeek: number;
  notAvailable?: string[];
  preferredSlots?: string[];
  subjectCodes: string[];
}>;

export type RoomRecord = PlainDocument<{
  roomId: string;
  roomName: string;
  type: string;
  capacity: number;
  availableDays: string[];
  notAvailableSlots?: string[];
  hasComputers: boolean;
  computerCount: number;
  specialEquipment?: string;
}>;

export type TimeslotRecord = PlainDocument<{
  slotId: string;
  periodLabel: string;
  startTime: string;
  endTime: string;
  slotOrder: number;
  allowLab: boolean;
  allowTheory: boolean;
  isBreak: boolean;
  isLunchBreak: boolean;
}>;

export type SubjectRoomMappingRecord = PlainDocument<{
  subjectCode: string;
  roomIds: string[];
  preferredRoomId?: string;
  requiresSpecialEquipment: boolean;
  requiredEquipment?: string;
}>;

export type ConstraintRecord = PlainDocument<{
  constraintId: string;
  constraintType: string;
  priority: string;
  appliesTo: string;
  applyValue: string;
  rule: string;
  penaltyIfViolated: string;
}>;

export type LabBatchRecord = PlainDocument<{
  labBatchId: string;
  batchId: string;
  subjectCode: string;
  labBatchNumber: number;
  studentCount: number;
}>;

export type AcademicCalendarRecord = PlainDocument<{
  eventId: string;
  eventName: string;
  startDate: Date;
  endDate: Date;
  affectedBranches: string[];
  affectedYears: number[];
  isHoliday: boolean;
  isExam: boolean;
}>;

export interface SchedulingRequirement {
  batchId: string;
  batchName: string;
  subjectCode: string;
  subjectName: string;
  teacherId: string;
  teacherName: string;
  sessionType: TimetableSessionType;
  sessionLength: number;
  totalSessions: number;
  subjectWeight: number;
  isElective: boolean;
  preferredRoomIds: string[];
  requiredEquipment?: string;
  minSpread: number;
  priority: 'critical' | 'high' | 'normal' | 'low';
}

export interface AvailabilityState {
  teacherSlotKey: Set<string>;
  roomSlotKey: Set<string>;
  batchSlotKey: Set<string>;
  teacherDayLoad: Map<string, Map<string, number>>;
  teacherWeekLoad: Map<string, number>;
  subjectSessionCount: Map<string, Map<string, number>>;
  excludedSlots: Set<string>;
}
