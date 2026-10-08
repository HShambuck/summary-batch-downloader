import React, { useMemo, useState } from 'react';
import type { DownloadFilter } from '../types';

interface CompetencyItem {
  name: string;
  count: number;
}

interface SidebarFilterProps {
  filter: DownloadFilter;
  setFilter: React.Dispatch<React.SetStateAction<DownloadFilter>>;
  competencies?: CompetencyItem[];
  onStartScrape: () => void;
  onStartBatch: () => void;
  onStopBatch: () => void;
  isRunning: boolean;
}

const CheckIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <path d="M2.5 6.2l2.4 2.4 4.6-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const SEARCH_THRESHOLD = 8;

export const SidebarFilter: React.FC<SidebarFilterProps> = ({
  filter,
  setFilter,
  competencies = [],
  onStartScrape,
  onStartBatch,
  onStopBatch,
  isRunning,
}) => {
  const [compQuery, setCompQuery] = useState('');
  const selected = filter.selectedCompetencies || [];

  const visibleCompetencies = useMemo(() => {
    const q = compQuery.trim().toLowerCase();
    return q ? competencies.filter((c) => c.name.toLowerCase().includes(q)) : competencies;
  }, [competencies, compQuery]);

  const selectAllCompetencies = () => {
    const names = competencies.map((c) => c.name);
    setFilter((prev) => ({ ...prev, selectedCompetencies: names, selectedCategories: names }));
  };

  const clearCompetencies = () => {
    setFilter((prev) => ({ ...prev, selectedCompetencies: [], selectedCategories: [] }));
  };

  const toggleCompetency = (name: string) => {
    setFilter((prev) => {
      const current = prev.selectedCompetencies || [];
      const updated = current.includes(name) ? current.filter((c) => c !== name) : [...current, name];
      return { ...prev, selectedCompetencies: updated, selectedCategories: updated };
    });
  };

  return (
    <aside className="sv-sidebar">
      <div className="sv-brand">
        <div className="sv-brand-mark" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v12m0 0l-4.5-4.5M12 15l4.5-4.5M4 20h16" />
          </svg>
        </div>
        <div>
          <div className="sv-brand-name">Summary Downloader</div>
          <div className="sv-brand-sub">Soundview library</div>
        </div>
      </div>

      <div className="sv-sidebar-body">
        <section>
          <div className="sv-section-head">
            <h3 className="sv-section-title">File types</h3>
          </div>

          <div className="sv-toggle-group">
            <label className={`sv-toggle ${filter.includePdf ? 'is-on' : ''}`}>
              <input
                type="checkbox"
                checked={filter.includePdf}
                onChange={(e) => setFilter((prev) => ({ ...prev, includePdf: e.target.checked }))}
              />
              <span className="sv-toggle-box"><CheckIcon /></span>
              <span className="sv-toggle-text">
                <span className="sv-toggle-label">PDF summaries</span>
                <span className="sv-toggle-desc">Written summaries</span>
              </span>
            </label>

            <label className={`sv-toggle ${filter.includeMp3 ? 'is-on' : ''}`}>
              <input
                type="checkbox"
                checked={filter.includeMp3}
                onChange={(e) => setFilter((prev) => ({ ...prev, includeMp3: e.target.checked }))}
              />
              <span className="sv-toggle-box"><CheckIcon /></span>
              <span className="sv-toggle-text">
                <span className="sv-toggle-label">MP3 audiobooks</span>
                <span className="sv-toggle-desc">Audio versions</span>
              </span>
            </label>
          </div>

          <label className="sv-switch-row" style={{ position: 'relative' }}>
            <span>Skip already downloaded</span>
            <input
              type="checkbox"
              checked={filter.skipDownloaded}
              onChange={(e) => setFilter((prev) => ({ ...prev, skipDownloaded: e.target.checked }))}
            />
            <span className="sv-switch" aria-hidden="true" />
          </label>
        </section>

        <section>
          <div className="sv-section-head">
            <h3 className="sv-section-title">Competencies</h3>
            <div>
              <button type="button" className="sv-link-btn" onClick={selectAllCompetencies}>Select all</button>
              <button type="button" className="sv-link-btn is-quiet" onClick={clearCompetencies}>Clear</button>
            </div>
          </div>
          <p className="sv-hint">
            {selected.length === 0
              ? 'None selected — showing every competency.'
              : `${selected.length} of ${competencies.length} selected.`}
          </p>

          {competencies.length > SEARCH_THRESHOLD && (
            <input
              type="search"
              className="sv-comp-search"
              placeholder="Find a competency"
              value={compQuery}
              onChange={(e) => setCompQuery(e.target.value)}
              aria-label="Find a competency"
            />
          )}

          {competencies.length === 0 ? (
            <div className="sv-empty-note">Competencies appear here after you scan the page.</div>
          ) : visibleCompetencies.length === 0 ? (
            <div className="sv-empty-note">No competency matches “{compQuery}”.</div>
          ) : (
            <div className="sv-comp-list">
              {visibleCompetencies.map((comp) => {
                const isSelected = selected.includes(comp.name);
                return (
                  <label key={comp.name} className={`sv-comp-row ${isSelected ? 'is-on' : ''}`}>
                    <span className="sv-comp-name">
                      <input type="checkbox" checked={isSelected} onChange={() => toggleCompetency(comp.name)} />
                      <span title={comp.name}>{comp.name}</span>
                    </span>
                    <span className="sv-count">{comp.count}</span>
                  </label>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <div className="sv-sidebar-foot">
        {isRunning && (
          <div className="sv-running" role="status">
            <span className="sv-status-downloading sv-status" style={{ padding: 0, background: 'none' }}>
              <i />
            </span>
            Download batch running
          </div>
        )}
        <button type="button" className="sv-btn sv-btn-secondary" onClick={onStartScrape}>
          Scan page for summaries
        </button>
        {!isRunning ? (
          <button type="button" className="sv-btn sv-btn-primary" onClick={onStartBatch}>
            Start download batch
          </button>
        ) : (
          <button type="button" className="sv-btn sv-btn-danger" onClick={onStopBatch}>
            Pause download batch
          </button>
        )}
      </div>
    </aside>
  );
};