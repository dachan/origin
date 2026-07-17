---
name: verify
description: Build, launch, and drive the Origin terminal app to verify changes end-to-end via Playwright over CDP.
---

# Verifying Origin

Origin is an Electron app (electron-forge + webpack). There is no headless mode; verify by launching the dev app with a CDP port and driving the renderer with Playwright (already a devDependency).

## Launch

```bash
# Port 9222 is often taken on this machine — use 9333.
ELECTRON_ENABLE_LOGGING=1 npx electron-forge start -- --remote-debugging-port=9333
```

Run in the background; wait until `curl -s http://localhost:9333/json/version` responds (webpack compile takes ~20–60 s). The app window opens on screen. Check the forge log for `[ForkTsCheckerWebpackPlugin] No errors found` and renderer console errors.

## Drive

Playwright can't be resolved from outside the repo — import it by absolute path in a scratch script:

```js
import { chromium } from '/Users/davidchan/Development/origin/node_modules/playwright/index.mjs';
const browser = await chromium.connectOverCDP('http://localhost:9333');
const page = browser.contexts()[0].pages()[0];
```

- The command textarea is auto-focused; `page.keyboard.type(...)` + `Enter` executes commands in the real shell.
- `page.screenshot(...)` captures the terminal state; give the shell ~1 s to respond first.
- `page.reload()` exercises the renderer-reload path (PTY disposal in main).
- Useful shortcuts to simulate: `Meta+k` (palette), `Meta+-`/`Meta+0` (font size), double `Escape` (clear terminal), `Meta+f` (search).

## Gotchas

- Killing `electron-forge start` can leave the Electron process alive; also `pkill -f "origin/node_modules/electron/dist"`.
- Commands you type land in the user's real shell and shell history (`~/.zsh_history`) — keep them harmless (`echo`, `ls`).
- To check for leaked PTY shells, count zsh processes whose parent is the Origin Electron main process.
