# Changelog

## 0.1.7

- Start zsh as a login shell and load the user's `~/.zprofile`, so tools on Homebrew's PATH (such as the 1Password CLI `op`) are found when Origin is opened from the Dock or Finder.

## 0.1.6

- Point the package `main` entry at `.webpack/main/index.cjs`, which Electron Forge 8's webpack plugin requires. Without it `npm start` fails to launch.
- Update the packaging hook that copies node-pty to the single-argument signature of @electron/packager 20, so `npm run package` works again.
- Add `AGENTS.md` and a `CLAUDE.md` stub with the project context.

## 0.1.5

- Copy from the Edit menu and Cmd+C copies the command-input selection when there is one, and the terminal selection otherwise.
- Insert a blank line before each prompt after the first, for zsh and bash, while still loading the user's own shell config.
- Keep file and directory hover cards offset from the pointer and inside the window.
- Remove the product demo page, recording script, and media.
- Upgrade Electron Forge to 8 and bump Electron, ESLint, and related tooling.
