import { useState } from 'react'
import { Alert, Box, Button, Card, CardContent, LinearProgress, Stack, Typography } from '@mui/material'
import api from '../services/api'

export default function Upload() {
  const [source, setSource] = useState<File | null>(null)
  const [target, setTarget] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<any>(null)

  const onAnalyze = async () => {
    if (!source || !target) {
      setError('Select both source and target files')
      return
    }
    setError('')
    setLoading(true)
    setResult(null)
    try {
      const data = new FormData()
      data.append('source', source)
      data.append('target', target)
      const res = await api.post('/api/analyze', data, { headers: { 'Content-Type': 'multipart/form-data' } })
      setResult(res.data)
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || 'Analysis failed')
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
          <Stack direction="row" spacing={2}>
            <Button variant="outlined" component="label">
              {source ? `Source: ${source.name}` : 'Select Source'}
              <input type="file" hidden onChange={(e) => setSource(e.target.files?.[0] || null)} />
            </Button>
            <Button variant="outlined" component="label">
              {target ? `Target: ${target.name}` : 'Select Target'}
              <input type="file" hidden onChange={(e) => setTarget(e.target.files?.[0] || null)} />
            </Button>
            <Button variant="contained" onClick={onAnalyze} disabled={loading}>Run</Button>
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
        </Stack>
      </CardContent>
    </Card>
  )
}


