import type { CatalogIndex, CatalogItem, ExtensionMessage, LogEntry } from '../types';

const LIBRARY_PATH = '/book-summaries/';
const MAX_PAGES = 80; // per listing
const MAX_REQUESTS = 1200; // per scan
const MAX_LOAD_MORE = 60;
const FETCH_DELAY_MS = 120;
const SMALL_WORDS = new Set(['and', 'of', 'the', 'in', 'for', 'to', 'a', 'an', 'on']);

interface Competency {
  slug: string;
  name: string; // the site's own label, e.g. "Adversity, Stress & Burnout"
  count: number; // the site's own book count
}

interface ScanProgress {
  complete: boolean; // false while a scan is unfinished, so the next scan resumes it
  done: Record<string, number>; // competency slug -> the site's book count when it was crawled
}

let isScanning = false;
let requestCount = 0;
let learnedPattern = -1; // which "?page=N" style worked, reused across listings

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/* ───────── Storage + activity log ───────── */

function storageGet<T>(keys: string[]): Promise<T> {
  return new Promise((resolve) => chrome.storage.local.get(keys, (r) => resolve(r as T)));
}
function storageSet(obj: Record<string, unknown>): Promise<void> {
  return new Promise((resolve) => chrome.storage.local.set(obj, () => resolve()));
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

/* ───────── Text helpers ───────── */

function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '').trim();
}

function cleanTitle(rawTitle: string): string {
  if (!rawTitle) return '';
  if (rawTitle.includes(' - ')) {
    const parts = rawTitle.split(' - ');
    return parts[parts.length - 1].trim();
  }
  return rawTitle.trim();
}

// "The Power of Habit by Charles Duhigg" -> title + author.
// Only splits when the part after the last " by " looks like a name (2+ words),
// so titles such as "Led by Example" stay whole.
function splitTitleAuthor(raw: string): { title: string; author: string } {
  const idx = raw.lastIndexOf(' by ');
  if (idx > 0) {
    const author = raw.slice(idx + 4).trim();
    if (author.split(/\s+/).length >= 2) return { title: raw.slice(0, idx).trim(), author };
  }
  return { title: raw.trim(), author: '' };
}

