# 📜 Legal Document Assistant — Context-Based LLM

A full-stack **RAG (Retrieval-Augmented Generation)** web application that lets you upload legal contracts and ask plain-English questions about clauses, terms, and obligations. Documents are chunked, embedded into a vector store, and used as context for LLM-powered Q&A.

![Neo-Brutalist UI](https://img.shields.io/badge/UI-Neo--Brutalist-black?style=flat-square) ![Node.js](https://img.shields.io/badge/Node.js-22-green?style=flat-square) ![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)

---

## ✨ Features

- **Multi-Provider LLM Support** — Choose between **OpenAI**, **Google Gemini**, or **xAI Grok**
- **RAG Pipeline** — Upload → Chunk → Embed → Store → Retrieve → Answer
- **PDF & TXT Parsing** — Extracts text from PDF contracts and plain text files
- **Smart Chunking** — ~500 token chunks with overlap, respecting paragraph/sentence boundaries
- **Vector Search** — Cosine similarity search for context retrieval
- **Source Citations** — Every answer links back to the exact document sections used
- **Neo-Brutalist UI** — Newspaper-inspired design with serif typography and hard shadows

---

## 🏗️ Architecture

```
Upload PDF/TXT → Extract Text → Chunk (~500 tokens)
                                      ↓
                              Generate Embeddings
                                      ↓
                              Store in Vector DB
                                      
Ask Question → Embed Query → Cosine Similarity Search
                                      ↓
                              Top-5 Relevant Chunks
                                      ↓
                              LLM (with context) → Answer + Sources
```

---

## 🚀 Quick Start

### Prerequisites
- **Node.js** v18+
- An API key from one of: [OpenAI](https://platform.openai.com/api-keys), [Google AI Studio](https://aistudio.google.com/apikey), or [xAI](https://console.x.ai/)

### Install & Run

```bash
git clone https://github.com/xenondevv/context-based-llm.git
cd context-based-llm
npm install
npm run dev
```

Open **http://localhost:3000** in your browser.

### Setup

1. Click the **⚙ Settings** icon in the sidebar
2. Select your **LLM provider** (OpenAI, Gemini, or Grok)
3. Enter your **API key** and click Save
4. **Upload** a legal document (PDF or TXT)
5. **Ask questions** like: *"What are the termination clauses?"*

---

## 📂 Project Structure

```
├── client/
│   ├── index.html          # Single-page application
│   ├── css/styles.css       # Neo-brutalist design system
│   └── js/app.js            # Frontend logic
├── server/
│   ├── index.js             # Express API server
│   └── lib/
│       ├── chunker.js       # Text chunking with overlap
│       ├── embeddings.js    # Multi-provider embeddings
│       ├── llm.js           # Multi-provider LLM (RAG)
│       └── vectorStore.js   # In-memory vector store
└── package.json
```

---

## 🔌 Supported Providers

| Provider | Chat Model | Embedding Model |
|----------|-----------|----------------|
| **OpenAI** | gpt-4o-mini | text-embedding-3-small |
| **Google Gemini** | gemini-2.0-flash | gemini-embedding-001 |
| **xAI Grok** | grok-3-mini-fast | Built-in fallback |

---

## 🔒 Security

- API keys are **never stored on disk** — only in server memory for the session
- Keys are entered by the user in the browser and sent to the local server
- No external data collection or telemetry

---

## 📝 License

MIT
