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

let prompts = [];

// DOM Elements
const smartExtractToggle = document.getElementById('smart-extract-toggle');
const timestampsToggle = document.getElementById('timestamps-toggle');
const promptsList = document.getElementById('prompts-list');
const promptForm = document.getElementById('prompt-form');
const formTitle = document.getElementById('form-title');
const promptIdInput = document.getElementById('prompt-id');
const promptNameInput = document.getElementById('prompt-name');
const promptTextInput = document.getElementById('prompt-text');
const copyContentBtn = document.getElementById('copy-content-btn');
const addPromptBtn = document.getElementById('add-prompt-btn');
const cancelBtn = document.getElementById('cancel-btn');
const saveBtn = document.getElementById('save-btn');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await loadPrompts();
  await loadSmartExtract();
  await loadTimestamps();
  renderPrompts();
});

// Copy page content to clipboard
copyContentBtn.addEventListener('click', async () => {
  copyContentBtn.textContent = 'Extracting...';
  copyContentBtn.disabled = true;
  try {
    const text = await chrome.runtime.sendMessage({ action: 'extract-text' });
    if (text) {
      await navigator.clipboard.writeText(text);
      copyContentBtn.textContent = 'Copied!';
      copyContentBtn.classList.add('success');
    } else {
      copyContentBtn.textContent = 'Nothing to copy';
      copyContentBtn.classList.add('error');
    }
  } catch (err) {
    copyContentBtn.textContent = 'Failed to copy';
    copyContentBtn.classList.add('error');
  }
  setTimeout(() => {
    copyContentBtn.textContent = 'Copy page content';
    copyContentBtn.classList.remove('success', 'error');
    copyContentBtn.disabled = false;
  }, 1500);
});

// Load smart extract setting
async function loadSmartExtract() {
  const { smartExtract } = await chrome.storage.local.get('smartExtract');
  // Default to true if not set
  smartExtractToggle.checked = smartExtract !== false;
}

// Wire toggle changes
smartExtractToggle.addEventListener('change', async () => {
  await chrome.storage.local.set({ smartExtract: smartExtractToggle.checked });
});

// Load timestamps setting
async function loadTimestamps() {
  const { includeTimestamps } = await chrome.storage.local.get('includeTimestamps');
  timestampsToggle.checked = includeTimestamps === true; // default false
}

timestampsToggle.addEventListener('change', async () => {
  await chrome.storage.local.set({ includeTimestamps: timestampsToggle.checked });
});

// Load prompts from storage
async function loadPrompts() {
  const result = await chrome.storage.local.get('prompts');
  prompts = result.prompts || DEFAULT_PROMPTS;
}

// Save prompts to storage
async function savePrompts() {
  await chrome.storage.local.set({ prompts });
}

// Render prompts list
function renderPrompts() {
  if (prompts.length === 0) {
    promptsList.innerHTML = '<li class="empty-state">No prompts yet. Add one to get started!</li>';
    return;
  }

  promptsList.innerHTML = prompts.map(prompt => `
    <li class="prompt-item ${prompt.isActive ? 'active' : ''}" data-id="${prompt.id}">
      <div class="prompt-radio"></div>
      <div class="prompt-info">
        <div class="prompt-name">${escapeHtml(prompt.name)}</div>
        <div class="prompt-preview">${escapeHtml(prompt.text)}</div>
      </div>
      <div class="prompt-actions">
        <button class="btn-small edit" data-id="${prompt.id}" title="Edit">Edit</button>
        <button class="btn-small delete" data-id="${prompt.id}" title="Delete">Del</button>
      </div>
    </li>
  `).join('');

  // Add event listeners
  document.querySelectorAll('.prompt-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (!e.target.classList.contains('btn-small')) {
        setActivePrompt(item.dataset.id);
      }
    });
  });

  document.querySelectorAll('.btn-small.edit').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      editPrompt(btn.dataset.id);
    });
  });

  document.querySelectorAll('.btn-small.delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deletePrompt(btn.dataset.id);
    });
  });
}

// Set active prompt
async function setActivePrompt(id) {
  prompts = prompts.map(p => ({
    ...p,
    isActive: p.id === id
  }));
  await savePrompts();
  renderPrompts();
}

// Show add form
addPromptBtn.addEventListener('click', () => {
  formTitle.textContent = 'Add Prompt';
  promptIdInput.value = '';
  promptNameInput.value = '';
  promptTextInput.value = '';
  promptForm.classList.remove('hidden');
  promptNameInput.focus();
});

// Edit prompt
function editPrompt(id) {
  const prompt = prompts.find(p => p.id === id);
  if (!prompt) return;

  formTitle.textContent = 'Edit Prompt';
  promptIdInput.value = prompt.id;
  promptNameInput.value = prompt.name;
  promptTextInput.value = prompt.text;
  promptForm.classList.remove('hidden');
  promptNameInput.focus();
}

// Delete prompt
async function deletePrompt(id) {
  const prompt = prompts.find(p => p.id === id);
  if (!prompt) return;

  prompts = prompts.filter(p => p.id !== id);

  // If deleted prompt was active, make first one active
  if (prompt.isActive && prompts.length > 0) {
    prompts[0].isActive = true;
  }

  await savePrompts();
  renderPrompts();
}

// Cancel form
cancelBtn.addEventListener('click', () => {
  promptForm.classList.add('hidden');
});

// Save form
saveBtn.addEventListener('click', async () => {
  const name = promptNameInput.value.trim();
  const text = promptTextInput.value.trim();
  const editId = promptIdInput.value;

  if (!name || !text) {
    return;
  }

  if (editId) {
    // Update existing
    prompts = prompts.map(p => {
      if (p.id === editId) {
        return { ...p, name, text };
      }
      return p;
    });
  } else {
    // Add new
    const newPrompt = {
      id: generateId(),
      name,
      text,
      isActive: prompts.length === 0
    };
    prompts.push(newPrompt);
  }

  await savePrompts();
  renderPrompts();
  promptForm.classList.add('hidden');
});

// Helper: Generate unique ID
function generateId() {
  return 'prompt-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

// Helper: Escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
