import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import os from 'node:os';
import started from 'electron-squirrel-startup';
import * as pty from 'node-pty';

if (started) {
  app.quit();
}

let ptyProcess: pty.IPty | null = null;
let mainWindow: BrowserWindow | null = null;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
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

// IPC handlers - registered once outside createWindow
ipcMain.on('terminal-input', (_, data: string) => {
  ptyProcess?.write(data);
});

ipcMain.on('terminal-resize', (_, { cols, rows }: { cols: number; rows: number }) => {
  ptyProcess?.resize(cols, rows);
});

// Clear terminal when renderer is ready (on load/reload)
ipcMain.on('terminal-ready', () => {
  // Send Ctrl+L to shell to clear screen and redraw prompt
  ptyProcess?.write('\x0c');
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
