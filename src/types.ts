export interface QueueItem {
  title: string;
  category: string;
  type: 'PDF' | 'Audio';
  ext: 'pdf' | 'mp3';
  url: string;
}

export interface StorageState {
  queue?: QueueItem[];
  completedCount?: number;
  totalCount?: number;
  isRunning?: boolean;
}