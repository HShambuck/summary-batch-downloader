const DOWNLOAD_DELAY_MS = 2500;

interface QueueItem {
  title: string;
  category: string;
  type: 'PDF' | 'Audio';
  ext: string;
  url: string;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'START_QUEUE') {
    processQueue(message.items);
    sendResponse({ status: 'Queue started' });
  } else if (message.action === 'GET_PROGRESS') {
    chrome.storage.local.get(['queue', 'completedCount', 'totalCount', 'isRunning'], (data) => {
      sendResponse(data);
    });
    return true;
  }
});

async function processQueue(items: QueueItem[]) {
  await chrome.storage.local.set({
    queue: items,
    totalCount: items.length,
    completedCount: 0,
    isRunning: true,
  });

  for (let i = 0; i < items.length; i++) {
    const state = await chrome.storage.local.get(['isRunning']);
    if (!state.isRunning) break;

    const item = items[i];
    try {
      await downloadItem(item);
    } catch (err) {
      console.error(`Failed to download: ${item.title}`, err);
    }

    await chrome.storage.local.set({ completedCount: i + 1 });

    if (i < items.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, DOWNLOAD_DELAY_MS));
    }
  }

  await chrome.storage.local.set({ isRunning: false });
}

function downloadItem(item: QueueItem): Promise<number> {
  return new Promise((resolve, reject) => {
    const cleanCategory = sanitizeName(item.category || 'Uncategorized');
    const cleanTitle = sanitizeName(item.title);
    const filename = `Summary.com/${cleanCategory}/${item.type}/${cleanTitle}.${item.ext}`;

    chrome.downloads.download(
      {
        url: item.url,
        filename: filename,
        conflictAction: 'overwrite',
      },
      (downloadId) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(downloadId ?? 0);
        }
      }
    );
  });
}

function sanitizeName(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, '_').trim();
}