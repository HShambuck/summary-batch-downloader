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
          <span>ACTIVITY CONSOLE LOG</span>
          <span className="sv-console-badge">{logs.length}</span>
        </span>
        <span>{isOpen ? '▼ Collapse' : '▲ Expand Console'}</span>
      </button>

      {isOpen && (
        <div id="sv-console-body" ref={bodyRef} className="sv-console-body" role="log" aria-live="polite">
          {logs.length === 0 ? (
            <div className="sv-console-empty">No activity logged yet...</div>
          ) : (
            logs.map((log) => (
              <div key={log.id} className={`sv-log sv-log-${levelOf(log)}`}>
                <span className="sv-log-time">[{log.timestamp}]&nbsp;</span>
                <span className="sv-log-msg">{log.message}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};