/**
 * Text Chunker — splits document text into overlapping chunks
 * for embedding and retrieval.
 */

const CHUNK_SIZE = 1500;      // ~500 tokens ≈ 1500 chars
const CHUNK_OVERLAP = 450;    // ~150 tokens overlap

/**
 * Split text into overlapping chunks, preferring paragraph boundaries.
 * @param {string} text - Full document text
 * @param {object} opts - Optional overrides { chunkSize, chunkOverlap }
 * @returns {Array<{text: string, index: number, start: number, end: number}>}
 */
function chunkText(text, opts = {}) {
  const chunkSize = opts.chunkSize || CHUNK_SIZE;
  const overlap = opts.chunkOverlap || CHUNK_OVERLAP;

  // Normalize whitespace
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Split into paragraphs first
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);

  const chunks = [];
  let currentChunk = '';
  let chunkStart = 0;
  let currentPos = 0;

  for (const para of paragraphs) {
    const trimmed = para.trim();

    // If adding this paragraph exceeds chunk size and we already have content
    if (currentChunk.length + trimmed.length + 2 > chunkSize && currentChunk.length > 0) {
      chunks.push({
        text: currentChunk.trim(),
        index: chunks.length,
        start: chunkStart,
        end: chunkStart + currentChunk.trim().length
      });

      // Calculate overlap — take the last `overlap` chars of the current chunk
      const overlapText = currentChunk.length > overlap
        ? currentChunk.slice(-overlap)
        : currentChunk;

      currentChunk = overlapText + '\n\n' + trimmed;
      chunkStart = currentPos - overlapText.length;
    } else {
      if (currentChunk.length === 0) {
        chunkStart = currentPos;
        currentChunk = trimmed;
      } else {
        currentChunk += '\n\n' + trimmed;
      }
    }

    currentPos += trimmed.length + 2; // +2 for \n\n
  }

  // Push the last chunk
  if (currentChunk.trim().length > 0) {
    chunks.push({
      text: currentChunk.trim(),
      index: chunks.length,
      start: chunkStart,
      end: chunkStart + currentChunk.trim().length
    });
  }

  // Handle single very long paragraphs — split by sentences
  const finalChunks = [];
  for (const chunk of chunks) {
    if (chunk.text.length > chunkSize * 1.5) {
      const subChunks = splitLongChunk(chunk.text, chunkSize, overlap);
      for (const sub of subChunks) {
        finalChunks.push({
          text: sub,
          index: finalChunks.length,
          start: chunk.start,
          end: chunk.end
        });
      }
    } else {
      finalChunks.push({ ...chunk, index: finalChunks.length });
    }
  }

  return finalChunks;
}

/**
 * Split a long text block by sentence boundaries.
 */
function splitLongChunk(text, chunkSize, overlap) {
  const sentences = text.match(/[^.!?]+[.!?]+\s*/g) || [text];
  const chunks = [];
  let current = '';

  for (const sentence of sentences) {
    if (current.length + sentence.length > chunkSize && current.length > 0) {
      chunks.push(current.trim());
      const overlapText = current.length > overlap
        ? current.slice(-overlap)
        : current;
      current = overlapText + sentence;
    } else {
      current += sentence;
    }
  }

  if (current.trim().length > 0) {
    chunks.push(current.trim());
  }

  return chunks;
}

module.exports = { chunkText };
