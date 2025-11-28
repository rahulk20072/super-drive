export type FileType = 'image' | 'text' | 'pdf' | 'video' | 'audio' | 'other';

export interface AIAnalysis {
  summary: string;
  tags: string[];
  isAnalyzing: boolean;
}

export interface DriveFile {
  id: string;
  name: string;
  type: FileType;
  mimeType: string;
  size: number;
  uploadDate: number; // timestamp
  data: string; // base64
  notes: string;
  aiData?: AIAnalysis;
}

export type SortOption = 'date-desc' | 'date-asc' | 'name-asc' | 'name-desc' | 'size-desc';

export interface FilterState {
  search: string;
  type: FileType | 'all';
  dateRange: 'all' | 'today' | 'week' | 'month';
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  photoName?: string;
  createdAt: number;
  lastLogin: number;
}