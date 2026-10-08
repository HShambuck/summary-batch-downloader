import type { CatalogIndex, CatalogItem, ExtensionMessage } from '../types';

// Headings that are page chrome, not competency names
const GENERIC_HEADING = /^(browse|summaries|book summaries|webinars?|load more|search|filters?)$/i;

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

function extractActivePageCategory(): string | null {
  const urlParams = new URLSearchParams(window.location.search);
  const paramCompetency =
    urlParams.get('competence') || urlParams.get('category') || urlParams.get('subject');
  if (paramCompetency) {
    return paramCompetency.charAt(0).toUpperCase() + paramCompetency.slice(1);
  }

  const activeTag = document
    .querySelector('.active-filter, [class*="selected-tag"], .page-title, h1')
    ?.textContent?.trim();
  if (activeTag && !GENERIC_HEADING.test(activeTag) && !activeTag.toLowerCase().includes('summaries')) {
    return sanitizeFilename(activeTag);
  }
  return null;
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

function scrapeVisibleCatalog(): CatalogItem[] {
  const items: CatalogItem[] = [];
  const seen = new Set<string>();
  const pageCategory = extractActivePageCategory();
  let currentHeading: string | null = null;

  // One pass in document order: headings set the current competency,
  // each .item card inherits the nearest heading above it.
  document.querySelectorAll<HTMLElement>('h1, h2, h3, h4, .item').forEach((node) => {
    // Card titles may be h2-h4; they must not be mistaken for section headings
    if (!node.classList.contains('item') && node.closest('.item')) return;

    if (!node.classList.contains('item')) {
      const text = node.textContent?.trim() || '';
      if (text && text.length < 60 && !GENERIC_HEADING.test(text)) {
        currentHeading = sanitizeFilename(text);
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
    const category = currentHeading || pageCategory;

    items.push({
      id: href,
      title: sanitizeFilename(cleanTitle(rawTitle)),
      authorOrSpeaker: node.querySelector('i')?.textContent?.trim() || 'Soundview Executive',
      type: isWebinar ? 'webinar' : 'summary',
      categories: category ? [category] : [],
      downloadUrl: href,
      pdfUrl: isWebinar ? undefined : href,
      mp3Url: isWebinar ? href : undefined,
      fileType: isWebinar ? 'mp3' : 'pdf',
      status: 'pending',
      order: items.length,
    });
  });

  return items;
}

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse) => {
    if (message.type === 'START_SCRAPE') {
      const scrapedItems = scrapeVisibleCatalog();

      chrome.storage.local.get(['catalogIndex'], (result) => {
        const existingIndex: CatalogIndex = (result.catalogIndex || {}) as CatalogIndex;

        scrapedItems.forEach((newItem) => {
          const existingItem = existingIndex[newItem.id];

          if (existingItem) {
            // Union categories, but drop the "General" placeholder once a real one exists
            const merged = Array.from(new Set([...existingItem.categories, ...newItem.categories]));
            const categories = merged.length > 1 ? merged.filter((c) => c !== 'General') : merged;

            existingIndex[newItem.id] = {
              ...existingItem, // keeps status, filename, etc.
              categories,
              order: newItem.order,
            };
          } else {
            existingIndex[newItem.id] = newItem;
          }
        });

        chrome.storage.local.set({ catalogIndex: existingIndex }, () => {
          const itemsList = Object.values(existingIndex);
          sendResponse({ success: true, count: itemsList.length, items: itemsList });
        });
      });

      return true;
    }
  }
);