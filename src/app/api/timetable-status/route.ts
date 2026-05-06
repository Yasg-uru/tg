import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { dbConnect } from '@/lib/db/connection';
import { TimetablePublication } from '@/lib/db/timetable-publication.model';
import { GeneratedTimetable } from '@/lib/db/generated-timetable.model';
import { Batch } from '@/lib/db/models';
import { logger } from '@/lib/utils/logger';

const DEFAULT_ACADEMIC_YEAR = 'unknown';

const updateSchema = z.union([
  z.object({
    items: z
      .array(
        z.object({
          branch: z.string().min(1),
          semester: z.number().int().nonnegative(),
          academicYear: z.string().optional(),
          status: z.enum(['published', 'unpublished']),
        })
      )
      .min(1),
  }),
  z.object({
    scope: z.object({
      branch: z.string().min(1),
      academicYear: z.string().optional(),
      status: z.enum(['published', 'unpublished']),
    }),
  }),
]);

function buildSemesterKey(branch: string, semester: number, academicYear?: string): string {
  const safeBranch = String(branch || '').trim();
  const safeSemester = Number.isFinite(semester) ? semester : 0;
  const safeYear = (academicYear || DEFAULT_ACADEMIC_YEAR).trim();
  return `${safeBranch}::${safeSemester}::${safeYear}`;
}

type BatchDoc = {
  batchId: string;
  branch: string;
  semester: number;
  academicYear?: string;
};

type GeneratedTimetableDoc = {
  generationId: string;
  status: 'draft' | 'published' | 'failed';
  request?: { batchIds?: string[] };
  assignments?: Array<{ batchId?: string }>;
};

function getBatchIdsFromGeneration(doc: GeneratedTimetableDoc): string[] {
  if (Array.isArray(doc.request?.batchIds) && doc.request?.batchIds.length) {
    return [...new Set(doc.request.batchIds.filter(Boolean))];
  }

  const assignmentIds = (doc.assignments || [])
    .map((assignment) => assignment.batchId)
    .filter(Boolean) as string[];

  return [...new Set(assignmentIds)];
}

async function ensurePublicationRecords(): Promise<void> {
  const existingKeys = await TimetablePublication.find({})
    .select('key')
    .lean<{ key: string }[]>();
  const existingKeySet = new Set(existingKeys.map((item) => item.key));

  const generations = await GeneratedTimetable.find({
    status: { $in: ['draft', 'published'] },
  })
    .sort({ createdAt: -1 })
    .select('generationId status request assignments createdAt')
    .lean<GeneratedTimetableDoc[]>();

  if (generations.length === 0) {
    return;
  }

  const batches = await Batch.find({})
    .select('batchId branch semester academicYear')
    .lean<BatchDoc[]>();
  const batchById = new Map(batches.map((batch) => [batch.batchId, batch]));

  const insertMap = new Map<
    string,
    {
      key: string;
      branch: string;
      semester: number;
      academicYear: string;
      status: 'published' | 'unpublished';
      generationId: string;
    }
  >();

  for (const generation of generations) {
    const batchIds = getBatchIdsFromGeneration(generation);
    if (batchIds.length === 0) {
      continue;
    }

    for (const batchId of batchIds) {
      const batch = batchById.get(batchId);
      if (!batch) {
        continue;
      }

      const academicYear = batch.academicYear || DEFAULT_ACADEMIC_YEAR;
      const key = buildSemesterKey(batch.branch, batch.semester, academicYear);
      if (existingKeySet.has(key) || insertMap.has(key)) {
        continue;
      }

      insertMap.set(key, {
        key,
        branch: batch.branch,
        semester: batch.semester,
        academicYear,
        status: generation.status === 'published' ? 'published' : 'unpublished',
        generationId: generation.generationId,
      });
    }
  }

  if (insertMap.size === 0) {
    return;
  }

  await TimetablePublication.bulkWrite(
    Array.from(insertMap.values()).map((item) => ({
      updateOne: {
        filter: { key: item.key },
        update: { $setOnInsert: item },
        upsert: true,
      },
    }))
  );
}

async function syncGeneratedTimetableStatus(generationIds: string[]): Promise<void> {
  if (generationIds.length === 0) {
    return;
  }

  const publications = await TimetablePublication.find({
    generationId: { $in: generationIds },
  })
    .select('generationId status')
    .lean<{ generationId: string; status: 'published' | 'unpublished' }[]>();

  const stats = new Map<string, { total: number; published: number }>();
  for (const pub of publications) {
    const current = stats.get(pub.generationId) || { total: 0, published: 0 };
    current.total += 1;
    if (pub.status === 'published') {
      current.published += 1;
    }
    stats.set(pub.generationId, current);
  }

  const publishIds: string[] = [];
  const draftIds: string[] = [];
  for (const [generationId, counts] of stats) {
    if (counts.total > 0 && counts.published === counts.total) {
      publishIds.push(generationId);
    } else {
      draftIds.push(generationId);
    }
  }

  if (publishIds.length > 0) {
    await GeneratedTimetable.updateMany(
      { generationId: { $in: publishIds } },
      { $set: { status: 'published' } }
    );
  }

  if (draftIds.length > 0) {
    await GeneratedTimetable.updateMany(
      { generationId: { $in: draftIds } },
      { $set: { status: 'draft' } }
    );
  }
}

