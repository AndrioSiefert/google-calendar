export async function fetchJsonWithTimeout(
    url: string,
    payload: unknown,
    timeoutMs = 4500,
    headers?: Record<string, string>,
) {
    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                ...(headers || {}),
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
        });

        return { ok: res.ok, status: res.status, text: await res.text() };
    } finally {
        clearTimeout(to);
    }
}
