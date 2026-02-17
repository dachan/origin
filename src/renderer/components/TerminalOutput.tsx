import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { SearchAddon } from '@xterm/addon-search';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { useTerminal } from '../context/TerminalContext';
import { FileSystemLinkProvider } from '../terminal-file-link-provider';
import { showToast } from './Toast';

const SEARCH_MATCH_BG = '#e0af68';
const SEARCH_MATCH_FG = '#1a1b26';
const SEARCH_ACTIVE_BG = '#ff9e64';
const SEARCH_ACTIVE_FG = '#1a1b26';

const SEARCH_FIND_OPTIONS = {
  decorations: {
    matchBackground: SEARCH_MATCH_BG,
    matchBorder: SEARCH_MATCH_BG,
    matchOverviewRuler: SEARCH_MATCH_BG,
    activeMatchBackground: SEARCH_ACTIVE_BG,
    activeMatchBorder: SEARCH_ACTIVE_BG,
    activeMatchColorOverviewRuler: SEARCH_ACTIVE_BG,
  },
};

const TerminalOutput: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { ptyId, terminalRef, isRawMode, isPassthroughMode, togglePassthroughMode, cwdHistoryRef, isSearchOpen, setIsSearchOpen, fontSize, setFontSize } = useTerminal();
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const onDataDisposableRef = useRef<{ dispose: () => void } | null>(null);
  const ptyIdRef = useRef<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const closeSearch = useCallback(() => {
    setIsSearchOpen(false);
    setSearchQuery('');
    searchAddonRef.current?.clearDecorations();
  }, [setIsSearchOpen]);

  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeSearch();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        searchAddonRef.current?.findPrevious(searchQuery, SEARCH_FIND_OPTIONS);
      } else {
        searchAddonRef.current?.findNext(searchQuery, SEARCH_FIND_OPTIONS);
      }
    }
  }, [searchQuery, closeSearch]);

  // Cmd+F to open search; also handles 'terminal:search' custom event
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        setIsSearchOpen(true);
        setTimeout(() => searchInputRef.current?.focus(), 50);
      }
    };
    const customHandler = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      setIsSearchOpen(true);
      if (detail) {
        setSearchQuery(detail);
        setTimeout(() => {
          searchInputRef.current?.focus();
          searchAddonRef.current?.findNext(detail, SEARCH_FIND_OPTIONS);
        }, 50);
      } else {
        setTimeout(() => searchInputRef.current?.focus(), 50);
      }
    };
    window.addEventListener('keydown', handler);
    window.addEventListener('terminal:search', customHandler);
    return () => {
      window.removeEventListener('keydown', handler);
      window.removeEventListener('terminal:search', customHandler);
    };
  }, [setIsSearchOpen]);

  // Initialize xterm.js terminal
  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      allowProposedApi: true,
      cursorBlink: false,
      cursorInactiveStyle: 'none',
      disableStdin: true,
      fontSize,
      lineHeight: 1.15,
      fontFamily: "'SF Mono', 'Menlo', 'Monaco', 'Courier New', monospace",
      theme: {
        background: '#1a1b26',
        foreground: '#c0caf5',
        cursor: '#c0caf5',
        selectionBackground: '#33467c',
        selectionForeground: '#c0caf5',
        black: '#15161e',
        red: '#f7768e',
        green: '#9ece6a',
        yellow: '#e0af68',
        blue: '#7aa2f7',
        magenta: '#bb9af7',
        cyan: '#7dcfff',
        white: '#a9b1d6',
        brightBlack: '#414868',
        brightRed: '#f7768e',
        brightGreen: '#9ece6a',
        brightYellow: '#e0af68',
        brightBlue: '#7aa2f7',
        brightMagenta: '#bb9af7',
        brightCyan: '#7dcfff',
        brightWhite: '#c0caf5',
      },
      scrollback: 10000,
      convertEol: true,
    });

    // Patch registerDecoration to inject foregroundColor for search decorations
    const origRegisterDecoration = term.registerDecoration.bind(term);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    term.registerDecoration = (opts: Record<string, any>) => {
      if (opts.backgroundColor === SEARCH_MATCH_BG) {
        opts = { ...opts, foregroundColor: SEARCH_MATCH_FG, layer: 'top' };
      } else if (opts.backgroundColor === SEARCH_ACTIVE_BG) {
        opts = { ...opts, foregroundColor: SEARCH_ACTIVE_FG, layer: 'top' };
      }
      return origRegisterDecoration(opts);
    };

    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();
    const webLinksAddon = new WebLinksAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(searchAddon);
    term.loadAddon(webLinksAddon);

    searchAddonRef.current = searchAddon;

    term.open(containerRef.current);

    // Try WebGL renderer, fall back to DOM renderer
    try {
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => webglAddon.dispose());
      term.loadAddon(webglAddon);
    } catch {
      // DOM renderer is the fallback
    }

    fitAddon.fit();
    terminalRef.current = term;
    fitAddonRef.current = fitAddon;

    // Register file link provider
    const linkProvider = new FileSystemLinkProvider(ptyIdRef, cwdHistoryRef);
    linkProvider.terminal = term;
    const linkDisposable = term.registerLinkProvider(linkProvider);

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      if (ptyId) {
        window.electronAPI.ptyResize(ptyId, term.cols, term.rows);
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      linkDisposable.dispose();
      resizeObserver.disconnect();
      term.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      searchAddonRef.current = null;
    };
  }, []);

  // Keep ptyIdRef in sync to avoid stale closures in link provider
  useEffect(() => {
    ptyIdRef.current = ptyId;
  }, [ptyId]);

  // Sync PTY resize when ptyId becomes available
  useEffect(() => {
    if (ptyId && terminalRef.current && fitAddonRef.current) {
      fitAddonRef.current.fit();
      window.electronAPI.ptyResize(
        ptyId,
        terminalRef.current.cols,
        terminalRef.current.rows
      );
    }
  }, [ptyId]);

  // Handle raw mode and passthrough mode: toggle stdin and forward keystrokes
  useEffect(() => {
    const term = terminalRef.current;
    if (!term) return;

    const shouldForward = isRawMode || isPassthroughMode;
    term.options.disableStdin = !shouldForward;

    if (shouldForward && ptyId) {
      // Forward xterm.js input directly to PTY
      const disposable = term.onData((data) => {
        window.electronAPI.ptyWrite(ptyId, data);
      });
      onDataDisposableRef.current = disposable;

      // Focus the terminal
      term.focus();

      return () => {
        disposable.dispose();
        onDataDisposableRef.current = null;
      };
    }
  }, [isRawMode, isPassthroughMode, ptyId]);

  // Update terminal font size when it changes
  useEffect(() => {
    const term = terminalRef.current;
    if (term) {
      term.options.fontSize = fontSize;
      fitAddonRef.current?.fit();
    }
  }, [fontSize]);

  // Cmd+=/- to zoom, Cmd+0 to reset
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        const next = Math.min(32, fontSize + 1);
        setFontSize(next);
        showToast(`Font size: ${next}px`);
      } else if (e.key === '-') {
        e.preventDefault();
        const next = Math.max(8, fontSize - 1);
        setFontSize(next);
        showToast(`Font size: ${next}px`);
      } else if (e.key === '0') {
        e.preventDefault();
        setFontSize(14);
        showToast('Font size: 14px (default)');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [fontSize, setFontSize]);

  return (
    <div className="terminal-wrapper">
      {isSearchOpen && (
        <div className="terminal-search-bar">
          <input
            ref={searchInputRef}
            className="terminal-search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              if (e.target.value) {
                searchAddonRef.current?.findNext(e.target.value, SEARCH_FIND_OPTIONS);
              } else {
                searchAddonRef.current?.clearDecorations();
              }
            }}
            onKeyDown={handleSearchKeyDown}
            placeholder="Find in terminal..."
          />
          <button
            className="terminal-search-btn"
            onClick={() => searchAddonRef.current?.findPrevious(searchQuery, SEARCH_FIND_OPTIONS)}
            title="Previous (Shift+Enter)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 15.75l7.5-7.5 7.5 7.5" /></svg>
          </button>
          <button
            className="terminal-search-btn"
            onClick={() => searchAddonRef.current?.findNext(searchQuery, SEARCH_FIND_OPTIONS)}
            title="Next (Enter)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
          </button>
          <button
            className="terminal-search-btn"
            onClick={closeSearch}
            title="Close (Escape)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        </div>
      )}
      <div ref={containerRef} className="terminal-output" />
      {isPassthroughMode && (
        <div className="passthrough-indicator">
          <span className="passthrough-label">Passthrough mode enabled</span>
          <button
            className="passthrough-exit-btn"
            onClick={togglePassthroughMode}
            title="Exit Passthrough Mode (Cmd+E)"
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        </div>
      )}
      {children}
    </div>
  );
};

export default TerminalOutput;
