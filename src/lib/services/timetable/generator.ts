import { randomUUID } from 'crypto';

import type {
  TimetableAssignment,
  TimetableGenerationRequest,
  TimetableGenerationResult,
  TimetablePlan,
  TimetableProvider,
  TimetableScore,
  TimetableSessionType,
  TimetableValidationIssue,
} from '@/lib/types/timetable';

import type {
  BatchRecord,
  SubjectRecord,
  TeacherRecord,
  RoomRecord,
  TimeslotRecord,
  SubjectRoomMappingRecord,
  ConstraintRecord,
  LabBatchRecord,
  AcademicCalendarRecord,
  SchedulingRequirement,
} from './types';

import {
  numeric,
  unique,
  getExcludedSlotsFromCalendar,
  calculateMinSpread,
  getSessionType,
  getSubjectSessions,
  slotKey,
  getLabSlotRange,
  roomSupportsSubject,
  isTeacherAvailable,
  buildAvailabilityState,
  WEEK_DAYS,
  HARD_CONSTRAINT_PENALTY,
  shuffle,
} from './helpers';

export class TimetableGenerator {
  constructor(private restarts = 5) {}

  private readonly searchTimeoutMs = 3500;
  private readonly beamWidth = 5;

  private requirementKey(requirement: SchedulingRequirement): string {
    return `${requirement.batchId}::${requirement.subjectCode}`;
  }

  buildFallbackPlan(requirements: SchedulingRequirement[]): TimetablePlan {
    const priorityMap: Record<string, number> = {
      critical: 0,
      high: 1,
      normal: 2,
      low: 3,
    };

    const ordered = [...requirements].sort((left, right) => {
      if (left.priority !== right.priority) {
        return priorityMap[left.priority] - priorityMap[right.priority];
      }

      if (left.sessionType !== right.sessionType) {
        const order: Record<TimetableSessionType, number> = {
          lab: 0,
          theory: 1,
          tutorial: 2,
          elective: 3,
        };
        return order[left.sessionType] - order[right.sessionType];
      }

      if (right.subjectWeight !== left.subjectWeight) {
        return right.subjectWeight - left.subjectWeight;
      }

      return left.subjectName.localeCompare(right.subjectName);
    });

    return {
      subjectOrder: ordered.map((item, index) => ({
        subjectCode: item.subjectCode,
        batchId: item.batchId,
        weight: ordered.length - index,
        reason: `${item.priority} ${item.sessionType} with ${item.totalSessions} sessions`,
      })),
      preferredLabSlots: ['Tuesday-3', 'Wednesday-3', 'Thursday-4', 'Wednesday-4'],
      preferredTheorySlots: [
        'Monday-1',
        'Monday-2',
        'Tuesday-2',
        'Wednesday-2',
        'Thursday-2',
        'Friday-2',
      ],
      preferredDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
      notes: ['Production fallback plan: prioritizes labs and high-credit subjects'],
    };
  }

  buildRequirements(
    batches: BatchRecord[],
    subjects: SubjectRecord[],
    teachers: TeacherRecord[],
    mappings: SubjectRoomMappingRecord[]
  ): SchedulingRequirement[] {
    const teacherById = new Map(teachers.map((teacher) => [teacher.teacherId, teacher]));
    const requirements: SchedulingRequirement[] = [];

    const normalizeText = (value: unknown) => String(value ?? '').trim().toLowerCase();
    const normalizeNumber = (value: unknown) => numeric(value, -1);

    for (const batch of batches) {
      const batchBranch = normalizeText(batch.branch);
      const batchYear = normalizeNumber(batch.year);
      const batchSemester = normalizeNumber(batch.semester);

      const exactBatchSubjects = subjects.filter((subject) => {
        const subjectBranch = normalizeText(subject.branch);
        const branchMatches =
          subjectBranch === batchBranch || subjectBranch === 'both' || subjectBranch === 'all';
        const yearMatches = normalizeNumber(subject.year) === batchYear;
        const semesterValue = normalizeNumber(subject.semester);
        const semesterMatches = semesterValue === batchSemester || semesterValue === 0;
        return branchMatches && yearMatches && semesterMatches;
      });

      const batchSubjects =
        exactBatchSubjects.length > 0
          ? exactBatchSubjects
          : subjects.filter((subject) => {
              const subjectBranch = normalizeText(subject.branch);
              const branchMatches =
                subjectBranch === batchBranch || subjectBranch === 'both' || subjectBranch === 'all';
              const yearMatches = normalizeNumber(subject.year) === batchYear;
              return branchMatches && yearMatches;
            });

      for (const subject of batchSubjects) {
        const teacher = teacherById.get(subject.teacherId);
        const mapping = mappings.find((item) => item.subjectCode === subject.subjectCode);
        const sessionType = getSessionType(subject);
        const totalSessions = getSubjectSessions(subject);
        const sessionLength = sessionType === 'lab' ? 2 : 1;

        let priority: 'critical' | 'high' | 'normal' | 'low' = 'normal';
        if (subject.type === 'core' || numeric(subject.credits) >= 4) {
          priority = 'critical';
        } else if (sessionType === 'lab' || numeric(subject.credits) >= 3) {
          priority = 'high';
        } else if (subject.isElective) {
          priority = 'low';
        }

        const baseWeight =
          (sessionType === 'lab' ? 100 : 0) +
          (subject.isElective ? 25 : 50) +
          Math.round(numeric(subject.credits) * 10) +
          Math.round(numeric(subject.hoursPerWeek || subject.theoryHrsPerWeek));

        requirements.push({
          batchId: batch.batchId,
          batchName: batch.batchName,
          subjectCode: subject.subjectCode,
          subjectName: subject.subjectName,
          teacherId: subject.teacherId,
          teacherName: teacher?.name || subject.teacherId,
          sessionType,
          sessionLength,
          totalSessions,
          subjectWeight: baseWeight,
          isElective: subject.isElective,
          preferredRoomIds: unique(
            [mapping?.preferredRoomId, ...(mapping?.roomIds || [])].filter(Boolean) as string[]
          ),
          requiredEquipment: mapping?.requiredEquipment,
          minSpread: calculateMinSpread(totalSessions),
          priority,
        });
      }
    }

    return requirements.sort((left, right) => {
      const priorityMap: Record<string, number> = {
        critical: 0,
        high: 1,
        normal: 2,
        low: 3,
      };

      if (left.priority !== right.priority) {
        return priorityMap[left.priority] - priorityMap[right.priority];
      }

      if (left.sessionType !== right.sessionType) {
        const order: Record<TimetableSessionType, number> = {
          lab: 0,
          theory: 1,
          tutorial: 2,
          elective: 3,
        };
        return order[left.sessionType] - order[right.sessionType];
      }

      if (right.subjectWeight !== left.subjectWeight) {
        return right.subjectWeight - left.subjectWeight;
      }

      return left.batchName.localeCompare(right.batchName);
    });
  }

