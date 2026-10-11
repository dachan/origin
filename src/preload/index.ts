import { contextBridge, ipcRenderer } from 'electron';
import type {
  StickyCommand,
  PtyDataPayload,
  PtyExitPayload,
  ResolvedToken,
  FileStatSummary,
} from '../shared/types';

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

  onPtyData: (callback: (payload: PtyDataPayload) => void): (() => void) =>
    subscribe('pty:data', callback),

  onPtyExit: (callback: (payload: PtyExitPayload) => void): (() => void) =>
    subscribe('pty:exit', callback),

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

  fsResolveTokens: (cwd: string, tokens: string[]): Promise<ResolvedToken[]> =>
    ipcRenderer.invoke('fs:resolveTokens', { cwd, tokens }),

  fsStat: (filePath: string): Promise<FileStatSummary | null> =>
    ipcRenderer.invoke('fs:stat', filePath),

  fsOpenFile: (filePath: string): Promise<string> =>
    ipcRenderer.invoke('fs:openFile', filePath),

  // Menu events
  onTogglePassthrough: (callback: () => void): (() => void) =>
    subscribe('terminal:toggle-passthrough', callback),

  onEditCopy: (callback: () => void): (() => void) =>
    subscribe('edit:copy', callback),

  // The Edit menu triggers copy without a renderer user-gesture, so the
  // clipboard is written from the main process.
  clipboardWrite: (text: string): void => {
    ipcRenderer.send('clipboard:write', text);
  },
};

contextBridge.exposeInMainWorld('electronAPI', api);

export type ElectronAPI = typeof api;
