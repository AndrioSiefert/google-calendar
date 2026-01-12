import { Router } from 'express';
import { findActiveCalendarAccountForPhone } from '../db/calendarAccounts';
import { buildCalendarClientFromAccount, isGoogleRateLimitError, listEvents } from '../google/calendar';
import { normalizeToRfc3339 } from '../utils/time';
import { enqueueThrottledRedis } from '../utils/throttleQueueRedis';

export const googleEventsRouter = Router();


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
