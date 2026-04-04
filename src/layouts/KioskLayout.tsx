import { Outlet } from "react-router-dom";

/**
 * Minimal kiosk shell for TV / public display: no sidebar, no navbar.
 */
export default function KioskLayout() {
  return (
    <div className="min-h-dvh min-h-screen w-full overflow-hidden bg-background text-foreground">
      <Outlet />
    </div>
  );
}
