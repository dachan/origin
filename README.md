# Origin

https://github.com/user-attachments/assets/c706c8cf-7ba9-41b0-b375-55e36d966012

A modern terminal replacement built with Electron, featuring intelligent command autocomplete and pinned commands.

![Origin Terminal](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux-blue)
![Electron](https://img.shields.io/badge/Electron-39.x-47848F)
![License](https://img.shields.io/badge/License-MIT-green)

## Features

### 🔍 Smart Autocomplete

Origin reads your shell history (zsh, bash, or fish) and provides intelligent suggestions as you type. Matching text is highlighted, making it easy to find the command you're looking for.

### ⭐ Pinned Commands

Pin your most frequently used commands for instant access. Pinned commands appear at the top of suggestions and persist across sessions.

### 🗑️ History Management

Delete commands from your shell history directly from the autocomplete overlay. No more hunting through history files to remove sensitive or unwanted entries.

### ⌨️ Keyboard-First Design

Navigate entirely with the keyboard:

| Shortcut       | Action                                     |
| -------------- | ------------------------------------------ |
| `↓`            | Open autocomplete / Navigate down          |
| `↑`            | Navigate up / Shell history                |
| `Enter`        | Select suggestion / Execute command        |
| `Esc`          | Close autocomplete                         |
| `Esc` `Esc`    | Clear terminal screen                      |
| `⌘+C`          | Copy selection (or SIGINT if no selection) |
| `⌘+V`          | Paste from clipboard                       |
| `Shift+Delete` | Delete word backwards                      |
| `Delete`       | Remove selected command from history       |

### 🎨 Clean Dark Theme

A carefully designed dark theme inspired by Catppuccin, easy on the eyes for long terminal sessions.

## Installation

### Prerequisites

- Node.js 18+
- npm or yarn

### Setup

```bash
# Clone the repository
git clone https://github.com/yourusername/origin.git
cd origin

# Install dependencies
npm install

# Start the app
npm start
```

### Building

```bash
# Package for your platform
npm run package

# Create distributable
npm run make
```

## Usage

### Autocomplete

Start typing any command and Origin will show suggestions from your shell history. Use arrow keys to navigate and Enter to select.

### Pinning Commands

1. Type to show autocomplete suggestions
2. Hover or navigate to a command
3. Click the star icon (or it will be highlighted when selected)
4. Pinned commands appear first in future suggestions

### Deleting History

1. Navigate to a command in the autocomplete overlay
2. Press `Delete` or `Backspace` to remove it from history
3. Or click the × icon that appears on hover

### Clear Line

When the autocomplete overlay is open, the first option is always "Clear line" - select it to quickly clear your current input.

## Shell Support

Origin automatically detects and integrates with:

- **zsh** - Reads from `~/.zsh_history`
- **bash** - Reads from `~/.bash_history`
- **fish** - Reads from `~/.local/share/fish/fish_history`

Commands you execute in Origin are saved back to your shell's history file, keeping everything in sync.

## Tech Stack

- **Electron** - Cross-platform desktop framework
- **xterm.js** - Terminal emulator component
- **node-pty** - Pseudoterminal bindings
- **Vite** - Fast build tooling
- **TypeScript** - Type-safe development
- **Tailwind CSS** - Utility-first styling

## License

MIT © David Chan
