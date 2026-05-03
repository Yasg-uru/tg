'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { Upload, RefreshCw, Play, Download, AlertCircle, CheckCircle2, Clock, Circle, Brain, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ThemeToggle } from '@/components/theme-toggle';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface Batch {
  _id: string;
  batchId: string;
  batchName: string;
  branch: string;
  year: number;
  semester: number;
}

interface GeneratedAssignment {
  assignmentId: string;
  batchId: string;
  batchName: string;
  subjectCode: string;
  day: string;
  slotId: string;
  teacherName: string;
  subjectName: string;
  roomName: string;
  startTime: string;
  endTime: string;
}

interface GenerationResult {
  success: boolean;
  message: string;
  data?: {
    generationId: string;
    status: 'draft' | 'published';
    provider: string;
    model: string;
    assignments: GeneratedAssignment[];
    validation: {
      conflictFree: boolean;
      issues: Array<{ severity: string; message: string }>;
      warnings: string[];
    };
    score: {
      score: number;
      label: string;
      strengths: string[];
      improvements: string[];
    };
    summary: {
      batchCount: number;
      subjectCount: number;
      assignmentCount: number;
      unplacedCount: number;
      hardConflicts: number;
    };
  };
}

interface RequiredDatasetStatus {
  key: string;
  label: string;
  fileName: string;
  count: number;
  uploaded: boolean;
}

interface AnalysisRecommendation {
  id: string;
  severity: 'high' | 'medium' | 'low';
  title: string;
  detail: string;
  action: string;
}

interface BranchSemesterInsight {
  branch: string;
  semester: number;
  batchCount: number;
  subjectCount: number;
  availableTeachers: number;
  demandHoursPerWeek: number;
  recommendedTeachers: number;
  teacherGap: number;
}

interface QualityAnalysis {
  verdict: 'excellent' | 'good' | 'needs-improvement' | 'critical';
  readinessScore: number;
  highlights: string[];
  recommendations: AnalysisRecommendation[];
  branchSemesterInsights: BranchSemesterInsight[];
  timetableReview: {
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
}

interface AnalysisApiResponse {
  success: boolean;
  data?: {
    provider: 'gemini' | 'openai' | 'heuristic';
    model: string;
    generatedAt: string;
    analysis: QualityAnalysis;
  };
  message?: string;
}

const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

export function TimetableDashboard() {
  const [tab, setTab] = useState('upload');
  const [batches, setBatches] = useState<Batch[]>([]);
  const [selectedBatches, setSelectedBatches] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generationResult, setGenerationResult] = useState<GenerationResult | null>(null);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [loadingReadiness, setLoadingReadiness] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [requiredDatasets, setRequiredDatasets] = useState<RequiredDatasetStatus[]>([]);
  const [qualityAnalysis, setQualityAnalysis] = useState<AnalysisApiResponse['data'] | null>(null);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Fetch batches on mount
  useEffect(() => {
    fetchBatches();
    fetchUploadReadiness();
    fetchLatestGeneratedTimetable();
    fetchQualityAnalysis();
  }, []);

  async function fetchQualityAnalysis() {
    setLoadingAnalysis(true);
    try {
      const response = await fetch('/api/analysis', {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error('Failed to run quality analysis');
      }

      const result: AnalysisApiResponse = await response.json();
      if (result.success && result.data) {
        setQualityAnalysis(result.data);
        setAnalysisError(null);
      }
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : 'Failed to run quality analysis');
    } finally {
      setLoadingAnalysis(false);
    }
  }

