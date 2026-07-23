import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import {
  KeyRound,
  LogOut,
  MonitorSmartphone,
  UserRound,
  X,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth, type DeviceRow } from '../context/AuthContext'
import { getDeviceId } from '../lib/device'
import { timeAgo } from '../lib/format'

type Section = 'details' | 'account' | 'devices'

/**
 * Claude-style settings popup: dark overlay, panel with a section list on the
 * left and the active section's content on the right. Full-screen on phones.
 */
export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const [section, setSection] = useState<Section>('details')
  const { signOut } = useAuth()

  // Escape closes, and the page behind must not scroll while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  const sectionButton = (id: Section, icon: ReactNode, label: string) => (
    <button
      onClick={() => setSection(id)}
      className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm ${
        section === id
          ? 'bg-emerald-50 text-emerald-700 font-medium'
          : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      {icon} {label}
    </button>
  )

  return (
    <div
      className="fixed inset-0 z-[1200] bg-black/50 flex items-center justify-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="bg-white w-full h-full sm:h-[560px] sm:max-w-2xl sm:rounded-2xl shadow-xl flex flex-col sm:flex-row overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
      >
        {/* Section list, with sign-out pinned at the bottom */}
        <div className="sm:w-48 shrink-0 border-b sm:border-b-0 sm:border-r border-gray-200 p-3 flex flex-col">
          <p className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">
            Settings
          </p>
          <div className="flex sm:flex-col gap-1">
            {sectionButton('details', <UserRound size={16} />, 'Details')}
            {sectionButton('account', <KeyRound size={16} />, 'Account')}
            {sectionButton('devices', <MonitorSmartphone size={16} />, 'Devices')}
          </div>
          <div className="sm:mt-auto pt-2 sm:border-t sm:border-gray-200">
            <button
              onClick={() => void signOut()}
              className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              <LogOut size={16} /> Sign out
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="flex items-center justify-between px-5 pt-4">
            <h2 className="text-lg font-semibold text-gray-900">
              {section === 'details' ? 'Details' : section === 'account' ? 'Account' : 'Devices'}
            </h2>
            <button
              onClick={onClose}
              aria-label="Close settings"
              className="text-gray-400 hover:text-gray-600 p-1"
            >
              <X size={20} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-5 pt-3">
            {section === 'details' ? (
              <DetailsSection />
            ) : section === 'account' ? (
              <AccountSection />
            ) : (
              <DevicesSection />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function DetailsSection() {
  const { profile, refreshProfile } = useAuth()
  const [name, setName] = useState(profile?.name ?? '')
  const [phone, setPhone] = useState(profile?.phone ?? '')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setMessage(null)
    if (!name.trim()) {
      setMessage({ ok: false, text: 'Name is required.' })
      return
    }
    if (!/^[6-9]\d{9}$/.test(phone.trim())) {
      setMessage({ ok: false, text: 'Enter a valid 10-digit Indian mobile number.' })
      return
    }
    setBusy(true)
    const { error } = await supabase
      .from('profiles')
      .update({ name: name.trim(), phone: phone.trim() })
      .eq('id', profile!.id)
    setBusy(false)
    if (error) setMessage({ ok: false, text: error.message })
    else {
      setMessage({ ok: true, text: 'Details saved.' })
      await refreshProfile()
    }
  }

  return (
    <form onSubmit={(e) => void save(e)} className="space-y-4">
      <p className="text-sm text-gray-600">
        Shown to other members as the contact on your listings.
      </p>
      <div>
        <label htmlFor="settings-name" className="block text-sm font-medium text-gray-700 mb-1">
          Full name
        </label>
        <input
          id="settings-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>
      <div>
        <label htmlFor="settings-phone" className="block text-sm font-medium text-gray-700 mb-1">
          Mobile number
        </label>
        <input
          id="settings-phone"
          type="tel"
          inputMode="numeric"
          placeholder="10-digit mobile"
          value={phone}
          onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>
      {message && (
        <p className={`text-sm ${message.ok ? 'text-emerald-700' : 'text-red-600'}`}>
          {message.text}
        </p>
      )}
      <button
        type="submit"
        disabled={busy}
        className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-4 py-2"
      >
        {busy ? 'Saving…' : 'Save details'}
      </button>
    </form>
  )
}

function AccountSection() {
  const { session } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const changePassword = async (e: FormEvent) => {
    e.preventDefault()
    setMessage(null)
    if (password.length < 8) {
      setMessage({ ok: false, text: 'Password must be at least 8 characters.' })
      return
    }
    if (password !== confirm) {
      setMessage({ ok: false, text: 'Passwords do not match.' })
      return
    }
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) setMessage({ ok: false, text: error.message })
    else {
      setMessage({ ok: true, text: 'Password updated.' })
      setPassword('')
      setConfirm('')
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-gray-700 mb-1">Email</p>
        <p className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">
          {session?.user.email}
        </p>
        <p className="text-xs text-gray-400 mt-1">
          Your login email. Name and phone are edited in the Details section.
        </p>
      </div>

      <form onSubmit={(e) => void changePassword(e)} className="space-y-3">
        <p className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
          <KeyRound size={15} className="text-gray-400" /> Change password
        </p>
        <input
          type="password"
          placeholder="New password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <input
          type="password"
          placeholder="Confirm new password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        {message && (
          <p className={`text-sm ${message.ok ? 'text-emerald-700' : 'text-red-600'}`}>
            {message.text}
          </p>
        )}
        <button
          type="submit"
          disabled={busy || !password}
          className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-4 py-2"
        >
          {busy ? 'Saving…' : 'Update password'}
        </button>
      </form>
    </div>
  )
}

function DevicesSection() {
  const { session } = useAuth()
  const [devices, setDevices] = useState<DeviceRow[]>([])
  const [loading, setLoading] = useState(true)
  const currentId = getDeviceId()

  const load = async () => {
    const { data } = await supabase
      .from('user_devices')
      .select('*')
      .order('last_seen', { ascending: false })
    setDevices(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  const remove = async (device: DeviceRow) => {
    await supabase
      .from('user_devices')
      .delete()
      .eq('user_id', session!.user.id)
      .eq('device_id', device.device_id)
    void load()
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">
        You can be signed in on a maximum of 2 devices. Removing a device signs
        it out within a minute.
      </p>
      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : (
        devices.map((d) => {
          const isThis = d.device_id === currentId
          return (
            <div
              key={d.device_id}
              className="flex items-center justify-between gap-3 border border-gray-200 rounded-xl p-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {d.device_name}
                  {isThis && (
                    <span className="ml-2 text-[11px] bg-emerald-100 text-emerald-700 rounded-full px-2 py-0.5">
                      This device
                    </span>
                  )}
                </p>
                <p className="text-xs text-gray-500">
                  Last active {timeAgo(d.last_seen)}
                </p>
              </div>
              {!isThis && (
                <button
                  onClick={() => void remove(d)}
                  className="shrink-0 text-sm text-red-600 hover:text-red-700 font-medium"
                >
                  Remove
                </button>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
