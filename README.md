# Origin: Shell Augmentation Manager

> **Early Prototype** — This project is in active early development. Features may be incomplete, APIs may change, and rough edges are expected. Feedback and contributions welcome.

A modern terminal replacement built with Electron, xterm.js, and React. Origin enhances the standard shell experience with smart command input, persistent history, pinnable commands, and clickable file/directory links.

## Features

### Terminal
- GPU-accelerated rendering via WebGL (with DOM fallback)
- 10,000-line scrollback buffer
- Clickable URLs detected automatically
- Adjustable font size (Cmd+=/-, persisted across sessions)
- Tokyo Night color theme with full 16-color ANSI palette
- Auto-restarts shell on exit
- Window size and position remembered between sessions

### Clickable Files & Directories
- Hover over filenames in terminal output to see them highlighted
- Click a **directory** to `cd` into it
- Click a **file** to open it with the OS default app
- Hover tooltip shows file size, created date, and modified date
- Supports filenames with spaces (from `ls` column output)
- Filters out `ls -l` metadata (permissions, dates, sizes) so only real paths are clickable
- Links from older `ls` output stay clickable after `cd`ing elsewhere (CWD history tracking)

### Command Input
- Multi-line input with auto-expanding height
- Autocomplete from command history (prefix-matched, top 10 results)
- Persistent command history across sessions
- Syncs with shell history (`~/.zsh_history` / `~/.bash_history`)

### Terminal Search
- **Cmd+F** to open Find bar
- Highlights all matches in yellow with dark text
- Navigate between matches with Enter / Shift+Enter
- Escape to close

### Command Palette
- Quick access to recent and starred commands
- Star frequently used commands with custom labels
- Drag to reorder starred commands
- Remove individual commands from history
- Clear all history with one click (with confirmation)
- Search filters both labels and commands

### Context Menu
- Right-click in terminal or input area
- Copy selected text
- Search selected text in terminal
- Paste into command input
- Clear terminal

### Toast Notifications
- Non-intrusive feedback for actions (star/unstar, clear history, font size changes)

### Raw Mode
- Automatically detects interactive programs (vim, less, top, etc.)
- Forwards keyboard input directly to the PTY
- Hides command input and gives full focus to the terminal

### Passthrough Mode
- Toggle with **Cmd+E** for interactive CLI tools that don't use alternate screen (e.g. Claude, Python REPL, Node, SSH)
- Forwards keystrokes directly to the PTY via xterm.js
- Toggle button in command input bar, Terminal menu, or keyboard shortcut
- Banner with exit button displayed when active

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
| **Cmd+E** | Toggle passthrough mode |
| **Cmd+F** | Find in terminal |
| **Cmd+=** | Increase font size |
| **Cmd+-** | Decrease font size |
| **Cmd+0** | Reset font size |

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
