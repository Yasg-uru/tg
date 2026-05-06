import { NextRequest, NextResponse } from 'next/server';

import { ensureApiAuth } from '@/lib/auth/api';
import { generateStructuredJson } from '@/lib/ai/providers';
import { dbConnect } from '@/lib/db/connection';
import { GeneratedTimetable } from '@/lib/db/generated-timetable.model';
import { Batch, Room, Subject, Teacher, Timeslot } from '@/lib/db/models';
import { logger } from '@/lib/utils/logger';

type Severity = 'high' | 'medium' | 'low';

type Recommendation = {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  action: string;
};

type BranchSemesterInsight = {
  branch: string;
  semester: number;
  batchCount: number;
  subjectCount: number;
  availableTeachers: number;
  demandHoursPerWeek: number;
  recommendedTeachers: number;
  teacherGap: number;
};

type TimetableReview = {
  found: boolean;
  generationId?: string;
  status?: string;
  score?: number;
  label?: string;
  assignmentCount?: number;
  hardConflicts?: number;
  unplacedCount?: number;
  qualityVerdict: 'excellent' | 'good' | 'needs-improvement' | 'critical';
  notes: string[];
};

type AnalysisPayload = {
  verdict: 'excellent' | 'good' | 'needs-improvement' | 'critical';
  readinessScore: number;
  highlights: string[];
  recommendations: Recommendation[];
  branchSemesterInsights: BranchSemesterInsight[];
  timetableReview: TimetableReview;
};

type BatchDoc = {
  batchId: string;
  branch: string;
  year: number;
  semester: number;
};

type SubjectDoc = {
  subjectCode: string;
  subjectName: string;
  branch: string;
  year: number;
  semester: number;
  teacherId?: string;
  hoursPerWeek?: number;
  theoryHrsPerWeek?: number;
  labHrsPerWeek?: number;
};

type TeacherDoc = {
  teacherId: string;
  branch: string;
  maxHrsPerWeek: number;
  subjectCodes?: string[];
};

type TimeslotDoc = {
  slotId: string;
  isBreak: boolean;
  isLunchBreak: boolean;
};

type RoomDoc = {
  roomId: string;
  type: string;
  hasComputers?: boolean;
};

type GeneratedTimetableDoc = {
  generationId: string;
  status: 'draft' | 'published' | 'failed';
  summary?: {
    assignmentCount?: number;
    hardConflicts?: number;
    unplacedCount?: number;
  };
  score?: {
    score?: number;
    label?: string;
  };
};

function normalizeText(value: string | undefined | null): string {
  return (value || '').trim().toLowerCase();
}

function subjectHours(subject: SubjectDoc): number {
  if (subject.hoursPerWeek && subject.hoursPerWeek > 0) {
    return subject.hoursPerWeek;
  }

  const theory = subject.theoryHrsPerWeek || 0;
  const lab = subject.labHrsPerWeek || 0;
  return theory + lab;
}

function buildTimetableReview(latest: GeneratedTimetableDoc | null): TimetableReview {
  if (!latest) {
    return {
      found: false,
      qualityVerdict: 'needs-improvement',
      notes: ['No generated timetable found yet. Generate one to review quality.'],
    };
  }

  const score = latest.score?.score ?? 0;
  const hardConflicts = latest.summary?.hardConflicts ?? 0;
  const unplacedCount = latest.summary?.unplacedCount ?? 0;
  const assignmentCount = latest.summary?.assignmentCount ?? 0;

  let qualityVerdict: TimetableReview['qualityVerdict'] = 'good';
  const notes: string[] = [];

  if (hardConflicts > 0) {
    qualityVerdict = 'critical';
    notes.push('Hard conflicts detected. This timetable should be revised before use.');
  } else if (score >= 90 && unplacedCount === 0) {
    qualityVerdict = 'excellent';
    notes.push('Conflict-free timetable with strong score and complete placement.');
  } else if (score >= 80 && unplacedCount <= 2) {
    qualityVerdict = 'good';
    notes.push('Timetable quality is acceptable for operation with minor improvements possible.');
  } else {
    qualityVerdict = 'needs-improvement';
    notes.push('Quality is moderate; improve teacher capacity or slot availability.');
  }

  if (unplacedCount > 0) {
    notes.push(`${unplacedCount} sessions are unplaced.`);
  }

  if (assignmentCount === 0) {
    notes.push('No assignments found in latest timetable output.');
  }

  return {
    found: true,
    generationId: latest.generationId,
    status: latest.status,
    score,
    label: latest.score?.label || 'unknown',
    assignmentCount,
    hardConflicts,
    unplacedCount,
    qualityVerdict,
    notes,
  };
}

