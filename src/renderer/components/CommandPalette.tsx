import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useTerminal } from '../context/TerminalContext';
import { showToast } from './Toast';
import { StarOutlineIcon, StarSolidIcon, XMarkIcon } from './icons';

// A row in the palette: a starred (sticky) command or a plain history entry.
interface PaletteItem {
  type: 'sticky' | 'history';
  id: string;
  label: string;
  command: string;
}

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
    reorderStickyCommands,
  } = useTerminal();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const dragIndexRef = useRef<number | null>(null);
  const [pinningCommand, setPinningCommand] = useState<string | null>(null);
  const [pinLabel, setPinLabel] = useState('');
  const [confirmingClear, setConfirmingClear] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pinInputRef = useRef<HTMLInputElement>(null);

  // Build combined list: sticky commands first, then recent history
  const filteredItems = useMemo((): PaletteItem[] => {
    const query = searchQuery.toLowerCase();

    const stickyItems = stickyCommands
      .filter(
        (s) =>
          s.label.toLowerCase().includes(query) ||
          s.command.toLowerCase().includes(query)
      )
      .map((s): PaletteItem => ({
        type: 'sticky',
        id: s.id,
        label: s.label,
        command: s.command,
      }));

    const recentItems = history
      .filter((cmd) => cmd.toLowerCase().includes(query))
      .reverse()
      .filter((cmd) => !stickyCommands.some((s) => s.command === cmd))
      .map((cmd): PaletteItem => ({
        type: 'history',
        id: cmd,
        label: cmd,
        command: cmd,
      }));

    return [...stickyItems, ...recentItems];
  }, [searchQuery, stickyCommands, history]);

  // Focus input when palette opens
  useEffect(() => {
    if (isPaletteOpen) {
      setSearchQuery('');
      setSelectedIndex(0);
      setPinningCommand(null);
      setConfirmingClear(false);
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
    (item: PaletteItem) => {
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
      showToast('Command starred');
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
      showToast('Command unstarred');
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
              className={`palette-clear-all-btn ${confirmingClear ? 'confirming' : ''}`}
              onClick={() => {
                if (confirmingClear) {
                  clearHistory();
                  setSearchQuery('');
                  setSelectedIndex(0);
                  setConfirmingClear(false);
                  showToast('History cleared');
                } else {
                  setConfirmingClear(true);
                }
              }}
              onBlur={() => setConfirmingClear(false)}
              title="Clear all history"
            >
              {confirmingClear ? 'Confirm?' : 'Clear History'}
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
            <div className="palette-empty">
              {searchQuery
                ? 'No matching commands'
                : 'Run some commands to build your history'}
            </div>
          )}
          {pinningCommand === null && filteredItems.map((item, index) => {
            const stickyIndex = item.type === 'sticky'
              ? stickyCommands.findIndex((s) => s.id === item.id)
              : -1;
            return (
            <div
              key={`${item.type}-${item.id}`}
              className={`palette-item ${index === selectedIndex ? 'selected' : ''} ${item.type === 'sticky' ? 'sticky' : ''}`}
              onClick={() => handleSelect(item)}
              onMouseEnter={() => setSelectedIndex(index)}
              draggable={item.type === 'sticky'}
              onDragStart={() => { dragIndexRef.current = stickyIndex; }}
              onDragOver={(e) => {
                if (item.type === 'sticky' && dragIndexRef.current !== null) {
                  e.preventDefault();
                }
              }}
              onDrop={() => {
                if (item.type === 'sticky' && dragIndexRef.current !== null && dragIndexRef.current !== stickyIndex) {
                  reorderStickyCommands(dragIndexRef.current, stickyIndex);
                }
                dragIndexRef.current = null;
              }}
              onDragEnd={() => { dragIndexRef.current = null; }}
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
            );
          })}
        </div>
        <div className="palette-footer">
          <span><kbd>Enter</kbd> Run</span>
          <span><kbd>↑↓</kbd> Navigate</span>
          <span><kbd>Esc</kbd> Close</span>
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
