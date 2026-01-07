import { google } from 'googleapis';
import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } from '../env';

export function buildCalendarClientFromAccount(account: {
    calendarId: string;
    accessToken: string | null;
    refreshToken: string | null;
    tokenExpiresAt?: string | Date | null;
}) {
    if (!account.refreshToken) {
        return null;
    }

    const oauthClient = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);

    const expiryDate = account.tokenExpiresAt
        ? new Date(account.tokenExpiresAt).getTime()
        : undefined;

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
    const created = await params.calendar.events.insert({
        calendarId: params.calendarId,
        requestBody: {
            summary: params.summary,
            description: params.description,
            start: { dateTime: params.startDateTime, timeZone: params.timeZone },
            end: { dateTime: params.endDateTime, timeZone: params.timeZone },
        },
    });

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
    await params.calendar.events.patch({
        calendarId: params.calendarId,
        eventId: params.eventId,
        requestBody: {
            summary: params.summary,
            start: params.startDateTime ? { dateTime: params.startDateTime, timeZone: params.timeZone } : undefined,
            end: params.endDateTime ? { dateTime: params.endDateTime, timeZone: params.timeZone } : undefined,
        },
    });
}

export async function deleteEvent(params: {
    calendar: ReturnType<typeof google.calendar>;
    calendarId: string;
    eventId: string;
}) {
    await params.calendar.events.delete({
        calendarId: params.calendarId,
        eventId: params.eventId,
    });
}
