/**
 * DHL Express product code → friendly name. Audit-corrected codes:
 *   E = Express 9:00 (was wrong "Express 10:30" in legacy)
 *   T = Express 12:00 (Doc) (was wrong "Express Easy" in legacy)
 *   I, L, M, Q, V added per PRD C5 §5
 */
export function getDhlServiceName(code: string): string {
  const serviceNames: Record<string, string> = {
    D: "DHL Express Worldwide (Doc)",
    E: "DHL Express 9:00",
    G: "DHL Express International",
    H: "DHL Economy Select",
    I: "DHL Domestic Express 9:00",
    K: "DHL Express 9:00 (Doc)",
    L: "DHL Express 10:30",
    M: "DHL Express 10:30 (Doc)",
    N: "DHL Express Domestic",
    P: "DHL Express Worldwide",
    Q: "DHL Medical Express",
    T: "DHL Express 12:00 (Doc)",
    U: "DHL Express Worldwide (EU)",
    V: "DHL Europack",
    W: "DHL Economy Select (Non-Doc)",
    X: "DHL Express Envelope",
    Y: "DHL Express 12:00",
  };
  return serviceNames[code] || `DHL ${code}`;
}
