import React, { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { SearchAddon } from '@xterm/addon-search';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { useTerminal } from '../context/TerminalContext';

const TerminalOutput: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { ptyId, terminalRef, isRawMode } = useTerminal();
  const fitAddonRef = useRef<FitAddon | null>(null);
  const onDataDisposableRef = useRef<{ dispose: () => void } | null>(null);

  // Initialize xterm.js terminal
  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      cursorBlink: false,
      disableStdin: true,
      fontSize: 14,
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

    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();
    const webLinksAddon = new WebLinksAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(searchAddon);
    term.loadAddon(webLinksAddon);

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

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      if (ptyId) {
        window.electronAPI.ptyResize(ptyId, term.cols, term.rows);
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      term.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, []);

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

  // Handle raw mode: toggle stdin and forward keystrokes
  useEffect(() => {
    const term = terminalRef.current;
    if (!term) return;

    term.options.disableStdin = !isRawMode;

    if (isRawMode && ptyId) {
      // In raw mode, forward xterm.js input directly to PTY
      const disposable = term.onData((data) => {
        window.electronAPI.ptyWrite(ptyId, data);
      });
      onDataDisposableRef.current = disposable;

      // Focus the terminal in raw mode
      term.focus();

      return () => {
        disposable.dispose();
        onDataDisposableRef.current = null;
      };
    }
  }, [isRawMode, ptyId]);

  return <div ref={containerRef} className="terminal-output" />;
};

export default TerminalOutput;
