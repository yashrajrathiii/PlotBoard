import { useState } from 'react'
import { MonitorSmartphone, LogOut } from 'lucide-react'
import { useAuth, type DeviceRow } from '../context/AuthContext'
import { timeAgo } from '../lib/format'

/**
 * Shown when both device slots are taken. The user picks one existing device
 * to sign out; this device then takes its slot.
 */
export default function DeviceLimitScreen() {
  const { activeDevices, evictAndRegister, signOut } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleEvict = async (device: DeviceRow) => {
    setBusy(true)
    setError(null)
    const err = await evictAndRegister(device)
    if (err) setError(err)
    setBusy(false)
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-2">
          <MonitorSmartphone className="text-emerald-600" size={28} />
          <h1 className="text-lg font-semibold text-gray-900">Device limit reached</h1>
        </div>
        <p className="text-sm text-gray-600 mb-5">
          Your account is already signed in on 2 devices. To use this device,
          sign out one of them:
        </p>

        <div className="space-y-3">
          {activeDevices.map((d) => (
            <div
              key={d.device_id}
              className="flex items-center justify-between gap-3 border border-gray-200 rounded-xl p-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{d.device_name}</p>
                <p className="text-xs text-gray-500">Last active {timeAgo(d.last_seen)}</p>
              </div>
              <button
                onClick={() => void handleEvict(d)}
                disabled={busy}
                className="shrink-0 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg px-3 py-2"
              >
                Sign it out
              </button>
            </div>
          ))}
        </div>

        {error && <p className="text-sm text-red-600 mt-4">{error}</p>}

        <button
          onClick={() => void signOut()}
          disabled={busy}
          className="mt-6 w-full flex items-center justify-center gap-2 text-sm text-gray-600 hover:text-gray-900 py-2"
        >
          <LogOut size={16} /> Cancel and sign out here instead
        </button>
      </div>
    </div>
  )
}
