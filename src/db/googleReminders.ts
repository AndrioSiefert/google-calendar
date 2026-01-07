import { pool } from './pool';

export type GoogleReminderJoinRow = {
    id: string;
    phone: string;
    reminder_id: string | null;
    content: string;
    due_at: string;
    tz: string;
    google_event_id: string | null;
    calendar_account_id: string;
    calendar_id: string | null;
    access_token: string | null;
    refresh_token: string | null;
    token_expires_at?: string | null;
};

export async function insertGoogleReminderLink(params: {
    phone: string;
    calendarAccountId: string;
    reminderId: string;
    content: string;
    dueAt: string;
    tz: string;
    googleEventId: string;
}) {
    const { rows } = await pool.query(
        `
        insert into public.google_reminders (
          phone,
          calendar_account_id,
          reminder_id,
          content,
          due_at,
          sent_at,
          tz,
          google_event_id
        ) values (
          $1, $2, $3, $4, $5, now(), $6, $7
        )
        returning id
      `,
        [
            params.phone,
            params.calendarAccountId,
            params.reminderId,
            params.content,
            params.dueAt,
            params.tz,
            params.googleEventId,
        ],
    );

    return { id: rows?.[0]?.id as string };
}

export async function findGoogleReminderByReminderId(params: { phone: string; reminderId: string }) {
    const { rows } = await pool.query(
        `
      select
        gr.id,
        gr.phone,
        gr.reminder_id,
        gr.content,
        gr.due_at,
        gr.tz,
        gr.google_event_id,
        gr.calendar_account_id,
        ca.calendar_id,
        ca.access_token,
        ca.refresh_token,
        ca.token_expires_at
      from public.google_reminders gr
      join public.calendar_accounts ca
        on ca.id = gr.calendar_account_id
      where gr.reminder_id = $1
        and gr.phone = $2
        and ca.active = true
      order by gr.created_at desc
      limit 1
    `,
        [params.reminderId, params.phone],
    );

    return (rows?.[0] as GoogleReminderJoinRow | undefined) ?? null;
}

export async function updateGoogleReminderLocal(params: {
    id: string;
    phone: string;
    content: string;
    dueAt: string;
    tz: string;
}) {
    await pool.query(
        `
      update public.google_reminders
      set content = $3,
          due_at  = $4,
          tz      = $5
      where id = $1
        and phone = $2
    `,
        [params.id, params.phone, params.content, params.dueAt, params.tz],
    );
}

export async function deleteGoogleReminderLocal(params: { id: string; phone: string }) {
    await pool.query(
        `
      delete from public.google_reminders
      where id = $1
        and phone = $2
    `,
        [params.id, params.phone],
    );
}
