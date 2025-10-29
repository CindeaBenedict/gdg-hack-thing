// RAG (Retrieval-Augmented Generation) cache service
// Stores embeddings of previously analyzed document pairs to avoid redundant LLM calls

import { pipeline } from '@xenova/transformers'

// In-memory vector store for serverless demo
// In production, use Pinecone, Weaviate, or PGVector
const vectorStore = []
let embeddingModel = null

async function getEmbedder() {
  if (!embeddingModel) {
    embeddingModel = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2')
  }
  return embeddingModel
}

function cosineSimilarity(a, b) {
  let dot = 0
  let magA = 0
  let magB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    magA += a[i] * a[i]
    magB += b[i] * b[i]
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB))
}

export async function embed(text) {
  const embedder = await getEmbedder()
  const output = await embedder(text, { pooling: 'mean', normalize: true })
  return Array.from(output.data)
}

export async function searchSimilar(textA, textB, threshold = 0.9) {
  try {
    const combined = textA + ' ||| ' + textB
    const queryEmb = await embed(combined)
    
    let bestMatch = null
    let bestScore = 0
    
    for (const entry of vectorStore) {
      const score = cosineSimilarity(queryEmb, entry.embedding)
      if (score > bestScore && score >= threshold) {
        bestScore = score
        bestMatch = entry
      }
    }
    
    if (bestMatch) {
      return { hit: true, cached: bestMatch.response, similarity: bestScore }
    }
    return { hit: false }
  } catch (e) {
    console.error('RAG search error:', e)
    return { hit: false }
  }
}

export async function storePair(textA, textB, response) {
  try {
    const combined = textA + ' ||| ' + textB
    const embedding = await embed(combined)
    
    vectorStore.push({
      textA,
      textB,
      embedding,
      response,
      timestamp: Date.now()
    })
    
    // Keep only last 1000 entries in serverless memory
    if (vectorStore.length > 1000) {
      vectorStore.shift()
    }
  } catch (e) {
    console.error('RAG store error:', e)
  }
}

export function getStats() {
  return {
    totalCached: vectorStore.length,
    oldestEntry: vectorStore[0]?.timestamp || null,
    newestEntry: vectorStore[vectorStore.length - 1]?.timestamp || null
  }
}

