import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const runMigrations = async () => {
  try {
    const { runner: migrate } = await import('node-pg-migrate');

    let retries = 5;
    while (retries) {
      try {
        await pool.query('SELECT NOW()');
        break;
      } catch (err) {
        console.log(`Database not ready, retrying in 5s... (${retries} left)`);
        retries -= 1;
        await new Promise((res) => setTimeout(res, 5000));
      }
    }

    if (retries === 0) {
        throw new Error("Could not connect to database after 5 attempts");
    }

    console.log('Starting database initialization...');
    console.log('Starting database migrations...');
    
    await migrate({
      databaseUrl: {
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT) || 5432,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
      },
      dir: path.join(__dirname, 'migrations'),
      direction: 'up',
      migrationsTable: 'pgmigrations',
      log: (msg) => console.log(msg),
    });

    console.log('Database initialized successfully.');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    pool.end();
  }
};

runMigrations();