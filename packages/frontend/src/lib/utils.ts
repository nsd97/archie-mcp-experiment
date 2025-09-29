import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Compute proximity to the due date within a horizon, clamped 0..1.
 * 0 means far (>= horizon), 1 means due now or past due.
 */
export function dueProximity(dueDateIso: string, horizonDays = 7): number {
  const now = Date.now()
  const due = new Date(dueDateIso).getTime()
  if (!Number.isFinite(due)) return 0
  const ms = due - now
  const horizonMs = horizonDays * 24 * 60 * 60 * 1000
  const ratio = ms / horizonMs
  const pct = 1 - Math.min(Math.max(ratio, 0), 1)
  return Math.min(Math.max(pct, 0), 1)
}

/**
 * Build inline style for category surfaces that darkens as the due date nears.
 * We preserve the base hue/saturation (via CSS var --category-bg), ramp the
 * base alpha up to fully opaque, and add a black overlay to achieve an
 * "ultra dark" feel near the due date — without dimming text.
 *
 * Note: When the due date is more than `horizonDays` away, this returns an
 * empty style to avoid overriding the base CSS color (no change until 7 days out).
 */
export function categorySurfaceStyleForDueDate(
  dueDateIso: string,
  options?: { baseAlpha?: number; extraAlpha?: number; baseBorderAlpha?: number; extraBorderAlpha?: number; maxOverlay?: number; horizonDays?: number }
): React.CSSProperties {
  const horizonDays = options?.horizonDays ?? 7
  const pLinear = dueProximity(dueDateIso, horizonDays)
  if (pLinear <= 0) return {} // outside horizon: do not override base styles at all

  // Proximity easing: make darkening more noticeable as due approaches
  const p = Math.sqrt(pLinear)

  // Ramp base background alpha towards 1.0
  const baseA = options?.baseAlpha ?? 0.18
  const extraA = options?.extraAlpha ?? 0.82 // 0.18 + 0.82 => ~1.0 at max
  const bgA = Math.min(baseA + p * extraA, 1)

  // Stronger border emphasis
  const baseBA = options?.baseBorderAlpha ?? 0.4
  const extraBA = options?.extraBorderAlpha ?? 0.5
  const borderA = Math.min(baseBA + p * extraBA, 1)

  // Black overlay on top of the base background color to remove "white"
  const maxOverlay = options?.maxOverlay ?? 0.65 // 65% black at max proximity
  const overlayA = Math.max(0, Math.min(p * maxOverlay, 0.98))
  const overlay = overlayA > 0 ? `linear-gradient(rgba(0,0,0,${overlayA}), rgba(0,0,0,${overlayA}))` : undefined

  return {
    backgroundColor: `hsl(var(--category-bg) / ${bgA})`,
    backgroundImage: overlay,
    borderColor: `hsl(var(--category-border) / ${borderA})`,
    transition: "background-color 120ms ease, border-color 120ms ease, background-image 120ms ease",
  }
}

/**
 * Temporary debug helper: returns 0..100 representing darkening intensity.
 */
export function categorySurfaceDarknessPercent(dueDateIso: string, horizonDays = 7): number {
  const p = Math.sqrt(dueProximity(dueDateIso, horizonDays))
  return Math.round(p * 100)
}
