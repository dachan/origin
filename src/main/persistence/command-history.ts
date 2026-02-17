import { readFile, writeFile, appendFile } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import { JsonStore } from './store';

const MAX_HISTORY = 5000;

class CommandHistoryStore {
  private store = new JsonStore<string[]>('command-history.json', []);
  private cache: string[] | null = null;

  private getShellHistoryPath(): string | null {
    const shell = process.env.SHELL ?? '';
    if (shell.endsWith('/zsh')) return join(homedir(), '.zsh_history');
    if (shell.endsWith('/bash')) return join(homedir(), '.bash_history');
    return null;
  }

  private async readShellHistory(): Promise<string[]> {
    const histPath = this.getShellHistoryPath();
    if (!histPath) return [];
    try {
      const raw = await readFile(histPath, 'utf-8');
      const lines = raw.split('\n');
      const commands: string[] = [];
      for (const line of lines) {
        if (!line) continue;
        // zsh extended_history format: ": timestamp:0;command"
        const match = line.match(/^: \d+:\d+;(.+)$/);
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
    const histPath = this.getShellHistoryPath();
    if (!histPath) return;
    try {
      const shell = process.env.SHELL ?? '';
      let line: string;
      if (shell.endsWith('/zsh')) {
        const ts = Math.floor(Date.now() / 1000);
        line = `: ${ts}:0;${command}\n`;
      } else {
        line = `${command}\n`;
      }
      await appendFile(histPath, line, 'utf-8');
    } catch {
      // Silently ignore write failures
    }
  }

  private async removeFromShellHistory(command: string): Promise<void> {
    const histPath = this.getShellHistoryPath();
    if (!histPath) return;
    try {
      const raw = await readFile(histPath, 'utf-8');
      const lines = raw.split('\n');
      const filtered = lines.filter((line) => {
        if (!line) return true;
        // zsh extended_history format: ": timestamp:0;command"
        const match = line.match(/^: \d+:\d+;(.+)$/);
        if (match) return match[1] !== command;
        // Plain format
        return line !== command;
      });
      await writeFile(histPath, filtered.join('\n'), 'utf-8');
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
      // Merge: start with shell history, layer app history on top
      // Use a Map to deduplicate, keeping the last occurrence (app history wins on recency)
      const seen = new Map<string, number>();
      const all = [...shellHistory, ...appHistory];
      for (let i = 0; i < all.length; i++) {
        seen.set(all[i], i);
      }
      // Sort by original position to preserve order, then deduplicate
      const merged = [...seen.entries()]
        .sort((a, b) => a[1] - b[1])
        .map(([cmd]) => cmd);
      // Trim to max size (keep the most recent)
      if (merged.length > MAX_HISTORY) {
        merged.splice(0, merged.length - MAX_HISTORY);
      }
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

  async append(command: string): Promise<void> {
    const history = await this.load();
    // Deduplicate: remove previous occurrence if it exists
    const idx = history.indexOf(command);
    if (idx !== -1) history.splice(idx, 1);
    history.push(command);
    // Trim to max size
    if (history.length > MAX_HISTORY) {
      history.splice(0, history.length - MAX_HISTORY);
    }
    this.cache = history;
    await Promise.all([
      this.store.save(history),
      this.appendToShellHistory(command),
    ]);
  }
}

export const commandHistoryStore = new CommandHistoryStore();
