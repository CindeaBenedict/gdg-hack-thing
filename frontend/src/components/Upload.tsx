import { useEffect, useRef, useState } from 'react'
import { Alert, Box, Button, Card, CardContent, Chip, Divider, LinearProgress, Paper, Stack, Typography, Accordion, AccordionSummary, AccordionDetails } from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import DownloadIcon from '@mui/icons-material/Download'
import EditIcon from '@mui/icons-material/Edit'
import { jsPDF } from 'jspdf'
import ReactQuill from 'react-quill'
import 'react-quill/dist/quill.snow.css'
import api from '../services/api'

export default function Upload() {
  const [files, setFiles] = useState<File[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<any>(null)
  const [notes, setNotes] = useState<any[]>([])
  const [logs, setLogs] = useState<string[]>([])
  const logEndRef = useRef<HTMLDivElement | null>(null)
  const [segments, setSegments] = useState<string[][]>([])
  const [highlightMap, setHighlightMap] = useState<number[]>([])
  const rowRefs = useRef<Array<Array<HTMLDivElement | null>>>([])
  const [editable, setEditable] = useState<boolean[]>([])
  const [editedHtmls, setEditedHtmls] = useState<string[]>([])
  const [editedTexts, setEditedTexts] = useState<string[]>([])

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [logs])

  const onAnalyze = async () => {
    if (files.length < 1) {
      setError('Select at least one file')
      return
    }
    setError('')
    setLoading(true)
    setResult(null)
    setNotes([])
    setLogs((l) => [...l, 'Starting analysis for ' + files.length + ' files'])
    try {
      const sel = files
      const fd = new FormData()
      sel.forEach((f) => fd.append('files', f, f.name))
      const res = await api.post('/analyze', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setResult(res.data)
      const boxes = (res.data?.boxes || []) as any[]
      const pretty = boxes.map((b) => ({
        index: b.row,
        message: (b.issues?.[0]?.comment) || 'Potential inconsistency',
        files: b.files,
        issues: b.issues || [],
        suspects: b.suspects || []
      }))
      setNotes(pretty)
      setLogs((l) => [...l, ...(res.data?.logs || [])])
      // persist for dashboard
      try {
        const store = JSON.parse(localStorage.getItem('cm_reports') || '[]')
        store.unshift({
          projectId: res.data?.projectId,
          createdAt: res.data?.createdAt,
          filenames: { source: res.data?.inputs?.names?.[0], target: res.data?.inputs?.names?.[1] },
          summary: res.data?.summary,
          full: res.data
        })
        localStorage.setItem('cm_reports', JSON.stringify(store.slice(0, 50)))
      } catch {}
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || 'Analysis failed')
      setLogs((l) => [...l, 'Error: ' + (e?.message || 'unknown')])
    } finally {
      setLoading(false)
    }
  }

  // Mirror server segmentation for alignment/highlight
  const segmentText = (text: string): string[] => {
    if (!text) return []
    const out: string[] = []
    for (const line of text.split('\n')) {
      for (const p of line.replace(/\?|!/g, '.').split('.')) {
        const s = p.trim()
        if (s) out.push(s)
      }
    }
    return out
  }

  // Build segments and refs when result comes in
  useEffect(() => {
    const texts: string[] = result?.inputs?.texts || []
    if (texts.length) {
      const segs = texts.map((t: string) => segmentText(t))
      setSegments(segs)
      rowRefs.current = segs.map((arr) => new Array(arr.length).fill(null))
      setHighlightMap(new Array(texts.length).fill(-1))
      // init editors from server response
      const htmls: string[] = result?.inputs?.htmls || texts.map(t => '<pre>' + escapeHtml(t) + '</pre>')
      setEditedHtmls(htmls)
      setEditedTexts(texts)
      setEditable(new Array(texts.length).fill(false))
    } else {
      setSegments([])
      rowRefs.current = []
      setHighlightMap([])
      setEditedHtmls([])
      setEditedTexts([])
      setEditable([])
    }
  }, [result])

  // When highlight changes, scroll rows into view
  useEffect(() => {
    highlightMap.forEach((row, fi) => {
      if (row != null && row >= 0) {
        const el = rowRefs.current?.[fi]?.[row]
        if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      }
    })
  }, [highlightMap])

  const goToFinding = (n: any) => {
    // n.files includes doc 0 plus others with row indices
    const maxFiles = result?.inputs?.texts?.length || 0
    const next = new Array(maxFiles).fill(-1)
    next[0] = n.index
    for (const f of (n.files || [])) {
      if (typeof f.fileIndex === 'number' && typeof f.row === 'number') {
        next[f.fileIndex] = f.row
      }
    }
    setHighlightMap(next)
  }

  const escapeHtml = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')

  const stripHtml = (html: string) => {
    const div = document.createElement('div')
    div.innerHTML = html
    return div.textContent || div.innerText || ''
  }

  const toggleEdit = (i: number) => {
    setEditable((prev) => prev.map((v, idx) => (idx === i ? !v : v)))
  }

  const onHtmlChange = (i: number, html: string) => {
    setEditedHtmls((prev) => prev.map((v, idx) => (idx === i ? html : v)))
    setEditedTexts((prev) => prev.map((v, idx) => (idx === i ? stripHtml(html) : v)))
  }

  const onTextChange = (i: number, text: string) => {
    setEditedTexts((prev) => prev.map((v, idx) => (idx === i ? text : v)))
  }

  const downloadFile = async (i: number) => {
      const name = (result?.inputs?.names?.[i] || 'file' + (i + 1))
    const kind = (result?.inputs?.kinds?.[i] || 'txt')
    if (kind === 'docx' || kind === 'xlsx') {
      // Download as HTML file to preserve formatting
      const htmlContent = editedHtmls[i] || ('<pre>' + escapeHtml(editedTexts[i] || '') + '</pre>')
      const fullHtml = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + name + '</title><style>body{font-family:Arial,sans-serif;margin:20px;} table{border-collapse:collapse;width:100%;} td,th{border:1px solid #ddd;padding:8px;text-align:left;} h4{color:#333;}</style></head><body>' + htmlContent + '</body></html>'
      const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = name.replace(/\.(docx|xlsx)$/i, '.html')
      a.click()
      return
    }
    if (kind === 'pdf') {
      const doc = new jsPDF()
      const lines = (editedTexts[i] || '').split('\n')
      let y = 10
      const pageHeight = doc.internal.pageSize.height
      lines.forEach((ln) => {
        if (y > pageHeight - 10) { doc.addPage(); y = 10 }
        doc.text(ln || ' ', 10, y)
        y += 7
      })
      doc.save(name.endsWith('.pdf') ? name : name + '.pdf')
      return
    }
    const blob = new Blob([editedTexts[i] || ''], { type: 'text/plain;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = name
    a.click()
  }

  const rerunWithEdits = async () => {
    try {
      setLoading(true)
      setError('')
      const names = result?.inputs?.names || editedTexts.map((_, i) => 'file' + (i + 1))
      const texts = editedTexts
      const res = await api.post('/analyze', { texts, names })
      setResult(res.data)
      const boxes = (res.data?.boxes || []) as any[]
      const pretty = boxes.map((b) => ({ index: b.row, message: (b.issues?.[0]?.comment) || 'Potential inconsistency', files: b.files, issues: b.issues || [], suspects: b.suspects || [] }))
      setNotes(pretty)
      setLogs((l) => [...l, ...(res.data?.logs || []), 'Re-run with edits completed'])
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || 'Re-run failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="h6">Upload and Analyze</Typography>
          {loading && <LinearProgress />}
          {error && <Alert severity="error">{error}</Alert>}
          <Stack direction="row" spacing={2} alignItems="center">
            <Button variant="outlined" component="label">
              {files.length ? files.length + ' files selected' : 'Select files'}
              <input type="file" hidden multiple onChange={(e) => setFiles(Array.from(e.target.files || []))} />
            </Button>
            <Button variant="contained" onClick={onAnalyze} disabled={loading}>Run</Button>
            {files.length > 0 && <Chip label={files.length + ' selected'} />}
          </Stack>

          {result && (
            <Box>
              <Typography variant="subtitle1">Summary</Typography>
              <Typography>Project: {result.projectId}</Typography>
              <Typography>Total pairs: {result.summary?.total}</Typography>
              <Typography>Mismatches: {result.summary?.mismatches}</Typography>
              <Typography>Avg similarity: {result.summary?.avgSimilarity}</Typography>
            </Box>
          )}

          {result?.inputs?.texts?.length > 0 && (
            <Box>
              <Divider sx={{ my: 1 }} />
              <Typography variant="subtitle1" gutterBottom>Uploaded documents</Typography>
              <Stack spacing={1}>
                {segments.map((rows, i) => (
                  <Paper key={i} variant="outlined" sx={{ p: 1 }}>
                    <Stack spacing={0.5}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {result.inputs.names?.[i] || 'File ' + (i + 1)} {result.inputs.kinds?.[i] ? '(' + result.inputs.kinds[i] + ')' : ''}
                      </Typography>
                      <Stack direction="row" spacing={1}>
                        <Button size="small" variant="outlined" startIcon={<EditIcon />} onClick={() => toggleEdit(i)}>{editable[i] ? 'Stop editing' : 'Edit'}</Button>
                        <Button size="small" variant="outlined" startIcon={<DownloadIcon />} onClick={() => downloadFile(i)}>Download</Button>
                      </Stack>
                      {editable[i] ? (
                        (result.inputs.kinds?.[i] === 'docx' || result.inputs.kinds?.[i] === 'xlsx') && editedHtmls[i] && editedHtmls[i].includes('<') ? (
                          <Box sx={{ border: '1px solid #ccc', borderRadius: 1, overflow: 'hidden' }}>
                            <ReactQuill
                              value={editedHtmls[i] || ''}
                              onChange={(html) => onHtmlChange(i, html)}
                              style={{ height: 300, marginBottom: 42 }}
                              theme="snow"
                            />
                          </Box>
                        ) : (
                          <textarea
                            value={editedTexts[i] || ''}
                            onChange={(e) => onTextChange(i, e.target.value)}
                            style={{ width: '100%', height: 300, fontFamily: 'monospace', fontSize: 12, padding: '8px', border: '1px solid #ccc', borderRadius: 4 }}
                          />
                        )
                      ) : (
                        result.inputs.kinds?.[i] === 'xlsx' && editedHtmls[i] && editedHtmls[i].includes('<table') ? (
                          <Paper variant="outlined" sx={{ p: 1, maxHeight: 400, overflow: 'auto' }}>
                            <div dangerouslySetInnerHTML={{ __html: editedHtmls[i] || '' }} style={{ fontSize: 12 }} />
                          </Paper>
                        ) : result.inputs.kinds?.[i] === 'docx' && editedHtmls[i] && editedHtmls[i].includes('<') ? (
                          <Paper variant="outlined" sx={{ p: 1, maxHeight: 400, overflow: 'auto', fontSize: 14, lineHeight: 1.6 }}>
                            <div dangerouslySetInnerHTML={{ __html: editedHtmls[i] || '' }} />
                          </Paper>
                        ) : (
                          <Paper variant="outlined" sx={{ p: 1, maxHeight: 220, overflow: 'auto', fontFamily: 'monospace', fontSize: 12 }}>
                            {rows.map((line, ri) => (
                              <div
                                key={ri}
                                ref={(el) => {
                                  if (!rowRefs.current[i]) rowRefs.current[i] = []
                                  rowRefs.current[i][ri] = el
                                }}
                                style={{
                                  backgroundColor: highlightMap[i] === ri ? '#fff59d' : 'transparent',
                                  padding: '2px 4px',
                                  borderRadius: 4
                                }}
                              >
                                <span style={{ color: '#888' }}>{ri.toString().padStart(3, '0')}: </span>
                                {line}
                              </div>
                            ))}
                          </Paper>
                        )
                      )}
                    </Stack>
                  </Paper>
                ))}
              </Stack>
              {result?.inputs?.texts?.length > 0 && (
                <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
                  <Button variant="contained" onClick={rerunWithEdits} disabled={loading}>Re-run with edits</Button>
                </Stack>
              )}
            </Box>
          )}

          {notes.length > 0 && (
            <Box>
              <Divider sx={{ my: 1 }} />
              <Typography variant="subtitle1" gutterBottom>Findings ({notes.length} issues)</Typography>
              <Paper variant="outlined" sx={{ maxHeight: 400, overflow: 'auto' }}>
                <Stack spacing={0}>
                  {notes.map((n, idx) => {
                    const status = (n.issues?.[0]?.reasoning || '').toLowerCase().includes('review') ? 'review' : 'mismatch'
                    const bgColor = status === 'review' ? '#e8f5e9' : '#fff3e0'
                    return (
                      <Box
                        key={n.index}
                        onClick={() => goToFinding(n)}
                        sx={{
                          p: 2,
                          cursor: 'pointer',
                          backgroundColor: bgColor,
                          borderBottom: idx < notes.length - 1 ? '1px solid #e0e0e0' : 'none',
                          '&:hover': { backgroundColor: status === 'review' ? '#c8e6c9' : '#ffe0b2' }
                        }}
                      >
                        <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                          Row {n.index} • {status === 'review' ? 'Under Review' : 'Mismatch Detected'}
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 1, color: '#666' }}>{n.message}</Typography>
                        <Stack spacing={0.5}>
                          {(n.files || []).map((f: any) => {
                            // Find suspect probability for this file
                            const suspectProb = (n.suspects || []).find((s: any) => s.fileIndex === f.fileIndex)?.probability || 0
                            // High suspect probability = likely wrong (RED)
                            // Low suspect probability = likely correct/majority (YELLOW)
                            // All low probabilities = uncertain (GREEN)
                            const maxProb = Math.max(...(n.suspects || []).map((s: any) => s.probability || 0))
                            const isHighSuspect = suspectProb > 0.6
                            const isUncertain = maxProb <= 0.6
                            // CORRECTED: high suspect = RED, low suspect = YELLOW
                            const color = isUncertain ? '#4caf50' : (isHighSuspect ? '#f44336' : '#ffc107')
                            const label = isUncertain ? 'Under Review' : (isHighSuspect ? 'Suspect (Wrong - Minority)' : 'Correct (Majority)')
                            return (
                              <Paper key={f.fileIndex} variant="outlined" sx={{ p: 0.5, backgroundColor: color + '20', borderColor: color }}>
                                <Typography variant="caption" sx={{ display: 'block', fontWeight: 600, mb: 0.5, color: isHighSuspect ? '#d32f2f' : (isUncertain ? '#388e3c' : '#f57c00') }}>{label}</Typography>
                                <Typography variant="caption"><b>{f.fileName || 'File ' + f.fileIndex}</b> (row {f.row}): {f.text}</Typography>
                              </Paper>
                            )
                          })}
                          {(n.issues || []).map((iss: any, ix: number) => {
                            console.log('Issue data:', iss)
                            return (
                              <Box key={ix} sx={{ mt: 1, p: 1, backgroundColor: '#f5f5f5', borderRadius: 1 }}>
                                <Typography variant="caption" sx={{ fontWeight: 600, display: 'block', mb: 0.5 }}>AI Analysis:</Typography>
                                
                                {/* Main explanation */}
                                {(iss.reasoning || iss.comment) && (
                                  <Typography variant="caption" sx={{ display: 'block', mb: 0.5 }}>
                                    {iss.reasoning || iss.comment}
                                  </Typography>
                                )}
                                
                                {/* File diagnostics explanation */}
                                {iss.file_diagnostics?.error_explanation && (
                                  <Box sx={{ mt: 0.5, p: 0.5, backgroundColor: '#fff3e0', borderRadius: 0.5 }}>
                                    <Typography variant="caption" sx={{ fontWeight: 600, display: 'block' }}>Detailed Analysis:</Typography>
                                    <Typography variant="caption" sx={{ display: 'block', fontStyle: 'italic' }}>
                                      {iss.file_diagnostics.error_explanation}
                                    </Typography>
                                    {iss.file_diagnostics.majority_consensus && (
                                      <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: '#f57c00' }}>
                                        Majority: {iss.file_diagnostics.majority_consensus.join(', ')}
                                      </Typography>
                                    )}
                                    {iss.file_diagnostics.deviating_files && (
                                      <Typography variant="caption" sx={{ display: 'block', color: '#d32f2f' }}>
                                        Deviating: {iss.file_diagnostics.deviating_files.join(', ')}
                                      </Typography>
                                    )}
                                  </Box>
                                )}
                                
                                {/* Suggested fix */}
                                {iss.suggested_fix?.justification && (
                                  <Box sx={{ mt: 0.5, p: 0.5, backgroundColor: '#e3f2fd', borderRadius: 0.5 }}>
                                    <Typography variant="caption" sx={{ fontWeight: 600, display: 'block' }}>Suggested Fix:</Typography>
                                    <Typography variant="caption" sx={{ display: 'block' }}>{iss.suggested_fix.consistent_value}</Typography>
                                    <Typography variant="caption" sx={{ display: 'block', fontSize: 10, color: '#666', mt: 0.5 }}>
                                      {iss.suggested_fix.justification}
                                    </Typography>
                                  </Box>
                                )}
                                
                                {/* Detected values */}
                                {iss.values && Object.keys(iss.values).length > 0 && (
                                  <Box sx={{ mt: 0.5 }}>
                                    <Typography variant="caption" sx={{ fontWeight: 600, display: 'block' }}>Detected Values:</Typography>
                                    {Object.keys(iss.values).map((lang) => (
                                      <Typography key={lang} variant="caption" sx={{ display: 'block', color: '#555' }}>
                                        {lang}: {iss.values[lang]}
                                      </Typography>
                                    ))}
                                  </Box>
                                )}
                                
                                {/* Debug: show raw issue if no fields are displayed */}
                                {!iss.reasoning && !iss.comment && !iss.file_diagnostics && !iss.suggested_fix && !iss.values && (
                                  <Typography variant="caption" sx={{ display: 'block', color: '#999', fontFamily: 'monospace' }}>
                                    Raw: {JSON.stringify(iss).substring(0, 200)}
                                  </Typography>
                                )}
                              </Box>
                            )
                          })}
                        </Stack>
                      </Box>
                    )
                  })}
                </Stack>
              </Paper>
            </Box>
          )}

          <Box>
            <Divider sx={{ my: 1 }} />
            <Typography variant="subtitle1" gutterBottom>Logs</Typography>
            <Paper variant="outlined" sx={{ p: 1, maxHeight: 220, overflow: 'auto', fontFamily: 'monospace', fontSize: 12 }}>
              {(logs.length ? logs : (result?.logs || [])).map((line: string, i: number) => (
                <div key={i}>{line}</div>
              ))}
              <div ref={logEndRef} />
            </Paper>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  )
}


