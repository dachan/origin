import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { JsonStore } from './persistence/store';
import type {
  OnePasswordField,
  OnePasswordFill,
  OnePasswordItem,
  OnePasswordItemList,
  OnePasswordResult,
} from '../shared/types';

const execFileAsync = promisify(execFile);

// Apps opened from the Dock get a minimal PATH, so also look where the
// Homebrew and pkg installers put `op`.
const OP_DIRS = ['/opt/homebrew/bin', '/usr/local/bin'];

// Long enough for the user to approve the 1Password prompt.
const OP_TIMEOUT_MS = 120_000;

const CATEGORIES = 'Login,Password,Server';

// 1Password IDs are letters, digits, '_' and '-'. Item and field IDs come back
// from the renderer, so check them before they become op arguments or part of
// an op:// reference.
const OP_ID_RE = /^[A-Za-z0-9_][A-Za-z0-9_-]*$/;

function checkIds(...ids: string[]): void {
  if (!ids.every((id) => typeof id === 'string' && OP_ID_RE.test(id))) {
    throw new Error('Invalid 1Password item');
  }
}

interface OpAccount {
  url: string;
  account_uuid: string;
}

interface OpItem {
  id: string;
  title: string;
  additional_information?: string;
  vault: { id: string; name: string };
}

interface OpField {
  id: string;
  type: string;
  label?: string;
  section?: { label?: string };
}

// Maps a password prompt (with its user@host or ssh target) to the item and
// field last used for it. Holds metadata only, never secrets.
type Remembered = Record<string, OnePasswordFill>;
const rememberedStore = new JsonStore<Remembered>('one-password-fills.json', {});

function findOp(): string | null {
  const dirs = [...(process.env.PATH ?? '').split(path.delimiter), ...OP_DIRS];
  for (const dir of dirs) {
    const candidate = path.join(dir, 'op');
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      // keep looking
    }
  }
  return null;
}

async function runOp(args: string[], signal?: AbortSignal): Promise<string> {
  const op = findOp();
  if (!op) {
    throw new Error('1Password CLI not found. Install it with: brew install 1password-cli');
  }
  try {
    const { stdout } = await execFileAsync(op, args, {
      // Use the 1Password app (Touch ID) even when op can't read the app's
      // "Integrate with 1Password CLI" setting for itself.
      env: { ...process.env, OP_BIOMETRIC_UNLOCK_ENABLED: 'true' },
      timeout: OP_TIMEOUT_MS,
      signal,
      maxBuffer: 10 * 1024 * 1024,
    });
    return stdout;
  } catch (err) {
    // op prints "[ERROR] <date> <message>"; surface just the message.
    const stderr = (err as { stderr?: string }).stderr ?? '';
    const message = stderr.trim().split('\n').pop()?.replace(/^\[ERROR\] \S+ \S+ /, '');
    if (message && /promptError|dismissed/i.test(message)) {
      throw new Error('1Password approval was dismissed or timed out. Press Escape, then ⌘\\ to try again.', { cause: err });
    }
    throw new Error(message || (err as Error).message, { cause: err });
  }
}

function toResult<T>(promise: Promise<T>): Promise<OnePasswordResult<T>> {
  return promise.then(
    (value) => ({ ok: true as const, value }),
    (err: Error) => ({ ok: false as const, error: err.message })
  );
}

async function listAccountItems(account: OpAccount): Promise<OnePasswordItem[]> {
  const stdout = await runOp([
    'item', 'list',
    '--account', account.account_uuid,
    '--categories', CATEGORIES,
    '--format', 'json',
  ]);
  return (JSON.parse(stdout) as OpItem[]).map((item) => ({
    id: item.id,
    title: item.title,
    subtitle: item.additional_information ?? '',
    vaultId: item.vault.id,
    vault: item.vault.name,
    accountId: account.account_uuid,
    account: account.url,
  }));
}

async function listItems(promptKey: string): Promise<OnePasswordItemList> {
  const accounts = JSON.parse(
    await runOp(['account', 'list', '--format', 'json'])
  ) as OpAccount[];
  if (accounts.length === 0) {
    throw new Error('No 1Password accounts. Turn on "Integrate with 1Password CLI" in 1Password.');
  }

  // Sequential so 1Password shows one approval prompt at a time.
  const items: OnePasswordItem[] = [];
  for (const account of accounts) {
    items.push(...(await listAccountItems(account)));
  }
  items.sort((a, b) => a.title.localeCompare(b.title));

  const remembered = await rememberedFor(promptKey);
  const stillExists =
    remembered !== null &&
    items.some((i) => i.id === remembered.item.id && i.accountId === remembered.item.accountId);
  return {
    items,
    rememberedId: stillExists ? remembered.item.id : null,
    rememberedFieldId: stillExists ? remembered.field.id : null,
  };
}

// The item's concealed fields, without their values. op's JSON includes the
// values, so this output must stay in the main process.
async function listFields(item: OnePasswordItem): Promise<OnePasswordField[]> {
  checkIds(item.id, item.vaultId, item.accountId);
  const stdout = await runOp([
    'item', 'get', item.id,
    '--vault', item.vaultId,
    '--account', item.accountId,
    '--format', 'json',
  ]);
  const { fields = [] } = JSON.parse(stdout) as { fields?: OpField[] };
  return fields
    .filter((field) => field.type === 'CONCEALED')
    .map((field) => ({
      id: field.id,
      label: field.label ?? field.id,
      section: field.section?.label ?? '',
    }));
}

async function rememberedFor(promptKey: string): Promise<OnePasswordFill | null> {
  const fill = (await rememberedStore.load())[promptKey];
  // Entries saved before fields were stored only name an item; pick them again.
  return fill?.field ? fill : null;
}

// Reads the field and returns it. Callers must write it straight to the PTY;
// it must never reach the renderer or history.
async function readPassword(
  fill: OnePasswordFill,
  promptKey: string,
  signal?: AbortSignal
): Promise<string> {
  const { item, field } = fill;
  checkIds(item.id, item.vaultId, item.accountId, field.id);
  const secret = await runOp([
    'read', '--no-newline',
    '--account', item.accountId,
    `op://${item.vaultId}/${item.id}/${field.id}`,
  ], signal);
  const remembered = await rememberedStore.load();
  remembered[promptKey] = fill;
  await rememberedStore.save(remembered);
  return secret;
}

export const onePassword = {
  listItems: (promptKey: string) => toResult(listItems(promptKey)),
  listFields: (item: OnePasswordItem) => toResult(listFields(item)),
  rememberedFor,
  readPassword: (fill: OnePasswordFill, promptKey: string, signal?: AbortSignal) =>
    toResult(readPassword(fill, promptKey, signal)),
};
