# Changelog

## 0.1.10

Security fixes from a review of the app.

- 1Password fills need a keypress. At a prompt with a remembered item, the input reads "Press Enter to fill … from 1Password"; Enter fills it, typing enters a password yourself. Before, Origin filled automatically, so any program or server could print a fake prompt and receive the password. One-off `ssh host "sudo …"` prompts now take the host from the command Origin ran rather than from screen text.
- The window can no longer navigate away from Origin, for example when a file is dropped on it. Any other page would have had the app's access to the shell and to 1Password fills. Only the app's own page can call the main process.
- Web links in terminal output open in the default browser instead of an Origin window, and the window's renderer is now sandboxed with a strict Content-Security-Policy.
- Clicking a link to an executable, script, installer, or link file shows it in Finder instead of running it.
- Input sent while a program reads a secret with echo off (a password prompt Origin didn't recognize) is kept out of history.
- Upgrade Electron to 44.9.3 for its security fixes, and apply non-breaking fixes for build-tool advisories.
- Packaged builds load app code only from the app archive, hide DevTools, and refuse to start with Chromium remote-debugging switches.
- 1Password item and field IDs from the window are validated before reaching the 1Password CLI.

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
