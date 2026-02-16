import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useTerminal } from '../context/TerminalContext';

const CommandPalette: React.FC = () => {
  const {
    isPaletteOpen,
    togglePalette,
    history,
    stickyCommands,
    executeCommand,
    addStickyCommand,
    removeStickyCommand,
  } = useTerminal();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

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
      .slice(-20)
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
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isPaletteOpen]);

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
      const label = window.prompt('Label for this command:', command);
      if (label) {
        addStickyCommand(label, command);
      }
    },
    [addStickyCommand]
  );

  const handleUnpin = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      removeStickyCommand(id);
    },
    [removeStickyCommand]
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
        </div>
        <div className="palette-list">
          {filteredItems.length === 0 && (
            <div className="palette-empty">No matching commands</div>
          )}
          {filteredItems.map((item, index) => (
            <div
              key={`${item.type}-${item.id}`}
              className={`palette-item ${index === selectedIndex ? 'selected' : ''} ${item.type === 'sticky' ? 'sticky' : ''}`}
              onClick={() => handleSelect(item)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              {item.type === 'sticky' && (
                <span className="sticky-pin" title="Pinned">
                  &#x1F4CC;
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
                  title="Unpin"
                >
                  &times;
                </button>
              ) : (
                <button
                  className="palette-item-action palette-item-pin"
                  onClick={(e) => handlePin(e, item.command)}
                  title="Pin as sticky"
                >
                  Pin
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
