import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "@fontsource-variable/inter/index.css";
import "@fontsource-variable/space-grotesk/index.css";
import { CookieConsentRoot } from "@/components/cookie-consent/CookieConsentRoot";

createRoot(document.getElementById("root")!).render(
  <>
    <CookieConsentRoot appSource="administracja" />
    <App />
  </>,
);
