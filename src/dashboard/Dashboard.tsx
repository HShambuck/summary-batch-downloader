import React, { useState, useEffect, useMemo } from 'react';
import type { CatalogIndex, CatalogItem, DownloadFilter } from '../types';
import { SidebarFilter } from './SidebarFilter';

export const Dashboard: React.FC = () => {
  const [catalogIndex, setCatalogIndex] = useState<CatalogIndex>({});
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [filter, setFilter] = useState<DownloadFilter>({
    includePdf: true,
    includeMp3: true,
    skipDownloaded: false,
    selectedCategories: [],
    searchQuery: '',
  });

  const catalogList = useMemo(() => Object.values(catalogIndex), [catalogIndex]);

  // Compute unique categories and counts for the sidebarFilter
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    catalogList.forEach((item) => {
      const tags = item.categories.length > 0 ? item.categories : ['Uncategorized'];
      tags.forEach((tag) => {
        counts[tag] = (counts[tag] || 0) + 1;
      });
    });
    return counts;
  }, [catalogList]);

  // Reactive storage update
  useEffect(() => {
    chrome.storage.local.get(['catalogIndex', 'isRunning'], (data) => {
      if (data.catalogIndex) setCatalogIndex(data.catalogIndex as CatalogIndex);
      if (data.isRunning !== undefined) setIsRunning(data.isRunning);
    });

    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.catalogIndex?.newValue) {
        setCatalogIndex(changes.catalogIndex.newValue as CatalogIndex);
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, []);

  const handleStartScrape = () => {
    chrome.tabs.query({ url: "*://*.summary.com/*" }, (tabs) => {
      if (!tabs || tabs.length === 0) {
        alert("Please open Soundview (summary.com) in another tab first!");
        return;
      }

      const targetTabId = tabs[0].id;
      if (targetTabId) {
        chrome.tabs.sendMessage(targetTabId, { type: "START_SCRAPE" }, (response) => {
          if (chrome.runtime.lastError) {
            console.error("Scan error:", chrome.runtime.lastError.message);
          }
        });
      }
    });
  };

  // Filter items for table display
  const filteredCatalog = useMemo(() => {
    return catalogList.filter((item) => {
      const matchesPdf = filter.includePdf && item.fileType === 'pdf';
      const matchesMp3 = filter.includeMp3 && item.fileType === 'mp3';
      if (!matchesPdf && !matchesMp3) return false;

      if (filter.skipDownloaded && item.status === 'completed') return false;

      if (filter.selectedCategories.length > 0) {
        const itemTags = item.categories.length > 0 ? item.categories : ['Uncategorized'];
        const hasMatchingCategory = filter.selectedCategories.some((cat) => itemTags.includes(cat));
        if (!hasMatchingCategory) return false;
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

  return (
    <div className="flex h-screen bg-slate-900 text-slate-100">
      <SidebarFilter
        filter={filter}
        setFilter={setFilter}
        categoryCounts={categoryCounts}
        onStartScrape={handleStartScrape}
        onStartBatch={() => setIsRunning(true)}
        onStopBatch={() => setIsRunning(false)}
        isRunning={isRunning}
      />
      <main className="flex-1 p-6 overflow-auto">
        <h1 className="text-2xl font-bold mb-2">Catalog Dashboard</h1>
        <p className="text-sm text-slate-400 mb-4">
          Total Indexed: {catalogList.length} | Displayed: {filteredCatalog.length}
        </p>
        {/* Render filteredCatalog table rows */}
      </main>
    </div>
  );
};