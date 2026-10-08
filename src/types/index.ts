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
  contentType?: 'summary' | 'webinar';
  categories: string[];
  competency?: string;
  downloadUrl: string;
  pdfUrl?: string;
  mp3Url?: string;
  fileType: FileType;
  status: ItemStatus;
  filename?: string;
  error?: string;
}

// Export DownloadItem as an alias for CatalogItem to fix the missing type error
export type DownloadItem = CatalogItem;

export type CatalogIndex = Record<string, CatalogItem>;

export interface DownloadFilter {
  includePdf: boolean;
  includeMp3: boolean;
  skipDownloaded: boolean;
  selectedCategories: string[];
  selectedCompetencies: string[];
  searchQuery: string;
}

export interface StorageState {
  catalogIndex?: CatalogIndex;
  isRunning?: boolean;
  completedCount?: number;
  totalCount?: number;
  logs?: LogEntry[];
}

// Expand message types to include all events used by background script
export type ExtensionMessageType =
  | 'START_SCRAPE'
  | 'START_BATCH'
  | 'PAUSE_BATCH'
  | 'START_BATCH_DOWNLOAD'
  | 'PAUSE_DOWNLOADS'
  | 'CANCEL_DOWNLOADS'
  | 'DOWNLOAD_PROGRESS'
  | 'SCRAPE_COMPLETE';

export interface ExtensionMessage {
  type: ExtensionMessageType;
  payload?: any;
}