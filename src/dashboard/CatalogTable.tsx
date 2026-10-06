import React from 'react';
import type { CatalogItem } from '../types';

interface Props {
  items: CatalogItem[];
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
}

export const CatalogTable: React.FC<Props> = ({ items, selectedIds, onToggleSelect, onToggleSelectAll }) => {
  const allSelected = items.length > 0 && selectedIds.length === items.length;

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
        <thead>
          <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
            <th style={{ padding: '12px', width: '40px' }}>
              <input type="checkbox" checked={allSelected} onChange={onToggleSelectAll} />
            </th>
            <th style={{ padding: '12px' }}>Title</th>
            <th style={{ padding: '12px' }}>Competency / Category</th>
            <th style={{ padding: '12px' }}>Type</th>
            <th style={{ padding: '12px' }}>Available Formats</th>
            <th style={{ padding: '12px' }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const isSelected = selectedIds.includes(item.id);
            return (
              <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9', background: isSelected ? '#f8fafc' : 'transparent' }}>
                <td style={{ padding: '12px' }}>
                  <input type="checkbox" checked={isSelected} onChange={() => onToggleSelect(item.id)} />
                </td>
                <td style={{ padding: '12px', fontWeight: 500 }}>{item.title}</td>
                <td style={{ padding: '12px', color: '#475569' }}>{item.competency}</td>
                <td style={{ padding: '12px' }}>
                  <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: item.contentType === 'webinar' ? '#fef3c7' : '#e0e7ff', color: item.contentType === 'webinar' ? '#92400e' : '#3730a3' }}>
                    {item.contentType === 'webinar' ? 'Webinar' : 'Summary'}
                  </span>
                </td>
                <td style={{ padding: '12px' }}>
                  <span style={{ marginRight: '6px' }}>{item.pdfUrl ? '📄 PDF' : ''}</span>
                  <span>{item.mp3Url ? '🎧 MP3' : ''}</span>
                </td>
                <td style={{ padding: '12px' }}>
                  <StatusBadge status={item.status} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

const StatusBadge: React.FC<{ status: CatalogItem['status'] }> = ({ status }) => {
  const styles: Record<CatalogItem['status'], { bg: string; text: string; label: string }> = {
    pending: { bg: '#f1f5f9', text: '#64748b', label: 'Pending' },
    downloading: { bg: '#dbeafe', text: '#1d4ed8', label: 'Downloading...' },
    completed: { bg: '#dcfce7', text: '#15803d', label: 'Completed' },
    failed: { bg: '#fee2e2', text: '#b91c1c', label: 'Failed' },
    skipped: { bg: '#f3f4f6', text: '#9ca3af', label: 'Skipped' },
  };

  const style = styles[status] || styles.pending;

  return (
    <span style={{ padding: '4px 8px', borderRadius: '4px', background: style.bg, color: style.text, fontWeight: 600, fontSize: '11px' }}>
      {style.label}
    </span>
  );
};