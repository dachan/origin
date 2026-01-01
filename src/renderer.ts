import './index.css';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

declare global {
  interface Window {
    electronAPI: {
      sendInput: (data: string) => void;
      resize: (cols: number, rows: number) => void;
      onData: (callback: (data: string) => void) => void;
    };
  }
}

const terminal = new Terminal({
  cursorBlink: true,
  fontFamily: 'monospace',
  fontSize: 14,
});

const fitAddon = new FitAddon();
terminal.loadAddon(fitAddon);

const container = document.getElementById('terminal');
if (container) {
  terminal.open(container);
  fitAddon.fit();

  // Send terminal input to main process
  terminal.onData((data) => {
    window.electronAPI.sendInput(data);
  });

  // Receive output from main process
  window.electronAPI.onData((data) => {
    terminal.write(data);
  });

  // Handle window resize
  window.addEventListener('resize', () => {
    fitAddon.fit();
    window.electronAPI.resize(terminal.cols, terminal.rows);
  });

  // Initial resize notification
  window.electronAPI.resize(terminal.cols, terminal.rows);
}
