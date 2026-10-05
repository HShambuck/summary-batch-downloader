function scrapeDetailPage() {
  const title = document.querySelector("h1, .entry-title")?.textContent?.trim() || "Untitled";
  const categoryEl = document.querySelector('.competencies-list a, .competency-tag, a[href*="competence="]') as HTMLElement | null;
  const category = categoryEl ? categoryEl.innerText.trim() : "General";

  const mediaLinks = [];

  const pdfLink = document.querySelector('a[href$=".pdf"], a[href*="/pdf/"]') as HTMLAnchorElement | null;
  if (pdfLink) {
    mediaLinks.push({
      title,
      category,
      type: "PDF",
      ext: "pdf",
      url: pdfLink.href
    });
  }

  const mp3Link = document.querySelector('a[href$=".mp3"], a[href*="/audio/"]') as HTMLAnchorElement | null;
  if (mp3Link) {
    mediaLinks.push({
      title,
      category,
      type: "Audio",
      ext: "mp3",
      url: mp3Link.href
    });
  }

  return mediaLinks;
}

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === "SCRAPE_PAGE") {
    const data = scrapeDetailPage();
    sendResponse({ data });
  }
});