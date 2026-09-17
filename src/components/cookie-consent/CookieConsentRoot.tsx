import { useEffect, useMemo, useState } from 'react'
import {
  ACCEPTED_ALL_CATEGORIES,
  CONSENT_CHANGED_EVENT,
  COOKIE_POLICY_VERSION,
  OPEN_PREFERENCES_EVENT,
  REJECTED_OPTIONAL_CATEGORIES,
  getCookiesPolicyUrl,
  getOrCreateConsentId,
  getStoredConsent,
  isConsentCurrent,
  openCookiePreferences,
  saveStoredConsent,
  type ConsentAction,
  type ConsentAppSource,
  type ConsentCategories,
} from '../../lib/cookieConsent'
import { recordCookieConsent } from '../../lib/cookieConsentApi'

type Props = {
  appSource: ConsentAppSource
  policyUrl?: string
}

const EMPTY_OPTIONAL: Omit<ConsentCategories, 'essential'> = {
  functional: false,
  analytics: false,
  marketing: false,
}

export function CookieConsentRoot({ appSource, policyUrl }: Props) {
  const resolvedPolicyUrl = getCookiesPolicyUrl(policyUrl)
  const [consent, setConsent] = useState(() => getStoredConsent())
  const decided = isConsentCurrent(consent)
  const [preferencesOpen, setPreferencesOpen] = useState(false)
  const [draft, setDraft] = useState(EMPTY_OPTIONAL)

  useEffect(() => {
    const sync = () => setConsent(getStoredConsent())
    window.addEventListener(CONSENT_CHANGED_EVENT, sync)
    const open = () => {
      const current = getStoredConsent()
      setDraft({
        functional: current?.categories.functional === true,
        analytics: current?.categories.analytics === true,
        marketing: current?.categories.marketing === true,
      })
      setPreferencesOpen(true)
    }
    window.addEventListener(OPEN_PREFERENCES_EVENT, open)
    return () => {
      window.removeEventListener(CONSENT_CHANGED_EVENT, sync)
      window.removeEventListener(OPEN_PREFERENCES_EVENT, open)
    }
  }, [])

  const persist = (categories: ConsentCategories, action: ConsentAction) => {
    const next = {
      consentId: getOrCreateConsentId(),
      policyVersion: COOKIE_POLICY_VERSION,
      categories,
      updatedAt: new Date().toISOString(),
    }
    saveStoredConsent(next)
    setConsent(next)
    setPreferencesOpen(false)
    void recordCookieConsent({
      consentId: next.consentId,
      categories,
      action,
      appSource,
    })
  }

  const saveCustom = () => {
    persist(
      {
        essential: true,
        functional: draft.functional,
        analytics: draft.analytics,
        marketing: draft.marketing,
      },
      'customize',
    )
  }

  const heading = useMemo(
    () => (decided ? 'Ustawienia plików cookies' : 'Pliki cookies i prywatność'),
    [decided],
  )

  return (
    <>
      {!decided && (
        <div
          role="dialog"
          aria-labelledby="domio-cookie-banner-title"
          aria-describedby="domio-cookie-banner-desc"
          className="fixed inset-x-0 bottom-0 z-[80] p-4 sm:p-6"
        >
          <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-background/95 p-5 shadow-2xl backdrop-blur-md">
            <h2 id="domio-cookie-banner-title" className="text-base font-semibold text-foreground sm:text-lg">
              {heading}
            </h2>
            <p id="domio-cookie-banner-desc" className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Używamy niezbędnych plików cookies do logowania i bezpieczeństwa. Opcjonalne technologie
              (funkcjonalne, analityczne i marketingowe) włączamy wyłącznie po Twojej zgodzie. Szczegóły znajdziesz w{' '}
              <a className="underline underline-offset-2 hover:text-foreground" href={resolvedPolicyUrl}>
                Polityce cookies
              </a>
              .
            </p>
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <button
                type="button"
                className="h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                onClick={() => persist(ACCEPTED_ALL_CATEGORIES, 'accept_all')}
              >
                Zaakceptuj wszystkie
              </button>
              <button
                type="button"
                className="h-11 rounded-xl border border-border bg-background px-4 text-sm font-semibold text-foreground hover:bg-muted"
                onClick={() => persist(REJECTED_OPTIONAL_CATEGORIES, 'reject_optional')}
              >
                Tylko niezbędne
              </button>
              <button
                type="button"
                className="h-11 rounded-xl border border-border bg-background px-4 text-sm font-semibold text-foreground hover:bg-muted"
                onClick={() => {
                  setDraft(EMPTY_OPTIONAL)
                  setPreferencesOpen(true)
                }}
              >
                Dostosuj
              </button>
            </div>
          </div>
        </div>
      )}

      {preferencesOpen && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="domio-cookie-modal-title"
            className="w-full max-w-lg rounded-2xl border border-border bg-background p-6 shadow-2xl"
          >
            <h2 id="domio-cookie-modal-title" className="text-lg font-semibold text-foreground">
              Dostosuj zgody cookies
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Kategorie opcjonalne są domyślnie wyłączone. Możesz je włączyć lub wyłączyć w dowolnym momencie.{' '}
              <a className="underline underline-offset-2" href={resolvedPolicyUrl}>
                Polityka cookies
              </a>
            </p>

            <ul className="mt-4 space-y-3">
              <li className="rounded-xl border border-border p-3">
                <p className="text-sm font-medium text-foreground">Niezbędne</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Logowanie, bezpieczeństwo sesji i zapamiętanie Twojej decyzji o zgodach. Zawsze włączone.
                </p>
              </li>
              <CategoryToggle
                label="Funkcjonalne"
                description="Motyw, układ menu oraz mapy (Google Maps / OpenStreetMap)."
                checked={draft.functional}
                onChange={(functional) => setDraft((prev) => ({ ...prev, functional }))}
              />
              <CategoryToggle
                label="Analityczne"
                description="Obecnie nieużywane. Zgoda zostanie wykorzystana dopiero po wdrożeniu analityki."
                checked={draft.analytics}
                onChange={(analytics) => setDraft((prev) => ({ ...prev, analytics }))}
              />
              <CategoryToggle
                label="Marketingowe"
                description="Obecnie nieużywane. Brak pikseli reklamowych do czasu wyrażenia zgody."
                checked={draft.marketing}
                onChange={(marketing) => setDraft((prev) => ({ ...prev, marketing }))}
              />
            </ul>

            <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                className="h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                onClick={saveCustom}
              >
                Zapisz wybór
              </button>
              <button
                type="button"
                className="h-11 rounded-xl border border-border px-4 text-sm font-semibold text-foreground hover:bg-muted"
                onClick={() => persist(REJECTED_OPTIONAL_CATEGORIES, decided ? 'withdraw' : 'reject_optional')}
              >
                Tylko niezbędne
              </button>
            </div>
            <button
              type="button"
              className="mt-2 w-full h-10 text-sm text-muted-foreground hover:text-foreground"
              onClick={() => setPreferencesOpen(false)}
            >
              Anuluj
            </button>
          </div>
        </div>
      )}
    </>
  )
}

function CategoryToggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  const id = `cookie-cat-${label.toLowerCase()}`
  return (
    <li className="flex items-start justify-between gap-3 rounded-xl border border-border p-3">
      <div>
        <label htmlFor={id} className="text-sm font-medium text-foreground">
          {label}
        </label>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
      <input
        id={id}
        type="checkbox"
        className="mt-1 h-4 w-4 accent-primary"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </li>
  )
}

export function CookieConsentSettingsButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      className={className ?? 'text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground'}
      onClick={() => openCookiePreferences()}
    >
      Zarządzaj zgodami cookies
    </button>
  )
}
