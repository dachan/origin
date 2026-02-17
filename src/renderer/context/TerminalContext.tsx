import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from 'react';
import type { Terminal } from '@xterm/xterm';
import type { StickyCommand } from '../types/commands';
import type { CwdHistoryEntry } from '../terminal-file-link-provider';

interface TerminalContextValue {
  ptyId: string | null;
  terminalRef: React.MutableRefObject<Terminal | null>;
  cwdHistoryRef: React.MutableRefObject<CwdHistoryEntry[]>;
  history: string[];
  stickyCommands: StickyCommand[];
  isPaletteOpen: boolean;
  isSearchOpen: boolean;
  setIsSearchOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isRawMode: boolean;
  isPassthroughMode: boolean;
  togglePassthroughMode: () => void;
  historyIndex: number;
  executeCommand: (command: string) => void;
  removeFromHistory: (command: string) => void;
  clearHistory: () => void;
  addStickyCommand: (label: string, command: string) => void;
  removeStickyCommand: (id: string) => void;
  reorderStickyCommands: (fromIndex: number, toIndex: number) => void;
  togglePalette: () => void;
  setHistoryIndex: (index: number) => void;
  filterHistory: (prefix: string) => string[];
  fontSize: number;
  setFontSize: (size: number) => void;
}

const TerminalContext = createContext<TerminalContextValue | null>(null);

export function useTerminal(): TerminalContextValue {
  const ctx = useContext(TerminalContext);
  if (!ctx) throw new Error('useTerminal must be used within TerminalProvider');
  return ctx;
}

