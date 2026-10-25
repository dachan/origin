# Origin

Early-prototype terminal replacement built with Electron, xterm.js (WebGL renderer), node-pty, and React. Features include smart multi-line command input, persistent and shell-synced history, a command palette with starred commands, clickable file and directory links (including over SSH), and password-prompt masking.

## Commands

- `npm start`: run via Electron Forge.
- `npm run make` / `npm run package`: build distributables.
- `npm run lint`.

## Notes

- Record user-visible changes in `CHANGELOG.md` and bump the version for releases.
- Never write passwords typed into masked prompts to history.
- 1Password fill (`src/main/one-password.ts`): the main process reads the password with `op` and writes it straight to the PTY. Never send it to the renderer, log it, or store it; `one-password-fills.json` holds item and field metadata only. `op item get` JSON includes field values, so it must stay in the main process; only field IDs, labels, and sections reach the renderer.
- Never fill a 1Password secret without a keypress for that prompt: prompt text and the user@host above it are screen output any program can print. A one-off ssh target comes from the last command Origin ran, not from the screen.
- Security boundaries (`src/main/index.ts`, `src/main/ipc-handlers.ts`): the preload exposes the shell and 1Password fills, so the window may only show the app page (`will-navigate` guard, `isAppUrl` in `src/main/app-url.ts`), every IPC handler is registered through `handle`/`on`, which reject other senders, window opens are denied with http(s) sent to the default browser, and the renderer is sandboxed under a production CSP (`src/renderer/index.html`). Packaged builds refuse Chromium remote-debugging switches and hide DevTools; to drive a packaged build for testing, temporarily disable that guard and restore it before committing.
- File links run nothing: `fs:openFile` reveals executables and runnable types in Finder.
- `refactor-log.md` records the nightly refactor passes. Project skills are in `.claude/skills/`.
