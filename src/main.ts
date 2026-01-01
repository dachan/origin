import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import started from 'electron-squirrel-startup';
import * as pty from 'node-pty';

// Set app name for macOS menubar
app.name = 'Origin';

if (started) {
  app.quit();
}

// Pinned commands storage
function getPinnedPath(): string {
  return path.join(app.getPath('userData'), 'pinned-commands.json');
}

function getPinnedCommands(): string[] {
  try {
    const pinnedPath = getPinnedPath();
    if (fs.existsSync(pinnedPath)) {
      const data = fs.readFileSync(pinnedPath, 'utf-8');
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch {
    // Ignore errors, return empty array
  }
  return [];
}

function savePinnedCommands(pinned: string[]): boolean {
  try {
    const pinnedPath = getPinnedPath();
    fs.writeFileSync(pinnedPath, JSON.stringify(pinned, null, 2));
    return true;
  } catch {
    return false;
  }
}

function togglePinnedCommand(command: string): { pinned: boolean; commands: string[] } {
  const pinned = getPinnedCommands();
  const index = pinned.indexOf(command);
  if (index >= 0) {
    pinned.splice(index, 1);
    savePinnedCommands(pinned);
    return { pinned: false, commands: pinned };
  } else {
    pinned.unshift(command);
    savePinnedCommands(pinned);
    return { pinned: true, commands: pinned };
  }
}

let ptyProcess: pty.IPty | null = null;
let mainWindow: BrowserWindow | null = null;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  // Spawn pty process
  const shell = process.env.SHELL || (os.platform() === 'win32' ? 'powershell.exe' : 'bash');
  ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: os.homedir(),
    env: process.env as { [key: string]: string },
  });

  // Send pty output to renderer
  ptyProcess.onData((data) => {
    mainWindow?.webContents.send('terminal-data', data);
  });
};

// Read shell history file
function getShellHistory(): string[] {
  const shell = process.env.SHELL || '';
  let historyPath = '';
  
  if (shell.includes('zsh')) {
    historyPath = path.join(os.homedir(), '.zsh_history');
  } else if (shell.includes('bash')) {
    historyPath = path.join(os.homedir(), '.bash_history');
  } else if (shell.includes('fish')) {
    historyPath = path.join(os.homedir(), '.local/share/fish/fish_history');
  }
  
  if (!historyPath || !fs.existsSync(historyPath)) {
    return [];
  }
  
  try {
    const content = fs.readFileSync(historyPath, 'utf-8');
    const lines = content.split('\n');
    const commands: string[] = [];
    
    // Parse based on shell type
    if (shell.includes('zsh')) {
      // zsh history format: ": timestamp:0;command" or just "command"
      for (const line of lines) {
        const match = line.match(/^: \d+:\d+;(.+)$/);
        if (match) {
          commands.push(match[1]);
        } else if (line && !line.startsWith(':')) {
          commands.push(line);
        }
      }
    } else if (shell.includes('fish')) {
      // fish history format: "- cmd: command"
      for (const line of lines) {
        const match = line.match(/^- cmd: (.+)$/);
        if (match) {
          commands.push(match[1]);
        }
      }
    } else {
      // bash and others: one command per line
      for (const line of lines) {
        if (line.trim()) {
          commands.push(line);
        }
      }
    }
    
    // Return unique commands, most recent first (last 500)
    const unique = [...new Set(commands.reverse())];
    return unique.slice(0, 500);
  } catch {
    return [];
  }
}

// Delete a command from shell history file
function deleteFromHistory(command: string): boolean {
  const shell = process.env.SHELL || '';
  let historyPath = '';
  
  if (shell.includes('zsh')) {
    historyPath = path.join(os.homedir(), '.zsh_history');
  } else if (shell.includes('bash')) {
    historyPath = path.join(os.homedir(), '.bash_history');
  } else if (shell.includes('fish')) {
    historyPath = path.join(os.homedir(), '.local/share/fish/fish_history');
  }
  
  if (!historyPath || !fs.existsSync(historyPath)) {
    return false;
  }
  
  try {
    const content = fs.readFileSync(historyPath, 'utf-8');
    const lines = content.split('\n');
    const filteredLines: string[] = [];
    
    if (shell.includes('zsh')) {
      for (const line of lines) {
        const match = line.match(/^: \d+:\d+;(.+)$/);
        if (match) {
          if (match[1] !== command) {
            filteredLines.push(line);
          }
        } else if (line !== command) {
          filteredLines.push(line);
        }
      }
    } else if (shell.includes('fish')) {
      // Fish history format: entries start with "- cmd:" followed by metadata lines
      let skip = false;
      for (const line of lines) {
        const match = line.match(/^- cmd: (.+)$/);
        if (match) {
          // New command entry - check if we should skip this one
          skip = match[1] === command;
        }
        if (!skip) {
          filteredLines.push(line);
        }
      }
    } else {
      for (const line of lines) {
        if (line !== command) {
          filteredLines.push(line);
        }
      }
    }
    
    fs.writeFileSync(historyPath, filteredLines.join('\n'));
    return true;
  } catch {
    return false;
  }
}

// Save a command to shell history file
function saveToHistory(command: string): boolean {
  const shell = process.env.SHELL || '';
  let historyPath = '';
  
  if (shell.includes('zsh')) {
    historyPath = path.join(os.homedir(), '.zsh_history');
  } else if (shell.includes('bash')) {
    historyPath = path.join(os.homedir(), '.bash_history');
  } else if (shell.includes('fish')) {
    historyPath = path.join(os.homedir(), '.local/share/fish/fish_history');
  }
  
  if (!historyPath) {
    return false;
  }
  
  try {
    const timestamp = Math.floor(Date.now() / 1000);
    let entry = '';
    
    if (shell.includes('zsh')) {
      entry = `: ${timestamp}:0;${command}\n`;
    } else if (shell.includes('fish')) {
      entry = `- cmd: ${command}\n  when: ${timestamp}\n`;
    } else {
      entry = `${command}\n`;
    }
    
    fs.appendFileSync(historyPath, entry);
    return true;
  } catch {
    return false;
  }
}

// IPC handlers - registered once outside createWindow
ipcMain.handle('get-history', () => {
  return getShellHistory();
});

ipcMain.handle('save-history', (_, command: string) => {
  return saveToHistory(command);
});

ipcMain.handle('delete-history', (_, command: string) => {
  console.log('Deleting from history:', command);
  const result = deleteFromHistory(command);
  console.log('Delete result:', result);
  return result;
});

ipcMain.handle('get-pinned', () => {
  return getPinnedCommands();
});

ipcMain.handle('toggle-pinned', (_, command: string) => {
  return togglePinnedCommand(command);
});

ipcMain.on('terminal-input', (_, data: string) => {
  ptyProcess?.write(data);
});

ipcMain.on('terminal-resize', (_, { cols, rows }: { cols: number; rows: number }) => {
  // Validate inputs to prevent crashes
  if (
    typeof cols !== 'number' || typeof rows !== 'number' ||
    !Number.isInteger(cols) || !Number.isInteger(rows) ||
    cols < 1 || cols > 500 || rows < 1 || rows > 500
  ) {
    return;
  }
  ptyProcess?.resize(cols, rows);
});

// Clear terminal when renderer is ready (on load/reload)
ipcMain.on('terminal-ready', () => {
  // Send Ctrl+U to clear current line, then Ctrl+L to clear screen and redraw prompt
  ptyProcess?.write('\x15\x0c');
});

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  ptyProcess?.kill();
});
