import type { CatalogIndex, CatalogItem, ExtensionMessage } from '../types';

function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '').trim();
}

function cleanTitle(rawTitle: string): string {
  if (!rawTitle) return '';
  // Splits out brief quote text leading up to " - Title by Author"
  if (rawTitle.includes(' - ')) {
    const parts = rawTitle.split(' - ');
    return parts[parts.length - 1].trim();
  }
  return rawTitle.trim();
}

function extractActivePageCategory(): string | null {
  // Extract category from URL parameters (e.g., ?competence=accountability or ?category=leadership)
  const urlParams = new URLSearchParams(window.location.search);
  const paramCompetency = urlParams.get('competence') || urlParams.get('category') || urlParams.get('subject');
  if (paramCompetency) {
    return paramCompetency.charAt(0).toUpperCase() + paramCompetency.slice(1);
  }

  // Extract from active page tags or section headers
  const activeTag = document.querySelector('.active-filter, [class*="selected-tag"], .page-title, h1')?.textContent?.trim();
  if (activeTag && !activeTag.toLowerCase().includes('browse') && !activeTag.toLowerCase().includes('summaries')) {
    return sanitizeFilename(activeTag);
  }

  return null;
}

function scrapeVisibleCatalog(): CatalogItem[] {
  const items: CatalogItem[] = [];
  const pageCategory = extractActivePageCategory();

  const cardAnchors = Array.from(
    document.querySelectorAll<HTMLAnchorElement>('a[href*="/book-summary/"], a[href*="/book-summaries/"], a[href*="/webinar/"], a[href*="/webinars/"]')
  );

  cardAnchors.forEach((anchor) => {
    const href = anchor.href;
    if (!href || href.endsWith('/book-summaries/') || href.endsWith('/book-summaries')) return;

    const container = anchor.closest('li, article, .card, [class*="card"], [class*="item"]') || anchor.parentElement;
    if (!container) return;

    const rawTitle =
      container.querySelector('em, h2, h3, h4, .title, [class*="title"]')?.textContent?.trim() ||
      anchor.textContent?.trim() ||
      '';

    if (!rawTitle || rawTitle.length < 2) return;

    // Isolate clean book title before sanitizing
    const cleaned = cleanTitle(rawTitle);
    const title = sanitizeFilename(cleaned);
    const author = container.querySelector('a[href*="/author/"], em + a, [class*="author"]')?.textContent?.trim() || 'Soundview Executive';

    // Look for explicit inline tag badge on card
    const inlineTag = container.querySelector('[class*="category"], [class*="competence"], [class*="tag"]')?.textContent?.trim();
    const categories: string[] = [];

    if (inlineTag && inlineTag.length > 1) {
      categories.push(sanitizeFilename(inlineTag));
    } else if (pageCategory) {
      categories.push(pageCategory);
    }

    const isWebinar = href.includes('/webinar');
    const type: 'summary' | 'webinar' = isWebinar ? 'webinar' : 'summary';
    const fileType: 'pdf' | 'mp3' = isWebinar ? 'mp3' : 'pdf';

    items.push({
      id: href, // Canonical URL as ID
      title,
      authorOrSpeaker: author,
      type,
      categories,
      downloadUrl: href,
      pdfUrl: type === 'summary' ? href : undefined,
      mp3Url: type === 'webinar' ? href : undefined,
      fileType,
      status: 'pending'
    });
  });

  return items;
}

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (message.type === 'START_SCRAPE') {
    const scrapedItems = scrapeVisibleCatalog();

    chrome.storage.local.get(['catalogIndex'], (result) => {
      const existingIndex: CatalogIndex = (result.catalogIndex || {}) as CatalogIndex;

      scrapedItems.forEach((newItem) => {
        const existingItem = existingIndex[newItem.id];

        if (existingItem) {
          // Merge newly discovered categories with existing categories non-destructively
          const combinedCategories = Array.from(
            new Set([...existingItem.categories, ...newItem.categories])
          );

          existingIndex[newItem.id] = {
            ...existingItem,
            categories: combinedCategories
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
});