  private scoreCandidate(params: {
    requirement: SchedulingRequirement;
    day: string;
    slotIndex: number;
    slot: TimeslotRecord;
    room: RoomRecord;
    teacher?: TeacherRecord;
    teacherLoad: number;
    batchLoad: number;
    preferredDays: string[];
    preferredLabSlots: string[];
    preferredTheorySlots: string[];
    sessionCount: number;
    assignmentByBatchDaySlot: Map<string, TimetableAssignment>;
    assignmentByTeacherDaySlot: Map<string, TimetableAssignment>;
    weekSlots: TimeslotRecord[];
    subjectSessionMap: Map<string, number>;
    dayIndexMap: Map<string, number>;
    teacherWeekLoad: number;
    teacherUsedDays: number;
  }): number {
    const { requirement, day, slotIndex, slot, room } = params;
    let score = 100;

    if (params.teacher && params.teacher.maxHrsPerDay > 0) {
      const totalLoad = params.teacherLoad + requirement.sessionLength;
      if (totalLoad > params.teacher.maxHrsPerDay) {
        score -= HARD_CONSTRAINT_PENALTY;
      }
    }

    if (params.teacher && params.teacher.maxHrsPerWeek > 0) {
      const avgTarget = Math.max(1, Math.floor(params.teacher.maxHrsPerWeek / 5));
      if (params.teacherLoad + requirement.sessionLength > avgTarget + 1) {
        score -= 30;
      }
    }

    const projectedWeekLoad = params.teacherWeekLoad + requirement.sessionLength;
    const projectedUsedDays = params.teacherLoad === 0 ? params.teacherUsedDays + 1 : params.teacherUsedDays;
    const avgPerUsedDay = projectedWeekLoad / Math.max(1, projectedUsedDays);
    if (avgPerUsedDay > 2.25) {
      score -= 35;
    }

    if (params.teacherLoad + requirement.sessionLength > 2) {
      score -= 40;
    }

    const capacityRatio = (params.batchLoad * 30) / room.capacity;
    if (capacityRatio > 1.1) {
      score -= 200;
    } else if (capacityRatio < 0.3) {
      score -= 20;
    } else {
      score += 15;
    }

    score -= params.teacherLoad * 8;
    score -= params.batchLoad * 10;

    if (params.preferredDays.includes(day)) {
      score += 8;
    }

    if (
      params.teacher?.preferredSlots?.includes(`${day}-${slot.slotId}`) ||
      params.teacher?.preferredSlots?.includes(slot.slotId)
    ) {
      score += 12;
    }

    if (requirement.sessionType === 'lab') {
      score += params.preferredLabSlots.includes(`${day}-${slot.slotId}`) ? 25 : 0;
      score += room.type === 'lab' ? 25 : 0;
      score += room.hasComputers || room.computerCount > 0 ? 15 : 0;
    } else {
      score += params.preferredTheorySlots.includes(`${day}-${slot.slotId}`) ? 18 : 0;
      score += slotIndex <= 1 ? 6 : 0;
    }

    const prevSlot = params.weekSlots[slotIndex - 1];
    const nextSlot = params.weekSlots[slotIndex + 1];
    if (prevSlot) {
      const prevTeacher = params.assignmentByTeacherDaySlot.get(
        `${requirement.teacherId}::${day}::${prevSlot.slotId}`
      );
      if (prevTeacher) {
        score -= 12;
      }

      const prevBatch = params.assignmentByBatchDaySlot.get(
        `${requirement.batchId}::${day}::${prevSlot.slotId}`
      );
      if (prevBatch && prevBatch.subjectCode === requirement.subjectCode) {
        score -= 30;
      }
    }

    if (nextSlot) {
      const nextTeacher = params.assignmentByTeacherDaySlot.get(
        `${requirement.teacherId}::${day}::${nextSlot.slotId}`
      );
      if (nextTeacher) {
        score -= 10;
      }

      const nextBatch = params.assignmentByBatchDaySlot.get(
        `${requirement.batchId}::${day}::${nextSlot.slotId}`
      );
      if (nextBatch && nextBatch.subjectCode === requirement.subjectCode) {
        score -= 25;
      }
    }

    if (requirement.preferredRoomIds.includes(room.roomId)) {
      score += 20;
    }

    const minSpread = requirement.minSpread ?? 0;
    if (params.sessionCount >= minSpread && minSpread > 0) {
      score -= 30;
    }

    // Keep same-subject sessions distributed over non-adjacent days when possible.
    const dayIdx = params.dayIndexMap.get(day) ?? -1;
    for (const existingDay of params.subjectSessionMap.keys()) {
      const existingIdx = params.dayIndexMap.get(existingDay);
      if (dayIdx >= 0 && existingIdx !== undefined && Math.abs(dayIdx - existingIdx) < 2) {
        score -= 18;
      }
    }

    const maxSessionsPerDay = requirement.totalSessions >= 4 ? 2 : 1;
    if (params.sessionCount >= maxSessionsPerDay) {
      score -= HARD_CONSTRAINT_PENALTY;
    }

    score += Math.random() * 0.001;

    return Math.max(-HARD_CONSTRAINT_PENALTY, score);
  }

