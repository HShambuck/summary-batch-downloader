import React from "react";
import type { DownloadFilter } from "../types";

interface CompetencyItem {
  name: string;
  count: number;
}

interface SidebarFilterProps {
  filter: DownloadFilter;
  setFilter: React.Dispatch<React.SetStateAction<DownloadFilter>>;
  competencies?: CompetencyItem[]; 
  categoryCounts?: Record<string, number>;
  onStartScrape: () => void;
  onStartBatch: () => void;
  onStopBatch: () => void;
  isRunning: boolean;
}

export const SidebarFilter: React.FC<SidebarFilterProps> = ({
  filter,
  setFilter,
  competencies = [],
  onStartScrape,
  onStartBatch,
  onStopBatch,
  isRunning,
}) => {
  const selectAllCompetencies = () => {
    setFilter((prev) => ({
      ...prev,
      selectedCompetencies: competencies.map((c) => c.name),
    }));
  };

  const clearCompetencies = () => {
    setFilter((prev) => ({ ...prev, selectedCompetencies: [] }));
  };

  const toggleCompetency = (name: string) => {
    setFilter((prev) => {
      const current = prev.selectedCompetencies || [];
      const exists = current.includes(name);
      return {
        ...prev,
        selectedCompetencies: exists
          ? current.filter((c) => c !== name)
          : [...current, name],
      };
    });
  };

  return (
    <aside
      style={{
        width: "280px",
        background: "#ffffff",
        borderRight: "1px solid #e2e8f0",
        padding: "20px",
        display: "flex",
        flexDirection: "column",
        gap: "20px",
      }}
    >
      <div>
        <h3
          style={{
            margin: "0 0 12px 0",
            fontSize: "14px",
            color: "#475569",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          Asset Types
        </h3>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            marginBottom: "8px",
            fontSize: "14px",
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={filter.includePdf}
            onChange={(e) =>
              setFilter((prev) => ({ ...prev, includePdf: e.target.checked }))
            }
          />
          📄 PDF Summaries
        </label>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            marginBottom: "8px",
            fontSize: "14px",
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={filter.includeMp3}
            onChange={(e) =>
              setFilter((prev) => ({ ...prev, includeMp3: e.target.checked }))
            }
          />
          🎧 MP3 Audiobooks
        </label>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            fontSize: "14px",
            cursor: "pointer",
            marginTop: "12px",
            color: "#0284c7",
          }}
        >
          <input
            type="checkbox"
            checked={filter.skipDownloaded}
            onChange={(e) =>
              setFilter((prev) => ({
                ...prev,
                skipDownloaded: e.target.checked,
              }))
            }
          />
          🛡️ Skip Already Downloaded
        </label>
      </div>

      <hr
        style={{ border: "none", borderTop: "1px solid #e2e8f0", margin: 0 }}
      />

      <div style={{ flex: 1, overflowY: "auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "8px",
          }}
        >
          <h3
            style={{
              margin: 0,
              fontSize: "14px",
              color: "#475569",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Competencies
          </h3>
          <div style={{ fontSize: "12px" }}>
            <span
              onClick={selectAllCompetencies}
              style={{
                color: "#2563eb",
                cursor: "pointer",
                marginRight: "8px",
              }}
            >
              All
            </span>
            <span
              onClick={clearCompetencies}
              style={{ color: "#64748b", cursor: "pointer" }}
            >
              None
            </span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {competencies.map((comp) => {
            const selectedList = filter.selectedCompetencies || [];
            const isSelected = selectedList.includes(comp.name);
            return (
              <label
                key={comp.name}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontSize: "13px",
                  padding: "6px 8px",
                  borderRadius: "4px",
                  background: isSelected ? "#eff6ff" : "transparent",
                  cursor: "pointer",
                }}
              >
                <div
                  style={{ display: "flex", alignItems: "center", gap: "8px" }}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleCompetency(comp.name)}
                  />
                  <span>{comp.name}</span>
                </div>
                <span
                  style={{
                    fontSize: "11px",
                    background: "#f1f5f9",
                    padding: "2px 6px",
                    borderRadius: "10px",
                    color: "#64748b",
                  }}
                >
                  {comp.count}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <button
          onClick={onStartScrape}
          style={{
            width: "100%",
            padding: "12px",
            background: "#059669", // Emerald Green
            color: "#fff",
            border: "none",
            borderRadius: "6px",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Scan Page / Fetch Summaries
        </button>
        {!isRunning ? (
          <button
            onClick={onStartBatch}
            style={{
              width: "100%",
              padding: "12px",
              background: "#2563eb",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Start Download Batch
          </button>
        ) : (
          <button
            onClick={onStopBatch}
            style={{
              width: "100%",
              padding: "12px",
              background: "#ef4444",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Pause Download Batch
          </button>
        )}
      </div>
    </aside>
  );
};
