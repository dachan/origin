import { contextBridge, ipcRenderer } from 'electron';

export interface StickyCommand {
  id: string;
  label: string;
  command: string;
  createdAt: number;
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
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      payload: { id: string; data: string }
    ) => callback(payload);
    ipcRenderer.on('pty:data', handler);
    return () => {
      ipcRenderer.removeListener('pty:data', handler);
    };
  },

  onPtyExit: (
    callback: (payload: {
      id: string;
      exitCode: number;
      signal: number;
    }) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      payload: { id: string; exitCode: number; signal: number }
    ) => callback(payload);
    ipcRenderer.on('pty:exit', handler);
    return () => {
      ipcRenderer.removeListener('pty:exit', handler);
    };
  },

  // Persistence
  historyLoad: (): Promise<string[]> => ipcRenderer.invoke('history:load'),

  historyAppend: (command: string): Promise<void> =>
    ipcRenderer.invoke('history:append', command),

  historyRemove: (command: string): Promise<void> =>
    ipcRenderer.invoke('history:remove', command),

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

  fsOpenFile: (filePath: string): Promise<string> =>
    ipcRenderer.invoke('fs:openFile', filePath),
};

contextBridge.exposeInMainWorld('electronAPI', api);

export type ElectronAPI = typeof api;
