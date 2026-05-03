import type {
  AcademicCalendarRecord,
  BatchRecord,
  ConstraintRecord,
  RoomRecord,
  SubjectRecord,
  TimeslotRecord,
  SchedulingRequirement,
} from './types';
import type { TimetableSessionType } from '@/lib/types/timetable';

export const WEEK_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
export const HARD_CONSTRAINT_PENALTY = 1000;

export function numeric(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

export function isDateExcluded(
  date: Date,
  academicCalendar: AcademicCalendarRecord[],
  branch: string,
  year: number
): boolean {
  return academicCalendar.some((event) => {
    const applies =
      (event.affectedBranches.length === 0 || event.affectedBranches.includes(branch)) &&
      (event.affectedYears.length === 0 || event.affectedYears.includes(year));

    if (!applies) return false;
    if (!event.isHoliday && !event.isExam) return false;

    const eventStart = new Date(event.startDate);
    const eventEnd = new Date(event.endDate);
    return date >= eventStart && date <= eventEnd;
  });
}

export function getExcludedSlotsFromCalendar(
  academicCalendar: AcademicCalendarRecord[],
  batch: BatchRecord
): Set<string> {
  const excluded = new Set<string>();

  academicCalendar.forEach((event) => {
    const applies =
      (event.affectedBranches.length === 0 || event.affectedBranches.includes(batch.branch)) &&
      (event.affectedYears.length === 0 || event.affectedYears.includes(batch.year));

    if (!applies || (!event.isHoliday && !event.isExam)) return;

    const start = new Date(event.startDate);
    const end = new Date(event.endDate);
    const current = new Date(start);

    while (current <= end) {
      const dayName = current.toLocaleDateString('en-US', { weekday: 'long' });
      if (WEEK_DAYS.includes(dayName)) {
        excluded.add(dayName);
      }
      current.setDate(current.getDate() + 1);
    }
  });

  return excluded;
}

export function buildConstraintMap(constraints: ConstraintRecord[]): Map<string, ConstraintRecord[]> {
  const map = new Map<string, ConstraintRecord[]>();

  constraints.forEach((constraint) => {
    const key = `${constraint.constraintType}:${constraint.appliesTo}`;
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key)!.push(constraint);
  });

  return map;
}

export function calculateMinSpread(totalSessions: number): number {
  if (totalSessions <= 1) return 0;
  if (totalSessions <= 2) return 1;
  if (totalSessions <= 3) return 2;
  return Math.ceil(totalSessions / 2);
}

export function getSessionType(subject: SubjectRecord): TimetableSessionType {
  if (subject.type === 'lab' || subject.labHrsPerWeek > 0) {
    return 'lab';
  }

  if (subject.isElective) {
    return 'elective';
  }

  if (subject.type === 'tutorial') {
    return 'tutorial';
  }

  return 'theory';
}

export function getSubjectSessions(subject: SubjectRecord): number {
  if (subject.type === 'lab' || subject.labHrsPerWeek > 0) {
    return Math.max(1, Math.ceil(numeric(subject.labHrsPerWeek || subject.hoursPerWeek) / 2));
  }

  return Math.max(1, Math.round(numeric(subject.hoursPerWeek || subject.theoryHrsPerWeek, 1)));
}

export function slotKey(day: string, slotId: string) {
  return `${day}::${slotId}`;
}

export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
  }
  return a;
}

export function getLabSlotRange(
  slotIndex: number,
  slots: TimeslotRecord[]
): { slot1: TimeslotRecord; slot2: TimeslotRecord } | null {
  const slot1 = slots[slotIndex];
  const slot2 = slots[slotIndex + 1];

  if (!slot1 || !slot2 || !slot1.allowLab || !slot2.allowLab) {
    return null;
  }

  return { slot1, slot2 };
}

export function roomSupportsSubject(room: RoomRecord, requirement: SchedulingRequirement) {
  if (requirement.sessionType === 'lab') {
    return room.type === 'lab' || room.hasComputers || room.computerCount > 0;
  }

  return room.type !== 'lab';
}

export function isTeacherAvailable(teacher: { notAvailable?: string[] }, day: string, slotId: string) {
  if (!teacher.notAvailable || teacher.notAvailable.length === 0) {
    return true;
  }

  return (
    !teacher.notAvailable.includes(`${day}-${slotId}`) &&
    !teacher.notAvailable.includes(slotId)
  );
}

export function buildAvailabilityState() {
  return {
    teacherSlotKey: new Set<string>(),
    roomSlotKey: new Set<string>(),
    batchSlotKey: new Set<string>(),
    teacherDayLoad: new Map(),
    teacherWeekLoad: new Map(),
    subjectSessionCount: new Map(),
    excludedSlots: new Set(),
  };
}
