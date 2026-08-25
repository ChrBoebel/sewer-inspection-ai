'use client'

import Image from 'next/image'
import { useState, type FormEvent } from 'react'
import { USERS, type User } from '@/app/_lib/inspection-types'

export default function LoginScreen({ onLogin }: { onLogin: (user: User) => void }) {
  const [id, setId] = useState('MW-001')
  const [password, setPassword] = useState('123456')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    setLoading(true)
    window.setTimeout(() => {
      const match = USERS.find(user => user.id === id.trim().toUpperCase() && user.password === password)
      if (!match) {
        setError('Mitarbeiter-ID oder Passwort ungültig.')
        setLoading(false)
        return
      }
      onLogin({ id: match.id, name: match.name, initials: match.initials, role: match.role })
    }, 250)
  }

  return (
    <div className="login-overlay">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-brand">
          <Image
            src="/logo-placeholder.svg"
            alt="SewerScan"
            width={52}
            height={38}
            priority
            unoptimized
            style={{ objectFit: 'contain', objectPosition: 'center' }}
          />
          <div>
            <strong>SewerScan</strong>
            <span>KANALINSPEKTION · KI</span>
          </div>
        </div>
        <h1>Anmelden</h1>
        <p>Demo-Zugang: MW-001 / 123456</p>
        <label>
          <span>Mitarbeiter-ID</span>
          <input value={id} onChange={event => { setId(event.target.value); setError('') }} placeholder="MW-001" autoComplete="username" />
        </label>
        <label>
          <span>Passwort</span>
          <input value={password} onChange={event => { setPassword(event.target.value); setError('') }} placeholder="123456" type="password" autoComplete="current-password" />
        </label>
        {error && <div className="login-error">{error}</div>}
        <button className="btn primary" disabled={!id || !password || loading} type="submit">
          {loading ? 'Wird geprüft...' : 'Anmelden'}
        </button>
      </form>
    </div>
  )
}
