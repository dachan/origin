import { contextBridge, ipcRenderer } from 'electron';
import type { StickyCommand } from '../shared/types';

// Subscribe to an IPC channel; returns an unsubscribe function.
function subscribe<T>(channel: string, callback: (payload: T) => void): () => void {
  const handler = (_event: Electron.IpcRendererEvent, payload: T) =>
    callback(payload);
  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
}

const api = {
  // PTY
  ptySpawn: (cols: number, rows: number): Promise<{ id: string }> =>
    ipcRenderer.invoke('pty:spawn', { cols, rows }),

  ptyWrite: (id: string, data: string): void => {
    ipcRenderer.send('pty:write', { id, data });
  },

  ptyResize: (id: string, cols: number, rows: number): void => {
    ipcRenderer.send('pty:resize', { id, cols, rows });
  },

  onPtyData: (
    callback: (payload: { id: string; data: string }) => void
  ): (() => void) => subscribe('pty:data', callback),

  onPtyExit: (
    callback: (payload: {
      id: string;
      exitCode: number;
      signal: number;
    }) => void
  ): (() => void) => subscribe('pty:exit', callback),

  // Persistence
  historyLoad: (): Promise<string[]> => ipcRenderer.invoke('history:load'),

  historyAppend: (command: string): Promise<void> =>
    ipcRenderer.invoke('history:append', command),

  historyRemove: (command: string): Promise<void> =>
    ipcRenderer.invoke('history:remove', command),

  historyClear: (): Promise<void> => ipcRenderer.invoke('history:clear'),

  stickyLoad: (): Promise<StickyCommand[]> =>
    ipcRenderer.invoke('sticky:load'),

  stickySave: (commands: StickyCommand[]): Promise<void> =>
    ipcRenderer.invoke('sticky:save', commands),

  // Filesystem
  fsGetCwd: (ptyId: string): Promise<string | null> =>
    ipcRenderer.invoke('fs:getCwd', ptyId),

  fsResolveTokens: (
    cwd: string,
    tokens: string[]
  ): Promise<{ name: string; type: 'file' | 'directory' | null }[]> =>
    ipcRenderer.invoke('fs:resolveTokens', { cwd, tokens }),

  fsStat: (
    filePath: string
  ): Promise<{ size: number; created: string; modified: string } | null> =>
    ipcRenderer.invoke('fs:stat', filePath),

  fsOpenFile: (filePath: string): Promise<string> =>
    ipcRenderer.invoke('fs:openFile', filePath),

  // Menu events
  onTogglePassthrough: (callback: () => void): (() => void) =>
    subscribe('terminal:toggle-passthrough', callback),
};

contextBridge.exposeInMainWorld('electronAPI', api);

export type ElectronAPI = typeof api;
