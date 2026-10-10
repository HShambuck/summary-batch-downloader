import type {
  DownloadJob,
  ExtensionMessage,
  FileState,
  FileType,
  ItemDownloadState,
  LogEntry,
} from '../types';

type Links = Partial<Record<FileType, string>>;
type DownloadStateMap = Record<string, ItemDownloadState>;

const ROOT_FOLDER = 'Soundview Summaries';
const DEFAULT_AUTHOR = 'Soundview Executive';
const DELAY_MS = 800; // pause between books, to be gentle on the site
const DELAY_JITTER_MS = 700;
const DOWNLOAD_TIMEOUT_MS = 15 * 60 * 1000;

let loopActive = false;
let activeDownloadId: number | null = null;
// File names we want, keyed by download URL, so the browser can't swap in the site's own file name
const plannedNames = new Map<string, string>();

console.log('[Summary.com Background Worker] Initialized.');

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/* ───────── Storage helpers ───────── */

function storageGet<T>(keys: string[]): Promise<T> {
  return new Promise((resolve) => chrome.storage.local.get(keys, (r) => resolve(r as T)));
}
function storageSet(obj: Record<string, unknown>): Promise<void> {
  return new Promise((resolve) => chrome.storage.local.set(obj, () => resolve()));
}
// Session storage survives the worker being restarted, but not a browser restart
function sessionGet<T>(keys: string[]): Promise<T> {
  return new Promise((resolve) => chrome.storage.session.get(keys, (r) => resolve(r as T)));
}
function sessionSet(obj: Record<string, unknown>): Promise<void> {
  return new Promise((resolve) => chrome.storage.session.set(obj, () => resolve()));
}

async function appendLog(message: string, level: LogEntry['level'] = 'info'): Promise<void> {
  const data = await storageGet<{ logs?: LogEntry[] }>(['logs']);
  const logs = data.logs || [];
  logs.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toLocaleTimeString(),
    message,
    level,
  });
  await storageSet({ logs: logs.slice(-300) });
}

// All download-state writes go through one chain so they never overwrite each other
let writeChain: Promise<void> = Promise.resolve();
function updateStates(mutator: (map: DownloadStateMap) => void): Promise<void> {
  writeChain = writeChain
    .then(async () => {
      const data = await storageGet<{ downloadState?: DownloadStateMap }>(['downloadState']);
      const map = data.downloadState || {};
      mutator(map);
      await storageSet({ downloadState: map });
    })
    .catch(() => undefined);
  return writeChain;
}

function setFileState(id: string, kind: FileType, state: FileState): Promise<void> {
  return updateStates((map) => {
    const current: ItemDownloadState = { ...map[id] };
    current[kind] = state;
    map[id] = current;
  });
}

/* ───────── Reading a book page ───────── */

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { credentials: 'include' });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

// The worker has no DOM parser, so read the download links with a pattern
function parseDownloadLinks(html: string, base: string): Links {
  const links: Links = {};
  for (const tag of html.match(/<a\b[^>]*>/gi) || []) {
    if (!/class\s*=\s*"[^"]*\bdownload\b/i.test(tag)) continue;
    const type = /data-type\s*=\s*"([^"]+)"/i.exec(tag)?.[1]?.toLowerCase();
    const href = /href\s*=\s*"([^"]+)"/i.exec(tag)?.[1];
    if ((type === 'pdf' || type === 'mp3') && href && !links[type]) {
      try {
        links[type] = new URL(href.replace(/&amp;/g, '&'), base).href;
      } catch {
        /* ignore a malformed link */
      }
    }
  }
  return links;
}

// Fallback: ask an open summary.com tab to read the page with its own login session
async function resolveViaTab(url: string): Promise<Links | null> {
  const tabs = await new Promise<chrome.tabs.Tab[]>((resolve) =>
    chrome.tabs.query({ url: '*://*.summary.com/*' }, resolve)
  );
  for (const tab of tabs) {
    if (!tab.id) continue;
    const links = await new Promise<Links | null>((resolve) =>
      chrome.tabs.sendMessage(tab.id as number, { type: 'RESOLVE_LINKS', payload: { url } }, (res) => {
        if (chrome.runtime.lastError) resolve(null);
        else resolve((res && res.links) || null);
      })
    );
    if (links && (links.pdf || links.mp3)) return links;
  }
  return null;
}

async function resolveLinks(url: string): Promise<Links> {
  const html = await fetchText(url);
  const links = html ? parseDownloadLinks(html, url) : {};
  if (links.pdf || links.mp3) return links;
  return (await resolveViaTab(url)) || {};
}

/* ───────── Downloading one file ───────── */

