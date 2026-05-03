import { NextRequest, NextResponse } from 'next/server';
import { Subject } from '@/lib/db/models';
import { SubjectSchema, parsePaginationQuery } from '@/lib/validation/data-management';
import { ZodError } from 'zod';

function validatePagination(searchParams: URLSearchParams) {
  return parsePaginationQuery(searchParams);
}

// GET - Fetch subjects with pagination and search
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const pagination = validatePagination(searchParams);

    if (!pagination) {
      return NextResponse.json(
        { success: false, message: 'Invalid pagination parameters' },
        { status: 400 }
      );
    }

    const { page, limit, search, sortBy = 'subjectCode', sortOrder = 'asc' } = pagination;

    const filter: any = {};
    if (search) {
      filter.$or = [
        { subjectCode: { $regex: search, $options: 'i' } },
        { subjectName: { $regex: search, $options: 'i' } },
        { branch: { $regex: search, $options: 'i' } },
      ];
    }

    const total = await Subject.countDocuments(filter);

    const subjects = await Subject.find(filter)
      .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    return NextResponse.json(
      {
        success: true,
        data: subjects,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error fetching subjects:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch subjects' },
      { status: 500 }
    );
  }
}

// POST - Create a new subject
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const validatedData = SubjectSchema.parse(body);

    const existingSubject = await Subject.findOne({ subjectCode: validatedData.subjectCode });
    if (existingSubject) {
      return NextResponse.json(
        { success: false, message: 'Subject with this code already exists' },
        { status: 409 }
      );
    }

    const newSubject = await Subject.create(validatedData);

    return NextResponse.json(
      { success: true, message: 'Subject created successfully', data: newSubject },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { success: false, message: 'Validation failed', errors: error.issues },
        { status: 400 }
      );
    }
    console.error('Error creating subject:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to create subject' },
      { status: 500 }
    );
  }
}
