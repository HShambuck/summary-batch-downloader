import { useState, useEffect } from "react";
import { SidebarFilter } from "./SidebarFilter";
import { CatalogTable } from "./CatalogTable";
import { ConsoleLog } from "./ConsoleLog";
import type {
  CatalogItem,
  DownloadFilter,
  LogEntry,
  StorageState,
} from "../types";

export function Dashboard() {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [completedCount, setCompletedCount] = useState<number>(0);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const [filter, setFilter] = useState<DownloadFilter>({
    selectedCompetencies: [],
    contentType: "all",
    includePdf: true,
    includeMp3: true,
    skipDownloaded: true,
    searchQuery: "",
  });

  // Pull state from chrome.storage
  const refreshState = () => {
    chrome.storage.local.get(
      ["catalog", "isRunning", "completedCount", "totalCount", "logs"],
      (data: StorageState) => {
        if (data.catalog) setCatalog(data.catalog);
        if (data.isRunning !== undefined) setIsRunning(data.isRunning);
        if (data.completedCount !== undefined)
          setCompletedCount(data.completedCount);
        if (data.totalCount !== undefined) setTotalCount(data.totalCount);
        if (data.logs) setLogs(data.logs);
      },
    );
  };

  useEffect(() => {
    refreshState();
    const interval = setInterval(refreshState, 1000);
    return () => clearInterval(interval);
  }, []);

  // Compute competencies list & counts dynamically from catalog
  const competenciesMap = catalog.reduce<Record<string, number>>(
    (acc, item) => {
      acc[item.competency] = (acc[item.competency] || 0) + 1;
      return acc;
    },
    {},
  );

  const competenciesList = Object.keys(competenciesMap).map((key) => ({
    name: key,
    count: competenciesMap[key],
  }));

  // Filter catalog items
  const filteredCatalog = catalog.filter((item) => {
    const matchesComp =
      filter.selectedCompetencies.length === 0 ||
      filter.selectedCompetencies.includes(item.competency);
    const matchesSearch = item.title
      .toLowerCase()
      .includes(filter.searchQuery.toLowerCase());
    return matchesComp && matchesSearch;
  });

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  };

  const handleToggleSelectAll = () => {
    if (selectedIds.length === filteredCatalog.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredCatalog.map((i) => i.id));
    }
  };

  const handleStartBatch = () => {
    const targetItems =
      selectedIds.length > 0
        ? catalog.filter((i) => selectedIds.includes(i.id))
        : filteredCatalog;
    chrome.runtime.sendMessage({
      action: "START_FILTERED_BATCH",
      items: targetItems,
      filter,
    });
  };

  const handleStopBatch = () => {
    chrome.storage.local.set({ isRunning: false });
  };

  const percent =
    totalCount > 0 ? Math.min((completedCount / totalCount) * 100, 100) : 0;

  return (
    <div style={{ display: "flex", height: "100vh", background: "#f8fafc" }}>
      <SidebarFilter
        competencies={competenciesList}
        filter={filter}
        setFilter={setFilter}
        onStartBatch={handleStartBatch}
        onStopBatch={handleStopBatch}
        isRunning={isRunning}
      />

      <main
        style={{
          flex: 1,
          padding: "24px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          overflow: "hidden",
        }}
      >
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: "20px" }}>
              Summary.com Downloader Dashboard
            </h1>
            <p
              style={{
                margin: "4px 0 0 0",
                fontSize: "13px",
                color: "#64748b",
              }}
            >
              Indexed items: {catalog.length} | Selected: {selectedIds.length}
            </p>
          </div>

          <input
            type="text"
            placeholder="Search titles..."
            value={filter.searchQuery}
            onChange={(e) =>
              setFilter((prev) => ({ ...prev, searchQuery: e.target.value }))
            }
            style={{
              padding: "8px 12px",
              border: "1px solid #cbd5e1",
              borderRadius: "6px",
              width: "240px",
              fontSize: "13px",
            }}
          />
        </header>

        {/* Progress Bar */}
        <div
          style={{
            background: "#ffffff",
            padding: "16px",
            borderRadius: "8px",
            border: "1px solid #e2e8f0",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "13px",
              fontWeight: 600,
              marginBottom: "6px",
            }}
          >
            <span>Batch Progress</span>
            <span>
              {completedCount} / {totalCount} files ({percent.toFixed(0)}%)
            </span>
          </div>
          <div
            style={{
              height: "10px",
              background: "#e2e8f0",
              borderRadius: "5px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                background: "#2563eb",
                width: `${percent}%`,
                transition: "width 0.3s ease",
              }}
            />
          </div>
        </div>

        <CatalogTable
          items={filteredCatalog}
          selectedIds={selectedIds}
          onToggleSelect={handleToggleSelect}
          onToggleSelectAll={handleToggleSelectAll}
        />

        <ConsoleLog logs={logs} />
      </main>
    </div>
  );
}
