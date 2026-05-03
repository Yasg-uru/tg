import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { dbConnect } from '@/lib/db/connection';

/**
 * POST /api/cleanup
 * Cleans up old database collections with stale indexes
 * WARNING: This drops collections! Only use in development.
 */
export async function POST(request: NextRequest) {
  try {
    await dbConnect();

    const collections = ['subjectroommappings', 'labbatches'];
    const results = [];

    for (const collectionName of collections) {
      try {
        await mongoose.connection.dropCollection(collectionName);
        results.push({ collection: collectionName, status: 'dropped' });
      } catch (error: any) {
        if (error.codeName === 'NamespaceNotFound') {
          results.push({ collection: collectionName, status: 'not found' });
        } else {
          results.push({
            collection: collectionName,
            status: 'error',
            error: error.message,
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Cleanup complete',
      results,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        message: 'Cleanup failed',
        error: error.message,
      },
      { status: 500 }
    );
  }
}
