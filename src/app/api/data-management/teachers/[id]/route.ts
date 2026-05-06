import { NextRequest, NextResponse } from 'next/server';
import { ensureApiAuth } from '@/lib/auth/api';
import { Teacher } from '@/lib/db/models';
import { TeacherSchema } from '@/lib/validation/data-management';
import { ZodError } from 'zod';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const unauthorized = await ensureApiAuth(request);
    if (unauthorized) {
      return unauthorized;
    }

    const { id } = await params;

    const teacher = await Teacher.findOne({ teacherId: id });

    if (!teacher) {
      return NextResponse.json(
        { success: false, message: 'Teacher not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: teacher }, { status: 200 });
  } catch (error) {
    console.error('Error fetching teacher:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch teacher' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const unauthorized = await ensureApiAuth(request);
    if (unauthorized) {
      return unauthorized;
    }

    const { id } = await params;
    const body = await request.json();

    const validatedData = TeacherSchema.parse(body);

    const updatedTeacher = await Teacher.findOneAndUpdate(
      { teacherId: id },
      validatedData,
      { new: true, runValidators: true }
    );

    if (!updatedTeacher) {
      return NextResponse.json(
        { success: false, message: 'Teacher not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: true, message: 'Teacher updated successfully', data: updatedTeacher },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { success: false, message: 'Validation failed', errors: error.issues },
        { status: 400 }
      );
    }
    console.error('Error updating teacher:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to update teacher' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const unauthorized = await ensureApiAuth(request);
    if (unauthorized) {
      return unauthorized;
    }

    const { id } = await params;

    const deletedTeacher = await Teacher.findOneAndDelete({ teacherId: id });

    if (!deletedTeacher) {
      return NextResponse.json(
        { success: false, message: 'Teacher not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: true, message: 'Teacher deleted successfully', data: deletedTeacher },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error deleting teacher:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to delete teacher' },
      { status: 500 }
    );
  }
}
