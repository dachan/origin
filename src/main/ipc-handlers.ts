import { ipcMain, BrowserWindow, shell } from 'electron';
import fs from 'fs';
import path from 'path';
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
        if (_event.sender.isDestroyed()) return;
        const win = BrowserWindow.fromWebContents(_event.sender);
        win?.webContents.send('pty:data', { id, data });
      });

      ptyManager.onExit(id, (exitCode: number, signal: number) => {
        if (_event.sender.isDestroyed()) return;
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

  ipcMain.handle('history:remove', async (_event, command: string) => {
    return commandHistoryStore.remove(command);
  });

  ipcMain.handle('sticky:load', async () => {
    return stickyCommandsStore.load();
  });

  ipcMain.handle('sticky:save', async (_event, commands: StickyCommand[]) => {
    return stickyCommandsStore.save(commands);
  });

  // --- Filesystem Channels ---

  ipcMain.handle(
    'fs:getCwd',
    async (_event, ptyId: string): Promise<string | null> => {
      return ptyManager.getCwd(ptyId);
    }
  );

  ipcMain.handle(
    'fs:resolveTokens',
    async (
      _event,
      { cwd, tokens }: { cwd: string; tokens: string[] }
    ): Promise<{ name: string; type: 'file' | 'directory' | null }[]> => {
      const results = await Promise.all(
        tokens.map(async (token) => {
          try {
            const fullPath = path.resolve(cwd, token);
            // Prevent path traversal outside the CWD
            const rel = path.relative(cwd, fullPath);
            if (rel.startsWith('..') || path.isAbsolute(rel)) {
              return { name: token, type: null };
            }
            const stat = await fs.promises.stat(fullPath);
            return {
              name: token,
              type: (stat.isDirectory() ? 'directory' : 'file') as
                | 'file'
                | 'directory',
            };
          } catch {
            return { name: token, type: null };
          }
        })
      );
      return results;
    }
  );

  ipcMain.handle(
    'fs:openFile',
    async (_event, filePath: string): Promise<string> => {
      // Only open files under the user's home directory
      const home = require('os').homedir();
      const resolved = path.resolve(filePath);
      if (!resolved.startsWith(home)) {
        return 'Blocked: path outside home directory';
      }
      return shell.openPath(resolved);
    }
  );
}
