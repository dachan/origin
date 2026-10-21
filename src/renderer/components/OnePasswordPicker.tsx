import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { OnePasswordItem } from '../../shared/types';

interface OnePasswordPickerProps {
  ptyId: string;
  // The password prompt's text; the item picked is remembered for it.
  promptKey: string;
  onFilled: () => void;
  onClose: () => void;
}

type Status =
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'filling' }
  | { kind: 'error'; message: string };

function matches(item: OnePasswordItem, query: string): boolean {
  const q = query.toLowerCase();
  return [item.title, item.subtitle, item.vault].some((s) =>
    s.toLowerCase().includes(q)
  );
}

const OnePasswordPicker: React.FC<OnePasswordPickerProps> = ({
  ptyId,
  promptKey,
  onFilled,
  onClose,
}) => {
  const [items, setItems] = useState<OnePasswordItem[]>([]);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;
    window.electronAPI.opListItems(promptKey).then((result) => {
      if (!mounted) return;
      if (!result.ok) {
        setStatus({ kind: 'error', message: result.error });
        return;
      }
      const { items: loaded, rememberedId } = result.value;
      // The item used last time for this prompt goes first, preselected.
      const remembered = loaded.find((i) => i.id === rememberedId);
      setItems(remembered ? [remembered, ...loaded.filter((i) => i !== remembered)] : loaded);
      setStatus({ kind: 'ready' });
    });
    return () => {
      mounted = false;
    };
  }, [promptKey]);

  const filtered = useMemo(
    () => (query ? items.filter((i) => matches(i, query)) : items),
    [items, query]
  );

  useEffect(() => {
    const el = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const fill = async (item: OnePasswordItem) => {
    setStatus({ kind: 'filling' });
    const result = await window.electronAPI.opFill(ptyId, item, promptKey);
    if (result.ok) {
      onFilled();
    } else {
      setStatus({ kind: 'error', message: result.error });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      setSelectedIndex((i) => (i < filtered.length - 1 ? i + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      setSelectedIndex((i) => (i > 0 ? i - 1 : filtered.length - 1));
    } else if (e.key === 'Enter') {
      const item = filtered[selectedIndex];
      if (item && status.kind === 'ready') fill(item);
    } else {
      return;
    }
    e.preventDefault();
  };

  let message: string | null = null;
  if (status.kind === 'loading') message = 'Waiting for 1Password…';
  else if (status.kind === 'filling') message = 'Filling password…';
  else if (status.kind === 'error') message = status.message;
  else if (filtered.length === 0) message = 'No matching items';

  return (
    <div className="autocomplete-dropdown op-picker">
      <input
        className="palette-search op-picker-search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setSelectedIndex(0);
        }}
        onKeyDown={handleKeyDown}
        placeholder="Fill from 1Password…"
        spellCheck={false}
        autoFocus
      />
      {message ? (
        <div className={`palette-empty ${status.kind === 'error' ? 'op-picker-error' : ''}`}>
          {message}
        </div>
      ) : (
        <div className="op-picker-list" ref={listRef}>
          {filtered.map((item, index) => (
            <div
              key={`${item.accountId}-${item.id}`}
              className={`palette-item ${index === selectedIndex ? 'selected' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault(); // keep focus in the search field
                fill(item);
              }}
            >
              <div className="palette-item-content">
                <span className="palette-item-label">{item.title}</span>
                <span className="palette-item-command">
                  {[item.subtitle, item.vault, item.account].filter(Boolean).join(' · ')}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default OnePasswordPicker;