// "adversity-stress-burnout" -> "Adversity Stress Burnout" (only used when the site gives no label)
function toTitleCase(slug: string): string {
  return slug
    .replace(/[-_+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .split(' ')
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

// Site names are kept exactly as written; this only trims and removes duplicates
function dedupeCategories(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  list.forEach((raw) => {
    const name = raw.trim();
    const key = name.toLowerCase();
    if (name && !seen.has(key)) {
      seen.add(key);
      out.push(name);
    }
  });
  return out.length > 1 ? out.filter((c) => c !== 'General') : out;
}

function slugsFromUrl(url: string): string[] {
  try {
    return new URL(url, location.href).searchParams
      .getAll('competence')
      .flatMap((v) => v.split(','))
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/* ───────── Competency list (from the site's dropdown) ───────── */

function discoverCompetencies(doc: Document): Competency[] {
  const out: Competency[] = [];
  const seen = new Set<string>();
  doc.querySelectorAll<HTMLAnchorElement>('#dropdown-competencies a[data-slug]').forEach((a) => {
    const slug = (a.getAttribute('data-slug') || '').trim();
    const name = a.querySelector('span')?.textContent?.trim() || '';
    const count = parseInt(a.querySelector('i')?.textContent?.trim() || '', 10);
    if (!slug || !name || seen.has(slug)) return;
    seen.add(slug);
    out.push({ slug, name, count: Number.isNaN(count) ? 0 : count });
  });
  return out;
}

/* ───────── Scraping one document ───────── */

function absoluteUrl(href: string | null, base: string): string {
  try {
    const u = new URL(href || '', base);
    u.hash = '';
    return u.href;
  } catch {
    return '';
  }
}

// Real results live in ul.books-grid. The hidden quote block (.quotes-container)
// also links to books on every page, so it must never be read.
function findCards(doc: Document): HTMLElement[] {
  const grid = Array.from(doc.querySelectorAll<HTMLElement>('ul.books-grid > li'));
  if (grid.length > 0) return grid;

  const items = Array.from(doc.querySelectorAll<HTMLElement>('.item')).filter(
    (el) => !el.closest('.quotes-container')
  );
  if (items.length > 0) return items;

  const cards = new Set<HTMLElement>();
  doc
    .querySelectorAll<HTMLAnchorElement>('a[href*="/book-summary/"], a[href*="/webinar"]')
    .forEach((a) => {
      if (a.closest('.quotes-container, .summary-quote-wrapper')) return;
      const card =
        a.closest<HTMLElement>('li, article, [class*="card"], [class*="item"]') || a.parentElement;
      if (card) cards.add(card);
    });
  return Array.from(cards);
}

// Priority-ordered (a comma selector would hit the empty thumbnail link first)
function extractTitle(node: HTMLElement, anchor: HTMLAnchorElement): string {
  for (const sel of ['strong', 'h2', 'h3', 'h4', '.title']) {
    const t = node.querySelector(sel)?.textContent?.trim();
    if (t && t.length > 1) return t;
  }
  for (const a of Array.from(node.querySelectorAll<HTMLAnchorElement>('a'))) {
    if ((a.getAttribute('href') || '').includes('/author/')) continue;
    const t = a.textContent?.trim();
    if (t && t.length > 1) return t;
  }
  return (
    node.querySelector('img')?.getAttribute('alt')?.trim() ||
    anchor.getAttribute('title')?.trim() ||
    ''
  );
}

// Returns only items not already in `seen`, in on-page order
function scrapeDocument(
  doc: Document,
  pageUrl: string,
  categories: string[],
  seen: Set<string>
): CatalogItem[] {
  const out: CatalogItem[] = [];

  findCards(doc).forEach((node) => {
    const anchor = node.querySelector<HTMLAnchorElement>(
      'a[href*="/book-summary/"], a[href*="/webinar"]'
    );
    if (!anchor) return;
    const href = absoluteUrl(anchor.getAttribute('href'), pageUrl);
    const raw = cleanTitle(extractTitle(node, anchor));
    if (!href || raw.length < 2 || seen.has(href)) return;
    seen.add(href);

    const authorEl = node.querySelector('a[href*="/author/"]')?.textContent?.trim() || '';
    const split = splitTitleAuthor(raw);
    const author = authorEl || split.author || 'Soundview Executive';
    const title =
      authorEl && raw.endsWith(` by ${authorEl}`) ? raw.slice(0, -(authorEl.length + 4)).trim() : split.title;

    const isWebinar = href.includes('/webinar');
    out.push({
      id: href,
      title: sanitizeFilename(title),
      authorOrSpeaker: author,
      type: isWebinar ? 'webinar' : 'summary',
      categories: [...categories],
      downloadUrl: href,
      pdfUrl: isWebinar ? undefined : href,
      mp3Url: isWebinar ? href : undefined,
      fileType: isWebinar ? 'mp3' : 'pdf',
      status: 'pending',
    });
  });

  return out;
}

/* ───────── Fetching + pagination ───────── */

async function fetchDoc(url: string): Promise<Document | null> {
  if (requestCount >= MAX_REQUESTS) throw new Error('Request limit reached for one scan');
  requestCount++;
  // Timers in a background tab are throttled to ~1/min after 5 minutes, so skip the delay there
  if (!document.hidden) await sleep(FETCH_DELAY_MS);
  try {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) return null;
    return new DOMParser().parseFromString(await res.text(), 'text/html');
  } catch {
    return null;
  }
}

function findNextUrl(doc: Document, currentUrl: string): string | null {
  let href = doc.querySelector('a[rel~="next"], link[rel~="next"]')?.getAttribute('href') || '';
  if (!href) {
    const link = Array.from(doc.querySelectorAll<HTMLAnchorElement>('a[href]')).find((a) =>
      /^\s*(next|next page|load more|more)\s*[›»>]?\s*$/i.test(a.textContent || '')
    );
    href = link?.getAttribute('href') || '';
  }
  if (!href || href === '#' || href.startsWith('javascript:')) return null;
  const abs = absoluteUrl(href, currentUrl);
  return abs && new URL(abs).origin === location.origin ? abs : null;
}

// Common pagination URL shapes, tried when the page has no usable "next" link
function pageCandidates(base: string, n: number): string[] {
  const a = new URL(base);
  a.searchParams.set('page', String(n));
  const b = new URL(base);
  b.searchParams.set('paged', String(n));
  const c = new URL(base);
  c.pathname = c.pathname.replace(/\/?$/, '/') + `page/${n}/`;
  return [a.href, b.href, c.href];
}

// Walks every page of one listing in order. Calls onPage with each page's new items.
async function crawlListing(
  startUrl: string,
  categories: string[],
  onPage: (batch: CatalogItem[], pageNo: number) => void,
  firstDoc?: Document | null
): Promise<number> {
  const seen = new Set<string>();
  const visited = new Set<string>([startUrl]);
  let doc = firstDoc ?? (await fetchDoc(startUrl));
  let url = startUrl;
  let pages = 0;

  while (doc && pages < MAX_PAGES) {
    const batch = scrapeDocument(doc, url, categories, seen);
    if (batch.length === 0) break;
    pages++;
    onPage(batch, pages);

    let nextDoc: Document | null = null;
    let nextUrl = findNextUrl(doc, url);
    if (nextUrl && !visited.has(nextUrl)) {
      nextDoc = await fetchDoc(nextUrl);
    } else {
      nextUrl = null;
    }

    if (!nextDoc) {
      const options = pageCandidates(startUrl, pages + 1);
      const order = learnedPattern >= 0 ? [learnedPattern] : options.map((_, i) => i);
      for (const i of order) {
        const candidate = options[i];
        if (visited.has(candidate)) continue;
        const candidateDoc = await fetchDoc(candidate);
        if (
          candidateDoc &&
          scrapeDocument(candidateDoc, candidate, categories, new Set(seen)).length > 0
        ) {
          nextDoc = candidateDoc;
          nextUrl = candidate;
          learnedPattern = i;
          break;
        }
      }
    }

    if (!nextDoc || !nextUrl) break;
    visited.add(nextUrl);
    doc = nextDoc;
    url = nextUrl;
  }

  return pages;
}

/* ───────── "Load more" button fallback (live page only) ───────── */

function findLoadMoreButton(): HTMLElement | null {
  return (
    Array.from(document.querySelectorAll<HTMLElement>('button, a')).find(
      (el) => /^\s*load more\s*$/i.test(el.textContent || '') && el.offsetParent !== null
    ) || null
  );
}

async function expandLoadMore(): Promise<void> {
  for (let i = 0; i < MAX_LOAD_MORE; i++) {
    const btn = findLoadMoreButton();
    if (!btn) return;
    const href = btn.getAttribute('href');
    if (href && href !== '#' && !href.startsWith('javascript:')) return; // real link: fetched instead
    const before = findCards(document).length;
    btn.click();
    let grew = false;
    for (let t = 0; t < 25 && !grew; t++) {
      await sleep(200);
      grew = findCards(document).length > before;
    }
    if (!grew) return;
  }
}

/* ───────── The full scan ───────── */

function addItems(byId: Map<string, CatalogItem>, batch: CatalogItem[]) {
  batch.forEach((item) => {
    const existing = byId.get(item.id);
    if (existing) {
      existing.categories = dedupeCategories([...existing.categories, ...item.categories]);
    } else {
      byId.set(item.id, {
        ...item,
        order: byId.size,
        categories: dedupeCategories(item.categories),
      });
    }
  });
}

async function runFullScan(): Promise<void> {
  requestCount = 0;
  await appendLog('Scan started. Reading the full summary library…');

  const saved = await storageGet<{ catalogIndex?: CatalogIndex; scanProgress?: ScanProgress }>([
    'catalogIndex',
    'scanProgress',
  ]);
  const existing: CatalogIndex = saved.catalogIndex || {};
  const progress: ScanProgress = saved.scanProgress || { complete: false, done: {} };
  // An interrupted scan is resumed from what was saved instead of restarted
  const resuming =
    !!saved.scanProgress && !saved.scanProgress.complete && Object.keys(existing).length > 0;
  const byId = new Map<string, CatalogItem>();
  if (resuming) Object.values(existing).forEach((item) => byId.set(item.id, { ...item }));
  let pageSize = 0;
  let competencies: Competency[] = [];

  const persist = async () => {
    const index: CatalogIndex = {};
    byId.forEach((item) => {
      const old = existing[item.id];
      index[item.id] = old
        ? { ...item, status: old.status, filename: old.filename, error: old.error }
        : item;
    });
    const data: Record<string, unknown> = {
      catalogIndex: index,
      competencies: competencies.map((c) => ({ name: c.name, count: c.count })),
      scanProgress: progress,
    };
    if (pageSize > 0) data.pageSize = pageSize;
    await storageSet(data);
  };

  // 1. The site's competency list (server-rendered in the Competencies dropdown)
  const libraryUrl = `${location.origin}${LIBRARY_PATH}`;
  const baseDoc = await fetchDoc(libraryUrl);
  competencies = baseDoc ? discoverCompetencies(baseDoc) : [];
  if (competencies.length === 0) competencies = discoverCompetencies(document);
  await appendLog(
    competencies.length
      ? `Found ${competencies.length} competencies on the site.`
      : 'Could not find the Competencies dropdown. Items will stay uncategorised.',
    competencies.length ? 'info' : 'warn'
  );

  // 2. Whole library, in the site's own order (no tags yet)
  const basePages = baseDoc && !resuming
    ? await crawlListing(
        libraryUrl,
        [],
        (batch, n) => {
          if (n === 1) pageSize = batch.length;
          addItems(byId, batch);
        },
        baseDoc
      )
    : 0;

  // Fallback: read the live page (JS-rendered lists, or "Load more" buttons)
  if (!resuming && (byId.size === 0 || (basePages <= 1 && findLoadMoreButton()))) {
    await appendLog(
      byId.size === 0
        ? `Could not read ${libraryUrl} directly. Scanning this page instead.`
        : 'Library paging not detected. Expanding "Load more" on this page.',
      'warn'
    );
    await expandLoadMore();
    const nameBySlug = new Map(competencies.map((c) => [c.slug, c.name]));
    const liveCategories = slugsFromUrl(location.href).map((s) => nameBySlug.get(s) || toTitleCase(s));
    addItems(byId, scrapeDocument(document, location.href, liveCategories, new Set()));
  }

  if (byId.size === 0) {
    await appendLog('No summaries found. Open summary.com/book-summaries/ and scan again.', 'error');
    return;
  }

  if (!resuming) {
    // Keep old tags only for competencies that won't be re-crawled (site count unchanged)
    const keep = new Set(
      competencies.filter((c) => progress.done[c.slug] === c.count).map((c) => c.name)
    );
    byId.forEach((item) => {
      item.categories = (existing[item.id]?.categories || []).filter((c) => keep.has(c));
    });
  }
  progress.complete = false;
  await persist();
  await appendLog(
    resuming
      ? `Resuming the previous scan: ${byId.size} summaries loaded, ` +
          `${competencies.filter((c) => progress.done[c.slug] === c.count).length}/${competencies.length} competencies already done.`
      : `Library: ${byId.size} summaries (${basePages || 1} page(s)).`,
    'success'
  );

  // 3. One filtered crawl per competency, so each item gets exact tags
  const baseCount = byId.size;
  let skipped = 0;
  for (let i = 0; i < competencies.length; i++) {
    const comp = competencies[i];
    if (progress.done[comp.slug] === comp.count) {
      skipped++; // already crawled and the site's count hasn't changed
      continue;
    }
    const filteredUrl = new URL(libraryUrl);
    filteredUrl.searchParams.set('competence', comp.slug);

    const found: CatalogItem[] = [];
    await crawlListing(filteredUrl.href, [comp.name], (batch) => found.push(...batch));

    // If a filter returns the entire library, the site ignored it: don't tag everything
    if (competencies.length > 1 && found.length >= baseCount * 0.98) {
      await appendLog(`"${comp.name}" returned the whole library, so it was skipped.`, 'warn');
      continue;
    }

    addItems(byId, found);
    progress.done[comp.slug] = comp.count;
    const mismatch = comp.count > 0 && found.length !== comp.count;
    await appendLog(
      `Competency ${i + 1}/${competencies.length}: ${comp.name} (${found.length} items)` +
        (mismatch ? `, site lists ${comp.count}` : ''),
      mismatch ? 'warn' : 'info'
    );
    await persist(); // saved after every competency, so an interrupted scan can resume
  }

  progress.complete = true;
  await persist();
  if (skipped > 0) {
    await appendLog(`Skipped ${skipped} competencies that were unchanged since the last scan.`);
  }
  const tagged = Array.from(byId.values()).filter((item) => item.categories.length > 0).length;
  await appendLog(
    `Scan complete: ${byId.size} summaries, ${tagged} tagged across ${competencies.length} competencies.`,
    'success'
  );
}

/* ───────── Message handling ───────── */

storageSet({ isScanning: false });

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (message.type === 'START_SCRAPE') {
    if (isScanning) {
      sendResponse({ success: true, busy: true });
      return;
    }
    isScanning = true;
    storageSet({ isScanning: true });

    runFullScan()
      .catch((err) =>
        appendLog(`Scan failed: ${err instanceof Error ? err.message : String(err)}`, 'error')
      )
      .then(async () => {
        isScanning = false;
        await storageSet({ isScanning: false });
      });

    // Answer right away; progress and results arrive through storage and the activity log
    sendResponse({ success: true, started: true });
  }
});