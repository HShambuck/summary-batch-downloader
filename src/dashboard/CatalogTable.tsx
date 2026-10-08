import React, { useEffect, useRef } from 'react';
import type { CatalogItem } from '../types';

interface CatalogTableProps {
  items: CatalogItem[];
  selectedIds?: string[];
  onToggleSelect?: (id: string) => void;
  onToggleSelectAll?: () => void;
  /** True when the catalog has items but filters hide all of them. */
  hasCatalog?: boolean;
}

const MAX_VISIBLE_TAGS = 2;

export const CatalogTable: React.FC<CatalogTableProps> = ({
  items,
  selectedIds = [],
  onToggleSelect = () => {},
  onToggleSelectAll = () => {},
  hasCatalog = false,
}) => {
  const headerCheckbox = useRef<HTMLInputElement>(null);

  const selectedInView = items.filter((item) => selectedIds.includes(item.id)).length;
  const allSelected = items.length > 0 && selectedInView === items.length;
  const someSelected = selectedInView > 0 && !allSelected;

  useEffect(() => {
    if (headerCheckbox.current) headerCheckbox.current.indeterminate = someSelected;
  }, [someSelected]);

  return (
    <div className="sv-table-scroll">
      <table className="sv-table">
        <thead>
          <tr>
            <th className="sv-col-check">
              <input
                ref={headerCheckbox}
                type="checkbox"
                checked={allSelected}
                onChange={onToggleSelectAll}
                aria-label="Select all visible items"
                disabled={items.length === 0}
              />
            </th>
            <th>Title</th>
            <th>Competency</th>
            <th>Type</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={5} style={{ cursor: 'default' }}>
                <div className="sv-empty">
                  {hasCatalog ? (
                    <>
                      <h4>No items match your filters</h4>
                      <p>Try clearing the search or turning off “Skip already downloaded”.</p>
                    </>
                  ) : (
                    <>
                      <h4>Your catalog is empty</h4>
                      <p>Open summary.com in another tab, then choose “Scan page for summaries”.</p>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ) : (
            items.map((item) => {
              const categories = item.categories?.length
                ? item.categories
                : [item.competency || 'General'];
              const shown = categories.slice(0, MAX_VISIBLE_TAGS);
              const hidden = categories.length - shown.length;
              const displayType = String(item.fileType || item.type || item.contentType || 'summary');
              const typeClass =
                displayType === 'pdf' ? 'sv-type-pdf' : displayType === 'mp3' ? 'sv-type-mp3' : 'sv-type-other';
              const isSelected = selectedIds.includes(item.id);

              return (
                <tr
                  key={item.id}
                  className={isSelected ? 'is-selected' : ''}
                  onClick={() => onToggleSelect(item.id)}
                >
                  <td className="sv-col-check">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => onToggleSelect(item.id)}
                      aria-label={`Select ${item.title}`}
                    />
                  </td>
                  <td className="sv-cell-title">{item.title}</td>
                  <td>
                    <div className="sv-tags" title={categories.join(', ')}>
                      {shown.map((c) => (
                        <span key={c} className="sv-tag">{c}</span>
                      ))}
                      {hidden > 0 && <span className="sv-tag">+{hidden}</span>}
                    </div>
                  </td>
                  <td>
                    <span className={`sv-type ${typeClass}`}>{displayType.toUpperCase()}</span>
                  </td>
                  <td>
                    <StatusBadge status={item.status} />
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
};

const STATUS_LABELS: Record<CatalogItem['status'], string> = {
  pending: 'Pending',
  downloading: 'Downloading',
  completed: 'Completed',
  failed: 'Failed',
  skipped: 'Skipped',
};

const StatusBadge: React.FC<{ status: CatalogItem['status'] }> = ({ status }) => {
  const key = STATUS_LABELS[status] ? status : 'pending';
  return (
    <span className={`sv-status sv-status-${key}`}>
      <i />
      {STATUS_LABELS[key]}
    </span>
  );
};