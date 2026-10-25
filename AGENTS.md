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
- `refactor-log.md` records the nightly refactor passes. Project skills are in `.claude/skills/`.
