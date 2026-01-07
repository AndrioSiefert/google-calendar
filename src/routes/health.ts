import { Router } from 'express';
import { pool } from '../db/pool';

export const healthRouter = Router();

healthRouter.get('/health', async (_req, res) => {
    try {
        const { rows } = await pool.query('select now() as now');
        res.json({ ok: true, service: 'bia-calendar-auth', db_time: rows[0].now });
    } catch (err) {
        console.error('Erro checando DB:', err);
        res.status(500).json({ ok: false, error: 'db_error' });
    }
});
