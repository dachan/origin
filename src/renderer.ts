import "./index.css";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

declare global {
  interface Window {
    electronAPI: {
      sendInput: (data: string) => void;
      resize: (cols: number, rows: number) => void;
      onData: (callback: (data: string) => void) => void;
      copyToClipboard: (text: string) => void;
      pasteFromClipboard: () => string;
      ready: () => void;
      getHistory: () => Promise<string[]>;
      deleteHistory: (command: string) => Promise<boolean>;
    };
  }
}

// Autocomplete state
let historyCommands: string[] = [];
let currentInput = "";
let suggestions: string[] = [];
let selectedIndex = -1;
let autocompleteVisible = false;
let terminalRef: import("@xterm/xterm").Terminal | null = null;

// Create autocomplete dropdown element
const autocompleteEl = document.createElement("div");
autocompleteEl.id = "autocomplete";
autocompleteEl.className = "autocomplete-dropdown";
document.body.appendChild(autocompleteEl);

// Load history on startup
window.electronAPI.getHistory().then((history) => {
  historyCommands = history;
});

function updateSuggestions(input: string) {
  if (!input || input.length < 1) {
    hideSuggestions();
    return;
  }

  const filtered = historyCommands
    .filter(
      (cmd) =>
        cmd.toLowerCase().startsWith(input.toLowerCase()) && cmd !== input
    )
    .slice(0, 8);

  if (filtered.length === 0) {
    hideSuggestions();
    return;
  }

  suggestions = filtered;
  selectedIndex = -1;
  renderSuggestions();
}

function renderSuggestions() {
  autocompleteEl.innerHTML = suggestions
    .map((cmd, i) => {
      const isSelected = i === selectedIndex;
      const escaped = cmd.replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const matchLen = currentInput.length;
      const highlighted = `<span class="match">${escaped.slice(0, matchLen)}</span>${escaped.slice(matchLen)}`;
      return `<div class="suggestion${isSelected ? " selected" : ""}" data-index="${i}"><span class="suggestion-text">${highlighted}</span><span class="suggestion-delete" data-index="${i}">&times;</span></div>`;
    })
    .join("");

  // Add click handlers for delete buttons
  autocompleteEl.querySelectorAll(".suggestion-delete").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      const index = parseInt((el as HTMLElement).dataset.index || "0");
      deleteSuggestion(index);
    });
  });

  // Add click handlers for suggestions
  autocompleteEl.querySelectorAll(".suggestion").forEach((el) => {
    el.addEventListener("click", () => {
      const index = parseInt((el as HTMLElement).dataset.index || "0");
      selectSuggestion(index);
    });
  });

  autocompleteEl.style.display = "block";
  autocompleteVisible = true;

  // Hide cursor when navigating overlay
  if (terminalRef && selectedIndex >= 0) {
    terminalRef.options.cursorBlink = false;
    terminalRef.write("\x1b[?25l"); // Hide cursor
  }
}

function hideSuggestions() {
  autocompleteEl.style.display = "none";
  autocompleteVisible = false;
  suggestions = [];
  selectedIndex = -1;

  // Show cursor again
  if (terminalRef) {
    terminalRef.options.cursorBlink = true;
    terminalRef.write("\x1b[?25h"); // Show cursor
  }
}

function selectSuggestion(index: number) {
  if (index < 0 || index >= suggestions.length) return;

  const selected = suggestions[index];
  // Clear current input and type the selected command
  const backspaces = "\x7f".repeat(currentInput.length);
  window.electronAPI.sendInput(backspaces + selected);
  currentInput = selected;
  hideSuggestions();
}

function deleteSuggestion(index: number) {
  if (index < 0 || index >= suggestions.length) return;

  const toDelete = suggestions[index];
  // Remove from local history
  historyCommands = historyCommands.filter((cmd) => cmd !== toDelete);
  // Remove from file
  window.electronAPI.deleteHistory(toDelete);
  // Update suggestions
  suggestions.splice(index, 1);

  if (suggestions.length === 0) {
    hideSuggestions();
  } else {
    // Adjust selected index if needed
    if (selectedIndex >= suggestions.length) {
      selectedIndex = suggestions.length - 1;
    }
    renderSuggestions();
  }
}

const terminal = new Terminal({
  cursorBlink: true,
  fontFamily: "monospace",
  fontSize: 13,
  lineHeight: 1.25,
});

const fitAddon = new FitAddon();
terminal.loadAddon(fitAddon);

