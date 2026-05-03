import { NextRequest, NextResponse } from 'next/server';
import { Room } from '@/lib/db/models';
import { RoomSchema, parsePaginationQuery } from '@/lib/validation/data-management';
import { ZodError } from 'zod';

// Helper function to validate pagination
function validatePagination(searchParams: URLSearchParams) {
  return parsePaginationQuery(searchParams);
}

// GET - Fetch rooms with pagination and search
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

    const { page, limit, search, sortBy = 'roomId', sortOrder = 'asc' } = pagination;

    // Build query filter
    const filter: any = {};
    if (search) {
      filter.$or = [
        { roomId: { $regex: search, $options: 'i' } },
        { roomName: { $regex: search, $options: 'i' } },
        { type: { $regex: search, $options: 'i' } },
      ];
    }

    // Count total documents
    const total = await Room.countDocuments(filter);

    // Fetch paginated results
    const rooms = await Room.find(filter)
      .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    return NextResponse.json(
      {
        success: true,
        data: rooms,
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
    console.error('Error fetching rooms:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch rooms' },
      { status: 500 }
    );
  }
}

// POST - Create a new room
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate request body
    const validatedData = RoomSchema.parse(body);

    // Check if room already exists
    const existingRoom = await Room.findOne({ roomId: validatedData.roomId });
    if (existingRoom) {
      return NextResponse.json(
        { success: false, message: 'Room with this ID already exists' },
        { status: 409 }
      );
    }

    // Create new room
    const newRoom = await Room.create(validatedData);

    return NextResponse.json(
      { success: true, message: 'Room created successfully', data: newRoom },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { success: false, message: 'Validation failed', errors: error.issues },
        { status: 400 }
      );
    }
    console.error('Error creating room:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to create room' },
      { status: 500 }
    );
  }
}
