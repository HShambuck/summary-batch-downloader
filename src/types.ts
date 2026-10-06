export interface CatalogItem {
  id: string; // Unique hash or URL slug
  title: string;
  url: string;
  competency: string;
  contentType: 'book-summary' | 'webinar';
  pdfUrl?: string;
  mp3Url?: string;
  status: 'pending' | 'downloading' | 'completed' | 'failed' | 'skipped';
}

export interface QueueDownloadItem {
  id: string;
  title: string;
  competency: string;
  type: 'PDF' | 'Audio';
  ext: 'pdf' | 'mp3';
  url: string;
}

export interface DownloadFilter {
  selectedCompetencies: string[];
  contentType: 'all' | 'book-summary' | 'webinar';
  includePdf: boolean;
  includeMp3: boolean;
  skipDownloaded: boolean;
  searchQuery: string;
}

export interface LogEntry {
  timestamp: string;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
}

export interface StorageState {
  catalog?: CatalogItem[];
  queue?: QueueDownloadItem[];
  completedCount?: number;
  totalCount?: number;
  isRunning?: boolean;
  currentDownloadingItem?: string;
  logs?: LogEntry[];
  downloadedIds?: string[]; // Anti-duplication set
}