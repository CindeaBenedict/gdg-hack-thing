import { useEffect, useState } from 'react'
import { AppBar, Box, Button, Container, Tab, Tabs, Toolbar, Typography } from '@mui/material'
import Login from './components/Login'
import Upload from './components/Upload'
import Dashboard from './components/Dashboard'
import { logout, onAuth } from './services/firebase'

type View = 'upload' | 'dashboard'

export default function App() {
  const [user, setUser] = useState<any>(null)
  const [view, setView] = useState<View>('upload')

  useEffect(() => {
    const unsub = onAuth(setUser)
    return () => unsub()
  }, [])

  if (!user) {
    return (
      <Container maxWidth="sm" sx={{ mt: 6 }}>
        <Typography variant="h4" gutterBottom>ClauseMatch++</Typography>
        <Login />
      </Container>
    )
  }

  return (
    <Box>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            ClauseMatch++
          </Typography>
          <Button color="inherit" onClick={() => logout()}>Logout</Button>
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


