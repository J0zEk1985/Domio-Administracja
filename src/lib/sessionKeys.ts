/** localStorage: last office vs field view (analogous to Serwis dispatcher/technician). */
export const PREFERRED_APP_VIEW_KEY = "domio-admin-preferred-view";

export type PreferredAppView = "office" | "field";

export function getPreferredAppView(): PreferredAppView {
  try {
    const value = localStorage.getItem(PREFERRED_APP_VIEW_KEY);
    if (value === "office" || value === "field") return value;
  } catch (err) {
    console.error("[getPreferredAppView]", err);
  }
  return "office";
}

export function setPreferredAppView(view: PreferredAppView): void {
  try {
    localStorage.setItem(PREFERRED_APP_VIEW_KEY, view);
  } catch (err) {
    console.error("[setPreferredAppView]", err);
  }
}
