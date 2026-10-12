/**
 * Gemini & Supabase AI Chatbot
 * Client application logic
 */

// Application State
const state = {
  currentConversationId: null,
  conversations: [],
  isGenerating: false,
  abortController: null,
  selectedModel: window.__ENV__?.DEFAULT_MODEL || 'gemini-3.8-flash',
  systemInstruction: 'You are a smart, concise, and helpful AI assistant.',
  temperature: 0.7,
  configStatus: {
    hasGemini: false,
    hasSupabase: false,
    storageMode: 'Local Memory'
  }
};

// DOM Elements Cache
const elements = {
  // Layout & Sidebar
  sidebar: document.getElementById('sidebar'),
  sidebarOverlay: document.getElementById('sidebar-overlay'),
  btnOpenSidebar: document.getElementById('btn-open-sidebar'),
  btnCloseSidebar: document.getElementById('btn-close-sidebar'),
  btnNewChat: document.getElementById('btn-new-chat'),
  searchConversations: document.getElementById('search-conversations'),
  conversationsList: document.getElementById('conversations-list'),
  geminiStatusPill: document.getElementById('gemini-status-pill'),
  supabaseStatusPill: document.getElementById('supabase-status-pill'),
  storageStatusChip: document.getElementById('storage-status-chip'),

  // Chat Topbar
  activeChatTitle: document.getElementById('active-chat-title'),
  btnEditTitle: document.getElementById('btn-edit-title'),
  selectModel: document.getElementById('select-model'),
  btnExportChat: document.getElementById('btn-export-chat'),
  btnDeleteActiveChat: document.getElementById('btn-delete-active-chat'),

  // Messages Area
  messagesArea: document.getElementById('messages-area'),
  welcomeHero: document.getElementById('welcome-hero'),
  messagesContainer: document.getElementById('messages-container'),

  // Input Area
  chatForm: document.getElementById('chat-form'),
  messageInput: document.getElementById('message-input'),
  btnClearInput: document.getElementById('btn-clear-input'),
  btnSendMessage: document.getElementById('btn-send-message'),
  btnStopGeneration: document.getElementById('btn-stop-generation'),
  btnSystemPrompt: document.getElementById('btn-system-prompt'),
  personaLabel: document.getElementById('persona-label'),

  // Modals
  modalSettings: document.getElementById('modal-settings'),
  btnOpenSettings: document.getElementById('btn-open-settings'),
  btnCloseSettings: document.getElementById('btn-close-settings'),
  btnCancelSettings: document.getElementById('btn-cancel-settings'),
  settingsForm: document.getElementById('settings-form'),
  inputBackendUrl: document.getElementById('input-backend-url'),
  inputGeminiKey: document.getElementById('input-gemini-key'),
  inputSupabaseUrl: document.getElementById('input-supabase-url'),
  inputSupabaseKey: document.getElementById('input-supabase-key'),
  inputSystemPrompt: document.getElementById('input-system-prompt'),
  sliderTemperature: document.getElementById('slider-temperature'),
  tempVal: document.getElementById('temp-val'),
  btnTestGemini: document.getElementById('btn-test-gemini'),
  btnTestSupabase: document.getElementById('btn-test-supabase'),

  modalSchema: document.getElementById('modal-schema'),
  btnOpenSchema: document.getElementById('btn-open-schema'),
  btnCloseSchema: document.getElementById('btn-close-schema'),
  btnCopySchema: document.getElementById('btn-copy-schema'),
  schemaCodeBlock: document.getElementById('schema-code-block'),

  toastContainer: document.getElementById('toast-container')
};

// Dynamic Backend API resolver (supports frontend/.env, window.__ENV__, and Render backend)
function getApiUrl(endpoint) {
  const envUrl = window.__ENV__?.API_URL || '';
  const custom = localStorage.getItem('CUSTOM_BACKEND_URL') || envUrl || '';
  if (custom) {
    const base = custom.replace(/\/+$/, '');
    const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return `${base}${path}`;
  }
  return endpoint;
}

// Configure marked.js options
if (window.marked) {
  marked.setOptions({
    breaks: true,
    gfm: true,
    highlight: function (code, lang) {
      if (window.hljs && lang && hljs.getLanguage(lang)) {
        try {
          return hljs.highlight(code, { language: lang }).value;
        } catch (err) {}
      }
      return code;
    }
  });
}

