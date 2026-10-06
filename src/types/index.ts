export type ContentType = 'summary' | 'webinar';
export type DownloadStatus = 'pending' | 'downloading' | 'completed' | 'failed' | 'skipped';

export interface DownloadItem {
  id: string;
  title: string;
  authorOrSpeaker?: string;
  type: ContentType;
  contentType?: ContentType; // Alias for UI backwards compatibility
  category: string;         // Serves as competency for summaries, topic for webinars
  competency?: string;      // Alias for UI backwards compatibility
  downloadUrl: string;      // Direct PDF or MP3 URL
  pdfUrl?: string;          // Helper property for UI
  mp3Url?: string;          // Helper property for UI
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
  level: 'info' | 'warn' | 'error' | 'success';
  type?: 'info' | 'warn' | 'error' | 'success'; // Alias for UI backwards compatibility
}

export interface DownloadFilter {
  type: ContentType | 'all';
  searchQuery: string;
  categories: string[];
  status: DownloadStatus | 'all';
}

export interface StorageState {
  catalogItems: CatalogItem[];
  downloadQueue: DownloadItem[];
  logs: LogEntry[];
  isScrapeActive: boolean;
  isDownloadActive: boolean;
}

export type ExtensionMessage =
  | { type: 'START_SCRAPE' }
  | { type: 'SCRAPE_COMPLETED'; payload: DownloadItem[] }
  | { type: 'START_BATCH_DOWNLOAD'; payload: DownloadItem[] }
  | { type: 'PAUSE_DOWNLOADS' }
  | { type: 'CANCEL_DOWNLOADS' }
  | { type: 'DOWNLOAD_PROGRESS'; payload: { id: string; status: DownloadStatus; progress: number; error?: string } };