import React, { useState, useEffect, useMemo } from 'react';
import type { CatalogIndex, DownloadFilter, StorageState, LogEntry } from '../types';
import { SidebarFilter } from './SidebarFilter';
import { CatalogTable } from './CatalogTable';
import { ConsoleLog } from './ConsoleLog'; // Corrected import name

export const Dashboard: React.FC = () => {
  const [catalogIndex, setCatalogIndex] = useState<CatalogIndex>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<DownloadFilter>({
    includePdf: true,
    includeMp3: true,
    skipDownloaded: false,
    selectedCategories: [],
    selectedCompetencies: [],
    searchQuery: '',
  });

  const catalogList = useMemo(() => Object.values(catalogIndex), [catalogIndex]);

  // Compute competencies list with counts for SidebarFilter
  const competenciesList = useMemo(() => {
    const counts: Record<string, number> = {};
    catalogList.forEach((item) => {
      const tags = item.categories && item.categories.length > 0 ? item.categories : ['General'];
      tags.forEach((tag) => {
        counts[tag] = (counts[tag] || 0) + 1;
      });
    });
    return Object.entries(counts).map(([name, count]) => ({ name, count }));
  }, [catalogList]);

  useEffect(() => {
    chrome.storage.local.get(['catalogIndex', 'isRunning', 'logs'], (data: StorageState) => {
      if (data.catalogIndex) setCatalogIndex(data.catalogIndex);
      if (typeof data.isRunning === 'boolean') setIsRunning(data.isRunning);
      if (data.logs) setLogs(data.logs);
    });

    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.catalogIndex?.newValue !== undefined) {
        setCatalogIndex((changes.catalogIndex.newValue as CatalogIndex) || {});
      }
      if (changes.isRunning?.newValue !== undefined) {
        setIsRunning(Boolean(changes.isRunning.newValue));
      }
      if (changes.logs?.newValue !== undefined) {
        setLogs((changes.logs.newValue as LogEntry[]) || []);
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
      const targetTabId = tabs[0]?.id;
      if (targetTabId) {
        chrome.tabs.sendMessage(targetTabId, { type: "START_SCRAPE" });
      }
    });
  };

  const filteredCatalog = useMemo(() => {
    return catalogList.filter((item) => {
      const matchesPdf = filter.includePdf && item.fileType === 'pdf';
      const matchesMp3 = filter.includeMp3 && item.fileType === 'mp3';
      if (!matchesPdf && !matchesMp3) return false;

      if (filter.skipDownloaded && item.status === 'completed') return false;

      const activeCategories = filter.selectedCompetencies?.length > 0
        ? filter.selectedCompetencies
        : filter.selectedCategories;

      if (activeCategories && activeCategories.length > 0) {
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

  const completedCount = catalogList.filter((i) => i.status === 'completed').length;
  const progressPercent = catalogList.length > 0 ? Math.round((completedCount / catalogList.length) * 100) : 0;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f8fafc', color: '#0f172a' }}>
      <SidebarFilter
        filter={filter}
        setFilter={setFilter}
        competencies={competenciesList}
        onStartScrape={handleStartScrape}
        onStartBatch={() => setIsRunning(true)}
        onStopBatch={() => setIsRunning(false)}
        isRunning={isRunning}
      />

      <main style={{ flex: 1, padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 700, margin: 0, color: '#0f172a' }}>
              Summary.com Downloader Dashboard
            </h1>
            <p style={{ fontSize: '13px', color: '#64748b', margin: '4px 0 0 0' }}>
              Indexed items: {catalogList.length} | Displayed: {filteredCatalog.length} | Selected: {selectedIds.length}
            </p>
          </div>

          <input
            type="text"
            placeholder="Search titles..."
            value={filter.searchQuery}
            onChange={(e) => setFilter((prev) => ({ ...prev, searchQuery: e.target.value }))}
            style={{
              padding: '8px 14px',
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              fontSize: '13px',
              width: '240px',
              outline: 'none',
            }}
          />
        </div>

        {/* Batch Progress Bar Card */}
        <div style={{ padding: '16px', backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>
            <span>Batch Progress</span>
            <span>{completedCount} / {catalogList.length} files ({progressPercent}%)</span>
          </div>
          <div style={{ height: '8px', width: '100%', backgroundColor: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${progressPercent}%`, backgroundColor: '#2563eb', transition: 'width 0.3s ease' }} />
          </div>
        </div>

        {/* Catalog Table */}
        <div style={{ backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <CatalogTable
            items={filteredCatalog}
            selectedIds={selectedIds}
            onToggleSelect={handleToggleSelect}
            onToggleSelectAll={handleToggleSelectAll}
          />
        </div>

        {/* Console Log Component */}
        <ConsoleLog logs={logs} />
      </main>
    </div>
  );
};