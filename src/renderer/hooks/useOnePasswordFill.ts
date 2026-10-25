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
  lastCommandRef: React.MutableRefObject<string | null>;
  isPasswordMode: boolean;
  onFilled: () => void;
}

// A remembered item offered for the current prompt, filled only on Enter.
interface Offer {
  key: string;
  title: string;
}

// At a password prompt, offers the 1Password item remembered for it; Enter
// fills it (after Touch ID). Any program can print text that looks like a
// password prompt, so nothing is filled without that keypress. With nothing
// remembered, the picker opens to choose one; Escape closes it and leaves the
// masked input for typing the password.
export function useOnePasswordFill({
  ptyId,
  terminalRef,
  lastCommandRef,
  isPasswordMode,
  onFilled,
}: Options) {
  const [pickerKey, setPickerKey] = useState<string | null>(null);
  const [offer, setOffer] = useState<Offer | null>(null);
  const [isAutoFilling, setIsAutoFilling] = useState(false);
  // Bumped to drop the result of a lookup or fill that was cancelled.
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
      setOffer(null);
      cancelAutoFill();
      return;
    }
    // Wait for xterm to draw the prompt line before reading it.
    const timer = setTimeout(() => {
      const { prompt, key } = readPrompt(terminalRef.current, lastCommandRef.current);
      if (!CURSOR_PROMPT_RE.test(prompt)) return;
      const last = lastFillRef.current;
      if (last && last.key === key && Date.now() - last.at < RETRY_WINDOW_MS) return;

      const id = ++autoFillIdRef.current;
      window.electronAPI.opRememberedTitle(key).then((title) => {
        if (id !== autoFillIdRef.current) return;
        if (title) setOffer({ key, title });
        else setPickerKey(key);
      });
    }, 50);
    return () => clearTimeout(timer);
  }, [isPasswordMode, ptyId, terminalRef, lastCommandRef, cancelAutoFill]);

  const acceptOffer = useCallback(() => {
    if (!offer || !ptyId || pendingRef.current) return;
    const { key } = offer;
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
      }
    });
  }, [offer, ptyId, onFilled]);

  const openPicker = useCallback(() => {
    cancelAutoFill();
    setPickerKey(readPrompt(terminalRef.current, lastCommandRef.current).key);
  }, [cancelAutoFill, terminalRef, lastCommandRef]);

  const closePicker = useCallback(() => setPickerKey(null), []);

  const onPickerFilled = useCallback(() => {
    if (pickerKey !== null) lastFillRef.current = { key: pickerKey, at: Date.now() };
    onFilled();
  }, [pickerKey, onFilled]);

  return {
    pickerKey,
    offer,
    isAutoFilling,
    acceptOffer,
    openPicker,
    closePicker,
    onPickerFilled,
    cancelAutoFill,
  };
}