// =====================================================================
// Initialization
// =====================================================================
document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  await checkConfigStatus();
  await loadConversations();
});

function setupEventListeners() {
  // Mobile Sidebar
  elements.btnOpenSidebar?.addEventListener('click', () => {
    elements.sidebar.classList.add('open');
    elements.sidebarOverlay.classList.add('open');
  });

  elements.btnCloseSidebar?.addEventListener('click', closeSidebar);
  elements.sidebarOverlay?.addEventListener('click', closeSidebar);

  // New Chat
  elements.btnNewChat?.addEventListener('click', () => {
    startNewChat();
    closeSidebar();
  });

  // Search Conversations
  elements.searchConversations?.addEventListener('input', (e) => {
    filterConversations(e.target.value);
  });

  // Model Picker
  elements.selectModel?.addEventListener('change', (e) => {
    state.selectedModel = e.target.value;
    showToast(`Switched model to ${state.selectedModel}`, 'info');
  });

  // Auto-expand Textarea & Keydown handling
  elements.messageInput?.addEventListener('input', autoResizeTextarea);
  elements.messageInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      elements.chatForm.dispatchEvent(new Event('submit'));
    }
  });

  // Clear Input Button
  elements.btnClearInput?.addEventListener('click', () => {
    elements.messageInput.value = '';
    elements.messageInput.style.height = 'auto';
    elements.messageInput.focus();
  });

  // Chat Form Submit
  elements.chatForm?.addEventListener('submit', handleFormSubmit);

  // Stop Generation
  elements.btnStopGeneration?.addEventListener('click', handleStopGeneration);

  // Edit Chat Title
  elements.btnEditTitle?.addEventListener('click', promptRenameChat);
  elements.activeChatTitle?.addEventListener('click', promptRenameChat);

  // Delete Active Chat
  elements.btnDeleteActiveChat?.addEventListener('click', () => {
    if (state.currentConversationId) {
      deleteConversation(state.currentConversationId);
    }
  });

  // Export Chat
  elements.btnExportChat?.addEventListener('click', exportCurrentChat);

  // Prompt suggestions click
  document.querySelectorAll('.suggestion-card').forEach((card) => {
    card.addEventListener('click', () => {
      const prompt = card.getAttribute('data-prompt');
      if (prompt) {
        elements.messageInput.value = prompt;
        autoResizeTextarea();
        elements.chatForm.dispatchEvent(new Event('submit'));
      }
    });
  });

  // Hotkeys: Ctrl+K or Cmd+K for new chat
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      startNewChat();
    }
  });

  // Settings Modal Events
  elements.btnOpenSettings?.addEventListener('click', openSettingsModal);
  elements.btnSystemPrompt?.addEventListener('click', openSettingsModal);
  elements.btnCloseSettings?.addEventListener('click', closeSettingsModal);
  elements.btnCancelSettings?.addEventListener('click', closeSettingsModal);
  elements.settingsForm?.addEventListener('submit', handleSettingsSubmit);
  elements.btnTestGemini?.addEventListener('click', testGeminiKey);
  elements.btnTestSupabase?.addEventListener('click', testSupabaseConnection);

  // Persona Presets
  document.querySelectorAll('.preset-tag').forEach((tag) => {
    tag.addEventListener('click', () => {
      const prompt = tag.getAttribute('data-prompt');
      if (prompt) {
        elements.inputSystemPrompt.value = prompt;
      }
    });
  });

  // Temperature Slider
  elements.sliderTemperature?.addEventListener('input', (e) => {
    elements.tempVal.textContent = e.target.value;
  });

  // Schema Modal Events
  elements.btnOpenSchema?.addEventListener('click', () => elements.modalSchema.classList.add('open'));
  elements.btnCloseSchema?.addEventListener('click', () => elements.modalSchema.classList.remove('open'));
  elements.btnCopySchema?.addEventListener('click', copySchemaSQL);

  // Close modals on clicking backdrop
  [elements.modalSettings, elements.modalSchema].forEach((modal) => {
    modal?.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('open');
    });
  });
}

