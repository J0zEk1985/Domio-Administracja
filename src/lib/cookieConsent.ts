export const COOKIE_POLICY_VERSION = '1.0.0'
export const CONSENT_STORAGE_KEY = 'domio-cookie-consent'
export const CONSENT_COOKIE_NAME = 'domio-cookie-consent'
export const CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 180
export const CONSENT_CHANGED_EVENT = 'domio-cookie-consent-changed'
export const OPEN_PREFERENCES_EVENT = 'domio-open-cookie-preferences'

export type ConsentAction = 'accept_all' | 'reject_optional' | 'customize' | 'withdraw'
export type ConsentAppSource = 'hub' | 'cleaning' | 'serwis' | 'administracja' | 'home' | 'flota'
export type OptionalConsentCategory = 'functional' | 'analytics' | 'marketing'

export type ConsentCategories = {
  essential: true
  functional: boolean
  analytics: boolean
  marketing: boolean
}

export type StoredConsent = {
  consentId: string
  policyVersion: string
  categories: ConsentCategories
  updatedAt: string
}

export const REJECTED_OPTIONAL_CATEGORIES: ConsentCategories = {
  essential: true,
  functional: false,
  analytics: false,
  marketing: false,
}

export const ACCEPTED_ALL_CATEGORIES: ConsentCategories = {
  essential: true,
  functional: true,
  analytics: true,
  marketing: true,
}

function cookieDomain(): string | null {
  if (typeof window === 'undefined') return null
  const host = window.location.hostname
  if (host.includes('udomio.com.pl')) return '.udomio.com.pl'
  if (host.includes('domio.com.pl')) return '.domio.com.pl'
  return null
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const parts = `; ${document.cookie}`.split(`; ${name}=`)
  if (parts.length < 2) return null
  return parts.pop()?.split(';').shift() ?? null
}

function writeCookie(name: string, value: string, maxAge: number): void {
  if (typeof document === 'undefined') return
  const domain = cookieDomain()
  const secure = window.location.protocol === 'https:' ? ';Secure' : ''
  const domainPart = domain ? `;domain=${domain}` : ''
  document.cookie = `${name}=${value};path=/;max-age=${maxAge};SameSite=Lax${domainPart}${secure}`
}

function expireCookie(name: string): void {
  if (typeof document === 'undefined') return
  const domain = cookieDomain()
  const secure = window.location.protocol === 'https:' ? ';Secure' : ''
  const domainPart = domain ? `;domain=${domain}` : ''
  document.cookie = `${name}=;path=/;max-age=0;SameSite=Lax${domainPart}${secure}`
  document.cookie = `${name}=;path=/;max-age=0;SameSite=Lax${secure}`
}

function parseStored(raw: string | null): StoredConsent | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as StoredConsent
    if (!parsed?.consentId || !parsed.policyVersion || !parsed.categories) return null
    return {
      consentId: parsed.consentId,
      policyVersion: parsed.policyVersion,
      updatedAt: parsed.updatedAt || new Date().toISOString(),
      categories: {
        essential: true,
        functional: parsed.categories.functional === true,
        analytics: parsed.categories.analytics === true,
        marketing: parsed.categories.marketing === true,
      },
    }
  } catch (error) {
    console.error('[cookieConsent] parse failed', error)
    return null
  }
}

export function getStoredConsent(): StoredConsent | null {
  if (typeof window === 'undefined') return null
  try {
    const fromStorage = parseStored(localStorage.getItem(CONSENT_STORAGE_KEY))
    if (fromStorage) return fromStorage
  } catch (error) {
    console.error('[cookieConsent] localStorage read failed', error)
  }
  try {
    const cookieRaw = readCookie(CONSENT_COOKIE_NAME)
    if (!cookieRaw) return null
    return parseStored(decodeURIComponent(cookieRaw))
  } catch (error) {
    console.error('[cookieConsent] cookie read failed', error)
    return null
  }
}

export function isConsentCurrent(consent: StoredConsent | null = getStoredConsent()): boolean {
  return Boolean(consent && consent.policyVersion === COOKIE_POLICY_VERSION)
}

export function hasCategoryConsent(category: OptionalConsentCategory): boolean {
  const consent = getStoredConsent()
  if (!isConsentCurrent(consent) || !consent) return false
  return consent.categories[category] === true
}

export function getOrCreateConsentId(): string {
  const existing = getStoredConsent()?.consentId
  if (existing) return existing
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const rand = (Math.random() * 16) | 0
    const value = char === 'x' ? rand : (rand & 0x3) | 0x8
    return value.toString(16)
  })
}

function notifyConsentChanged(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(CONSENT_CHANGED_EVENT))
}

export function openCookiePreferences(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(OPEN_PREFERENCES_EVENT))
}

const FUNCTIONAL_STORAGE_KEYS = ['domio-theme', 'fleet-ui-theme', 'theme']

export function clearOptionalClientStorage(): void {
  try {
    FUNCTIONAL_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key))
  } catch (error) {
    console.error('[cookieConsent] clear optional storage failed', error)
  }
  expireCookie('sidebar:state')
}

export function saveStoredConsent(consent: StoredConsent): void {
  const serialized = JSON.stringify(consent)
  try {
    localStorage.setItem(CONSENT_STORAGE_KEY, serialized)
  } catch (error) {
    console.error('[cookieConsent] localStorage write failed', error)
  }
  try {
    writeCookie(CONSENT_COOKIE_NAME, encodeURIComponent(serialized), CONSENT_MAX_AGE_SECONDS)
  } catch (error) {
    console.error('[cookieConsent] cookie write failed', error)
  }
  if (!consent.categories.functional) {
    clearOptionalClientStorage()
  }
  notifyConsentChanged()
}

export function persistIfFunctional(key: string, value: string): void {
  if (!hasCategoryConsent('functional')) return
  try {
    localStorage.setItem(key, value)
  } catch (error) {
    console.error('[cookieConsent] persistIfFunctional failed', error)
  }
}

export function clearLocalStoragePreservingConsent(): void {
  let backup: string | null = null
  try {
    backup = localStorage.getItem(CONSENT_STORAGE_KEY)
  } catch (error) {
    console.error('[cookieConsent] backup consent failed', error)
  }
  localStorage.clear()
  if (backup) {
    try {
      localStorage.setItem(CONSENT_STORAGE_KEY, backup)
    } catch (error) {
      console.error('[cookieConsent] restore consent failed', error)
    }
  }
}

export function getCookiesPolicyUrl(explicit?: string): string {
  if (explicit) return explicit
  const hub = (import.meta.env.VITE_HUB_URL as string | undefined)?.replace(/\/$/, '')
  return `${hub || 'https://domio.com.pl'}/polityka-cookies`
}
