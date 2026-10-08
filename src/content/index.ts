import type { CatalogIndex, CatalogItem, ExtensionMessage } from '../types';

// Headings that are page chrome, not competency names
const GENERIC_HEADING = /^(browse|summaries|book summaries|webinars?|load more|search|filters?)$/i;
const MAX_PAGES = 30; // safety cap for background page fetching
const MAX_LOAD_MORE = 40; // safety cap for "Load more" button clicks
const SMALL_WORDS = new Set(['and', 'of', 'the', 'in', 'for', 'to', 'a', 'an', 'on']);

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

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

/* ───────── Category normalization ───────── */

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

// Cleans a list of categories: splits slug lists ("a-b,c-d"), title-cases,
// dedupes case-insensitively, and drops the "General" placeholder if real ones exist.
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

// ?competence=a-b,c-d  ->  ["A B", "C D"]
function categoriesFromUrl(url: string): string[] {
  let params: URLSearchParams;
  try {
    params = new URL(url, location.href).searchParams;
  } catch {
    return [];
  }
  for (const key of ['competence', 'category', 'subject']) {
    const values = params.getAll(key);
    if (values.length) return normalizeCategories(values.flatMap((v) => v.split(',')));
  }
  return [];
}

function h1Category(doc: Document): string[] {
  const text = doc
    .querySelector('.active-filter, [class*="selected-tag"], .page-title, h1')
    ?.textContent?.trim();
  if (!text || GENERIC_HEADING.test(text)) return [];
  const lower = text.toLowerCase();
  if (lower.includes('browse') || lower.includes('summaries')) return [];
  return normalizeCategories([text]);
}

/* ───────── Scraping ───────── */

// Finds item cards: .item first, otherwise derives cards from summary/webinar links
function findCards(doc: Document): Set<HTMLElement> {
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
  return cards;
}

// Tries selectors in priority order (a comma selector would return document order,
// which hits the empty thumbnail link first).
function extractTitle(node: HTMLElement, anchor: HTMLAnchorElement): string {
  for (const sel of ['strong', 'h2', 'h3', 'h4', '.title']) {
    const t = node.querySelector(sel)?.textContent?.trim();
    if (t && t.length > 1) return t;
  }
  for (const a of Array.from(node.querySelectorAll<HTMLAnchorElement>('a'))) {
    if (a.href.includes('/author/')) continue;
    const t = a.textContent?.trim();
    if (t && t.length > 1) return t;
  }
  return (
    node.querySelector('img')?.getAttribute('alt')?.trim() ||
    anchor.getAttribute('title')?.trim() ||
    ''
  );
}

// Scrapes one document (the live page or a fetched page) in on-page order.
function scrapeDocument(doc: Document, pageUrl: string, seen: Set<string>, items: CatalogItem[]) {
  const urlCategories = categoriesFromUrl(pageUrl); // explicit filter wins
  const fallbackCategories = urlCategories.length ? [] : h1Category(doc);
  let currentHeading = '';

  const cardSet = findCards(doc);
  const nodes = [
    ...Array.from(doc.querySelectorAll<HTMLElement>('h1, h2, h3, h4')),
    ...Array.from(cardSet),
  ].sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));

  nodes.forEach((node) => {
    const isCard = cardSet.has(node);
    // Card titles may be h2-h4; they must not be mistaken for section headings
    if (!isCard && Array.from(cardSet).some((c) => c.contains(node))) return;

    if (!isCard) {
      const text = node.textContent?.trim() || '';
      if (text && text.length < 60 && !GENERIC_HEADING.test(text)) {
        currentHeading = normalizeCategory(text);
      }
      return;
    }

    const anchor = node.querySelector<HTMLAnchorElement>(
      'a[href*="/book-summary/"], a[href*="/webinar"]'
    );
    const rawTitle = anchor ? extractTitle(node, anchor) : '';
    if (!anchor || rawTitle.length < 2 || seen.has(anchor.href)) return;
    seen.add(anchor.href);

    const href = anchor.href;
    const isWebinar = href.includes('/webinar');
    const categories = urlCategories.length
      ? urlCategories
      : currentHeading
      ? [currentHeading]
      : fallbackCategories;

    items.push({
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
      order: items.length,
    });
  });
}

/* ───────── Crawling ───────── */

// Clicks a JS-driven "Load more" button until the list stops growing.
async function expandLoadMore(): Promise<void> {
  for (let i = 0; i < MAX_LOAD_MORE; i++) {
    const btn = Array.from(document.querySelectorAll<HTMLElement>('button, a')).find(
      (el) => /^\s*load more\s*$/i.test(el.textContent || '') && el.offsetParent !== null
    );
    if (!btn) return;

    // A real link is followed by fetchNextUrl-based crawling instead of a click
    const href = btn.getAttribute('href');
    if (href && href !== '#' && !href.startsWith('javascript:')) return;

    const before = findCards(document).size;
    btn.click();
    let grew = false;
    for (let t = 0; t < 25 && !grew; t++) {
      await sleep(200);
      grew = findCards(document).size > before;
    }
    if (!grew) return;
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
  try {
    const url = new URL(href, currentUrl);
    return url.origin === location.origin ? url.href : null;
  } catch {
    return null;
  }
}

async function crawlCatalog(): Promise<CatalogItem[]> {
  const items: CatalogItem[] = [];
  const seen = new Set<string>();
  const visited = new Set<string>([location.href]);

  await expandLoadMore();

  let doc: Document = document;
  let url = location.href;

  for (let page = 0; page < MAX_PAGES; page++) {
    scrapeDocument(doc, url, seen, items);

    const next = findNextUrl(doc, url);
    if (!next || visited.has(next)) break;
    visited.add(next);

    try {
      const res = await fetch(next, { credentials: 'include' });
      if (!res.ok) break;
      doc = new DOMParser().parseFromString(await res.text(), 'text/html');
      url = next;
    } catch {
      break;
    }
  }

  return items;
}

/* ───────── Message handling ───────── */

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse) => {
    if (message.type === 'START_SCRAPE') {
      crawlCatalog()
        .then((scrapedItems) => {
          chrome.storage.local.get(['catalogIndex'], (result) => {
            const existingIndex: CatalogIndex = (result.catalogIndex || {}) as CatalogIndex;

            scrapedItems.forEach((newItem) => {
              const existingItem = existingIndex[newItem.id];

              if (existingItem) {
                existingIndex[newItem.id] = {
                  ...existingItem, // keeps status, filename, etc.
                  categories: normalizeCategories([
                    ...existingItem.categories,
                    ...newItem.categories,
                  ]),
                  order: newItem.order,
                };
              } else {
                existingIndex[newItem.id] = {
                  ...newItem,
                  categories: normalizeCategories(newItem.categories),
                };
              }
            });

            chrome.storage.local.set({ catalogIndex: existingIndex }, () => {
              const itemsList = Object.values(existingIndex);
              console.log(
                `[Summary Downloader] Scan found ${scrapedItems.length} items (${itemsList.length} stored)`
              );
              sendResponse({
                success: true,
                scraped: scrapedItems.length,
                count: itemsList.length,
                items: itemsList,
              });
            });
          });
        })
        .catch((err) => sendResponse({ success: false, scraped: 0, error: String(err) }));

      return true;
    }
  }
);