import { google } from 'googleapis';
import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } from '../env';

function sleep(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function extractGoogleErrorReason(err: any): string | null {
    const directReason = err?.errors?.[0]?.reason;
    if (typeof directReason === 'string' && directReason) return directReason;

    const nestedReason = err?.response?.data?.error?.errors?.[0]?.reason;
    if (typeof nestedReason === 'string' && nestedReason) return nestedReason;

    const message = err?.message;
    if (typeof message === 'string' && message.toLowerCase().includes('rate limit')) {
        return 'rateLimitExceeded';
    }

    return null;
}

export function isGoogleRateLimitError(err: any): boolean {
    const status = Number(err?.code || err?.response?.status || 0);
    const reason = extractGoogleErrorReason(err);

    return (
        status === 429 ||
        reason === 'rateLimitExceeded' ||
        reason === 'userRateLimitExceeded' ||
        reason === 'quotaExceeded'
    );
}

function isRetryableGoogleError(err: any): boolean {
    const codeRaw = (err?.code ?? err?.error?.code ?? err?.cause?.code) as unknown;
    const code = typeof codeRaw === 'string' ? codeRaw : null;
    if (
        code &&
        [
            'ETIMEDOUT',
            'ECONNRESET',
            'EAI_AGAIN',
            'ENOTFOUND',
            'ECONNREFUSED',
            'EPIPE',
            'UND_ERR_CONNECT_TIMEOUT',
            'UND_ERR_HEADERS_TIMEOUT',
            'UND_ERR_BODY_TIMEOUT',
            'UND_ERR_SOCKET',
        ].includes(code)
    ) {
        return true;
    }

    const msg = String(err?.message ?? '').toLowerCase();
    if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('socket hang up')) {
        return true;
    }

    const status = Number(err?.code || err?.response?.status || 0);
    if (status >= 500) return true;
    if (status === 429) return true;

    if (isGoogleRateLimitError(err)) return true;

    return false;
}

async function googleRequestWithRetry<T>(
    fn: () => Promise<T>,
    opts?: { maxAttempts?: number; baseDelayMs?: number },
): Promise<T> {
    const maxAttempts = Math.max(1, opts?.maxAttempts ?? 6);
    const baseDelayMs = Math.max(100, opts?.baseDelayMs ?? 800);

    let lastErr: any;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastErr = err;

            if (!isRetryableGoogleError(err) || attempt === maxAttempts) {
                throw err;
            }
            const exp = Math.pow(2, attempt - 1);
            const rawDelay = Math.min(30_000, baseDelayMs * exp);
            const jitter = 0.7 + Math.random() * 0.6; // 0.7x..1.3x
            const delay = Math.round(rawDelay * jitter);

            await sleep(delay);
        }
    }

    throw lastErr;
}

export function buildCalendarClientFromAccount(
    account: {
        calendarId: string;
        accessToken: string | null;
        refreshToken: string | null;
        tokenExpiresAt?: string | Date | null;
    },
    onTokens?: (tokens: { access_token?: string | null; refresh_token?: string | null; expiry_date?: number | null }) =>
        | void
        | Promise<void>,
) {
    if (!account.refreshToken) {
        return null;
    }

    const oauthClient = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);

    const expiryDate = account.tokenExpiresAt ? new Date(account.tokenExpiresAt).getTime() : undefined;

    if (onTokens) {
        oauthClient.on('tokens', (tokens: any) => {
            try {
                void onTokens({
                    access_token: tokens?.access_token ?? null,
                    refresh_token: tokens?.refresh_token ?? null,
                    expiry_date: typeof tokens?.expiry_date === 'number' ? tokens.expiry_date : null,
                });
            } catch (e) {
                console.error('Falha ao processar evento tokens do OAuth2Client:', e);
            }
        });
    }

    oauthClient.setCredentials({
        refresh_token: account.refreshToken,
        access_token: account.accessToken ?? undefined,
        expiry_date: expiryDate,
    });

    const calendar = google.calendar({ version: 'v3', auth: oauthClient });

    return { calendar, calendarId: account.calendarId };
}

export async function createEvent(params: {
    calendar: ReturnType<typeof google.calendar>;
    calendarId: string;
    summary: string;
    description?: string;
    startDateTime: string;
    endDateTime: string;
    timeZone: string;
}) {
    const created = await googleRequestWithRetry(() =>
        params.calendar.events.insert({
            calendarId: params.calendarId,
            requestBody: {
                summary: params.summary,
                description: params.description,
                start: { dateTime: params.startDateTime, timeZone: params.timeZone },
                end: { dateTime: params.endDateTime, timeZone: params.timeZone },
            },
        }),
    );

    return { id: created.data.id ?? null };
}

