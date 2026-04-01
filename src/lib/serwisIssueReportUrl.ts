/** Production Serwis host — override with VITE_SERWIS_PUBLIC_ORIGIN for staging. */
const DEFAULT_SERWIS_ORIGIN = "https://serwis.domio.com.pl";

export function getSerwisPublicOrigin(): string {
  const fromEnv = import.meta.env.VITE_SERWIS_PUBLIC_ORIGIN as string | undefined;
  if (fromEnv?.trim()) {
    return fromEnv.trim().replace(/\/$/, "");
  }
  return DEFAULT_SERWIS_ORIGIN;
}

/**
 * Public issue form URL for DOMIO Serwis (`cleaning_locations.issue_qr_token`, legacy: `qr_code_token`).
 * Matches route `PublicIssueReport` (query `token`).
 */
export function buildSerwisIssueReportUrl(
  issueQrToken: string | null | undefined,
  qrCodeTokenFallback?: string | null,
): string | null {
  const raw = issueQrToken?.trim() || qrCodeTokenFallback?.trim();
  if (!raw) return null;
  const base = getSerwisPublicOrigin();
  return `${base}/zgloszenie?token=${encodeURIComponent(raw)}`;
}
