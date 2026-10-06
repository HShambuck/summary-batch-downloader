export type ContentType = 'summary' | 'webinar' | 'all';
export type DownloadStatus = 'pending' | 'downloading' | 'completed' | 'failed' | 'skipped';

export interface DownloadItem {
  id: string;
  title: string;
  authorOrSpeaker?: string;
  type: ContentType;
  contentType?: ContentType;
  category: string;
  competency: string; // Required for indexing and filtering
  downloadUrl: string;
  pdfUrl?: string;
  mp3Url?: string;
  fileType: 'pdf' | 'mp3';
  status: DownloadStatus;
  progress?: number;
  error?: string;
  filename?: string;
}

export type CatalogItem = DownloadItem;

export interface ScrapingProgress {
  scrapedCount: number;
  isScanning: boolean;
  currentCategory?: string;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  message: string;
  level?: 'info' | 'warn' | 'error' | 'success';
  type?: 'info' | 'warn' | 'error' | 'success';
}

export interface DownloadFilter {
  selectedCompetencies: string[];
  contentType: ContentType;
  includePdf: boolean;
  includeMp3: boolean;
  skipDownloaded: boolean;
  searchQuery: string;
  categories?: string[];
  status?: DownloadStatus | 'all';
}

export interface StorageState {
  catalog?: DownloadItem[];
  catalogItems?: DownloadItem[];
  downloadQueue?: DownloadItem[];
  isRunning?: boolean;
  isScrapeActive?: boolean;
  isDownloadActive?: boolean;
  completedCount?: number;
  totalCount?: number;
  logs?: LogEntry[];
}

export type ExtensionMessage =
  | { type: 'START_SCRAPE' }
  | { type: 'SCRAPE_COMPLETED'; payload: DownloadItem[] }
  | { type: 'START_BATCH_DOWNLOAD'; payload: DownloadItem[] }
  | { type: 'PAUSE_DOWNLOADS' }
  | { type: 'CANCEL_DOWNLOADS' }
  | { type: 'DOWNLOAD_PROGRESS'; payload: { id: string; status: DownloadStatus; progress: number; error?: string } };