import { app, BrowserWindow, Menu, dialog } from 'electron';
import fs from 'fs';
import path from 'path';
import { registerIpcHandlers } from './ipc-handlers';
import { ptyManager } from './pty-manager';

// Webpack magic constants from Electron Forge
declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

// --- Window state persistence ---
const STATE_FILE = path.join(app.getPath('userData'), 'window-state.json');

interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  isMaximized?: boolean;
}

function loadWindowState(): WindowState {
  try {
    const data = fs.readFileSync(STATE_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return { width: 900, height: 700 };
  }
}

let lastNormalBounds: Electron.Rectangle | null = null;

function saveWindowState(win: BrowserWindow): void {
  const isMaximized = win.isMaximized();
  const bounds = isMaximized && lastNormalBounds ? lastNormalBounds : win.getBounds();
  const state: WindowState = { ...bounds, isMaximized };
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state));
  } catch {
    // best-effort
  }
}

let mainWindow: BrowserWindow | null = null;

const createWindow = (): void => {
  const state = loadWindowState();

  mainWindow = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    minWidth: 500,
    minHeight: 400,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1a1b26',
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (state.isMaximized) {
    mainWindow.maximize();
  }

  // Track bounds before maximize so we can restore them
  mainWindow.on('resize', () => {
    if (mainWindow && !mainWindow.isMaximized()) {
      lastNormalBounds = mainWindow.getBounds();
    }
  });
  mainWindow.on('move', () => {
    if (mainWindow && !mainWindow.isMaximized()) {
      lastNormalBounds = mainWindow.getBounds();
    }
  });
  mainWindow.on('close', () => {
    if (mainWindow) saveWindowState(mainWindow);
  });

  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);
};

// --- Application menu with About ---
function buildAppMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        {
          label: 'About Origin: SAM',
          click: () => {
            dialog.showMessageBox({
              type: 'info',
              title: 'About Origin: SAM',
              message: 'Origin: Shell Augmentation Manager',
              detail: `Version ${app.getVersion()}\n\nA modern terminal with smart command input, persistent history, and clickable file links.\n\n© David Chan`,
            });
          },
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'Terminal',
      submenu: [
        {
          label: 'Toggle Passthrough Mode',
          accelerator: 'CmdOrCtrl+E',
          click: () => {
            const win = BrowserWindow.getFocusedWindow();
            if (win) win.webContents.send('terminal:toggle-passthrough');
          },
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  registerIpcHandlers();
  buildAppMenu();
  createWindow();
});

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
  ptyManager.disposeAll();
});
