import React, { useState } from 'react';
import type { LogEntry } from '../types';

interface ConsoleLogProps {
  logs: LogEntry[];
}

export const ConsoleLog: React.FC<ConsoleLogProps> = ({ logs }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        right: '24px',
        width: 'calc(100% - 310px)',
        zIndex: 1000,
        backgroundColor: '#0f172a',
        borderTopLeftRadius: '8px',
        borderTopRightRadius: '8px',
        boxShadow: '0 -4px 12px rgba(0, 0, 0, 0.15)',
        transition: 'height 0.3s ease-in-out',
        height: isOpen ? '240px' : '36px',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Retractable Tab Header */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        style={{
          height: '36px',
          padding: '0 16px',
          backgroundColor: '#1e293b',
          color: '#f8fafc',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
          userSelect: 'none',
          fontSize: '12px',
          fontWeight: 600,
          borderTopLeftRadius: '8px',
          borderTopRightRadius: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>ACTIVITY CONSOLE LOG</span>
          <span
            style={{
              backgroundColor: '#334155',
              padding: '2px 8px',
              borderRadius: '12px',
              fontSize: '11px',
            }}
          >
            {logs.length}
          </span>
        </div>
        <span>{isOpen ? '▼ Collapse' : '▲ Expand Console'}</span>
      </div>

      {/* Expandable Console Body */}
      {isOpen && (
        <div
          style={{
            flex: 1,
            padding: '12px 16px',
            overflowY: 'auto',
            fontFamily: 'monospace',
            fontSize: '12px',
            color: '#e2e8f0',
          }}
        >
          {logs.length === 0 ? (
            <div style={{ color: '#64748b' }}>No activity logged yet...</div>
          ) : (
            logs.map((log) => (
              <div key={log.id} style={{ marginBottom: '4px' }}>
                <span style={{ color: '#64748b', marginRight: '8px' }}>[{log.timestamp}]</span>
                <span
                  style={{
                    color:
                      log.level === 'error' || log.type === 'error'
                        ? '#f87171'
                        : log.level === 'success' || log.type === 'success'
                        ? '#4ade80'
                        : '#94a3b8',
                  }}
                >
                  {log.message}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};