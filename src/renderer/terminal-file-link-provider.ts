import type { ILinkProvider, ILink, Terminal, IBufferRange } from '@xterm/xterm';

// Tokens that look like ls -l metadata rather than filenames
const SKIP_PATTERNS = [
  /^[drwxsStT\-lbcpDL]{10,}$/, // permission strings like drwxr-xr-x
  /^\d{1,2}:\d{2}$/, // time like 14:30
  /^\d{4}-\d{2}-\d{2}$/, // date like 2024-01-15
  /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/i, // month names
  /^\d+$/, // pure numbers (sizes, link counts)
  /^total$/, // "total" line from ls -l
  /^->$/, // symlink arrow
];

// ls -F / ls -G indicator suffixes appended to filenames
const LS_INDICATOR_SUFFIX = /[/*@|=]$/;

function stripIndicator(token: string): string {
  return token.replace(LS_INDICATOR_SUFFIX, '');
}

function shouldSkipToken(token: string): boolean {
  const cleaned = stripIndicator(token);
  if (cleaned.length === 0) return true;
  return SKIP_PATTERNS.some((re) => re.test(cleaned));
}

export interface CwdHistoryEntry {
  line: number;
  cwd: string;
}

export class FileSystemLinkProvider implements ILinkProvider {
  private ptyIdRef: { current: string | null };
  private cwdHistoryRef: { current: CwdHistoryEntry[] };

  constructor(
    ptyIdRef: { current: string | null },
    cwdHistoryRef: { current: CwdHistoryEntry[] }
  ) {
    this.ptyIdRef = ptyIdRef;
    this.cwdHistoryRef = cwdHistoryRef;
  }

  provideLinks(
    bufferLineNumber: number,
    callback: (links: ILink[] | undefined) => void
  ): void {
    const ptyId = this.ptyIdRef.current;
    if (!ptyId) {
      callback(undefined);
      return;
    }

    this.resolveLinks(ptyId, bufferLineNumber).then(callback).catch(() => {
      callback(undefined);
    });
  }

  private cwdForLine(bufferLineNumber: number): string | null {
    const history = this.cwdHistoryRef.current;
    // Find the last entry where entry.line <= bufferLineNumber
    let best: CwdHistoryEntry | null = null;
    for (const entry of history) {
      if (entry.line <= bufferLineNumber) {
        best = entry;
      } else {
        break;
      }
    }
    return best ? best.cwd : null;
  }

  private async resolveLinks(
    ptyId: string,
    bufferLineNumber: number
  ): Promise<ILink[] | undefined> {
    // Look up the CWD that was active when this line was produced
    let cwd = this.cwdForLine(bufferLineNumber);
    // Fall back to live CWD if no history entry covers this line
    if (!cwd) {
      cwd = await window.electronAPI.fsGetCwd(ptyId);
    }
    if (!cwd) return undefined;

    // We need the terminal buffer to read line text, but ILinkProvider
    // doesn't get a terminal reference. We stored it on the provider instead.
    const lineText = this.getLineText(bufferLineNumber);
    if (!lineText) return undefined;

    // Pass 1: tokenize preserving single-space filenames (e.g. "Stream Deck")
    // ls column output separates entries with 2+ spaces for alignment
    let tokenEntries: { token: string; startCol: number }[] = [];
    const regex = /\S+(?:\s(?!\s)\S+)*/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(lineText)) !== null) {
      const token = match[0];
      if (!shouldSkipToken(token)) {
        tokenEntries.push({ token, startCol: match.index });
      }
    }

    if (tokenEntries.length === 0) return undefined;

    // Strip ls indicator suffixes before resolving against the filesystem
    let cleanTokens = tokenEntries.map((e) => stripIndicator(e.token));
    let results = await window.electronAPI.fsResolveTokens(cwd, cleanTokens);

    // Pass 2: for unresolved multi-word tokens, split into individual words
    // and try again (handles single-space column gaps in ls output)
    const hasUnresolvedMultiWord = results.some(
      (r, i) => !r.type && cleanTokens[i].includes(' ')
    );
    if (hasUnresolvedMultiWord) {
      const expanded: { token: string; startCol: number }[] = [];
      for (let i = 0; i < tokenEntries.length; i++) {
        if (!results[i].type && tokenEntries[i].token.includes(' ')) {
          // Split this grouped token into individual words
          const wordRegex = /\S+/g;
          let wordMatch: RegExpExecArray | null;
          while ((wordMatch = wordRegex.exec(tokenEntries[i].token)) !== null) {
            const word = wordMatch[0];
            if (!shouldSkipToken(word)) {
              expanded.push({
                token: word,
                startCol: tokenEntries[i].startCol + wordMatch.index,
              });
            }
          }
        } else {
          expanded.push(tokenEntries[i]);
        }
      }
      tokenEntries = expanded;
      cleanTokens = tokenEntries.map((e) => stripIndicator(e.token));
      results = await window.electronAPI.fsResolveTokens(cwd, cleanTokens);
    }

    const links: ILink[] = [];
    for (let i = 0; i < results.length; i++) {
      const { name, type } = results[i];
      if (!type) continue;

      const entry = tokenEntries[i];
      const range: IBufferRange = {
        start: { x: entry.startCol + 1, y: bufferLineNumber },
        end: { x: entry.startCol + entry.token.length, y: bufferLineNumber },
      };

      // Build absolute path so clicks work even after cd'ing elsewhere
      const fullPath = cwd + '/' + name;

      links.push({
        range,
        text: name,
        decorations: { pointerCursor: true, underline: true },
        activate: () => {
          if (type === 'directory') {
            const escaped = fullPath.replace(/'/g, "'\\''");
            window.electronAPI.ptyWrite(ptyId, `cd '${escaped}'\n`);
          } else {
            window.electronAPI.fsOpenFile(fullPath);
          }
        },
        hover: (event: MouseEvent) => {
          this.showMetadataTooltip(event, fullPath, type, name);
        },
        leave: () => {
          this.hideTooltip();
        },
      });
    }

    return links.length > 0 ? links : undefined;
  }

  // Terminal reference set externally after construction
  terminal: Terminal | null = null;

  private getLineText(bufferLineNumber: number): string | null {
    if (!this.terminal) return null;
    const line = this.terminal.buffer.active.getLine(bufferLineNumber - 1);
    return line ? line.translateToString(true) : null;
  }

  private tooltipEl: HTMLElement | null = null;
  private tooltipRequestId = 0;

  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }

  private formatDate(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  private showMetadataTooltip(
    event: MouseEvent,
    fullPath: string,
    type: 'file' | 'directory',
    name: string
  ): void {
    // Show immediate tooltip with action hint
    const action = type === 'directory' ? `cd ${name}` : `Open ${name}`;
    this.showTooltip(event, action);

    // Fetch metadata async and update tooltip
    const requestId = ++this.tooltipRequestId;
    window.electronAPI.fsStat(fullPath).then((stat) => {
      if (!stat || requestId !== this.tooltipRequestId || !this.tooltipEl) return;
      const lines = [action];
      if (type === 'file') lines.push(this.formatSize(stat.size));
      lines.push(`Created: ${this.formatDate(stat.created)}`);
      lines.push(`Modified: ${this.formatDate(stat.modified)}`);
      this.tooltipEl.innerHTML = lines
        .map((l, i) => `<div style="${i === 0 ? 'margin-bottom:4px' : 'color:#565f89'}">${l}</div>`)
        .join('');
    }).catch(() => { /* best-effort */ });
  }

  private showTooltip(event: MouseEvent, text: string): void {
    this.hideTooltip();
    const el = document.createElement('div');
    el.className = 'xterm-hover';
    el.textContent = text;
    el.style.cssText = `
      position: fixed;
      left: ${event.clientX + 8}px;
      top: ${event.clientY - 28}px;
      background: #1e1e2e;
      color: #c0caf5;
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 12px;
      line-height: 1.5;
      font-family: 'SF Mono', 'Menlo', monospace;
      pointer-events: none;
      z-index: 10000;
      border: 1px solid #33467c;
      white-space: nowrap;
    `;
    document.body.appendChild(el);
    this.tooltipEl = el;
  }

  private hideTooltip(): void {
    this.tooltipRequestId++;
    if (this.tooltipEl) {
      this.tooltipEl.remove();
      this.tooltipEl = null;
    }
  }
}
