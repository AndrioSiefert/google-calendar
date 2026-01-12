import express from 'express';
import cors from 'cors';

import { assertRequiredEnv, PORT } from './env';
import { pagesRouter } from './routes/pages';
import { healthRouter } from './routes/health';
import { calendarLinkRouter } from './routes/calendarLink';
import { googleRemindersRouter } from './routes/googleReminders';
import { googleEventsRouter } from './routes/googleEvents';

assertRequiredEnv();

const app = express();
app.set('trust proxy', true);
app.use(cors());
app.use(express.json());

// Páginas
app.use(pagesRouter);

// Healthcheck
app.use(healthRouter);

// OAuth Google
app.use(calendarLinkRouter);

// Endpoints Google Calendar (create/update/delete)
app.use(googleRemindersRouter);

// Endpoints Google Calendar (list/visualização)
app.use(googleEventsRouter);

app.listen(PORT, () => {
    console.log(`bia-calendar-auth rodando na porta ${PORT}`);
});
