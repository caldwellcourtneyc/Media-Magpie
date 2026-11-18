"use client";

// Chip rows shared by the add form and the item sheet: where to watch, and the tier.
import { NOT_ON_MINE, SERVICES, SERVICE_KEYS, THEATER, TIERS, TIER_NAME, type Tier } from "@/lib/config";

/**
 * Multi-select: a show can be on more than one service. Tap again to clear. With nothing set,
 * `auto` (the TVmaze network, when it's one of yours) shows lit as the default; picking anything
 * replaces it, tapping it keeps it as yours, and clearing your pick falls back to it.
 */
export function ServicePicker({ value, onChange, auto = null, theater = false }: { value: string[]; onChange: (v: string[]) => void; auto?: string | null; theater?: boolean }) {
  const shown = value.length ? null : auto;
  return (
    <div className="field">
      <span>Where to watch</span>
      <div className="chips" role="group" aria-label="Streaming services">
        {SERVICES.filter(([k]) => theater || k !== THEATER).map(([k, name]) => {
          const on = value.includes(k) || k === shown;
          // No Access and a real service exclude each other.
          const next =
            k === shown
              ? [k]
              : on
                ? value.filter((v) => v !== k)
                : k === NOT_ON_MINE
                  ? [k]
                  : SERVICE_KEYS.filter((s) => s !== NOT_ON_MINE && (s === k || value.includes(s)));
          return (
            <button key={k} aria-pressed={on} className={`chip ${on ? "on" : ""} ${k === NOT_ON_MINE && !on ? "dash" : ""}`} onClick={() => onChange(next)}>
              {name}
            </button>
          );
        })}
      </div>
      {shown && <p className="hint">From TVmaze. Pick another to change it.</p>}
    </div>
  );
}

/**
 * Not a Fan, Love, Fave, Top Shelf, or none of them (nothing defaults to
 * Love). Tapping the lit one clears it. `label` names the row where it isn't the item's own Tier row
 * (the item sheet's finish form says "Tier (optional)").
 */
export function TierPicker({ tier, disliked, onPick, label = "Tier" }: { tier: Tier | null; disliked: boolean; onPick: (v: TierPick) => void; label?: string }) {
  const on = disliked ? "nope" : tier;
  return (
    <div className="field">
      <span>{label}</span>
      <div className="chips" role="radiogroup" aria-label={label}>
        <button role="radio" aria-checked={on === "nope"} className={`chip ${on === "nope" ? "on" : ""}`} onClick={() => onPick(on === "nope" ? null : "nope")}>
          Not a Fan
        </button>
        {TIERS.map((t) => (
          <button key={t} role="radio" aria-checked={on === t} className={`chip tier-${t} ${on === t ? "on" : ""}`} onClick={() => onPick(on === t ? null : t)}>
            {t === "top" ? "★ " : ""}
            {TIER_NAME[t]}
          </button>
        ))}
      </div>
    </div>
  );
}

/** What a tap on the tier row means: a tier, "nope" for Not a Fan, or null for neither. */
export type TierPick = Tier | "nope" | null;

/** The item fields a pick sets. Not a Fan and a tier exclude each other, so each pick settles both. */
export const tierFields = (v: TierPick): { tier: Tier | null; disliked: boolean } => (v === "nope" ? { tier: null, disliked: true } : { tier: v, disliked: false });
