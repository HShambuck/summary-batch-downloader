import type { DownloadItem, ExtensionMessage } from '../types';

console.log('[Summary.com Content Script] Targeted Scraper loaded...');

function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '').trim();
}

function scrapeCatalog(): DownloadItem[] {
  const itemMap = new Map<string, DownloadItem>();

  // 1. Target Soundview's specific catalog card items and links
  const cardElements = Array.from(document.querySelectorAll('a[href*="/book-summary/"], a[href*="/webinars/"], a[href*="/webinar/"]'));

  cardElements.forEach((el, index) => {
    const anchor = el as HTMLAnchorElement;
    const href = anchor.href;
    if (!href || itemMap.has(href)) return;

    // Determine type from URL path
    const isWebinar = href.includes('/webinar');
    const type: 'summary' | 'webinar' = isWebinar ? 'webinar' : 'summary';
    const fileType: 'pdf' | 'mp3' = isWebinar ? 'mp3' : 'pdf';

    // Find the enclosing card container to locate the title text and author
    const container = anchor.closest('div, article, li') || anchor;
    
    // Extract title text from card headers or image alt attributes
    const rawTitle = 
      container.querySelector('h2, h3, h4, [class*="title"], [class*="name"]')?.textContent?.trim() ||
      container.querySelector('img')?.alt?.trim() ||
      anchor.textContent?.trim() ||
      '';

    if (!rawTitle || rawTitle.length < 2) return;

    const title = sanitizeFilename(rawTitle);

    // Extract competency / category if present, or fallback to 'General'
    const rawCategory = container.querySelector('[class*="category"], [class*="competency"], [class*="subject"]')?.textContent?.trim() || 'General';
    const category = sanitizeFilename(rawCategory);

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
    console.log('[Summary.com Content Script] Starting scan...');
    const catalog = scrapeCatalog();

    console.log(`[Summary.com Content Script] Scraped ${catalog.length} items from page.`);

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