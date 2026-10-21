import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { JsonStore } from './persistence/store';
import type {
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

// Maps a password prompt (with its user@host) to the item last used for it.
// Holds item metadata only, never secrets.
type Remembered = Record<string, OnePasswordItem>;
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
  const rememberedItem = remembered
    ? items.find((i) => i.id === remembered.id && i.accountId === remembered.accountId)
    : undefined;
  return { items, rememberedId: rememberedItem?.id ?? null };
}

async function rememberedFor(promptKey: string): Promise<OnePasswordItem | null> {
  const item = (await rememberedStore.load())[promptKey];
  // Entries saved before vaultId was stored can't be read; pick them again.
  return item?.vaultId ? item : null;
}

// Reads the item's password and returns it. Callers must write it straight
// to the PTY; it must never reach the renderer or history.
async function readPassword(
  item: OnePasswordItem,
  promptKey: string,
  signal?: AbortSignal
): Promise<string> {
  const secret = await runOp([
    'read', '--no-newline',
    '--account', item.accountId,
    `op://${item.vaultId}/${item.id}/password`,
  ], signal);
  const remembered = await rememberedStore.load();
  remembered[promptKey] = item;
  await rememberedStore.save(remembered);
  return secret;
}

export const onePassword = {
  listItems: (promptKey: string) => toResult(listItems(promptKey)),
  rememberedFor,
  readPassword: (item: OnePasswordItem, promptKey: string, signal?: AbortSignal) =>
    toResult(readPassword(item, promptKey, signal)),
};