  private domainPriority(requirement: SchedulingRequirement): number {
    const priorityMap: Record<SchedulingRequirement['priority'], number> = {
      critical: 4,
      high: 3,
      normal: 2,
      low: 1,
    };

    return (
      priorityMap[requirement.priority] * 100 +
      (requirement.sessionType === 'lab' ? 40 : 0) +
      Math.min(50, requirement.subjectWeight)
    );
  }

  private getCandidatePlacements(params: {
    requirement: SchedulingRequirement;
    plan: TimetablePlan;
    rooms: RoomRecord[];
    timeslots: TimeslotRecord[];
    weekDays: string[];
    batchById: Map<string, BatchRecord>;
    teacherById: Map<string, TeacherRecord>;
    assignments: TimetableAssignment[];
    availability: ReturnType<typeof buildAvailabilityState>;
    excludedDays: Set<string>;
  }): Array<{
    day: string;
    slotIndex: number;
    room: RoomRecord;
    slot: TimeslotRecord;
    nextSlot?: TimeslotRecord;
    score: number;
  }> {
    const orderedSlots = params.timeslots
      .filter((slot) => !slot.isBreak && !slot.isLunchBreak)
      .sort((left, right) => left.slotOrder - right.slotOrder);
    const requirement = params.requirement;
    const teacher = params.teacherById.get(requirement.teacherId);
    const batch = params.batchById.get(requirement.batchId);

    if (!teacher || !batch) {
      return [];
    }

    const assignmentByBatchDaySlot = new Map<string, TimetableAssignment>();
    const assignmentByTeacherDaySlot = new Map<string, TimetableAssignment>();
    for (const assignment of params.assignments) {
      assignmentByBatchDaySlot.set(
        `${assignment.batchId}::${assignment.day}::${assignment.slotId}`,
        assignment
      );
      assignmentByTeacherDaySlot.set(
        `${assignment.teacherId}::${assignment.day}::${assignment.slotId}`,
        assignment
      );
    }

    const candidates: Array<{
      day: string;
      slotIndex: number;
      room: RoomRecord;
      slot: TimeslotRecord;
      nextSlot?: TimeslotRecord;
      score: number;
    }> = [];
    const dayIndexMap = new Map(params.weekDays.map((day, index) => [day, index]));
    const teacherDayMap =
      params.availability.teacherDayLoad.get(requirement.teacherId) || new Map<string, number>();
    const teacherWeekLoad = params.availability.teacherWeekLoad.get(requirement.teacherId) || 0;
    const teacherUsedDays = [...teacherDayMap.values()].filter((load) => load > 0).length;

    for (const day of params.weekDays) {
      if (params.excludedDays.has(day) || params.availability.excludedSlots.has(day)) {
        continue;
      }

      for (let slotIndex = 0; slotIndex < orderedSlots.length; slotIndex++) {
        const slot = orderedSlots[slotIndex];

        let nextSlot: TimeslotRecord | undefined;
        if (requirement.sessionType === 'lab') {
          const labSlotRange = getLabSlotRange(slotIndex, orderedSlots);
          if (!labSlotRange) {
            continue;
          }
          nextSlot = labSlotRange.slot2;
        } else if (!slot.allowTheory) {
          continue;
        }

        if (!isTeacherAvailable(teacher, day, slot.slotId)) {
          continue;
        }
        if (nextSlot && !isTeacherAvailable(teacher, day, nextSlot.slotId)) {
          continue;
        }

        const teacherKey = slotKey(day, slot.slotId);
        if (params.availability.teacherSlotKey.has(`${requirement.teacherId}::${teacherKey}`)) {
          continue;
        }
        if (nextSlot) {
          const nextTeacherKey = slotKey(day, nextSlot.slotId);
          if (params.availability.teacherSlotKey.has(`${requirement.teacherId}::${nextTeacherKey}`)) {
            continue;
          }
        }

        const batchKey = slotKey(day, slot.slotId);
        if (params.availability.batchSlotKey.has(`${requirement.batchId}::${batchKey}`)) {
          continue;
        }
        if (nextSlot) {
          const nextBatchKey = slotKey(day, nextSlot.slotId);
          if (params.availability.batchSlotKey.has(`${requirement.batchId}::${nextBatchKey}`)) {
            continue;
          }
        }

        const candidateRooms = params.rooms.filter((room) => {
          const slotKeyValue = `${day}-${slot.slotId}`;
          const nextSlotKeyValue = nextSlot ? `${day}-${nextSlot.slotId}` : '';

          if (room.availableDays.length > 0 && !room.availableDays.includes(day)) {
            return false;
          }

          if (
            room.notAvailableSlots?.includes(slotKeyValue) ||
            room.notAvailableSlots?.includes(slot.slotId)
          ) {
            return false;
          }

          if (
            nextSlot &&
            (room.notAvailableSlots?.includes(nextSlotKeyValue) ||
              room.notAvailableSlots?.includes(nextSlot.slotId))
          ) {
            return false;
          }

          if (!roomSupportsSubject(room, requirement)) {
            return false;
          }

          return room.capacity >= batch.totalStudents;
        });

        for (const room of candidateRooms) {
          const roomKey = slotKey(day, `${room.roomId}::${slot.slotId}`);
          if (params.availability.roomSlotKey.has(roomKey)) {
            continue;
          }

          if (nextSlot) {
            const nextRoomKey = slotKey(day, `${room.roomId}::${nextSlot.slotId}`);
            if (params.availability.roomSlotKey.has(nextRoomKey)) {
              continue;
            }
          }

          const teacherDayLoad = teacherDayMap.get(day) || 0;
          const batchDayLoad = params.assignments.filter(
            (assignment) => assignment.batchId === requirement.batchId && assignment.day === day
          ).length;
          const subjectKey = this.requirementKey(requirement);
          const sessionCountMap =
            params.availability.subjectSessionCount.get(subjectKey) || new Map<string, number>();
          const sessionCount = sessionCountMap.get(day) || 0;

          const score = this.scoreCandidate({
            requirement,
            day,
            slotIndex,
            slot,
            room,
            teacher,
            teacherLoad: teacherDayLoad,
            batchLoad: batchDayLoad,
            preferredDays: params.plan.preferredDays,
            preferredLabSlots: params.plan.preferredLabSlots,
            preferredTheorySlots: params.plan.preferredTheorySlots,
            sessionCount,
            assignmentByBatchDaySlot,
            assignmentByTeacherDaySlot,
            weekSlots: orderedSlots,
            subjectSessionMap: sessionCountMap,
            dayIndexMap,
            teacherWeekLoad,
            teacherUsedDays,
          });

          if (score > -500) {
            candidates.push({ day, slotIndex, room, slot, nextSlot, score });
          }
        }
      }
    }

    return candidates.sort((left, right) => right.score - left.score);
  }

