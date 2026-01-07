import { Router } from 'express';
import { createOauthClient, fetchGoogleUserInfo, loginOauthClient } from '../google/oauth';
import { createState, decodeState } from '../state';
import { findActiveCalendarAccountForPhone, upsertCalendarAccount } from '../db/calendarAccounts';
import { notifyN8nCalendarConnected } from '../webhooks/n8n';
import { buildWhatsAppReturnLink, formatPhoneBR } from '../utils/phone';
import { renderErrorPage, renderSuccessPage } from '../templates';

export const calendarLinkRouter = Router();

calendarLinkRouter.post('/calendar/link/start', (req, res) => {
    try {
        const { phone } = req.body as { phone?: string };

        if (!phone) {
            return res.status(400).json({ error: 'phone obrigatório' });
        }

        const state = createState(phone);
        const REQUIRED_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

        const authorizationUrl = loginOauthClient.generateAuthUrl({
            access_type: 'offline',
            prompt: 'consent',
            include_granted_scopes: true,
            scope: [
                REQUIRED_CALENDAR_SCOPE,
                'https://www.googleapis.com/auth/userinfo.email',
                'https://www.googleapis.com/auth/userinfo.profile',
                'openid',
            ],
            state,
        });

        return res.json({ authorization_url: authorizationUrl });
    } catch (err) {
        console.error('Erro em /calendar/link/start', err);
        return res.status(500).json({ error: 'internal_error' });
    }
});

calendarLinkRouter.get('/calendar/callback', async (req, res) => {
    try {
        const code = req.query.code as string | undefined;
        const state = req.query.state as string | undefined;

        if (!code || !state) {
            res.status(400).setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.send(renderErrorPage('Requisição inválida', 'Faltando parâmetros (code/state).'));
        }

        const { phone } = decodeState(state);

        const oauthClient = createOauthClient();
        const { tokens } = await oauthClient.getToken(code);
        oauthClient.setCredentials(tokens);

        const accessToken = tokens.access_token ?? null;
        const refreshTokenFromGoogle = tokens.refresh_token ?? null;

        if (!accessToken) {
            console.error('Nenhum access_token retornado pelo Google:', tokens);
            res.status(500).setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.send(renderErrorPage('Falha ao conectar', 'Não foi possível obter access_token do Google.'));
        }

        const REQUIRED_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
        try {
            const info: any = await oauthClient.getTokenInfo(accessToken);
            const rawScopes: string =
                (Array.isArray(info?.scopes) ? info.scopes.join(' ') : info?.scope) || '';
            const granted = new Set(
                rawScopes
                    .split(' ')
                    .map((s) => s.trim())
                    .filter(Boolean),
            );

            if (!granted.has(REQUIRED_CALENDAR_SCOPE)) {
                console.error('Token sem escopo do Calendar:', { granted: Array.from(granted), info });
                res.status(400).setHeader('Content-Type', 'text/html; charset=utf-8');
                return res.send(
                    renderErrorPage(
                        'Permissão insuficiente',
                        'O Google não retornou a permissão necessária para criar eventos no Calendar. Remova o acesso do app na sua Conta Google e tente conectar novamente.',
                    ),
                );
            }
        } catch (e) {
            console.error('Falha ao validar escopos do token:', e);

            res.status(500).setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.send(renderErrorPage('Falha ao conectar', 'Não foi possível validar as permissões do Google.'));
        }

        const existing = await findActiveCalendarAccountForPhone(phone);
        const refreshToken = refreshTokenFromGoogle || existing?.refreshToken || null;

        if (!refreshToken) {
            console.error('Nenhum refresh_token retornado pelo Google e não há token salvo:', tokens);
            res.status(400).setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.send(
                renderErrorPage(
                    'Conexão incompleta',
                    'O Google não retornou o refresh_token (acesso permanente). Remova o acesso do app na sua Conta Google e conecte novamente.',
                ),
            );
        }

        const userInfo = await fetchGoogleUserInfo(oauthClient);
        const email = userInfo.email ?? null;
        const sub = userInfo.id ?? email ?? 'unknown';

        const expiresAt = tokens.expiry_date ? new Date(tokens.expiry_date) : new Date(Date.now() + 3600 * 1000);

        const saved = await upsertCalendarAccount({
            phone,
            providerAccountId: sub,
            email,
            accessToken,
            refreshToken,
            expiresAt,
        });

        await notifyN8nCalendarConnected({
            phone,
            calendarAccountId: saved.id,
            email: saved.email,
            calendarId: saved.calendarId,
        });

        const waReturn = buildWhatsAppReturnLink();

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send(
            renderSuccessPage({
                title: 'Google Calendar conectado! 🐝',
                subtitle: 'Você já pode voltar para o WhatsApp e usar a integração.',
                details: `Número: ${formatPhoneBR(phone)}${saved.email ? ` • Conta: ${saved.email}` : ''}`,
                returnLink: waReturn,
                returnLabel: 'Voltar para o WhatsApp',
            }),
        );
    } catch (err) {
        console.error('Erro em /calendar/callback', err);

        const msg = err instanceof Error ? err.message : 'unknown_error';
        const known: Record<string, string> = {
            state_invalid_format: 'O link de conexão parece estar incompleto.',
            state_invalid_signature: 'O link de conexão parece ter sido adulterado.',
            state_expired: 'O link expirou. Gere um novo link no WhatsApp e tente novamente.',
        };

        res.status(500).setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send(renderErrorPage('Erro ao conectar', known[msg] || 'Tente novamente em alguns instantes.'));
    }
});
