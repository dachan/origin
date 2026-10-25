import type { IBuffer, Terminal } from '@xterm/xterm';

const USER_HOST_RE = /[\w.-]+@[\w.-]+/;
// How many lines above the prompt to look for the shell prompt's user@host.
// Wrapped rows of a long command count as part of the line they continue.
const HOST_LOOKBACK_LINES = 5;
// ssh options that take the next word as their value, as in `ssh -p 22 host`.
const SSH_OPTIONS_WITH_VALUE = 'BbcDEeFIiJLlmOoPpQRSWw';
const SSH_RE = /(?:^|\s)ssh\s+(.*)$/;
// "[sudo] password for david:" or "david@host's password:"
const PROMPT_USER_RES = [/password for ([\w.-]+)/i, /([\w.-]+)@[\w.-]+'s password/i];

// A row plus the rows that wrap onto it, so a long command reads as one line.
function logicalLine(buffer: IBuffer, row: number): string {
  let text = buffer.getLine(row)?.translateToString(false) ?? '';
  for (let next = row + 1; buffer.getLine(next)?.isWrapped; next++) {
    text += buffer.getLine(next)?.translateToString(false) ?? '';
  }
  return text.trim();
}

// The host a command line connects to with ssh, if it runs ssh.
function sshDestination(command: string): string | null {
  const args = command.match(SSH_RE)?.[1].split(/\s+/) ?? [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('-')) return arg || null;
    if (arg.length === 2 && SSH_OPTIONS_WITH_VALUE.includes(arg[1])) i++;
  }
  return null;
}

// "[sudo] password for david:" reads the same on every server, so the key for
// remembering an item adds where the prompt came from. SSH prompts
// ("david@host's password:") name it themselves. Otherwise it's the nearest
// shell prompt's user@host, or the ssh target when that shell prompt ran a
// one-off `ssh host "sudo ..."`, since the local user@host says nothing about
// which server is asking.
export function readPrompt(term: Terminal | null): { prompt: string; key: string } {
  const buffer = term?.buffer.active;
  if (!buffer) return { prompt: '', key: '' };
  const cursorRow = buffer.baseY + buffer.cursorY;
  const prompt = buffer.getLine(cursorRow)?.translateToString(true).trim() ?? '';
  if (USER_HOST_RE.test(prompt)) return { prompt, key: prompt };

  let lines = 0;
  for (let row = cursorRow - 1; row >= 0 && lines < HOST_LOOKBACK_LINES; row--) {
    if (buffer.getLine(row)?.isWrapped) continue;
    lines++;
    const line = logicalLine(buffer, row);
    const userHost = line.match(USER_HOST_RE);
    if (!userHost) continue;
    const command = line.slice((userHost.index ?? 0) + userHost[0].length);
    const destination = sshDestination(command);
    return { prompt, key: destination ? `ssh ${destination} ${prompt}` : `${userHost[0]} ${prompt}` };
  }
  return { prompt, key: prompt };
}

// The user a prompt asks for, used to preselect the 1Password field with
// that label.
export function promptUser(prompt: string): string | null {
  for (const re of PROMPT_USER_RES) {
    const user = prompt.match(re)?.[1];
    if (user) return user;
  }
  return null;
}
