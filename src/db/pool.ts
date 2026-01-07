import { Pool } from 'pg';
import { SUPABASE_DB_URL } from '../env';

export const pool = new Pool({
    connectionString: SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false },
});
