import { HUB_LOGIN_URL } from "@/lib/hubLogin";

export type AddonModule = "home" | "developer_warranty";

export function addonPurchaseUrl(module: AddonModule): string {
  const base = HUB_LOGIN_URL.replace(/\/$/, "");
  return `${base}/subscriptions?focus=${module}`;
}
