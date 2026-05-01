export type Role = 'admin' | 'teacher' | 'para' | 'editor';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: Role;
  roomNumber?: string;
  status: 'active' | 'inactive';
}

export interface Student {
  id: string;
  firstName: string;
  lastName: string;
  studentId: string;
  roomNumber: string;
  status: 'active' | 'archived';
}

export type TrackingType = 'percentage' | 'frequency' | 'duration';

export type SkillLevel = 'Basic' | 'Intermediate' | 'Advanced';

export interface Objective {
  id: string;
  title: string;
}

export const DOMAIN_OPTIONS = [
  'Reading',
  'Writing',
  'Math',
  'Behavior',
  'Social Emotional',
  'Speech/Language',
  'Adaptive/Life Skills',
  'Motor Skills',
  'Other'
];

export interface Domain {
  id: string;
  name: string;
}

export interface Goal {
  id: string;
  studentId: string;
  title: string;
  domain: string;
  skillLevel?: SkillLevel;
  trackingType: TrackingType;
  masteryCriteria: number;
  objectives: Objective[];
  status: 'active' | 'archived';
}

export interface DataPoint {
  id: string;
  studentId: string;
  goalId: string;
  objId: string;
  value: number;
  timestamp: string; // ISO date string
  recordedBy: string;
  recordedByRole: string;
  actualEntryTimestamp: string; // ISO date string
}

export interface GoalBankItem {
  id: string;
  title: string;
  domain: string;
  skillLevel?: SkillLevel;
  trackingType: TrackingType;
  defaultObjectives: Objective[];
  status: 'pending' | 'approved';
  submittedBy?: string;
  submittedByName?: string;
}
