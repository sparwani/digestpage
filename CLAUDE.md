# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

"DigestPage" is a Chrome Extension (Manifest V3) that extracts webpage content, prepends a user-configured prompt, and sends it to ChatGPT. No build system, bundler, or test framework — plain vanilla JavaScript loaded directly by Chrome.

## Development

Load as an unpacked extension in Chrome: `chrome://extensions/` → Enable Developer Mode → Load Unpacked → select this directory. Reload the extension after changes. There is no build step, linter, or test runner.

The only npm dependency (`@mozilla/readability`) is vendored into `vendor/Readability.js`. The `node_modules/` directory is not used at runtime.

## Architecture

The extension has three runtime contexts that communicate via `chrome.storage.local`:

1. **Service Worker (`background.js`)** — Handles the keyboard shortcut (`Cmd+Shift+Y`), extracts page content by injecting a function into the active tab, applies prompt template variables (`{title}`, `{url}`, `{domain}`, `{date}`), stores the result as `pendingClip`, and opens ChatGPT.

2. **Popup UI (`popup.html` / `popup.js` / `popup.css`)** — Manages the prompt list (CRUD, active selection) and the "Smart Extract" toggle. All state is persisted to `chrome.storage.local` under the `prompts` and `smartExtract` keys.

3. **Content Script (`chatgpt-inject.js`)** — Injected into `chatgpt.com` / `chat.openai.com`. Reads `pendingClip` from storage, pastes it into the ChatGPT input field, and auto-submits. Uses polling (up to 50 attempts) to wait for the input element.

### Content Extraction Strategies (in `background.js`)

- **YouTube** (`extractYouTubeTranscript`) — Clicks "Show transcript", scrapes segments, re-closes the panel.
- **Smart Extract** (`extractWithReadability`) — Injects `vendor/Readability.js` then runs Mozilla Readability on a cloned DOM. Falls back to `innerText` if Readability fails.
- **Plain text** (`extractPageText`) — `document.body.innerText` with whitespace normalization.

### Storage Keys

| Key | Type | Purpose |
|-----|------|---------|
| `prompts` | `Array<{id, name, text, isActive}>` | User prompt templates |
| `smartExtract` | `boolean` (default `true`) | Toggle Readability vs plain text |
| `pendingClip` | `string` | Transient: text awaiting injection into ChatGPT |

### Data Flow

Keyboard shortcut → `background.js` extracts text → applies active prompt template → writes `pendingClip` to storage → opens ChatGPT tab → `chatgpt-inject.js` reads `pendingClip` → pastes into input → auto-submits.
