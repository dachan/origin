# Refactor Log

## 2026-09-22

- Started: 01:00 (UTC-4)
- Completed: 01:10 (UTC-4)
- Branch: main
- Summary: Pass over the renderer and persistence layers for performance, DRY, and KISS. No behavior changes.

### Changes
- Performance: `TerminalOutput`'s `ResizeObserver` called `fitAddon.fit()` (a synchronous layout) on every callback, which fires repeatedly during a window drag. Now coalesced into a single `requestAnimationFrame`, cancelled on cleanup.
- Performance: `terminal-file-link-provider` fetched the same buffer line twice per unresolved token (`translateToString` for text, then `getLine` again for the ANSI-color fallback). The line is now fetched once per `resolveLinks` call and reused.
- Performance: `cwdForLine` linearly scanned up to 500 CWD-history entries per hovered line. Entries are appended in ascending line order, so it now binary-searches for the last covering entry.
- Performance: `CommandPalette` rebuilt its filtered item list (mapping the full history) on every terminal state change even while closed; it now short-circuits when `!isPaletteOpen`.
- DRY: extracted the repeated "trim to `MAX_HISTORY`" splice in `command-history.ts` into a `trimToMax` helper used by both `load` and `append`.
- Complexity: none
- Clarity/organization: none
- KISS: collapsed the three-branch Cmd+K / Cmd+Shift+P check in `App.tsx` into one normalized key comparison.

## 2026-07-17

- Started: 08:01 (UTC-4)
- Completed: 08:53 (UTC-4)
- Branch: refactor/2026-07-17
- PR: https://github.com/dachan/origin/pull/1
- Summary: Reviewed `src/renderer/terminal-file-link-provider.ts`, the most-churned file in the repo, and fixed an HTML-injection bug in its hover tooltip plus a redundant filesystem-stat pattern on the multi-word-token retry path.

### Changes
- Bugs: `showMetadataTooltip` rendered the hover tooltip via `innerHTML` with an unescaped filename; a filename containing `<`, `>`, or `&` would corrupt the tooltip markup or inject arbitrary DOM elements. Now built with `textContent`-based DOM nodes.
- Performance: the pass-2 retry (splitting unresolved multi-word `ls` tokens into individual words) was re-running `fsResolveTokens` — one filesystem `stat` per token — over every token on the line, including ones already resolved in pass 1. Now only the newly split words are re-resolved.
- Complexity: none
- Clarity/organization: none
- DRY/KISS: none
