import { pool } from './pool';

export async function upsertCalendarAccount(params: {
    phone: string;
    providerAccountId: string;
    email: string | null;
    accessToken: string;
    refreshToken: string;
    expiresAt: Date;
}): Promise<{ id: string; calendarId: string; email: string | null }> {
    const client = await pool.connect();
    try {
        const { rows } = await client.query(
            `
      insert into public.calendar_accounts (
        phone,
        provider,
        provider_account_id,
        email,
        access_token,
        refresh_token,
        token_expires_at,
        calendar_id,
        active
      ) values (
        $1, 'google', $2, $3, $4, $5, $6, 'primary', true
      )
      on conflict (phone, provider, calendar_id)
      do update set
        provider_account_id = excluded.provider_account_id,
        email               = excluded.email,
        access_token        = excluded.access_token,
        refresh_token       = case
                                when excluded.refresh_token is not null and excluded.refresh_token <> ''
                                  then excluded.refresh_token
                                else public.calendar_accounts.refresh_token
                              end,
        token_expires_at    = excluded.token_expires_at,
        active              = true,
        updated_at          = now()
      returning id, calendar_id, email
      `,
            [
                params.phone,
                params.providerAccountId,
                params.email,
                params.accessToken,
                params.refreshToken,
                params.expiresAt.toISOString(),
            ],
        );

        const row = rows?.[0] as { id: string; calendar_id: string | null; email: string | null } | undefined;

        return {
            id: row?.id || '',
            calendarId: row?.calendar_id || 'primary',
            email: row?.email ?? params.email ?? null,
        };
    } finally {
        client.release();
    }
}

export async function findActiveCalendarAccountForPhone(phone: string): Promise<
    | null
    | {
          id: string;
          calendarId: string;
          accessToken: string | null;
          refreshToken: string | null;
          tokenExpiresAt: string | null;
      }
> {
    const { rows } = await pool.query(
        `
      select
        id,
        calendar_id,
        access_token,
        refresh_token,
        token_expires_at
      from public.calendar_accounts
      where phone = $1
        and provider = 'google'
        and active = true
      order by updated_at desc
      limit 1
    `,
        [phone],
    );

    if (!rows.length) return null;

    return {
        id: rows[0].id as string,
        calendarId: (rows[0].calendar_id as string) || 'primary',
        accessToken: (rows[0].access_token as string) ?? null,
        refreshToken: (rows[0].refresh_token as string) ?? null,
        tokenExpiresAt: (rows[0].token_expires_at as string) ?? null,
    };
}