export async function GET(): Promise<NextResponse> {
  try {
    await dbConnect();
    await ensurePublicationRecords();

    const items = await TimetablePublication.find({})
      .sort({ updatedAt: -1 })
      .lean();

    return NextResponse.json({
      success: true,
      data: items,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to load timetable publication status', { error: message });

    return NextResponse.json(
      {
        success: false,
        message: 'Failed to load timetable publication status',
        errors: [message],
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const payload = updateSchema.parse(await request.json());
    await dbConnect();
    await ensurePublicationRecords();

    let normalizedItems: Array<{
      branch: string;
      semester: number;
      academicYear: string;
      status: 'published' | 'unpublished';
      key: string;
    }> = [];
    let existing: Array<{
      key: string;
      generationId: string;
      status: string;
      branch: string;
      semester: number;
      academicYear?: string;
    }> = [];

    if ('items' in payload) {
      normalizedItems = payload.items.map((item) => {
        const academicYear = item.academicYear || DEFAULT_ACADEMIC_YEAR;
        return {
          ...item,
          academicYear,
          key: buildSemesterKey(item.branch, item.semester, academicYear),
        };
      });

      const keys = [...new Set(normalizedItems.map((item) => item.key))];
      existing = await TimetablePublication.find({ key: { $in: keys } })
        .select('key generationId status branch semester academicYear')
        .lean<{
          key: string;
          generationId: string;
          status: string;
          branch: string;
          semester: number;
          academicYear?: string;
        }[]>();

      const existingByKey = new Map(existing.map((item) => [item.key, item]));
      const missing = normalizedItems.filter((item) => !existingByKey.has(item.key));

      if (missing.length > 0) {
        return NextResponse.json(
          {
            success: false,
            message: 'No generated timetable found for selected semester(s).',
            data: missing.map((item) => ({
              branch: item.branch,
              semester: item.semester,
              academicYear: item.academicYear,
            })),
          },
          { status: 404 }
        );
      }
    } else {
      const academicYear = payload.scope.academicYear || DEFAULT_ACADEMIC_YEAR;
      const filter: Record<string, unknown> = {
        branch: payload.scope.branch,
      };
      if (payload.scope.academicYear) {
        filter.academicYear = academicYear;
      }

      existing = await TimetablePublication.find(filter)
        .select('key generationId status branch semester academicYear')
        .lean<{
          key: string;
          generationId: string;
          status: string;
          branch: string;
          semester: number;
          academicYear?: string;
        }[]>();

      if (existing.length === 0) {
        return NextResponse.json(
          {
            success: false,
            message: 'No generated timetable found for selected branch scope.',
            data: {
              branch: payload.scope.branch,
              academicYear: payload.scope.academicYear,
            },
          },
          { status: 404 }
        );
      }

      normalizedItems = existing.map((item) => {
        const year = item.academicYear || academicYear;
        const key = item.key || buildSemesterKey(item.branch, item.semester, year);
        return {
          branch: item.branch,
          semester: item.semester,
          academicYear: year,
          status: payload.scope.status,
          key,
        };
      });
    }

    const existingByKey = new Map(existing.map((item) => [item.key, item]));
    const publishRequests = normalizedItems.filter((item) => item.status === 'published');
    if (publishRequests.length > 0) {
      const generationIds = [
        ...new Set(
          publishRequests
            .map((item) => existingByKey.get(item.key)?.generationId)
            .filter(Boolean) as string[]
        ),
      ];

      const timetables = await GeneratedTimetable.find({
        generationId: { $in: generationIds },
      })
        .select('generationId validation summary')
        .lean<{ generationId: string; validation?: { conflictFree?: boolean } }[]>();

      const timetableById = new Map(timetables.map((item) => [item.generationId, item]));

      const blocked = publishRequests.filter((item) => {
        const generationId = existingByKey.get(item.key)?.generationId;
        if (!generationId) {
          return true;
        }
        const timetable = timetableById.get(generationId);
        return !timetable?.validation?.conflictFree;
      });

      if (blocked.length > 0) {
        return NextResponse.json(
          {
            success: false,
            message: 'Cannot publish a timetable with hard conflicts. Regenerate first.',
            data: blocked.map((item) => ({
              branch: item.branch,
              semester: item.semester,
              academicYear: item.academicYear,
            })),
          },
          { status: 409 }
        );
      }
    }

    await TimetablePublication.bulkWrite(
      normalizedItems.map((item) => ({
        updateOne: {
          filter: { key: item.key },
          update: { $set: { status: item.status } },
        },
      }))
    );

    const affectedGenerationIds = [
      ...new Set(
        normalizedItems
          .map((item) => existingByKey.get(item.key)?.generationId)
          .filter(Boolean) as string[]
      ),
    ];

    await syncGeneratedTimetableStatus(affectedGenerationIds);

    const keys = [...new Set(normalizedItems.map((item) => item.key))];
    const updates = await TimetablePublication.find({ key: { $in: keys } })
      .sort({ updatedAt: -1 })
      .lean();

    return NextResponse.json({
      success: true,
      data: updates,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to update timetable publication status', { error: message });

    return NextResponse.json(
      {
        success: false,
        message: 'Failed to update timetable publication status',
        errors: [message],
      },
      { status: 500 }
    );
  }
}
