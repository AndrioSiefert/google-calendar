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
    const { code } = req.params;
  
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
  
    const goUrl = `/calendar/link/${encodeURIComponent(code)}/go`;
  
    return res.send(`<!doctype html>
  <html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Conectando...</title>
  </head>
  <body style="font-family:system-ui;margin:24px">
    <p>Redirecionando para o Google...</p>
    <p>Se não redirecionar automaticamente, clique aqui:</p>
    <p><a href="${goUrl}">Continuar</a></p>
    <script>
      window.location.replace(${JSON.stringify(goUrl)});
    </script>
  </body>
  </html>`);
  });
  

  calendarLinkRouter.get('/calendar/link/:code/go', async (req, res) => {
    const { code } = req.params;
  
    const redis = getRedis();
    if (!redis) {
      res.status(500).setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(renderErrorPage('Serviço indisponível', 'Redis não configurado.'));
    }
  
    const key = `calendar:link:${code}`;
    const phone = await redis.get(key);
  
    if (!phone) {
      res.status(400).setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(renderErrorPage('Link expirou', 'Esse link de conexão expirou. Volte no WhatsApp e peça para eu gerar um novo.'));
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
  });
  