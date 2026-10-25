import { app } from 'electron';
import * as pty from 'node-pty';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// Startup files so each prompt after the first is preceded by a blank line.
// ZDOTDIR points at this directory; the files source the user's real config.
const ZSH_ENV = `export ORIGIN_USER_ZDOTDIR="\${ORIGIN_USER_ZDOTDIR:-\$HOME}"
if [[ -r "\${ORIGIN_USER_ZDOTDIR}/.zshenv" ]]; then
  source "\${ORIGIN_USER_ZDOTDIR}/.zshenv"
fi
if [[ -n "\${ORIGIN_ZDOTDIR}" ]]; then
  export ZDOTDIR="\${ORIGIN_ZDOTDIR}"
fi
`;

// Login shells read .zprofile while ZDOTDIR still points here, so forward it
// to the user's file (Homebrew's `brew shellenv` usually lives there).
const ZSH_PROFILE = `if [[ -r "\${ORIGIN_USER_ZDOTDIR}/.zprofile" ]]; then
  source "\${ORIGIN_USER_ZDOTDIR}/.zprofile"
fi
`;

const ZSH_RC = `_origin_user_zdotdir="\${ORIGIN_USER_ZDOTDIR:-\$HOME}"
export ZDOTDIR="\${_origin_user_zdotdir}"
if [[ -r "\${_origin_user_zdotdir}/.zshrc" ]]; then
  source "\${_origin_user_zdotdir}/.zshrc"
fi

# PROMPT_SP pads the current row before drawing a prompt. On startup that
# pad wraps, so the first prompt begins one row lower and the top row is
# empty. Skip it for that first prompt, then turn it back on so a command
# whose output has no trailing newline still keeps its last line.
unsetopt PROMPT_SP

origin_command_gap() {
  setopt PROMPT_SP
  [[ -n "\${_origin_gap_ready-}" ]] && print
  typeset -g _origin_gap_ready=1
}
(( \${precmd_functions[(Ie)origin_command_gap]} )) || precmd_functions+=(origin_command_gap)

unset _origin_user_zdotdir ORIGIN_USER_ZDOTDIR ORIGIN_ZDOTDIR
`;

const BASH_RC = `if [[ -r "$HOME/.bashrc" ]]; then
  source "$HOME/.bashrc"
fi

origin_command_gap() {
  [[ -n "\${_origin_gap_ready-}" ]] && echo
  _origin_gap_ready=1
}
PROMPT_COMMAND="origin_command_gap\${PROMPT_COMMAND:+;\$PROMPT_COMMAND}"
`;

function writeIfChanged(filePath: string, contents: string): void {
  try {
    if (fs.readFileSync(filePath, 'utf-8') === contents) return;
  } catch {
    // missing file
  }
  fs.writeFileSync(filePath, contents);
}

function shellStartup(shell: string): { args: string[]; env: NodeJS.ProcessEnv } {
  const env: NodeJS.ProcessEnv = { ...process.env };
  const base = path.basename(shell);
  const dir = path.join(app.getPath('userData'), 'shell');

  if (base === 'zsh' || base === 'bash') {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (base === 'zsh') {
    writeIfChanged(path.join(dir, '.zshenv'), ZSH_ENV);
    writeIfChanged(path.join(dir, '.zprofile'), ZSH_PROFILE);
    writeIfChanged(path.join(dir, '.zshrc'), ZSH_RC);
    env.ORIGIN_USER_ZDOTDIR = env.ZDOTDIR || os.homedir();
    env.ORIGIN_ZDOTDIR = dir;
    env.ZDOTDIR = dir;
    // Run as a login shell, like Terminal and iTerm, so /etc/zprofile
    // (path_helper) and ~/.zprofile set PATH when Origin starts from the Dock.
    return { args: ['-l'], env };
  }

  if (base === 'bash') {
    const rc = path.join(dir, 'bashrc');
    writeIfChanged(rc, BASH_RC);
    return { args: ['--rcfile', rc], env };
  }

  return { args: [], env };
}

interface PtySession {
  id: string;
  process: pty.IPty;
  // The terminal device, e.g. /dev/ttys012, looked up on first use.
  tty?: string;
}

// sudo, ssh-askpass, getpass and friends turn echo off but keep line input
// while reading a secret. Shells and ssh sessions use raw mode, which turns
// both off, so the two cases are distinguishable.
const ECHO_OFF_RE = /(^|\s)-echo(\s|$)/;
const LINE_INPUT_RE = /(^|\s)icanon(\s|$)/;

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
    const startup = shellStartup(shell);
    const ptyProcess = pty.spawn(shell, startup.args, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: process.env.HOME || os.homedir(),
      env: startup.env as { [key: string]: string },
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
      callback(exitCode, signal ?? 0);
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

  // Whether a program in this terminal is reading a secret right now, so
  // input sent to it must not be saved to history.
  async isReadingSecret(id: string): Promise<boolean> {
    const session = this.sessions.get(id);
    if (!session || os.platform() === 'win32') return false;
    try {
      if (!session.tty) {
        const { stdout } = await execFileAsync('ps', ['-o', 'tty=', '-p', String(session.process.pid)]);
        session.tty = `/dev/${stdout.trim()}`;
      }
      const deviceFlag = os.platform() === 'darwin' ? '-f' : '-F';
      const { stdout } = await execFileAsync('stty', ['-a', deviceFlag, session.tty]);
      return ECHO_OFF_RE.test(stdout) && LINE_INPUT_RE.test(stdout);
    } catch {
      return false;
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
