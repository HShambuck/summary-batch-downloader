import React, { useState, useEffect, useMemo } from 'react';
import type { CatalogIndex, DownloadFilter, StorageState } from '../types';
import { SidebarFilter } from './SidebarFilter';
import { CatalogTable } from './CatalogTable';

export const Dashboard: React.FC = () => {
  const [catalogIndex, setCatalogIndex] = useState<CatalogIndex>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [filter, setFilter] = useState<DownloadFilter>({
    includePdf: true,
    includeMp3: true,
    skipDownloaded: false,
    selectedCategories: [],
    selectedCompetencies: [],
    searchQuery: '',
  });

  const catalogList = useMemo(() => Object.values(catalogIndex), [catalogIndex]);

  const categoryCounts = useMemo(() => {
  const counts: Record<string, number> = {};
  catalogList.forEach((item) => {
    const tags = item.categories && item.categories.length > 0 ? item.categories : ['General'];
    tags.forEach((tag) => {
      counts[tag] = (counts[tag] || 0) + 1;
    });
  });
  return counts;
}, [catalogList]);

  const competenciesList = useMemo(() => {
  return Object.entries(categoryCounts).map(([name, count]) => ({
    name,
    count,
  }));
}, [categoryCounts]);

  useEffect(() => {
    chrome.storage.local.get(['catalogIndex', 'isRunning'], (data: StorageState) => {
      if (data.catalogIndex) setCatalogIndex(data.catalogIndex);
      if (typeof data.isRunning === 'boolean') {
        setIsRunning(data.isRunning);
      }
    });

    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.catalogIndex?.newValue) {
        setCatalogIndex(changes.catalogIndex.newValue as CatalogIndex);
      }
      if (changes.isRunning?.newValue !== undefined) {
        setIsRunning(Boolean(changes.isRunning.newValue));
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

  const filteredCatalog = useMemo(() => {
    return catalogList.filter((item) => {
      const matchesPdf = filter.includePdf && item.fileType === 'pdf';
      const matchesMp3 = filter.includeMp3 && item.fileType === 'mp3';
      if (!matchesPdf && !matchesMp3) return false;

      if (filter.skipDownloaded && item.status === 'completed') return false;

      const activeCategories = (filter.selectedCategories && filter.selectedCategories.length > 0)
        ? filter.selectedCategories 
        : (filter.selectedCompetencies || []);

      if (activeCategories.length > 0) {
        const itemTags = item.categories && item.categories.length > 0 ? item.categories : ['General'];
        const hasMatch = activeCategories.some((cat) => itemTags.includes(cat));
        if (!hasMatch) return false;
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

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAll = () => {
    const allFilteredIds = filteredCatalog.map((item) => item.id);
    const areAllSelected = allFilteredIds.every((id) => selectedIds.includes(id));

    if (areAllSelected) {
      setSelectedIds((prev) => prev.filter((id) => !allFilteredIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...allFilteredIds])));
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh', backgroundColor: '#0f172a', color: '#f8fafc' }}>
      <SidebarFilter
        filter={filter}
        setFilter={setFilter}
        categoryCounts={categoryCounts}
        competencies={competenciesList}
        onStartScrape={handleStartScrape}
        onStartBatch={() => setIsRunning(true)}
        onStopBatch={() => setIsRunning(false)}
        isRunning={isRunning}
      />
      <main style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px' }}>Catalog Dashboard</h1>
        <p style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '16px' }}>
          Total Items: {catalogList.length} | Displayed: {filteredCatalog.length} | Selected: {selectedIds.length}
        </p>
        <CatalogTable
          items={filteredCatalog}
          selectedIds={selectedIds}
          onToggleSelect={handleToggleSelect}
          onToggleSelectAll={handleToggleSelectAll}
        />
      </main>
    </div>
  );
};