import { app } from 'electron';
import path from 'path';
import fs from 'fs/promises';

export class JsonStore<T> {
  private filePath: string;

  constructor(filename: string, private defaultValue: T) {
    const userDataPath = app.getPath('userData');
    this.filePath = path.join(userDataPath, filename);
  }

  async load(): Promise<T> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8');
      return JSON.parse(raw) as T;
    } catch {
      return this.defaultValue;
    }
  }

  async save(data: T): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
  }
}
