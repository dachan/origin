import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useTerminal } from '../context/TerminalContext';

const ICON_SIZE = 14;

// Heroicons: star (outline)
const StarOutlineIcon: React.FC = () => (
  <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <path d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
  </svg>
);

// Heroicons: star (solid)
const StarSolidIcon: React.FC = () => (
  <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="currentColor">
    <path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.006 5.404.434c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.434 2.082-5.005Z" clipRule="evenodd" />
  </svg>
);

// Heroicons: x-mark (outline)
const XMarkIcon: React.FC = () => (
  <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 18 18 6M6 6l12 12" />
  </svg>
);

const CommandPalette: React.FC = () => {
  const {
    isPaletteOpen,
    togglePalette,
    history,
    stickyCommands,
    executeCommand,
    removeFromHistory,
    clearHistory,
    addStickyCommand,
    removeStickyCommand,
  } = useTerminal();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [pinningCommand, setPinningCommand] = useState<string | null>(null);
  const [pinLabel, setPinLabel] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const pinInputRef = useRef<HTMLInputElement>(null);

  // Build combined list: sticky commands first, then recent history
  const filteredItems = useMemo(() => {
    const query = searchQuery.toLowerCase();

    const stickyItems = stickyCommands
      .filter(
        (s) =>
          s.label.toLowerCase().includes(query) ||
          s.command.toLowerCase().includes(query)
      )
      .map((s) => ({ type: 'sticky' as const, ...s }));

    const recentItems = history
      .filter((cmd) => cmd.toLowerCase().includes(query))
      .reverse()
      .filter((cmd) => !stickyCommands.some((s) => s.command === cmd))
      .map((cmd) => ({
        type: 'history' as const,
        id: cmd,
        label: cmd,
        command: cmd,
        createdAt: 0,
      }));

    return [...stickyItems, ...recentItems];
  }, [searchQuery, stickyCommands, history]);

  // Focus input when palette opens
  useEffect(() => {
    if (isPaletteOpen) {
      setSearchQuery('');
      setSelectedIndex(0);
      setPinningCommand(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isPaletteOpen]);

  // Focus pin label input when pinning
  useEffect(() => {
    if (pinningCommand !== null) {
      setTimeout(() => pinInputRef.current?.focus(), 50);
    }
  }, [pinningCommand]);

  const handleSelect = useCallback(
    (item: (typeof filteredItems)[0]) => {
      executeCommand(item.command);
      togglePalette();
    },
    [executeCommand, togglePalette]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        togglePalette();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) =>
          Math.min(prev + 1, filteredItems.length - 1)
        );
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredItems[selectedIndex]) {
          handleSelect(filteredItems[selectedIndex]);
        }
      }
    },
    [filteredItems, selectedIndex, handleSelect, togglePalette]
  );

  const handlePin = useCallback(
    (e: React.MouseEvent, command: string) => {
      e.stopPropagation();
      setPinningCommand(command);
      setPinLabel(command);
    },
    []
  );

  const handlePinConfirm = useCallback(() => {
    if (pinningCommand && pinLabel.trim()) {
      addStickyCommand(pinLabel.trim(), pinningCommand);
    }
    setPinningCommand(null);
    setPinLabel('');
  }, [pinningCommand, pinLabel, addStickyCommand]);

  const handlePinCancel = useCallback(() => {
    setPinningCommand(null);
    setPinLabel('');
  }, []);

  const handleUnpin = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      removeStickyCommand(id);
    },
    [removeStickyCommand]
  );

  const handleRemoveHistory = useCallback(
    (e: React.MouseEvent, command: string) => {
      e.preventDefault();
      e.stopPropagation();
      removeFromHistory(command);
    },
    [removeFromHistory]
  );

  if (!isPaletteOpen) return null;

  return (
    <div className="palette-overlay" onClick={togglePalette}>
      <div className="palette-modal" onClick={(e) => e.stopPropagation()}>
        <div className="palette-header">
          <input
            ref={inputRef}
            className="palette-search"
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search commands..."
          />
          {history.length > 0 && (
            <button
              className="palette-clear-all-btn"
              onClick={() => {
                clearHistory();
                setSearchQuery('');
                setSelectedIndex(0);
              }}
              title="Clear all history"
            >
              Clear History
            </button>
          )}
        </div>
        <div className="palette-list">
          {pinningCommand !== null && (
            <div className="palette-pin-form" onClick={(e) => e.stopPropagation()}>
              <label className="palette-pin-label">Label for pinned command:</label>
              <div className="palette-pin-row">
                <input
                  ref={pinInputRef}
                  className="palette-pin-input"
                  type="text"
                  value={pinLabel}
                  onChange={(e) => setPinLabel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handlePinConfirm();
                    if (e.key === 'Escape') handlePinCancel();
                  }}
                  placeholder="Enter a label..."
                />
                <button className="palette-pin-btn" onClick={handlePinConfirm}>Save</button>
                <button className="palette-pin-btn cancel" onClick={handlePinCancel}>Cancel</button>
              </div>
            </div>
          )}
          {pinningCommand === null && filteredItems.length === 0 && (
            <div className="palette-empty">No matching commands</div>
          )}
          {pinningCommand === null && filteredItems.map((item, index) => (
            <div
              key={`${item.type}-${item.id}`}
              className={`palette-item ${index === selectedIndex ? 'selected' : ''} ${item.type === 'sticky' ? 'sticky' : ''}`}
              onClick={() => handleSelect(item)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              {item.type === 'sticky' && (
                <span className="sticky-pin" title="Starred">
                  <StarSolidIcon />
                </span>
              )}
              <div className="palette-item-content">
                <span className="palette-item-label">{item.label}</span>
                {item.type === 'sticky' && item.label !== item.command && (
                  <span className="palette-item-command">{item.command}</span>
                )}
              </div>
              {item.type === 'sticky' ? (
                <button
                  className="palette-item-action"
                  onClick={(e) => handleUnpin(e, item.id)}
                  title="Unstar"
                >
                  <XMarkIcon />
                </button>
              ) : (
                <>
                  <button
                    className="palette-item-action palette-item-pin"
                    onClick={(e) => handlePin(e, item.command)}
                    title="Star command"
                  >
                    <StarOutlineIcon />
                  </button>
                  <button
                    className="palette-item-action palette-item-delete"
                    onMouseDown={(e) => handleRemoveHistory(e, item.command)}
                    title="Remove from history"
                  >
                    <XMarkIcon />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