export async function patchEvent(params: {
    calendar: ReturnType<typeof google.calendar>;
    calendarId: string;
    eventId: string;
    summary?: string;
    startDateTime?: string;
    endDateTime?: string;
    timeZone?: string;
}) {
    await googleRequestWithRetry(() =>
        params.calendar.events.patch({
            calendarId: params.calendarId,
            eventId: params.eventId,
            requestBody: {
                summary: params.summary,
                start: params.startDateTime ? { dateTime: params.startDateTime, timeZone: params.timeZone } : undefined,
                end: params.endDateTime ? { dateTime: params.endDateTime, timeZone: params.timeZone } : undefined,
            },
        }),
    );
}

export async function deleteEvent(params: {
    calendar: ReturnType<typeof google.calendar>;
    calendarId: string;
    eventId: string;
}) {
    await googleRequestWithRetry(() =>
        params.calendar.events.delete({
            calendarId: params.calendarId,
            eventId: params.eventId,
        }),
    );
}

export type GoogleCalendarEventGet = {
    id: string | null;
    summary: string | null;
    description: string | null;
    recurringEventId: string | null;
    recurrence: string[] | null;
    start: {
        dateTime: string | null;
        date: string | null;
        timeZone: string | null;
    };
    end: {
        dateTime: string | null;
        date: string | null;
        timeZone: string | null;
    };
};

export async function getEvent(params: {
    calendar: ReturnType<typeof google.calendar>;
    calendarId: string;
    eventId: string;
}) {
    const resp = await googleRequestWithRetry(() =>
        params.calendar.events.get({
            calendarId: params.calendarId,
            eventId: params.eventId,
        }),
    );

    const ev = resp.data;
    const start = ev.start ?? {};
    const end = ev.end ?? {};

    const mapped: GoogleCalendarEventGet = {
        id: (ev.id as string) ?? null,
        summary: (ev.summary as string) ?? null,
        description: (ev.description as string) ?? null,
        recurringEventId: (ev.recurringEventId as string) ?? null,
        recurrence: (ev.recurrence as string[]) ?? null,
        start: {
            dateTime: (start.dateTime as string) ?? null,
            date: (start.date as string) ?? null,
            timeZone: (start.timeZone as string) ?? null,
        },
        end: {
            dateTime: (end.dateTime as string) ?? null,
            date: (end.date as string) ?? null,
            timeZone: (end.timeZone as string) ?? null,
        },
    };

    return mapped;
}

export type GoogleCalendarListedEvent = {
    id: string;
    status: string | null;
    summary: string | null;
    description: string | null;
    htmlLink: string | null;
    recurringEventId: string | null;
    recurrence: string[] | null;
    start: {
        dateTime: string | null;
        date: string | null;
        timeZone: string | null;
    };
    end: {
        dateTime: string | null;
        date: string | null;
        timeZone: string | null;
    };
};

export async function listEvents(params: {
    calendar: ReturnType<typeof google.calendar>;
    calendarId: string;
    timeMin: string;
    timeMax: string;
    timeZone?: string;
    q?: string;
    maxResults?: number;
    includeCancelled?: boolean;
}) {
    const maxResults = Math.min(Math.max(1, params.maxResults ?? 100), 2500);

    const resp = await googleRequestWithRetry(() =>
        params.calendar.events.list({
            calendarId: params.calendarId,
            timeMin: params.timeMin,
            timeMax: params.timeMax,
            timeZone: params.timeZone,
            q: params.q,
            maxResults,
            singleEvents: true,
            orderBy: 'startTime',
            showDeleted: !!params.includeCancelled,
        }),
    );

    const items = (resp.data.items ?? []).map((ev): GoogleCalendarListedEvent => {
        const start = ev.start ?? {};
        const end = ev.end ?? {};

        return {
            id: String(ev.id ?? ''),
            status: (ev.status as string) ?? null,
            summary: (ev.summary as string) ?? null,
            description: (ev.description as string) ?? null,
            htmlLink: (ev.htmlLink as string) ?? null,
            recurringEventId: (ev.recurringEventId as string) ?? null,
            recurrence: (ev.recurrence as string[]) ?? null,
            start: {
                dateTime: (start.dateTime as string) ?? null,
                date: (start.date as string) ?? null,
                timeZone: (start.timeZone as string) ?? null,
            },
            end: {
                dateTime: (end.dateTime as string) ?? null,
                date: (end.date as string) ?? null,
                timeZone: (end.timeZone as string) ?? null,
            },
        };
    });

    return {
        items,
        nextPageToken: resp.data.nextPageToken ?? null,
    };
}
