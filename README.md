# Origin: Shell Augmentation Manager

> **Early Prototype** — This project is in active early development. Features may be incomplete, APIs may change, and rough edges are expected. Feedback and contributions welcome.

A modern terminal replacement built with Electron, xterm.js, and React. Origin enhances the standard shell experience with smart command input, persistent history, pinnable commands, and clickable file/directory links.

## Features

### Terminal
- GPU-accelerated rendering via WebGL (with DOM fallback)
- 10,000-line scrollback buffer
- Clickable URLs detected automatically
- Tokyo Night color theme with full 16-color ANSI palette

### Clickable Files & Directories
- Hover over filenames in terminal output to see them highlighted
- Click a **directory** to `cd` into it
- Click a **file** to open it with the OS default app
- Supports filenames with spaces (from `ls` column output)
- Filters out `ls -l` metadata (permissions, dates, sizes) so only real paths are clickable

### Command Input
- Multi-line input with auto-expanding height
- Autocomplete from command history (prefix-matched, top 10 results)
- Persistent command history across sessions

### Command Palette
- Quick access to recent and pinned commands
- Pin frequently used commands with custom labels
- Search filters both labels and commands

### Raw Mode
- Automatically detects interactive programs (vim, less, top, etc.)
- Forwards keyboard input directly to the PTY
- Hides command input and gives full focus to the terminal

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| **Enter** | Execute command |
| **Shift+Enter** | Insert newline |
| **Shift+Backspace** | Delete backward to next space or `/` |
| **Escape (2x)** | Clear terminal |
| **Ctrl+C** | Send interrupt (SIGINT) |
| **Ctrl+D** | Send EOF |
| **Tab** | Accept autocomplete / shell tab-completion |
| **Arrow Up/Down** | Navigate command history |
| **Cmd+K** | Toggle command palette |
| **Cmd+Shift+P** | Toggle command palette |

## Getting Started

```bash
npm install
npm start
```

## Packaging

```bash
npm run package   # create distributable
npm run make      # create platform installers
```

## Tech Stack

- **Electron 40** — desktop shell
- **React 19** — UI
- **xterm.js 6** — terminal emulation (WebGL, fit, search, web-links addons)
- **node-pty** — pseudo-terminal backend
- **Electron Forge + Webpack** — build tooling

## License

MIT
