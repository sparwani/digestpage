# DigestPage

A Chrome extension that extracts webpage content and sends it to ChatGPT with a customizable prompt. Works with articles, YouTube transcripts, and any webpage.

## Features

- **Smart Extract** — Uses [Mozilla Readability](https://github.com/nicholasvisco/readability) to extract clean article text, stripping navigation, ads, and boilerplate.
- **YouTube Transcripts** — Automatically extracts video transcripts on YouTube watch pages.
- **Custom Prompts** — Create and manage multiple prompt templates. Supports variables: `{title}`, `{url}`, `{domain}`, `{date}`.
- **Keyboard Shortcut** — `Cmd+Shift+Y` (Mac) / `Ctrl+Shift+Y` (Windows/Linux) to clip and send in one step.
- **Auto-Submit** — Automatically pastes the prompt + content into ChatGPT and submits.

## Install

1. Clone or download this repository
2. Open `chrome://extensions/` in Chrome
3. Enable **Developer Mode** (top right)
4. Click **Load unpacked** and select this directory

## Usage

1. Navigate to any webpage
2. Press `Cmd+Shift+Y` (or click the extension icon to configure prompts)
3. A new ChatGPT tab opens with your prompt and the page content auto-submitted

### Managing Prompts

Click the extension icon to open the popup where you can:
- Add, edit, or delete prompt templates
- Select the active prompt (radio button)
- Toggle Smart Extract on/off

## How It Works

```
Keyboard shortcut → Extract page content → Apply prompt template → Open ChatGPT → Auto-paste & submit
```

Content extraction uses three strategies depending on the page:
- **YouTube** — Extracts the video transcript
- **Articles** (Smart Extract on) — Uses Readability.js for clean article text
- **Fallback** — Grabs `document.body.innerText`
