import { GeneratedTimetable } from '@/lib/db/generated-timetable.model';
import { dbConnect } from '@/lib/db/connection';
import {
  AcademicCalendar,
  Batch,
  Constraint,
  LabBatch,
  Room,
  Subject,
  SubjectRoomMapping,
  Teacher,
  Timeslot,
} from '@/lib/db/models';
import { logger } from '@/lib/utils/logger';
import type {
  TimetableGenerationRequest,
  TimetableGenerationResult,
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
} from './timetable/types';

import { TimetableGenerator } from './timetable/generator';

export async function generateTimetable(
  request: TimetableGenerationRequest
): Promise<TimetableGenerationResult> {
  await dbConnect();

  // Parallel fetch all data
  const [batches, subjects, teachers, rooms, timeslots, mappings, academicCalendar, constraints, labBatches] =
    await Promise.all([
      Batch.find({}).lean<BatchRecord[]>(),
      Subject.find({}).lean<SubjectRecord[]>(),
      Teacher.find({}).lean<TeacherRecord[]>(),
      Room.find({}).lean<RoomRecord[]>(),
      Timeslot.find({}).lean<TimeslotRecord[]>(),
      SubjectRoomMapping.find({}).lean<SubjectRoomMappingRecord[]>(),
      AcademicCalendar.find({}).lean<AcademicCalendarRecord[]>(),
      Constraint.find({}).lean<ConstraintRecord[]>(),
      LabBatch.find({}).lean<LabBatchRecord[]>(),
    ]);

  const targetBatches = request.batchIds?.length
    ? batches.filter((batch) => request.batchIds?.includes(batch.batchId))
    : batches;

  if (targetBatches.length === 0) {
    const availableBatchIds = batches.map(b => b.batchId).join(', ');
    const requestedIds = request.batchIds?.join(', ') || 'none';
    throw new Error(
      `No batches were found for timetable generation. ` +
      `Requested: [${requestedIds}], Available: [${availableBatchIds}]`
    );
  }

  logger.info(`Generating timetable for ${targetBatches.length} batch(es)`, {
    batchIds: targetBatches.map(b => b.batchId),
    totalSubjects: subjects.length,
    totalTeachers: teachers.length,
    totalRooms: rooms.length,
  });

  // Delegate to TimetableGenerator
  const generator = new TimetableGenerator();
  const result = await generator.generate(request, {
    batches,
    subjects,
    teachers,
    rooms,
    timeslots,
    mappings,
    academicCalendar,
    constraints,
    labBatches,
  });

  // Persist result if requested
  if (request.persist !== false) {
    try {
      await GeneratedTimetable.create({
        generationId: result.generationId,
        status: result.status,
        provider: result.provider,
        aiModel: result.model,
        request: result.request,
        plan: result.plan,
        assignments: result.assignments,
        validation: result.validation,
        score: result.score,
        summary: result.summary,
      });
    } catch (error) {
      logger.warn('Failed to persist timetable generation', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}