function closeSidebar() {
  elements.sidebar.classList.remove('open');
  elements.sidebarOverlay.classList.remove('open');
}

function autoResizeTextarea() {
  const textarea = elements.messageInput;
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(textarea.scrollHeight, 180) + 'px';
}

// =====================================================================
// Config & Status Checking
// =====================================================================
async function checkConfigStatus() {
  try {
    const res = await fetch(getApiUrl('/api/status'));
    const data = await res.json();
    state.configStatus = data;

    // Update Gemini status pill
    if (data.hasGemini) {
      elements.geminiStatusPill.className = 'status-pill status-green';
      elements.geminiStatusPill.title = `Gemini: Configured (${data.geminiKeyMasked})`;
    } else {
      elements.geminiStatusPill.className = 'status-pill status-amber';
      elements.geminiStatusPill.title = 'Gemini: API Key required in Settings';
    }

    // Update Supabase status pill
    if (data.hasSupabase) {
      elements.supabaseStatusPill.className = 'status-pill status-green';
      elements.supabaseStatusPill.title = `Supabase: Connected (${data.supabaseUrl || 'Cloud'})`;
      elements.storageStatusChip.className = 'storage-badge supabase-active';
      elements.storageStatusChip.textContent = 'Supabase Cloud';
    } else {
      elements.supabaseStatusPill.className = 'status-pill status-amber';
      elements.supabaseStatusPill.title = 'Supabase: Using local memory store';
      elements.storageStatusChip.className = 'storage-badge';
      elements.storageStatusChip.textContent = 'Local Memory Mode';
    }
  } catch (err) {
    console.error('Error fetching config status:', err);
  }
}

// =====================================================================
// Conversations Management
// =====================================================================
async function loadConversations() {
  try {
    const res = await fetch(getApiUrl('/api/conversations'));
    const data = await res.json();
    state.conversations = data.conversations || [];
    renderConversationsList(state.conversations);

    // If conversations exist, select the most recent one; else show Welcome Hero
    if (state.conversations.length > 0) {
      selectConversation(state.conversations[0].id);
    } else {
      startNewChat();
    }
  } catch (err) {
    console.error('Error loading conversations:', err);
    elements.conversationsList.innerHTML = `<div style="padding: 1rem; color: var(--text-muted); font-size: 0.8rem;">Could not load conversations.</div>`;
  }
}

function renderConversationsList(list) {
  elements.conversationsList.innerHTML = '';
  if (!list || list.length === 0) {
    elements.conversationsList.innerHTML = `
      <div style="padding: 0.75rem; color: var(--text-muted); font-size: 0.8rem; text-align: center;">
        No conversations yet.<br>Click "New Chat" to begin!
      </div>
    `;
    return;
  }

  list.forEach((conv) => {
    const item = document.createElement('div');
    item.className = `conversation-item ${conv.id === state.currentConversationId ? 'active' : ''}`;
    item.dataset.id = conv.id;

    item.innerHTML = `
      <div class="conversation-item-title" title="${escapeHtml(conv.title)}">${escapeHtml(conv.title)}</div>
      <div class="conversation-item-actions">
        <button class="icon-btn-subtle btn-delete-item" title="Delete chat">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path></svg>
        </button>
      </div>
    `;

    // Item click
    item.addEventListener('click', (e) => {
      if (e.target.closest('.btn-delete-item')) return;
      selectConversation(conv.id);
      closeSidebar();
    });

    // Delete item click
    const deleteBtn = item.querySelector('.btn-delete-item');
    deleteBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteConversation(conv.id);
    });

    elements.conversationsList.appendChild(item);
  });
}

function filterConversations(query) {
  const term = (query || '').toLowerCase().trim();
  if (!term) {
    renderConversationsList(state.conversations);
    return;
  }
  const filtered = state.conversations.filter((c) => c.title.toLowerCase().includes(term));
  renderConversationsList(filtered);
}

