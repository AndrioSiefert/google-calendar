import { Router } from 'express';
import { findActiveCalendarAccountForPhone } from '../db/calendarAccounts';
import {
    buildCalendarClientFromAccount,
    getEvent,
    isGoogleRateLimitError,
    listEvents,
    patchEvent,
    deleteEvent,
} from '../google/calendar';
import { normalizeToRfc3339 } from '../utils/time';
import { enqueueThrottledRedis } from '../utils/throttleQueueRedis';

export const googleEventsRouter = Router();

function isBiaManagedEvent(ev: { summary?: string | null; description?: string | null } | null | undefined): boolean {
    const s = (ev?.summary ?? '').toString().toLowerCase();
    const d = (ev?.description ?? '').toString().toLowerCase();

    // Marcadores que você já usa ao criar lembretes no Google
    if (d.includes('lembrete criado pela bia')) return true;
    if (d.includes('bia 🐝')) return true;

    // Segurança extra (caso você padronize no título no futuro)
    if (s.includes('bia 🐝')) return true;

    return false;
}

googleEventsRouter.post('/google-events/list', async (req, res) => {
    try {
        const { phone, time_min, time_max, tz, q, max_results, include_cancelled } = req.body as {
            phone?: string;
            time_min?: string;
            time_max?: string;
            tz?: string;
            q?: string;
            max_results?: number;
            include_cancelled?: boolean;
        };

        if (!phone || !time_min || !time_max) {
            return res.status(400).json({ ok: false, error: 'missing_fields' });
        }

        const account = await findActiveCalendarAccountForPhone(String(phone));
        if (!account) {
            return res.json({ ok: false, error: 'no_calendar_account' });
        }

        const calendarClient = buildCalendarClientFromAccount(account);
        if (!calendarClient) {
            return res.json({ ok: false, error: 'invalid_tokens' });
        }

        const queueKey = `calendar:${account.id}`;

        const result = await enqueueThrottledRedis(queueKey, 700, async () => {
            const timeMin = normalizeToRfc3339(String(time_min));
            const timeMax = normalizeToRfc3339(String(time_max));

            const { items, nextPageToken } = await listEvents({
                calendar: calendarClient.calendar,
                calendarId: calendarClient.calendarId,
                timeMin,
                timeMax,
                timeZone: tz,
                q,
                maxResults: max_results,
                includeCancelled: include_cancelled,
            });

            return {
                ok: true,
                calendar_id: calendarClient.calendarId,
                time_min: timeMin,
                time_max: timeMax,
                items,
                next_page_token: nextPageToken,
            };
        });

        return res.json(result);
    } catch (err) {
        if (isGoogleRateLimitError(err)) {
            return res.status(429).json({ ok: false, error: 'rate_limited' });
        }
        console.error('Erro em /google-events/list', err);
        return res.status(500).json({ ok: false, error: 'internal_error' });
    }
});

