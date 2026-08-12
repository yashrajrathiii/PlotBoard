import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { UserRound } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

/**
 * Landing page for invite and password-reset links, and for anyone whose
 * profile is incomplete. Sets password (required on first visit) and
 * name + phone, then drops the user onto the board.
 */
export default function WelcomePage() {
  const { profile, refreshProfile } = useAuth()
  const navigate = useNavigate()

  const firstTime = !profile?.name.trim() || !profile?.phone.trim()

  const [name, setName] = useState(profile?.name ?? '')
  const [phone, setPhone] = useState(profile?.phone ?? '')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!/^[6-9]\d{9}$/.test(phone.trim())) {
      setError('Enter a valid 10-digit Indian mobile number (no +91).')
      return
    }
    if (firstTime || password) {
      if (password.length < 8) {
        setError('Password must be at least 8 characters.')
        return
      }
      if (password !== confirm) {
        setError('Passwords do not match.')
        return
      }
    }

    setBusy(true)
    if (firstTime || password) {
      const { error: pwError } = await supabase.auth.updateUser({ password })
      if (pwError) {
        setError(pwError.message)
        setBusy(false)
        return
      }
    }
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ name: name.trim(), phone: phone.trim() })
      .eq('id', profile!.id)
    if (profileError) {
      setError(profileError.message)
      setBusy(false)
      return
    }
    await refreshProfile()
    setBusy(false)
    navigate('/', { replace: true })
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-6">
          <span className="bg-emerald-600 text-white rounded-xl p-2">
            <UserRound size={24} />
          </span>
          <h1 className="text-2xl font-bold text-gray-900">
            {firstTime ? 'Welcome to LD Board' : 'Your profile'}
          </h1>
        </div>

        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-4"
        >
          {firstTime && (
            <p className="text-sm text-gray-600">
              Set your password and details to finish joining. Your name and
              phone are shown to other members as the contact on your listings.
            </p>
          )}

          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              Full name
            </label>
            <input
              id="name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
              Mobile number
            </label>
            <input
              id="phone"
              type="tel"
              inputMode="numeric"
              required
              placeholder="10-digit mobile"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label htmlFor="new-password" className="block text-sm font-medium text-gray-700 mb-1">
              {firstTime ? 'Set password' : 'New password (leave blank to keep current)'}
            </label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              required={firstTime}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          {(firstTime || password.length > 0) && (
            <div>
              <label htmlFor="confirm" className="block text-sm font-medium text-gray-700 mb-1">
                Confirm password
              </label>
              <input
                id="confirm"
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-medium rounded-lg py-2.5"
          >
            {busy ? 'Saving…' : firstTime ? 'Finish & open the board' : 'Save changes'}
          </button>
        </form>
      </div>
    </div>
  )
}
