import { readFile, writeFile, appendFile } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import { JsonStore } from './store';

const MAX_HISTORY = 5000;

// Trim in place to the newest MAX_HISTORY entries.
function trimToMax(commands: string[]): void {
  if (commands.length > MAX_HISTORY) {
    commands.splice(0, commands.length - MAX_HISTORY);
  }
}

// zsh extended_history format: ": timestamp:0;command"
const ZSH_EXTENDED_LINE_RE = /^: \d+:\d+;(.+)$/;

class CommandHistoryStore {
  private store = new JsonStore<string[]>('command-history.json', []);
  private cache: string[] | null = null;
  private readonly isZsh = (process.env.SHELL ?? '').endsWith('/zsh');
  private readonly shellHistoryPath: string | null = this.isZsh
    ? join(homedir(), '.zsh_history')
    : (process.env.SHELL ?? '').endsWith('/bash')
      ? join(homedir(), '.bash_history')
      : null;

  private async readShellHistory(): Promise<string[]> {
    const histPath = this.shellHistoryPath;
    if (!histPath) return [];
    try {
      const raw = await readFile(histPath, 'utf-8');
      const lines = raw.split('\n');
      const commands: string[] = [];
      for (const line of lines) {
        if (!line) continue;
        const match = line.match(ZSH_EXTENDED_LINE_RE);
        if (match) {
          commands.push(match[1]);
        } else if (!line.startsWith(': ')) {
          // Plain format (bash or zsh without extended_history)
          commands.push(line);
        }
      }
      return commands;
    } catch {
      return [];
    }
  }

  private async appendToShellHistory(command: string): Promise<void> {
    const histPath = this.shellHistoryPath;
    if (!histPath) return;
    try {
      const line = this.isZsh
        ? `: ${Math.floor(Date.now() / 1000)}:0;${command}\n`
        : `${command}\n`;
      await appendFile(histPath, line, 'utf-8');
    } catch {
      // Silently ignore write failures
    }
  }

  private async removeFromShellHistory(command: string): Promise<void> {
    const histPath = this.shellHistoryPath;
    if (!histPath) return;
    try {
      const raw = await readFile(histPath, 'utf-8');
      const lines = raw.split('\n');
      const filtered = lines.filter((line) => {
        if (!line) return true;
        const match = line.match(ZSH_EXTENDED_LINE_RE);
        if (match) return match[1] !== command;
        // Plain format
        return line !== command;
      });
      await writeFile(histPath, filtered.join('\n'), 'utf-8');
    } catch {
      // Silently ignore failures
    }
  }

  private async clearShellHistory(): Promise<void> {
    const histPath = this.shellHistoryPath;
    if (!histPath) return;
    try {
      await writeFile(histPath, '', 'utf-8');
    } catch {
      // Silently ignore failures
    }
  }

  async load(): Promise<string[]> {
    if (!this.cache) {
      const [shellHistory, appHistory] = await Promise.all([
        this.readShellHistory(),
        this.store.load(),
      ]);
      // Merge shell and app history, deduplicating so each command keeps
      // only its most recent position (app history is layered on top).
      const seen = new Set<string>();
      for (const cmd of [...shellHistory, ...appHistory]) {
        seen.delete(cmd);
        seen.add(cmd);
      }
      const merged = [...seen];
      // Trim to max size (keep the most recent)
      trimToMax(merged);
      this.cache = merged;
    }
    return [...this.cache];
  }

  async remove(command: string): Promise<void> {
    const history = await this.load();
    const idx = history.indexOf(command);
    if (idx === -1) return;
    history.splice(idx, 1);
    this.cache = history;
    await Promise.all([
      this.store.save(history),
      this.removeFromShellHistory(command),
    ]);
  }

  async clearAll(): Promise<void> {
    this.cache = [];
    await Promise.all([this.store.save([]), this.clearShellHistory()]);
  }

  async append(command: string): Promise<void> {
    const history = await this.load();
    // Deduplicate: remove previous occurrence if it exists
    const idx = history.indexOf(command);
    if (idx !== -1) history.splice(idx, 1);
    history.push(command);
    // Trim to max size
    trimToMax(history);
    this.cache = history;
    await Promise.all([
      this.store.save(history),
      this.appendToShellHistory(command),
    ]);
  }
}

export const commandHistoryStore = new CommandHistoryStore();
