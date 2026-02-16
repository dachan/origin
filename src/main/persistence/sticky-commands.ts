import { JsonStore } from './store';

export interface StickyCommand {
  id: string;
  label: string;
  command: string;
  createdAt: number;
}

class StickyCommandsStore {
  private store = new JsonStore<StickyCommand[]>('sticky-commands.json', []);

  async load(): Promise<StickyCommand[]> {
    return this.store.load();
  }

  async save(commands: StickyCommand[]): Promise<void> {
    return this.store.save(commands);
  }
}

export const stickyCommandsStore = new StickyCommandsStore();
