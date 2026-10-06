import { useEffect, useState } from 'react';
import type { StorageState } from './types';

export function App() {
  const [completedCount, setCompletedCount] = useState<number>(0);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [isRunning, setIsRunning] = useState<boolean>(false);

  useEffect(() => {
    chrome.storage.local.get(['completedCount', 'totalCount', 'isRunning'], (data: StorageState) => {
      setCompletedCount(data.completedCount ?? 0);
      setTotalCount(data.totalCount ?? 0);
      setIsRunning(data.isRunning ?? false);
    });
  }, []);

  const openDashboard = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
  };

  return (
    <div style={{ width: '280px', padding: '16px', fontFamily: 'sans-serif' }}>
      <h3 style={{ margin: '0 0 8px 0', fontSize: '15px' }}>Summary.com Downloader</h3>
      <p style={{ margin: '0 0 12px 0', fontSize: '12px', color: '#64748b' }}>
        Manage full catalog batch exports & competencies in the control dashboard.
      </p>

      <button
        onClick={openDashboard}
        style={{
          width: '100%',
          padding: '10px',
          background: '#2563eb',
          color: '#ffffff',
          border: 'none',
          borderRadius: '6px',
          fontWeight: 600,
          cursor: 'pointer',
          marginBottom: '12px',
        }}
      >
        🖥️ Open Control Dashboard
      </button>

      <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px', fontSize: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
          <span>Active Batch</span>
          <span>{completedCount} / {totalCount}</span>
        </div>
        <p style={{ margin: '4px 0 0 0', color: '#64748b' }}>
          Status: {isRunning ? 'Downloading...' : 'Idle'}
        </p>
      </div>
    </div>
  );
}

export default App;