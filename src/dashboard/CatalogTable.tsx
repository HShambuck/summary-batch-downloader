import React from 'react';
import type { CatalogItem, ItemStatus } from '../types';

interface CatalogTableProps {
  items: CatalogItem[];
  selectedIds?: string[];
  onToggleSelect?: (id: string) => void;
  onToggleSelectAll?: () => void;
}

export const CatalogTable: React.FC<CatalogTableProps> = ({
  items,
  selectedIds = [],
  onToggleSelect = () => {},
  onToggleSelectAll = () => {},
}) => {
  const allSelected = items.length > 0 && items.every((item) => selectedIds.includes(item.id));

  const getStatusBadge = (status: ItemStatus) => {
    switch (status) {
      case 'completed':
        return <span style={{ padding: '2px 8px', borderRadius: '4px', backgroundColor: '#065f46', color: '#34d399', fontSize: '11px' }}>Completed</span>;
      case 'downloading':
        return <span style={{ padding: '2px 8px', borderRadius: '4px', backgroundColor: '#1e40af', color: '#60a5fa', fontSize: '11px' }}>Downloading</span>;
      case 'failed':
        return <span style={{ padding: '2px 8px', borderRadius: '4px', backgroundColor: '#991b1b', color: '#f87171', fontSize: '11px' }}>Failed</span>;
      case 'skipped':
        return <span style={{ padding: '2px 8px', borderRadius: '4px', backgroundColor: '#92400e', color: '#fbbf24', fontSize: '11px' }}>Skipped</span>;
      default:
        return <span style={{ padding: '2px 8px', borderRadius: '4px', backgroundColor: '#334155', color: '#94a3b8', fontSize: '11px' }}>Pending</span>;
    }
  };

  return (
    <div style={{ overflowX: 'auto', width: '100%' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #334155', color: '#94a3b8' }}>
            <th style={{ padding: '12px 8px', width: '36px' }}>
              <input type="checkbox" checked={allSelected} onChange={onToggleSelectAll} />
            </th>
            <th style={{ padding: '12px 8px' }}>Title</th>
            <th style={{ padding: '12px 8px' }}>Competency / Category</th>
            <th style={{ padding: '12px 8px' }}>Type</th>
            <th style={{ padding: '12px 8px' }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>
                No catalog items found. Click "Scan Page / Fetch Summaries" to begin.
              </td>
            </tr>
          ) : (
            items.map((item) => {
              const displayCategory = item.categories?.length ? item.categories.join(', ') : item.competency || 'General';
              const displayType = item.type || item.contentType || 'summary';
              const isSelected = selectedIds.includes(item.id);

              return (
                <tr key={item.id} style={{ borderBottom: '1px solid #1e293b', backgroundColor: isSelected ? '#1e293b' : 'transparent' }}>
                  <td style={{ padding: '10px 8px' }}>
                    <input type="checkbox" checked={isSelected} onChange={() => onToggleSelect(item.id)} />
                  </td>
                  <td style={{ padding: '10px 8px', fontWeight: 500, color: '#f8fafc' }}>{item.title}</td>
                  <td style={{ padding: '10px 8px', color: '#cbd5e1' }}>{displayCategory}</td>
                  <td style={{ padding: '10px 8px', color: '#94a3b8', textTransform: 'uppercase', fontSize: '11px' }}>{displayType}</td>
                  <td style={{ padding: '10px 8px' }}>{getStatusBadge(item.status)}</td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
};

const StatusBadge: React.FC<{ status: CatalogItem["status"] }> = ({
  status,
}) => {
  const styles: Record<
    CatalogItem["status"],
    { bg: string; text: string; label: string }
  > = {
    pending: { bg: "#f1f5f9", text: "#64748b", label: "Pending" },
    downloading: { bg: "#dbeafe", text: "#1d4ed8", label: "Downloading..." },
    completed: { bg: "#dcfce7", text: "#15803d", label: "Completed" },
    failed: { bg: "#fee2e2", text: "#b91c1c", label: "Failed" },
    skipped: { bg: "#f3f4f6", text: "#9ca3af", label: "Skipped" },
  };

  const style = styles[status] || styles.pending;

  return (
    <span
      style={{
        padding: "4px 8px",
        borderRadius: "4px",
        background: style.bg,
        color: style.text,
        fontWeight: 600,
        fontSize: "11px",
      }}
    >
      {style.label}
    </span>
  );
};
