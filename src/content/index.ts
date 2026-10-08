import type { CatalogIndex, CatalogItem, ExtensionMessage, LogEntry } from '../types';

const LIBRARY_PATH = '/book-summaries/';
const MAX_PAGES = 80; // per listing
const MAX_REQUESTS = 900; // per scan
const MAX_LOAD_MORE = 60;
const FETCH_DELAY_MS = 120;
const SMALL_WORDS = new Set(['and', 'of', 'the', 'in', 'for', 'to', 'a', 'an', 'on']);

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

/* ───────── Text + category normalization ───────── */

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

// "adversity-stress-burnout" -> "Adversity Stress Burnout"
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

function normalizeCategory(raw: string): string {
  const s = sanitizeFilename(raw).replace(/\s+/g, ' ');
  if (!s) return '';
  const alreadyReadable = (/\s/.test(s) && /[A-Z]/.test(s)) || /^[A-Z0-9]+$/.test(s);
  return alreadyReadable ? s : toTitleCase(s);
}

// Splits slug lists, title-cases, dedupes (case-insensitive), drops "General" if real tags exist
function normalizeCategories(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  list
    .flatMap((c) => (/\s/.test(c) ? [c] : c.split(/[,;|]/)))
    .forEach((part) => {
      const name = normalizeCategory(part);
      const key = name.toLowerCase();
      if (name && !seen.has(key)) {
        seen.add(key);
        out.push(name);
      }
    });
  return out.length > 1 ? out.filter((c) => c !== 'General') : out;
}

function categoriesFromUrl(url: string): string[] {
  try {
    const params = new URL(url, location.href).searchParams;
    for (const key of ['competence', 'category', 'subject']) {
      const values = params.getAll(key);
      if (values.length) return normalizeCategories(values.flatMap((v) => v.split(',')));
    }
  } catch {
    /* ignore */
  }
  return [];
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

// .item cards first; otherwise derive cards from summary/webinar links
function findCards(doc: Document): HTMLElement[] {
  const cards = new Set<HTMLElement>(Array.from(doc.querySelectorAll<HTMLElement>('.item')));
  if (cards.size === 0) {
    doc
      .querySelectorAll<HTMLAnchorElement>('a[href*="/book-summary/"], a[href*="/webinar"]')
      .forEach((a) => {
        const card =
          a.closest<HTMLElement>('li, article, [class*="card"], [class*="item"]') || a.parentElement;
        if (card) cards.add(card);
      });
  }
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
    const rawTitle = extractTitle(node, anchor);
    if (!href || rawTitle.length < 2 || seen.has(href)) return;
    seen.add(href);

    const isWebinar = href.includes('/webinar');
    out.push({
      id: href,
      title: sanitizeFilename(cleanTitle(rawTitle)),
      authorOrSpeaker: node.querySelector('i')?.textContent?.trim() || 'Soundview Executive',
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
  await sleep(FETCH_DELAY_MS);
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

/* ───────── Competency discovery ───────── */

function discoverCompetencySlugs(doc: Document, into: Set<string>) {
  const add = (raw: string | null | undefined) =>
    (raw || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter((s) => /^[a-z0-9][a-z0-9_-]*$/.test(s))
      .forEach((s) => into.add(s));

  doc.querySelectorAll<HTMLAnchorElement>('a[href*="competence="]').forEach((a) => {
    try {
      new URL(a.getAttribute('href') || '', location.href).searchParams
        .getAll('competence')
        .forEach(add);
    } catch {
      /* ignore */
    }
  });
  doc
    .querySelectorAll<HTMLInputElement>('input[name^="competence"], select[name^="competence"] option')
    .forEach((el) => add(el.value));
  doc
    .querySelectorAll<HTMLElement>('[data-competence], [data-competency]')
    .forEach((el) => add(el.getAttribute('data-competence') || el.getAttribute('data-competency')));
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
      existing.categories = normalizeCategories([...existing.categories, ...item.categories]);
    } else {
      byId.set(item.id, {
        ...item,
        order: byId.size,
        categories: normalizeCategories(item.categories),
      });
    }
  });
}

async function runFullScan(): Promise<void> {
  requestCount = 0;
  await appendLog('Scan started. Reading the full summary library…');

  const existing: CatalogIndex =
    (await storageGet<{ catalogIndex?: CatalogIndex }>(['catalogIndex'])).catalogIndex || {};
  const byId = new Map<string, CatalogItem>();
  let pageSize = 0;

  const persist = async () => {
    const index: CatalogIndex = {};
    byId.forEach((item) => {
      const old = existing[item.id];
      index[item.id] = old
        ? { ...item, status: old.status, filename: old.filename, error: old.error }
        : item;
    });
    await storageSet(pageSize > 0 ? { catalogIndex: index, pageSize } : { catalogIndex: index });
  };

  // 1. Whole library, in the site's own order (no tags yet)
  const libraryUrl = `${location.origin}${LIBRARY_PATH}`;
  const baseDoc = await fetchDoc(libraryUrl);
  const slugs = new Set<string>();
  discoverCompetencySlugs(document, slugs);
  if (baseDoc) discoverCompetencySlugs(baseDoc, slugs);
  categoriesFromUrl(location.href).forEach((c) => slugs.add(c.toLowerCase().replace(/\s+/g, '-')));

  const basePages = baseDoc
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

  // 2. Fallback: read the live page (JS-rendered lists, or "Load more" buttons)
  if (byId.size === 0 || (basePages <= 1 && findLoadMoreButton())) {
    await appendLog(
      byId.size === 0
        ? `Could not read ${libraryUrl} directly. Scanning this page instead.`
        : 'Library paging not detected. Expanding "Load more" on this page.',
      'warn'
    );
    await expandLoadMore();
    addItems(byId, scrapeDocument(document, location.href, categoriesFromUrl(location.href), new Set()));
  }

  if (byId.size === 0) {
    await appendLog('No summaries found. Open summary.com/book-summaries/ and scan again.', 'error');
    return;
  }

  await persist();
  await appendLog(`Library: ${byId.size} summaries (${basePages || 1} page(s)).`, 'success');

  // 3. One filtered crawl per competency, so each item gets exact tags
  const list = Array.from(slugs);
  if (list.length === 0) {
    await appendLog('No competency filters found on the page. Items stay uncategorised.', 'warn');
  }
  const baseCount = byId.size;

  for (let i = 0; i < list.length; i++) {
    const slug = list[i];
    const name = toTitleCase(slug);
    const filteredUrl = new URL(libraryUrl);
    filteredUrl.searchParams.set('competence', slug);

    const found: CatalogItem[] = [];
    await crawlListing(filteredUrl.href, [name], (batch) => found.push(...batch));

    // If the filter returns the entire library, the site ignored it: don't tag everything
    if (list.length > 1 && found.length >= baseCount * 0.98) {
      await appendLog(`Competency "${name}" returned the whole library, so it was skipped.`, 'warn');
      continue;
    }

    addItems(byId, found);
    await appendLog(`Competency ${i + 1}/${list.length}: ${name} (${found.length} items)`);
    await persist();
  }

  await persist();
  const tags = new Set<string>();
  byId.forEach((item) => item.categories.forEach((c) => tags.add(c)));
  await appendLog(
    `Scan complete: ${byId.size} summaries, ${tags.size} competencies.`,
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