  async function fetchLatestGeneratedTimetable() {
    try {
      const response = await fetch('/api/generate', {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch latest generated timetable');
      }

      const result: GenerationResult & { data?: GenerationResult['data'] | null } = await response.json();
      if (result.success && result.data) {
        setGenerationResult({
          success: true,
          message: result.message,
          data: result.data,
        });
      }
    } catch {
      // Ignore hydrate errors to avoid blocking primary dashboard flows.
    }
  }

  async function fetchBatches() {
    setLoadingBatches(true);
    try {
      const response = await fetch('/api/batches');
      if (!response.ok) throw new Error('Failed to fetch batches');
      const data = await response.json();
      setBatches(data.batches || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch batches');
    } finally {
      setLoadingBatches(false);
    }
  }

  async function fetchUploadReadiness() {
    setLoadingReadiness(true);
    try {
      const response = await fetch('/api/upload/status');
      if (!response.ok) throw new Error('Failed to fetch upload readiness');

      const data = await response.json();
      setRequiredDatasets(data.data?.required || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch upload readiness');
    } finally {
      setLoadingReadiness(false);
    }
  }

  const allRequiredUploaded = requiredDatasets.length > 0 && requiredDatasets.every((dataset) => dataset.uploaded);
  const missingDatasets = requiredDatasets.filter((dataset) => !dataset.uploaded);

  const batchById = useMemo(() => {
    return new Map(batches.map((batch) => [batch.batchId, batch]));
  }, [batches]);

  const groupedAssignments = useMemo(() => {
    const assignments = generationResult?.data?.assignments ?? [];
    const branchMap = new Map<
      string,
      {
        branch: string;
        totalAssignments: number;
        semesters: Map<
          number,
          {
            semester: number;
            assignments: GeneratedAssignment[];
          }
        >;
      }
    >();

    for (const assignment of assignments) {
      const batch = batchById.get(assignment.batchId);
      const branch = batch?.branch || 'Unassigned Branch';
      const semester = batch?.semester || 0;

      if (!branchMap.has(branch)) {
        branchMap.set(branch, {
          branch,
          totalAssignments: 0,
          semesters: new Map(),
        });
      }

      const branchGroup = branchMap.get(branch)!;
      branchGroup.totalAssignments += 1;

      if (!branchGroup.semesters.has(semester)) {
        branchGroup.semesters.set(semester, {
          semester,
          assignments: [],
        });
      }

      branchGroup.semesters.get(semester)!.assignments.push(assignment);
    }

    return Array.from(branchMap.values())
      .map((branchGroup) => ({
        ...branchGroup,
        semesters: Array.from(branchGroup.semesters.values())
          .map((semesterGroup) => ({
            ...semesterGroup,
            assignments: [...semesterGroup.assignments].sort((left, right) => {
              const dayDelta = DAY_ORDER.indexOf(left.day) - DAY_ORDER.indexOf(right.day);
              if (dayDelta !== 0) return dayDelta;
              return left.startTime.localeCompare(right.startTime);
            }),
          }))
          .sort((left, right) => left.semester - right.semester),
      }))
      .sort((left, right) => left.branch.localeCompare(right.branch));
  }, [generationResult, batchById]);

  const handleFileUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (!files || files.length === 0) return;

      setUploading(true);
      setError(null);
      setUploadProgress(0);

      try {
        const fileList = Array.from(files);
        let successCount = 0;

        for (let i = 0; i < fileList.length; i++) {
          const file = fileList[i];
          
          // Update progress
          setUploadProgress(Math.round(((i) / fileList.length) * 100));

          const formData = new FormData();
          formData.append('file', file);

          const response = await fetch('/api/upload/csv', {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Failed to upload ${file.name}: ${errorData.message || 'Unknown error'}`);
          }
          
          successCount++;
        }

        setUploadProgress(100);
        setError(null);
        
        // Refresh data after upload
        await fetchBatches();
        await fetchUploadReadiness();
        await fetchQualityAnalysis();
        
        // Show success toast
        toast.success(`Successfully uploaded ${successCount} file${successCount > 1 ? 's' : ''}`, {
          description: 'Your data has been uploaded and is ready for timetable generation',
        });
        
        // Brief delay to show 100% progress before switching tabs
        setTimeout(() => {
          setTab('generate');
          setUploadProgress(0);
        }, 800);

      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Upload failed';
        setError(errorMessage);
        toast.error('Upload Failed', {
          description: errorMessage,
        });
      } finally {
        setUploading(false);
        if (event.target) event.target.value = '';
      }
    },
    []
  );

  const handleGenerateTimetable = async () => {
    if (!allRequiredUploaded) {
      const missingCsvs = missingDatasets.map((dataset) => dataset.fileName).join(', ');
      setError('Please upload all required CSV files before generating timetable');
      toast.error('Required CSV Files Missing', {
        description: missingCsvs || 'Upload all required CSV files first',
      });
      return;
    }

    if (selectedBatches.length === 0) {
      setError('Please select at least one batch');
      toast.error('No Batches Selected', {
        description: 'Please select at least one batch to generate',
      });
      return;
    }

    setGenerating(true);
    setError(null);

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batchIds: selectedBatches,
          publish: true,
          persist: true,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Generation failed');
      }

      const result: GenerationResult = await response.json();
      setGenerationResult(result);
      await fetchQualityAnalysis();
      setTab('results');
      setError(null);
      
      // Show success toast
      toast.success('Timetable Generated Successfully', {
        description: `Generated timetable with ${result.data?.assignments.length || 0} assignments`,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Generation failed';
      setError(errorMessage);
      toast.error('Generation Failed', {
        description: errorMessage,
      });
    } finally {
      setGenerating(false);
    }
  };

  const downloadTimetable = () => {
    if (!generationResult?.data) return;

    const csv = [
      ['Day', 'Slot', 'Subject', 'Teacher', 'Batch', 'Room', 'Start Time', 'End Time'].join(','),
      ...generationResult.data.assignments.map((a) =>
        [
          a.day,
          a.slotId,
          a.subjectName,
          a.teacherName,
          a.assignmentId.split('::')[0],
          a.roomName,
          a.startTime,
          a.endTime,
        ].join(',')
      ),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `timetable-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-background p-4 sm:p-8 transition-colors">
      <div className="mx-auto max-w-6xl space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-4xl font-bold text-slate-900 dark:text-white">Timetable Generator</h1>
            <p className="text-slate-600 dark:text-slate-400">
              Upload data, select batches, and generate conflict-free schedules
            </p>
          </div>
          <ThemeToggle />
        </div>

        {/* Error Alert */}
        {error && (
          <Card className="border-red-500/50 bg-red-50 dark:bg-red-950/20">
            <CardContent className="flex items-start gap-3 pt-6">
              <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-red-700 dark:text-red-200">{error}</div>
            </CardContent>
          </Card>
        )}

        {/* Main Tabs */}
        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="upload">Upload Data</TabsTrigger>
            <TabsTrigger value="generate">Generate</TabsTrigger>
            <TabsTrigger value="analysis">AI Analysis</TabsTrigger>
            <TabsTrigger value="results" disabled={!generationResult}>
              Results
            </TabsTrigger>
          </TabsList>

          {/* Upload Tab */}
          <TabsContent value="upload" className="space-y-4">
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle>Upload CSV Files</CardTitle>
                <CardDescription>
                  Upload batches, subjects, teachers, rooms, and timeslots CSV files
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div 
                  className="rounded-lg border-2 border-dashed border-border p-8 text-center bg-muted/40 hover:border-primary/50 transition"
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const files = e.dataTransfer.files;
                    if (files && files.length > 0) {
                      const event = { target: { files } } as unknown as React.ChangeEvent<HTMLInputElement>;
                      handleFileUpload(event);
                    }
                  }}
                >
                  <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
                  <p className="text-sm font-medium text-foreground mb-2">Drag and drop CSV files here</p>
                  <p className="text-xs text-muted-foreground mb-4">or click to browse</p>
                  <Input
                    type="file"
                    multiple
                    accept=".csv"
                    onChange={handleFileUpload}
                    disabled={uploading}
                    className="hidden"
                    id="file-upload"
                  />
                  <label htmlFor="file-upload">
                    <Button asChild disabled={uploading} className="cursor-pointer">
                      <span>{uploading ? 'Uploading...' : 'Select Files'}</span>
                    </Button>
                  </label>
                </div>

                {uploadProgress > 0 && (
                  <div className="space-y-2">
                    <Progress value={uploadProgress} className="h-2" />
                    <p className="text-xs text-muted-foreground">{uploadProgress}% uploaded</p>
                  </div>
                )}

                <div className="space-y-3">
                  <p className="text-sm font-medium text-foreground">Required CSV Files Status</p>

                  {loadingReadiness ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Checking uploaded datasets...
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {requiredDatasets.map((dataset) => (
                        <div
                          key={dataset.key}
                          className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2"
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-foreground truncate">{dataset.fileName}</p>
                            <p className="text-[11px] text-muted-foreground">{dataset.label}</p>
                          </div>
                          <Badge variant={dataset.uploaded ? 'default' : 'secondary'}>
                            {dataset.uploaded ? (
                              <span className="flex items-center gap-1">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                {dataset.count}
                              </span>
                            ) : (
                              <span className="flex items-center gap-1">
                                <Circle className="h-3.5 w-3.5" />
                                Missing
                              </span>
                            )}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Generate Tab */}
          <TabsContent value="generate" className="space-y-4">
            {!allRequiredUploaded && (
              <Alert variant="destructive" className="border-destructive/40 bg-destructive/10 text-destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Required CSV files are missing</AlertTitle>
                <AlertDescription>
                  Upload these files before generating timetable: {missingDatasets.map((dataset) => dataset.fileName).join(', ')}
                </AlertDescription>
              </Alert>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Select Batches</CardTitle>
                  <CardDescription>Choose batches to schedule</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {loadingBatches ? (
                    <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Loading batches...
                    </div>
                  ) : batches.length === 0 ? (
                    <p className="text-sm text-slate-600 dark:text-slate-400">No batches found. Please upload data first.</p>
                  ) : (
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {batches.map((batch) => (
                        <label
                          key={batch._id}
                          className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition"
                        >
                          <Checkbox
                            checked={selectedBatches.includes(batch.batchId)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedBatches([...selectedBatches, batch.batchId]);
                              } else {
                                setSelectedBatches(
                                  selectedBatches.filter((id) => id !== batch.batchId)
                                );
                              }
                            }}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{batch.batchName}</p>
                            <p className="text-xs text-slate-600 dark:text-slate-400">
                              {batch.branch} - Year {batch.year} - Sem {batch.semester}
                            </p>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Generation Settings</CardTitle>
                  <CardDescription>Configure scheduling options</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-900 dark:text-slate-300">Week Days</label>
                    <div className="space-y-2">
                      {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map((day) => (
                        <label key={day} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                          <Checkbox defaultChecked />
                          {day}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-900 dark:text-slate-300">Output Status</label>
                    <Select defaultValue="published">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="published">Published</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    onClick={handleGenerateTimetable}
                    disabled={generating || selectedBatches.length === 0 || !allRequiredUploaded}
                    className="w-full bg-emerald-600 hover:bg-emerald-700"
                  >
                    {generating ? (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Play className="mr-2 h-4 w-4" />
                        Generate Timetable
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* AI Analysis Tab */}
          <TabsContent value="analysis" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Brain className="h-5 w-5" />
                      Timetable Quality Advisor
                    </CardTitle>
                    <CardDescription>
                      AI-backed insights to improve input data quality and generated timetable outcomes
                    </CardDescription>
                  </div>
                  <Button variant="outline" onClick={fetchQualityAnalysis} disabled={loadingAnalysis}>
                    {loadingAnalysis ? (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Re-run Analysis
                      </>
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {analysisError && (
                  <Alert variant="destructive">
                    <ShieldAlert className="h-4 w-4" />
                    <AlertTitle>Analysis failed</AlertTitle>
                    <AlertDescription>{analysisError}</AlertDescription>
                  </Alert>
                )}

                {qualityAnalysis ? (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <Card className="border-border bg-muted/30">
                        <CardContent className="pt-6">
                          <p className="text-xs uppercase text-muted-foreground">Readiness Score</p>
                          <p className="text-2xl font-bold">{qualityAnalysis.analysis.readinessScore}/100</p>
                        </CardContent>
                      </Card>
                      <Card className="border-border bg-muted/30">
                        <CardContent className="pt-6">
                          <p className="text-xs uppercase text-muted-foreground">Overall Verdict</p>
                          <div className="mt-1">
                            <Badge variant="secondary" className="capitalize">
                              {qualityAnalysis.analysis.verdict.replace('-', ' ')}
                            </Badge>
                          </div>
                        </CardContent>
                      </Card>
                      <Card className="border-border bg-muted/30">
                        <CardContent className="pt-6">
                          <p className="text-xs uppercase text-muted-foreground">AI Provider</p>
                          <p className="text-sm font-semibold uppercase">{qualityAnalysis.provider}</p>
                        </CardContent>
                      </Card>
                      <Card className="border-border bg-muted/30">
                        <CardContent className="pt-6">
                          <p className="text-xs uppercase text-muted-foreground">Model</p>
                          <p className="text-sm font-semibold">{qualityAnalysis.model}</p>
                        </CardContent>
                      </Card>
                    </div>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Key Highlights</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
                          {qualityAnalysis.analysis.highlights.map((item, index) => (
                            <li key={`${item}-${index}`} className="flex gap-2">
                              <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-500" />
                              {item}
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Recommendations to Improve Timetable Quality</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {qualityAnalysis.analysis.recommendations.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No major issues found. Current data quality looks stable.</p>
                        ) : (
                          qualityAnalysis.analysis.recommendations.map((rec) => (
                            <div key={rec.id} className="rounded-md border border-border p-3">
                              <div className="mb-1 flex items-center justify-between gap-2">
                                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{rec.title}</p>
                                <Badge
                                  variant={
                                    rec.severity === 'high'
                                      ? 'destructive'
                                      : rec.severity === 'medium'
                                        ? 'secondary'
                                        : 'outline'
                                  }
                                  className="capitalize"
                                >
                                  {rec.severity}
                                </Badge>
                              </div>
                              <p className="text-sm text-slate-700 dark:text-slate-300">{rec.detail}</p>
                              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                                <span className="font-medium">Action:</span> {rec.action}
                              </p>
                            </div>
                          ))
                        )}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Branch/Semester Staffing Guidance</CardTitle>
                        <CardDescription>
                          Recommended teacher strength per semester based on subject-hour demand
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="overflow-x-auto rounded-md border border-border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Branch</TableHead>
                                <TableHead>Semester</TableHead>
                                <TableHead>Subjects</TableHead>
                                <TableHead>Demand (hrs/week)</TableHead>
                                <TableHead>Teachers Available</TableHead>
                                <TableHead>Teachers Recommended</TableHead>
                                <TableHead>Gap</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {qualityAnalysis.analysis.branchSemesterInsights.map((item) => (
                                <TableRow key={`${item.branch}-${item.semester}`}>
                                  <TableCell>{item.branch}</TableCell>
                                  <TableCell>{item.semester}</TableCell>
                                  <TableCell>{item.subjectCount}</TableCell>
                                  <TableCell>{item.demandHoursPerWeek}</TableCell>
                                  <TableCell>{item.availableTeachers}</TableCell>
                                  <TableCell>{item.recommendedTeachers}</TableCell>
                                  <TableCell>
                                    {item.teacherGap > 0 ? (
                                      <Badge variant="destructive">+{item.teacherGap}</Badge>
                                    ) : (
                                      <Badge variant="secondary">OK</Badge>
                                    )}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Latest Generated Timetable Review</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="capitalize">
                            {qualityAnalysis.analysis.timetableReview.qualityVerdict.replace('-', ' ')}
                          </Badge>
                          {qualityAnalysis.analysis.timetableReview.score !== undefined && (
                            <span className="text-sm text-muted-foreground">
                              Score: {qualityAnalysis.analysis.timetableReview.score}
                            </span>
                          )}
                        </div>
                        <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
                          {qualityAnalysis.analysis.timetableReview.notes.map((note, index) => (
                            <li key={`${note}-${index}`} className="flex gap-2">
                              <AlertCircle className="mt-0.5 h-4 w-4 text-amber-500" />
                              {note}
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No analysis available yet. Click Re-run Analysis to evaluate data and timetable quality.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Results Tab */}
          <TabsContent value="results" className="space-y-4">
            {generationResult && generationResult.data && (
              <>
                {/* Score Card */}
                <Card className={generationResult.data.score.score >= 90 
                  ? 'border-emerald-500/50 bg-emerald-50 dark:bg-emerald-950/20' 
                  : 'border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/20'
                }>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-slate-900 dark:text-white">
                          Schedule Quality: {generationResult.data.score.label.toUpperCase()}
                        </CardTitle>
                        <CardDescription className="text-slate-600 dark:text-slate-400">
                          Score: {generationResult.data.score.score.toFixed(1)}/100
                        </CardDescription>
                      </div>
                      <Badge
                        variant={generationResult.data.score.score >= 90 ? 'default' : 'secondary'}
                        className={generationResult.data.score.score >= 90 ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-yellow-600 hover:bg-yellow-700'}
                      >
                        {generationResult.data.validation.conflictFree ? '✓ No Conflicts' : '⚠ Review Required'}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-slate-600 dark:text-slate-400 uppercase">Assignments</p>
                        <p className="text-2xl font-bold text-slate-900 dark:text-white">
                          {generationResult.data.summary.assignmentCount}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-slate-600 dark:text-slate-400 uppercase">Unplaced Sessions</p>
                        <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                          {generationResult.data.summary.unplacedCount}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-slate-600 dark:text-slate-400 uppercase">Subjects Scheduled</p>
                        <p className="text-2xl font-bold text-slate-900 dark:text-white">
                          {generationResult.data.summary.subjectCount}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-slate-600 dark:text-slate-400 uppercase">Hard Conflicts</p>
                        <p className={`text-2xl font-bold ${generationResult.data.summary.hardConflicts === 0 
                          ? 'text-emerald-600 dark:text-emerald-400' 
                          : 'text-red-600 dark:text-red-400'
                        }`}>
                          {generationResult.data.summary.hardConflicts}
                        </p>
                      </div>
                    </div>

                    {generationResult.data.score.strengths.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">✓ Strengths</p>
                        <ul className="text-sm text-slate-700 dark:text-slate-300 space-y-1">
                          {generationResult.data.score.strengths.map((s, i) => (
                            <li key={i} className="flex gap-2">
                              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-500 flex-shrink-0 mt-0.5" />
                              {s}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {generationResult.data.score.improvements.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-yellow-600 dark:text-yellow-400">⚠ Improvements</p>
                        <ul className="text-sm text-slate-700 dark:text-slate-300 space-y-1">
                          {generationResult.data.score.improvements.map((imp, i) => (
                            <li key={i} className="flex gap-2">
                              <Clock className="h-4 w-4 text-yellow-600 dark:text-yellow-500 flex-shrink-0 mt-0.5" />
                              {imp}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <Button
                      onClick={downloadTimetable}
                      className="w-full bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800"
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Download as CSV
                    </Button>
                  </CardContent>
                </Card>

                {/* Branch/Semester Timetable */}
                {generationResult.data.assignments.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-slate-900 dark:text-white">Timetable View</CardTitle>
                      <CardDescription className="text-slate-600 dark:text-slate-400">
                        Grouped by branch, then by semester for clean schedule review
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {groupedAssignments.length === 0 ? (
                        <p className="text-sm text-slate-600 dark:text-slate-400">No assignments to display.</p>
                      ) : (
                        <Tabs defaultValue={groupedAssignments[0].branch} className="w-full">
                          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-2 bg-muted/40 p-2">
                            {groupedAssignments.map((branchGroup) => (
                              <TabsTrigger key={branchGroup.branch} value={branchGroup.branch} className="data-[state=active]:bg-background">
                                {branchGroup.branch}
                                <Badge variant="secondary" className="ml-2">
                                  {branchGroup.totalAssignments}
                                </Badge>
                              </TabsTrigger>
                            ))}
                          </TabsList>

                          {groupedAssignments.map((branchGroup) => (
                            <TabsContent key={branchGroup.branch} value={branchGroup.branch} className="space-y-4">
                              <Card className="border-border bg-card/50">
                                <CardHeader className="pb-3">
                                  <div className="flex items-center justify-between gap-2">
                                    <div>
                                      <CardTitle className="text-lg text-slate-900 dark:text-white">
                                        {branchGroup.branch}
                                      </CardTitle>
                                      <CardDescription>
                                        {branchGroup.semesters.length} semester group(s)
                                      </CardDescription>
                                    </div>
                                    <Badge variant="outline">{branchGroup.totalAssignments} sessions</Badge>
                                  </div>
                                </CardHeader>
                                <CardContent>
                                  <Tabs defaultValue={String(branchGroup.semesters[0]?.semester)} className="w-full space-y-4">
                                    <TabsList className="flex h-auto w-full flex-wrap justify-start gap-2 bg-muted/40 p-2">
                                      {branchGroup.semesters.map((semesterGroup) => (
                                        <TabsTrigger key={semesterGroup.semester} value={String(semesterGroup.semester)} className="data-[state=active]:bg-background">
                                          {semesterGroup.semester > 0 ? `Semester ${semesterGroup.semester}` : 'Unassigned Semester'}
                                          <Badge variant="secondary" className="ml-2">
                                            {semesterGroup.assignments.length}
                                          </Badge>
                                        </TabsTrigger>
                                      ))}
                                    </TabsList>

                                    {branchGroup.semesters.map((semesterGroup) => (
                                      <TabsContent key={semesterGroup.semester} value={String(semesterGroup.semester)} className="space-y-2">
                                        {(() => {
                                          const slotMap = new Map<string, { startTime: string; endTime: string }>();
                                          for (const assignment of semesterGroup.assignments) {
                                            const key = `${assignment.startTime}::${assignment.endTime}`;
                                            if (!slotMap.has(key)) {
                                              slotMap.set(key, {
                                                startTime: assignment.startTime,
                                                endTime: assignment.endTime,
                                              });
                                            }
                                          }

                                          const orderedSlots = Array.from(slotMap.values()).sort((left, right) => {
                                            return toMinutes(left.startTime) - toMinutes(right.startTime);
                                          });

                                          const daySet = new Set(semesterGroup.assignments.map((a) => a.day));
                                          const orderedDays = DAY_ORDER.filter((day) => daySet.has(day));
                                          const unknownDays = Array.from(daySet).filter((day) => !DAY_ORDER.includes(day));
                                          const allDays = [...orderedDays, ...unknownDays];

                                          const slotAssignments = new Map<string, GeneratedAssignment[]>();
                                          for (const assignment of semesterGroup.assignments) {
                                            const slotKey = `${assignment.startTime}::${assignment.endTime}`;
                                            const cellKey = `${assignment.day}::${slotKey}`;
                                            const existing = slotAssignments.get(cellKey) || [];
                                            slotAssignments.set(cellKey, [...existing, assignment]);
                                          }

                                          return (
                                            <div className="overflow-x-auto rounded-md border border-border">
                                              <Table>
                                                <TableHeader>
                                                  <TableRow className="hover:bg-transparent">
                                                    <TableHead className="min-w-[110px]">Day</TableHead>
                                                    {orderedSlots.map((slot) => {
                                                      const key = `${slot.startTime}::${slot.endTime}`;
                                                      return (
                                                        <TableHead key={key} className="min-w-[180px] whitespace-normal">
                                                          {slot.startTime} - {slot.endTime}
                                                        </TableHead>
                                                      );
                                                    })}
                                                  </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                  {allDays.map((day) => (
                                                    <TableRow key={day}>
                                                      <TableCell className="align-top text-sm font-semibold text-slate-900 dark:text-slate-100">
                                                        {day}
                                                      </TableCell>
                                                      {orderedSlots.map((slot) => {
                                                        const slotKey = `${slot.startTime}::${slot.endTime}`;
                                                        const cellKey = `${day}::${slotKey}`;
                                                        const items = slotAssignments.get(cellKey) || [];

                                                        return (
                                                          <TableCell key={cellKey} className="align-top">
                                                            {items.length === 0 ? (
                                                              <span className="text-xs text-muted-foreground">-</span>
                                                            ) : (
                                                              <div className="space-y-2">
                                                                {items.map((item) => (
                                                                  <div key={item.assignmentId} className="rounded-md border border-border/80 bg-muted/40 p-2">
                                                                    <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                                                                      {item.subjectName}
                                                                    </p>
                                                                    <p className="text-[11px] text-slate-700 dark:text-slate-300">
                                                                      {item.batchName || item.batchId}
                                                                    </p>
                                                                    <p className="text-[11px] text-slate-700 dark:text-slate-300">{item.teacherName}</p>
                                                                    <p className="text-[11px] text-slate-600 dark:text-slate-400">{item.roomName}</p>
                                                                  </div>
                                                                ))}
                                                              </div>
                                                            )}
                                                          </TableCell>
                                                        );
                                                      })}
                                                    </TableRow>
                                                  ))}
                                                </TableBody>
                                              </Table>
                                            </div>
                                          );
                                        })()}
                                      </TabsContent>
                                    ))}
                                  </Tabs>
                                </CardContent>
                              </Card>
                            </TabsContent>
                          ))}
                        </Tabs>
                      )}
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
