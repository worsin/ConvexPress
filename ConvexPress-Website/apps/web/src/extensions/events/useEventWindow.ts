import { useEffect, useState } from "react";
import { EVENT_WINDOW_MS, eventWindowStart } from "./window";
/** Updating this argument starts a fresh subscription; reactive document edits
 * within the window keep the same pagination range and endCursor. */
export function useEventWindow(refresh = false) {
  const [start, setStart] = useState(() => eventWindowStart(Date.now()));
  useEffect(() => {
    if (!refresh) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => { timer = setTimeout(() => { setStart(eventWindowStart(Date.now())); schedule(); }, EVENT_WINDOW_MS - (Date.now() % EVENT_WINDOW_MS) + 10); };
    schedule(); return () => clearTimeout(timer);
  }, [refresh]);
  return start;
}
