import { createRoot } from "react-dom/client";
import App from "./App.tsx";
// @ts-ignore
import "@fontsource-variable/inter";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