  private placeCandidate(params: {
    requirement: SchedulingRequirement;
    candidate: {
      day: string;
      room: RoomRecord;
      slot: TimeslotRecord;
      nextSlot?: TimeslotRecord;
      score: number;
    };
    availability: ReturnType<typeof buildAvailabilityState>;
    assignments: TimetableAssignment[];
    batchById: Map<string, BatchRecord>;
    teacherById: Map<string, TeacherRecord>;
  }): boolean {
    const { requirement, candidate, availability } = params;
    const teacher = params.teacherById.get(requirement.teacherId);
    const batch = params.batchById.get(requirement.batchId);
    if (!teacher || !batch) {
      return false;
    }

    const dayLoadMap = availability.teacherDayLoad.get(requirement.teacherId) || new Map<string, number>();
    const teacherDayLoad = dayLoadMap.get(candidate.day) || 0;
    if (teacher.maxHrsPerDay > 0 && teacherDayLoad + requirement.sessionLength > teacher.maxHrsPerDay) {
      return false;
    }
    dayLoadMap.set(candidate.day, teacherDayLoad + requirement.sessionLength);
    availability.teacherDayLoad.set(requirement.teacherId, dayLoadMap);

    const weekLoad = (availability.teacherWeekLoad.get(requirement.teacherId) || 0) + requirement.sessionLength;
    if (teacher.maxHrsPerWeek > 0 && weekLoad > teacher.maxHrsPerWeek) {
      dayLoadMap.set(candidate.day, teacherDayLoad);
      return false;
    }
    availability.teacherWeekLoad.set(requirement.teacherId, weekLoad);

    availability.teacherSlotKey.add(`${requirement.teacherId}::${slotKey(candidate.day, candidate.slot.slotId)}`);
    availability.roomSlotKey.add(`${candidate.room.roomId}::${slotKey(candidate.day, candidate.slot.slotId)}`);
    availability.batchSlotKey.add(`${requirement.batchId}::${slotKey(candidate.day, candidate.slot.slotId)}`);

    if (candidate.nextSlot) {
      availability.teacherSlotKey.add(`${requirement.teacherId}::${slotKey(candidate.day, candidate.nextSlot.slotId)}`);
      availability.roomSlotKey.add(`${candidate.room.roomId}::${slotKey(candidate.day, candidate.nextSlot.slotId)}`);
      availability.batchSlotKey.add(`${requirement.batchId}::${slotKey(candidate.day, candidate.nextSlot.slotId)}`);
    }

    const subjectKey = this.requirementKey(requirement);
    const sessionCountMap = availability.subjectSessionCount.get(subjectKey) || new Map<string, number>();
    sessionCountMap.set(candidate.day, (sessionCountMap.get(candidate.day) || 0) + 1);
    availability.subjectSessionCount.set(subjectKey, sessionCountMap);

    params.assignments.push({
      assignmentId: randomUUID(),
      batchId: requirement.batchId,
      batchName: batch.batchName,
      subjectCode: requirement.subjectCode,
      subjectName: requirement.subjectName,
      teacherId: teacher.teacherId,
      teacherName: teacher.name,
      roomId: candidate.room.roomId,
      roomName: candidate.room.roomName,
      day: candidate.day,
      slotId: candidate.slot.slotId,
      periodLabel: candidate.slot.periodLabel,
      startTime: candidate.slot.startTime,
      endTime: candidate.nextSlot ? candidate.nextSlot.endTime : candidate.slot.endTime,
      sessionType: requirement.sessionType,
      slotCount: requirement.sessionLength,
      score: candidate.score,
    });

    return true;
  }

