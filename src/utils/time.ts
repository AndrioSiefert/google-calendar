export function normalizeToRfc3339(raw: string): string {
    if (!raw) return raw;

    if (raw.includes('T')) {
        return raw;
    }

    const m = raw.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}(?::\d{2})?)$/);
    if (m) {
        return `${m[1]}T${m[2]}`;
    }

    const d = new Date(raw);
    if (!isNaN(d.getTime())) {
        return d.toISOString();
    }

    return raw;
}

export function addMinutesIso(iso: string, minutes: number): string {
    const d = new Date(iso);
    if (isNaN(d.getTime())) {
        return iso;
    }

    const added = new Date(d.getTime() + minutes * 60_000);

    // se tinha timezone explícito, devolve ISO com Z
    if (iso.includes('Z') || /[+-]\d{2}:\d{2}$/.test(iso)) {
        return added.toISOString();
    }

    const pad = (n: number) => n.toString().padStart(2, '0');

    const yyyy = added.getFullYear();
    const mm = pad(added.getMonth() + 1);
    const dd = pad(added.getDate());
    const hh = pad(added.getHours());
    const mi = pad(added.getMinutes());
    const ss = pad(added.getSeconds());

    return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`;
}