async function selectConversation(id) {
  if (state.isGenerating) {
    showToast('Please wait or stop the current response first.', 'info');
    return;
  }

  state.currentConversationId = id;

  // Highlight active in sidebar
  document.querySelectorAll('.conversation-item').forEach((el) => {
    el.classList.toggle('active', el.dataset.id === id);
  });

  const activeConv = state.conversations.find((c) => c.id === id);
  if (activeConv) {
    elements.activeChatTitle.textContent = activeConv.title;
    if (activeConv.model) {
      elements.selectModel.value = activeConv.model;
      state.selectedModel = activeConv.model;
    }
  }

  // Fetch messages
  try {
    elements.messagesContainer.innerHTML = '<div class="history-skeleton"><div class="skeleton-line"></div><div class="skeleton-line short"></div></div>';
    elements.welcomeHero.style.display = 'none';

    const res = await fetch(getApiUrl(`/api/conversations/${id}/messages`));
    const data = await res.json();
    const messages = data.messages || [];

    elements.messagesContainer.innerHTML = '';
    if (messages.length === 0) {
      elements.welcomeHero.style.display = 'block';
    } else {
      elements.welcomeHero.style.display = 'none';
      messages.forEach((m) => appendMessageToDOM(m.role, m.content, m.created_at));
      scrollToBottom();
    }
  } catch (err) {
    console.error('Error fetching messages:', err);
    showToast('Failed to load conversation messages.', 'error');
  }
}

function startNewChat() {
  if (state.isGenerating) return;
  state.currentConversationId = null;
  elements.activeChatTitle.textContent = 'New Chat';
  elements.messagesContainer.innerHTML = '';
  elements.welcomeHero.style.display = 'block';
  elements.messageInput.value = '';
  elements.messageInput.style.height = 'auto';
  elements.messageInput.focus();

  document.querySelectorAll('.conversation-item').forEach((el) => {
    el.classList.remove('active');
  });
}

async function deleteConversation(id) {
  if (!confirm('Are you sure you want to delete this conversation?')) return;

  try {
    await fetch(getApiUrl(`/api/conversations/${id}`), { method: 'DELETE' });
    state.conversations = state.conversations.filter((c) => c.id !== id);
    renderConversationsList(state.conversations);
    showToast('Conversation deleted', 'success');

    if (state.currentConversationId === id) {
      startNewChat();
    }
  } catch (err) {
    console.error('Error deleting conversation:', err);
    showToast('Failed to delete conversation.', 'error');
  }
}

