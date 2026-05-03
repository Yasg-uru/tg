import { randomUUID } from 'crypto';

import { generateStructuredJson } from '@/lib/ai/providers';
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

  createPlanPrompt(
    requirements: SchedulingRequirement[],
    weekDays: string[],
    excludedDays: Set<string>
  ) {
    const summary = requirements.map((item) => ({
      batchId: item.batchId,
      batchName: item.batchName,
      subjectCode: item.subjectCode,
      subjectName: item.subjectName,
      sessionType: item.sessionType,
      sessions: item.totalSessions,
      teacherId: item.teacherId,
      weight: item.subjectWeight,
      priority: item.priority,
    }));

    const availableDays = weekDays.filter((day) => !excludedDays.has(day));

    return {
      systemPrompt:
        'You are a production timetable planning expert. Create schedules like experienced human coordinators would. Return compact JSON only.',
      userPrompt: JSON.stringify(
        {
          task: 'Create an intelligent scheduling plan for a production timetable.',
          availableDays: availableDays.length > 0 ? availableDays : weekDays,
          totalWeekDays: availableDays.length > 0 ? availableDays.length : weekDays.length,
          requirements: summary,
          constraints: {
            labsMustSpreadAcrossWeek: true,
            keepHighCreditSubjectsBalanced: true,
            avoidConsecutiveSameTeacher: true,
            spreadSessionsOfSameSubject: true,
          },
          outputShape: {
            subjectOrder: [
              {
                subjectCode: 'string',
                batchId: 'string',
                weight: 'number',
                reason: 'string',
              },
            ],
            preferredLabSlots: ['day-slotId'],
            preferredTheorySlots: ['day-slotId'],
            preferredDays: ['Monday'],
            notes: ['string'],
          },
          rules: [
            'Assign HIGHEST weight to critical-priority subjects.',
            'Place labs on days with fewest theory classes.',
            'Spread same subject sessions across different days (min 2 days apart).',
            'Balance teacher load: no teacher should have >2 classes per day.',
            'Avoid scheduling two sessions of same subject on same day.',
            'Prioritize morning slots for high-credit theory courses.',
            'Reserve afternoon slots for labs and practicals.',
            'Respect excluded days from academic calendar.',
            'Quality > quantity: unplaced sessions are better than poorly scheduled ones.',
          ],
        },
        null,
        2
      ),
    };
  }

  buildRequirements(
    batches: BatchRecord[],
    subjects: SubjectRecord[],
    teachers: TeacherRecord[],
    mappings: SubjectRoomMappingRecord[],
    labBatches: LabBatchRecord[] = []
  ): SchedulingRequirement[] {
    const teacherById = new Map(teachers.map((teacher) => [teacher.teacherId, teacher]));
    const requirements: SchedulingRequirement[] = [];

    for (const batch of batches) {
      const batchSubjects = subjects.filter((subject) => {
        const branchMatches = subject.branch === batch.branch || subject.branch === 'both';
        const yearMatches = subject.year === batch.year;
        const semesterMatches = subject.semester === batch.semester;

        return branchMatches && yearMatches && semesterMatches;
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
  }): number {
    const { requirement, day, slotIndex, slot, room } = params;
    let score = 100;

    if (params.teacher && params.teacher.maxHrsPerDay > 0) {
      const totalLoad = params.teacherLoad + requirement.sessionLength;
      if (totalLoad > params.teacher.maxHrsPerDay) {
        score -= HARD_CONSTRAINT_PENALTY;
      }
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

    if (requirement.preferredRoomIds.includes(room.roomId)) {
      score += 20;
    }

    const minSpread = requirement.minSpread ?? 0;
    if (params.sessionCount >= minSpread && minSpread > 0) {
      score -= 30;
    }

    score += Math.random() * 0.001;

    return Math.max(-HARD_CONSTRAINT_PENALTY, score);
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
    const unplaced: SchedulingRequirement[] = [];
    const batchById = new Map(params.batches.map((batch) => [batch.batchId, batch]));
    const teacherById = new Map(params.teachers.map((teacher) => [teacher.teacherId, teacher]));
    const orderedSlots = [...params.timeslots]
      .filter((slot) => !slot.isBreak && !slot.isLunchBreak)
      .sort((left, right) => left.slotOrder - right.slotOrder);
    const weekDays = params.plan.preferredDays.length > 0 ? params.plan.preferredDays : WEEK_DAYS;

    for (const requirement of params.requirements) {
      const key = `${requirement.batchId}::${requirement.subjectCode}`;
      availability.subjectSessionCount.set(key, new Map());
    }

    for (const requirement of params.requirements) {
      let placed = 0;

      while (placed < requirement.totalSessions) {
        let bestCandidate:
          | {
              day: string;
              slotIndex: number;
              room: RoomRecord;
              slot: TimeslotRecord;
              nextSlot?: TimeslotRecord;
              score: number;
            }
          | undefined;

        for (const day of weekDays) {
          for (let slotIndex = 0; slotIndex < orderedSlots.length; slotIndex++) {
            const slot = orderedSlots[slotIndex];
            const teacher = teacherById.get(requirement.teacherId);
            const batch = batchById.get(requirement.batchId);

            if (!teacher || !batch) {
              continue;
            }

            if (availability.excludedSlots.has(day)) {
              continue;
            }

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
            const batchKey = slotKey(day, slot.slotId);

            if (availability.teacherSlotKey.has(`${requirement.teacherId}::${teacherKey}`)) {
              continue;
            }

            if (nextSlot) {
              const nextTeacherKey = slotKey(day, nextSlot.slotId);
              if (availability.teacherSlotKey.has(`${requirement.teacherId}::${nextTeacherKey}`)) {
                continue;
              }
            }

            if (availability.batchSlotKey.has(`${requirement.batchId}::${batchKey}`)) {
              continue;
            }

            if (nextSlot) {
              const nextBatchKey = slotKey(day, nextSlot.slotId);
              if (availability.batchSlotKey.has(`${requirement.batchId}::${nextBatchKey}`)) {
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

              if (nextSlot) {
                if (
                  room.notAvailableSlots?.includes(nextSlotKeyValue) ||
                  room.notAvailableSlots?.includes(nextSlot.slotId)
                ) {
                  return false;
                }
              }

              if (!roomSupportsSubject(room, requirement)) {
                return false;
              }

              return room.capacity >= batch.totalStudents;
            });

            for (const room of candidateRooms) {
              const roomKey = slotKey(day, `${room.roomId}::${slot.slotId}`);
              const nextRoomKey = nextSlot
                ? slotKey(day, `${room.roomId}::${nextSlot.slotId}`)
                : '';

              if (availability.roomSlotKey.has(roomKey)) {
                continue;
              }

              if (nextSlot && availability.roomSlotKey.has(nextRoomKey)) {
                continue;
              }

              const teacherDayMap =
                availability.teacherDayLoad.get(requirement.teacherId) || new Map<string, number>();
              const teacherDayLoad = teacherDayMap.get(day) || 0;
              const batchDayLoad = assignments.filter(
                (assignment) => assignment.batchId === requirement.batchId && assignment.day === day
              ).length;

              const subjectKey = `${requirement.batchId}::${requirement.subjectCode}`;
              const sessionCountMap = availability.subjectSessionCount.get(subjectKey) || new Map();
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
              });

              if (score < -500) {
                continue;
              }

              if (!bestCandidate || score > bestCandidate.score) {
                bestCandidate = {
                  day,
                  slotIndex,
                  room,
                  slot,
                  nextSlot,
                  score,
                };
              }
            }
          }
        }

        if (!bestCandidate) {
          unplaced.push(requirement);
          break;
        }

        const teacher = teacherById.get(requirement.teacherId)!;
        const batch = batchById.get(requirement.batchId)!;

        const dayLoadMap =
          availability.teacherDayLoad.get(requirement.teacherId) || new Map<string, number>();
        const teacherDayLoad = dayLoadMap.get(bestCandidate.day) || 0;
        dayLoadMap.set(bestCandidate.day, teacherDayLoad + requirement.sessionLength);
        availability.teacherDayLoad.set(requirement.teacherId, dayLoadMap);

        const weekLoad = (availability.teacherWeekLoad.get(requirement.teacherId) || 0) + requirement.sessionLength;
        availability.teacherWeekLoad.set(requirement.teacherId, weekLoad);

        const teacherSlotOccupation = `${requirement.teacherId}::${slotKey(
          bestCandidate.day,
          bestCandidate.slot.slotId
        )}`;
        const roomSlotOccupation = `${bestCandidate.room.roomId}::${slotKey(
          bestCandidate.day,
          bestCandidate.slot.slotId
        )}`;
        const batchSlotOccupation = `${requirement.batchId}::${slotKey(
          bestCandidate.day,
          bestCandidate.slot.slotId
        )}`;

        availability.teacherSlotKey.add(teacherSlotOccupation);
        availability.roomSlotKey.add(roomSlotOccupation);
        availability.batchSlotKey.add(batchSlotOccupation);

        if (bestCandidate.nextSlot) {
          const nextTeacherSlot = `${requirement.teacherId}::${slotKey(
            bestCandidate.day,
            bestCandidate.nextSlot.slotId
          )}`;
          const nextRoomSlot = `${bestCandidate.room.roomId}::${slotKey(
            bestCandidate.day,
            bestCandidate.nextSlot.slotId
          )}`;
          const nextBatchSlot = `${requirement.batchId}::${slotKey(
            bestCandidate.day,
            bestCandidate.nextSlot.slotId
          )}`;

          availability.teacherSlotKey.add(nextTeacherSlot);
          availability.roomSlotKey.add(nextRoomSlot);
          availability.batchSlotKey.add(nextBatchSlot);
        }

        const subjectKey = `${requirement.batchId}::${requirement.subjectCode}`;
        const sessionCountMap =
          availability.subjectSessionCount.get(subjectKey) || new Map();
        sessionCountMap.set(bestCandidate.day, (sessionCountMap.get(bestCandidate.day) || 0) + 1);
        availability.subjectSessionCount.set(subjectKey, sessionCountMap);

        assignments.push({
          assignmentId: randomUUID(),
          batchId: requirement.batchId,
          batchName: batch.batchName,
          subjectCode: requirement.subjectCode,
          subjectName: requirement.subjectName,
          teacherId: teacher.teacherId,
          teacherName: teacher.name,
          roomId: bestCandidate.room.roomId,
          roomName: bestCandidate.room.roomName,
          day: bestCandidate.day,
          slotId: bestCandidate.slot.slotId,
          periodLabel: bestCandidate.slot.periodLabel,
          startTime: bestCandidate.slot.startTime,
          endTime: bestCandidate.nextSlot
            ? bestCandidate.nextSlot.endTime
            : bestCandidate.slot.endTime,
          sessionType: requirement.sessionType,
          slotCount: requirement.sessionLength,
          score: bestCandidate.score,
        });

        placed++;
      }
    }

    return { assignments, unplaced };
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
    const { batches, subjects, teachers, rooms, timeslots, mappings, academicCalendar, constraints, labBatches } = data;

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

    const requirements = this.buildRequirements(targetBatches, subjects, teachers, mappings, labBatches);

    const fallbackPlan = this.buildFallbackPlan(requirements);
    const planRequest = this.createPlanPrompt(requirements, request.weekDays || WEEK_DAYS, excludedSlots);

    const aiPlan = await generateStructuredJson<TimetablePlan>(planRequest, fallbackPlan);
    const plan = aiPlan.data.subjectOrder.length > 0 ? aiPlan.data : fallbackPlan;

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

    const validation = this.validateTimetable(assignments, orderedRequirements, teachers, rooms);
    const score = this.scoreTimetable(assignments, unplaced, validation);

    const generationId = randomUUID();
    const status = request.publish && validation.conflictFree ? 'published' : 'draft';
    const provider: TimetableProvider = aiPlan.provider;
    const model = aiPlan.model;

    const result: TimetableGenerationResult = {
      generationId,
      status,
      provider,
      model,
      request,
      plan,
      assignments,
      validation: {
        conflictFree: validation.conflictFree,
        issues: validation.issues,
        warnings: validation.warnings,
      },
      score,
      summary: {
        batchCount: targetBatches.length,
        subjectCount: unique(assignments.map((assignment) => assignment.subjectCode)).length,
        assignmentCount: assignments.length,
        unplacedCount: unplaced.length,
        hardConflicts: validation.issues.filter((issue) => issue.severity === 'error').length,
      },
    };

    return result;
  }
}
