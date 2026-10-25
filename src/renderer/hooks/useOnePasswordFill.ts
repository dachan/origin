import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Terminal } from '@xterm/xterm';
import { showToast } from '../components/Toast';
import { readPrompt } from '../password-prompt';

// Stricter than the detector in TerminalContext: the prompt must end the
// cursor line, so output that merely mentions a password doesn't call
// 1Password.
const CURSOR_PROMPT_RE = /(password|passphrase)[^:]*:$/i;
// A second prompt this soon after filling the same one means the password
// was probably rejected ("Sorry, try again"); don't burn another attempt.
const RETRY_WINDOW_MS = 30_000;

interface Options {
  ptyId: string | null;
  terminalRef: React.MutableRefObject<Terminal | null>;
  isPasswordMode: boolean;
  onFilled: () => void;
}

// At a password prompt, fills the 1Password item remembered for it (after
// Touch ID). With nothing remembered, the picker opens to choose one; Escape
// closes it and leaves the masked input for typing the password.
export function useOnePasswordFill({ ptyId, terminalRef, isPasswordMode, onFilled }: Options) {
  const [pickerKey, setPickerKey] = useState<string | null>(null);
  const [isAutoFilling, setIsAutoFilling] = useState(false);
  // Bumped to drop the result of an auto-fill that was cancelled.
  const autoFillIdRef = useRef(0);
  const pendingRef = useRef(false);
  const lastFillRef = useRef<{ key: string; at: number } | null>(null);

  const cancelAutoFill = useCallback(() => {
    if (!pendingRef.current) return;
    pendingRef.current = false;
    autoFillIdRef.current++;
    setIsAutoFilling(false);
    if (ptyId) window.electronAPI.opCancelAutoFill(ptyId);
  }, [ptyId]);

  useEffect(() => {
    if (!isPasswordMode || !ptyId) {
      setPickerKey(null);
      cancelAutoFill();
      return;
    }
    // Wait for xterm to draw the prompt line before reading it.
    const timer = setTimeout(() => {
      const { prompt, key } = readPrompt(terminalRef.current);
      if (!CURSOR_PROMPT_RE.test(prompt)) return;
      const last = lastFillRef.current;
      if (last && last.key === key && Date.now() - last.at < RETRY_WINDOW_MS) return;

      const id = ++autoFillIdRef.current;
      pendingRef.current = true;
      setIsAutoFilling(true);
      window.electronAPI.opAutoFill(ptyId, key).then((result) => {
        if (id !== autoFillIdRef.current) return;
        pendingRef.current = false;
        setIsAutoFilling(false);
        if (!result.ok) {
          showToast(result.error);
        } else if (result.value) {
          lastFillRef.current = { key, at: Date.now() };
          showToast(`Filled from 1Password: ${result.value}`);
          onFilled();
        } else {
          setPickerKey(key);
        }
      });
    }, 50);
    return () => clearTimeout(timer);
  }, [isPasswordMode, ptyId, terminalRef, cancelAutoFill, onFilled]);

  const openPicker = useCallback(() => {
    cancelAutoFill();
    setPickerKey(readPrompt(terminalRef.current).key);
  }, [cancelAutoFill, terminalRef]);

  const closePicker = useCallback(() => setPickerKey(null), []);

  const onPickerFilled = useCallback(() => {
    if (pickerKey !== null) lastFillRef.current = { key: pickerKey, at: Date.now() };
    onFilled();
  }, [pickerKey, onFilled]);

  return { pickerKey, isAutoFilling, openPicker, closePicker, onPickerFilled, cancelAutoFill };
}
