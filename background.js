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

      // Check smart extract setting
      const { smartExtract } = await chrome.storage.local.get('smartExtract');
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
      if (isYouTube) {
        extractionFunc = extractYouTubeTranscript;
      } else if (useSmartExtract) {
        extractionFunc = extractWithReadability;
      } else {
        extractionFunc = extractPageText;
      }

      // Extract text from the page
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: extractionFunc
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
async function extractYouTubeTranscript() {
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

  // Wait for transcript panel to load
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Extract transcript segments
  const segmentListRenderer = document.querySelector('ytd-transcript-segment-list-renderer');
  if (!segmentListRenderer) {
    return document.body.innerText?.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+/g, ' ').trim();
  }

  const contentDiv = segmentListRenderer.children[0];
  if (!contentDiv) {
    return document.body.innerText?.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+/g, ' ').trim();
  }

  const segments = Array.from(contentDiv.children);
  const transcriptText = segments.map(segment => {
    const segDiv = segment.querySelector('div.segment');
    return segDiv ? segDiv.textContent.trim() : '';
  }).filter(text => text).join('\n\n');

  // Close the transcript panel
  const closeButton = document.querySelector('ytd-engagement-panel-title-header-renderer #visibility-button button');
  if (closeButton) {
    closeButton.click();
  }

  // Get video title for context
  const videoTitle = document.querySelector('h1.ytd-video-primary-info-renderer, h1.style-scope.ytd-watch-metadata')?.textContent?.trim() || '';

  return videoTitle ? `Video: ${videoTitle}\n\nTranscript:\n\n${transcriptText}` : transcriptText;
}
