import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useTerminal } from '../context/TerminalContext';
import { suppressTooltips } from '../terminal-file-link-provider';

interface MenuPosition {
  x: number;
  y: number;
}

interface MenuItem {
  label: string;
  action: () => void;
  separator?: false;
}

interface MenuSeparator {
  separator: true;
}

type MenuEntry = MenuItem | MenuSeparator;

const ContextMenu: React.FC = () => {
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const [items, setItems] = useState<MenuEntry[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);
  const { ptyId, terminalRef } = useTerminal();

  const close = useCallback(() => {
    setPosition(null);
    setItems([]);
    suppressTooltips(false);
  }, []);

  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      const target = e.target as Node;
      const terminalEl = document.querySelector('.terminal-output');
      const inputEl = document.querySelector('.command-input-container');
      const inTerminal = terminalEl?.contains(target);
      const inInput = inputEl?.contains(target);

      if (!inTerminal && !inInput) return;

      e.preventDefault();

      const term = terminalRef.current;
      const termSelection = term?.getSelection() || '';
      // Also check for selected text in the input textarea
      const textarea = inputEl?.querySelector('textarea') as HTMLTextAreaElement | null;
      const inputSelection = textarea ? textarea.value.slice(textarea.selectionStart, textarea.selectionEnd) : '';
      const selection = termSelection || inputSelection;
      const menuItems: MenuEntry[] = [];

      if (selection) {
        menuItems.push({
          label: 'Copy',
          action: () => {
            navigator.clipboard.writeText(selection);
            close();
          },
        });
        menuItems.push({
          label: 'Search Selection',
          action: () => {
            window.dispatchEvent(
              new CustomEvent('terminal:search', { detail: selection })
            );
            close();
          },
        });
        menuItems.push({ separator: true });
      }

      // Paste only in the input area
      if (inInput) {
        menuItems.push({
          label: 'Paste',
          action: async () => {
            const text = await navigator.clipboard.readText();
            if (text) {
              // Insert into the textarea by dispatching an input event
              const textarea = inputEl?.querySelector('textarea');
              if (textarea) {
                const start = textarea.selectionStart;
                const end = textarea.selectionEnd;
                const current = textarea.value;
                const newValue = current.slice(0, start) + text + current.slice(end);
                // Use native setter to trigger React's onChange
                const nativeSetter = Object.getOwnPropertyDescriptor(
                  window.HTMLTextAreaElement.prototype, 'value'
                )?.set;
                nativeSetter?.call(textarea, newValue);
                textarea.dispatchEvent(new Event('input', { bubbles: true }));
                // Set cursor after pasted text
                const newPos = start + text.length;
                requestAnimationFrame(() => {
                  textarea.selectionStart = newPos;
                  textarea.selectionEnd = newPos;
                });
              }
            }
            close();
          },
        });
        menuItems.push({ separator: true });
      }

      menuItems.push({
        label: 'Clear Terminal',
        action: () => {
          if (ptyId) {
            window.electronAPI.ptyWrite(ptyId, 'clear\n');
          }
          close();
        },
      });

      setItems(menuItems);
      setPosition({ x: e.clientX, y: e.clientY });
      suppressTooltips(true);
    };

    const handleClick = () => {
      close();
    };

    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('click', handleClick);
    return () => {
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('click', handleClick);
    };
  }, [ptyId, terminalRef, close]);

  // Adjust position if menu would overflow viewport
  useEffect(() => {
    if (!position || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const newPos = { ...position };
    if (rect.right > window.innerWidth) {
      newPos.x = window.innerWidth - rect.width - 4;
    }
    if (rect.bottom > window.innerHeight) {
      newPos.y = window.innerHeight - rect.height - 4;
    }
    if (newPos.x !== position.x || newPos.y !== position.y) {
      setPosition(newPos);
    }
  }, [position]);

  if (!position) return null;

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{ left: position.x, top: position.y }}
    >
      {items.map((entry, i) =>
        'separator' in entry && entry.separator ? (
          <div key={i} className="context-menu-separator" />
        ) : (
          <div
            key={i}
            className="context-menu-item"
            onClick={(entry as MenuItem).action}
          >
            {(entry as MenuItem).label}
          </div>
        )
      )}
    </div>
  );
};

export default ContextMenu;
