'use client';

import { useState, useCallback, useEffect } from 'react';
import { Upload, RefreshCw, Play, Download, AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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

interface GenerationResult {
  success: boolean;
  message: string;
  data?: {
    generationId: string;
    status: 'draft' | 'published';
    provider: string;
    model: string;
    assignments: Array<{
      assignmentId: string;
      day: string;
      slotId: string;
      teacherName: string;
      subjectName: string;
      roomName: string;
      startTime: string;
      endTime: string;
    }>;
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

export function TimetableDashboard() {
  const [tab, setTab] = useState('upload');
  const [batches, setBatches] = useState<Batch[]>([]);
  const [selectedBatches, setSelectedBatches] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generationResult, setGenerationResult] = useState<GenerationResult | null>(null);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Fetch batches on mount
  useEffect(() => {
    fetchBatches();
  }, []);

  const fetchBatches = async () => {
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
  };

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
        
        // Refresh batches after upload
        await fetchBatches();
        
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
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="upload">Upload Data</TabsTrigger>
            <TabsTrigger value="generate">Generate</TabsTrigger>
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

                <div className="text-xs text-muted-foreground space-y-1">
                  <p>• batches.csv - Batch information</p>
                  <p>• subjects.csv - Subject details and credits</p>
                  <p>• teachers.csv - Teacher availability and limits</p>
                  <p>• rooms.csv - Room types and capacities</p>
                  <p>• timeslots.csv - Daily time slots</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Generate Tab */}
          <TabsContent value="generate" className="space-y-4">
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
                    disabled={generating || selectedBatches.length === 0}
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

                {/* Assignments Table */}
                {generationResult.data.assignments.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-slate-900 dark:text-white">Scheduled Sessions</CardTitle>
                      <CardDescription className="text-slate-600 dark:text-slate-400">
                        Showing {generationResult.data.assignments.length} total assignments
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="border-slate-200 dark:border-slate-700 hover:bg-transparent">
                              <TableHead className="text-slate-700 dark:text-slate-300">Day</TableHead>
                              <TableHead className="text-slate-700 dark:text-slate-300">Time</TableHead>
                              <TableHead className="text-slate-700 dark:text-slate-300">Subject</TableHead>
                              <TableHead className="text-slate-700 dark:text-slate-300">Teacher</TableHead>
                              <TableHead className="text-slate-700 dark:text-slate-300">Room</TableHead>
                              <TableHead className="text-slate-700 dark:text-slate-300">Slot</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {generationResult.data.assignments.slice(0, 20).map((a) => (
                              <TableRow key={a.assignmentId} className="border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                <TableCell className="text-sm text-slate-900 dark:text-slate-100">{a.day}</TableCell>
                                <TableCell className="text-sm text-slate-900 dark:text-slate-100">
                                  {a.startTime} - {a.endTime}
                                </TableCell>
                                <TableCell className="text-sm font-medium text-slate-900 dark:text-slate-100">{a.subjectName}</TableCell>
                                <TableCell className="text-sm text-slate-900 dark:text-slate-100">{a.teacherName}</TableCell>
                                <TableCell className="text-sm text-slate-900 dark:text-slate-100">{a.roomName}</TableCell>
                                <TableCell className="text-sm text-slate-900 dark:text-slate-100">{a.slotId}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                      {generationResult.data.assignments.length > 20 && (
                        <p className="text-xs text-slate-600 dark:text-slate-400 mt-4 text-center">
                          ... and {generationResult.data.assignments.length - 20} more assignments
                        </p>
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
