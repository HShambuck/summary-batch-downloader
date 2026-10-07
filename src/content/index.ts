import type { DownloadItem, ExtensionMessage } from '../types';

function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '').trim();
}

function scrapeCatalog(): DownloadItem[] {
  const itemMap = new Map<string, DownloadItem>();

  // Target item links across Soundview summary lists
  const itemLinks = Array.from(
    document.querySelectorAll<HTMLAnchorElement>('a[href*="/book-summaries/"], a[href*="/book-summary/"], a[href*="/webinar/"], a[href*="/webinars/"]')
  );

  itemLinks.forEach((anchor, index) => {
    const href = anchor.href;
    if (!href || href.endsWith('/book-summaries/') || href.endsWith('/book-summaries') || itemMap.has(href)) {
      return;
    }

    // Find card or list container
    const container = anchor.closest('li, article, div[class*="item"], div[class*="card"]') || anchor.parentElement;
    if (!container) return;

    // Extract title text
    const rawTitle =
      container.querySelector('em, h2, h3, h4, [class*="title"]')?.textContent?.trim() ||
      anchor.textContent?.trim() ||
      '';

    if (!rawTitle || rawTitle.length < 2) return;

    const title = sanitizeFilename(rawTitle);

    // Extract author if available
    const author = container.querySelector('a[href*="/author/"], em + a, [class*="author"]')?.textContent?.trim() || 'Soundview Executive';

    const isWebinar = href.includes('/webinar');
    const type: 'summary' | 'webinar' = isWebinar ? 'webinar' : 'summary';
    const fileType: 'pdf' | 'mp3' = isWebinar ? 'mp3' : 'pdf';

    itemMap.set(href, {
      id: `${type}-${index}-${Date.now()}`,
      title,
      authorOrSpeaker: author,
      type,
      contentType: type,
      category: 'General',
      competency: 'General',
      downloadUrl: href,
      pdfUrl: type === 'summary' ? href : undefined,
      mp3Url: type === 'webinar' ? href : undefined,
      fileType,
      status: 'pending',
      filename: `${type === 'webinar' ? 'Webinars' : 'Summaries'}/General/${title}.${fileType}`
    });
  });

  return Array.from(itemMap.values());
}

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (message.type === 'START_SCRAPE') {
    const scrapedCatalog = scrapeCatalog();

    chrome.storage.local.get(['catalogItems'], (result) => {
      const existingItems = (result.catalogItems || []) as DownloadItem[];
      const itemMap = new Map<string, DownloadItem>();

      // Existing items load
      existingItems.forEach((item) => itemMap.set(item.downloadUrl, item));

      // Append newly discovered items
      scrapedCatalog.forEach((item) => {
        if (!itemMap.has(item.downloadUrl)) {
          itemMap.set(item.downloadUrl, item);
        }
      });

      const mergedCatalog = Array.from(itemMap.values());

      chrome.storage.local.set({ catalogItems: mergedCatalog, catalog: mergedCatalog }, () => {
        sendResponse({ success: true, count: mergedCatalog.length, items: mergedCatalog });
      });
    });

    return true;
  }
});