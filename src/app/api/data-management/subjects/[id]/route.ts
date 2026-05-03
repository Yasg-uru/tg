import { NextRequest, NextResponse } from 'next/server';
import { Subject } from '@/lib/db/models';
import { SubjectSchema } from '@/lib/validation/data-management';
import { ZodError } from 'zod';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const subject = await Subject.findOne({ subjectCode: id });

    if (!subject) {
      return NextResponse.json(
        { success: false, message: 'Subject not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: subject }, { status: 200 });
  } catch (error) {
    console.error('Error fetching subject:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch subject' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const validatedData = SubjectSchema.parse(body);

    const updatedSubject = await Subject.findOneAndUpdate(
      { subjectCode: id },
      validatedData,
      { new: true, runValidators: true }
    );

    if (!updatedSubject) {
      return NextResponse.json(
        { success: false, message: 'Subject not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: true, message: 'Subject updated successfully', data: updatedSubject },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { success: false, message: 'Validation failed', errors: error.issues },
        { status: 400 }
      );
    }
    console.error('Error updating subject:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to update subject' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const deletedSubject = await Subject.findOneAndDelete({ subjectCode: id });

    if (!deletedSubject) {
      return NextResponse.json(
        { success: false, message: 'Subject not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: true, message: 'Subject deleted successfully', data: deletedSubject },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error deleting subject:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to delete subject' },
      { status: 500 }
    );
  }
}