export const TerminalProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [ptyId, setPtyId] = useState<string | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const cwdHistoryRef = useRef<CwdHistoryEntry[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [stickyCommands, setStickyCommands] = useState<StickyCommand[]>([]);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isRawMode, setIsRawMode] = useState(false);
  const [isPassthroughMode, setIsPassthroughMode] = useState(false);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [fontSize, setFontSizeState] = useState(() => {
    const saved = localStorage.getItem('terminal-font-size');
    return saved ? Number(saved) : 14;
  });

  const setFontSize = useCallback((size: number) => {
    const clamped = Math.max(8, Math.min(32, size));
    setFontSizeState(clamped);
    localStorage.setItem('terminal-font-size', String(clamped));
  }, []);

  const spawnPty = useCallback(async () => {
    const term = terminalRef.current;
    const cols = term?.cols ?? 80;
    const rows = term?.rows ?? 24;
    const { id } = await window.electronAPI.ptySpawn(cols, rows);
    setPtyId(id);
  }, []);

  // Listen for menu-triggered passthrough toggle
  useEffect(() => {
    const unsub = window.electronAPI.onTogglePassthrough(() => {
      setIsPassthroughMode((prev) => !prev);
    });
    return unsub;
  }, []);

  // Initialize PTY and load persisted data
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      // Load persisted data
      const [loadedHistory, loadedSticky] = await Promise.all([
        window.electronAPI.historyLoad(),
        window.electronAPI.stickyLoad(),
      ]);

      if (!mounted) return;
      setHistory(loadedHistory);
      setStickyCommands(loadedSticky);

      await spawnPty();
    };

    init();

    return () => {
      mounted = false;
    };
  }, []);

  // Subscribe to PTY data and handle raw mode detection
  useEffect(() => {
    if (!ptyId) return;

    const unsubData = window.electronAPI.onPtyData(({ id, data }) => {
      if (id !== ptyId) return;

      // Write to terminal
      terminalRef.current?.write(data);

      // Detect alternate screen buffer (raw mode)
      if (data.includes('\x1b[?1049h')) {
        setIsRawMode(true);
      }
      if (data.includes('\x1b[?1049l')) {
        setIsRawMode(false);
      }
    });

    const unsubExit = window.electronAPI.onPtyExit(({ id }) => {
      if (id === ptyId) {
        terminalRef.current?.write('\r\n[Process exited — restarting shell...]\r\n');
        setIsRawMode(false);
        setIsPassthroughMode(false);
        spawnPty();
      }
    });

    return () => {
      unsubData();
      unsubExit();
    };
  }, [ptyId, spawnPty]);

  const executeCommand = useCallback(
    (command: string) => {
      if (!ptyId) return;

      // Snapshot current CWD and cursor line before writing to PTY
      const term = terminalRef.current;
      if (term) {
        const cursorLine =
          term.buffer.active.baseY + term.buffer.active.cursorY;
        window.electronAPI.fsGetCwd(ptyId).then((cwd) => {
          if (cwd) {
            cwdHistoryRef.current.push({ line: cursorLine, cwd });
          }
        }).catch(() => { /* CWD snapshot is best-effort */ });
      }

      // Send to PTY
      window.electronAPI.ptyWrite(ptyId, command + '\n');

      // Append to history
      window.electronAPI.historyAppend(command).catch(() => { /* best-effort */ });
      setHistory((prev) => {
        const filtered = prev.filter((c) => c !== command);
        return [...filtered, command];
      });

      setHistoryIndex(-1);
    },
    [ptyId]
  );

  const removeFromHistory = useCallback(
    (command: string) => {
      window.electronAPI.historyRemove(command);
      setHistory((prev) => prev.filter((c) => c !== command));
    },
    []
  );

  const clearHistory = useCallback(() => {
    window.electronAPI.historyClear();
    setHistory([]);
  }, []);

  const addStickyCommand = useCallback(
    async (label: string, command: string) => {
      const newCmd: StickyCommand = {
        id: `sticky-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        label,
        command,
        createdAt: Date.now(),
      };
      const updated = [newCmd, ...stickyCommands];
      setStickyCommands(updated);
      await window.electronAPI.stickySave(updated);
    },
    [stickyCommands]
  );

  const removeStickyCommand = useCallback(
    async (id: string) => {
      const updated = stickyCommands.filter((c) => c.id !== id);
      setStickyCommands(updated);
      await window.electronAPI.stickySave(updated);
    },
    [stickyCommands]
  );

  const reorderStickyCommands = useCallback(
    async (fromIndex: number, toIndex: number) => {
      const updated = [...stickyCommands];
      const [moved] = updated.splice(fromIndex, 1);
      updated.splice(toIndex, 0, moved);
      setStickyCommands(updated);
      await window.electronAPI.stickySave(updated);
    },
    [stickyCommands]
  );

  const togglePalette = useCallback(() => {
    setIsPaletteOpen((prev) => !prev);
  }, []);

  const togglePassthroughMode = useCallback(() => {
    setIsPassthroughMode((prev) => !prev);
  }, []);

  const filterHistory = useCallback(
    (prefix: string): string[] => {
      const lower = prefix.toLowerCase();
      const matches: string[] = [];
      for (let i = history.length - 1; i >= 0; i--) {
        if (
          history[i].toLowerCase().startsWith(lower) &&
          history[i] !== prefix
        ) {
          matches.push(history[i]);
          if (matches.length >= 10) break;
        }
      }
      return matches;
    },
    [history]
  );

  const value = useMemo(
    () => ({
      ptyId,
      terminalRef,
      cwdHistoryRef,
      history,
      stickyCommands,
      isPaletteOpen,
      isSearchOpen,
      setIsSearchOpen,
      isRawMode,
      isPassthroughMode,
      togglePassthroughMode,
      historyIndex,
      executeCommand,
      removeFromHistory,
      clearHistory,
      addStickyCommand,
      removeStickyCommand,
      reorderStickyCommands,
      togglePalette,
      setHistoryIndex,
      filterHistory,
      fontSize,
      setFontSize,
    }),
    [
      ptyId,
      history,
      stickyCommands,
      isPaletteOpen,
      isSearchOpen,
      isRawMode,
      isPassthroughMode,
      historyIndex,
      fontSize,
      executeCommand,
      removeFromHistory,
      clearHistory,
      addStickyCommand,
      removeStickyCommand,
      reorderStickyCommands,
      togglePalette,
      filterHistory,
      setFontSize,
    ]
  );

  return (
    <TerminalContext.Provider value={value}>
      {children}
    </TerminalContext.Provider>
  );
};
