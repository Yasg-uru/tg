import mongoose, { Schema, Document } from 'mongoose';

// Academic Calendar
export interface IAcademicCalendar extends Document {
  eventId: string;
  eventName: string;
  eventType: string;
  startDate: Date;
  endDate: Date;
  affectedBranches: string[];
  affectedYears: number[];
  isHoliday: boolean;
  isExam: boolean;
  isEvent: boolean;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

const academicCalendarSchema = new Schema<IAcademicCalendar>(
  {
    eventId: { type: String, required: true, unique: true, index: true },
    eventName: { type: String, required: true },
    eventType: { type: String, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    affectedBranches: [String],
    affectedYears: [Number],
    isHoliday: { type: Boolean, default: false },
    isExam: { type: Boolean, default: false },
    isEvent: { type: Boolean, default: false },
    description: String,
  },
  { timestamps: true }
);

export const AcademicCalendar =
  mongoose.models.AcademicCalendar ||
  mongoose.model<IAcademicCalendar>('AcademicCalendar', academicCalendarSchema);

// Batches
export interface IBatch extends Document {
  batchId: string;
  batchName: string;
  branch: string;
  year: number;
  semester: number;
  academicYear: string;
  totalStudents: number;
  sections: string;
  labBatchCount: number;
  labBatchSize: number;
  classTeacherId: string;
  classRoom: string;
  semesterType: string;
  startDate: Date;
  endDate: Date;
  examStartDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

const batchesSchema = new Schema<IBatch>(
  {
    batchId: { type: String, required: true, unique: true, index: true },
    batchName: { type: String, required: true },
    branch: { type: String, required: true, index: true },
    year: { type: Number, required: true },
    semester: { type: Number, required: true },
    academicYear: { type: String, required: true },
    totalStudents: { type: Number, required: true },
    sections: { type: String, required: true },
    labBatchCount: { type: Number, required: true },
    labBatchSize: { type: Number, required: true },
    classTeacherId: { type: String, required: true },
    classRoom: { type: String, required: true },
    semesterType: { type: String, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    examStartDate: { type: Date, required: true },
  },
  { timestamps: true }
);

export const Batch =
  mongoose.models.Batch || mongoose.model<IBatch>('Batch', batchesSchema);

// Constraints
export interface IConstraint extends Document {
  constraintId: string;
  constraintType: string;
  priority: string;
  appliesTo: string;
  applyValue: string;
  description?: string;
  rule: string;
  penaltyIfViolated: string;
  createdAt: Date;
  updatedAt: Date;
}

const constraintsSchema = new Schema<IConstraint>(
  {
    constraintId: { type: String, required: true, unique: true, index: true },
    constraintType: { type: String, required: true },
    priority: { type: String, required: true },
    appliesTo: { type: String, required: true },
    applyValue: { type: String, required: true },
    description: String,
    rule: { type: String, required: true },
    penaltyIfViolated: { type: String, required: true },
  },
  { timestamps: true }
);

export const Constraint =
  mongoose.models.Constraint ||
  mongoose.model<IConstraint>('Constraint', constraintsSchema);

// Elective Groups
export interface IElectiveGroup extends Document {
  electiveGroupId: string;
  groupName: string;
  branch: string;
  year: number;
  semester: number;
  offeredSubjectCodes: string[];
  offeredSubjectNames: string[];
  teacherIds: string[];
  maxStudentsPerElective: number;
  registrationDeadline: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const electiveGroupsSchema = new Schema<IElectiveGroup>(
  {
    electiveGroupId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    groupName: { type: String, required: true },
    branch: { type: String, required: true },
    year: { type: Number, required: true },
    semester: { type: Number, required: true },
    offeredSubjectCodes: [String],
    offeredSubjectNames: [String],
    teacherIds: [String],
    maxStudentsPerElective: { type: Number, required: true },
    registrationDeadline: { type: Date, required: true },
    notes: String,
  },
  { timestamps: true }
);

export const ElectiveGroup =
  mongoose.models.ElectiveGroup ||
  mongoose.model<IElectiveGroup>('ElectiveGroup', electiveGroupsSchema);

// Lab Batches
export interface ILabBatch extends Document {
  labBatchId: string;
  parentBatchId: string;
  labBatchName: string;
  branch: string;
  year: number;
  semester: number;
  batchLabel?: string;
  studentCount: number;
  assignedSubjectCodes: string;
  preferredDays?: string;
  preferredSlots?: string;
  assignedRoom?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const labBatchesSchema = new Schema<ILabBatch>(
  {
    labBatchId: { type: String, required: true, unique: true, index: true },
    parentBatchId: { type: String, required: true, index: true },
    labBatchName: { type: String, required: true },
    branch: { type: String, required: true },
    year: { type: Number, required: true },
    semester: { type: Number, required: true },
    batchLabel: String,
    studentCount: { type: Number, required: true },
    assignedSubjectCodes: { type: String, required: true },
    preferredDays: String,
    preferredSlots: String,
    assignedRoom: String,
    notes: String,
  },
  { timestamps: true }
);

export const LabBatch =
  mongoose.models.LabBatch ||
  mongoose.model<ILabBatch>('LabBatch', labBatchesSchema);

// Rooms
export interface IRoom extends Document {
  roomId: string;
  roomName: string;
  building: string;
  floor: string;
  type: string;
  capacity: number;
  hasProjector: boolean;
  hasSmartBoard: boolean;
  hasAC: boolean;
  hasComputers: boolean;
  computerCount: number;
  specialEquipment?: string;
  availableDays: string[];
  notAvailableSlots?: string[];
  wing?: string;
  createdAt: Date;
  updatedAt: Date;
}

const roomsSchema = new Schema<IRoom>(
  {
    roomId: { type: String, required: true, unique: true, index: true },
    roomName: { type: String, required: true },
    building: { type: String, required: true },
    floor: { type: String, required: true },
    type: { type: String, required: true },
    capacity: { type: Number, required: true },
    hasProjector: { type: Boolean, default: false },
    hasSmartBoard: { type: Boolean, default: false },
    hasAC: { type: Boolean, default: false },
    hasComputers: { type: Boolean, default: false },
    computerCount: { type: Number, default: 0 },
    specialEquipment: String,
    availableDays: [String],
    notAvailableSlots: [String],
    wing: String,
  },
  { timestamps: true }
);

export const Room =
  mongoose.models.Room || mongoose.model<IRoom>('Room', roomsSchema);

// Subject Room Mapping
export interface ISubjectRoomMapping extends Document {
  subjectCode: string;
  subjectName: string;
  branch: string;
  preferredRoomIds: string;
  alternateRoomIds?: string;
  requiredEquipment?: string;
  minRoomCapacity?: number;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const subjectRoomMappingSchema = new Schema<ISubjectRoomMapping>(
  {
    subjectCode: { type: String, required: true, unique: true, index: true },
    subjectName: { type: String, required: true },
    branch: { type: String, required: true },
    preferredRoomIds: { type: String, required: true },
    alternateRoomIds: String,
    requiredEquipment: String,
    minRoomCapacity: Number,
    notes: String,
  },
  { timestamps: true }
);

export const SubjectRoomMapping =
  mongoose.models.SubjectRoomMapping ||
  mongoose.model<ISubjectRoomMapping>(
    'SubjectRoomMapping',
    subjectRoomMappingSchema
  );

// Subjects
export interface ISubject extends Document {
  subjectCode: string;
  subjectName: string;
  branch: string;
  year: number;
  semester: number;
  type: string;
  credits: number;
  hoursPerWeek: number;
  theoryHrsPerWeek: number;
  labHrsPerWeek: number;
  teacherId: string;
  coTeacherId?: string;
  isElective: boolean;
  electiveGroup?: string;
  category?: string;
  universityCode?: string;
  hasInternalExam: boolean;
  hasPracticalExam: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const subjectsSchema = new Schema<ISubject>(
  {
    subjectCode: { type: String, required: true, unique: true, index: true },
    subjectName: { type: String, required: true },
    branch: { type: String, required: true, index: true },
    year: { type: Number, required: true },
    semester: { type: Number, required: true },
    type: { type: String, required: true },
    credits: { type: Number, required: true },
    hoursPerWeek: { type: Number, required: true },
    theoryHrsPerWeek: { type: Number, required: true },
    labHrsPerWeek: { type: Number, required: true },
    teacherId: { type: String, required: true, index: true },
    coTeacherId: String,
    isElective: { type: Boolean, default: false },
    electiveGroup: String,
    category: String,
    universityCode: String,
    hasInternalExam: { type: Boolean, default: false },
    hasPracticalExam: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const Subject =
  mongoose.models.Subject || mongoose.model<ISubject>('Subject', subjectsSchema);

// Teachers
export interface ITeacher extends Document {
  teacherId: string;
  name: string;
  designation: string;
  department: string;
  branch: string;
  email: string;
  phone: string;
  specialization?: string;
  subjectCodes: string[];
  maxHrsPerDay: number;
  maxHrsPerWeek: number;
  notAvailable?: string[];
  preferredSlots?: string[];
  cabinNo?: string;
  joiningYear: number;
  createdAt: Date;
  updatedAt: Date;
}

const teachersSchema = new Schema<ITeacher>(
  {
    teacherId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    designation: { type: String, required: true },
    department: { type: String, required: true },
    branch: { type: String, required: true },
    email: { type: String, required: true, unique: true, index: true },
    phone: { type: String, required: true, unique: true },
    specialization: String,
    subjectCodes: [String],
    maxHrsPerDay: { type: Number, required: true },
    maxHrsPerWeek: { type: Number, required: true },
    notAvailable: [String],
    preferredSlots: [String],
    cabinNo: String,
    joiningYear: { type: Number, required: true },
  },
  { timestamps: true }
);

export const Teacher =
  mongoose.models.Teacher ||
  mongoose.model<ITeacher>('Teacher', teachersSchema);

// Timeslots
export interface ITimeslot extends Document {
  slotId: string;
  periodLabel: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  isBreak: boolean;
  breakType?: string;
  isLunchBreak: boolean;
  dayType: string;
  slotOrder: number;
  allowLab: boolean;
  allowTheory: boolean;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const timeslotsSchema = new Schema<ITimeslot>(
  {
    slotId: { type: String, required: true, unique: true, index: true },
    periodLabel: { type: String, required: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    durationMinutes: { type: Number, required: true },
    isBreak: { type: Boolean, default: false },
    breakType: String,
    isLunchBreak: { type: Boolean, default: false },
    dayType: { type: String, required: true },
    slotOrder: { type: Number, required: true, index: true },
    allowLab: { type: Boolean, default: true },
    allowTheory: { type: Boolean, default: true },
    notes: String,
  },
  { timestamps: true }
);

export const Timeslot =
  mongoose.models.Timeslot ||
  mongoose.model<ITimeslot>('Timeslot', timeslotsSchema);

// Auth Users
export interface IAuthUser extends Document {
  email: string;
  name?: string;
  role: 'owner' | 'admin' | 'staff' | 'viewer';
  status: 'active' | 'disabled';
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const authUserSchema = new Schema<IAuthUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      index: true,
      lowercase: true,
      trim: true,
    },
    name: String,
    role: {
      type: String,
      required: true,
      enum: ['owner', 'admin', 'staff', 'viewer'],
      default: 'staff',
    },
    status: {
      type: String,
      required: true,
      enum: ['active', 'disabled'],
      default: 'active',
    },
    lastLoginAt: Date,
  },
  { timestamps: true }
);

export const AuthUser =
  mongoose.models.AuthUser ||
  mongoose.model<IAuthUser>('AuthUser', authUserSchema);

// Auth OTPs
export interface IAuthOtp extends Document {
  email: string;
  codeHash: string;
  purpose: 'signup' | 'login';
  attempts: number;
  maxAttempts: number;
  expiresAt: Date;
  requestIp?: string;
  userAgent?: string;
  consumedAt?: Date;
  consumedReason?: string;
  consumedByIp?: string;
  consumedUserAgent?: string;
  lastAttemptAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const authOtpSchema = new Schema<IAuthOtp>(
  {
    email: { type: String, required: true, index: true, lowercase: true },
    codeHash: { type: String, required: true },
    purpose: { type: String, required: true, enum: ['signup', 'login'] },
    attempts: { type: Number, required: true, default: 0 },
    maxAttempts: { type: Number, required: true },
    expiresAt: { type: Date, required: true, expires: 0 },
    requestIp: String,
    userAgent: String,
    consumedAt: Date,
    consumedReason: String,
    consumedByIp: String,
    consumedUserAgent: String,
    lastAttemptAt: Date,
  },
  { timestamps: true }
);

export const AuthOtp =
  mongoose.models.AuthOtp || mongoose.model<IAuthOtp>('AuthOtp', authOtpSchema);

// Auth Sessions
export interface IAuthSession extends Document {
  sessionId: string;
  userId: mongoose.Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
  lastSeenAt?: Date;
  ip?: string;
  userAgent?: string;
  revokedAt?: Date;
  revokedReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const authSessionSchema = new Schema<IAuthSession>(
  {
    sessionId: { type: String, required: true, unique: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'AuthUser', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true, index: true },
    expiresAt: { type: Date, required: true, expires: 0 },
    lastSeenAt: Date,
    ip: String,
    userAgent: String,
    revokedAt: Date,
    revokedReason: String,
  },
  { timestamps: true }
);

export const AuthSession =
  mongoose.models.AuthSession ||
  mongoose.model<IAuthSession>('AuthSession', authSessionSchema);

// Auth Rate Limits
export interface IAuthRateLimit extends Document {
  key: string;
  count: number;
  resetAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const authRateLimitSchema = new Schema<IAuthRateLimit>(
  {
    key: { type: String, required: true, unique: true, index: true },
    count: { type: Number, required: true },
    resetAt: { type: Date, required: true, expires: 0 },
  },
  { timestamps: true }
);

export const AuthRateLimit =
  mongoose.models.AuthRateLimit ||
  mongoose.model<IAuthRateLimit>('AuthRateLimit', authRateLimitSchema);
