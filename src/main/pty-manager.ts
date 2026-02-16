import * as pty from 'node-pty';
import os from 'os';

interface PtySession {
  id: string;
  process: pty.IPty;
}

class PtyManager {
  private sessions: Map<string, PtySession> = new Map();
  private idCounter = 0;

  spawn(cols: number, rows: number): { id: string } {
    const shell =
      process.env.SHELL ||
      (os.platform() === 'win32' ? 'powershell.exe' : '/bin/zsh');
    const id = `pty-${++this.idCounter}`;
    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: process.env.HOME || os.homedir(),
      env: { ...process.env } as { [key: string]: string },
    });
    this.sessions.set(id, { id, process: ptyProcess });
    return { id };
  }

  write(id: string, data: string): void {
    this.sessions.get(id)?.process.write(data);
  }

  resize(id: string, cols: number, rows: number): void {
    this.sessions.get(id)?.process.resize(cols, rows);
  }

  onData(id: string, callback: (data: string) => void): void {
    this.sessions.get(id)?.process.onData(callback);
  }

  onExit(
    id: string,
    callback: (exitCode: number, signal: number) => void
  ): void {
    this.sessions.get(id)?.process.onExit(({ exitCode, signal }) => {
      callback(exitCode, signal);
      this.sessions.delete(id);
    });
  }

  kill(id: string): void {
    const session = this.sessions.get(id);
    if (session) {
      session.process.kill();
      this.sessions.delete(id);
    }
  }

  disposeAll(): void {
    for (const [id] of this.sessions) {
      this.kill(id);
    }
  }
}

export const ptyManager = new PtyManager();