function cleanSegment(text: string, max = 120): string {
  return (
    text
      // eslint-disable-next-line no-control-regex
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[. ]+$/, '')
      .slice(0, max) || 'Untitled'
  );
}

function buildFilename(job: DownloadJob, kind: FileType): string {
  const author = job.author && job.author !== DEFAULT_AUTHOR ? ` - ${job.author}` : '';
  return `${ROOT_FOLDER}/${cleanSegment(job.category)}/${cleanSegment(job.title + author)}.${kind}`;
}

function startDownload(url: string, filename: string): Promise<number> {
  return new Promise((resolve, reject) => {
    chrome.downloads.download(
      { url, filename, conflictAction: 'overwrite', saveAs: false },
      (id) => {
        if (chrome.runtime.lastError || id === undefined) {
          reject(new Error(chrome.runtime.lastError?.message || 'The download did not start'));
        } else {
          resolve(id);
        }
      }
    );
  });
}

function getDownload(id: number): Promise<chrome.downloads.DownloadItem | undefined> {
  return new Promise((resolve) => chrome.downloads.search({ id }, (items) => resolve(items[0])));
}

function waitForDownload(id: number): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    let finished = false;
    const finish = (result: { ok: boolean; error?: string }) => {
      if (finished) return;
      finished = true;
      chrome.downloads.onChanged.removeListener(onChanged);
      clearTimeout(timer);
      resolve(result);
    };
    const onChanged = (delta: chrome.downloads.DownloadDelta) => {
      if (delta.id !== id || !delta.state) return;
      if (delta.state.current === 'complete') finish({ ok: true });
      else if (delta.state.current === 'interrupted') {
        finish({ ok: false, error: delta.error?.current || 'Download interrupted' });
      }
    };
    const timer = setTimeout(() => {
      chrome.downloads.cancel(id);
      finish({ ok: false, error: 'Timed out' });
    }, DOWNLOAD_TIMEOUT_MS);

    chrome.downloads.onChanged.addListener(onChanged);
    // It may already have finished before the listener was attached
    getDownload(id).then((item) => {
      if (item?.state === 'complete') finish({ ok: true });
      else if (item?.state === 'interrupted') finish({ ok: false, error: item.error || 'Interrupted' });
    });
  });
}

