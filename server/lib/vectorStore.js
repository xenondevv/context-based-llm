/**
 * In-memory Vector Store with JSON persistence.
 * Stores document chunks with their embeddings and supports
 * cosine similarity search.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const VECTORS_FILE = path.join(DATA_DIR, 'vectors.json');

class VectorStore {
  constructor() {
    this.documents = {};  // docId -> { name, uploadedAt, chunkCount }
    this.chunks = [];     // [{ id, docId, text, embedding, index }]
    this.load();
  }

  /**
   * Add a document and its chunks with embeddings.
   */
  addDocument(docId, docName, chunks, embeddings) {
    this.documents[docId] = {
      name: docName,
      uploadedAt: new Date().toISOString(),
      chunkCount: chunks.length
    };

    for (let i = 0; i < chunks.length; i++) {
      this.chunks.push({
        id: `${docId}_chunk_${i}`,
        docId,
        text: chunks[i].text,
        index: chunks[i].index,
        start: chunks[i].start,
        end: chunks[i].end,
        embedding: embeddings[i]
      });
    }

    this.save();
  }

  /**
   * Search for the top-K most similar chunks to a query embedding.
   * @param {number[]} queryEmbedding
   * @param {number} topK
   * @param {string} [docId] - Optional filter by document
   * @returns {Array<{chunk: object, score: number}>}
   */
  search(queryEmbedding, topK = 5, docId = null) {
    let candidates = this.chunks;
    if (docId) {
      candidates = candidates.filter(c => c.docId === docId);
    }

    const scored = candidates.map(chunk => ({
      chunk: {
        id: chunk.id,
        docId: chunk.docId,
        text: chunk.text,
        index: chunk.index,
        documentName: this.documents[chunk.docId]?.name || 'Unknown'
      },
      score: cosineSimilarity(queryEmbedding, chunk.embedding)
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  /**
   * Remove a document and all its chunks.
   */
  removeDocument(docId) {
    delete this.documents[docId];
    this.chunks = this.chunks.filter(c => c.docId !== docId);
    this.save();
  }

  /**
   * List all documents.
   */
  listDocuments() {
    return Object.entries(this.documents).map(([id, doc]) => ({
      id,
      ...doc
    }));
  }

  /**
   * Get document info.
   */
  getDocument(docId) {
    return this.documents[docId] || null;
  }

  /**
   * Persist to disk.
   */
  save() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const data = {
      documents: this.documents,
      chunks: this.chunks
    };
    fs.writeFileSync(VECTORS_FILE, JSON.stringify(data), 'utf-8');
  }

  /**
   * Load from disk.
   */
  load() {
    try {
      if (fs.existsSync(VECTORS_FILE)) {
        const data = JSON.parse(fs.readFileSync(VECTORS_FILE, 'utf-8'));
        this.documents = data.documents || {};
        this.chunks = data.chunks || [];
        console.log(`  Loaded ${this.chunks.length} chunks from ${Object.keys(this.documents).length} documents`);
      }
    } catch (err) {
      console.error('Failed to load vector store:', err.message);
      this.documents = {};
      this.chunks = [];
    }
  }
}

/**
 * Cosine similarity between two vectors.
 */
function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

// Singleton instance
const store = new VectorStore();

module.exports = store;
