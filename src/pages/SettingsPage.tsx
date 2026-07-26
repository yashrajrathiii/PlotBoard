import { useEffect, useState, type FormEvent } from 'react'
import {
  ChevronRight,
  KeyRound,
  LogOut,
  MonitorSmartphone,
  UserRound,
  type LucideIcon,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth, type DeviceRow } from '../context/AuthContext'
import { getDeviceId } from '../lib/device'
import { timeAgo } from '../lib/format'
import BackButton from '../components/BackButton'

type Section = 'details' | 'account' | 'devices'

const SECTIONS: { id: Section; label: string; sub: string; icon: LucideIcon }[] = [
  { id: 'details', label: 'Details', sub: 'Name & phone shown on your listings', icon: UserRound },
  { id: 'account', label: 'Account', sub: 'Email & password', icon: KeyRound },
  { id: 'devices', label: 'Devices', sub: 'Manage signed-in devices (max 2)', icon: MonitorSmartphone },
]

/**
 * Settings as a real page (not a modal) so the bottom tab bar stays visible.
 * Mobile: an Instagram-style list of section rows; tapping one drills into that
 * section with a back arrow. Desktop: a two-pane list + content layout.
 */
export default function SettingsPage() {
  const [active, setActive] = useState<Section | null>(null)
  const { signOut } = useAuth()

  const sectionContent = (id: Section) =>
    id === 'details' ? <DetailsSection /> : id === 'account' ? <AccountSection /> : <DevicesSection />

  const activeLabel = active ? SECTIONS.find((s) => s.id === active)!.label : 'Settings'

  return (
    <div className="max-w-2xl mx-auto p-4">
      {/* ---------- Mobile: row list → drill into a section ---------- */}
      <div className="sm:hidden">
        {active === null ? (
          <>
            <div className="flex items-center gap-3 mb-4">
              <BackButton to="/" label="Back to home" />
              <h1 className="text-lg font-semibold text-gray-900">Settings</h1>
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
              {SECTIONS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setActive(s.id)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-gray-50"
                >
                  <s.icon size={20} className="text-gray-500 shrink-0" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-gray-900">{s.label}</span>
                    <span className="block text-xs text-gray-500">{s.sub}</span>
                  </span>
                  <ChevronRight size={18} className="text-gray-400 shrink-0" />
                </button>
              ))}
            </div>
            <button
              onClick={() => void signOut()}
              className="mt-4 w-full flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white py-3.5 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              <LogOut size={16} /> Sign out
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-4">
              <BackButton onClick={() => setActive(null)} label="Back to settings" />
              <h1 className="text-lg font-semibold text-gray-900">{activeLabel}</h1>
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              {sectionContent(active)}
            </div>
          </>
        )}
      </div>

      {/* ---------- Desktop: two-pane ---------- */}
      <div className="hidden sm:block">
        <h1 className="text-lg font-semibold text-gray-900 mb-4">Settings</h1>
        <div className="flex gap-4">
          <div className="w-56 shrink-0 self-start bg-white rounded-2xl border border-gray-200 p-3 flex flex-col">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => setActive(s.id)}
                className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm ${
                  (active ?? 'details') === s.id
                    ? 'bg-emerald-50 text-emerald-700 font-medium'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <s.icon size={16} /> {s.label}
              </button>
            ))}
            <div className="mt-2 pt-2 border-t border-gray-200">
              <button
                onClick={() => void signOut()}
                className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50"
              >
                <LogOut size={16} /> Sign out
              </button>
            </div>
          </div>
          <div className="flex-1 bg-white rounded-2xl border border-gray-200 p-5">
            {sectionContent(active ?? 'details')}
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
                <p className="text-xs text-gray-500">Last active {timeAgo(d.last_seen)}</p>
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
