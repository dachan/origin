# Changelog

## 0.1.9

- Fill the right password from 1Password items that hold several. Origin used to always read an item's main `password` field, so an item like a server's account login with separate root and user passwords filled the wrong one. After you pick an item with more than one password field, Origin asks which, preselecting the field labelled with the prompt's user (`[sudo] password for david:` → `david`), and remembers the item and field.
- Open the 1Password picker on its own at a password prompt with nothing remembered, instead of waiting for Cmd+\. Escape closes it to type the password yourself.
- Remember one-off `ssh host "sudo …"` prompts per ssh host. They used to be keyed by the local shell prompt's user@host, so every server reached from the same Mac shared one remembered item.

## 0.1.8

- Fill password prompts from 1Password. At a prompt ending in `password:` or `passphrase:`, Origin fills the 1Password item remembered for that prompt after Touch ID and shows a toast naming it; typing, Escape, or Ctrl+C cancels it. With nothing remembered, the masked input shows as before, and Cmd+\ (or the key button) opens a picker to choose a Login, Password, or Server item, which Origin then remembers. Items are remembered per prompt and user@host, so the same sudo prompt on different servers can use different items. Origin won't fill the same prompt again within 30 seconds, so a rejected password isn't retried. The main process reads the password with the 1Password CLI and types it straight into the shell; it never reaches the window or history.

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