async function downloadFile(url: string, filename: string): Promise<{ ok: boolean; error?: string }> {
  let id: number;
  plannedNames.set(url, filename);
  try {
    id = await startDownload(url, filename);
  } catch (err) {
    plannedNames.delete(url);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  activeDownloadId = id;
  const result = await waitForDownload(id);
  activeDownloadId = null;
  plannedNames.delete(url);

  if (result.ok) {
    const item = await getDownload(id);
    if (item?.mime?.startsWith('text/html')) {
      chrome.downloads.removeFile(id, () => void chrome.runtime.lastError);
      return { ok: false, error: 'Received a web page instead of the file (is your login still active?)' };
    }
  }
  return result;
}

/* ───────── Processing the queue ───────── */

async function isRunning(): Promise<boolean> {
  return (await storageGet<{ isRunning?: boolean }>(['isRunning'])).isRunning === true;
}

async function failJob(job: DownloadJob, reason: string): Promise<void> {
  await updateStates((map) => {
    const current: ItemDownloadState = { ...map[job.id] };
    job.kinds.forEach((kind) => {
      if (current[kind] !== 'completed') current[kind] = 'failed';
    });
    map[job.id] = current;
  });
  await appendLog(`Failed: ${job.title} (${reason})`, 'error');
}

// Returns 'paused' when the batch was paused part-way through this book
async function processJob(job: DownloadJob): Promise<'done' | 'paused'> {
  const links = await resolveLinks(job.id);
  if (!links.pdf && !links.mp3) {
    await failJob(job, 'no download links found on the book page; check that you are logged in to summary.com');
    return 'done';
  }

  for (const kind of job.kinds) {
    if (!(await isRunning())) return 'paused';

    const url = links[kind];
    if (!url) {
      await setFileState(job.id, kind, 'unavailable');
      await appendLog(`${job.title}: no ${kind.toUpperCase()} available`, 'warn');
      continue;
    }

    await setFileState(job.id, kind, 'downloading');
    let result = await downloadFile(url, buildFilename(job, kind));
    if (!result.ok) {
      await sleep(2000); // one retry
      result = await downloadFile(url, buildFilename(job, kind));
    }

    if (result.ok) {
      await setFileState(job.id, kind, 'completed');
      await appendLog(`Downloaded: ${job.title} (${kind.toUpperCase()})`, 'success');
    } else {
      await setFileState(job.id, kind, 'failed');
      await appendLog(`Failed: ${job.title} (${kind.toUpperCase()}): ${result.error}`, 'error');
    }
  }
  return 'done';
}

async function runQueue(): Promise<void> {
  if (loopActive) return;
  loopActive = true;
  try {
    for (;;) {
      const data = await storageGet<{ isRunning?: boolean; downloadQueue?: DownloadJob[] }>([
        'isRunning',
        'downloadQueue',
      ]);
      const queue = data.downloadQueue || [];
      if (!data.isRunning || queue.length === 0) break;

      const job = queue[0];
      let outcome: 'done' | 'paused' = 'done';
      try {
        outcome = await processJob(job);
      } catch (err) {
        await failJob(job, err instanceof Error ? err.message : String(err));
      }
      if (outcome === 'paused') break;

      // The job is finished: take it off the saved queue
      const current = await storageGet<{ downloadQueue?: DownloadJob[] }>(['downloadQueue']);
      await storageSet({ downloadQueue: (current.downloadQueue || []).filter((j) => j.id !== job.id) });
      await sleep(DELAY_MS + Math.random() * DELAY_JITTER_MS);
    }
  } finally {
    loopActive = false;
    const left = (await storageGet<{ downloadQueue?: DownloadJob[] }>(['downloadQueue'])).downloadQueue || [];
    if (left.length === 0) {
      await storageSet({ isRunning: false });
      await sessionSet({ activeBatch: false });
      await appendLog('Download batch finished.', 'success');
    } else if (!(await isRunning())) {
      await sessionSet({ activeBatch: false });
      await appendLog(`Download batch paused. ${left.length} books left in the queue.`, 'warn');
    }
  }
}

/* ───────── Commands from the dashboard ───────── */

async function startBatch(jobs: DownloadJob[]): Promise<void> {
  if (!Array.isArray(jobs) || jobs.length === 0) return;
  await storageSet({ downloadQueue: jobs, isRunning: true });
  await sessionSet({ activeBatch: true });
  await updateStates((map) => {
    jobs.forEach((job) => {
      const current: ItemDownloadState = { ...map[job.id] };
      job.kinds.forEach((kind) => {
        if (current[kind] !== 'downloading') current[kind] = 'pending';
      });
      map[job.id] = current;
    });
  });
  const kinds = Array.from(new Set(jobs.flatMap((j) => j.kinds))).map((k) => k.toUpperCase());
  await appendLog(`Download batch started: ${jobs.length} books (${kinds.join(' + ')}).`);
  void runQueue();
}

async function pauseBatch(): Promise<void> {
  await storageSet({ isRunning: false });
  await sessionSet({ activeBatch: false });
  await appendLog('Pausing after the current file…', 'warn');
}

async function cancelBatch(): Promise<void> {
  await storageSet({ isRunning: false, downloadQueue: [] });
  await sessionSet({ activeBatch: false });
  if (activeDownloadId !== null) chrome.downloads.cancel(activeDownloadId);
  await appendLog('Download batch cancelled.', 'warn');
}

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (message.type === 'START_BATCH_DOWNLOAD') {
    startBatch(message.payload as DownloadJob[]).then(() => sendResponse({ status: 'started' }));
    return true;
  }
  if (message.type === 'PAUSE_DOWNLOADS') {
    pauseBatch().then(() => sendResponse({ status: 'paused' }));
    return true;
  }
  if (message.type === 'CANCEL_DOWNLOADS') {
    cancelBatch().then(() => sendResponse({ status: 'cancelled' }));
    return true;
  }
  return false;
});

/* ───────── Lifecycle ───────── */

// Force our file name (Title - Author.pdf) even if the site's response suggests its own
chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
  const wanted = plannedNames.get(item.url) || plannedNames.get(item.finalUrl);
  if (wanted) suggest({ filename: wanted, conflictAction: 'overwrite' });
  else suggest(); // not ours: keep the default
});

// A browser restart or extension reload ends any running batch; wait for the user to press Start
chrome.runtime.onStartup.addListener(() => {
  void storageSet({ isRunning: false });
});
chrome.runtime.onInstalled.addListener(() => {
  void storageSet({ isRunning: false });
});

// The worker can be stopped and restarted by Chrome mid-batch: pick the queue back up
(async () => {
  const [local, session] = await Promise.all([
    storageGet<{ isRunning?: boolean; downloadQueue?: DownloadJob[] }>(['isRunning', 'downloadQueue']),
    sessionGet<{ activeBatch?: boolean }>(['activeBatch']),
  ]);
  if (local.isRunning && session.activeBatch && (local.downloadQueue || []).length > 0) {
    void runQueue();
  }
})();