/** Signed inflation delta for the picks table, e.g. "+0.012×" / "-0.008×". */
export function formatDelta(delta: number | undefined): string {
    if (delta === undefined || !Number.isFinite(delta)) return '—';
    return `${delta >= 0 ? '+' : ''}${delta.toFixed(3)}×`;
}

/** "Ja'Marr Chase" → "J. Chase" for narrow screens; single-word and D/ST names stay whole. */
export function shortPlayerName(name: string, position: string): string {
    const parts = name.split(' ');
    if (parts.length < 2 || position === 'D/ST') return name;
    return `${parts[0][0]}. ${parts.slice(1).join(' ')}`;
}
