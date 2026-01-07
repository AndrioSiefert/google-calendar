import { N8N_CALENDAR_CONNECTED_WEBHOOK_URL, N8N_WEBHOOK_SECRET } from '../env';
import { fetchJsonWithTimeout } from '../utils/http';

export async function notifyN8nCalendarConnected(params: {
    phone: string;
    calendarAccountId: string;
    email: string | null;
    calendarId: string;
}) {
    if (!N8N_CALENDAR_CONNECTED_WEBHOOK_URL) return;

    const payload = {
        event: 'calendar_connected',
        provider: 'google',
        phone: params.phone,
        calendar_account_id: params.calendarAccountId,
        calendar_id: params.calendarId,
        email: params.email,
        connected_at: new Date().toISOString(),
    };

    const headers: Record<string, string> = {};
    if (N8N_WEBHOOK_SECRET) {
        headers['x-bia-webhook-secret'] = N8N_WEBHOOK_SECRET;
    }

    try {
        const result = await fetchJsonWithTimeout(N8N_CALENDAR_CONNECTED_WEBHOOK_URL, payload, 4500, headers);
        if (!result.ok) {
            console.error('Webhook n8n respondeu erro:', result.status, result.text);
        }
    } catch (err) {
        console.error('Falha ao chamar webhook do n8n:', err);
    }
}
