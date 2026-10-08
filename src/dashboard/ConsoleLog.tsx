import React, { useEffect, useRef, useState } from 'react';
import type { LogEntry } from '../types';

interface ConsoleLogProps {
  logs: LogEntry[];
}

const levelOf = (log: LogEntry): 'error' | 'success' | 'info' => {
  if (log.level === 'error' || log.type === 'error') return 'error';
  if (log.level === 'success' || log.type === 'success') return 'success';
  return 'info';
};

export const ConsoleLog: React.FC<ConsoleLogProps> = ({ logs }) => {
  const [isOpen, setIsOpen] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Keep the newest entry in view while the console is open.
  useEffect(() => {
    if (isOpen && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [logs.length, isOpen]);

  const errorCount = logs.filter((l) => levelOf(l) === 'error').length;
  const last = logs[logs.length - 1];

  return (
    <div className={`sv-console ${isOpen ? 'is-open' : ''}`}>
      <button
        type="button"
        className="sv-console-head"
        onClick={() => setIsOpen((o) => !o)}
        aria-expanded={isOpen}
        aria-controls="sv-console-body"
      >
        <span className="sv-console-left">
          <span>Activity log</span>
          <span className="sv-console-badge">{logs.length}</span>
          {errorCount > 0 && (
            <span className="sv-console-badge is-err">
              {errorCount} {errorCount === 1 ? 'error' : 'errors'}
            </span>
          )}
          {!isOpen && last && <span className="sv-console-last">{last.message}</span>}
        </span>
        <svg className="sv-console-chevron" width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path d="M3 9l4-4 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {isOpen && (
        <div id="sv-console-body" ref={bodyRef} className="sv-console-body" role="log" aria-live="polite">
          {logs.length === 0 ? (
            <div className="sv-console-empty">Nothing logged yet. Scans and downloads will show up here.</div>
          ) : (
            logs.map((log) => (
              <div key={log.id} className={`sv-log sv-log-${levelOf(log)}`}>
                <span className="sv-log-time">{log.timestamp}</span>
                <span className="sv-log-msg">{log.message}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};