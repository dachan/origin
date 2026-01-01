import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  sendInput: (data: string) => ipcRenderer.send('terminal-input', data),
  resize: (cols: number, rows: number) => ipcRenderer.send('terminal-resize', { cols, rows }),
  onData: (callback: (data: string) => void) => {
    ipcRenderer.on('terminal-data', (_, data) => callback(data));
  },
});