  private buildAssignmentsCore(params: {
    requirements: SchedulingRequirement[];
    plan: TimetablePlan;
    batches: BatchRecord[];
    teachers: TeacherRecord[];
    rooms: RoomRecord[];
    timeslots: TimeslotRecord[];
  }): { assignments: TimetableAssignment[]; unplaced: SchedulingRequirement[] } {
    const availability = buildAvailabilityState();
    const assignments: TimetableAssignment[] = [];
    const batchById = new Map(params.batches.map((batch) => [batch.batchId, batch]));
    const teacherById = new Map(params.teachers.map((teacher) => [teacher.teacherId, teacher]));
    const weekDays = params.plan.preferredDays.length > 0 ? params.plan.preferredDays : WEEK_DAYS;
    const excludedDays = new Set(WEEK_DAYS.filter((day) => !weekDays.includes(day)));

    const remainingByRequirement = new Map<string, number>();
    const requirementByKey = new Map<string, SchedulingRequirement>();
    const forcedUnplacedByRequirement = new Map<string, number>();
    for (const requirement of params.requirements) {
      const key = this.requirementKey(requirement);
      remainingByRequirement.set(key, requirement.totalSessions);
      availability.subjectSessionCount.set(key, new Map());
      requirementByKey.set(key, requirement);
    }

    const start = Date.now();
    while (Date.now() - start < this.searchTimeoutMs) {
      const pendingKeys = [...remainingByRequirement.entries()]
        .filter(([, remaining]) => remaining > 0)
        .map(([key]) => key);

      if (pendingKeys.length === 0) {
        break;
      }

      let bestKey: string | undefined;
      let bestDomain: ReturnType<typeof this.getCandidatePlacements> = [];
      let bestScore = Infinity;

      for (const key of pendingKeys) {
        const requirement = requirementByKey.get(key);
        if (!requirement) {
          continue;
        }

        const domain = this.getCandidatePlacements({
          requirement,
          plan: params.plan,
          rooms: params.rooms,
          timeslots: params.timeslots,
          weekDays,
          batchById,
          teacherById,
          assignments,
          availability,
          excludedDays,
        });

        const priorityBoost = this.domainPriority(requirement) / 1000;
        const constrainedScore = domain.length - priorityBoost;
        if (constrainedScore < bestScore) {
          bestScore = constrainedScore;
          bestKey = key;
          bestDomain = domain;
        }

        if (domain.length === 0) {
          break;
        }
      }

      if (!bestKey) {
        break;
      }

      const selectedRequirement = requirementByKey.get(bestKey)!;
      if (bestDomain.length === 0) {
        const remaining = remainingByRequirement.get(bestKey) || 0;
        forcedUnplacedByRequirement.set(
          bestKey,
          (forcedUnplacedByRequirement.get(bestKey) || 0) + remaining
        );
        remainingByRequirement.set(bestKey, 0);
        continue;
      }

      const topCandidates = bestDomain.slice(0, this.beamWidth);
      const pickIndex = topCandidates.length > 1 ? Math.floor(Math.random() * Math.min(2, topCandidates.length)) : 0;
      const candidate = topCandidates[pickIndex] || topCandidates[0];

      const placed = this.placeCandidate({
        requirement: selectedRequirement,
        candidate,
        availability,
        assignments,
        batchById,
        teacherById,
      });

      if (!placed) {
        const remaining = remainingByRequirement.get(bestKey) || 0;
        forcedUnplacedByRequirement.set(
          bestKey,
          (forcedUnplacedByRequirement.get(bestKey) || 0) + remaining
        );
        remainingByRequirement.set(bestKey, 0);
        continue;
      }

      remainingByRequirement.set(bestKey, (remainingByRequirement.get(bestKey) || 1) - 1);
    }

    const unplaced: SchedulingRequirement[] = [];
    for (const [key, remaining] of remainingByRequirement) {
      if (remaining <= 0) {
        continue;
      }
      const requirement = requirementByKey.get(key);
      if (!requirement) {
        continue;
      }
      for (let i = 0; i < remaining; i++) {
        unplaced.push(requirement);
      }
    }

    for (const [key, dropped] of forcedUnplacedByRequirement) {
      const requirement = requirementByKey.get(key);
      if (!requirement) {
        continue;
      }
      for (let i = 0; i < dropped; i++) {
        unplaced.push(requirement);
      }
    }

    return { assignments, unplaced };
  }

