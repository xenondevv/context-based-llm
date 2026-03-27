/**
 * Multi-provider embeddings module.
 * Supports: OpenAI, Google Gemini, xAI Grok
 */

const { OpenAI } = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const BATCH_SIZE = 20;
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1';
const GEMINI_EMBED_MODEL = 'gemini-embedding-001';

// Provider configs
const PROVIDERS = {
  openai: {
    name: 'OpenAI',
    embeddingModel: 'text-embedding-3-small',
  },
  gemini: {
    name: 'Google Gemini',
    embeddingModel: GEMINI_EMBED_MODEL,
  },
  grok: {
    name: 'xAI Grok',
    embeddingModel: 'grok-2',
    baseURL: 'https://api.x.ai/v1',
  }
};

let currentProvider = null;
let currentApiKey = null;
let openaiClient = null;
let geminiClient = null;

/**
 * Set the active provider and API key.
 */
function setProvider(provider, apiKey) {
  currentProvider = provider;
  currentApiKey = apiKey;

  if (provider === 'openai') {
    openaiClient = new OpenAI({ apiKey });
    geminiClient = null;
  } else if (provider === 'gemini') {
    geminiClient = new GoogleGenerativeAI(apiKey);
    openaiClient = null;
  } else if (provider === 'grok') {
    openaiClient = new OpenAI({ apiKey, baseURL: PROVIDERS.grok.baseURL });
    geminiClient = null;
  }
}

/**
 * Get current provider info.
 */
function getProviderInfo() {
  return {
    provider: currentProvider,
    name: currentProvider ? PROVIDERS[currentProvider].name : null,
    configured: !!currentProvider,
  };
}

// ─── Gemini REST helpers (use v1 API, not v1beta) ───

async function geminiEmbedREST(apiKey, text) {
  const url = `${GEMINI_API_BASE}/models/${GEMINI_EMBED_MODEL}:embedContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: { parts: [{ text }] } }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || `Gemini API error ${res.status}`);
  }
  return data.embedding.values;
}

async function geminiBatchEmbedREST(apiKey, texts) {
  const url = `${GEMINI_API_BASE}/models/${GEMINI_EMBED_MODEL}:batchEmbedContents?key=${apiKey}`;
  const requests = texts.map(text => ({
    model: `models/${GEMINI_EMBED_MODEL}`,
    content: { parts: [{ text }] },
  }));
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || `Gemini API error ${res.status}`);
  }
  return data.embeddings.map(e => e.values);
}

// ─── Validation ───

async function validateApiKey(provider, apiKey) {
  try {
    if (provider === 'openai') {
      const client = new OpenAI({ apiKey });
      await client.embeddings.create({
        model: PROVIDERS.openai.embeddingModel,
        input: 'test',
      });
      return { valid: true };
    } else if (provider === 'gemini') {
      // Use direct REST call to v1 endpoint
      await geminiEmbedREST(apiKey, 'test');
      return { valid: true };
    } else if (provider === 'grok') {
      const client = new OpenAI({ apiKey, baseURL: PROVIDERS.grok.baseURL });
      await client.chat.completions.create({
        model: 'grok-3-mini-fast',
        messages: [{ role: 'user', content: 'Say ok' }],
        max_tokens: 5,
      });
      return { valid: true };
    }

    return { valid: false, error: 'Unknown provider.' };
  } catch (err) {
    const raw = err.message || String(err);
    console.error(`[Validation Error - ${provider}]:`, raw.substring(0, 300));

    if (raw.includes('429') || raw.includes('Too Many Requests') || raw.includes('quota') || raw.includes('RESOURCE_EXHAUSTED')) {
      console.log(`Key for ${provider} is rate-limited but valid. Accepting.`);
      return { valid: true };
    }
    if (raw.includes('API_KEY_INVALID') || raw.includes('INVALID_ARGUMENT')) {
      return { valid: false, error: 'Invalid API key. Please check and try again.' };
    }
    if (raw.includes('401') || raw.includes('Unauthorized') || raw.includes('PERMISSION_DENIED')) {
      return { valid: false, error: 'Invalid API key. Please check and try again.' };
    }
    if (raw.includes('403') || raw.includes('Forbidden')) {
      return { valid: false, error: 'Access denied. This API key may not have the required permissions.' };
    }
    if (raw.includes('ENOTFOUND') || raw.includes('ECONNREFUSED')) {
      return { valid: false, error: 'Could not reach the API server. Check your internet connection.' };
    }

    const cleanError = raw.length > 200 ? raw.substring(0, 200) + '...' : raw;
    return { valid: false, error: cleanError };
  }
}

// ─── Embeddings ───

async function generateEmbeddings(texts) {
  if (!currentProvider) throw new Error('No API provider configured. Set it in Settings.');

  if (currentProvider === 'openai') return await generateOpenAIEmbeddings(texts);
  if (currentProvider === 'gemini') return await generateGeminiEmbeddings(texts);
  if (currentProvider === 'grok') return await generateGrokEmbeddings(texts);

  throw new Error('Unknown provider: ' + currentProvider);
}

async function generateQueryEmbedding(text) {
  if (!currentProvider) throw new Error('No API provider configured. Set it in Settings.');

  if (currentProvider === 'openai') {
    const res = await openaiClient.embeddings.create({
      model: PROVIDERS.openai.embeddingModel,
      input: text,
    });
    return res.data[0].embedding;
  }
  if (currentProvider === 'gemini') {
    return await geminiEmbedREST(currentApiKey, text);
  }
  if (currentProvider === 'grok') {
    return generateSimpleEmbedding(text);
  }

  throw new Error('Unknown provider: ' + currentProvider);
}

// ─── Provider-specific batch embeddings ───

async function generateOpenAIEmbeddings(texts) {
  const allEmbeddings = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const res = await openaiClient.embeddings.create({
      model: PROVIDERS.openai.embeddingModel,
      input: batch,
    });
    const sorted = res.data.sort((a, b) => a.index - b.index).map(item => item.embedding);
    allEmbeddings.push(...sorted);
    if (i + BATCH_SIZE < texts.length) await delay(200);
  }
  return allEmbeddings;
}

async function generateGeminiEmbeddings(texts) {
  const allEmbeddings = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const batchEmbeddings = await geminiBatchEmbedREST(currentApiKey, batch);
    allEmbeddings.push(...batchEmbeddings);
    if (i + BATCH_SIZE < texts.length) await delay(300);
  }
  return allEmbeddings;
}

async function generateGrokEmbeddings(texts) {
  return texts.map(text => generateSimpleEmbedding(text));
}

/**
 * Simple TF-based embedding fallback for providers without embedding APIs.
 */
function generateSimpleEmbedding(text) {
  const dim = 256;
  const vec = new Float64Array(dim);
  const words = text.toLowerCase().split(/\W+/).filter(w => w.length > 1);

  for (const word of words) {
    let hash = 0;
    for (let i = 0; i < word.length; i++) {
      hash = ((hash << 5) - hash + word.charCodeAt(i)) | 0;
    }
    const idx = Math.abs(hash) % dim;
    vec[idx] += 1;
    vec[(idx + 1) % dim] += 0.5;
    vec[(idx + 2) % dim] += 0.25;
  }

  let norm = 0;
  for (let i = 0; i < dim; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  if (norm > 0) for (let i = 0; i < dim; i++) vec[i] /= norm;

  return Array.from(vec);
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  PROVIDERS,
  setProvider,
  getProviderInfo,
  validateApiKey,
  generateEmbeddings,
  generateQueryEmbedding,
};
