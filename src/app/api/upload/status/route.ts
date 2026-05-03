import { NextResponse } from 'next/server';

import { dbConnect } from '@/lib/db/connection';
import {
  AcademicCalendar,
  Batch,
  Constraint,
  ElectiveGroup,
  LabBatch,
  Room,
  Subject,
  SubjectRoomMapping,
  Teacher,
  Timeslot,
} from '@/lib/db/models';

const REQUIRED_DATASETS = [
  { key: 'batches', fileName: 'batches.csv', label: 'Batches', model: Batch },
  { key: 'subjects', fileName: 'subjects.csv', label: 'Subjects', model: Subject },
  { key: 'teachers', fileName: 'teachers.csv', label: 'Teachers', model: Teacher },
  { key: 'rooms', fileName: 'rooms.csv', label: 'Rooms', model: Room },
  { key: 'timeslots', fileName: 'timeslots.csv', label: 'Timeslots', model: Timeslot },
  { key: 'subject_room_mapping', fileName: 'subject_room_mapping.csv', label: 'Subject-Room Mapping', model: SubjectRoomMapping },
  { key: 'constraints', fileName: 'constraints.csv', label: 'Constraints', model: Constraint },
  { key: 'lab_batches', fileName: 'lab_batches.csv', label: 'Lab Batches', model: LabBatch },
  { key: 'academic_calendar', fileName: 'academic_calendar.csv', label: 'Academic Calendar', model: AcademicCalendar },
  { key: 'elective_groups', fileName: 'elective_groups.csv', label: 'Elective Groups', model: ElectiveGroup },
] as const;

export async function GET() {
  try {
    await dbConnect();

    const counts = await Promise.all(
      REQUIRED_DATASETS.map(async (dataset) => {
        const count = await dataset.model.countDocuments({});
        return {
          key: dataset.key,
          label: dataset.label,
          fileName: dataset.fileName,
          count,
          uploaded: count > 0,
        };
      })
    );

    const missing = counts.filter((dataset) => !dataset.uploaded);

    return NextResponse.json(
      {
        success: true,
        data: {
          required: counts,
          allUploaded: missing.length === 0,
          missing,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    return NextResponse.json(
      {
        success: false,
        message: 'Failed to fetch upload readiness status',
        errors: [message],
      },
      { status: 500 }
    );
  }
}
