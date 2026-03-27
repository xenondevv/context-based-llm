/**
 * Multi-provider LLM module for RAG answer generation.
 * Supports: OpenAI, Google Gemini, xAI Grok
 */

const { OpenAI } = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { getProviderInfo } = require('./embeddings');

const SYSTEM_PROMPT = `You are an expert legal document assistant. Your role is to help users understand legal contracts, agreements, and other legal documents by answering their questions in clear, plain English.

INSTRUCTIONS:
- Answer questions based ONLY on the provided document context below. Do not make up information.
- If the answer cannot be found in the provided context, clearly state that the information is not available in the uploaded documents.
- When referencing specific clauses, sections, or paragraphs, cite the source chunk number in brackets like [Source 1], [Source 2].
- Break down complex legal language into simple, understandable terms.
- If a question is ambiguous, provide the most relevant interpretation based on the context.
- Use bullet points and structured formatting for clarity when appropriate.
- Highlight any important caveats, conditions, or exceptions mentioned in the relevant clauses.`;

// Provider clients (set when API key is configured)
let openaiClient = null;
let geminiClient = null;
let grokClient = null;

/**
 * Initialize the LLM client for the given provider.
 */
function initLLMClient(provider, apiKey) {
  if (provider === 'openai') {
    openaiClient = new OpenAI({ apiKey });
  } else if (provider === 'gemini') {
    geminiClient = new GoogleGenerativeAI(apiKey);
  } else if (provider === 'grok') {
    grokClient = new OpenAI({ apiKey, baseURL: 'https://api.x.ai/v1' });
  }
}

/**
 * Generate an answer using RAG — retrieved chunks provide context.
 */
async function generateAnswer(question, results) {
  const { provider } = getProviderInfo();

  // Build context from retrieved chunks
  const contextParts = results.map((r, i) => {
    return `--- Source ${i + 1} (from "${r.chunk.documentName}", relevance: ${(r.score * 100).toFixed(1)}%) ---\n${r.chunk.text}`;
  });

  const contextBlock = contextParts.join('\n\n');
  const userMessage = `DOCUMENT CONTEXT:\n${contextBlock}\n\n---\n\nUSER QUESTION: ${question}`;

  let answer;

  if (provider === 'openai') {
    answer = await callOpenAI(userMessage);
  } else if (provider === 'gemini') {
    answer = await callGemini(userMessage);
  } else if (provider === 'grok') {
    answer = await callGrok(userMessage);
  } else {
    throw new Error('No LLM provider configured.');
  }

  const sources = results.map((r, i) => ({
    index: i + 1,
    documentName: r.chunk.documentName,
    docId: r.chunk.docId,
    chunkIndex: r.chunk.index,
    text: r.chunk.text.substring(0, 200) + (r.chunk.text.length > 200 ? '...' : ''),
    relevance: (r.score * 100).toFixed(1),
  }));

  return { answer, sources };
}

// ─── Provider-specific LLM calls ───

async function callOpenAI(userMessage) {
  if (!openaiClient) throw new Error('OpenAI client not initialized.');
  const res = await openaiClient.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ],
    temperature: 0.2,
    max_tokens: 1500,
  });
  return res.choices[0]?.message?.content || 'Unable to generate an answer.';
}

async function callGemini(userMessage) {
  if (!geminiClient) throw new Error('Gemini client not initialized.');
  const model = geminiClient.getGenerativeModel({
    model: 'gemini-2.0-flash',
    systemInstruction: SYSTEM_PROMPT,
  });
  const result = await model.generateContent(userMessage);
  return result.response.text() || 'Unable to generate an answer.';
}

async function callGrok(userMessage) {
  if (!grokClient) throw new Error('Grok client not initialized.');
  const res = await grokClient.chat.completions.create({
    model: 'grok-3-mini-fast',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ],
    temperature: 0.2,
    max_tokens: 1500,
  });
  return res.choices[0]?.message?.content || 'Unable to generate an answer.';
}

module.exports = { generateAnswer, initLLMClient };
