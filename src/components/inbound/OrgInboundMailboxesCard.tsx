import { useCallback, useEffect, useState } from 'react'
import { Copy, Mail, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from "@/lib/supabase";
import type { InboundIngestMode, InboundModule } from "@/types/inboundEmail";

const INBOUND_DOMAIN =
  (import.meta.env.VITE_INBOUND_MAIL_DOMAIN as string | undefined)?.trim() || 'inbound.domio.pl'

const MODULE_LABEL: Record<InboundModule, string> = {
  serwis: 'Serwis',
  cleaning: 'Sprzątanie',
  administracja: 'Administracja',
}

type MailboxRow = {
  id: string
  org_id: string
  module: InboundModule
  alias_local_part: string
  display_address: string | null
  ingest_mode: InboundIngestMode
  is_enabled: boolean
}

type Quota = {
  ai_parses_limit: number
  ai_parses_used: number
  ai_parses_remaining: number
  has_ai_auto: boolean
}

type Props = {
  orgId: string
  canManage: boolean
  moduleFilter?: InboundModule
}

function inboundAddress(alias: string): string {
  return `${alias}@${INBOUND_DOMAIN}`
}

function errMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) return String((err as { message: unknown }).message)
  if (err instanceof Error) return err.message
  return 'Nie udało się zapisać skrzynki.'
}

