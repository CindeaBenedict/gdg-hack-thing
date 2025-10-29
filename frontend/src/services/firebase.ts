import { initializeApp } from 'firebase/app'
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from 'firebase/auth'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string,
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const googleProvider = new GoogleAuthProvider()

const AUTH_DISABLED = (import.meta as any).env.VITE_DISABLE_AUTH === '1'
export const authDisabled = AUTH_DISABLED

export async function signInWithGoogle() {
  if (AUTH_DISABLED) {
    window.location.reload()
    return
  }
  await signInWithPopup(auth, googleProvider)
}

export async function emailPasswordSignIn(email: string, password: string) {
  if (AUTH_DISABLED) {
    window.location.reload()
    return
  }
  return signInWithEmailAndPassword(auth, email, password)
}

export async function emailPasswordSignUp(email: string, password: string) {
  if (AUTH_DISABLED) {
    window.location.reload()
    return
  }
  return createUserWithEmailAndPassword(auth, email, password)
}

export async function logout() {
  if (AUTH_DISABLED) return
  return signOut(auth)
}

export function onAuth(cb: (u: any) => void) {
  if (AUTH_DISABLED) {
    const user = { uid: 'dev-user', email: 'dev@local' }
    cb(user)
    return () => {}
  }
  return onAuthStateChanged(auth, cb)
}


