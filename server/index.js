/**
 * Legal Document Assistant — Express Server
 *
 * API Routes:
 *   POST   /api/upload         — Upload a PDF/TXT document
 *   GET    /api/documents      — List all documents
 *   DELETE /api/documents/:id  — Remove a document
 *   POST   /api/ask            — Ask a question (RAG pipeline)
 *   POST   /api/settings       — Save/validate API key
 */

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const { chunkText } = require('./lib/chunker');
const vectorStore = require('./lib/vectorStore');
const { setProvider, getProviderInfo, validateApiKey, generateEmbeddings, generateQueryEmbedding, PROVIDERS } = require('./lib/embeddings');
const { generateAnswer, initLLMClient } = require('./lib/llm');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static frontend
app.use(express.static(path.join(__dirname, '..', 'client')));

// File upload config
const UPLOADS_DIR = path.join(__dirname, '..', 'data', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB max
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.txt', '.text'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF and TXT files are supported.'));
    }
  }
});

// ─── ROUTES ──────────────────────────────────────────────────────

/**
 * POST /api/settings — Save and validate provider + API key
 */
app.post('/api/settings', async (req, res) => {
  try {
    const { provider, apiKey } = req.body;

    if (!provider || !PROVIDERS[provider]) {
      return res.status(400).json({ error: 'Invalid provider. Choose openai, gemini, or grok.' });
    }
    if (!apiKey || apiKey.trim().length < 5) {
      return res.status(400).json({ error: 'Please enter a valid API key.' });
    }

    const result = await validateApiKey(provider, apiKey);
    if (!result.valid) {
      return res.status(401).json({ error: `Invalid API key: ${result.error}` });
    }

    setProvider(provider, apiKey);
    initLLMClient(provider, apiKey);
    res.json({ success: true, message: `${PROVIDERS[provider].name} configured successfully.`, provider: PROVIDERS[provider].name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/settings/status — Get current provider status
 */
app.get('/api/settings/status', (req, res) => {
  res.json(getProviderInfo());
});

/**
 * POST /api/upload — Upload and process a document
 */
app.post('/api/upload', upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    const filePath = req.file.path;
    const originalName = req.file.originalname;
    const ext = path.extname(originalName).toLowerCase();
    let text = '';

    // Extract text
    if (ext === '.pdf') {
      const pdfParse = require('pdf-parse');
      const dataBuffer = fs.readFileSync(filePath);
      const pdfData = await pdfParse(dataBuffer);
      text = pdfData.text;
    } else {
      text = fs.readFileSync(filePath, 'utf-8');
    }

    if (!text || text.trim().length < 10) {
      return res.status(400).json({ error: 'Could not extract text from the document. The file may be empty or image-based.' });
    }

    // Chunk the text
    const chunks = chunkText(text);

    // Generate embeddings
    const chunkTexts = chunks.map(c => c.text);
    const embeddings = await generateEmbeddings(chunkTexts);

    // Store in vector store
    const docId = uuidv4();
    vectorStore.addDocument(docId, originalName, chunks, embeddings);

    // Clean up uploaded file (we don't need it after processing)
    try { fs.unlinkSync(filePath); } catch (e) { /* ignore */ }

    res.json({
      success: true,
      document: {
        id: docId,
        name: originalName,
        chunkCount: chunks.length,
        textLength: text.length
      }
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/documents — List all uploaded documents
 */
app.get('/api/documents', (req, res) => {
  const docs = vectorStore.listDocuments();
  res.json({ documents: docs });
});

/**
 * DELETE /api/documents/:id — Remove a document
 */
app.delete('/api/documents/:id', (req, res) => {
  const { id } = req.params;
  const doc = vectorStore.getDocument(id);
  if (!doc) {
    return res.status(404).json({ error: 'Document not found.' });
  }
  vectorStore.removeDocument(id);
  res.json({ success: true, message: `Removed "${doc.name}"` });
});

/**
 * POST /api/ask — Ask a question using RAG
 */
app.post('/api/ask', async (req, res) => {
  try {
    const { question, docId } = req.body;

    if (!question || question.trim().length === 0) {
      return res.status(400).json({ error: 'Please provide a question.' });
    }

    // Check if we have any documents
    const docs = vectorStore.listDocuments();
    if (docs.length === 0) {
      return res.status(400).json({ error: 'No documents uploaded yet. Please upload a contract first.' });
    }

    // Generate query embedding
    const queryEmbedding = await generateQueryEmbedding(question);

    // Search for relevant chunks
    const results = vectorStore.search(queryEmbedding, 5, docId || null);

    if (results.length === 0) {
      return res.json({
        answer: 'No relevant information found in the uploaded documents.',
        sources: []
      });
    }

    // Generate answer
    const { answer, sources } = await generateAnswer(question, results);

    res.json({ answer, sources });
  } catch (err) {
    console.error('Ask error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── ERROR HANDLING ──────────────────────────────────────────────

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 20MB.' });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err) {
    return res.status(500).json({ error: err.message });
  }
  next();
});

// ─── START SERVER ────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n  ⚖️  Legal Document Assistant`);
  console.log(`  ─────────────────────────────`);
  console.log(`  Server running at http://localhost:${PORT}`);
  console.log(`  Vector store loaded.`);
  console.log();
});
