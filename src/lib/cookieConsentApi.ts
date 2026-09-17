import { supabase } from './supabase'
import type { ConsentAction, ConsentAppSource, ConsentCategories } from './cookieConsent'
import { COOKIE_POLICY_VERSION } from './cookieConsent'

export async function recordCookieConsent(input: {
  consentId: string
  categories: ConsentCategories
  action: ConsentAction
  appSource: ConsentAppSource
}): Promise<void> {
  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
    if (sessionError) {
      console.error('[cookieConsentApi] getSession', sessionError)
    }

    const { error } = await supabase.functions.invoke('consent', {
      body: {
        consent_id: input.consentId,
        accepted_categories: input.categories,
        policy_version: COOKIE_POLICY_VERSION,
        action: input.action,
        app_source: input.appSource,
      },
      headers: sessionData.session?.access_token
        ? { Authorization: `Bearer ${sessionData.session.access_token}` }
        : undefined,
    })

    if (error) {
      console.error('[cookieConsentApi] invoke failed', error)
    }
  } catch (error) {
    console.error('[cookieConsentApi] unexpected error', error)
  }
}
