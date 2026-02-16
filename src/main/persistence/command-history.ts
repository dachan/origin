import { JsonStore } from './store';

const MAX_HISTORY = 5000;

class CommandHistoryStore {
  private store = new JsonStore<string[]>('command-history.json', []);
  private cache: string[] | null = null;

  async load(): Promise<string[]> {
    if (!this.cache) {
      this.cache = await this.store.load();
    }
    return [...this.cache];
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
    await this.store.save(history);
  }
}

export const commandHistoryStore = new CommandHistoryStore();
