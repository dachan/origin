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

// A concealed field of an item. One item can hold several passwords, such as
// a server's root and user passwords in separate sections.
export interface OnePasswordField {
  id: string;
  label: string;
  section: string;
}

// What fills a prompt: an item and which of its fields to read.
export interface OnePasswordFill {
  item: OnePasswordItem;
  field: OnePasswordField;
}

export interface OnePasswordItemList {
  items: OnePasswordItem[];
  // The item and field last used for the same prompt, if the item still exists.
  rememberedId: string | null;
  rememberedFieldId: string | null;
}

export type OnePasswordResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };
