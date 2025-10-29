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
        logs.push('Parsed ' + f.filename + ' as ' + kind + ' (' + text.length + ' chars)') 
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
      htmls = texts.map((t) => '<pre>' + escapeHtml(String(t||'')) + '</pre>')
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
      names = [baseName + ' [' + langA + ']', baseName + ' [' + langB + ']']
      kinds = ['derived', 'derived']
      texts = [arrA.join('\n'), arrB.join('\n')]
      htmls = texts.map((t) => '<pre>' + escapeHtml(t) + '</pre>')
    }

    // Align doc0 to each other doc using local similarity + LLM verify (with RAG cache)
    const boxes = []
    const pairsAll = []
    let cacheHits = 0
    let cacheMisses = 0
    for (let d = 1; d < docs.length; d++) {
      const ref = docs[0]
      const oth = docs[d]
      const mapping = await semanticAlign(ref, oth)
      logs.push('Aligned doc0 vs doc' + d + ': ' + mapping.length + ' semantic pairs')
      for (const pair of mapping) {
        const [i, j, semScore] = pair.length === 3 ? pair : [pair[0], pair[1], null]
        const s = ref[i] || ''
        const t = oth[j] || ''
        const baseSim = semScore || similarity(s, t)
        
        // PURE AI MODE: Always call watsonx for every paragraph pair
        let verdict = await watsonxCheck(s, t)
        cacheMisses++
        
        const aiMismatch = verdict?.status && verdict.status !== 'MATCH'
        // ACCURACY: Only flag as mismatch if AI explicitly says MISMATCH or REVIEW
        pairsAll.push({ index: i, docA: 0, rowA: i, textA: s, docB: d, rowB: j, textB: t, similarity: baseSim, ai: verdict, isMismatch: aiMismatch })
      }
    }
    
    // RAG disabled for Vercel compatibility
    logs.push('Analysis complete - ' + cacheMisses + ' watsonx AI checks performed')

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
      files.push({ fileIndex: 0, fileName: names[0] || 'file0', row, text: items[0]?.textA || '' })
      for (const it of items) {
        files.push({ fileIndex: it.docB, fileName: names[it.docB] || 'file' + it.docB, row: it.rowB, text: it.textB })
        if (it.isMismatch) anyMismatch = true
      }
      if (anyMismatch) {
        // Collect all file texts for this row to find majority using LEXICAL similarity
        const allTexts = [items[0]?.textA || '', ...items.map(it => it.textB || '')]
        const allIndices = [0, ...items.map(it => it.docB)]
        
        console.log('Row ' + row + ' texts:', allTexts.map((t, i) => allIndices[i] + ':' + t.substring(0, 50)))
        
        // Group by SEMANTIC equivalence using watsonx AI
        const groups = []
        for (let i = 0; i < allTexts.length; i++) {
          let found = false
          for (const g of groups) {
            // Use watsonx to determine if texts are semantically equivalent
            const aiCheck = await watsonxCheck(allTexts[i], g.texts[0])
            const areSemanticallyEquivalent = aiCheck.status === 'MATCH' || (aiCheck.confidence && aiCheck.confidence < 0.3)
            console.log('  Semantic check file ' + allIndices[i] + ' vs group[0] file ' + g.indices[0] + ': ' + aiCheck.status + ' (conf=' + (aiCheck.confidence || 0) + ')')
            if (areSemanticallyEquivalent) {
              g.indices.push(allIndices[i])
              g.texts.push(allTexts[i])
              found = true
              console.log('    ✓ GROUPED - semantically equivalent')
              break
            }
          }
          if (!found) {
            groups.push({ indices: [allIndices[i]], texts: [allTexts[i]] })
            console.log('  File ' + allIndices[i] + ' → NEW GROUP (semantically different)')
          }
        }
        
        console.log('Row ' + row + ' groups:', groups.map(g => ({ size: g.indices.length, indices: g.indices })))
        
        // Sort groups by size (largest = majority)
        groups.sort((a, b) => b.indices.length - a.indices.length)
        
        // SEMANTIC COLOR LOGIC:
        // - Largest group = majority (correct files) → LOW probability (0.2) → YELLOW
        // - Smaller groups = minority (wrong files) → HIGH probability (0.9) → RED  
        // - 50/50 tie (even split) = uncertain → MEDIUM probability (0.5) → GREEN
        
        const maxGroupSize = groups[0].indices.length
        const totalFiles = allIndices.length
        const isTie = groups.length > 1 && groups.every(g => g.indices.length === maxGroupSize)
        const is5050 = groups.length === 2 && totalFiles % 2 === 0 && groups[0].indices.length === groups[1].indices.length
        
        console.log('Row ' + row + ' maxGroupSize:', maxGroupSize, 'totalFiles:', totalFiles, 'isTie:', isTie, 'is5050:', is5050)
        
        for (const g of groups) {
          const isMajority = g.indices.length === maxGroupSize && !isTie && !is5050
          const isMinority = g.indices.length < maxGroupSize && !isTie && !is5050
          // 50/50 or tie → GREEN, Majority → YELLOW, Minority → RED
          const prob = (isTie || is5050) ? 0.5 : (isMajority ? 0.2 : 0.9)
          for (const fileIdx of g.indices) {
            suspects.push({ fileIndex: fileIdx, probability: prob })
            const color = prob > 0.6 ? 'RED' : (prob === 0.5 ? 'GREEN' : 'YELLOW')
            console.log('Row ' + row + ' file ' + fileIdx + ' groupSize=' + g.indices.length + ' → prob=' + prob + ' → ' + color)
          }
        }
      }
      const issue = items.find(it => (it.ai?.issues || []).length)
      // Pass through all AI issue fields
      const issues = Array.isArray(issue?.ai?.issues) ? issue.ai.issues.map((x) => ({
        ...x,
        type: x.type || 'entity',
        values: x.values || {},
        comment: x.comment || x.reasoning || 'Possible inconsistency'
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
    
    // Fix paragraph breaks - mammoth splits on every <p> tag
    // We need to join lines that belong together and preserve only real paragraph breaks
    let text = (raw.value || '').trim()
    
    // Replace single newlines with spaces (join broken lines)
    // But preserve double newlines (paragraph breaks)
    text = text.replace(/\n(?!\n)/g, ' ')
    // Normalize multiple newlines to double newline
    text = text.replace(/\n{3,}/g, '\n\n')
    
    return { text, html: htmlRes.value || '', kind: 'docx' }
  }
  if (lower.endsWith('.pdf')) {
    const out = await pdfParse(buffer)
    const text = (out.text || '').trim()
    const html = '<pre>' + escapeHtml(text) + '</pre>'
    return { text, html, kind: 'pdf' }
  }
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
    const wb = XLSX.read(buffer, { type: 'buffer' })
    const parts = []
    const rowsAll = []
    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName]
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true })
      parts.push('# ' + sheetName)
      rowsAll.push({ sheetName, rows })
      for (const row of rows) parts.push(String(row.map((c) => (c == null ? '' : c)).join('\t')))
    }
    const text = parts.join('\n')
    let html = ''
    for (const sh of rowsAll) {
      html += '<h4>' + escapeHtml(sh.sheetName) + '</h4>'
      html += '<table border="1" cellpadding="4" cellspacing="0" style="border-collapse:collapse;font-size:12px;">'
      for (const r of sh.rows) {
        html += '<tr>' + r.map((c) => '<td>' + escapeHtml(c == null ? '' : String(c)) + '</td>').join('') + '</tr>'
      }
      html += '</table>'
    }
    return { text, html, kind: 'xlsx' }
  }
  if (lower.endsWith('.json')) {
    const s = buffer.toString('utf8')
    try { const pp = JSON.stringify(JSON.parse(s), null, 2); return { text: pp, html: '<pre>' + escapeHtml(pp) + '</pre>', kind: 'json' } } catch { return { text: s, html: '<pre>' + escapeHtml(s) + '</pre>', kind: 'json' } }
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
    const html = '<pre>' + escapeHtml(text) + '</pre>'
    return { text, html, kind: 'pptx' }
  }
  // Fallback treat as utf8 text
  const txt = buffer.toString('utf8')
  return { text: txt, html: '<pre>' + escapeHtml(txt) + '</pre>', kind: 'txt' }
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
  
  // Split ONLY on double newlines (paragraph breaks)
  // Single newlines have already been replaced with spaces in extractTextFromFile
  const paragraphs = text.split('\n\n')
    .map(p => p.trim())
    .filter(p => p.length > 0)
  
  console.log('Segmented into ' + paragraphs.length + ' paragraphs')
  
  return paragraphs
}

function align(a, b) {
  const m = Math.max(a.length, b.length)
  const out = []
  for (let i = 0; i < m; i++) out.push([i, a[i] || '', b[i] || ''])
  return out
}

async function semanticAlign(a, b) {
  // PURE AI SEMANTIC ALIGNMENT - uses watsonx to find matching paragraphs
  // For each paragraph in a, ask watsonx which paragraph in b matches best
  const out = []
  const usedB = new Set()
  
  console.log('Starting AI-powered semantic alignment for ' + a.length + ' vs ' + b.length + ' paragraphs')
  
  for (let i = 0; i < Math.min(a.length, 50); i++) { // Limit to 50 to avoid timeout
    let bestJ = -1
    let bestConfidence = 1.0 // Lower is better (MATCH has low confidence for mismatch)
    
    // Ask AI to compare with multiple candidates
    const candidates = []
    for (let j = Math.max(0, i - 5); j < Math.min(b.length, i + 6); j++) {
      if (usedB.has(j)) continue
      candidates.push(j)
    }
    
    for (const j of candidates) {
      const aiResult = await watsonxCheck(a[i], b[j])
      const confidence = aiResult.confidence || 0.5
      const isMatch = aiResult.status === 'MATCH'
      
      if (isMatch || confidence < bestConfidence) {
        bestConfidence = confidence
        bestJ = j
      }
      
      if (isMatch) break // Perfect match found, stop searching
    }
    
    if (bestJ >= 0) {
      usedB.add(bestJ)
      out.push([i, bestJ, 1 - bestConfidence]) // Higher score = better match
      console.log('  Para ' + i + ' → Para ' + bestJ + ' (AI confidence: ' + (1 - bestConfidence).toFixed(2) + ')')
    }
  }
  
  console.log('AI semantic alignment: matched ' + out.length + '/' + a.length + ' paragraphs')
  return out
}

