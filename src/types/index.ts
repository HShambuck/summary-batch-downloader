export type FileType = 'pdf' | 'mp3';
export type ItemStatus = 'pending' | 'downloading' | 'completed' | 'failed' | 'skipped';

export interface LogEntry {
  id: string;
  timestamp: string;
  message: string;
  level?: 'info' | 'warn' | 'error' | 'success';
  type?: 'info' | 'warn' | 'error' | 'success';
}

export interface CatalogItem {
  id: string; // Canonical URL
  title: string;
  authorOrSpeaker: string;
  type: 'summary' | 'webinar';
  contentType?: 'summary' | 'webinar'; // Legacy compatibility for CatalogTable
  categories: string[];
  competency?: string; // Legacy getter compatibility for single-competency displays
  downloadUrl: string;
  pdfUrl?: string;
  mp3Url?: string;
  fileType: FileType;
  status: ItemStatus;
  filename?: string;
}

export type CatalogIndex = Record<string, CatalogItem>;

export interface DownloadFilter {
  includePdf: boolean;
  includeMp3: boolean;
  skipDownloaded: boolean;
  selectedCategories: string[]; // Standardized category array
  selectedCompetencies?: string[]; // Backwards-compatible alias
  searchQuery: string;
}

export interface StorageState {
  catalogIndex?: CatalogIndex;
  isRunning?: boolean;
  completedCount?: number;
  totalCount?: number;
  logs?: LogEntry[];
}

export interface ExtensionMessage {
  type: 'START_SCRAPE' | 'START_BATCH' | 'PAUSE_BATCH';
  payload?: any;
}