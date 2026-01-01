import { contextBridge, ipcRenderer, clipboard } from 'electron';

// Remove any existing listeners on reload
ipcRenderer.removeAllListeners('terminal-data');

contextBridge.exposeInMainWorld('electronAPI', {
  sendInput: (data: string) => ipcRenderer.send('terminal-input', data),
  resize: (cols: number, rows: number) => ipcRenderer.send('terminal-resize', { cols, rows }),
  onData: (callback: (data: string) => void) => {
    ipcRenderer.on('terminal-data', (_, data) => callback(data));
  },
  copyToClipboard: (text: string) => clipboard.writeText(text),
  pasteFromClipboard: () => clipboard.readText(),
  ready: () => ipcRenderer.send('terminal-ready'),
  getHistory: () => ipcRenderer.invoke('get-history') as Promise<string[]>,
  saveHistory: (command: string) => ipcRenderer.invoke('save-history', command) as Promise<boolean>,
  deleteHistory: (command: string) => ipcRenderer.invoke('delete-history', command) as Promise<boolean>,
  getPinned: () => ipcRenderer.invoke('get-pinned') as Promise<string[]>,
  togglePinned: (command: string) => ipcRenderer.invoke('toggle-pinned', command) as Promise<{ pinned: boolean; commands: string[] }>,
});
