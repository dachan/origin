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
      getPinned: () => Promise<string[]>;
      togglePinned: (
        command: string
      ) => Promise<{ pinned: boolean; commands: string[] }>;
    };
  }
}

// Autocomplete state
let historyCommands: string[] = [];
let pinnedCommands: string[] = [];
let currentInput = "";
let suggestions: string[] = [];
let pinnedSuggestions: string[] = [];
let selectedIndex = -1;
let autocompleteVisible = false;
let showClearOption = false;
let showNoResults = false;
let terminalRef: import("@xterm/xterm").Terminal | null = null;

// Read current command from terminal buffer (after prompt)
function getCurrentLineContent(): string {
  if (!terminalRef) return "";

  const buffer = terminalRef.buffer.active;
  const cursorY = buffer.cursorY;
  const line = buffer.getLine(cursorY);

  if (!line) return "";

  // Get the full line text
  let lineText = "";
  for (let i = 0; i < line.length; i++) {
    lineText += line.getCell(i)?.getChars() || "";
  }

  // Find prompt ending (common patterns: "$ ", "# ", "> ", "% ")
  const promptPatterns = ["$ ", "# ", "> ", "% "];
  let commandStart = 0;

  for (const pattern of promptPatterns) {
    const idx = lineText.lastIndexOf(pattern);
    if (idx !== -1) {
      commandStart = Math.max(commandStart, idx + pattern.length);
    }
  }

  return lineText.slice(commandStart).trimEnd();
}

// Create autocomplete dropdown element
const autocompleteEl = document.createElement("div");
autocompleteEl.id = "autocomplete";
autocompleteEl.className = "autocomplete-dropdown";
document.body.appendChild(autocompleteEl);

// Event delegation for autocomplete clicks (prevents memory leak from repeated listener attachment)
autocompleteEl.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;

  // Handle pin button click
  if (target.classList.contains("suggestion-pin")) {
    e.stopPropagation();
    const index = parseInt(target.dataset.index || "0");
    togglePin(index);
    return;
  }

  // Handle delete button click
  if (target.classList.contains("suggestion-delete")) {
    e.stopPropagation();
    const index = parseInt(target.dataset.index || "0");
    deleteSuggestion(index);
    return;
  }

  // Handle suggestion click (check target or parent)
  const suggestion = target.closest(".suggestion") as HTMLElement | null;
  if (suggestion) {
    const index = parseInt(suggestion.dataset.index || "0");
    selectSuggestion(index);
  }
});

// Load history and pinned on startup
Promise.all([
  window.electronAPI.getHistory(),
  window.electronAPI.getPinned(),
]).then(([history, pinned]) => {
  historyCommands = history.map((cmd) => cmd.trim());
  pinnedCommands = pinned.map((cmd) => cmd.trim());
});

function updateSuggestions(input: string) {
  if (!input || input.length < 1) {
    hideSuggestions();
    return;
  }

  // Filter pinned commands that match
  pinnedSuggestions = pinnedCommands.filter(
    (cmd) => cmd.toLowerCase().startsWith(input.toLowerCase()) && cmd !== input
  );

  // Filter history commands (excluding pinned ones)
  const filtered = historyCommands
    .filter(
      (cmd) =>
        cmd.toLowerCase().startsWith(input.toLowerCase()) &&
        cmd !== input &&
        !pinnedCommands.includes(cmd)
    )
    .slice(0, 8 - pinnedSuggestions.length);

  suggestions = filtered;
  selectedIndex = -1;
  showClearOption = true; // Always show clear option when line has content
  showNoResults = pinnedSuggestions.length === 0 && filtered.length === 0;
  renderSuggestions();
}

function showPinnedOverlay() {
  if (pinnedCommands.length === 0) {
    return;
  }
  pinnedSuggestions = pinnedCommands;
  suggestions = [];
  selectedIndex = -1;
  showClearOption = true;
  showNoResults = false;
  renderSuggestions();
}

