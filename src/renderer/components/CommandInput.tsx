import React, { useRef, useState, useCallback, useEffect } from 'react';
import { useTerminal, KILL_LINE } from '../context/TerminalContext';
import Autocomplete from './Autocomplete';
import OnePasswordPicker from './OnePasswordPicker';
import Prompt from './Prompt';
import { showToast } from './Toast';
import { CommandLineIcon, KeyIcon } from './icons';
import { useOnePasswordFill } from '../hooks/useOnePasswordFill';

const CommandInput: React.FC = () => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState('');
  const [passwordValue, setPasswordValue] = useState('');
  const [autocompleteItems, setAutocompleteItems] = useState<string[]>([]);
  const [autocompleteIndex, setAutocompleteIndex] = useState(-1);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const lastEscRef = useRef<number>(0);

  const {
    ptyId,
    terminalRef,
    lastCommandRef,
    history,
    historyIndex,
    setHistoryIndex,
    executeCommand,
    clearTerminal,
    filterHistory,
    isRawMode,
    isPassthroughMode,
    togglePassthroughMode,
    isPasswordMode,
    setIsPasswordMode,
    isPaletteOpen,
    isSearchOpen,
  } = useTerminal();

  // Auto-resize textarea height
  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    }
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // --- Escape: dismiss autocomplete, or double-tap to clear terminal ---
      if (e.key === 'Escape') {
        if (showAutocomplete && autocompleteItems.length > 0) {
          // Dismissing autocomplete shouldn't arm the double-tap clear
          e.preventDefault();
          setShowAutocomplete(false);
          lastEscRef.current = 0;
          return;
        }
        const now = Date.now();
        if (now - lastEscRef.current < 250) {
          e.preventDefault();
          lastEscRef.current = 0;
          clearTerminal();
        } else {
          lastEscRef.current = now;
        }
        return;
      }

      // --- Autocomplete navigation ---
      if (showAutocomplete && autocompleteItems.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setAutocompleteIndex((prev) =>
            prev < autocompleteItems.length - 1 ? prev + 1 : 0
          );
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setAutocompleteIndex((prev) =>
            prev > 0 ? prev - 1 : autocompleteItems.length - 1
          );
          return;
        }
        if (e.key === 'Tab') {
          e.preventDefault();
          setInputValue(autocompleteItems[Math.max(autocompleteIndex, 0)]);
          setShowAutocomplete(false);
          return;
        }
        if (e.key === 'Enter' && autocompleteIndex >= 0) {
          e.preventDefault();
          setInputValue(autocompleteItems[autocompleteIndex]);
          setShowAutocomplete(false);
          return;
        }
      }

      // --- Command execution ---
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (inputValue.trim()) {
          executeCommand(inputValue);
          setInputValue('');
          setShowAutocomplete(false);
        } else if (ptyId) {
          // Empty enter — send newline to PTY
          window.electronAPI.ptyWrite(ptyId, '\n');
        }
        return;
      }

      // --- History navigation (when autocomplete is NOT showing) ---
      if (e.key === 'ArrowUp' && !showAutocomplete) {
        const textarea = textareaRef.current;
        if (textarea && textarea.selectionStart === 0) {
          e.preventDefault();
          const newIndex =
            historyIndex < history.length - 1
              ? historyIndex + 1
              : historyIndex;
          setHistoryIndex(newIndex);
          if (newIndex >= 0) {
            const cmd = history[history.length - 1 - newIndex];
            setInputValue(cmd);
          }
        }
      }

      if (e.key === 'ArrowDown' && !showAutocomplete) {
        const textarea = textareaRef.current;
        if (textarea && textarea.selectionStart === textarea.value.length) {
          e.preventDefault();
          const newIndex = historyIndex > 0 ? historyIndex - 1 : -1;
          setHistoryIndex(newIndex);
          setInputValue(
            newIndex >= 0 ? history[history.length - 1 - newIndex] : ''
          );
        }
      }

      // --- Ctrl+C = send SIGINT to PTY ---
      if (e.key === 'c' && e.ctrlKey && !e.metaKey) {
        if (ptyId) {
          window.electronAPI.ptyWrite(ptyId, '\x03');
        }
        setInputValue('');
        setShowAutocomplete(false);
        return;
      }

      // --- Ctrl+D = send EOF ---
      if (e.key === 'd' && e.ctrlKey && !e.metaKey) {
        if (ptyId) {
          window.electronAPI.ptyWrite(ptyId, '\x04');
        }
        return;
      }

      // --- Shift+Backspace = delete backward to next space or '/' ---
      if (e.key === 'Backspace' && e.shiftKey) {
        e.preventDefault();
        const textarea = textareaRef.current;
        if (!textarea) return;
        const pos = textarea.selectionStart;
        if (pos === 0) return;

        const before = inputValue.slice(0, pos);
        let deleteFrom = pos - 1;

        // Walk backwards to find the next space or '/'
        while (deleteFrom > 0) {
          const ch = before[deleteFrom - 1];
          if (ch === ' ') {
            // Include the space in the deletion
            deleteFrom--;
            break;
          }
          if (ch === '/') {
            // Stop before the '/'
            break;
          }
          deleteFrom--;
        }

        const newValue = before.slice(0, deleteFrom) + inputValue.slice(pos);
        setInputValue(newValue);
        // Set cursor position after React re-render
        requestAnimationFrame(() => {
          textarea.selectionStart = deleteFrom;
          textarea.selectionEnd = deleteFrom;
        });
        return;
      }

      // --- Tab without autocomplete = send tab to PTY for shell completion ---
      if (e.key === 'Tab' && !showAutocomplete) {
        e.preventDefault();
        if (ptyId && inputValue.trim()) {
          // Kill any previously buffered line first so repeated Tabs (or a
          // following Enter, which also kills the line) stay in sync.
          window.electronAPI.ptyWrite(ptyId, KILL_LINE + inputValue + '\t');
          showToast('Tab completing...');
        }
      }
    },
    [
      showAutocomplete,
      autocompleteItems,
      autocompleteIndex,
      inputValue,
      ptyId,
      history,
      historyIndex,
      executeCommand,
      clearTerminal,
      setHistoryIndex,
    ]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      setInputValue(value);
      // Editing the input starts a fresh history walk
      setHistoryIndex(-1);

      // Trigger autocomplete
      if (value.trim().length > 0) {
        const matches = filterHistory(value);
        setAutocompleteItems(matches);
        setAutocompleteIndex(-1);
        setShowAutocomplete(matches.length > 0);
      } else {
        setShowAutocomplete(false);
      }
    },
    [filterHistory, setHistoryIndex]
  );

  const handleOnePasswordFilled = useCallback(() => {
    setPasswordValue('');
    setIsPasswordMode(false);
  }, [setIsPasswordMode]);

  const onePassword = useOnePasswordFill({
    ptyId,
    terminalRef,
    lastCommandRef,
    isPasswordMode,
    onFilled: handleOnePasswordFilled,
  });

  const closeOnePasswordPicker = useCallback(() => {
    onePassword.closePicker();
    passwordInputRef.current?.focus();
  }, [onePassword]);

  const handlePasswordKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      // Cmd+\ is 1Password's own fill shortcut.
      if (e.key === '\\' && e.metaKey) {
        e.preventDefault();
        onePassword.openPicker();
      } else if (e.key === 'Enter' && passwordValue === '' && onePassword.offer) {
        e.preventDefault();
        onePassword.acceptOffer();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (ptyId) {
          window.electronAPI.ptyWrite(ptyId, passwordValue + '\n');
        }
        setPasswordValue('');
        setIsPasswordMode(false);
      } else if (e.key === 'c' && e.ctrlKey && !e.metaKey) {
        if (ptyId) {
          window.electronAPI.ptyWrite(ptyId, '\x03');
        }
        setPasswordValue('');
        setIsPasswordMode(false);
      } else if (e.key === 'Escape') {
        // Escape hatch for false-positive password prompt detection:
        // return to the normal input without sending anything.
        e.preventDefault();
        setPasswordValue('');
        setIsPasswordMode(false);
      }
    },
    [ptyId, passwordValue, setIsPasswordMode, onePassword]
  );

  // Auto-focus password input when entering password mode
  useEffect(() => {
    if (isPasswordMode) {
      passwordInputRef.current?.focus();
    }
  }, [isPasswordMode]);

  // Auto-focus the textarea
  useEffect(() => {
    if (!isRawMode && !isPassthroughMode && !isPasswordMode) {
      textareaRef.current?.focus();
    }
  }, [isRawMode, isPassthroughMode, isPasswordMode]);

  // Adjust height when input changes
  useEffect(() => {
    adjustTextareaHeight();
  }, [inputValue, adjustTextareaHeight]);

  // Always keep focus on the textarea when the app is focused
  useEffect(() => {
    if (isRawMode || isPassthroughMode || isPasswordMode || isPaletteOpen || isSearchOpen) return;

    textareaRef.current?.focus();

    const handleFocusIn = (e: FocusEvent) => {
      if (e.target !== textareaRef.current) {
        textareaRef.current?.focus();
      }
    };

    const handleWindowFocus = () => {
      textareaRef.current?.focus();
    };

    document.addEventListener('focusin', handleFocusIn);
    window.addEventListener('focus', handleWindowFocus);
    return () => {
      document.removeEventListener('focusin', handleFocusIn);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, [isRawMode, isPassthroughMode, isPasswordMode, isPaletteOpen, isSearchOpen]);

  // Don't render in raw mode or passthrough mode
  if (isRawMode || isPassthroughMode) return null;

  return (
    <div className="command-input-container">
      {!isPasswordMode && showAutocomplete && (
        <Autocomplete
          items={autocompleteItems}
          selectedIndex={autocompleteIndex}
          onSelect={(item) => {
            setInputValue(item);
            setShowAutocomplete(false);
            textareaRef.current?.focus();
          }}
        />
      )}
      {isPasswordMode && ptyId && onePassword.pickerKey !== null && (
        <OnePasswordPicker
          ptyId={ptyId}
          promptKey={onePassword.pickerKey}
          onFilled={onePassword.onPickerFilled}
          onClose={closeOnePasswordPicker}
        />
      )}
      <div className="command-input-row">
        <Prompt />
        {isPasswordMode ? (
          <>
            <input
              ref={passwordInputRef}
              type="password"
              className="command-textarea"
              value={passwordValue}
              onChange={(e) => {
                // Typing means the user is entering it themselves.
                onePassword.cancelAutoFill();
                setPasswordValue(e.target.value);
              }}
              onKeyDown={handlePasswordKeyDown}
              placeholder={
                onePassword.isAutoFilling
                  ? 'Waiting for 1Password… (or type the password)'
                  : onePassword.offer
                    ? `Press Enter to fill ${onePassword.offer.title} from 1Password, or type the password`
                    : 'Enter password, or ⌘\\ to fill from 1Password...'
              }
              autoComplete="current-password"
              spellCheck={false}
            />
            <button
              className="passthrough-toggle-btn"
              onClick={onePassword.openPicker}
              title="Fill from 1Password (Cmd+\)"
            >
              <KeyIcon />
            </button>
          </>
        ) : (
          <textarea
            ref={textareaRef}
            className="command-textarea"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder="Type a command..."
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
          />
        )}
        <button
          className="passthrough-toggle-btn"
          onClick={togglePassthroughMode}
          title="Passthrough Mode (Cmd+E)"
        >
          <CommandLineIcon />
        </button>
      </div>
    </div>
  );
};

export default CommandInput;
