import { clipboard, ipcMain, shell } from 'electron';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ptyManager } from './pty-manager';
import { commandHistoryStore } from './persistence/command-history';
import { stickyCommandsStore } from './persistence/sticky-commands';
import { onePassword } from './one-password';
import type {
  StickyCommand,
  ResolvedToken,
  FileStatSummary,
  OnePasswordItem,
  OnePasswordItemList,
  OnePasswordResult,
} from '../shared/types';

// In-flight 1Password auto-fills, by PTY.
const pendingAutoFills = new Map<string, AbortController>();

export function registerIpcHandlers(): void {
  // --- PTY Channels ---

  ipcMain.handle(
    'pty:spawn',
    async (event, { cols, rows }: { cols: number; rows: number }) => {
      const { id } = ptyManager.spawn(cols, rows);

      // Set up data streaming back to the renderer
      ptyManager.onData(id, (data: string) => {
        if (event.sender.isDestroyed()) return;
        event.sender.send('pty:data', { id, data });
      });

      ptyManager.onExit(id, (exitCode: number, signal: number) => {
        if (event.sender.isDestroyed()) return;
        event.sender.send('pty:exit', { id, exitCode, signal });
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

  ipcMain.handle('history:clear', async () => {
    return commandHistoryStore.clearAll();
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
    ): Promise<ResolvedToken[]> => {
      return Promise.all(
        tokens.map(async (token): Promise<ResolvedToken> => {
          try {
            const fullPath = path.resolve(cwd, token);
            // Prevent path traversal outside the CWD
            const rel = path.relative(cwd, fullPath);
            if (
              rel === '..' ||
              rel.startsWith('..' + path.sep) ||
              path.isAbsolute(rel)
            ) {
              return { name: token, type: null };
            }
            const stat = await fs.promises.stat(fullPath);
            return {
              name: token,
              type: stat.isDirectory() ? 'directory' : 'file',
            };
          } catch {
            return { name: token, type: null };
          }
        })
      );
    }
  );

  ipcMain.handle(
    'fs:stat',
    async (_event, filePath: string): Promise<FileStatSummary | null> => {
      try {
        const resolved = path.resolve(filePath);
        const stat = await fs.promises.stat(resolved);
        return {
          size: stat.size,
          created: stat.birthtime.toISOString(),
          modified: stat.mtime.toISOString(),
        };
      } catch {
        return null;
      }
    }
  );

  ipcMain.handle(
    'fs:openFile',
    async (_event, filePath: string): Promise<string> => {
      // Only open files under the user's home directory.
      // Compare against a path boundary so a sibling directory like
      // "/Users/nameEvil" doesn't pass a bare prefix check.
      const home = os.homedir();
      const resolved = path.resolve(filePath);
      if (resolved !== home && !resolved.startsWith(home + path.sep)) {
        return 'Blocked: path outside home directory';
      }
      return shell.openPath(resolved);
    }
  );

  // --- 1Password Channels ---
  // Passwords go from `op` straight to the PTY. The renderer only learns
  // whether it worked and which item was used.

  ipcMain.handle(
    'op:listItems',
    async (_event, promptKey: string): Promise<OnePasswordResult<OnePasswordItemList>> =>
      onePassword.listItems(promptKey)
  );

  ipcMain.handle(
    'op:fill',
    async (
      _event,
      { ptyId, item, promptKey }: { ptyId: string; item: OnePasswordItem; promptKey: string }
    ): Promise<OnePasswordResult<null>> => {
      const result = await onePassword.readPassword(item, promptKey);
      if (!result.ok) return result;
      ptyManager.write(ptyId, result.value + '\n');
      return { ok: true, value: null };
    }
  );

  // Fills the item remembered for this prompt, if any. Resolves to its title,
  // or null when nothing is remembered or the renderer cancelled.
  ipcMain.handle(
    'op:autoFill',
    async (
      _event,
      { ptyId, promptKey }: { ptyId: string; promptKey: string }
    ): Promise<OnePasswordResult<string | null>> => {
      const item = await onePassword.rememberedFor(promptKey);
      if (!item) return { ok: true, value: null };

      pendingAutoFills.get(ptyId)?.abort();
      const controller = new AbortController();
      pendingAutoFills.set(ptyId, controller);
      const result = await onePassword.readPassword(item, promptKey, controller.signal);
      if (pendingAutoFills.get(ptyId) === controller) pendingAutoFills.delete(ptyId);

      if (controller.signal.aborted) return { ok: true, value: null };
      if (!result.ok) return result;
      ptyManager.write(ptyId, result.value + '\n');
      return { ok: true, value: item.title };
    }
  );

  // The user started typing the password themselves, or left the prompt.
  ipcMain.on('op:cancelAutoFill', (_event, ptyId: string) => {
    pendingAutoFills.get(ptyId)?.abort();
  });

  ipcMain.on('clipboard:write', (_event, text: unknown) => {
    if (typeof text === 'string' && text.length > 0) {
      clipboard.writeText(text);
    }
  });
}
