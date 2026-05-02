import mongoose from 'mongoose';
import type { MongooseCache } from '@/lib/types/mongoose.d';

const MONGODB_URI = process.env.MONGODB_URI || '';

if (!MONGODB_URI) {
  throw new Error(
    'Please define the MONGODB_URI environment variable inside .env.local'
  );
}

/**
 * Global is used here to maintain a cached connection across hot reloads
 * in development. This prevents connections growing exponentially
 * during API Route usage.
 */
let cached: MongooseCache | undefined = (global as any).mongoose;

if (!cached) {
  cached = (global as any).mongoose = { conn: null, promise: null };
}

export async function dbConnect() {
  if (!cached) {
    cached = (global as any).mongoose = { conn: null, promise: null };
  }

  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
    };

    cached.promise = mongoose
      .connect(MONGODB_URI, opts)
      .then((mongoose) => {
        console.log('[DB] Connected to MongoDB successfully');
        return mongoose;
      })
      .catch((error) => {
        console.error('[DB] MongoDB connection failed:', error);
        throw error;
      });
  }

  try {
    if (!cached) {
      cached = (global as any).mongoose;
    }
    cached!.conn = await cached!.promise!;
  } catch (e) {
    if (cached) {
      cached.promise = null;
    }
    throw e;
  }

  return cached?.conn;
}

export async function dbDisconnect() {
  if (!cached) {
    cached = (global as any).mongoose;
  }

  if (cached?.conn) {
    await cached.conn.disconnect();
    cached.conn = null;
    cached.promise = null;
    console.log('[DB] Disconnected from MongoDB');
  }
}
