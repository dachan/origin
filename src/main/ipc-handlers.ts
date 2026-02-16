import { ipcMain, BrowserWindow } from 'electron';
import { ptyManager } from './pty-manager';
import { commandHistoryStore } from './persistence/command-history';
import { stickyCommandsStore, StickyCommand } from './persistence/sticky-commands';

export function registerIpcHandlers(): void {
  // --- PTY Channels ---

  ipcMain.handle(
    'pty:spawn',
    async (_event, { cols, rows }: { cols: number; rows: number }) => {
      const { id } = ptyManager.spawn(cols, rows);

      // Set up data streaming back to the renderer
      ptyManager.onData(id, (data: string) => {
        const win = BrowserWindow.fromWebContents(_event.sender);
        win?.webContents.send('pty:data', { id, data });
      });

      ptyManager.onExit(id, (exitCode: number, signal: number) => {
        const win = BrowserWindow.fromWebContents(_event.sender);
        win?.webContents.send('pty:exit', { id, exitCode, signal });
      });

      return { id };
    }
  );

  ipcMain.on(
    'pty:write',
    (_event, { id, data }: { id: string; data: string }) => {
      ptyManager.write(id, data);
    }
  );

  ipcMain.on(
    'pty:resize',
    (
      _event,
      { id, cols, rows }: { id: string; cols: number; rows: number }
    ) => {
      ptyManager.resize(id, cols, rows);
    }
  );

  // --- Persistence Channels ---

  ipcMain.handle('history:load', async () => {
    return commandHistoryStore.load();
  });

  ipcMain.handle('history:append', async (_event, command: string) => {
    return commandHistoryStore.append(command);
  });

  ipcMain.handle('sticky:load', async () => {
    return stickyCommandsStore.load();
  });

  ipcMain.handle('sticky:save', async (_event, commands: StickyCommand[]) => {
    return stickyCommandsStore.save(commands);
  });
}
