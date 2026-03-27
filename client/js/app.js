/**
 * Legal Document Assistant — Frontend Application
 */

(function () {
  'use strict';

  // ─── DOM Elements ───
  const $ = (sel) => document.querySelector(sel);
  const sidebar = $('#sidebar');
  const sidebarToggle = $('#sidebarToggle');
  const settingsBtn = $('#settingsBtn');
  const settingsModal = $('#settingsModal');
  const closeSettings = $('#closeSettings');
  const apiKeyInput = $('#apiKeyInput');
  const saveKeyBtn = $('#saveKeyBtn');
  const apiKeyStatus = $('#apiKeyStatus');
  const uploadZone = $('#uploadZone');
  const fileInput = $('#fileInput');
  const docList = $('#docList');
  const emptyDocs = $('#emptyDocs');
  const welcomeScreen = $('#welcomeScreen');
  const chatArea = $('#chatArea');
  const chatMessages = $('#chatMessages');
  const chatInput = $('#chatInput');
  const sendBtn = $('#sendBtn');
  const docFilter = $('#docFilter');
  const uploadModal = $('#uploadModal');
  const uploadProgressTitle = $('#uploadProgressTitle');
  const uploadProgressText = $('#uploadProgressText');
  const sourceModal = $('#sourceModal');
  const sourceModalTitle = $('#sourceModalTitle');
  const sourceFullText = $('#sourceFullText');
  const closeSource = $('#closeSource');

  let apiKeySet = false;

  // ─── Initialization ───
  function init() {
    loadApiKeyFromStorage();
    fetchDocuments();
    bindEvents();
  }

  // ─── Event Bindings ───
  function bindEvents() {
    // Sidebar toggle (mobile)
    sidebarToggle.addEventListener('click', () => {
      sidebar.classList.toggle('open');
    });

    // Settings modal
    settingsBtn.addEventListener('click', () => openModal(settingsModal));
    closeSettings.addEventListener('click', () => closeModalEl(settingsModal));
    saveKeyBtn.addEventListener('click', saveApiKey);

    // Upload
    uploadZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileSelect);

    // Drag and drop
    uploadZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadZone.classList.add('drag-over');
    });
    uploadZone.addEventListener('dragleave', () => {
      uploadZone.classList.remove('drag-over');
    });
    uploadZone.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadZone.classList.remove('drag-over');
      if (e.dataTransfer.files.length) {
        uploadFile(e.dataTransfer.files[0]);
      }
    });

    // Chat input
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
    chatInput.addEventListener('input', autoResizeTextarea);
    sendBtn.addEventListener('click', sendMessage);

    // Source modal
    closeSource.addEventListener('click', () => closeModalEl(sourceModal));

    // Close modals on overlay click
    document.querySelectorAll('.modal-overlay').forEach((overlay) => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModalEl(overlay);
      });
    });

    // Close sidebar on main click (mobile)
    document.querySelector('.main-content').addEventListener('click', () => {
      sidebar.classList.remove('open');
    });
  }

  // ─── Provider / API Key Management ───
  const PROVIDER_PLACEHOLDERS = {
    openai: 'sk-...',
    gemini: 'AIza...',
    grok: 'xai-...',
  };

  function getSelectedProvider() {
    const radio = document.querySelector('input[name="provider"]:checked');
    return radio ? radio.value : 'openai';
  }

  function loadApiKeyFromStorage() {
    const lastProvider = localStorage.getItem('llm_provider') || 'openai';

    // Select the saved provider radio
    const radio = document.querySelector(`input[name="provider"][value="${lastProvider}"]`);
    if (radio) radio.checked = true;

    // Update placeholder
    apiKeyInput.placeholder = PROVIDER_PLACEHOLDERS[lastProvider] || 'Enter key...';

    // Load the key for that provider
    const key = localStorage.getItem(`api_key_${lastProvider}`);
    if (key) {
      apiKeyInput.value = key;
      validateAndSetKey(lastProvider, key, true);
    }

    // Listen for provider changes
    document.querySelectorAll('input[name="provider"]').forEach((radio) => {
      radio.addEventListener('change', () => {
        const prov = getSelectedProvider();
        apiKeyInput.placeholder = PROVIDER_PLACEHOLDERS[prov] || 'Enter key...';
        const savedKey = localStorage.getItem(`api_key_${prov}`) || '';
        apiKeyInput.value = savedKey;
        showKeyStatus('', '');
      });
    });
  }

  async function saveApiKey() {
    const provider = getSelectedProvider();
    const key = apiKeyInput.value.trim();
    if (!key) {
      showKeyStatus('Please enter an API key.', 'error');
      return;
    }

    saveKeyBtn.disabled = true;
    saveKeyBtn.textContent = 'Validating...';
    showKeyStatus('Validating key...', '');

    await validateAndSetKey(provider, key, false);

    saveKeyBtn.disabled = false;
    saveKeyBtn.textContent = 'Save';
  }

  async function validateAndSetKey(provider, key, silent) {
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey: key }),
      });
      const data = await res.json();

      if (res.ok) {
        apiKeySet = true;
        localStorage.setItem('llm_provider', provider);
        localStorage.setItem(`api_key_${provider}`, key);
        if (!silent) {
          showKeyStatus(`✓ ${data.provider || provider} configured.`, 'success');
          setTimeout(() => closeModalEl(settingsModal), 1200);
        }
      } else {
        apiKeySet = false;
        if (!silent) showKeyStatus(data.error || 'Invalid key.', 'error');
      }
    } catch (err) {
      apiKeySet = false;
      if (!silent) showKeyStatus('Connection error. Is the server running?', 'error');
    }
  }

  function showKeyStatus(msg, type) {
    apiKeyStatus.textContent = msg;
    apiKeyStatus.className = 'api-key-status ' + (type || '');
  }

  // ─── Document Management ───
  async function fetchDocuments() {
    try {
      const res = await fetch('/api/documents');
      const data = await res.json();
      renderDocList(data.documents || []);
      updateDocFilter(data.documents || []);

      if (data.documents && data.documents.length > 0) {
        showChat();
      }
    } catch (err) {
      console.error('Failed to fetch documents:', err);
    }
  }

  function renderDocList(docs) {
    docList.innerHTML = '';

    if (docs.length === 0) {
      docList.innerHTML = '<div class="empty-state"><p>No documents yet</p></div>';
      return;
    }

    docs.forEach((doc) => {
      const el = document.createElement('div');
      el.className = 'doc-item';
      el.innerHTML = `
        <svg class="doc-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
          <polyline points="10 9 9 9 8 9"/>
        </svg>
        <div class="doc-info">
          <div class="doc-name" title="${escapeHtml(doc.name)}">${escapeHtml(doc.name)}</div>
          <div class="doc-meta">${doc.chunkCount} chunks</div>
        </div>
        <button class="doc-delete" title="Delete document" data-id="${doc.id}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
          </svg>
        </button>
      `;

      const deleteBtn = el.querySelector('.doc-delete');
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteDocument(doc.id, doc.name);
      });

      docList.appendChild(el);
    });
  }

  function updateDocFilter(docs) {
    const current = docFilter.value;
    docFilter.innerHTML = '<option value="">All documents</option>';
    docs.forEach((doc) => {
      const opt = document.createElement('option');
      opt.value = doc.id;
      opt.textContent = doc.name;
      docFilter.appendChild(opt);
    });
    docFilter.value = current;
  }

  async function deleteDocument(id, name) {
    if (!confirm(`Delete "${name}"? This will remove all its data from the vector store.`)) return;

    try {
      const res = await fetch(`/api/documents/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchDocuments();
      }
    } catch (err) {
      console.error('Failed to delete:', err);
    }
  }

  // ─── File Upload ───
  function handleFileSelect(e) {
    if (e.target.files.length) {
      uploadFile(e.target.files[0]);
      e.target.value = ''; // Reset
    }
  }

  async function uploadFile(file) {
    if (!apiKeySet) {
      openModal(settingsModal);
      showKeyStatus('Please set your API key before uploading.', 'error');
      return;
    }

    const ext = file.name.split('.').pop().toLowerCase();
    if (!['pdf', 'txt', 'text'].includes(ext)) {
      alert('Only PDF and TXT files are supported.');
      return;
    }

    // Show progress
    openModal(uploadModal);
    uploadProgressTitle.textContent = 'Processing document...';
    uploadProgressText.textContent = `Uploading ${file.name}`;

    const formData = new FormData();
    formData.append('document', file);

    try {
      uploadProgressText.textContent = 'Extracting text and generating embeddings...';

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (res.ok) {
        uploadProgressTitle.textContent = 'Document processed!';
        uploadProgressText.textContent = `${data.document.chunkCount} chunks created from ${data.document.name}`;

        setTimeout(() => {
          closeModalEl(uploadModal);
          fetchDocuments();
          showChat();
        }, 1500);
      } else {
        uploadProgressTitle.textContent = 'Upload failed';
        uploadProgressText.textContent = data.error || 'Unknown error';
        setTimeout(() => closeModalEl(uploadModal), 3000);
      }
    } catch (err) {
      uploadProgressTitle.textContent = 'Upload failed';
      uploadProgressText.textContent = 'Could not connect to server.';
      setTimeout(() => closeModalEl(uploadModal), 3000);
    }
  }

  // ─── Chat ───
  function showChat() {
    welcomeScreen.style.display = 'none';
    chatArea.style.display = 'flex';
  }

  function sendMessage() {
    const text = chatInput.value.trim();
    if (!text) return;

    if (!apiKeySet) {
      openModal(settingsModal);
      showKeyStatus('Please set your API key first.', 'error');
      return;
    }

    // Add user message
    appendMessage('user', text);
    chatInput.value = '';
    chatInput.style.height = 'auto';

    // Show typing indicator
    const typingEl = appendTyping();

    // Send to API
    const selectedDoc = docFilter.value || undefined;

    fetch('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: text, docId: selectedDoc }),
    })
      .then((res) => res.json())
      .then((data) => {
        removeElement(typingEl);

        if (data.error) {
          appendMessage('assistant', `⚠️ ${data.error}`);
        } else {
          appendMessage('assistant', data.answer, data.sources);
        }
      })
      .catch((err) => {
        removeElement(typingEl);
        appendMessage('assistant', `⚠️ Connection error: ${err.message}`);
      });

    sendBtn.disabled = true;
    setTimeout(() => (sendBtn.disabled = false), 1000);
  }

  function appendMessage(role, content, sources) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}-message`;

    if (role === 'assistant') {
      messageDiv.innerHTML = `
        <div class="message-avatar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/>
            <path d="M2 17l10 5 10-5"/>
            <path d="M2 12l10 5 10-5"/>
          </svg>
        </div>
        <div class="message-content">
          ${formatMarkdown(content)}
          ${sources && sources.length ? renderSources(sources) : ''}
        </div>
      `;
    } else {
      messageDiv.innerHTML = `
        <div class="message-avatar"></div>
        <div class="message-content">
          <p>${escapeHtml(content)}</p>
        </div>
      `;
    }

    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return messageDiv;
  }

  function appendTyping() {
    const el = document.createElement('div');
    el.className = 'message assistant-message';
    el.id = 'typing-msg';
    el.innerHTML = `
      <div class="message-avatar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M12 2L2 7l10 5 10-5-10-5z"/>
          <path d="M2 17l10 5 10-5"/>
          <path d="M2 12l10 5 10-5"/>
        </svg>
      </div>
      <div class="message-content">
        <div class="typing-indicator">
          <div class="dot"></div>
          <div class="dot"></div>
          <div class="dot"></div>
        </div>
      </div>
    `;
    chatMessages.appendChild(el);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return el;
  }

  function renderSources(sources) {
    const chips = sources
      .map(
        (s) =>
          `<span class="source-chip" data-text="${escapeHtml(s.text)}" data-doc="${escapeHtml(s.documentName)}" data-index="${s.index}" onclick="window.__showSource(this)">
            Source ${s.index} · ${escapeHtml(s.documentName)}
            <span class="relevance">${s.relevance}%</span>
          </span>`
      )
      .join('');

    return `
      <div class="message-sources">
        <div class="sources-label">Sources</div>
        <div class="source-chips">${chips}</div>
      </div>
    `;
  }

  // Global source click handler
  window.__showSource = function (chip) {
    const text = chip.getAttribute('data-text');
    const docName = chip.getAttribute('data-doc');
    const idx = chip.getAttribute('data-index');
    sourceModalTitle.textContent = `Source ${idx} — ${docName}`;
    sourceFullText.textContent = text;
    openModal(sourceModal);
  };

  // ─── Markdown Formatting (simple) ───
  function formatMarkdown(text) {
    if (!text) return '';

    // Escape HTML first
    let html = escapeHtml(text);

    // Bold: **text**
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // Inline code: `text`
    html = html.replace(/`(.+?)`/g, '<code>$1</code>');

    // Source references: [Source N]
    html = html.replace(/\[Source (\d+)\]/g, '<strong>[Source $1]</strong>');

    // Bullet points
    html = html.replace(/^[-•] (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');

    // Numbered lists
    html = html.replace(/^\d+\.\s(.+)$/gm, '<li>$1</li>');

    // Paragraphs
    html = html
      .split('\n\n')
      .map((para) => {
        para = para.trim();
        if (!para) return '';
        if (para.startsWith('<ul>') || para.startsWith('<ol>') || para.startsWith('<li>')) return para;
        return `<p>${para.replace(/\n/g, '<br>')}</p>`;
      })
      .join('');

    return html;
  }

  // ─── Utilities ───
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function removeElement(el) {
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  function openModal(modal) {
    modal.classList.add('active');
  }

  function closeModalEl(modal) {
    modal.classList.remove('active');
  }

  function autoResizeTextarea() {
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
  }

  // ─── Start ───
  init();
})();