// Removed - using pure AI alignment now

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
  const model = process.env.WML_MODEL_ID || 'meta-llama/llama-3-2-90b-vision-instruct'
  if (!key || !project) return { status: 'REVIEW', confidence: 0, issues: [] }
  const token = await iamToken(key)
  const prompt = `You are an AI document consistency checker and correction assistant.

Analyze ONLY the provided multilingual or multi-format document segments.
Do NOT use memory, previous inputs, or external data.

### Core Objectives
1. Detect factual inconsistencies across any number of document versions (numbers, monetary amounts, dates, entity names).
2. Dynamically compute weighted confidence scores for each mismatch.
3. Identify which file(s) or language(s) are inconsistent based on majority or statistical consensus.
4. Suggest corrected values and sentences to achieve factual consistency across all versions.
5. Support ANY language and ANY number of files.

### Output Rules
- Output EXACTLY ONE valid JSON object.
- Output NOTHING outside JSON.
- The output must strictly follow the schema below.
- Confidence and probabilities must be between 0.00 and 1.00.
- End output immediately after the final "}".

### UNIVERSAL JSON SCHEMA
{
  "status": "MATCH|MISMATCH|REVIEW",
  "confidence": 0.00–1.00,
  "issues": [
    {
      "row": <row_number or null>,
      "type": "number|monetary|date|entity|semantic",
      "values": {
        "<language_or_filename>": "<raw extracted value>",
        "...": "..."
      },
      "sentences": {
        "<language_or_filename>": "<full sentence containing the inconsistent value>",
        "...": "..."
      },
      "numeric_analysis": {
        "currency": "EUR|USD|LOCAL|null",
        "normalized_values": {
          "<language_or_filename>": <numeric_value>,
          "...": <numeric_value>
        },
        "abs_differences": {
          "<language_or_filename>": <absolute difference from mean or consensus>,
          "...": <absolute difference>
        },
        "pct_differences": {
          "<language_or_filename>": <relative difference (0–1)>,
          "...": <relative difference>
        }
      },
      "confidence_factors": {
        "value_alignment": 0.0–1.0,
        "semantic_similarity": 0.0–1.0,
        "repetition_pattern": 0.0–1.0,
        "format_consistency": 0.0–1.0
      },
      "suspect_probabilities": {
        "<language_or_filename>": <probability_that_this_version_is_wrong>,
        "...": <probability>
      },
      "reasoning": "Brief explanation of detected inconsistency and which versions disagree.",
      "file_diagnostics": {
        "total_files": <integer>,
        "majority_consensus": ["<file_1>", "<file_2>", "..."],
        "deviating_files": ["<file_3>", "..."],
        "error_explanation": "Human-readable explanation of which versions disagree and why (e.g., numeric deviation, translation drift, formatting)."
      },
      "suggested_fix": {
        "consistent_value": "<consensus or corrected value>",
        "preferred_language": "<detected consensus language or most accurate file>",
        "updated_sentences": {
          "<language_or_filename>": "<sentence with corrected value>",
          "...": "..."
        },
        "justification": "Explain why this correction was chosen (e.g., 4/5 files agree, deviation magnitude <1%)."
      },
      "comment": "Concise summary of what is inconsistent and which file is likely incorrect."
    }
  ]
}

### Confidence Framework
Compute suspect_probabilities dynamically:
For each version X:
  suspect_probabilities[X] = 1 - (alignment_score[X] / average_alignment)

Overall confidence = mean(semantic_similarity, format_consistency, 1 - stddev(normalized_values)/max_value)

### Correction Rules
- Handle any number of input files (2–N).
- Support any written language.
- Use cross-language semantic alignment rather than token similarity.
- Derive the consensus value from the median or majority cluster of aligned values.
- If more than one cluster exists → set status = "REVIEW".
- If only stylistic or notation differences exist (e.g., comma vs dot, € before vs after number) → set status = "REVIEW" instead of "MISMATCH".
- Never invent entities, currencies, or years not explicitly present in the input.
- Maintain the tone and structure of each language in "updated_sentences".
- End immediately after the final bracket.

Input A: ` + a + `
Input B: ` + b + `

Output:`
  const r = await fetch(base + '/ml/v1/text/generation?version=2023-05-29', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({
      input: prompt,
      parameters: {
        decoding_method: 'greedy',
        max_new_tokens: 200,
        min_new_tokens: 0,
        repetition_penalty: 1
      },
      model_id: model,
      project_id: project,
      moderations: {
        hap: {
          input: { enabled: true, threshold: 0.5, mask: { remove_entity_value: true } },
          output: { enabled: true, threshold: 0.5, mask: { remove_entity_value: true } }
        },
        pii: {
          input: { enabled: true, threshold: 0.5, mask: { remove_entity_value: true } },
          output: { enabled: true, threshold: 0.5, mask: { remove_entity_value: true } }
        },
        granite_guardian: {
          input: { threshold: 1 }
        }
      }
    })
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


