'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DataTable, type Column } from '@/components/data-management/data-table';
import { RoomDialog } from '@/components/data-management/room-dialog';
import { RoomRecord, SubjectRecord, TeacherRecord } from '@/lib/services/timetable/types';

export function DataManagementPage() {
  const [activeTab, setActiveTab] = useState('rooms');
  const [roomDialogOpen, setRoomDialogOpen] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<RoomRecord | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Room Columns
  const roomColumns: Column<RoomRecord>[] = [
    { key: 'roomId', label: 'Room ID' },
    { key: 'roomName', label: 'Name' },
    { key: 'type', label: 'Type' },
    {
      key: 'capacity',
      label: 'Capacity',
      render: (value) => (
        <span className="inline-flex items-center justify-center px-2 py-1 rounded-full bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 text-sm font-medium">
          {value} seats
        </span>
      ),
    },
    {
      key: 'availableDays',
      label: 'Days',
      render: (value: string[]) => (
        <span className="text-sm">{value.slice(0, 2).join(', ')}...</span>
      ),
    },
    {
      key: 'hasComputers',
      label: 'Computers',
      render: (value: boolean) => (
        <span className={value ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}>
          {value ? '✓' : '-'}
        </span>
      ),
    },
  ];

  // Subject Columns
  const subjectColumns: Column<SubjectRecord>[] = [
    { key: 'subjectCode', label: 'Code' },
    { key: 'subjectName', label: 'Name' },
    { key: 'branch', label: 'Branch' },
    {
      key: 'year',
      label: 'Year',
      render: (value) => `Year ${value}`,
    },
    {
      key: 'semester',
      label: 'Semester',
      render: (value) => `Sem ${value}`,
    },
    {
      key: 'type',
      label: 'Type',
      render: (value: string) => (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-400">
          {value}
        </span>
      ),
    },
    {
      key: 'credits',
      label: 'Credits',
      render: (value) => (
        <span className="font-semibold">{value}</span>
      ),
    },
  ];

  // Teacher Columns
  const teacherColumns: Column<TeacherRecord>[] = [
    { key: 'teacherId', label: 'ID' },
    { key: 'name', label: 'Name' },
    {
      key: 'maxHrsPerDay',
      label: 'Max Hrs/Day',
      render: (value) => `${value}h`,
    },
    {
      key: 'maxHrsPerWeek',
      label: 'Max Hrs/Week',
      render: (value) => `${value}h`,
    },
    {
      key: 'subjectCodes',
      label: 'Subjects',
      render: (value: string[]) => (
        <span className="text-sm">{value.length} subject{value.length !== 1 ? 's' : ''}</span>
      ),
    },
  ];

  const handleEditRoom = (room: RoomRecord) => {
    setSelectedRoom(room);
    setRoomDialogOpen(true);
  };

  const handleCreateRoom = () => {
    setSelectedRoom(null);
    setRoomDialogOpen(true);
  };

  const handleRoomSuccess = () => {
    setRefreshKey((prev) => prev + 1);
  };

  return (
    <div className="min-h-screen bg-background p-4 sm:p-8">
      <div className="mx-auto max-w-7xl space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-4xl font-bold text-foreground">
            Data Management
          </h1>
          <p className="text-muted-foreground">
            Manage all your academic data including rooms, subjects, teachers, and more
          </p>
        </div>

        {/* Tabs */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle>Entities</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="rooms">Rooms</TabsTrigger>
                <TabsTrigger value="subjects">Subjects</TabsTrigger>
                <TabsTrigger value="teachers">Teachers</TabsTrigger>
                <TabsTrigger value="batches">Batches</TabsTrigger>
              </TabsList>

              {/* Rooms Tab */}
              <TabsContent value="rooms" className="space-y-4 mt-6">
                <DataTable
                  key={`rooms-${refreshKey}`}
                  columns={roomColumns}
                  endpoint="/api/data-management/rooms"
                  title="Rooms"
                  entityName="Room"
                  idField="roomId"
                  onEdit={handleEditRoom}
                  onDelete={async (room) => {
                    const response = await fetch(`/api/data-management/rooms/${room.roomId}`, {
                      method: 'DELETE',
                    });
                    if (!response.ok) throw new Error('Failed to delete');
                    handleRoomSuccess();
                  }}
                  onCreate={handleCreateRoom}
                />
              </TabsContent>

              {/* Subjects Tab */}
              <TabsContent value="subjects" className="space-y-4 mt-6">
                <DataTable
                  key={`subjects-${refreshKey}`}
                  columns={subjectColumns}
                  endpoint="/api/data-management/subjects"
                  title="Subjects"
                  entityName="Subject"
                  idField="subjectCode"
                />
              </TabsContent>

              {/* Teachers Tab */}
              <TabsContent value="teachers" className="space-y-4 mt-6">
                <DataTable
                  key={`teachers-${refreshKey}`}
                  columns={teacherColumns}
                  endpoint="/api/data-management/teachers"
                  title="Teachers"
                  entityName="Teacher"
                  idField="teacherId"
                />
              </TabsContent>

              {/* Batches Tab */}
              <TabsContent value="batches" className="space-y-4 mt-6">
                <div className="flex items-center justify-center py-12">
                  <p className="text-slate-500 dark:text-slate-400">
                    Batch management coming soon...
                  </p>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      {/* Room Dialog */}
      <RoomDialog
        open={roomDialogOpen}
        onOpenChange={setRoomDialogOpen}
        room={selectedRoom}
        onSuccess={handleRoomSuccess}
      />
    </div>
  );
}
