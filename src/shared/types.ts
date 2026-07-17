export interface StickyCommand {
  id: string;
  label: string;
  command: string;
  createdAt: number;
}

// --- IPC payloads shared between main and preload/renderer ---

export interface PtyDataPayload {
  id: string;
  data: string;
}

export interface PtyExitPayload {
  id: string;
  exitCode: number;
  signal: number;
}

export type FileTokenType = 'file' | 'directory';

export interface ResolvedToken {
  name: string;
  type: FileTokenType | null;
}

export interface FileStatSummary {
  size: number;
  created: string;
  modified: string;
}
