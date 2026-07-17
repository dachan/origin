# Refactor Log

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