  private enforceConflictFree(assignments: TimetableAssignment[]): {
    assignments: TimetableAssignment[];
    dropped: TimetableAssignment[];
  } {
    const kept: TimetableAssignment[] = [];
    const dropped: TimetableAssignment[] = [];
    const teacherSlots = new Set<string>();
    const roomSlots = new Set<string>();
    const batchSlots = new Set<string>();

    const ordered = [...assignments].sort((left, right) => right.score - left.score);

    for (const assignment of ordered) {
      const teacherKey = `${assignment.teacherId}::${assignment.day}::${assignment.slotId}`;
      const roomKey = `${assignment.roomId}::${assignment.day}::${assignment.slotId}`;
      const batchKey = `${assignment.batchId}::${assignment.day}::${assignment.slotId}`;

      if (teacherSlots.has(teacherKey) || roomSlots.has(roomKey) || batchSlots.has(batchKey)) {
        dropped.push(assignment);
        continue;
      }

      teacherSlots.add(teacherKey);
      roomSlots.add(roomKey);
      batchSlots.add(batchKey);
      kept.push(assignment);
    }

    return { assignments: kept, dropped };
  }

  private buildAssignments(params: {
    requirements: SchedulingRequirement[];
    plan: TimetablePlan;
    batches: BatchRecord[];
    teachers: TeacherRecord[];
    rooms: RoomRecord[];
    timeslots: TimeslotRecord[];
  }): { assignments: TimetableAssignment[]; unplaced: SchedulingRequirement[] } {
    const restarts = this.restarts ?? 5;
    let bestResult: { assignments: TimetableAssignment[]; unplaced: SchedulingRequirement[] } | null = null;
    let bestScore = -Infinity;

    for (let i = 0; i < restarts; i++) {
      const reqs = i === 0 ? params.requirements : shuffle(params.requirements);
      const result = this.buildAssignmentsCore({
        requirements: reqs,
        plan: params.plan,
        batches: params.batches,
        teachers: params.teachers,
        rooms: params.rooms,
        timeslots: params.timeslots,
      });

      const validation = this.validateTimetable(result.assignments, params.requirements, params.teachers, params.rooms);
      const score = this.scoreTimetable(result.assignments, result.unplaced, validation);

      const numericScore = score.score - result.unplaced.length * 0.01;

      if (numericScore > bestScore) {
        bestScore = numericScore;
        bestResult = result;
      }
    }

    return bestResult || { assignments: [], unplaced: params.requirements };
  }

  validateTimetable(
    assignments: TimetableAssignment[],
    requirements: SchedulingRequirement[],
    teachers: TeacherRecord[],
    rooms: RoomRecord[]
  ): { conflictFree: boolean; issues: TimetableValidationIssue[]; warnings: string[] } {
    const issues: TimetableValidationIssue[] = [];
    const warnings: string[] = [];
    const teacherById = new Map(teachers.map((teacher) => [teacher.teacherId, teacher]));
    const roomById = new Map(rooms.map((room) => [room.roomId, room]));
    const seenTeacher = new Set<string>();
    const seenRoom = new Set<string>();
    const seenBatch = new Set<string>();
    const teacherDayLoads = new Map<string, Map<string, number>>();
    const teacherWeekLoads = new Map<string, number>();
    const subjectSpreads = new Map<string, Set<string>>();

    for (const assignment of assignments) {
      const teacher = teacherById.get(assignment.teacherId);
      const room = roomById.get(assignment.roomId);
      const teacherSlot = `${assignment.teacherId}::${assignment.day}::${assignment.slotId}`;
      const roomSlot = `${assignment.roomId}::${assignment.day}::${assignment.slotId}`;
      const batchSlot = `${assignment.batchId}::${assignment.day}::${assignment.slotId}`;

      if (seenTeacher.has(teacherSlot)) {
        issues.push({
          severity: 'error',
          code: 'teacher-conflict',
          message: `${assignment.teacherName} is double-booked on ${assignment.day} ${assignment.slotId}`,
          teacherId: assignment.teacherId,
          day: assignment.day,
          slotId: assignment.slotId,
        });
      }
      seenTeacher.add(teacherSlot);

      if (seenRoom.has(roomSlot)) {
        issues.push({
          severity: 'error',
          code: 'room-conflict',
          message: `${assignment.roomName} is double-booked on ${assignment.day} ${assignment.slotId}`,
          roomId: assignment.roomId,
          day: assignment.day,
          slotId: assignment.slotId,
        });
      }
      seenRoom.add(roomSlot);

      if (seenBatch.has(batchSlot)) {
        issues.push({
          severity: 'error',
          code: 'batch-conflict',
          message: `${assignment.batchName} is double-booked on ${assignment.day} ${assignment.slotId}`,
          batchId: assignment.batchId,
          day: assignment.day,
          slotId: assignment.slotId,
        });
      }
      seenBatch.add(batchSlot);

      if (teacher && teacher.maxHrsPerDay > 0) {
        const dayMap = teacherDayLoads.get(teacher.teacherId) || new Map<string, number>();
        const dayLoad = dayMap.get(assignment.day) || 0;
        dayMap.set(assignment.day, dayLoad + assignment.slotCount);
        teacherDayLoads.set(teacher.teacherId, dayMap);
      }

      if (teacher && teacher.maxHrsPerWeek > 0) {
        const weekLoad = (teacherWeekLoads.get(teacher.teacherId) || 0) + assignment.slotCount;
        teacherWeekLoads.set(teacher.teacherId, weekLoad);
      }

      const spreadKey = `${assignment.batchId}::${assignment.subjectCode}`;
      const daysSet = subjectSpreads.get(spreadKey) || new Set<string>();
      daysSet.add(assignment.day);
      subjectSpreads.set(spreadKey, daysSet);

      if (!room) {
        issues.push({
          severity: 'error',
          code: 'missing-room',
          message: `Room ${assignment.roomId} could not be resolved`,
          roomId: assignment.roomId,
        });
        continue;
      }

      if (
        assignment.sessionType === 'lab' &&
        room.type !== 'lab' &&
        !room.hasComputers &&
        room.computerCount === 0
      ) {
        issues.push({
          severity: 'error',
          code: 'lab-room-mismatch',
          message: `${assignment.subjectCode} should be placed in a lab-capable room, got ${room.roomName}`,
          roomId: assignment.roomId,
          batchId: assignment.batchId,
          day: assignment.day,
          slotId: assignment.slotId,
        });
      }
    }

    for (const [teacherId, dayLoads] of teacherDayLoads) {
      const teacher = teacherById.get(teacherId);
      if (!teacher) continue;

      for (const [day, load] of dayLoads) {
        if (load > teacher.maxHrsPerDay) {
          issues.push({
            severity: 'warning',
            code: 'teacher-day-overload',
            message: `${teacher.name} exceeds daily limit on ${day} (${load}h > ${teacher.maxHrsPerDay}h)`,
            teacherId: teacherId,
            day,
          });
        }
      }
    }

    for (const [teacherId, weekLoad] of teacherWeekLoads) {
      const teacher = teacherById.get(teacherId);
      if (!teacher || !teacher.maxHrsPerWeek) continue;

      if (weekLoad > teacher.maxHrsPerWeek) {
        issues.push({
          severity: 'warning',
          code: 'teacher-week-overload',
          message: `${teacher.name} exceeds weekly limit (${weekLoad}h > ${teacher.maxHrsPerWeek}h)`,
          teacherId: teacherId,
        });
      }
    }

    for (const requirement of requirements) {
      const spreadKey = `${requirement.batchId}::${requirement.subjectCode}`;
      const daysSpread = subjectSpreads.get(spreadKey)?.size || 0;
      const minSpread = requirement.minSpread ?? 0;

      if (daysSpread < minSpread && minSpread > 0) {
        issues.push({
          severity: 'warning',
          code: 'poor-spread',
          message: `${requirement.subjectName} is not well spread across the week (${daysSpread} days, min ${minSpread})`,
          batchId: requirement.batchId,
        });
      }
    }

    if (issues.some((issue) => issue.severity === 'warning')) {
      warnings.push('Some soft constraints are not fully satisfied. Review recommended before publication.');
    }

    return {
      conflictFree: issues.every((issue) => issue.severity !== 'error'),
      issues,
      warnings,
    };
  }