function renderSuggestions() {
  const allSuggestions = [...pinnedSuggestions, ...suggestions];
  const pinnedCount = pinnedSuggestions.length;
  const offset = showClearOption ? 1 : 0;

  // Heroicons SVG icons (mini 20x20, scaled to 16x16)
  const backspaceIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M7.22 3.22A.75.75 0 0 1 7.75 3h9A2.25 2.25 0 0 1 19 5.25v9.5A2.25 2.25 0 0 1 16.75 17h-9a.75.75 0 0 1-.53-.22L.97 10.53a.75.75 0 0 1 0-1.06l6.25-6.25Zm3.06 4.28a.75.75 0 1 0-1.06 1.06L10.94 10l-1.72 1.72a.75.75 0 1 0 1.06 1.06L12 11.06l1.72 1.72a.75.75 0 1 0 1.06-1.06L13.06 10l1.72-1.72a.75.75 0 0 0-1.06-1.06L12 8.94l-1.72-1.72Z" clip-rule="evenodd" /></svg>`;
  const xMarkIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" /></svg>`;
  const starOutlineIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401Z" clip-rule="evenodd" /></svg>`;
  const starSolidIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401Z" clip-rule="evenodd" /></svg>`;

  // Build clear line option if needed
  const clearLineHtml = showClearOption
    ? `<div class="suggestion clear-line${selectedIndex === 0 ? " selected" : ""}" data-index="0"><span class="suggestion-text">Clear line</span><span class="clear-icon">${backspaceIcon}</span></div>`
    : "";

  // Build no results message if needed
  const noResultsHtml = showNoResults
    ? `<div class="suggestion no-results"><span class="suggestion-text">No suggestions found</span></div>`
    : "";

  const suggestionsHtml = allSuggestions
    .map((cmd, i) => {
      const adjustedIndex = i + offset;
      const isSelected = adjustedIndex === selectedIndex;
      const isPinned = i < pinnedCount;
      const escaped = cmd.replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const matchLen = currentInput.length;
      const highlighted =
        matchLen > 0
          ? `<span class="match">${escaped.slice(0, matchLen)}</span>${escaped.slice(matchLen)}`
          : escaped;
      const pinIcon = isPinned ? starSolidIcon : starOutlineIcon;
      const pinClass = isPinned ? "suggestion-pin pinned" : "suggestion-pin";
      return `<div class="suggestion${isSelected ? " selected" : ""}${isPinned ? " is-pinned" : ""}" data-index="${adjustedIndex}"><span class="suggestion-text">${highlighted}</span><span class="suggestion-delete" data-index="${adjustedIndex}">${xMarkIcon}</span><span class="${pinClass}" data-index="${adjustedIndex}">${pinIcon}</span></div>`;
    })
    .join("");

  autocompleteEl.innerHTML = clearLineHtml + noResultsHtml + suggestionsHtml;

  autocompleteEl.style.display = "block";
  autocompleteVisible = true;

  // Hide cursor when navigating overlay (use CSS to avoid terminal state issues)
  if (selectedIndex >= 0) {
    document.body.classList.add("overlay-active");
  } else {
    document.body.classList.remove("overlay-active");
  }
}

function hideSuggestions() {
  autocompleteEl.style.display = "none";
  autocompleteVisible = false;
  suggestions = [];
  pinnedSuggestions = [];
  selectedIndex = -1;
  showClearOption = false;
  showNoResults = false;

  // Show cursor again (remove CSS class)
  document.body.classList.remove("overlay-active");
}

function selectSuggestion(index: number) {
  const offset = showClearOption ? 1 : 0;

  // Handle clear line option
  if (showClearOption && index === 0) {
    // Send Ctrl+U to clear the line
    window.electronAPI.sendInput("\x15");
    currentInput = "";
    hideSuggestions();
    return;
  }

  const allSuggestions = [...pinnedSuggestions, ...suggestions];
  const adjustedIndex = index - offset;
  if (adjustedIndex < 0 || adjustedIndex >= allSuggestions.length) return;

  const selected = allSuggestions[adjustedIndex].trim();
  // Clear current input and type the selected command
  const backspaces = "\x7f".repeat(currentInput.length);
  window.electronAPI.sendInput(backspaces + selected);
  currentInput = selected;
  hideSuggestions();
}

async function deleteSuggestion(index: number) {
  const offset = showClearOption ? 1 : 0;

  // Can't delete clear line option
  if (showClearOption && index === 0) return;

  const allSuggestions = [...pinnedSuggestions, ...suggestions];
  const adjustedIndex = index - offset;
  if (adjustedIndex < 0 || adjustedIndex >= allSuggestions.length) return;

  const toDelete = allSuggestions[adjustedIndex];
  const isPinned = adjustedIndex < pinnedSuggestions.length;

  // Remove from local arrays
  historyCommands = historyCommands.filter((cmd) => cmd !== toDelete);
  if (isPinned) {
    pinnedCommands = pinnedCommands.filter((cmd) => cmd !== toDelete);
    pinnedSuggestions.splice(adjustedIndex, 1);
  } else {
    suggestions.splice(adjustedIndex - pinnedSuggestions.length, 1);
  }

  // Remove from file
  const deleted = await window.electronAPI.deleteHistory(toDelete);
  console.log("Deleted from history file:", toDelete, deleted);

  const totalSuggestions =
    pinnedSuggestions.length + suggestions.length + offset;
  if (pinnedSuggestions.length + suggestions.length === 0) {
    hideSuggestions();
  } else {
    if (selectedIndex >= totalSuggestions) {
      selectedIndex = totalSuggestions - 1;
    }
    renderSuggestions();
  }
}

