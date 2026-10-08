export type FileType = 'pdf' | 'mp3';
export type ItemStatus = 'pending' | 'downloading' | 'completed' | 'failed';

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
  categories: string[];
  downloadUrl: string;
  pdfUrl?: string;
  mp3Url?: string;
  fileType: FileType;
  status: ItemStatus;
}

export type CatalogIndex = Record<string, CatalogItem>;

export interface DownloadFilter {
  includePdf: boolean;
  includeMp3: boolean;
  skipDownloaded: boolean;
  selectedCompetencies: string[]; // <--- Matching SidebarFilter usage
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