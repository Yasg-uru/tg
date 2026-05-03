import { NextRequest, NextResponse } from 'next/server';
import { Teacher } from '@/lib/db/models';
import { TeacherSchema, parsePaginationQuery } from '@/lib/validation/data-management';
import { ZodError } from 'zod';

function validatePagination(searchParams: URLSearchParams) {
  return parsePaginationQuery(searchParams);
}

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

    const { page, limit, search, sortBy = 'teacherId', sortOrder = 'asc' } = pagination;

    const filter: any = {};
    if (search) {
      filter.$or = [
        { teacherId: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } },
      ];
    }

    const total = await Teacher.countDocuments(filter);

    const teachers = await Teacher.find(filter)
      .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    return NextResponse.json(
      {
        success: true,
        data: teachers,
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
    console.error('Error fetching teachers:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch teachers' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const validatedData = TeacherSchema.parse(body);

    const existingTeacher = await Teacher.findOne({ teacherId: validatedData.teacherId });
    if (existingTeacher) {
      return NextResponse.json(
        { success: false, message: 'Teacher with this ID already exists' },
        { status: 409 }
      );
    }

    const newTeacher = await Teacher.create(validatedData);

    return NextResponse.json(
      { success: true, message: 'Teacher created successfully', data: newTeacher },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { success: false, message: 'Validation failed', errors: error.issues },
        { status: 400 }
      );
    }
    console.error('Error creating teacher:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to create teacher' },
      { status: 500 }
    );
  }
}
