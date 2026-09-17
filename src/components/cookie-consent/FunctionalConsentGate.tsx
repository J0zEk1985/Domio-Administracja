import { useEffect, useState, type ReactNode } from 'react'
import {
  CONSENT_CHANGED_EVENT,
  hasCategoryConsent,
  openCookiePreferences,
} from '../../lib/cookieConsent'

type Props = {
  children: ReactNode
  title?: string
  description?: string
}

export function FunctionalConsentGate({
  children,
  title = 'Mapa wymaga zgody',
  description = 'Podgląd mapy ładuje dane od podmiotu trzeciego (OpenStreetMap lub Google). Włącz pliki funkcjonalne, aby wyświetlić mapę.',
}: Props) {
  const [allowed, setAllowed] = useState(() => hasCategoryConsent('functional'))

  useEffect(() => {
    const sync = () => setAllowed(hasCategoryConsent('functional'))
    window.addEventListener(CONSENT_CHANGED_EVENT, sync)
    return () => window.removeEventListener(CONSENT_CHANGED_EVENT, sync)
  }, [])

  if (allowed) return <>{children}</>

  return (
    <div className="flex min-h-[12rem] w-full flex-col items-center justify-center gap-3 rounded-lg border border-border bg-muted/40 p-4 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="max-w-md text-xs text-muted-foreground">{description}</p>
      <button
        type="button"
        className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
        onClick={() => openCookiePreferences()}
      >
        Zarządzaj zgodami cookies
      </button>
    </div>
  )
}
