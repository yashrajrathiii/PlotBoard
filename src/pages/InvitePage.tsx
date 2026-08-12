import { useEffect, useState, type FormEvent } from 'react'
import { AlertTriangle, Check, Copy, Link2, Send, Trash2, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { copyText, whatsappShareUrl } from '../lib/share'
import { appUrl } from '../lib/appUrl'
import ConfirmDialog from '../components/ConfirmDialog'

interface Member {
  id: string
  name: string
  phone: string
  is_admin: boolean
  created_at: string
  email: string | null
  joined: boolean
}

const EMAIL_RE = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/

interface FnError extends Error {
  code?: string
}

async function callFn(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('invite-user', { body })
  if (error) {
    // `error.context` is a Response only for HTTP errors. For a
    // FunctionsFetchError (network down, CORS, function not deployed) it's a
    // plain Error with no .json method — calling it there throws a TypeError
    // that masks the real cause, so check before using it.
    const ctx = (error as { context?: unknown }).context
    let errBody: { error?: string; code?: string } | null = null
    if (ctx && typeof (ctx as Response).json === 'function') {
      errBody = await (ctx as Response).json().catch(() => null)
    }
    // The platform's own JWT rejection returns {code, message} with no `error`
    // key, so fall back through message before the generic supabase text.
    const message =
      errBody?.error ??
      (errBody as { message?: string } | null)?.message ??
      error.message
    const e = new Error(message) as FnError
    e.code = errBody?.code

    // A dead session must not present as a page-level failure. Sign out so
    // the route guard sends the user to /login, instead of leaving them on a
    // healthy-looking Invites page where every action silently 401s.
    const status = (ctx as Response | undefined)?.status
    if (status === 401 || e.code === 'session_expired') {
      void supabase.auth.signOut()
    }
    throw e
  }
  return data
}

/** Admin-only: invite members and manage the member/invite list. */
export default function InvitePage() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState<'email' | 'link' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [alreadyInvited, setAlreadyInvited] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [inviteLink, setInviteLink] = useState<{ email: string; url: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [members, setMembers] = useState<Member[]>([])
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [pendingRemoval, setPendingRemoval] = useState<Member | null>(null)
  const [degraded, setDegraded] = useState<string | null>(null)

  const loadMembers = async () => {
    try {
      const data = await callFn({ action: 'list' })
      setMembers((data.members ?? []) as Member[])
      setDegraded(null)
    } catch (err) {
      // Fall back to what the client can read directly (no emails / joined
      // status) — but SAY SO. Silently rendering a healthy-looking list here
      // is what made the invite failure so hard to diagnose: the page looked
      // fine while every function call was failing.
      const reason = err instanceof Error ? err.message : String(err)
      console.error('invite-user "list" failed:', err)
      const { data } = await supabase
        .from('profiles')
        .select('id, name, phone, is_admin, created_at')
        .order('created_at', { ascending: true })
      setMembers(
        (data ?? []).map((p) => ({ ...p, email: null, joined: false }) as Member),
      )
      setDegraded(reason)
    }
  }

  useEffect(() => {
    void loadMembers()
  }, [])

  const reset = () => {
    setError(null)
    setAlreadyInvited(false)
    setSuccess(null)
    setInviteLink(null)
    setCopied(false)
  }

  const handleEmailInvite = async (e: FormEvent) => {
    e.preventDefault()
    reset()
    if (!EMAIL_RE.test(email.trim())) {
      setError('Enter a valid email address (no spaces or commas).')
      return
    }
    setBusy('email')
    try {
      const data = await callFn({
        action: 'invite',
        email: email.trim(),
        redirectTo: appUrl('/welcome'),
      })
      if (data.link) {
        // Already invited: the function returned a fresh shareable link rather
        // than dead-ending, so show it exactly like the WhatsApp-link flow.
        setInviteLink({ email: data.user.email, url: data.link })
        setSuccess(data.notice ?? 'This email was already invited — share the link below.')
      } else {
        setSuccess(`Invite email sent to ${data.user.email}.`)
        setEmail('')
      }
      void loadMembers()
    } catch (err) {
      const e = err as FnError
      setError(e.message)
      if (e.code === 'already_registered') setAlreadyInvited(true)
    }
    setBusy(null)
  }

  const handleLinkInvite = async () => {
    reset()
    if (!EMAIL_RE.test(email.trim())) {
      setError('Enter a valid email address (no spaces or commas).')
      return
    }
    setBusy('link')
    try {
      const data = await callFn({
        action: 'link',
        email: email.trim(),
        redirectTo: appUrl('/welcome'),
      })
      if (data.link) setInviteLink({ email: data.user.email, url: data.link })
      void loadMembers()
    } catch (err) {
      setError((err as FnError).message)
    }
    setBusy(null)
  }

  // Confirmed in-app: window.confirm/alert are suppressed in installed PWAs,
  // which silently turned this into a no-op.
  const handleRemove = async () => {
    const m = pendingRemoval
    if (!m) return
    setRemovingId(m.id)
    setError(null)
    try {
      await callFn({ action: 'delete', userId: m.id })
      setPendingRemoval(null)
      await loadMembers()
    } catch (err) {
      setError((err as FnError).message)
      setPendingRemoval(null)
    }
    setRemovingId(null)
  }

  const whatsappMessage = (link: { email: string; url: string }) =>
    `You're invited to join *LD Board* — our shared property listing board.\n` +
    `Tap this link to create your account (${link.email}):\n${link.url}`

  return (
    <div className="max-w-lg mx-auto p-4 space-y-6">
      <form
        onSubmit={(e) => void handleEmailInvite(e)}
        className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 space-y-3"
      >
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <Send size={18} className="text-emerald-600" /> Invite a member
        </h2>
        <p className="text-sm text-gray-600">
          Enter their email, then either send the invite by email or create a
          link you can share on WhatsApp. Sign-ups without an invite are
          disabled.
        </p>
        <input
          type="email"
          required
          placeholder="broker@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={busy !== null}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-3 py-2.5"
          >
            {busy === 'email' ? 'Sending…' : 'Send email invite'}
          </button>
          <button
            type="button"
            onClick={() => void handleLinkInvite()}
            disabled={busy !== null}
            className="flex-1 flex items-center justify-center gap-1.5 border border-emerald-600 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 text-sm font-medium rounded-lg px-3 py-2.5"
          >
            <Link2 size={15} />
            {busy === 'link' ? 'Creating…' : 'Get WhatsApp link'}
          </button>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {alreadyInvited && (
          <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
            This email is already in the list below. If they never got the
            invite, tap <span className="font-medium">Get WhatsApp link</span> to
            resend it, or <span className="font-medium">Cancel invite</span> below
            and try again with the correct address.
          </p>
        )}
        {success && <p className="text-sm text-emerald-700">{success}</p>}

        {inviteLink && (
          <div className="border border-emerald-200 bg-emerald-50 rounded-xl p-3 space-y-2.5">
            <p className="text-sm text-emerald-900">
              Invite link for <span className="font-medium">{inviteLink.email}</span> —
              share it only with them. It lands them straight on the sign-up
              page and expires after first use / 24 hours.
            </p>
            <p className="text-xs text-emerald-800/70 break-all bg-white rounded-lg border border-emerald-100 p-2">
              {inviteLink.url}
            </p>
            <div className="flex gap-2">
              <a
                href={whatsappShareUrl(whatsappMessage(inviteLink))}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 text-center bg-[#25D366] hover:brightness-95 text-white text-sm font-medium rounded-lg px-3 py-2"
              >
                Share on WhatsApp
              </a>
              <button
                type="button"
                onClick={() => {
                  void copyText(inviteLink.url).then((ok) => setCopied(ok))
                }}
                className="flex items-center justify-center gap-1.5 border border-gray-300 bg-white hover:bg-gray-50 text-sm font-medium text-gray-700 rounded-lg px-3 py-2"
              >
                {copied ? (
                  <>
                    <Check size={14} className="text-emerald-600" /> Copied
                  </>
                ) : (
                  <>
                    <Copy size={14} /> Copy link
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </form>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2 mb-3">
          <Users size={18} className="text-emerald-600" /> Members ({members.length})
        </h2>

        {degraded && (
          <div className="mb-3 flex gap-2 text-xs text-red-900 bg-red-50 border border-red-200 rounded-lg p-2.5">
            <AlertTriangle size={14} className="shrink-0 mt-0.5 text-red-600" />
            <span>
              <span className="font-medium">
                Couldn't reach the invite service — showing a limited list.
              </span>{' '}
              Emails and joined/invited status are unavailable, and inviting or
              removing members will fail until this is resolved.
              <span className="block mt-1 font-mono break-all opacity-80">{degraded}</span>
            </span>
          </div>
        )}

        <ul className="divide-y divide-gray-100">
          {members.map((m) => (
            <li key={m.id} className="py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate flex items-center gap-2">
                  {m.name.trim() || m.email || 'Invited member'}
                  {m.is_admin && (
                    <span className="text-xs bg-emerald-100 text-emerald-700 rounded-full px-2 py-0.5">
                      admin
                    </span>
                  )}
                  {!m.is_admin && (
                    <span
                      className={`text-[11px] rounded-full px-2 py-0.5 ${
                        m.joined
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      {m.joined ? 'joined' : 'invited'}
                    </span>
                  )}
                </p>
                {/* Show the email (and phone if joined) so pending/wrong
                    invites are identifiable. */}
                {m.email && (
                  <p className="text-xs text-gray-500 truncate">{m.email}</p>
                )}
                {m.phone && <p className="text-xs text-gray-400">{m.phone}</p>}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs text-gray-400">
                  {new Date(m.created_at).toLocaleDateString('en-IN')}
                </span>
                {!m.is_admin && (
                  <button
                    onClick={() => setPendingRemoval(m)}
                    disabled={removingId === m.id}
                    title={m.joined ? 'Remove member' : 'Cancel invite'}
                    className="flex items-center gap-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 rounded-lg px-2 py-1.5"
                  >
                    <Trash2 size={13} />
                    {removingId === m.id
                      ? '…'
                      : m.joined
                        ? 'Remove'
                        : 'Cancel invite'}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>

      <ConfirmDialog
        open={pendingRemoval !== null}
        destructive
        busy={removingId !== null}
        title={pendingRemoval?.joined ? 'Remove this member?' : 'Cancel this invite?'}
        message={
          pendingRemoval
            ? `${pendingRemoval.email || pendingRemoval.name || 'This person'} will lose access${
                pendingRemoval.joined ? '' : ' and the pending invite will be revoked'
              }. This cannot be undone.`
            : undefined
        }
        confirmLabel={pendingRemoval?.joined ? 'Remove' : 'Cancel invite'}
        cancelLabel="Keep"
        onConfirm={() => void handleRemove()}
        onCancel={() => setPendingRemoval(null)}
      />
    </div>
  )
}
