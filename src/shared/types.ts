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

export interface OnePasswordItem {
  id: string;
  title: string;
  // Usually the username.
  subtitle: string;
  vaultId: string;
  vault: string;
  accountId: string;
  account: string;
}

export interface OnePasswordItemList {
  items: OnePasswordItem[];
  // The item last used for the same prompt, if it still exists.
  rememberedId: string | null;
}

export type OnePasswordResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };
