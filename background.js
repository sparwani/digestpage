const DEFAULT_PROMPTS = [
  {
    id: 'summarize',
    name: 'Summarize',
    text: 'Please summarize in detail the following article from {url} titled {title}. If this was a news article, don\'t strip out interesting anecdotes. Those often illuminate the main points of the story:',
    isActive: true
  },
  {
    id: 'key-points',
    name: 'Key Points',
    text: 'Extract the main takeaways and key points from the following article from {url} titled {title}. Present them as a clear, bulleted list:',
    isActive: false
  },
  {
    id: 'eli5',
    name: 'ELI5',
    text: 'Explain the following article from {url} titled {title} in simple terms that a 5-year-old could understand. Avoid jargon and use everyday analogies:',
    isActive: false
  }
];

// Initialize default prompts on install
chrome.runtime.onInstalled.addListener(async () => {
  const { prompts } = await chrome.storage.local.get('prompts');
  if (!prompts) {
    await chrome.storage.local.set({ prompts: DEFAULT_PROMPTS });
  }
});

// Handle extract-only message from popup (copy to clipboard)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'extract-text') {
    extractCurrentTab().then(sendResponse);
    return true; // keep channel open for async response
  }
});

async function extractCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://')) {
    return null;
  }

  const isYouTube = tab.url?.includes('youtube.com/watch');
  const { smartExtract, includeTimestamps } = await chrome.storage.local.get(['smartExtract', 'includeTimestamps']);
  const useSmartExtract = smartExtract !== false;

  if (useSmartExtract && !isYouTube) {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['vendor/Readability.js']
    });
  }

  let extractionFunc;
  let args = [];
  if (isYouTube) {
    extractionFunc = extractYouTubeTranscript;
    args = [includeTimestamps === true];
  } else if (useSmartExtract) {
    extractionFunc = extractWithReadability;
  } else {
    extractionFunc = extractPageText;
  }

  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: extractionFunc,
    args
  });

  return results[0]?.result || null;
}

// Handle keyboard shortcut
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'clip-to-chat') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.id) return;

    // Skip chrome:// and other restricted URLs
    if (tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://')) {
      return;
    }

    // Get the active prompt
    const { prompts } = await chrome.storage.local.get('prompts');
    const activePrompt = prompts?.find(p => p.isActive) || DEFAULT_PROMPTS[0];

    try {
      // Check if we're on YouTube
      const isYouTube = tab.url?.includes('youtube.com/watch');

      // Check smart extract and timestamps settings
      const { smartExtract, includeTimestamps } = await chrome.storage.local.get(['smartExtract', 'includeTimestamps']);
      const useSmartExtract = smartExtract !== false; // default true

      // If smart extract is on and not YouTube, inject Readability first
      if (useSmartExtract && !isYouTube) {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['vendor/Readability.js']
        });
      }

      // Pick the right extraction function
      let extractionFunc;
      let args = [];
      if (isYouTube) {
        extractionFunc = extractYouTubeTranscript;
        args = [includeTimestamps === true];
      } else if (useSmartExtract) {
        extractionFunc = extractWithReadability;
      } else {
        extractionFunc = extractPageText;
      }

      // Extract text from the page
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: extractionFunc,
        args
      });

      const pageText = results[0]?.result;
      if (!pageText) return;

      // Replace prompt variables
      const now = new Date();
      const promptText = activePrompt.text
        .replace(/\{title\}/g, tab.title || '')
        .replace(/\{url\}/g, tab.url || '')
        .replace(/\{domain\}/g, new URL(tab.url).hostname)
        .replace(/\{date\}/g, now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }));

      // Combine prompt with page content
      const fullText = `${promptText}\n\n---\n\n${pageText}`;

      // Store the text for the ChatGPT content script to pick up
      await chrome.storage.local.set({ pendingClip: fullText });

      // Open ChatGPT in a new tab
      await chrome.tabs.create({ url: 'https://chat.openai.com/' });
    } catch (error) {
      console.error('Failed to execute:', error);
    }
  }
});

// Smart extraction using Readability.js
function extractWithReadability() {
  try {
    var docClone = document.cloneNode(true);
    var article = new Readability(docClone).parse();
    if (article && article.textContent) {
      return article.textContent
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]+/g, ' ')
        .trim();
    }
  } catch (e) {
    // Fall through to basic extraction
  }
  // Fallback if Readability fails
  var bodyText = document.body.innerText || document.body.textContent || '';
  return bodyText
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

// Function to be injected into the page - just extracts text
function extractPageText() {
  const bodyText = document.body.innerText || document.body.textContent || '';
  return bodyText
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

// Function to extract YouTube transcript
async function extractYouTubeTranscript(includeTimestamps) {
  // First, expand the description if needed
  const expandButton = document.querySelector('ytd-text-inline-expander #expand');
  if (expandButton) {
    expandButton.click();
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  // Find and click the "Show transcript" button
  const transcriptButton = document.querySelector('ytd-video-description-transcript-section-renderer button');
  if (!transcriptButton) {
    // Fallback to page text if no transcript available
    return document.body.innerText?.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+/g, ' ').trim();
  }

  transcriptButton.click();

  // Poll for transcript segments to appear (up to 5 seconds)
  let transcriptText = '';
  for (let i = 0; i < 10; i++) {
    await new Promise(resolve => setTimeout(resolve, 500));

    // New YouTube format (PAmodern_transcript_view panel)
    const newSegments = document.querySelectorAll('transcript-segment-view-model');
    if (newSegments.length > 0) {
      transcriptText = Array.from(newSegments).map(segment => {
        const textSpan = segment.querySelector('span.yt-core-attributed-string');
        const text = textSpan ? textSpan.textContent.trim() : '';
        if (!text) return '';
        if (includeTimestamps) {
          const ts = segment.querySelector('.ytwTranscriptSegmentViewModelTimestamp')?.textContent?.trim();
          return ts ? `[${ts}] ${text}` : text;
        }
        return text;
      }).filter(text => text).join('\n\n');
      break;
    }

    // Old YouTube format (ytd-transcript-segment-list-renderer)
    const oldSegmentList = document.querySelector('ytd-transcript-segment-list-renderer');
    if (oldSegmentList?.children?.[0]) {
      const segments = Array.from(oldSegmentList.children[0].children);
      transcriptText = segments.map(segment => {
        const segDiv = segment.querySelector('div.segment');
        if (!segDiv) return '';
        const text = segDiv.textContent.trim();
        if (includeTimestamps) {
          const ts = segment.querySelector('.segment-timestamp')?.textContent?.trim();
          return ts ? `[${ts}] ${text}` : text;
        }
        return text;
      }).filter(text => text).join('\n\n');
      break;
    }
  }

  if (!transcriptText) {
    return document.body.innerText?.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+/g, ' ').trim();
  }

  // Close the transcript panel
  const panel = document.querySelector(
    'ytd-engagement-panel-section-list-renderer[target-id="PAmodern_transcript_view"]'
  ) || document.querySelector(
    'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"]'
  );
  const closeButton = panel?.querySelector('#visibility-button button');
  if (closeButton) {
    closeButton.click();
  }

  // Get video title for context
  const videoTitle = document.querySelector('h1.ytd-video-primary-info-renderer, h1.style-scope.ytd-watch-metadata')?.textContent?.trim() || '';

  return videoTitle ? `Video: ${videoTitle}\n\nTranscript:\n\n${transcriptText}` : transcriptText;
}
