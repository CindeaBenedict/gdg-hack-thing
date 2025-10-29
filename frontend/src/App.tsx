import { useState } from 'react'
import { AppBar, Box, Container, Tab, Tabs, Toolbar, Typography } from '@mui/material'
import Upload from './components/Upload'
import Dashboard from './components/Dashboard'

type View = 'upload' | 'dashboard'

export default function App() {
  const [view, setView] = useState<View>('upload')

  return (
    <Box>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            ClauseMatch++ AI Document Consistency Checker
          </Typography>
        </Toolbar>
      </AppBar>
      <Container maxWidth="lg" sx={{ mt: 3 }}>
        <Tabs value={view} onChange={(_, v) => setView(v)}>
          <Tab value="upload" label="Analyze" />
          <Tab value="dashboard" label="Dashboard" />
        </Tabs>
        <Box sx={{ mt: 3 }}>
          {view === 'upload' && <Upload />}
          {view === 'dashboard' && <Dashboard />}
        </Box>
      </Container>
    </Box>
  )
}


