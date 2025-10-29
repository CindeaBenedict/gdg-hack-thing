import Busboy from 'busboy'
import mammoth from 'mammoth'
import pdfParse from 'pdf-parse'
import * as XLSX from 'xlsx'
import JSZip from 'jszip'
import { XMLParser } from 'fast-xml-parser'
import { franc } from 'franc-min'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const logs = []
    const ct = req.headers['content-type'] || ''
    let texts = []
    let names = []
    let kinds = []
    let htmls = []
    if (ct.includes('multipart/form-data')) {
      const files = await readMultipart(req)
      for (const f of files) {
        const { text, html, kind } = await extractTextFromFile(f.buffer, f.filename)
        logs.push(`Parsed ${f.filename} as ${kind} (${text.length} chars)`) 
        texts.push(text)
        names.push(f.filename)
        kinds.push(kind)
        htmls.push(html)
      }
    } else {
      const body = await readJson(req)
      texts = Array.isArray(body?.texts) ? body.texts : []
      names = Array.isArray(body?.names) ? body.names : []
      kinds = texts.map(() => 'text')
      htmls = texts.map((t) => `<pre>${escapeHtml(String(t||''))}</pre>`)
    }
    if (texts.length === 0) return res.status(400).json({ error: 'Provide at least one file' })

    // Segment all inputs (or derive multilingual streams if single input)
    let docs = texts.map(segment)
    if (texts.length === 1) {
      const one = texts[0]
      // Try to split by languages within the single document
      const segs = segment(one)
      const langAtoItems = new Map()
      const counts = new Map()
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i]
        const code = franc(s || '') || 'und'
        if (!langAtoItems.has(code)) langAtoItems.set(code, [])
        langAtoItems.get(code).push({ idx: i, text: s })
        counts.set(code, (counts.get(code) || 0) + 1)
      }
      // Pick top two languages; if only one, duplicate to compare identity
      const top = [...counts.entries()].sort((a,b)=>b[1]-a[1]).map(x=>x[0]).slice(0,2)
      if (top.length === 0) top.push('und')
      if (top.length === 1) top.push(top[0])
      const langA = top[0]
      const langB = top[1]
      const arrA = (langAtoItems.get(langA) || []).map(x=>x.text)
      const arrB = (langAtoItems.get(langB) || []).map(x=>x.text)
      docs = [arrA, arrB]
      // Update names/kinds to reflect derived streams
      const baseName = names[0] || 'file'
      names = [`${baseName} [${langA}]`, `${baseName} [${langB}]`]
      kinds = ['derived', 'derived']
      texts = [arrA.join('\n'), arrB.join('\n')]
      htmls = texts.map((t) => `<pre>${escapeHtml(t)}</pre>`)
    }

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
      files.push({ fileIndex: 0, fileName: names[0] || `file0`, row, text: items[0]?.textA || '' })
      for (const it of items) {
        files.push({ fileIndex: it.docB, fileName: names[it.docB] || `file${it.docB}`, row: it.rowB, text: it.textB })
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
      // Normalize issues to generic structure if present
      const issues = Array.isArray(issue?.ai?.issues) ? issue.ai.issues.map((x) => ({
        type: x.type || 'entity',
        values: x.values || {},
        comment: x.comment || 'Possible inconsistency'
      })) : []
      boxes.push({ row, files, issues, suspects })
    }

    // Summary from mismatches
    const rowsFlat = pairsAll.map(p => ({ similarity: p.similarity, isMismatch: p.isMismatch }))
    const summary = summarize(rowsFlat)
    return res.status(200).json({ projectId: Date.now().toString(36), createdAt: Math.floor(Date.now()/1000), summary, pairs: pairsAll, boxes, logs, inputs: { names, kinds, texts, htmls } })
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

function readMultipart(req) {
  return new Promise((resolve, reject) => {
    const busboy = Busboy({ headers: req.headers })
    const files = []
    busboy.on('file', (name, file, info) => {
      const { filename } = info
      const chunks = []
      file.on('data', (d) => chunks.push(d))
      file.on('end', () => files.push({ filename, buffer: Buffer.concat(chunks) }))
    })
    busboy.on('error', reject)
    busboy.on('finish', () => resolve(files))
    req.pipe(busboy)
  })
}

