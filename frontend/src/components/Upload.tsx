import { useEffect, useRef, useState } from 'react'
import { Alert, Box, Button, Card, CardContent, Chip, Divider, LinearProgress, Paper, Stack, Typography } from '@mui/material'
import api from '../services/api'

export default function Upload() {
  const [files, setFiles] = useState<File[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<any>(null)
  const [notes, setNotes] = useState<any[]>([])
  const [logs, setLogs] = useState<string[]>([])
  const logEndRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [logs])

  const onAnalyze = async () => {
    if (files.length < 2) {
      setError('Select at least two files')
      return
    }
    setError('')
    setLoading(true)
    setResult(null)
    setNotes([])
    setLogs((l) => [...l, `Starting analysis for ${files.length} files`])
    try {
      const sel = files.slice(0, 2)
      const fd = new FormData()
      sel.forEach((f) => fd.append('files', f, f.name))
      const res = await api.post('/analyze', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setResult(res.data)
      const boxes = (res.data?.boxes || []) as any[]
      const pretty = boxes.map((b) => ({
        index: b.row,
        message: (b.issues?.[0]?.comment) || 'Potential inconsistency',
        files: b.files,
        suspects: b.suspects || []
      }))
      setNotes(pretty)
      setLogs((l) => [...l, ...(res.data?.logs || [])])
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || 'Analysis failed')
      setLogs((l) => [...l, 'Error: ' + (e?.message || 'unknown')])
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
              {files.length ? `${files.length} files selected` : 'Select files'}
              <input type="file" hidden multiple onChange={(e) => setFiles(Array.from(e.target.files || []))} />
            </Button>
            <Button variant="contained" onClick={onAnalyze} disabled={loading}>Run</Button>
            {files.length > 0 && <Chip label={`${files.length} selected`} />}
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
                {result.inputs.texts.map((t: string, i: number) => (
                  <Paper key={i} variant="outlined" sx={{ p: 1 }}>
                    <Stack spacing={0.5}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {result.inputs.names?.[i] || `File ${i+1}`} {result.inputs.kinds?.[i] ? `(${result.inputs.kinds[i]})` : ''}
                      </Typography>
                      <Paper variant="outlined" sx={{ p: 1, maxHeight: 200, overflow: 'auto', fontFamily: 'monospace', fontSize: 12, whiteSpace: 'pre-wrap' }}>
                        {t}
                      </Paper>
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            </Box>
          )}

          {notes.length > 0 && (
            <Box>
              <Divider sx={{ my: 1 }} />
              <Typography variant="subtitle1" gutterBottom>Findings</Typography>
              <Stack spacing={1}>
                {notes.map(n => (
                  <Alert key={n.index} severity="warning">
                    <strong>Row {n.index}:</strong> {n.message}
                    <Stack spacing={0.5} sx={{ mt: 1 }}>
                      {(n.files || []).map((f: any) => (
                        <div key={f.fileIndex}><b>{f.fileName || `File ${f.fileIndex}`}</b> row {f.row}: {f.text}</div>
                      ))}
                      {(n.issues || []).map((iss: any, ix: number) => (
                        <div key={ix}>
                          <b>Issue:</b> {iss.type} — {iss.comment}
                          {iss.values && (
                            <div>
                              {Object.keys(iss.values).map((lang) => (
                                <div key={lang}>{lang}: {iss.values[lang]}</div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                      {(n.suspects || []).length > 0 && (
                        <div><b>Suspect probabilities:</b> {(n.suspects || []).map((s: any) => `${s.fileIndex}: ${Math.round((s.probability || 0)*100)}%`).join(', ')}</div>
                      )}
                    </Stack>
                  </Alert>
                ))}
              </Stack>
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


