export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const body = await readJson(req)
    const texts = Array.isArray(body?.texts) ? body.texts : []
    if (texts.length < 2) return res.status(400).json({ error: 'Provide texts[2]' })

    // Segment all inputs
    const docs = texts.map(segment)

    // Align doc0 to each other doc using local similarity + LLM verify
    const boxes = []
    const pairsAll = []
    for (let d = 1; d < docs.length; d++) {
      const ref = docs[0]
      const oth = docs[d]
      const mapping = greedyAlign(ref, oth)
      for (const [i, j] of mapping) {
        const s = ref[i] || ''
        const t = oth[j] || ''
        const baseSim = similarity(s, t)
        const verdict = await watsonxCheck(s, t)
        const aiMismatch = verdict?.status && verdict.status !== 'MATCH'
        pairsAll.push({ index: i, docA: 0, rowA: i, textA: s, docB: d, rowB: j, textB: t, similarity: baseSim, ai: verdict, isMismatch: aiMismatch || baseSim < 0.6 })
      }
    }

    // Build explanation boxes per base row i
    const byRow = new Map()
    for (const p of pairsAll) {
      const k = p.index
      if (!byRow.has(k)) byRow.set(k, [])
      byRow.get(k).push(p)
    }
    for (const [row, items] of byRow) {
      const files = []
      const suspects = []
      let anyMismatch = false
      // file 0 always present
      files.push({ fileIndex: 0, row, text: items[0]?.textA || '' })
      for (const it of items) {
        files.push({ fileIndex: it.docB, row: it.rowB, text: it.textB })
        if (it.isMismatch) anyMismatch = true
      }
      if (anyMismatch) {
        for (const it of items) {
          const conf = Number(it.ai?.confidence || 0.6)
          const blame = it.ai?.status === 'MISMATCH' || it.isMismatch ? conf : 0.0
          suspects.push({ fileIndex: it.docB, probability: Math.round(Math.min(0.95, Math.max(0.05, blame)) * 100) / 100 })
        }
      }
      const issue = items.find(it => (it.ai?.issues || []).length)
      boxes.push({ row, files, issues: issue?.ai?.issues || [], suspects })
    }

    // Summary from mismatches
    const rowsFlat = pairsAll.map(p => ({ similarity: p.similarity, isMismatch: p.isMismatch }))
    const summary = summarize(rowsFlat)
    return res.status(200).json({ projectId: Date.now().toString(36), createdAt: Math.floor(Date.now()/1000), summary, pairs: pairsAll, boxes, logs: [] })
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'server error' })
  }
}

async function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (c) => (data += c))
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')) } catch (e) { reject(e) }
    })
    req.on('error', reject)
  })
}

function segment(text) {
  if (!text) return []
  const parts = []
  for (const line of text.split('\n')) {
    for (const p of line.replace(/\?|!/g, '.').split('.')) {
      const s = p.trim()
      if (s) parts.push(s)
    }
  }
  return parts
}

function align(a, b) {
  const m = Math.max(a.length, b.length)
  const out = []
  for (let i = 0; i < m; i++) out.push([i, a[i] || '', b[i] || ''])
  return out
}

function greedyAlign(a, b) {
  // For each i in a, pick j in [i-2,i+2] maximizing lexical similarity
  const out = []
  for (let i = 0; i < a.length; i++) {
    let bestJ = Math.min(i, b.length - 1)
    let best = -1
    for (let dj = -2; dj <= 2; dj++) {
      const j = i + dj
      if (j < 0 || j >= b.length) continue
      const s = similarity(a[i] || '', b[j] || '')
      if (s > best) { best = s; bestJ = j }
    }
    out.push([i, Math.max(0, Math.min(bestJ, b.length - 1))])
  }
  return out
}

function similarity(a, b) {
  if (!a && !b) return 1
  if (!a || !b) return 0
  const sa = new Set(a.toLowerCase().split(/\s+/))
  const sb = new Set(b.toLowerCase().split(/\s+/))
  const union = new Set([...sa, ...sb])
  let inter = 0
  for (const x of sa) if (sb.has(x)) inter++
  const overlap = inter / Math.max(1, union.size)
  const shape = Math.min(a.length, b.length) / ((a.length + b.length) / 2)
  return Math.max(0, Math.min(1, 0.5 * overlap + 0.5 * shape))
}

function summarize(rows) {
  const total = rows.length
  const mismatches = rows.filter(r => r.isMismatch).length
  const avg = total ? rows.reduce((s, r) => s + r.similarity, 0) / total : 0
  return { total, mismatches, avgSimilarity: Math.round(avg * 1000) / 1000 }
}

async function watsonxCheck(a, b) {
  const key = process.env.WML_API_KEY
  const project = process.env.WML_PROJECT_ID
  const base = process.env.WML_API_URL || 'https://us-south.ml.cloud.ibm.com'
  const model = process.env.WML_MODEL_ID || 'ibm/granite-3-2-8b-instruct'
  if (!key || !project) return { status: 'REVIEW', confidence: 0, issues: [] }
  const token = await iamToken(key)
  const prompt = `You are an AI consistency auditor. Compare multiple multilingual or multi-format documents for factual consistency.\nDetect mismatches in numbers, dates, monetary amounts, or entities. If most versions agree and one differs, mark it as suspect.\nOutput only a valid JSON object using this schema:{\"status\":\"MATCH|MISMATCH|REVIEW\",\"confidence\":0.0-1.0,\"issues\":[{\"type\":\"number|date|monetary|entity\",\"comment\":\"brief reason\"}]}\nInput: EN: ${a}\nDE: ${b}\n\nOutput:`
  const r = await fetch(`${base}/ml/v1/text/generation?version=2023-05-29`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ input: prompt, parameters: { decoding_method: 'greedy', max_new_tokens: 200, min_new_tokens: 0, repetition_penalty: 1 }, model_id: model, project_id: project })
  })
  if (!r.ok) return { status: 'REVIEW', confidence: 0, issues: [] }
  const out = await r.json()
  const text = out?.results?.[0]?.generated_text || '{}'
  try { return JSON.parse(text) } catch { return { status: 'REVIEW', confidence: 0, issues: [] } }
}

async function iamToken(apiKey) {
  const r = await fetch('https://iam.cloud.ibm.com/identity/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ibm:params:oauth:grant-type:apikey', apikey: apiKey })
  })
  if (!r.ok) throw new Error('iam token fail')
  const j = await r.json()
  return j.access_token
}