export function OrgInboundMailboxesCard({ orgId, canManage, moduleFilter }: Props) {
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [boxes, setBoxes] = useState<MailboxRow[]>([])
  const [quota, setQuota] = useState<Quota | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoadError(null)
    setLoading(true)
    try {
      const ensureRes = canManage
        ? await supabase.rpc('ensure_org_inbound_mailboxes', { p_org_id: orgId })
        : { data: null, error: null }

      if (ensureRes.error) {
        console.error('[OrgInboundMailboxesCard] ensure mailboxes:', ensureRes.error)
      }

      const listRes =
        ensureRes.data != null
          ? ensureRes
          : await supabase
              .from('org_inbound_mailboxes')
              .select('id, org_id, module, alias_local_part, display_address, ingest_mode, is_enabled')
              .eq('org_id', orgId)
              .order('module')

      if (listRes.error) {
        console.error('[OrgInboundMailboxesCard] load mailboxes:', listRes.error)
        setLoadError(listRes.error.message || 'Nie udało się pobrać skrzynek.')
        setBoxes([])
      } else {
        const rows = ((listRes.data ?? []) as MailboxRow[]).filter((row) =>
          moduleFilter ? row.module === moduleFilter : true,
        )
        setBoxes(rows)
      }

      const quotaRes = await supabase.rpc('get_org_ai_quota', { p_org_id: orgId })
      if (quotaRes.error) {
        console.error('[OrgInboundMailboxesCard] quota:', quotaRes.error)
      } else {
        setQuota(quotaRes.data as Quota)
      }
    } catch (e) {
      console.error('[OrgInboundMailboxesCard] load:', e)
      setLoadError(errMessage(e))
    } finally {
      setLoading(false)
    }
  }, [canManage, moduleFilter, orgId])

  useEffect(() => {
    void load()
  }, [load])

  const copyText = async (value: string, ok: string) => {
    try {
      await navigator.clipboard.writeText(value)
      toast.success(ok)
    } catch (e) {
      console.error('[OrgInboundMailboxesCard] clipboard:', e)
      toast.error('Nie udało się skopiować.')
    }
  }

  const saveBox = async (
    id: string,
    patch: {
      p_display_address?: string
      p_is_enabled?: boolean
      p_ingest_mode?: InboundIngestMode
    },
  ) => {
    if (!canManage) return
    setSavingId(id)
    try {
      const { data, error } = await supabase.rpc('update_org_inbound_mailbox', { p_id: id, ...patch })
      if (error) {
        console.error('[OrgInboundMailboxesCard] update:', error)
        toast.error(error.message || 'Nie udało się zapisać skrzynki.')
        return
      }
      const row = data as MailboxRow
      setBoxes((prev) => prev.map((b) => (b.id === id ? { ...b, ...row } : b)))
      toast.success('Zapisano ustawienia skrzynki.')
    } catch (e) {
      console.error('[OrgInboundMailboxesCard] update:', e)
      toast.error(errMessage(e))
    } finally {
      setSavingId(null)
    }
  }

  const used = quota?.ai_parses_used ?? 0
  const limit = quota?.ai_parses_limit ?? 20
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0

  return (
    <section className="rounded-2xl border border-border bg-card p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" aria-hidden />
            Zgłoszenia e-mail
          </h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Promujcie wzór zgłoszenia. W planie bazowym redagujecie mail i wysyłacie na alias Domio.
            Forward od razu wymaga planu z automatyczną analizą.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm hover:bg-muted/60"
        >
          <RefreshCw className="h-4 w-4" aria-hidden />
          Odśwież
        </button>
      </div>

      {quota ? (
        <div className="rounded-xl border border-border/70 bg-muted/30 px-4 py-3">
          <p className="text-sm font-medium">
            Analizy AI w tym miesiącu: {used} / {limit}
            {quota.has_ai_auto ? ' · forward automatyczny dostępny' : ' · próbka planu bazowego'}
          </p>
          <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      ) : null}

      {loading ? <p className="text-sm text-muted-foreground">Ładowanie skrzynek…</p> : null}
      {loadError ? (
        <p className="text-sm text-destructive rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2">
          {loadError}
        </p>
      ) : null}

      <div className="space-y-3">
        {boxes.map((box) => {
          const aliasAddr = inboundAddress(box.alias_local_part)
          const busy = savingId === box.id
          return (
            <article key={box.id} className="rounded-xl border border-border/80 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-medium">{MODULE_LABEL[box.module]}</h3>
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={box.is_enabled}
                    disabled={!canManage || busy}
                    onChange={(e) => void saveBox(box.id, { p_is_enabled: e.target.checked })}
                  />
                  Aktywna
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <code className="text-sm bg-muted px-2 py-1 rounded-md break-all">{aliasAddr}</code>
                <button
                  type="button"
                  className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2 text-xs hover:bg-muted/60"
                  onClick={() => void copyText(aliasAddr, 'Skopiowano adres Domio.')}
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden />
                  Kopiuj alias
                </button>
              </div>

              <label className="block space-y-1 text-sm">
                <span className="text-muted-foreground">Adres, który firma podaje klientom (przekierowanie)</span>
                <input
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  defaultValue={box.display_address ?? ''}
                  disabled={!canManage || busy}
                  placeholder="np. usterki@firma.pl"
                  onBlur={(e) => {
                    const next = e.target.value.trim()
                    if (next === (box.display_address ?? '')) return
                    void saveBox(box.id, { p_display_address: next })
                  }}
                />
              </label>

              <label className="block space-y-1 text-sm">
                <span className="text-muted-foreground">Tryb przyjmowania</span>
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={box.ingest_mode}
                  disabled={!canManage || busy}
                  onChange={(e) => void saveBox(box.id, { p_ingest_mode: e.target.value as InboundIngestMode })}
                >
                  <option value="redacted_template">Standard — redakcja u firmy, potem wysyłka na Domio</option>
                  <option value="ai_auto" disabled={!quota?.has_ai_auto}>
                    Automatyczna analiza — forward od razu
                    {!quota?.has_ai_auto ? ' (wymaga planu AI)' : ''}
                  </option>
                </select>
              </label>
            </article>
          )
        })}
      </div>

      {!canManage ? (
        <p className="text-xs text-muted-foreground">Podgląd. Zmiany zapisze właściciel lub administrator firmy.</p>
      ) : null}
    </section>
  )
}
