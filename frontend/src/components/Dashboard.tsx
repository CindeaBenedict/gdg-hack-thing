import { useEffect, useState } from 'react'
import { Alert, Box, Card, CardContent, Chip, CircularProgress, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material'
import api from '../services/api'
import ResultsTable from './ResultsTable'

type Report = {
  projectId: string
  createdAt: number
  filenames: { source: string; target: string }
  summary: { total: number; mismatches: number; avgSimilarity: number }
}

export default function Dashboard() {
  const [items, setItems] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<any>(null)

  const load = async () => {
    setError('')
    setLoading(true)
    try {
      const store = JSON.parse(localStorage.getItem('cm_reports') || '[]')
      setItems(store)
    } catch (e: any) {
      setError(e?.message || 'Failed to load reports')
    } finally {
      setLoading(false)
    }
  }

  const loadOne = async (projectId: string) => {
    setError('')
    setSelected(null)
    try {
      const store = JSON.parse(localStorage.getItem('cm_reports') || '[]')
      const one = store.find((x: any) => x.projectId === projectId)
      setSelected(one?.full || null)
    } catch (e: any) {
      setError(e?.message || 'Failed to load result')
    }
  }

  useEffect(() => { load() }, [])

  return (
    <Stack spacing={2}>
      {loading && <CircularProgress />}
      {error && <Alert severity="error">{error}</Alert>}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>Recent Reports</Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Created</TableCell>
                <TableCell>Source</TableCell>
                <TableCell>Target</TableCell>
                <TableCell>Summary</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map(r => (
                <TableRow key={r.projectId} hover onClick={() => loadOne(r.projectId)} style={{ cursor: 'pointer' }}>
                  <TableCell>{new Date(r.createdAt * 1000).toLocaleString()}</TableCell>
                  <TableCell>{(r as any).filenames?.source}</TableCell>
                  <TableCell>{(r as any).filenames?.target}</TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={1}>
                      <Chip size="small" label={`total ${r.summary?.total ?? 0}`} />
                      <Chip size="small" color={(r.summary?.mismatches ?? 0) > 0 ? 'warning' : 'success'} label={`mismatch ${r.summary?.mismatches ?? 0}`} />
                      <Chip size="small" label={`avg ${r.summary?.avgSimilarity ?? 0}`} />
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {selected && (
        <Box>
          <Typography variant="h6" gutterBottom>Results: {selected.projectId}</Typography>
          <ResultsTable rows={selected.pairs || []} />
        </Box>
      )}
    </Stack>
  )
}


