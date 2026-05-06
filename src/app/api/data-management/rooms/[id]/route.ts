import { NextRequest, NextResponse } from 'next/server';
import { ensureApiAuth } from '@/lib/auth/api';
import { Room } from '@/lib/db/models';
import { RoomSchema } from '@/lib/validation/data-management';
import { ZodError } from 'zod';

// GET - Fetch a specific room
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

    const room = await Room.findOne({ roomId: id });

    if (!room) {
      return NextResponse.json(
        { success: false, message: 'Room not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: room }, { status: 200 });
  } catch (error) {
    console.error('Error fetching room:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch room' },
      { status: 500 }
    );
  }
}

// PUT - Update a room
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

    // Validate request body
    const validatedData = RoomSchema.parse(body);

    // Find and update room
    const updatedRoom = await Room.findOneAndUpdate(
      { roomId: id },
      validatedData,
      { new: true, runValidators: true }
    );

    if (!updatedRoom) {
      return NextResponse.json(
        { success: false, message: 'Room not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: true, message: 'Room updated successfully', data: updatedRoom },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { success: false, message: 'Validation failed', errors: error.issues },
        { status: 400 }
      );
    }
    console.error('Error updating room:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to update room' },
      { status: 500 }
    );
  }
}

// DELETE - Delete a room
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

    const deletedRoom = await Room.findOneAndDelete({ roomId: id });

    if (!deletedRoom) {
      return NextResponse.json(
        { success: false, message: 'Room not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: true, message: 'Room deleted successfully', data: deletedRoom },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error deleting room:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to delete room' },
      { status: 500 }
    );
  }
}