async function promptRenameChat() {
  if (!state.currentConversationId) return;
  const currentTitle = elements.activeChatTitle.textContent;
  const newTitle = prompt('Rename Conversation:', currentTitle);
  if (!newTitle || newTitle.trim() === '' || newTitle === currentTitle) return;

  try {
    const res = await fetch(getApiUrl(`/api/conversations/${state.currentConversationId}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle.trim() })
    });
    const updated = await res.json();
    elements.activeChatTitle.textContent = updated.title;

    const conv = state.conversations.find((c) => c.id === state.currentConversationId);
    if (conv) conv.title = updated.title;
    renderConversationsList(state.conversations);
    showToast('Conversation renamed', 'success');
  } catch (err) {
    console.error('Error renaming conversation:', err);
    showToast('Failed to rename conversation.', 'error');
  }
}

// =====================================================================
// Sending Messages & Streaming AI Response
// =====================================================================
async function handleFormSubmit(e) {
  e.preventDefault();
  const text = elements.messageInput.value.trim();
  if (!text || state.isGenerating) return;

  // Clear input
  elements.messageInput.value = '';
  elements.messageInput.style.height = 'auto';

  // Hide welcome hero
  elements.welcomeHero.style.display = 'none';

  // Append user message immediately
  appendMessageToDOM('user', text);
  scrollToBottom();

  // Create temporary assistant message container with typing cursor
  const assistantBubble = createAssistantStreamBubble();
  const bubbleContentEl = assistantBubble.querySelector('.message-bubble');

  // Toggle generating state & controls
  setGenerating(true);

  // Prepare abort controller
  state.abortController = new AbortController();

  let streamedResponse = '';

  try {
    const response = await fetch(getApiUrl('/api/chat'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationId: state.currentConversationId,
        message: text,
        model: state.selectedModel,
        systemInstruction: state.systemInstruction,
        temperature: state.temperature
      }),
      signal: state.abortController.signal
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `Server returned ${response.status}`);
    }

    // Read SSE stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop(); // Keep unfinished chunk

      for (const rawEvent of events) {
        if (!rawEvent.trim()) continue;
        const lines = rawEvent.split('\n');
        let eventType = 'message';
        let dataStr = '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.replace('event: ', '').trim();
          } else if (line.startsWith('data: ')) {
            dataStr = line.replace('data: ', '').trim();
          }
        }

        if (!dataStr) continue;
        try {
          const parsed = JSON.parse(dataStr);

          if (eventType === 'conversation_created') {
            state.currentConversationId = parsed.id;
            state.conversations.unshift(parsed);
            elements.activeChatTitle.textContent = parsed.title;
            renderConversationsList(state.conversations);
          } else if (eventType === 'title_updated') {
            elements.activeChatTitle.textContent = parsed.title;
            const conv = state.conversations.find((c) => c.id === parsed.conversationId);
            if (conv) conv.title = parsed.title;
            renderConversationsList(state.conversations);
          } else if (eventType === 'chunk') {
            streamedResponse += parsed.text;
            renderMarkdownInBubble(bubbleContentEl, streamedResponse, true);
            scrollToBottom();
          } else if (eventType === 'done') {
            // Finished streaming
            renderMarkdownInBubble(bubbleContentEl, streamedResponse, false);
            attachMessageActionButtons(assistantBubble, streamedResponse);
          } else if (eventType === 'error') {
            throw new Error(parsed.error);
          }
        } catch (parseErr) {
          console.warn('SSE parse error:', parseErr);
        }
      }
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      renderMarkdownInBubble(bubbleContentEl, streamedResponse + ' *(Generation stopped)*', false);
      showToast('Generation cancelled.', 'info');
    } else {
      bubbleContentEl.innerHTML = `<div style="color: #ef4444;">⚠️ <strong>Error:</strong> ${escapeHtml(err.message)}</div>`;
      showToast(err.message, 'error');
    }
  } finally {
    setGenerating(false);
    scrollToBottom();
  }
}

function handleStopGeneration() {
  if (state.abortController) {
    state.abortController.abort();
  }
}

function setGenerating(isGenerating) {
  state.isGenerating = isGenerating;
  if (isGenerating) {
    elements.btnSendMessage.classList.add('hidden');
    elements.btnStopGeneration.classList.remove('hidden');
    elements.messageInput.disabled = true;
  } else {
    elements.btnSendMessage.classList.remove('hidden');
    elements.btnStopGeneration.classList.add('hidden');
    elements.messageInput.disabled = false;
    elements.messageInput.focus();
  }
}

// =====================================================================
// DOM Message Rendering & Markdown Formatting
// =====================================================================
function appendMessageToDOM(role, content, timestamp) {
  const row = document.createElement('div');
  row.className = `message-row ${role === 'user' ? 'user' : 'assistant'}`;

  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  avatar.innerHTML = role === 'user'
    ? '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>'
    : '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 0l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-3.01L12 0z"/></svg>';

  const wrap = document.createElement('div');
  wrap.className = 'message-bubble-wrap';

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';

  if (role === 'user') {
    bubble.textContent = content;
  } else {
    bubble.innerHTML = window.marked ? marked.parse(content) : escapeHtml(content);
    enhanceCodeBlocks(bubble);
  }

  wrap.appendChild(bubble);

  // Actions for assistant messages
  if (role === 'assistant') {
    attachMessageActionButtons(wrap, content);
  }

  row.appendChild(avatar);
  row.appendChild(wrap);
  elements.messagesContainer.appendChild(row);
  return row;
}

function createAssistantStreamBubble() {
  const row = document.createElement('div');
  row.className = 'message-row assistant';

  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  avatar.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 0l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-3.01L12 0z"/></svg>';

  const wrap = document.createElement('div');
  wrap.className = 'message-bubble-wrap';

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';
  bubble.innerHTML = '<span class="typing-cursor"></span>';

  wrap.appendChild(bubble);
  row.appendChild(avatar);
  row.appendChild(wrap);
  elements.messagesContainer.appendChild(row);
  return row;
}

function renderMarkdownInBubble(bubbleEl, text, showCursor = false) {
  let parsed = window.marked ? marked.parse(text) : escapeHtml(text);
  if (showCursor) {
    parsed += '<span class="typing-cursor"></span>';
  }
  bubbleEl.innerHTML = parsed;
  enhanceCodeBlocks(bubbleEl);
}

function enhanceCodeBlocks(container) {
  // Wrap standard pre code blocks with clean headers & copy buttons
  const codeBlocks = container.querySelectorAll('pre');
  codeBlocks.forEach((pre) => {
    if (pre.parentElement.classList.contains('code-block-wrapper')) return;

    const code = pre.querySelector('code');
    const rawContent = code ? code.innerText : pre.innerText;

    // Detect language
    let lang = 'code';
    if (code && code.className) {
      const match = code.className.match(/language-(\w+)/);
      if (match) lang = match[1];
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'code-block-wrapper';

    const header = document.createElement('div');
    header.className = 'code-block-header';
    header.innerHTML = `
      <span>${lang}</span>
      <button class="code-copy-btn">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
        <span>Copy</span>
      </button>
    `;

    const copyBtn = header.querySelector('.code-copy-btn');
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(rawContent).then(() => {
        copyBtn.innerHTML = `<span>Copied! ✓</span>`;
        setTimeout(() => {
          copyBtn.innerHTML = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg><span>Copy</span>`;
        }, 2000);
      });
    });

    pre.parentNode.insertBefore(wrapper, pre);
    wrapper.appendChild(header);
    wrapper.appendChild(pre);
  });
}

