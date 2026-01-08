import { Router } from 'express';
import crypto from 'crypto';
import { createOauthClient, fetchGoogleUserInfo, loginOauthClient } from '../google/oauth';
import { createState, decodeState } from '../state';
import { findActiveCalendarAccountForPhone, upsertCalendarAccount } from '../db/calendarAccounts';
import { notifyN8nCalendarConnected } from '../webhooks/n8n';
import { buildWhatsAppReturnLink, formatPhoneBR } from '../utils/phone';
import { renderErrorPage, renderSuccessPage } from '../templates';  
import { getRedis } from '../redis/client';
import { PUBLIC_BASE_URL } from '../env';

export const calendarLinkRouter = Router();

calendarLinkRouter.post('/calendar/link/start', async (req, res) => {
    try {
        const { phone } = req.body as { phone?: string };

        if (!phone) {
            return res.status(400).json({ error: 'phone obrigatório' });
        }

        const normalizedPhone = String(phone).replace(/\D/g, '');
        const redis = getRedis();

        if(redis){
            const linkCode = crypto.randomBytes(8).toString('base64url');
            const ttlSeconds = 15 * 60;

            await redis.set(`calendar:link:${linkCode}`, normalizedPhone, 'EX', ttlSeconds);

            const baseUrl = PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;

            return res.json({
                connect_url: `${baseUrl}/calendar/link/${linkCode}`,
                ttl_seconds: ttlSeconds,
            });
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

calendarLinkRouter.get('/calendar/link/:code', async (req, res) => {
    try {
        const { code } = req.params as { code: string };
        const redis = getRedis();

        if (!redis) {
            res.status(500).setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.send(renderErrorPage('Serviço indisponível', 'Redis não está configurado para gerar links curtos.'));
        }

        const key = `calendar:link:${code}`;
        const phone = await redis.get(key);

        if (!phone) {
            res.status(400).setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.send(
                renderErrorPage('Link expirou', 'Esse link de conexão expirou. Volte no WhatsApp e peça para eu gerar um novo.'),
            );
        }
        await redis.del(key);

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

        return res.redirect(302, authorizationUrl);
    } catch (err) {
        console.error('Erro em /calendar/link/:code', err);
        res.status(500).setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send(renderErrorPage('Erro interno', 'Não foi possível iniciar a conexão com o Google.'));
    }
});

