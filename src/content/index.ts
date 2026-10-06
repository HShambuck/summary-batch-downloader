import type { DownloadItem, ExtensionMessage } from '../types';

console.log('[Summary.com Content Script] Soundview Scraper loaded...');

function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '').trim();
}

/**
 * Extracts book summaries and webinars matching Soundview's DOM structure.
 */
function scrapeCatalog(): DownloadItem[] {
  const itemMap = new Map<string, DownloadItem>();

  // --- 1. Detail Page Scraper (Single Book Summary or Webinar page) ---
  const pageTitleEl = document.querySelector('h1, .summary-title, .webinar-title');
  const categoryTag = document.querySelector('.category-tag, .meta-category, label, span[style*="uppercase"]')?.textContent?.trim() || 'General';
  
  // PDF download links on detail pages (e.g., Download PDF buttons or action dropdowns)
  const pdfDownloadLinks = Array.from(
    document.querySelectorAll<HTMLAnchorElement>(
      'a[href*=".pdf"], a[href*="/download/"], a[data-download-type="pdf"], a.download-button, a[href*="summary-download"]'
    )
  );

  pdfDownloadLinks.forEach((link, idx) => {
    const href = link.href;
    if (href && !itemMap.has(href)) {
      const rawTitle = pageTitleEl?.textContent?.trim() || document.title.split('|')[0].trim() || `Summary ${idx + 1}`;
      const title = sanitizeFilename(rawTitle);
      const cat = sanitizeFilename(categoryTag);

      itemMap.set(href, {
        id: `summary-detail-${idx}-${Date.now()}`,
        title,
        authorOrSpeaker: 'Soundview Author',
        type: 'summary',
        contentType: 'summary',
        category: cat,
        competency: cat,
        downloadUrl: href,
        pdfUrl: href,
        fileType: 'pdf',
        status: 'pending',
        filename: `Summaries/${cat}/${title}.pdf`
      });
    }
  });

  // MP3 / Webinar audio links on detail pages
  const mp3DownloadLinks = Array.from(
    document.querySelectorAll<HTMLAnchorElement>(
      'a[href*=".mp3"], a[href*="/audio/"], a[data-download-type="mp3"], a[href*="webinar-download"]'
    )
  );

  mp3DownloadLinks.forEach((link, idx) => {
    const href = link.href;
    if (href && !itemMap.has(href)) {
      const rawTitle = pageTitleEl?.textContent?.trim() || document.title.split('|')[0].trim() || `Webinar ${idx + 1}`;
      const title = sanitizeFilename(rawTitle);
      const cat = sanitizeFilename(categoryTag);

      itemMap.set(href, {
        id: `webinar-detail-${idx}-${Date.now()}`,
        title,
        authorOrSpeaker: 'Soundview Speaker',
        type: 'webinar',
        contentType: 'webinar',
        category: cat,
        competency: cat,
        downloadUrl: href,
        mp3Url: href,
        fileType: 'mp3',
        status: 'pending',
        filename: `Webinars/${cat}/${title}.mp3`
      });
    }
  });

  // --- 2. Catalog / Grid List Page Scraper ---
  // Soundview catalog cards typically use article cards or grid items
  const catalogCards = document.querySelectorAll(
    'article, .card, .book-card, .webinar-card, .catalog-item, div[class*="summary"], div[class*="webinar"]'
  );

  catalogCards.forEach((card, index) => {
    const titleEl = card.querySelector('h2, h3, h4, .title, a[href*="/book-summary/"], a[href*="/webinar/"]');
    const categoryEl = card.querySelector('.category, .tag, label, span');
    const pdfLink = card.querySelector<HTMLAnchorElement>('a[href*=".pdf"], a[href*="/download/"]');
    const mp3Link = card.querySelector<HTMLAnchorElement>('a[href*=".mp3"], a[href*="/audio/"]');
    const detailLink = card.querySelector<HTMLAnchorElement>('a[href*="/book-summary/"], a[href*="/webinar/"]');

    const title = sanitizeFilename(titleEl?.textContent?.trim() || `Item ${index + 1}`);
    const category = sanitizeFilename(categoryEl?.textContent?.trim() || 'General');
    const targetUrl = pdfLink?.href || mp3Link?.href || detailLink?.href;

    if (targetUrl && !itemMap.has(targetUrl)) {
      const isWebinar = targetUrl.includes('/webinar') || targetUrl.includes('.mp3');
      const fileType = isWebinar ? 'mp3' : 'pdf';
      const contentType = isWebinar ? 'webinar' : 'summary';

      itemMap.set(targetUrl, {
        id: `${contentType}-${index}-${Date.now()}`,
        title,
        authorOrSpeaker: 'Soundview Executive',
        type: contentType,
        contentType,
        category,
        competency: category,
        downloadUrl: targetUrl,
        pdfUrl: isWebinar ? undefined : targetUrl,
        mp3Url: isWebinar ? targetUrl : undefined,
        fileType,
        status: 'pending',
        filename: `${isWebinar ? 'Webinars' : 'Summaries'}/${category}/${title}.${fileType}`
      });
    }
  });

  return Array.from(itemMap.values());
}

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (message.type === 'START_SCRAPE') {
    console.log('[Summary.com Content Script] Scanning Soundview catalog/page...');
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

    return true; // Keep channel open for async response
  }
});