import * as pty from 'node-pty';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

interface PtySession {
  id: string;
  process: pty.IPty;
}

class PtyManager {
  private sessions: Map<string, PtySession> = new Map();
  private idCounter = 0;
  private cwdCache: Map<string, { cwd: string; ts: number }> = new Map();
  private static CWD_TTL = 500;

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
      // If the session was already removed via kill(), this was a deliberate
      // shutdown — don't notify the renderer (it would respawn the shell).
      if (!this.sessions.delete(id)) return;
      this.cwdCache.delete(id);
      callback(exitCode, signal);
    });
  }

  async getCwd(id: string): Promise<string | null> {
    const session = this.sessions.get(id);
    if (!session) return null;

    const cached = this.cwdCache.get(id);
    if (cached && Date.now() - cached.ts < PtyManager.CWD_TTL) {
      return cached.cwd;
    }

    const pid = session.process.pid;
    try {
      // Find the foreground child process of the PTY (fall back to the
      // shell itself if it has no children).
      const children = await execFileAsync('pgrep', ['-P', String(pid)])
        .then(({ stdout }) => stdout)
        .catch(() => '');
      const childPid = children.trim().split('\n').pop() || String(pid);

      // Use lsof to get the CWD of that process.
      // lsof -Fn output: lines starting with 'n' contain the path.
      const { stdout: lsofOut } = await execFileAsync('lsof', [
        '-a', '-d', 'cwd', '-p', childPid, '-Fn',
      ]);
      const match = lsofOut.match(/^n(.+)$/m);
      if (!match) return null;

      const cwd = match[1];
      this.cwdCache.set(id, { cwd, ts: Date.now() });
      return cwd;
    } catch {
      return null;
    }
  }

  kill(id: string): void {
    const session = this.sessions.get(id);
    if (!session) return;
    // Remove from the map first so the onExit handler knows this is deliberate
    this.sessions.delete(id);
    this.cwdCache.delete(id);
    session.process.kill();
  }

  disposeAll(): void {
    for (const [id] of this.sessions) {
      this.kill(id);
    }
  }
}

export const ptyManager = new PtyManager();