  scoreTimetable(
    assignments: TimetableAssignment[],
    unplaced: SchedulingRequirement[],
    validation: { conflictFree: boolean; issues: TimetableValidationIssue[]; warnings: string[] }
  ): TimetableScore {
    const hardConflicts = validation.issues.filter((issue) => issue.severity === 'error').length;
    const softWarnings = validation.issues.filter((issue) => issue.severity === 'warning').length;
    const unplacedPenalty = unplaced.length * 15;

    const baseScore = Math.max(
      0,
      100 - hardConflicts * 40 - softWarnings * 8 - unplacedPenalty
    );

    const strengths: string[] = [];
    const improvements: string[] = [];

    if (hardConflicts === 0) {
      strengths.push('✓ Zero scheduling conflicts (teacher, room, batch)');
    }

    if (softWarnings === 0) {
      strengths.push('✓ All soft constraints satisfied');
    }

    if (unplaced.length === 0) {
      strengths.push('✓ All subjects successfully scheduled');
    } else {
      improvements.push(
        `${unplaced.length} subject(s) could not be placed - consider adding more resources or spreading across more days`
      );
    }

    if (hardConflicts > 0) {
      improvements.push(`${hardConflicts} hard conflict(s) detected - schedule cannot be used`);
    }

    if (softWarnings > 0) {
      const dayLoadIssues = validation.issues.filter(
        (i) => i.code === 'teacher-day-overload'
      ).length;
      const weekLoadIssues = validation.issues.filter(
        (i) => i.code === 'teacher-week-overload'
      ).length;
      const spreadIssues = validation.issues.filter((i) => i.code === 'poor-spread').length;

      if (dayLoadIssues > 0) {
        improvements.push(
          `${dayLoadIssues} teacher(s) exceed daily limits - redistribute sessions`
        );
      }
      if (weekLoadIssues > 0) {
        improvements.push(
          `${weekLoadIssues} teacher(s) exceed weekly limits - consider co-teaching`
        );
      }
      if (spreadIssues > 0) {
        improvements.push(
          `${spreadIssues} subject(s) are poorly spread - better spacing recommended`
        );
      }
    }

    if (baseScore >= 95) {
      return {
        score: baseScore,
        label: 'excellent',
        strengths,
        improvements,
      };
    }

    if (baseScore >= 85) {
      return {
        score: baseScore,
        label: 'strong',
        strengths,
        improvements,
      };
    }

    if (baseScore >= 70) {
      return {
        score: baseScore,
        label: 'good',
        strengths,
        improvements,
      };
    }

    return {
      score: baseScore,
      label: 'needs-review',
      strengths:
        strengths.length > 0
          ? strengths
          : ['Schedule generated but requires significant review'],
      improvements,
    };
  }

