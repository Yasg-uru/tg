import mongoose, { Schema, type Document } from 'mongoose';

export interface IGeneratedTimetable extends Document {
  generationId: string;
  status: 'draft' | 'published' | 'failed';
  provider: string;
  aiModel: string;
  request: Record<string, unknown>;
  plan: Record<string, unknown>;
  assignments: Array<Record<string, unknown>>;
  validation: Record<string, unknown>;
  score: Record<string, unknown>;
  summary: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const generatedTimetableSchema = new Schema<IGeneratedTimetable>(
  {
    generationId: { type: String, required: true, unique: true, index: true },
    status: { type: String, required: true, default: 'draft' },
    provider: { type: String, required: true },
    aiModel: { type: String, required: true },
    request: { type: Schema.Types.Mixed, required: true },
    plan: { type: Schema.Types.Mixed, required: true },
    assignments: [{ type: Schema.Types.Mixed }],
    validation: { type: Schema.Types.Mixed, required: true },
    score: { type: Schema.Types.Mixed, required: true },
    summary: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true }
);

export const GeneratedTimetable =
  mongoose.models.GeneratedTimetable ||
  mongoose.model<IGeneratedTimetable>(
    'GeneratedTimetable',
    generatedTimetableSchema
  );