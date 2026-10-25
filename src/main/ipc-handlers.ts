import { clipboard, ipcMain, shell } from 'electron';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { isAppUrl } from './app-url';
import { ptyManager } from './pty-manager';
import { commandHistoryStore } from './persistence/command-history';
import { stickyCommandsStore } from './persistence/sticky-commands';
import { onePassword } from './one-password';
import type {
  StickyCommand,
  ResolvedToken,
  FileStatSummary,
  OnePasswordField,
  OnePasswordFill,
  OnePasswordItem,
  OnePasswordItemList,
  OnePasswordResult,
} from '../shared/types';

// In-flight 1Password auto-fills, by PTY.
const pendingAutoFills = new Map<string, AbortController>();

// Files that macOS runs, installs, or follows when opened, rather than showing
// them in an app.
const RUNNABLE_EXTENSIONS = new Set([
  '.command', '.tool', '.terminal', '.sh', '.workflow', '.action', '.scpt', '.scptd',
  '.jar', '.pkg', '.mpkg', '.mobileconfig', '.prefpane', '.saver', '.shortcut',
  '.webloc', '.inetloc', '.fileloc', '.url',
]);

// A clicked file link may come from output Origin doesn't control, so a
// click must not run anything: executables and runnable types count.
async function isRunnable(filePath: string): Promise<boolean> {
  if (RUNNABLE_EXTENSIONS.has(path.extname(filePath).toLowerCase())) return true;
  try {
    await fs.promises.access(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

// "Server › root" names which of an item's passwords was filled.
function fillTitle({ item, field }: OnePasswordFill): string {
  return field.label === 'password' ? item.title : `${item.title} › ${field.label}`;
}

// Only the app's own page may call into the main process. The window can't
// navigate elsewhere, but if some other page ever ran with the preload it
// still gets nothing.
type HandleListener = Parameters<typeof ipcMain.handle>[1];
type OnListener = Parameters<typeof ipcMain.on>[1];

function handle(channel: string, listener: HandleListener): void {
  ipcMain.handle(channel, (event, ...args) => {
    if (!isAppUrl(event.senderFrame?.url)) throw new Error(`Blocked ${channel}`);
    return listener(event, ...args);
  });
}

function on(channel: string, listener: OnListener): void {
  ipcMain.on(channel, (event, ...args) => {
    if (isAppUrl(event.senderFrame?.url)) listener(event, ...args);
  });
}

export function registerIpcHandlers(): void {
  // --- PTY Channels ---

  handle(
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

  on(
    'pty:write',
    (_event, { id, data }: { id: string; data: string }) => {
      ptyManager.write(id, data);
    }
  );

  on(
    'pty:resize',
    (
      _event,
      { id, cols, rows }: { id: string; cols: number; rows: number }
    ) => {
      ptyManager.resize(id, cols, rows);
    }
  );

  handle('pty:isReadingSecret', async (_event, id: string) =>
    ptyManager.isReadingSecret(id)
  );

  // --- Persistence Channels ---

  handle('history:load', async () => {
    return commandHistoryStore.load();
  });

  handle('history:append', async (_event, command: string) => {
    return commandHistoryStore.append(command);
  });

  handle('history:remove', async (_event, command: string) => {
    return commandHistoryStore.remove(command);
  });

  handle('history:clear', async () => {
    return commandHistoryStore.clearAll();
  });

  handle('sticky:load', async () => {
    return stickyCommandsStore.load();
  });

  handle('sticky:save', async (_event, commands: StickyCommand[]) => {
    return stickyCommandsStore.save(commands);
  });

  // --- Filesystem Channels ---

  handle(
    'fs:getCwd',
    async (_event, ptyId: string): Promise<string | null> => {
      return ptyManager.getCwd(ptyId);
    }
  );

  handle(
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

  handle(
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

  handle(
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
      // Opening runs scripts and installers, so show those in Finder instead.
      if (await isRunnable(resolved)) {
        shell.showItemInFolder(resolved);
        return '';
      }
      return shell.openPath(resolved);
    }
  );

  // --- 1Password Channels ---
  // Passwords go from `op` straight to the PTY. The renderer only learns
  // whether it worked and which item was used.

  handle(
    'op:listItems',
    async (_event, promptKey: string): Promise<OnePasswordResult<OnePasswordItemList>> =>
      onePassword.listItems(promptKey)
  );

  handle(
    'op:listFields',
    async (_event, item: OnePasswordItem): Promise<OnePasswordResult<OnePasswordField[]>> =>
      onePassword.listFields(item)
  );

  handle(
    'op:fill',
    async (
      _event,
      { ptyId, fill, promptKey }: { ptyId: string; fill: OnePasswordFill; promptKey: string }
    ): Promise<OnePasswordResult<null>> => {
      const result = await onePassword.readPassword(fill, promptKey);
      if (!result.ok) return result;
      ptyManager.write(ptyId, result.value + '\n');
      return { ok: true, value: null };
    }
  );

  // Names the item and field remembered for this prompt, so the renderer can
  // offer it; reads nothing from 1Password.
  handle(
    'op:rememberedTitle',
    async (_event, promptKey: string): Promise<string | null> => {
      const fill = await onePassword.rememberedFor(promptKey);
      return fill ? fillTitle(fill) : null;
    }
  );

  // Fills the item remembered for this prompt, if any, after the user accepts
  // the offer. Resolves to its title, or null when nothing is remembered or
  // the renderer cancelled.
  handle(
    'op:autoFill',
    async (
      _event,
      { ptyId, promptKey }: { ptyId: string; promptKey: string }
    ): Promise<OnePasswordResult<string | null>> => {
      const fill = await onePassword.rememberedFor(promptKey);
      if (!fill) return { ok: true, value: null };

      pendingAutoFills.get(ptyId)?.abort();
      const controller = new AbortController();
      pendingAutoFills.set(ptyId, controller);
      const result = await onePassword.readPassword(fill, promptKey, controller.signal);
      if (pendingAutoFills.get(ptyId) === controller) pendingAutoFills.delete(ptyId);

      if (controller.signal.aborted) return { ok: true, value: null };
      if (!result.ok) return result;
      ptyManager.write(ptyId, result.value + '\n');
      return { ok: true, value: fillTitle(fill) };
    }
  );

  // The user started typing the password themselves, or left the prompt.
  on('op:cancelAutoFill', (_event, ptyId: string) => {
    pendingAutoFills.get(ptyId)?.abort();
  });

  on('clipboard:write', (_event, text: unknown) => {
    if (typeof text === 'string' && text.length > 0) {
      clipboard.writeText(text);
    }
  });
}