  async generate(
    request: TimetableGenerationRequest,
    data: {
      batches: BatchRecord[];
      subjects: SubjectRecord[];
      teachers: TeacherRecord[];
      rooms: RoomRecord[];
      timeslots: TimeslotRecord[];
      mappings: SubjectRoomMappingRecord[];
      academicCalendar: AcademicCalendarRecord[];
      constraints: ConstraintRecord[];
      labBatches: LabBatchRecord[];
    }
  ): Promise<TimetableGenerationResult> {
    const { batches, subjects, teachers, rooms, timeslots, mappings, academicCalendar } = data;

    const targetBatches = request.batchIds?.length
      ? batches.filter((batch) => request.batchIds?.includes(batch.batchId))
      : batches;

    if (targetBatches.length === 0) {
      throw new Error('No batches were found for timetable generation');
    }

    const excludedSlots = new Set<string>();
    for (const batch of targetBatches) {
      const excluded = getExcludedSlotsFromCalendar(academicCalendar, batch);
      excluded.forEach((slot) => excludedSlots.add(slot));
    }

    const requirements = this.buildRequirements(targetBatches, subjects, teachers, mappings);

    if (requirements.length === 0) {
      const batchSnapshot = targetBatches.map((batch) => ({
        batchId: batch.batchId,
        branch: batch.branch,
        year: batch.year,
        semester: batch.semester,
      }));

      throw new Error(
        `No schedulable subject requirements found for selected batches. ` +
          `Check subject branch/year/semester mapping. Batches: ${JSON.stringify(batchSnapshot)}`
      );
    }

    const fallbackPlan = this.buildFallbackPlan(requirements);
    const plan: TimetablePlan = {
      ...fallbackPlan,
      preferredDays:
        request.weekDays && request.weekDays.length > 0
          ? request.weekDays.filter((day) => !excludedSlots.has(day))
          : fallbackPlan.preferredDays.filter((day) => !excludedSlots.has(day)),
      notes: [
        ...fallbackPlan.notes,
        'Deterministic advanced search: fail-first ordering + beam candidate selection + fairness scoring.',
      ],
    };

    const orderedRequirements = [...requirements].sort((left, right) => {
      const leftIndex = plan.subjectOrder.findIndex(
        (item) =>
          item.subjectCode === left.subjectCode && item.batchId === left.batchId
      );
      const rightIndex = plan.subjectOrder.findIndex(
        (item) =>
          item.subjectCode === right.subjectCode && item.batchId === right.batchId
      );

      if (leftIndex !== -1 && rightIndex !== -1 && leftIndex !== rightIndex) {
        return leftIndex - rightIndex;
      }

      if (left.priority !== right.priority) {
        const priorityMap: Record<string, number> = {
          critical: 0,
          high: 1,
          normal: 2,
          low: 3,
        };
        return priorityMap[left.priority] - priorityMap[right.priority];
      }

      if (left.sessionType !== right.sessionType) {
        const order: Record<TimetableSessionType, number> = {
          lab: 0,
          theory: 1,
          tutorial: 2,
          elective: 3,
        };
        return order[left.sessionType] - order[right.sessionType];
      }

      return right.subjectWeight - left.subjectWeight;
    });

    const { assignments, unplaced } = this.buildAssignments({
      requirements: orderedRequirements,
      plan,
      batches: targetBatches,
      teachers,
      rooms,
      timeslots,
    });

    const conflictSafe = this.enforceConflictFree(assignments);
    const effectiveAssignments = conflictSafe.assignments;
    const droppedByConflict = conflictSafe.dropped.length;
    const effectiveUnplaced = [...unplaced];
    if (droppedByConflict > 0 && orderedRequirements.length > 0) {
      for (let i = 0; i < droppedByConflict; i++) {
        effectiveUnplaced.push(orderedRequirements[i % orderedRequirements.length]);
      }
    }

    const validation = this.validateTimetable(effectiveAssignments, orderedRequirements, teachers, rooms);
    const score = this.scoreTimetable(effectiveAssignments, effectiveUnplaced, validation);

    const generationId = randomUUID();
    const status = request.publish && validation.conflictFree ? 'published' : 'draft';
    const provider: TimetableProvider = 'heuristic';
    const model = 'deterministic-search-v2';

    const result: TimetableGenerationResult = {
      generationId,
      status,
      provider,
      model,
      request,
      plan,
      assignments: effectiveAssignments,
      validation: {
        conflictFree: validation.conflictFree,
        issues: validation.issues,
        warnings:
          droppedByConflict > 0
            ? [
                ...validation.warnings,
                `${droppedByConflict} conflicting tentative placement(s) were auto-dropped to guarantee a clash-free final timetable.`,
              ]
            : validation.warnings,
      },
      score,
      summary: {
        batchCount: targetBatches.length,
        subjectCount: unique(effectiveAssignments.map((assignment) => assignment.subjectCode)).length,
        assignmentCount: effectiveAssignments.length,
        unplacedCount: effectiveUnplaced.length,
        hardConflicts: validation.issues.filter((issue) => issue.severity === 'error').length,
      },
    };

    return result;
  }
}
