import { useState } from 'react'
import { Alert, Box, Button, Stack, TextField, Typography } from '@mui/material'
import { emailPasswordSignIn, emailPasswordSignUp, signInWithGoogle } from '../services/firebase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const doEmailLogin = async () => {
    try {
      setError('')
      await emailPasswordSignIn(email, password)
    } catch (e: any) {
      setError(e?.message || 'Login failed')
    }
  }

  const doEmailSignup = async () => {
    try {
      setError('')
      await emailPasswordSignUp(email, password)
    } catch (e: any) {
      setError(e?.message || 'Signup failed')
    }
  }

  const doGoogle = async () => {
    try {
      setError('')
      await signInWithGoogle()
    } catch (e: any) {
      setError(e?.message || 'Google sign-in failed')
    }
  }

  return (
    <Box>
      <Stack spacing={2}>
        <Typography>Sign in to continue</Typography>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField label="Email" value={email} onChange={e => setEmail(e.target.value)} fullWidth />
        <TextField label="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} fullWidth />
        <Stack direction="row" spacing={2}>
          <Button variant="contained" onClick={doEmailLogin}>Login</Button>
          <Button variant="outlined" onClick={doEmailSignup}>Sign up</Button>
          <Button variant="text" onClick={doGoogle}>Google</Button>
        </Stack>
      </Stack>
    </Box>
  )
}