const container = document.getElementById("terminal");
if (container) {
  terminal.open(container);
  fitAddon.fit();
  terminalRef = terminal;

  // Custom key handler for copy/cut/paste/delete and autocomplete
  terminal.attachCustomKeyEventHandler((event) => {
    const isMac = navigator.platform.includes("Mac");
    const modKey = isMac ? event.metaKey : event.ctrlKey;

    // Autocomplete navigation - capture all relevant keys when visible
    if (event.type === "keydown" && autocompleteVisible) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        // Start at 0 if nothing selected, otherwise move down
        if (selectedIndex === -1) {
          selectedIndex = 0;
        } else {
          selectedIndex = Math.min(selectedIndex + 1, suggestions.length - 1);
        }
        renderSuggestions();
        return false;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        if (selectedIndex > 0) {
          selectedIndex = selectedIndex - 1;
          renderSuggestions();
        } else if (selectedIndex === 0) {
          // Move back to terminal input, but keep overlay open
          selectedIndex = -1;
          renderSuggestions();
          // Show cursor again
          if (terminalRef) {
            terminalRef.options.cursorBlink = true;
            terminalRef.write("\x1b[?25h");
          }
        }
        return false;
      }
      if (event.key === "Tab" || event.key === "Enter") {
        if (selectedIndex >= 0) {
          event.preventDefault();
          selectSuggestion(selectedIndex);
          return false;
        } else if (event.key === "Tab" && suggestions.length > 0) {
          event.preventDefault();
          selectSuggestion(0);
          return false;
        }
      }
      // Delete/Backspace when a suggestion is selected - delete from history
      // Mac "Delete" key sends "Backspace", forward-delete sends "Delete"
      if (
        (event.key === "Backspace" || event.key === "Delete") &&
        selectedIndex >= 0
      ) {
        event.preventDefault();
        deleteSuggestion(selectedIndex);
        return false;
      }
      if (event.key === "Escape") {
        hideSuggestions();
        return false;
      }
    }

    // Copy: Cmd+C (Mac) or Ctrl+Shift+C (non-Mac, to avoid conflict with SIGINT)
    if (event.type === "keydown" && event.key === "c" && modKey) {
      if (terminal.hasSelection()) {
        window.electronAPI.copyToClipboard(terminal.getSelection());
        return false; // Prevent default
      }
      // No selection: let Ctrl+C pass through as SIGINT
      return true;
    }

    // Cut: Cmd+X (Mac) or Ctrl+Shift+X
    if (event.type === "keydown" && event.key === "x" && modKey) {
      if (terminal.hasSelection()) {
        const selection = terminal.getSelection();
        window.electronAPI.copyToClipboard(selection);
        // Send backspaces to delete the selected text from command line
        for (let i = 0; i < selection.length; i++) {
          window.electronAPI.sendInput("\x7f"); // DEL character
        }
        terminal.clearSelection();
        return false;
      }
      return true;
    }

    // Paste: Cmd+V (Mac) or Ctrl+Shift+V
    if (event.type === "keydown" && event.key === "v" && modKey) {
      const text = window.electronAPI.pasteFromClipboard();
      if (text) {
        window.electronAPI.sendInput(text);
        currentInput += text;
        updateSuggestions(currentInput);
      }
      return false;
    }

    // Delete/Backspace selected text (only when autocomplete is not visible for Delete)
    if (
      event.type === "keydown" &&
      event.key === "Backspace" &&
      terminal.hasSelection()
    ) {
      const selection = terminal.getSelection();
      for (let i = 0; i < selection.length; i++) {
        window.electronAPI.sendInput("\x7f");
      }
      terminal.clearSelection();
      return false;
    }

    return true;
  });

  // Send terminal input to main process and track for autocomplete
  terminal.onData((data) => {
    window.electronAPI.sendInput(data);

    // Track input for autocomplete
    if (data === "\r" || data === "\n") {
      // Enter pressed - reset input
      currentInput = "";
      hideSuggestions();
    } else if (data === "\x7f" || data === "\b") {
      // Backspace
      currentInput = currentInput.slice(0, -1);
      updateSuggestions(currentInput);
    } else if (data === "\x03") {
      // Ctrl+C
      currentInput = "";
      hideSuggestions();
    } else if (data === "\x15") {
      // Ctrl+U - clear line
      currentInput = "";
      hideSuggestions();
    } else if (data.length === 1 && data.charCodeAt(0) >= 32) {
      // Printable character
      currentInput += data;
      updateSuggestions(currentInput);
    }
  });

  // Receive output from main process
  window.electronAPI.onData((data) => {
    terminal.write(data);
  });

  // Handle window resize
  window.addEventListener("resize", () => {
    fitAddon.fit();
    window.electronAPI.resize(terminal.cols, terminal.rows);
  });

  // Initial resize notification
  window.electronAPI.resize(terminal.cols, terminal.rows);

  // Signal ready - clears terminal on reload
  window.electronAPI.ready();
}