async function togglePin(index: number) {
  const offset = showClearOption ? 1 : 0;

  // Can't pin the clear line option
  if (showClearOption && index === 0) return;

  const allSuggestions = [...pinnedSuggestions, ...suggestions];
  const adjustedIndex = index - offset;
  if (adjustedIndex < 0 || adjustedIndex >= allSuggestions.length) return;

  const command = allSuggestions[adjustedIndex];
  const result = await window.electronAPI.togglePinned(command);
  pinnedCommands = result.commands.map((cmd) => cmd.trim());

  // Re-filter suggestions with updated pinned list
  if (currentInput.length > 0) {
    updateSuggestions(currentInput);
  } else {
    showPinnedOverlay();
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

    // ArrowUp when no overlay visible: show pinned overlay and let shell navigate history
    if (
      event.type === "keydown" &&
      event.key === "ArrowUp" &&
      !autocompleteVisible
    ) {
      if (pinnedCommands.length > 0) {
        showPinnedOverlay();
      }
      // Let shell handle history, then read what's on the line
      setTimeout(() => {
        const lineContent = getCurrentLineContent();
        currentInput = lineContent;
        if (lineContent && autocompleteVisible) {
          updateSuggestions(lineContent);
        }
      }, 10);
      return true;
    }

    // ArrowDown when no overlay visible: show overlay and enter selection
    if (
      event.type === "keydown" &&
      event.key === "ArrowDown" &&
      !autocompleteVisible
    ) {
      event.preventDefault();
      // Read current line content first
      const lineContent = getCurrentLineContent();
      currentInput = lineContent;
      if (lineContent) {
        // Show clear + pinned + autocomplete
        updateSuggestions(lineContent);
      } else if (pinnedCommands.length > 0) {
        // Empty line: show just pinned
        showPinnedOverlay();
      }
      // Enter selection mode
      selectedIndex = 0;
      renderSuggestions();
      return false;
    }

    // Autocomplete navigation - capture keys when visible
    if (event.type === "keydown" && autocompleteVisible) {
      const offset = showClearOption ? 1 : 0;
      const totalSuggestions =
        pinnedSuggestions.length + suggestions.length + offset;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        // Enter overlay selection or navigate within it
        if (selectedIndex === -1) {
          selectedIndex = 0;
        } else {
          selectedIndex = Math.min(selectedIndex + 1, totalSuggestions - 1);
        }
        renderSuggestions();
        return false;
      }

      if (event.key === "ArrowUp") {
        if (selectedIndex > 0) {
          // Navigate within overlay
          event.preventDefault();
          selectedIndex = selectedIndex - 1;
          renderSuggestions();
          return false;
        } else if (selectedIndex === 0) {
          // Exit overlay selection, return to active line with cursor
          event.preventDefault();
          selectedIndex = -1;
          renderSuggestions();
          return false;
        }
        // selectedIndex === -1: pass to shell for history navigation
        // Show pinned overlay and let shell navigate
        if (pinnedCommands.length > 0) {
          showPinnedOverlay();
        }
        setTimeout(() => {
          const lineContent = getCurrentLineContent();
          currentInput = lineContent;
          if (lineContent && autocompleteVisible) {
            updateSuggestions(lineContent);
          }
        }, 10);
        return true;
      }

      if (event.key === "Enter") {
        if (selectedIndex >= 0) {
          event.preventDefault();
          selectSuggestion(selectedIndex);
          return false;
        }
        // Let Enter pass through to execute command
      }

      // Delete/Backspace when a suggestion is selected - delete from history
      if (
        (event.key === "Backspace" || event.key === "Delete") &&
        selectedIndex >= 0
      ) {
        event.preventDefault();
        deleteSuggestion(selectedIndex);
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
    // Only deletes if selection is at the end of current input (safe operation)
    if (event.type === "keydown" && event.key === "x" && modKey) {
      if (terminal.hasSelection()) {
        const selection = terminal.getSelection();
        window.electronAPI.copyToClipboard(selection);

        // Only delete if selection matches trailing portion of current input
        if (currentInput.length > 0 && currentInput.endsWith(selection)) {
          for (let i = 0; i < selection.length; i++) {
            window.electronAPI.sendInput("\x7f");
          }
          currentInput = currentInput.slice(0, -selection.length);
          updateSuggestions(currentInput);
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
