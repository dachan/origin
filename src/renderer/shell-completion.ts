import type { Terminal } from '@xterm/xterm';
import { KILL_LINE } from './context/TerminalContext';

// The shell's output counts as finished once it has been quiet this long,
// and is given at most this long in all.
const SETTLE_MS = 80;
const MAX_WAIT_MS = 600;

// Writes to the shell, waits for its output to stop, then for xterm to draw it.
function writeAndSettle(term: Terminal, ptyId: string, data: string): Promise<void> {
  return new Promise((resolve) => {
    let quietTimer = setTimeout(done, SETTLE_MS);
    const deadline = setTimeout(done, MAX_WAIT_MS);
    const unsubscribe = window.electronAPI.onPtyData(({ id }) => {
      if (id !== ptyId) return;
      clearTimeout(quietTimer);
      quietTimer = setTimeout(done, SETTLE_MS);
    });
    function done() {
      clearTimeout(quietTimer);
      clearTimeout(deadline);
      unsubscribe();
      // An empty write calls back once xterm has parsed everything before it.
      term.write('', resolve);
    }
    window.electronAPI.ptyWrite(ptyId, data);
  });
}

// The cursor's line up to the cursor, with wrapped rows joined back together.
function textBeforeCursor(term: Terminal): string {
  const buffer = term.buffer.active;
  let row = buffer.baseY + buffer.cursorY;
  let text = buffer.getLine(row)?.translateToString(false, 0, buffer.cursorX) ?? '';
  while (row > 0 && buffer.getLine(row)?.isWrapped) {
    row--;
    text = (buffer.getLine(row)?.translateToString(false) ?? '') + text;
  }
  return text;
}

// The command being typed lives in Origin's input, not the shell, so Tab hands
// it to the shell's line editor, lets the shell complete it, and reads the
// completed line back from the screen: what follows the prompt, up to the
// cursor. Returns null when the prompt can't be found again, for example when
// the shell redrew it differently.
export async function completeInShell(
  term: Terminal,
  ptyId: string,
  input: string
): Promise<string | null> {
  // Clear what a previous Tab left on the shell's line, so the cursor sits
  // right after the prompt.
  await writeAndSettle(term, ptyId, KILL_LINE);
  const prompt = textBeforeCursor(term);
  await writeAndSettle(term, ptyId, input + '\t');
  const line = textBeforeCursor(term);
  return line.startsWith(prompt) ? line.slice(prompt.length) : null;
}
