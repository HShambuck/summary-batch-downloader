import React, { useState, useEffect, useMemo } from 'react';
import type {
  CatalogIndex,
  DownloadFilter,
  DownloadJob,
  FileType,
  ItemDownloadState,
  ItemStatus,
  StorageState,
  LogEntry,
} from '../types';
import { SidebarFilter } from './SidebarFilter';
import { CatalogTable } from './CatalogTable';
import { ConsoleLog } from './ConsoleLog';
import './dashboard.css';

const DEFAULT_PAGE_SIZE = 50;
const CONFIRM_ABOVE = 100; // ask before downloading more than this many books with nothing selected

export const Dashboard: React.FC = () => {
  const [catalogIndex, setCatalogIndex] = useState<CatalogIndex>({});
  const [downloadState, setDownloadState] = useState<Record<string, ItemDownloadState>>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [page, setPage] = useState(1);
  const [siteCompetencies, setSiteCompetencies] = useState<{ name: string; count: number }[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState<DownloadFilter>({
    includePdf: true, // books by default
    includeMp3: false,
    skipDownloaded: true,
    selectedCategories: [],
    selectedCompetencies: [],
    searchQuery: '',
  });

  const { includePdf, includeMp3 } = filter;

  // Site order, with each book's status worked out from the files chosen for download
  const catalogList = useMemo(() => {
    const kinds: FileType[] = [];
    if (includePdf) kinds.push('pdf');
    if (includeMp3) kinds.push('mp3');
    if (kinds.length === 0) kinds.push('pdf', 'mp3');

    const statusOf = (id: string): ItemStatus => {
      const state = downloadState[id];
      if (!state) return 'pending';
      const states = kinds.map((k) => state[k]);
      if (states.includes('downloading')) return 'downloading';
      if (states.includes('failed')) return 'failed';
      if (states.every((s) => s === 'unavailable')) return 'skipped';
      if (states.every((s) => s === 'completed' || s === 'unavailable')) return 'completed';
      return 'pending';
    };

    return Object.values(catalogIndex)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((item) => ({ ...item, status: statusOf(item.id) }));
  }, [catalogIndex, downloadState, includePdf, includeMp3]);

  // The site's competency list (in the site's order) with counts from the indexed items
  const competenciesList = useMemo(() => {
    const counts: Record<string, number> = {};
    catalogList.forEach((item) => {
      const tags = item.categories && item.categories.length > 0 ? item.categories : ['General'];
      tags.forEach((tag) => {
        counts[tag] = (counts[tag] || 0) + 1;
      });
    });
    const fromSite = siteCompetencies.map((c) => ({ name: c.name, count: counts[c.name] || 0 }));
    const known = new Set(fromSite.map((c) => c.name));
    const extra = Object.entries(counts)
      .filter(([name]) => !known.has(name))
      .map(([name, count]) => ({ name, count }))
      .sort((x, y) => x.name.localeCompare(y.name));
    return [...fromSite, ...extra];
  }, [catalogList, siteCompetencies]);

  useEffect(() => {
    chrome.storage.local.get(
      ['catalogIndex', 'downloadState', 'isRunning', 'isScanning', 'pageSize', 'competencies', 'logs'],
      (data: StorageState) => {
        if (data.catalogIndex) setCatalogIndex(data.catalogIndex);
        if (data.downloadState) setDownloadState(data.downloadState);
        if (typeof data.isRunning === 'boolean') setIsRunning(data.isRunning);
        if (typeof data.isScanning === 'boolean') setIsScanning(data.isScanning);
        if (typeof data.pageSize === 'number' && data.pageSize > 0) setPageSize(data.pageSize);
        if (data.competencies) setSiteCompetencies(data.competencies);
        if (data.logs) setLogs(data.logs);
      }
    );

    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.catalogIndex?.newValue !== undefined) {
        setCatalogIndex((changes.catalogIndex.newValue as CatalogIndex) || {});
      }
      if (changes.downloadState?.newValue !== undefined) {
        setDownloadState((changes.downloadState.newValue as Record<string, ItemDownloadState>) || {});
      }
      if (changes.isRunning?.newValue !== undefined) {
        setIsRunning(Boolean(changes.isRunning.newValue));
      }
      if (changes.isScanning?.newValue !== undefined) {
        setIsScanning(Boolean(changes.isScanning.newValue));
      }
      if (typeof changes.pageSize?.newValue === 'number' && changes.pageSize.newValue > 0) {
        setPageSize(changes.pageSize.newValue as number);
      }
      if (changes.competencies?.newValue !== undefined) {
        setSiteCompetencies((changes.competencies.newValue as { name: string; count: number }[]) || []);
      }
      if (changes.logs?.newValue !== undefined) {
        setLogs((changes.logs.newValue as LogEntry[]) || []);
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, []);

  const handleStartScrape = () => {
    chrome.tabs.query({ url: '*://*.summary.com/*' }, (tabs) => {
      if (!tabs || tabs.length === 0) {
        setNotice('Open summary.com in another tab, then scan again.');
        return;
      }
      const target =
        tabs.find((t) => /\/book-summaries/.test(t.url || '')) ||
        tabs.find((t) => t.active) ||
        tabs[0];
      if (!target?.id) return;

      setNotice(null);
      chrome.tabs.sendMessage(target.id, { type: 'START_SCRAPE' }, (res) => {
        if (chrome.runtime.lastError) {
          setNotice('Could not reach the page. Refresh the summary.com tab and scan again.');
        } else if (res?.busy) {
          setNotice('A scan is already running. Watch the activity log for progress.');
        }
      });
    });
  };

  const filteredCatalog = useMemo(() => {
    return catalogList.filter((item) => {
      const activeCategories =
        filter.selectedCompetencies?.length > 0 ? filter.selectedCompetencies : filter.selectedCategories;

      if (activeCategories && activeCategories.length > 0) {
        const itemTags = item.categories && item.categories.length > 0 ? item.categories : ['General'];
        if (!activeCategories.some((cat) => itemTags.includes(cat))) return false;
      }

      if (filter.searchQuery.trim() !== '') {
        const query = filter.searchQuery.toLowerCase();
        return (
          item.title.toLowerCase().includes(query) ||
          item.categories.some((c) => c.toLowerCase().includes(query))
        );
      }

      return true;
    });
  }, [catalogList, filter]);

  // Back to the first page whenever filters or search change
  useEffect(() => {
    setPage(1);
  }, [filter]);

  const totalPages = Math.max(1, Math.ceil(filteredCatalog.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * pageSize;
  const pageItems = filteredCatalog.slice(pageStart, pageStart + pageSize);

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const handleToggleSelectAll = () => {
    const ids = pageItems.map((item) => item.id);
    const areAllSelected = ids.every((id) => selectedIds.includes(id));
    if (areAllSelected) {
      setSelectedIds((prev) => prev.filter((id) => !ids.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...ids])));
    }
  };

  // Download the selected rows, or everything the filters show when nothing is selected
  const handleStartBatch = () => {
    const kinds: FileType[] = [];
    if (filter.includePdf) kinds.push('pdf');
    if (filter.includeMp3) kinds.push('mp3');
    if (kinds.length === 0) {
      setNotice('Choose at least one file type to download (PDF or MP3).');
      return;
    }

    const source =
      selectedIds.length > 0 ? catalogList.filter((i) => selectedIds.includes(i.id)) : filteredCatalog;

    const jobs: DownloadJob[] = [];
    source.forEach((item) => {
      if (item.type === 'webinar') return; // webinars are handled separately
      const wanted = kinds.filter(
        (k) => !(filter.skipDownloaded && downloadState[item.id]?.[k] === 'completed')
      );
      if (wanted.length === 0) return;
      jobs.push({
        id: item.id,
        title: item.title,
        author: item.authorOrSpeaker,
        category: item.categories[0] || 'Uncategorised',
        kinds: wanted,
      });
    });

    if (jobs.length === 0) {
      setNotice('Nothing to download: everything chosen is already downloaded.');
      return;
    }
    if (
      selectedIds.length === 0 &&
      jobs.length > CONFIRM_ABOVE &&
      !window.confirm(
        `Nothing is selected, so this will download all ${jobs.length} books the current filters show. Continue?`
      )
    ) {
      return;
    }

    setNotice(null);
    chrome.runtime.sendMessage({ type: 'START_BATCH_DOWNLOAD', payload: jobs }, () => {
      if (chrome.runtime.lastError) {
        setNotice('Could not reach the download worker. Reload the extension and try again.');
      }
    });
  };

  const handlePause = () => {
    chrome.runtime.sendMessage({ type: 'PAUSE_DOWNLOADS' }, () => void chrome.runtime.lastError);
  };

  const total = catalogList.length;
  const completedCount = catalogList.filter((i) => i.status === 'completed').length;
  const failedCount = catalogList.filter((i) => i.status === 'failed').length;
  const completedPct = total > 0 ? (completedCount / total) * 100 : 0;
  const failedPct = total > 0 ? (failedCount / total) * 100 : 0;

  return (
    <div className="sv-app">
      <SidebarFilter
        filter={filter}
        setFilter={setFilter}
        competencies={competenciesList}
        onStartScrape={handleStartScrape}
        onStartBatch={handleStartBatch}
        onStopBatch={handlePause}
        isRunning={isRunning}
        isScanning={isScanning}
      />

      <main className="sv-main">
        <header className="sv-header">
          <div>
            <h1 className="sv-title">Download library</h1>
            <p className="sv-meta">
              <strong>{filteredCatalog.length}</strong> shown of <strong>{total}</strong> indexed
              {isScanning ? ' · scanning…' : ''}
            </p>
          </div>

          <div className="sv-search">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.6" />
              <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              placeholder="Search titles or competencies"
              aria-label="Search titles or competencies"
              value={filter.searchQuery}
              onChange={(e) => setFilter((prev) => ({ ...prev, searchQuery: e.target.value }))}
            />
          </div>
        </header>

        {notice && (
          <div className="sv-notice" role="alert">
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice(null)}>Dismiss</button>
          </div>
        )}

        <section className="sv-panel sv-progress" aria-label="Batch progress">
          <div className="sv-progress-head">
            <b>Batch progress</b>
            <span>
              {completedCount} of {total} complete
              {failedCount > 0 ? ` · ${failedCount} failed` : ''}
            </span>
          </div>
          <div
            className="sv-track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(completedPct)}
          >
            <div className="sv-track-ok" style={{ width: `${completedPct}%` }} />
            <div className="sv-track-err" style={{ width: `${failedPct}%` }} />
          </div>
        </section>

        <div className="sv-selbar">
          {selectedIds.length > 0 ? (
            <>
              <span><b>{selectedIds.length}</b> selected. Start downloads only these.</span>
              <button type="button" className="sv-link-btn" onClick={() => setSelectedIds([])}>
                Clear selection
              </button>
            </>
          ) : (
            <span>
              Nothing selected: Start downloads all <b>{filteredCatalog.length}</b> books shown.
            </span>
          )}
        </div>

        <div className="sv-panel sv-table-card">
          <CatalogTable
            items={pageItems}
            selectedIds={selectedIds}
            onToggleSelect={handleToggleSelect}
            onToggleSelectAll={handleToggleSelectAll}
            hasCatalog={total > 0}
          />
          {filteredCatalog.length > pageSize && (
            <div className="sv-pager">
              <span>
                {pageStart + 1}–{Math.min(pageStart + pageSize, filteredCatalog.length)} of{' '}
                {filteredCatalog.length}
              </span>
              <div className="sv-pager-btns">
                <button type="button" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>
                  Previous
                </button>
                <span>Page {safePage} of {totalPages}</span>
                <button type="button" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}>
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

        <ConsoleLog logs={logs} />
      </main>
    </div>
  );
};