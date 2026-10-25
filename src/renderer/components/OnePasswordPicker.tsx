import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { OnePasswordField, OnePasswordItem } from '../../shared/types';
import { promptUser } from '../password-prompt';

interface OnePasswordPickerProps {
  ptyId: string;
  // The password prompt's text; the item and field picked are remembered for it.
  promptKey: string;
  onFilled: () => void;
  onClose: () => void;
}

type Status =
  | { kind: 'loading'; message: string }
  | { kind: 'ready' }
  | { kind: 'filling' }
  | { kind: 'error'; message: string };

// The picker lists items first, then the password fields of the item chosen
// when it has more than one.
type Step =
  | { kind: 'items' }
  | { kind: 'fields'; item: OnePasswordItem; fields: OnePasswordField[] };

interface Row {
  key: string;
  label: string;
  detail: string;
}

function matches(row: Row, query: string): boolean {
  const q = query.toLowerCase();
  return [row.label, row.detail].some((s) => s.toLowerCase().includes(q));
}

const itemRow = (item: OnePasswordItem): Row => ({
  key: `${item.accountId}-${item.id}`,
  label: item.title,
  detail: [item.subtitle, item.vault, item.account].filter(Boolean).join(' · '),
});

const fieldRow = (field: OnePasswordField): Row => ({
  key: field.id,
  label: field.label,
  detail: field.section,
});

// Preselects the field used last time, else the one labelled with the user the
// prompt asks for ("[sudo] password for david:" → david), else the first.
function initialFieldIndex(
  fields: OnePasswordField[],
  rememberedFieldId: string | null,
  user: string | null
): number {
  const remembered = fields.findIndex((f) => f.id === rememberedFieldId);
  if (remembered >= 0) return remembered;
  const forUser = user ? fields.findIndex((f) => f.label.toLowerCase() === user.toLowerCase()) : -1;
  return Math.max(forUser, 0);
}

const OnePasswordPicker: React.FC<OnePasswordPickerProps> = ({
  ptyId,
  promptKey,
  onFilled,
  onClose,
}) => {
  const [items, setItems] = useState<OnePasswordItem[]>([]);
  const [rememberedFieldId, setRememberedFieldId] = useState<string | null>(null);
  const [step, setStep] = useState<Step>({ kind: 'items' });
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [status, setStatus] = useState<Status>({ kind: 'loading', message: 'Waiting for 1Password…' });
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
      setRememberedFieldId(result.value.rememberedFieldId);
      setStatus({ kind: 'ready' });
    });
    return () => {
      mounted = false;
    };
  }, [promptKey]);

  const rows = useMemo(
    () => (step.kind === 'items' ? items.map(itemRow) : step.fields.map(fieldRow)),
    [step, items]
  );
  const filtered = useMemo(
    () => rows.map((row, index) => ({ row, index })).filter(({ row }) => !query || matches(row, query)),
    [rows, query]
  );

  useEffect(() => {
    const el = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const fill = async (item: OnePasswordItem, field: OnePasswordField) => {
    setStatus({ kind: 'filling' });
    const result = await window.electronAPI.opFill(ptyId, { item, field }, promptKey);
    if (result.ok) {
      onFilled();
    } else {
      setStatus({ kind: 'error', message: result.error });
    }
  };

  const chooseItem = async (item: OnePasswordItem) => {
    setStatus({ kind: 'loading', message: `Reading ${item.title}…` });
    const result = await window.electronAPI.opListFields(item);
    if (!result.ok) {
      setStatus({ kind: 'error', message: result.error });
      return;
    }
    const fields = result.value;
    if (fields.length === 0) {
      setStatus({ kind: 'error', message: `${item.title} has no password fields` });
    } else if (fields.length === 1) {
      fill(item, fields[0]);
    } else {
      setStep({ kind: 'fields', item, fields });
      setQuery('');
      setSelectedIndex(initialFieldIndex(fields, rememberedFieldId, promptUser(promptKey)));
      setStatus({ kind: 'ready' });
    }
  };

  const choose = (index: number) => {
    if (status.kind !== 'ready') return;
    if (step.kind === 'items') chooseItem(items[index]);
    else fill(step.item, step.fields[index]);
  };

  const backToItems = () => {
    setStep({ kind: 'items' });
    setQuery('');
    setSelectedIndex(0);
    setStatus({ kind: 'ready' });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      if (step.kind === 'fields') backToItems();
      else onClose();
    } else if (e.key === 'ArrowDown') {
      setSelectedIndex((i) => (i < filtered.length - 1 ? i + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      setSelectedIndex((i) => (i > 0 ? i - 1 : filtered.length - 1));
    } else if (e.key === 'Enter') {
      const selected = filtered[selectedIndex];
      if (selected) choose(selected.index);
    } else {
      return;
    }
    e.preventDefault();
  };

  let message: string | null = null;
  if (status.kind === 'loading' || status.kind === 'error') message = status.message;
  else if (status.kind === 'filling') message = 'Filling password…';
  else if (filtered.length === 0) message = 'No matches';

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
        placeholder={
          step.kind === 'items'
            ? 'Fill from 1Password…'
            : `Which ${step.item.title} password? (Esc to go back)`
        }
        spellCheck={false}
        autoFocus
      />
      {message ? (
        <div className={`palette-empty ${status.kind === 'error' ? 'op-picker-error' : ''}`}>
          {message}
        </div>
      ) : (
        <div className="op-picker-list" ref={listRef}>
          {filtered.map(({ row, index }, position) => (
            <div
              key={row.key}
              className={`palette-item ${position === selectedIndex ? 'selected' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault(); // keep focus in the search field
                choose(index);
              }}
            >
              <div className="palette-item-content">
                <span className="palette-item-label">{row.label}</span>
                <span className="palette-item-command">{row.detail}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default OnePasswordPicker;