function defaultAnalysis(payload: {
  batches: BatchDoc[];
  subjects: SubjectDoc[];
  teachers: TeacherDoc[];
  rooms: RoomDoc[];
  timeslots: TimeslotDoc[];
  latestTimetable: GeneratedTimetableDoc | null;
}): AnalysisPayload {
  const { batches, subjects, teachers, rooms, timeslots, latestTimetable } = payload;

  const activeSlots = timeslots.filter((slot) => !slot.isBreak && !slot.isLunchBreak).length;
  const totalDemandHours = subjects.reduce((sum, subject) => sum + subjectHours(subject), 0);
  const totalTeacherCapacity = teachers.reduce(
    (sum, teacher) => sum + (teacher.maxHrsPerWeek || 0),
    0
  );

  const missingTeacherSubjects = subjects.filter((subject) => !subject.teacherId).length;
  const teacherIds = new Set(teachers.map((teacher) => teacher.teacherId));
  const invalidTeacherSubjects = subjects.filter(
    (subject) => subject.teacherId && !teacherIds.has(subject.teacherId)
  ).length;

  const ratio = totalDemandHours > 0 ? totalTeacherCapacity / totalDemandHours : 0;

  const keySet = new Set(batches.map((batch) => `${normalizeText(batch.branch)}::${batch.semester}`));
  const branchSemesterInsights: BranchSemesterInsight[] = Array.from(keySet)
    .map((key) => {
      const [branch, semesterText] = key.split('::');
      const semester = Number(semesterText);

      const matchedBatches = batches.filter(
        (batch) => normalizeText(batch.branch) === branch && batch.semester === semester
      );

      const matchedSubjects = subjects.filter((subject) => {
        const subjectBranch = normalizeText(subject.branch);
        const branchMatch = subjectBranch === branch || subjectBranch === 'all' || subjectBranch === 'both';
        const semesterMatch = subject.semester === semester || subject.semester === 0;
        return branchMatch && semesterMatch;
      });

      const demandHoursPerWeek = matchedSubjects.reduce((sum, subject) => sum + subjectHours(subject), 0);
      const availableTeacherIds = new Set<string>();

      for (const teacher of teachers) {
        const teacherBranch = normalizeText(teacher.branch);
        if (teacherBranch === branch || teacherBranch === 'all' || teacherBranch === 'both') {
          availableTeacherIds.add(teacher.teacherId);
          continue;
        }

        const codes = teacher.subjectCodes || [];
        if (codes.some((code) => matchedSubjects.some((subject) => subject.subjectCode === code))) {
          availableTeacherIds.add(teacher.teacherId);
        }
      }

      const recommendedTeachers = Math.max(1, Math.ceil(demandHoursPerWeek / 16));
      const availableTeachers = availableTeacherIds.size;

      return {
        branch: branch.toUpperCase(),
        semester,
        batchCount: matchedBatches.length,
        subjectCount: matchedSubjects.length,
        availableTeachers,
        demandHoursPerWeek,
        recommendedTeachers,
        teacherGap: Math.max(0, recommendedTeachers - availableTeachers),
      };
    })
    .sort((left, right) => {
      const branchDelta = left.branch.localeCompare(right.branch);
      if (branchDelta !== 0) return branchDelta;
      return left.semester - right.semester;
    });

  const recommendations: Recommendation[] = [];

  if (ratio < 0.95) {
    recommendations.push({
      id: 'teacher-capacity-gap',
      severity: 'high',
      title: 'Teacher weekly capacity is below subject demand',
      detail: `Total demand ${totalDemandHours}h/week vs teacher capacity ${totalTeacherCapacity}h/week.`,
      action: 'Increase faculty allocation or reduce parallel load in high-demand semesters.',
    });
  }

  if (missingTeacherSubjects > 0 || invalidTeacherSubjects > 0) {
    recommendations.push({
      id: 'teacher-mapping-gaps',
      severity: 'high',
      title: 'Some subjects are not mapped to valid teachers',
      detail: `${missingTeacherSubjects} subject(s) missing teacher + ${invalidTeacherSubjects} mapped to unknown teacher IDs.`,
      action: 'Fix subject-teacher mapping in subject and teacher datasets before regeneration.',
    });
  }

  const semesterTeacherGaps = branchSemesterInsights.filter((item) => item.teacherGap > 0);
  if (semesterTeacherGaps.length > 0) {
    const worst = semesterTeacherGaps[0];
    recommendations.push({
      id: 'semester-teacher-gap',
      severity: 'medium',
      title: 'Semester-level teacher shortage detected',
      detail: `${worst.branch} Sem ${worst.semester} needs ~${worst.teacherGap} more teacher(s) for stable scheduling.`,
      action: 'Assign additional teachers or reduce subject-hour concentration in affected semesters.',
    });
  }

  const labRooms = rooms.filter(
    (room) => normalizeText(room.type).includes('lab') || Boolean(room.hasComputers)
  ).length;
  const labSubjects = subjects.filter((subject) => (subject.labHrsPerWeek || 0) > 0).length;

  if (labSubjects > 0 && labRooms === 0) {
    recommendations.push({
      id: 'lab-infra-missing',
      severity: 'high',
      title: 'Lab workload exists but lab-capable rooms are missing',
      detail: `${labSubjects} lab subject(s) detected with 0 lab-capable rooms.`,
      action: 'Mark lab rooms correctly and ensure room types/equipment are uploaded.',
    });
  }

  if (activeSlots < 4) {
    recommendations.push({
      id: 'insufficient-timeslots',
      severity: 'medium',
      title: 'Timeslot coverage seems too low',
      detail: `Only ${activeSlots} active slots are configured per day context.`,
      action: 'Add complete daily slot matrix to improve scheduling flexibility.',
    });
  }

  const timetableReview = buildTimetableReview(latestTimetable);

  if (timetableReview.qualityVerdict === 'critical') {
    recommendations.push({
      id: 'latest-timetable-critical',
      severity: 'high',
      title: 'Latest generated timetable has critical conflicts',
      detail: 'Hard conflicts were detected in latest generated output.',
      action: 'Resolve teacher/room bottlenecks and regenerate before publishing.',
    });
  }

  const highSeverityCount = recommendations.filter((item) => item.severity === 'high').length;
  const mediumSeverityCount = recommendations.filter((item) => item.severity === 'medium').length;

  let readinessScore = 100;
  readinessScore -= highSeverityCount * 18;
  readinessScore -= mediumSeverityCount * 8;
  readinessScore = Math.max(0, Math.min(100, readinessScore));

  let verdict: AnalysisPayload['verdict'] = 'good';
  if (readinessScore >= 90) {
    verdict = 'excellent';
  } else if (readinessScore >= 75) {
    verdict = 'good';
  } else if (readinessScore >= 55) {
    verdict = 'needs-improvement';
  } else {
    verdict = 'critical';
  }

  const highlights = [
    `${batches.length} batches, ${subjects.length} subjects, ${teachers.length} teachers, ${rooms.length} rooms analyzed.`,
    `Teacher capacity ratio: ${totalDemandHours > 0 ? ratio.toFixed(2) : '0.00'} (capacity/demand).`,
    timetableReview.notes[0] || 'Timetable review completed.',
  ];

  return {
    verdict,
    readinessScore,
    highlights,
    recommendations,
    branchSemesterInsights,
    timetableReview,
  };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const unauthorized = await ensureApiAuth(request);
    if (unauthorized) {
      return unauthorized;
    }

    await dbConnect();

    const [batches, subjects, teachers, rooms, timeslots, latestTimetable] = await Promise.all([
      Batch.find({}).lean<BatchDoc[]>(),
      Subject.find({}).lean<SubjectDoc[]>(),
      Teacher.find({}).lean<TeacherDoc[]>(),
      Room.find({}).lean<RoomDoc[]>(),
      Timeslot.find({}).lean<TimeslotDoc[]>(),
      GeneratedTimetable.findOne({ status: { $in: ['draft', 'published'] } })
        .sort({ createdAt: -1 })
        .lean<GeneratedTimetableDoc | null>(),
    ]);

    const deterministic = defaultAnalysis({
      batches,
      subjects,
      teachers,
      rooms,
      timeslots,
      latestTimetable,
    });

    const structured = await generateStructuredJson<AnalysisPayload>(
      {
        systemPrompt:
          'You are an academic timetable quality auditor. Return strict JSON only. Preserve provided metrics and create concise actionable recommendations.',
        userPrompt: JSON.stringify({
          task: 'Review timetable input data quality and latest timetable result quality.',
          deterministic,
          rules: {
            maxRecommendations: 8,
            recommendationFields: ['id', 'severity', 'title', 'detail', 'action'],
            validSeverity: ['high', 'medium', 'low'],
          },
        }),
        temperature: 0.1,
      },
      deterministic,
      // Preferred provider order: Gemini first, then OpenAI, then heuristic fallback
      ['gemini', 'openai']
    );

    return NextResponse.json(
      {
        success: true,
        data: {
          provider: structured.provider,
          model: structured.model,
          generatedAt: new Date().toISOString(),
          analysis: structured.data,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to run timetable quality analysis', {
      error: message,
    });

    return NextResponse.json(
      {
        success: false,
        message: 'Failed to analyze timetable data quality',
        errors: [message],
      },
      { status: 500 }
    );
  }
}
