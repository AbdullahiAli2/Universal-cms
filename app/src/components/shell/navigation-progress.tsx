"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * A thin bar at the top of the window from the moment an internal link is clicked until the next page is
 * on screen, so every click gets instant feedback even while a page is still loading.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [active, setActive] = useState(false);

  // The new page has rendered.
  useEffect(() => setActive(false), [pathname, searchParams]);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest?.("a");
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      setActive(true);
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // Never leave the bar running if a navigation is cancelled.
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => setActive(false), 15_000);
    return () => clearTimeout(timer);
  }, [active]);

  if (!active) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5 overflow-hidden" role="progressbar" aria-label="Loading page">
      <div className="nav-progress h-full w-full bg-accent" />
    </div>
  );
}
