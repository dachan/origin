# Origin

Early-prototype terminal replacement built with Electron, xterm.js (WebGL renderer), node-pty, and React. Features include smart multi-line command input, persistent and shell-synced history, a command palette with starred commands, clickable file and directory links (including over SSH), and password-prompt masking.

## Commands

- `npm start`: run via Electron Forge.
- `npm run make` / `npm run package`: build distributables.
- `npm run lint`.

## Notes

- Record user-visible changes in `CHANGELOG.md` and bump the version for releases.
- Never write passwords typed into masked prompts to history.
- `refactor-log.md` records the nightly refactor passes. Project skills are in `.claude/skills/`.
