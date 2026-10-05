import { useEffect, useState } from 'react';
import type { QueueItem, StorageState } from './types';

export function App() {
  const [completedCount, setCompletedCount] = useState<number>(0);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('Ready');

  const updateProgress = () => {
    chrome.runtime.sendMessage({ action: 'GET_PROGRESS' }, (response: StorageState) => {
      if (!response) return;
      const completed = response.completedCount ?? 0;
      const total = response.totalCount ?? 0;
      const running = response.isRunning ?? false;

      setCompletedCount(completed);
      setTotalCount(total);
      setIsRunning(running);

      if (running) {
        setStatusMessage('Downloading queue...');
      } else if (total > 0 && completed === total) {
        setStatusMessage('All downloads completed!');
      } else {
        setStatusMessage('Idle');
      }
    });
  };

  useEffect(() => {
    updateProgress();
    const interval = setInterval(updateProgress, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleDownloadCurrentPage = async () => {
    setStatusMessage('Scanning active page...');
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab?.id) {
      setStatusMessage('Error: No active tab found.');
      return;
    }

    chrome.tabs.sendMessage(
      tab.id,
      { action: 'SCRAPE_PAGE' },
      (response?: { data: QueueItem[] }) => {
        if (chrome.runtime.lastError) {
          setStatusMessage('Please reload the Summary.com page and try again.');
          return;
        }

        if (response?.data && response.data.length > 0) {
          chrome.runtime.sendMessage(
            { action: 'START_QUEUE', items: response.data },
            () => updateProgress()
          );
        } else {
          setStatusMessage('No PDF or MP3 links detected on this page.');
        }
      }
    );
  };

  const handleStopQueue = async () => {
    await chrome.storage.local.set({ isRunning: false });
    updateProgress();
  };

  const percent = totalCount > 0 ? Math.min((completedCount / totalCount) * 100, 100) : 0;

  return (
    <div style={{ width: '300px', padding: '16px', fontFamily: 'sans-serif' }}>
      <h3 style={{ margin: '0 0 12px 0', fontSize: '16px' }}>Summary.com Downloader</h3>
      
      <button
        onClick={handleDownloadCurrentPage}
        disabled={isRunning}
        style={{
          width: '100%',
          padding: '10px',
          backgroundColor: isRunning ? '#cbd5e1' : '#2563eb',
          color: '#ffffff',
          border: 'none',
          borderRadius: '6px',
          fontWeight: 600,
          cursor: isRunning ? 'not-allowed' : 'pointer',
          marginBottom: '12px'
        }}
      >
        Download Current Summary
      </button>

      <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 600 }}>
          <span>Queue Status</span>
          <span>{completedCount} / {totalCount}</span>
        </div>

        <div style={{ height: '8px', backgroundColor: '#e2e8f0', borderRadius: '4px', overflow: 'hidden', marginTop: '8px' }}>
          <div
            style={{
              height: '100%',
              backgroundColor: '#2563eb',
              width: `${percent}%`,
              transition: 'width 0.3s ease'
            }}
          />
        </div>

        <p style={{ margin: '8px 0 0 0', fontSize: '12px', color: '#64748b' }}>{statusMessage}</p>
      </div>

      {isRunning && (
        <button
          onClick={handleStopQueue}
          style={{
            width: '100%',
            padding: '8px',
            backgroundColor: '#ef4444',
            color: '#ffffff',
            border: 'none',
            borderRadius: '6px',
            fontWeight: 600,
            cursor: 'pointer',
            marginTop: '12px'
          }}
        >
          Stop Downloading
        </button>
      )}
    </div>
  );
}

export default App;