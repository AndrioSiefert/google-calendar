import { Router } from 'express';
import { findActiveCalendarAccountForPhone } from '../db/calendarAccounts';
import {
    deleteGoogleReminderLocal,
    findGoogleReminderByReminderId,
    insertGoogleReminderLink,
    updateGoogleReminderLocal,
} from '../db/googleReminders';
import { buildCalendarClientFromAccount, createEvent, deleteEvent, patchEvent } from '../google/calendar';
import { addMinutesIso, normalizeToRfc3339 } from '../utils/time';

export const googleRemindersRouter = Router();

googleRemindersRouter.post('/google-reminders/create', async (req, res) => {
    try {
        const { phone, content, due_at, tz, reminder_id } = req.body as {
            phone?: string;
            content?: string;
            due_at?: string;
            tz?: string;
            reminder_id?: string;
        };

        if (!phone || !content || !due_at || !reminder_id) {
            return res.status(400).json({ ok: false, error: 'missing_fields' });
        }

        const tzFinal = tz || 'America/Sao_Paulo';
        const startDateTime = normalizeToRfc3339(due_at);

        const account = await findActiveCalendarAccountForPhone(phone);
        if (!account) {
            return res.json({ ok: false, error: 'no_calendar_account' });
        }

        const calendarClient = buildCalendarClientFromAccount(account);
        if (!calendarClient) {
            return res.json({ ok: false, error: 'invalid_tokens' });
        }

        const { calendar, calendarId } = calendarClient;

        const created = await createEvent({
            calendar,
            calendarId,
            summary: content,
            description: 'Lembrete criado pela BIA 🐝',
            startDateTime,
            endDateTime: addMinutesIso(startDateTime, 30),
            timeZone: tzFinal,
        });

        if (!created.id) {
            return res.status(500).json({ ok: false, error: 'no_event_id' });
        }

        const insertResult = await insertGoogleReminderLink({
            phone,
            calendarAccountId: account.id,
            reminderId: reminder_id,
            content,
            dueAt: due_at,
            tz: tzFinal,
            googleEventId: created.id,
        });

        return res.json({
            ok: true,
            google_reminder_id: insertResult.id,
            google_event_id: created.id,
            calendar_id: calendarId,
        });
    } catch (err) {
        console.error('Erro em /google-reminders/create', err);
        return res.status(500).json({ ok: false, error: 'internal_error' });
    }
});

googleRemindersRouter.post('/google-reminders/update', async (req, res) => {
    try {
        const { phone, id, reminder_id, content, due_at, tz } = req.body as {
            phone?: string;
            id?: string; // compat com n8n antigo
            reminder_id?: string;
            content?: string;
            due_at?: string;
            tz?: string;
        };

        const reminderId = reminder_id || id;

        if (!phone || !reminderId) {
            return res.status(400).json({ ok: false, error: 'missing_fields' });
        }

        if (!content && !due_at && !tz) {
            return res.status(400).json({ ok: false, error: 'missing_update_fields' });
        }

        const row = await findGoogleReminderByReminderId({ phone, reminderId });

        if (!row) {
            return res.json({ ok: true, updatedLocally: false, updatedOnGoogle: false, reason: 'not_found' });
        }

        const contentFinal = content ?? row.content;
        const dueAtFinal = due_at ?? String(row.due_at);
        const tzFinal = tz || row.tz || 'America/Sao_Paulo';

        const calendarId = row.calendar_id || 'primary';
        const googleEventId = row.google_event_id;

        let updatedOnGoogle = false;

        if (googleEventId && row.refresh_token) {
            const calendarClient = buildCalendarClientFromAccount({
                calendarId,
                accessToken: row.access_token,
                refreshToken: row.refresh_token,
                tokenExpiresAt: row.token_expires_at ?? null,
            });

            if (calendarClient) {
                const { calendar } = calendarClient;
                const startDateTime = normalizeToRfc3339(String(dueAtFinal));
                try {
                    await patchEvent({
                        calendar,
                        calendarId,
                        eventId: googleEventId,
                        summary: contentFinal,
                        startDateTime,
                        endDateTime: addMinutesIso(startDateTime, 30),
                        timeZone: tzFinal,
                    });
                    updatedOnGoogle = true;
                } catch (googleErr) {
                    console.error('Erro atualizando evento no Google Calendar:', googleErr);
                    return res.status(500).json({ ok: false, error: 'google_update_error' });
                }
            }
        }

        await updateGoogleReminderLocal({
            id: row.id,
            phone,
            content: contentFinal,
            dueAt: dueAtFinal,
            tz: tzFinal,
        });

        return res.json({
            ok: true,
            updatedLocally: true,
            updatedOnGoogle,
            google_event_id: googleEventId,
            calendar_id: calendarId,
        });
    } catch (err) {
        console.error('Erro em /google-reminders/update', err);
        return res.status(500).json({ ok: false, error: 'internal_error' });
    }
});

googleRemindersRouter.post('/google-reminders/delete', async (req, res) => {
    try {
        const { phone, id, reminder_id } = req.body as {
            phone?: string;
            id?: string; // compat com n8n antigo
            reminder_id?: string;
        };

        const reminderId = reminder_id || id;

        if (!phone || !reminderId) {
            return res.status(400).json({ ok: false, error: 'missing_fields' });
        }

        const row = await findGoogleReminderByReminderId({ phone, reminderId });

        if (!row) {
            return res.json({ ok: true, deletedLocally: false, deletedOnGoogle: false, reason: 'not_found' });
        }

        const googleEventId = row.google_event_id;
        const calendarId = row.calendar_id || 'primary';

        let deletedOnGoogle = false;

        if (googleEventId && row.refresh_token) {
            const calendarClient = buildCalendarClientFromAccount({
                calendarId,
                accessToken: row.access_token,
                refreshToken: row.refresh_token,
                tokenExpiresAt: row.token_expires_at ?? null,
            });

            if (calendarClient) {
                const { calendar } = calendarClient;
                try {
                    await deleteEvent({ calendar, calendarId, eventId: googleEventId });
                    deletedOnGoogle = true;
                } catch (googleErr) {
                    console.error('Erro deletando evento no Google Calendar:', googleErr);
                    return res.status(500).json({ ok: false, error: 'google_delete_error' });
                }
            }
        }

        await deleteGoogleReminderLocal({ id: row.id, phone });

        return res.json({ ok: true, deletedLocally: true, deletedOnGoogle });
    } catch (err) {
        console.error('Erro em /google-reminders/delete', err);
        return res.status(500).json({ ok: false, error: 'internal_error' });
    }
});
