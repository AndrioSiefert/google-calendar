export const PROJECT_ROOT = process.env.PROJECT_ROOT || process.cwd();

export const PORT = Number(process.env.PORT || 3000);

export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
export const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';

export const GOOGLE_REDIRECT_URI =
    process.env.GOOGLE_REDIRECT_URI || 'https://calendar.gestaosincronia.com.br/calendar/callback';

export const SUPABASE_DB_URL = process.env.SUPABASE_DB_URL || '';

export const N8N_CALENDAR_CONNECTED_WEBHOOK_URL = process.env.N8N_CALENDAR_CONNECTED_WEBHOOK_URL || '';
export const N8N_WEBHOOK_SECRET = process.env.N8N_WEBHOOK_SECRET || '';

export const BIA_WHATSAPP_NUMBER = (process.env.BIA_WHATSAPP_NUMBER || '').replace(/\D/g, '');

export const STATE_SIGNING_SECRET = process.env.STATE_SIGNING_SECRET || GOOGLE_CLIENT_SECRET || '';

export const REDIS_URL = process.env.REDIS_URL || '';

export function assertRequiredEnv() {
    const missing: string[] = [];
    if (!GOOGLE_CLIENT_ID) missing.push('GOOGLE_CLIENT_ID');
    if (!GOOGLE_CLIENT_SECRET) missing.push('GOOGLE_CLIENT_SECRET');
    if (!SUPABASE_DB_URL) missing.push('SUPABASE_DB_URL');
    if (!STATE_SIGNING_SECRET) missing.push('STATE_SIGNING_SECRET');

    if (missing.length) {
        console.error('❌ Variáveis de ambiente obrigatórias ausentes:', missing.join(', '));
        process.exit(1);
    }
}

export const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || ''; 