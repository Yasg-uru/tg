import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { ensureApiAuth } from '@/lib/auth/api';
import { dbConnect } from '@/lib/db/connection';

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown error';
}

/**
 * POST /api/cleanup
 * Cleans up old database collections with stale indexes
 * WARNING: This drops collections! Only use in development.
 */
export async function POST(request: NextRequest) {
  try {
    const unauthorized = await ensureApiAuth(request);
    if (unauthorized) {
      return unauthorized;
    }

    await dbConnect();

    const collections = ['subjectroommappings', 'labbatches'];
    const results = [];

    for (const collectionName of collections) {
      try {
        await mongoose.connection.dropCollection(collectionName);
        results.push({ collection: collectionName, status: 'dropped' });
      } catch (error: unknown) {
        const codeName =
          typeof error === 'object' && error !== null && 'codeName' in error
            ? (error as { codeName?: string }).codeName
            : undefined;

        if (codeName === 'NamespaceNotFound') {
          results.push({ collection: collectionName, status: 'not found' });
        } else {
          results.push({
            collection: collectionName,
            status: 'error',
            error: getErrorMessage(error),
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Cleanup complete',
      results,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: 'Cleanup failed',
        error: getErrorMessage(error),
      },
      { status: 500 }
    );
  }
}
