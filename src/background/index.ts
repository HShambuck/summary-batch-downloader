import type { DownloadItem, ExtensionMessage } from '../types';

console.log('[Summary.com Background Worker] Initialized.');

let downloadQueue: DownloadItem[] = [];
let isDownloading = false;
let activeDownloadId: number | null = null;
let currentItem: DownloadItem | null = null;

function processNextInQueue() {
  if (!isDownloading || downloadQueue.length === 0) {
    isDownloading = false;
    activeDownloadId = null;
    currentItem = null;
    console.log('[Background Worker] Download queue finished or paused.');
    return;
  }

  currentItem = downloadQueue.shift() || null;
  if (!currentItem) return;

  currentItem.status = 'downloading';
  broadcastProgress(currentItem.id, 'downloading', 0);

  chrome.downloads.download(
    {
      url: currentItem.downloadUrl,
      filename: currentItem.filename,
      conflictAction: 'uniquify',
      saveAs: false
    },
    (downloadId) => {
      if (chrome.runtime.lastError || !downloadId) {
        const errorMsg = chrome.runtime.lastError?.message || 'Download initiation failed';
        console.error(`[Background Worker] Download failed for ${currentItem?.title}:`, errorMsg);
        
        if (currentItem) {
          currentItem.status = 'failed';
          currentItem.error = errorMsg;
          broadcastProgress(currentItem.id, 'failed', 0, errorMsg);
        }
        
        processNextInQueue();
      } else {
        activeDownloadId = downloadId;
      }
    }
  );
}

function broadcastProgress(id: string, status: DownloadItem['status'], progress: number, error?: string) {
  const message: ExtensionMessage = {
    type: 'DOWNLOAD_PROGRESS',
    payload: { id, status, progress, error }
  };

  chrome.runtime.sendMessage(message).catch(() => {
    // Suppress errors when UI context is unmounted
  });
}

// Track download progress safely across Chrome DownloadDelta fields
chrome.downloads.onChanged.addListener((delta: chrome.downloads.DownloadDelta) => {
  if (!activeDownloadId || delta.id !== activeDownloadId || !currentItem) return;

  if (delta.fileSize && delta.fileSize.current && delta.fileSize.current > 0) {
    // Estimate or monitor file size progression
    broadcastProgress(currentItem.id, 'downloading', 50);
  }

  if (delta.state) {
    if (delta.state.current === 'complete') {
      console.log(`[Background Worker] Finished: ${currentItem.title}`);
      broadcastProgress(currentItem.id, 'completed', 100);
      processNextInQueue();
    } else if (delta.state.current === 'interrupted') {
      const errorMsg = delta.error?.current || 'Download interrupted';
      console.error(`[Background Worker] Interrupted: ${currentItem.title}`, errorMsg);
      broadcastProgress(currentItem.id, 'failed', 0, errorMsg);
      processNextInQueue();
    }
  }
});

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (message.type === 'START_BATCH_DOWNLOAD') {
    downloadQueue = [...message.payload];
    isDownloading = true;
    console.log(`[Background Worker] Starting batch download of ${downloadQueue.length} items.`);
    
    if (!activeDownloadId) {
      processNextInQueue();
    }
    
    sendResponse({ status: 'started' });
  }

  if (message.type === 'PAUSE_DOWNLOADS') {
    isDownloading = false;
    if (activeDownloadId) {
      chrome.downloads.cancel(activeDownloadId);
    }
    sendResponse({ status: 'paused' });
  }

  if (message.type === 'CANCEL_DOWNLOADS') {
    isDownloading = false;
    downloadQueue = [];
    if (activeDownloadId) {
      chrome.downloads.cancel(activeDownloadId);
    }
    sendResponse({ status: 'cancelled' });
  }

  return true;
});