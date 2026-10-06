import type { DownloadItem, ExtensionMessage } from '../types';

function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '').trim();
}

function getActivePageCompetency(): string {
  // Extract competency from URL parameters (e.g., ?competence=accountability)
  const urlParams = new URLSearchParams(window.location.search);
  const paramCompetency = urlParams.get('competence') || urlParams.get('category');
  if (paramCompetency) {
    return paramCompetency.charAt(0).toUpperCase() + paramCompetency.slice(1);
  }

  // Extract from active filter tags or page headers
  const activeFilterTag = document.querySelector('.active-filter, [class*="selected-competence"], h1')?.textContent?.trim();
  if (activeFilterTag && !activeFilterTag.toLowerCase().includes('browse')) {
    return activeFilterTag;
  }

  return 'General';
}

function scrapeCatalog(): DownloadItem[] {
  const itemMap = new Map<string, DownloadItem>();
  const pageCompetency = getActivePageCompetency();

  const cardElements = Array.from(document.querySelectorAll('a[href*="/book-summary/"], a[href*="/webinars/"], a[href*="/webinar/"]'));

  cardElements.forEach((el, index) => {
    const anchor = el as HTMLAnchorElement;
    const href = anchor.href;
    if (!href || itemMap.has(href)) return;

    const isWebinar = href.includes('/webinar');
    const type: 'summary' | 'webinar' = isWebinar ? 'webinar' : 'summary';
    const fileType: 'pdf' | 'mp3' = isWebinar ? 'mp3' : 'pdf';

    const container = anchor.closest('div, article, li') || anchor;
    
    const rawTitle = 
      container.querySelector('h2, h3, h4, [class*="title"], [class*="name"]')?.textContent?.trim() ||
      container.querySelector('img')?.alt?.trim() ||
      anchor.textContent?.trim() ||
      '';

    if (!rawTitle || rawTitle.length < 2) return;

    const title = sanitizeFilename(rawTitle);

    // Look for item-level category tag first, fallback to URL/Page competency
    const cardCategory = container.querySelector('.category-tag, .competency-tag, [class*="subject"]')?.textContent?.trim();
    const category = sanitizeFilename(cardCategory || pageCompetency);

    itemMap.set(href, {
      id: `${type}-${index}-${Date.now()}`,
      title,
      authorOrSpeaker: 'Soundview Executive',
      type,
      contentType: type,
      category,
      competency: category,
      downloadUrl: href,
      pdfUrl: type === 'summary' ? href : undefined,
      mp3Url: type === 'webinar' ? href : undefined,
      fileType,
      status: 'pending',
      filename: `${type === 'webinar' ? 'Webinars' : 'Summaries'}/${category}/${title}.${fileType}`
    });
  });

  return Array.from(itemMap.values());
}

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (message.type === 'START_SCRAPE') {
    const catalog = scrapeCatalog();
    chrome.storage.local.get(['catalogItems'], (result) => {
      const existingItems = (result.catalogItems || []) as DownloadItem[];
      const itemMap = new Map<string, DownloadItem>();

      existingItems.forEach((item) => itemMap.set(item.downloadUrl, item));
      catalog.forEach((item) => itemMap.set(item.downloadUrl, item));

      const mergedCatalog = Array.from(itemMap.values());

      chrome.storage.local.set({ catalogItems: mergedCatalog, catalog: mergedCatalog }, () => {
        sendResponse({ success: true, count: mergedCatalog.length, items: mergedCatalog });
      });
    });
    return true;
  }
});