function attachMessageActionButtons(wrapElement, textContent) {
  // If actions bar already exists, remove
  wrapElement.querySelectorAll('.message-actions').forEach((el) => el.remove());

  const actions = document.createElement('div');
  actions.className = 'message-actions';

  // Copy Message Button
  const btnCopy = document.createElement('button');
  btnCopy.className = 'icon-btn-subtle';
  btnCopy.title = 'Copy response';
  btnCopy.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
  btnCopy.addEventListener('click', () => {
    navigator.clipboard.writeText(textContent).then(() => {
      showToast('Response copied to clipboard', 'info');
    });
  });

  // Text to Speech Button
  const btnSpeech = document.createElement('button');
  btnSpeech.className = 'icon-btn-subtle';
  btnSpeech.title = 'Read aloud';
  btnSpeech.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>';
  btnSpeech.addEventListener('click', () => {
    if ('speechSynthesis' in window) {
      if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
      } else {
        const utterance = new SpeechSynthesisUtterance(textContent.replace(/[#*`_]/g, ''));
        window.speechSynthesis.speak(utterance);
      }
    } else {
      showToast('Speech synthesis not supported in this browser.', 'info');
    }
  });

  actions.appendChild(btnCopy);
  actions.appendChild(btnSpeech);
  wrapElement.appendChild(actions);
}

function scrollToBottom() {
  elements.messagesArea.scrollTop = elements.messagesArea.scrollHeight;
}

// =====================================================================
// Export Chat Functionality
// =====================================================================
async function exportCurrentChat() {
  if (!state.currentConversationId) {
    showToast('No active conversation to export.', 'info');
    return;
  }

  try {
    const res = await fetch(getApiUrl(`/api/conversations/${state.currentConversationId}/messages`));
    const data = await res.json();
    const messages = data.messages || [];

    if (messages.length === 0) {
      showToast('Conversation is empty.', 'info');
      return;
    }

    let markdown = `# Chat: ${elements.activeChatTitle.textContent}\nExported on: ${new Date().toLocaleString()}\n\n---\n\n`;
    messages.forEach((m) => {
      const speaker = m.role === 'user' ? '👤 User' : '🤖 Gemini';
      markdown += `### ${speaker} (${new Date(m.created_at).toLocaleTimeString()})\n\n${m.content}\n\n---\n\n`;
    });

    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${elements.activeChatTitle.textContent.replace(/[^a-zA-Z0-9_-]/g, '_')}.md`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('Chat history exported as Markdown!', 'success');
  } catch (err) {
    showToast('Failed to export chat.', 'error');
  }
}

// =====================================================================
// Settings Modal & Testing
// =====================================================================
function openSettingsModal() {
  elements.modalSettings.classList.add('open');
  if (elements.inputBackendUrl) {
    elements.inputBackendUrl.value = localStorage.getItem('CUSTOM_BACKEND_URL') || '';
  }
  elements.inputSystemPrompt.value = state.systemInstruction;
  elements.sliderTemperature.value = state.temperature;
  elements.tempVal.textContent = state.temperature;
}

function closeSettingsModal() {
  elements.modalSettings.classList.remove('open');
}

async function handleSettingsSubmit(e) {
  e.preventDefault();
  const apiKey = elements.inputGeminiKey.value.trim();
  const url = elements.inputSupabaseUrl.value.trim();
  const anonKey = elements.inputSupabaseKey.value.trim();

  state.systemInstruction = elements.inputSystemPrompt.value.trim() || 'You are a smart, concise, and helpful AI assistant.';
  state.temperature = parseFloat(elements.sliderTemperature.value) || 0.7;

  // Update persona label
  if (state.systemInstruction.includes('mentor')) {
    elements.personaLabel.textContent = 'Code Mentor';
  } else if (state.systemInstruction.includes('summarizer')) {
    elements.personaLabel.textContent = 'Summarizer';
  } else {
    elements.personaLabel.textContent = 'Default Assistant';
  }

  const payload = {};
  if (apiKey) payload.apiKey = apiKey;
  if (url) payload.url = url;
  if (anonKey) payload.anonKey = anonKey;

  // Persist custom backend URL for Vercel -> Render cross-origin requests
  if (elements.inputBackendUrl) {
    const customUrl = elements.inputBackendUrl.value.trim();
    if (customUrl) {
      localStorage.setItem('CUSTOM_BACKEND_URL', customUrl);
    } else {
      localStorage.removeItem('CUSTOM_BACKEND_URL');
    }
  }

  try {
    const res = await fetch(getApiUrl('/api/settings'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      showToast('Settings saved successfully!', 'success');
      await checkConfigStatus();
      closeSettingsModal();
    }
  } catch (err) {
    showToast('Error saving settings.', 'error');
  }
}

async function testGeminiKey() {
  const apiKey = elements.inputGeminiKey.value.trim();
  elements.btnTestGemini.disabled = true;
  elements.btnTestGemini.textContent = 'Testing...';

  try {
    const res = await fetch(getApiUrl('/api/test/gemini'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey })
    });
    const data = await res.json();
    if (data.success) {
      showToast('✅ Gemini API Key is valid and working!', 'success');
    } else {
      showToast(`❌ Gemini Key test failed: ${data.error}`, 'error');
    }
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  } finally {
    elements.btnTestGemini.disabled = false;
    elements.btnTestGemini.textContent = 'Test Key';
  }
}

async function testSupabaseConnection() {
  const url = elements.inputSupabaseUrl.value.trim();
  const anonKey = elements.inputSupabaseKey.value.trim();

  if (!url || !anonKey) {
    showToast('Please provide both Supabase URL and Anon Key.', 'info');
    return;
  }

  elements.btnTestSupabase.disabled = true;
  elements.btnTestSupabase.textContent = 'Testing...';

  try {
    const res = await fetch(getApiUrl('/api/test/supabase'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, anonKey })
    });
    const data = await res.json();
    if (data.success) {
      if (data.schemaWarning) {
        showToast(`⚠️ ${data.message}`, 'info');
      } else {
        showToast('✅ Supabase connected and schema verified!', 'success');
      }
    } else {
      showToast(`❌ Supabase test failed: ${data.error}`, 'error');
    }
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  } finally {
    elements.btnTestSupabase.disabled = false;
    elements.btnTestSupabase.textContent = 'Test DB';
  }
}

function copySchemaSQL() {
  const code = elements.schemaCodeBlock.innerText;
  navigator.clipboard.writeText(code).then(() => {
    showToast('SQL schema copied to clipboard!', 'success');
  });
}

// =====================================================================
// Toast Notification Utility
// =====================================================================
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
  toast.innerHTML = `<span>${icon}</span><span>${escapeHtml(message)}</span>`;

  elements.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease-out';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// =====================================================================
// Helper Utilities
// =====================================================================
function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
