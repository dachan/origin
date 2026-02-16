import React, { useRef, useState, useCallback, useEffect } from 'react';
import { useTerminal } from '../context/TerminalContext';
import Autocomplete from './Autocomplete';
import Prompt from './Prompt';

const CommandInput: React.FC = () => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [inputValue, setInputValue] = useState('');
  const [autocompleteItems, setAutocompleteItems] = useState<string[]>([]);
  const [autocompleteIndex, setAutocompleteIndex] = useState(-1);
  const [showAutocomplete, setShowAutocomplete] = useState(false);

  const {
    ptyId,
    history,
    historyIndex,
    setHistoryIndex,
    executeCommand,
    filterHistory,
    isRawMode,
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
          if (autocompleteIndex >= 0) {
            setInputValue(autocompleteItems[autocompleteIndex]);
            setShowAutocomplete(false);
          } else if (autocompleteItems.length > 0) {
            setInputValue(autocompleteItems[0]);
            setShowAutocomplete(false);
          }
          return;
        }
        if (e.key === 'Enter' && autocompleteIndex >= 0) {
          e.preventDefault();
          setInputValue(autocompleteItems[autocompleteIndex]);
          setShowAutocomplete(false);
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
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

      // --- Tab without autocomplete = send tab to PTY for shell completion ---
      if (e.key === 'Tab' && !showAutocomplete) {
        e.preventDefault();
        if (ptyId && inputValue.trim()) {
          // For tab completion, we need to write the current input to PTY
          // and then send a tab character
          window.electronAPI.ptyWrite(ptyId, inputValue + '\t');
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
      setHistoryIndex,
    ]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      setInputValue(value);

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
    [filterHistory]
  );

  // Auto-focus the textarea
  useEffect(() => {
    if (!isRawMode) {
      textareaRef.current?.focus();
    }
  }, [isRawMode]);

  // Adjust height when input changes
  useEffect(() => {
    adjustTextareaHeight();
  }, [inputValue, adjustTextareaHeight]);

  // Keep focus on the textarea when clicking elsewhere (except terminal output)
  useEffect(() => {
    const handleWindowClick = (e: MouseEvent) => {
      if (isRawMode) return;
      const target = e.target as HTMLElement;
      if (!target.closest('.terminal-output') && !target.closest('.palette-overlay')) {
        textareaRef.current?.focus();
      }
    };
    window.addEventListener('click', handleWindowClick);
    return () => window.removeEventListener('click', handleWindowClick);
  }, [isRawMode]);

  // Don't render in raw mode
  if (isRawMode) return null;

  return (
    <div className="command-input-container">
      {showAutocomplete && (
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
      <div className="command-input-row">
        <Prompt />
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
      </div>
    </div>
  );
};

export default CommandInput;
