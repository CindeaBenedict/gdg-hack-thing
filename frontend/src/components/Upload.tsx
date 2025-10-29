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
      const data = new FormData()
      files.forEach(f => data.append('files', f))
      const res = await api.post('/api/analyze', data, { headers: { 'Content-Type': 'multipart/form-data' } })
      setResult(res.data)
      const rows = (res.data?.pairs || []) as any[]
      const mismatches = rows.filter(r => r.isMismatch)
      const pretty = mismatches.map(r => {
        const issues = r.ai?.issues || []
        const msg = issues.length ? (issues[0]?.comment || 'Potential inconsistency') : `Similarity ${r.similarity}`
        return { index: r.index, message: msg, source: r.source, target: r.target }
      })
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

          {notes.length > 0 && (
            <Box>
              <Divider sx={{ my: 1 }} />
              <Typography variant="subtitle1" gutterBottom>Findings</Typography>
              <Stack spacing={1}>
                {notes.map(n => (
                  <Alert key={n.index} severity="warning">
                    <strong>Pair {n.index}:</strong> {n.message}
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


