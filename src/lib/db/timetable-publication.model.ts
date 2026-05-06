import mongoose, { Schema, type Document } from 'mongoose';

export type TimetablePublicationStatus = 'published' | 'unpublished';

export interface ITimetablePublication extends Document {
  key: string;
  branch: string;
  semester: number;
  academicYear?: string;
  status: TimetablePublicationStatus;
  generationId: string;
  createdAt: Date;
  updatedAt: Date;
}

const timetablePublicationSchema = new Schema<ITimetablePublication>(
  {
    key: { type: String, required: true, unique: true, index: true },
    branch: { type: String, required: true, index: true },
    semester: { type: Number, required: true, index: true },
    academicYear: { type: String },
    status: {
      type: String,
      required: true,
      enum: ['published', 'unpublished'],
      default: 'unpublished',
    },
    generationId: { type: String, required: true, index: true },
  },
  { timestamps: true }
);

export const TimetablePublication =
  mongoose.models.TimetablePublication ||
  mongoose.model<ITimetablePublication>(
    'TimetablePublication',
    timetablePublicationSchema
  );
