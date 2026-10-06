import type { DownloadItem, ExtensionMessage } from "../types";

console.log("[Summary.com Content Script] Loaded and listening...");

function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "").trim();
}

function scrapeCatalog(): DownloadItem[] {
  const items: DownloadItem[] = [];

  // Scrape Summaries (PDFs)
  const summaryCards = document.querySelectorAll(
    ".summary-card, .book-item, article[data-competency]",
  );
  summaryCards.forEach((card, index) => {
    const titleEl = card.querySelector(".title, .book-title, h3, h4");
    const authorEl = card.querySelector(".author, .byline");
    const pdfLinkEl = card.querySelector<HTMLAnchorElement>(
      'a[href$=".pdf"], a.download-pdf, a[data-download-type="pdf"]',
    );
    const competencyAttr =
      card.getAttribute("data-competency") ||
      card.querySelector(".competency-tag, .category")?.textContent?.trim() ||
      "General";

    if (titleEl && pdfLinkEl?.href) {
      const title = titleEl.textContent?.trim() || `Summary ${index + 1}`;
      const category = sanitizeFilename(competencyAttr);

      items.push({
        id: `summary-${index}-${Date.now()}`,
        title,
        authorOrSpeaker: authorEl?.textContent?.trim() || "Unknown Author",
        type: "summary",
        contentType: "summary",
        category,
        competency: category,
        downloadUrl: pdfLinkEl.href,
        pdfUrl: pdfLinkEl.href,
        fileType: "pdf",
        status: "pending",
        filename: `Summaries/${category}/${sanitizeFilename(title)}.pdf`,
      });
    }
  });

  // Scrape Webinars (MP3s)
  const webinarCards = document.querySelectorAll(
    ".webinar-card, .audio-item, div[data-webinar-topic]",
  );
  webinarCards.forEach((card, index) => {
    const titleEl = card.querySelector(".webinar-title, .title, h3, h4");
    const speakerEl = card.querySelector(".speaker, .presenter");
    const mp3LinkEl = card.querySelector<HTMLAnchorElement>(
      'a[href$=".mp3"], a.download-audio, a[data-download-type="mp3"]',
    );
    const topicAttr =
      card.getAttribute("data-webinar-topic") ||
      card
        .querySelector(".topic-tag, .webinar-category")
        ?.textContent?.trim() ||
      "General";

    if (titleEl && mp3LinkEl?.href) {
      const title = titleEl.textContent?.trim() || `Webinar ${index + 1}`;
      const category = sanitizeFilename(topicAttr);

      items.push({
        id: `webinar-${index}-${Date.now()}`,
        title,
        authorOrSpeaker: speakerEl?.textContent?.trim() || "Unknown Speaker",
        type: "webinar",
        contentType: "webinar",
        category,
        competency: category,
        downloadUrl: mp3LinkEl.href,
        mp3Url: mp3LinkEl.href,
        fileType: "mp3",
        status: "pending",
        filename: `Webinars/${category}/${sanitizeFilename(title)}.mp3`,
      });
    }
  });

  return items;
}

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse) => {
    if (message.type === "START_SCRAPE") {
      console.log("[Summary.com Content Script] Starting catalog scan...");
      const catalog = scrapeCatalog();

      chrome.storage.local.get(["catalogItems"], (result) => {
        const existingItems = (result.catalogItems || []) as DownloadItem[];
        const itemMap = new Map<string, DownloadItem>();

        existingItems.forEach((item) => itemMap.set(item.downloadUrl, item));
        catalog.forEach((item) => itemMap.set(item.downloadUrl, item));

        const mergedCatalog = Array.from(itemMap.values());

        chrome.storage.local.set({ catalogItems: mergedCatalog }, () => {
          sendResponse({
            success: true,
            count: mergedCatalog.length,
            items: mergedCatalog,
          });
        });
      });

      return true; // Keep response channel open for async response
    }
  },
);