async function extractTextFromFile(buffer, filename) {
  const lower = (filename || '').toLowerCase()
  if (lower.endsWith('.docx') || lower.endsWith('.doc')) {
    const raw = await mammoth.extractRawText({ buffer })
    const htmlRes = await mammoth.convertToHtml({ buffer })
    return { text: (raw.value || '').trim(), html: htmlRes.value || '', kind: 'docx' }
  }
  if (lower.endsWith('.pdf')) {
    const out = await pdfParse(buffer)
    const text = (out.text || '').trim()
    const html = `<pre>${escapeHtml(text)}</pre>`
    return { text, html, kind: 'pdf' }
  }
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
    const wb = XLSX.read(buffer, { type: 'buffer' })
    const parts = []
    const rowsAll = []
    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName]
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true })
      parts.push(`# ${sheetName}`)
      rowsAll.push({ sheetName, rows })
      for (const row of rows) parts.push(String(row.map((c) => (c == null ? '' : c)).join('\t')))
    }
    const text = parts.join('\n')
    let html = ''
    for (const sh of rowsAll) {
      html += `<h4>${escapeHtml(sh.sheetName)}</h4>`
      html += '<table border="1" cellpadding="2" cellspacing="0">'
      for (const r of sh.rows) {
        html += '<tr>' + r.map((c) => `<td>${escapeHtml(c == null ? '' : String(c))}</td>`).join('') + '</tr>'
      }
      html += '</table>'
    }
    return { text, html, kind: 'xlsx' }
  }
  if (lower.endsWith('.json')) {
    const s = buffer.toString('utf8')
    try { const pp = JSON.stringify(JSON.parse(s), null, 2); return { text: pp, html: `<pre>${escapeHtml(pp)}</pre>`, kind: 'json' } } catch { return { text: s, html: `<pre>${escapeHtml(s)}</pre>`, kind: 'json' } }
  }
  if (lower.endsWith('.pptx') || lower.endsWith('.ppt')) {
    const zip = await JSZip.loadAsync(buffer)
    const parser = new XMLParser({ ignoreAttributes: false })
    const texts = []
    const slideFiles = Object.keys(zip.files).filter(p => p.startsWith('ppt/slides/slide') && p.endsWith('.xml'))
    slideFiles.sort()
    for (const p of slideFiles) {
      const xml = await zip.file(p).async('string')
      const json = parser.parse(xml)
      // Traverse for a:t text nodes
      collectPptxText(json, texts)
      texts.push('')
    }
    const text = texts.join('\n').trim()
    const html = `<pre>${escapeHtml(text)}</pre>`
    return { text, html, kind: 'pptx' }
  }
  // Fallback treat as utf8 text
  const txt = buffer.toString('utf8')
  return { text: txt, html: `<pre>${escapeHtml(txt)}</pre>`, kind: 'txt' }
}

function collectPptxText(node, out) {
  if (!node || typeof node !== 'object') return
  for (const [k, v] of Object.entries(node)) {
    if (k.endsWith(':t') || k === 'a:t') {
      if (typeof v === 'string') out.push(v)
    } else if (typeof v === 'object') {
      collectPptxText(v, out)
    }
  }
}

function escapeHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
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
  const prompt = `You are an AI document consistency checker and confidence estimator.

Analyze the provided multilingual or multi-format segments ONLY. Do NOT use any previous data or memory.

Your goals:
1. Identify factual inconsistencies across document versions.
2. Compute a probabilistic confidence score (0.0–1.0) for each mismatch, based on:
   • Value similarity (numeric or lexical closeness)
   • Entity alignment confidence (same clause or row?)
   • Repetition strength across documents
   • Structural alignment between rows
3. Return probabilities that reflect **relative certainty of inconsistency**, not random scores.

Consider:
- A mismatch repeated across several rows = higher confidence (≈ 0.8 – 1.0).
- Slight numeric difference or weak alignment = medium confidence (≈ 0.5 – 0.7).
- Ambiguous or unaligned = low confidence (< 0.5).

Output exactly ONE valid JSON. No text outside JSON.

Strict schema:
{
  "status": "MATCH|MISMATCH|REVIEW",
  "confidence": 0.00–1.00,
  "issues": [
    {
      "type": "number|monetary|date|entity|semantic",
      "values": {"lang1": "...", "lang2": "..."},
      "suspect_probability": 0.60,
      "reasoning": "Explain which language likely contains the inconsistent value.",
      "comment": "Brief summary of the inconsistency"
    }
  ]
}

Rules:
- Output NOTHING outside JSON.
- All probabilities between 0.00 and 1.00.
- If all values identical → MATCH.
- Never output static or repeated probabilities (each row must differ if context differs).
- End generation immediately after the final }.

Input A: ${a}
Input B: ${b}

Output:`
  const r = await fetch(`${base}/ml/v1/text/generation?version=2023-05-29`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ input: prompt, parameters: { decoding_method: 'greedy', max_new_tokens: 300, min_new_tokens: 0, repetition_penalty: 1 }, model_id: model, project_id: project })
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


