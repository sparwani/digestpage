// Content script that runs on ChatGPT to inject the clipped text

async function injectClippedText() {
  // Check if there's pending text to inject
  const { pendingClip } = await chrome.storage.local.get('pendingClip');

  if (!pendingClip) return;

  // Clear the pending clip immediately to prevent re-injection
  await chrome.storage.local.remove('pendingClip');

  // Wait for the ChatGPT input to be available
  const maxAttempts = 50;
  let attempts = 0;

  const tryInject = () => {
    attempts++;

    // Find the textarea/input - ChatGPT uses a contenteditable div or textarea
    const input = document.querySelector('textarea[data-id="root"]')
      || document.querySelector('#prompt-textarea')
      || document.querySelector('textarea')
      || document.querySelector('[contenteditable="true"]');

    if (input) {
      if (input.tagName === 'TEXTAREA') {
        input.value = pendingClip;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        // For contenteditable divs
        input.textContent = pendingClip;
        input.dispatchEvent(new InputEvent('input', { bubbles: true }));
      }
      input.focus();

      // Find and click the submit button after a brief delay
      setTimeout(() => {
        const submitButton = document.querySelector('button[data-testid="send-button"]')
          || document.querySelector('form button[type="submit"]')
          || document.querySelector('button[aria-label="Send prompt"]')
          || document.querySelector('form button:not([disabled])');

        if (submitButton) {
          submitButton.click();
        }
      }, 100);
    } else if (attempts < maxAttempts) {
      // Retry after a short delay
      setTimeout(tryInject, 100);
    }
  };

  // Start trying to inject
  tryInject();
}

// Run when the page loads
injectClippedText();
