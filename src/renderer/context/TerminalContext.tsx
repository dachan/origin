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

interface TerminalContextValue {
  ptyId: string | null;
  terminalRef: React.MutableRefObject<Terminal | null>;
  history: string[];
  stickyCommands: StickyCommand[];
  isPaletteOpen: boolean;
  isRawMode: boolean;
  historyIndex: number;
  executeCommand: (command: string) => void;
  addStickyCommand: (label: string, command: string) => void;
  removeStickyCommand: (id: string) => void;
  togglePalette: () => void;
  setHistoryIndex: (index: number) => void;
  filterHistory: (prefix: string) => string[];
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
  const [history, setHistory] = useState<string[]>([]);
  const [stickyCommands, setStickyCommands] = useState<StickyCommand[]>([]);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [isRawMode, setIsRawMode] = useState(false);
  const [historyIndex, setHistoryIndex] = useState(-1);

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

      // Spawn PTY - initial size, will be resized by TerminalOutput
      const { id } = await window.electronAPI.ptySpawn(80, 24);
      if (!mounted) return;
      setPtyId(id);
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
        // Shell exited - could respawn or show message
        terminalRef.current?.write('\r\n[Process exited]\r\n');
      }
    });

    return () => {
      unsubData();
      unsubExit();
    };
  }, [ptyId]);

  const executeCommand = useCallback(
    (command: string) => {
      if (!ptyId) return;

      // Send to PTY
      window.electronAPI.ptyWrite(ptyId, command + '\n');

      // Append to history
      window.electronAPI.historyAppend(command);
      setHistory((prev) => {
        const filtered = prev.filter((c) => c !== command);
        return [...filtered, command];
      });

      setHistoryIndex(-1);
    },
    [ptyId]
  );

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

  const togglePalette = useCallback(() => {
    setIsPaletteOpen((prev) => !prev);
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
      history,
      stickyCommands,
      isPaletteOpen,
      isRawMode,
      historyIndex,
      executeCommand,
      addStickyCommand,
      removeStickyCommand,
      togglePalette,
      setHistoryIndex,
      filterHistory,
    }),
    [
      ptyId,
      history,
      stickyCommands,
      isPaletteOpen,
      isRawMode,
      historyIndex,
      executeCommand,
      addStickyCommand,
      removeStickyCommand,
      togglePalette,
      filterHistory,
    ]
  );

  return (
    <TerminalContext.Provider value={value}>
      {children}
    </TerminalContext.Provider>
  );
};
