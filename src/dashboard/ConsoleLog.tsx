import React, { useEffect, useRef } from 'react';
import type { LogEntry } from '../types';

export const ConsoleLog: React.FC<{ logs: LogEntry[] }> = ({ logs }) => {
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div style={{ height: '160px', background: '#0f172a', color: '#f8fafc', padding: '12px', borderRadius: '8px', fontFamily: 'monospace', fontSize: '12px', overflowY: 'auto' }}>
      <div style={{ color: '#64748b', marginBottom: '8px', fontSize: '11px', textTransform: 'uppercase' }}>Activity Console Log</div>
      {logs.map((log, index) => (
        <div key={index} style={{ marginBottom: '4px' }}>
          <span style={{ color: '#64748b', marginRight: '8px' }}>[{log.timestamp}]</span>
          <span style={{ color: log.type === 'error' ? '#f87171' : log.type === 'success' ? '#4ade80' : log.type === 'warning' ? '#facc15' : '#38bdf8' }}>
            {log.message}
          </span>
        </div>
      ))}
      <div ref={logEndRef} />
    </div>
  );
};