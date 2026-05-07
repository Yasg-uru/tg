export type TimetableSessionType = 'theory' | 'lab' | 'tutorial' | 'elective';

export type TimetableProvider = 'gemini' | 'openai' | 'heuristic';

export interface TimetableGenerationRequest {
  batchIds?: string[];
  publish?: boolean;
  persist?: boolean;
  weekDays?: string[];
}

export interface TimetablePlannedRule {
  subjectCode: string;
  batchId?: string;
  weight: number;
  reason: string;
}

export interface TimetablePlan {
  subjectOrder: TimetablePlannedRule[];
  preferredLabSlots: string[];
  preferredTheorySlots: string[];
  preferredDays: string[];
  notes: string[];
}

export interface TimetableAssignment {
  assignmentId: string;
  batchId: string;
  batchName: string;
  subjectCode: string;
  subjectName: string;
  teacherId: string;
  teacherName: string;
  roomId: string;
  roomName: string;
  day: string;
  slotId: string;
  periodLabel: string;
  startTime: string;
  endTime: string;
  sessionType: TimetableSessionType;
  slotCount: number;
  score: number;
}

export interface TimetableValidationIssue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  batchId?: string;
  teacherId?: string;
  roomId?: string;
  day?: string;
  slotId?: string;
}

export interface TimetableScore {
  score: number;
  label: 'excellent' | 'strong' | 'good' | 'needs-review';
  strengths: string[];
  improvements: string[];
}

export interface TimetableGenerationResult {
  generationId: string;
  status: 'draft' | 'published';
  provider: TimetableProvider;
  model: string;
  request: TimetableGenerationRequest;
  plan: TimetablePlan;
  assignments: TimetableAssignment[];
  validation: {
    conflictFree: boolean;
    issues: TimetableValidationIssue[];
    warnings: string[];
  };
  score: TimetableScore;
  summary: {
    batchCount: number;
    subjectCount: number;
    assignmentCount: number;
    unplacedCount: number;
    hardConflicts: number;
  };
  persisted?: boolean;
}