import { GeneratedTimetable } from '@/lib/db/generated-timetable.model';
import { TimetablePublication } from '@/lib/db/timetable-publication.model';
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
import { AppError } from '@/lib/utils/errors';
import type {
  TimetableAssignment,
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

const DEFAULT_ACADEMIC_YEAR = 'unknown';

function buildSemesterKey(branch: string, semester: number, academicYear?: string): string {
  const safeBranch = String(branch || '').trim();
  const safeSemester = Number.isFinite(semester) ? semester : 0;
  const safeYear = (academicYear || DEFAULT_ACADEMIC_YEAR).trim();
  return `${safeBranch}::${safeSemester}::${safeYear}`;
}

function getSemesterDescriptor(batch: BatchRecord) {
  const academicYear = batch.academicYear || DEFAULT_ACADEMIC_YEAR;
  return {
    key: buildSemesterKey(batch.branch, batch.semester, academicYear),
    branch: batch.branch,
    semester: batch.semester,
    academicYear,
  };
}

async function buildLockedAssignments(params: {
  selectedSemesterKeys: Set<string>;
  batches: BatchRecord[];
}): Promise<TimetableAssignment[]> {
  if (params.selectedSemesterKeys.size === 0) {
    return [];
  }

  const publicationStatuses = await TimetablePublication.find({
    status: { $in: ['published', 'unpublished'] },
  })
    .select('key generationId')
    .lean<{ key: string; generationId: string }[]>();

  const relevantStatuses = publicationStatuses.filter(
    (status) => !params.selectedSemesterKeys.has(status.key)
  );

  if (relevantStatuses.length === 0) {
    return [];
  }

  const generationIds = [...new Set(relevantStatuses.map((status) => status.generationId))];
  const timetables = await GeneratedTimetable.find({
    generationId: { $in: generationIds },
  })
    .select('generationId assignments')
    .lean<{ generationId: string; assignments: TimetableAssignment[] }[]>();

  const relevantKeys = new Set(relevantStatuses.map((status) => status.key));
  const batchById = new Map(params.batches.map((batch) => [batch.batchId, batch]));
  const lockedAssignments: TimetableAssignment[] = [];

  for (const timetable of timetables) {
    for (const assignment of timetable.assignments || []) {
      const batch = batchById.get(assignment.batchId);
      if (!batch) {
        continue;
      }

      const semesterKey = buildSemesterKey(batch.branch, batch.semester, batch.academicYear);
      if (!relevantKeys.has(semesterKey)) {
        continue;
      }

      lockedAssignments.push(assignment);
    }
  }

  return lockedAssignments;
}

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

  const semesterDescriptors = new Map<string, ReturnType<typeof getSemesterDescriptor>>();
  for (const batch of targetBatches) {
    const descriptor = getSemesterDescriptor(batch);
    if (!semesterDescriptors.has(descriptor.key)) {
      semesterDescriptors.set(descriptor.key, descriptor);
    }
  }

  const selectedSemesterKeys = new Set(semesterDescriptors.keys());

  if (request.batchIds?.length && selectedSemesterKeys.size > 0) {
    const published = await TimetablePublication.find({
      key: { $in: Array.from(selectedSemesterKeys) },
      status: 'published',
    })
      .select('branch semester academicYear')
      .lean();

    if (published.length > 0) {
      throw new AppError('Selected semesters already have a published timetable. Unpublish first.', 409, {
        published,
      });
    }
  }
  const lockedAssignments = request.batchIds?.length
    ? await buildLockedAssignments({ selectedSemesterKeys, batches })
    : [];

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
    lockedAssignments,
  });

  // Persist result if requested
  let persisted = false;
  let reusingExistingDoc = false;
  let finalGenerationId = result.generationId; // Track which generationId to use

  if (request.persist !== false) {
    try {
      // Check for existing unpublished timetables for these semesters to reuse
      let existingGenerationId: string | null = null;
      if (request.batchIds?.length && selectedSemesterKeys.size > 0) {
        const existingPublications = await TimetablePublication.find({
          key: { $in: Array.from(selectedSemesterKeys) },
          status: { $in: ['unpublished', 'draft'] },
        })
          .select('generationId')
          .lean<{ generationId: string }[]>();

        if (existingPublications.length > 0) {
          // Use the existing generationId to update instead of creating new
          existingGenerationId = existingPublications[0].generationId;
          finalGenerationId = existingGenerationId; // Keep the old ID
          
          logger.info('Reusing existing draft timetable document', {
            existingGenerationId,
            semesters: Array.from(selectedSemesterKeys),
          });
        }
      }

      if (existingGenerationId) {
        // Check if the document actually exists before trying to update
        const existingDoc = await GeneratedTimetable.findOne({ generationId: existingGenerationId });
        
        if (existingDoc) {
          // Update existing document instead of creating new
          const updateResult = await GeneratedTimetable.updateOne(
            { generationId: existingGenerationId },
            {
              $set: {
                status: result.status,
                provider: result.provider,
                aiModel: result.model,
                request: result.request,
                plan: result.plan,
                assignments: result.assignments,
                validation: result.validation,
                score: result.score,
                summary: result.summary,
                updatedAt: new Date(),
              },
            }
          );
          
          if (updateResult.matchedCount === 0) {
            throw new Error(`Failed to update timetable: no document found with generationId ${existingGenerationId}`);
          }
          
          reusingExistingDoc = true;
        } else {
          // Document was deleted or doesn't exist - create a new one instead
          logger.warn('Referenced timetable document not found, creating new instead', {
            oldGenerationId: existingGenerationId,
            newGenerationId: result.generationId,
          });
          
          const createdDoc = await GeneratedTimetable.create({
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
          
          if (!createdDoc) {
            throw new Error('Failed to create timetable document in database');
          }
          
          // Update the publication to point to the new generationId
          finalGenerationId = result.generationId;
        }
      } else {
        // Create new document
        const createdDoc = await GeneratedTimetable.create({
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
        
        if (!createdDoc) {
          throw new Error('Failed to create timetable document in database');
        }
      }
      persisted = true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to persist timetable generation', {
        generationId: result.generationId,
        error: errorMessage,
      });
      throw new AppError(`Failed to save timetable to database: ${errorMessage}`, 500, { 
        generationId: result.generationId 
      });
    }
  }

  if (persisted && semesterDescriptors.size > 0) {
    const publishStatus = request.publish && result.validation.conflictFree ? 'published' : 'unpublished';
    const updates = Array.from(semesterDescriptors.values()).map((descriptor) => ({
      updateOne: {
        filter: { key: descriptor.key },
        update: {
          $set: {
            key: descriptor.key,
            branch: descriptor.branch,
            semester: descriptor.semester,
            academicYear: descriptor.academicYear,
            status: publishStatus,
            generationId: finalGenerationId, // Use the (possibly reused) generationId
          },
        },
        upsert: true,
      },
    }));

    try {
      await TimetablePublication.bulkWrite(updates);
    } catch (error) {
      logger.warn('Failed to update timetable publication status', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { ...result, persisted };
}