googleEventsRouter.post('/google-events/patch', async (req, res) => {
    try {
        const { phone, event_id, summary, start_at, end_at, tz, scope } = req.body as {
            phone?: string;
            event_id?: string;
            summary?: string;
            start_at?: string;
            end_at?: string;
            tz?: string;
            scope?: 'this' | 'series' | string;
        };

        if (!phone || !event_id) {
            return res.status(400).json({ ok: false, error: 'missing_fields' });
        }

        const hasTimeChange = !!start_at || !!end_at;
        if (hasTimeChange && !(start_at && end_at)) {
            return res.status(400).json({ ok: false, error: 'missing_start_end_pair' });
        }

        if (!summary && !hasTimeChange) {
            return res.status(400).json({ ok: false, error: 'missing_update_fields' });
        }

        const account = await findActiveCalendarAccountForPhone(String(phone));
        if (!account) {
            return res.json({ ok: false, error: 'no_calendar_account' });
        }

        const calendarClient = buildCalendarClientFromAccount(account);
        if (!calendarClient) {
            return res.json({ ok: false, error: 'invalid_tokens' });
        }

        const queueKey = `calendar:${account.id}`;

        const result = await enqueueThrottledRedis(queueKey, 800, async () => {
            // Sempre buscamos o evento para:
            // - bloquear eventos criados pela BIA (evitar desync Supabase)
            // - descobrir recurringEventId caso scope=series
            let ev;
            try {
                ev = await getEvent({
                    calendar: calendarClient.calendar,
                    calendarId: calendarClient.calendarId,
                    eventId: String(event_id),
                });
            } catch (e: any) {
                const status = Number(e?.code || e?.response?.status || 0);
                if (status === 404) {
                    return { ok: true, updatedOnGoogle: false, reason: 'not_found' };
                }
                throw e;
            }

            if (isBiaManagedEvent(ev)) {
                return { ok: false, error: 'bia_event_blocked' };
            }

            let targetEventId = String(event_id);
            const scopeFinal = (scope === 'series' ? 'series' : 'this') as 'this' | 'series';
            if (scopeFinal === 'series' && ev.recurringEventId) {
                targetEventId = ev.recurringEventId;
            }

            const tzFinal = tz || 'America/Sao_Paulo';
            const startDateTime = start_at ? normalizeToRfc3339(String(start_at)) : undefined;
            const endDateTime = end_at ? normalizeToRfc3339(String(end_at)) : undefined;

            await patchEvent({
                calendar: calendarClient.calendar,
                calendarId: calendarClient.calendarId,
                eventId: targetEventId,
                summary: summary ?? undefined,
                startDateTime,
                endDateTime,
                timeZone: tzFinal,
            });

            return {
                ok: true,
                updatedOnGoogle: true,
                calendar_id: calendarClient.calendarId,
                event_id: targetEventId,
                scope: scopeFinal,
            };
        });

        // Se bloqueou, devolvemos 403 para ficar claro
        if ((result as any)?.ok === false && (result as any)?.error === 'bia_event_blocked') {
            return res.status(403).json(result);
        }

        return res.json(result);
    } catch (err) {
        if (isGoogleRateLimitError(err)) {
            return res.status(429).json({ ok: false, error: 'rate_limited' });
        }
        console.error('Erro em /google-events/patch', err);
        return res.status(500).json({ ok: false, error: 'internal_error' });
    }
});

googleEventsRouter.post('/google-events/delete', async (req, res) => {
    try {
        const { phone, event_id, scope } = req.body as {
            phone?: string;
            event_id?: string;
            scope?: 'this' | 'series' | string;
        };

        if (!phone || !event_id) {
            return res.status(400).json({ ok: false, error: 'missing_fields' });
        }

        const account = await findActiveCalendarAccountForPhone(String(phone));
        if (!account) {
            return res.json({ ok: false, error: 'no_calendar_account' });
        }

        const calendarClient = buildCalendarClientFromAccount(account);
        if (!calendarClient) {
            return res.json({ ok: false, error: 'invalid_tokens' });
        }

        const queueKey = `calendar:${account.id}`;

        const result = await enqueueThrottledRedis(queueKey, 800, async () => {
            let ev;
            try {
                ev = await getEvent({
                    calendar: calendarClient.calendar,
                    calendarId: calendarClient.calendarId,
                    eventId: String(event_id),
                });
            } catch (e: any) {
                const status = Number(e?.code || e?.response?.status || 0);
                if (status === 404) {
                    return { ok: true, deletedOnGoogle: false, reason: 'not_found' };
                }
                throw e;
            }

            if (isBiaManagedEvent(ev)) {
                return { ok: false, error: 'bia_event_blocked' };
            }

            let targetEventId = String(event_id);
            const scopeFinal = (scope === 'series' ? 'series' : 'this') as 'this' | 'series';
            if (scopeFinal === 'series' && ev.recurringEventId) {
                targetEventId = ev.recurringEventId;
            }

            await deleteEvent({
                calendar: calendarClient.calendar,
                calendarId: calendarClient.calendarId,
                eventId: targetEventId,
            });

            return {
                ok: true,
                deletedOnGoogle: true,
                calendar_id: calendarClient.calendarId,
                event_id: targetEventId,
                scope: scopeFinal,
            };
        });

        if ((result as any)?.ok === false && (result as any)?.error === 'bia_event_blocked') {
            return res.status(403).json(result);
        }

        return res.json(result);
    } catch (err) {
        if (isGoogleRateLimitError(err)) {
            return res.status(429).json({ ok: false, error: 'rate_limited' });
        }
        console.error('Erro em /google-events/delete', err);
        return res.status(500).json({ ok: false, error: 'internal_error' });
    }
});
