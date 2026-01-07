import path from 'path';
import { Router } from 'express';
import { PROJECT_ROOT } from '../env';

export const pagesRouter = Router();

const indexHtml = path.join(PROJECT_ROOT, 'public', 'index.html');
const privacyHtml = path.join(PROJECT_ROOT, 'public', 'politica-privacidade.html');

pagesRouter.get('/', (_req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.sendFile(indexHtml);
});

pagesRouter.get('/politica-privacidade', (_req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.sendFile(privacyHtml);
});
