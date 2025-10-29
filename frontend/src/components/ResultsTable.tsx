import { Table, TableBody, TableCell, TableHead, TableRow } from '@mui/material'

export default function ResultsTable({ rows }: { rows: any[] }) {
  return (
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell>#</TableCell>
          <TableCell>Source</TableCell>
          <TableCell>Target</TableCell>
          <TableCell>Similarity</TableCell>
          <TableCell>Mismatch</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.index} style={{ background: r.isMismatch ? 'rgba(255, 193, 7, 0.15)' : undefined }}>
            <TableCell>{r.index}</TableCell>
            <TableCell style={{ maxWidth: 360, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.source}</TableCell>
            <TableCell style={{ maxWidth: 360, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.target}</TableCell>
            <TableCell>{r.similarity}</TableCell>
            <TableCell>{r.isMismatch ? 'Yes' : 'No'}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}


