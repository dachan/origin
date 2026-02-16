import * as pty from 'node-pty';
import os from 'os';
import { execFile } from 'child_process';

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
      callback(exitCode, signal);
      this.sessions.delete(id);
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
      const cwd = await new Promise<string>((resolve, reject) => {
        // Find the foreground child process of the PTY
        execFile('pgrep', ['-P', String(pid)], (err, stdout) => {
          const childPid = (stdout || '').trim().split('\n').pop() || String(pid);
          // Use lsof to get the CWD of the child process
          execFile(
            'lsof',
            ['-a', '-d', 'cwd', '-p', childPid, '-Fn'],
            (lsofErr, lsofOut) => {
              if (lsofErr) return reject(lsofErr);
              // lsof -Fn output: lines starting with 'n' contain the path
              const match = lsofOut.match(/^n(.+)$/m);
              if (match) resolve(match[1]);
              else reject(new Error('Could not parse lsof output'));
            }
          );
        });
      });

      this.cwdCache.set(id, { cwd, ts: Date.now() });
      return cwd;
    } catch {
      return null;
    }
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
