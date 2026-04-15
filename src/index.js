import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { initSendgrid } from './utils/email.js';
import { authRoutes } from './routes/auth.js';
import { metaRoutes } from './routes/meta.js';
import { User } from './models/User.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.join(__dirname, '..', '.env.development.local') });
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const PORT = Number(process.env.PORT) || 3000;
const {
  DB_URI,
  DB_NAME,
  JWT_SECRET,
  JWT_EXPIRES_IN,
  CLIENT_BASE_URL,
  SEND_GRID_API_KEY,
  FROM_EMAIL,
  EMAIL_FROM_NAME,
} = process.env;

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return v;
}

requireEnv('DB_URI');
requireEnv('JWT_SECRET');
requireEnv('CLIENT_BASE_URL');
requireEnv('SEND_GRID_API_KEY');
requireEnv('FROM_EMAIL');
requireEnv('EMAIL_FROM_NAME');

initSendgrid(SEND_GRID_API_KEY);

const app = express();

app.set('trust proxy', 1);

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

app.use(
  cors({
    origin: CLIENT_BASE_URL,
    credentials: true,
  })
);

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

const jwtExpiresIn = JWT_EXPIRES_IN || '15d';

app.use(
  '/api/auth',
  authLimiter,
  authRoutes({
    jwtSecret: JWT_SECRET,
    jwtExpiresIn,
    sendGrid: { fromEmail: FROM_EMAIL, fromName: EMAIL_FROM_NAME },
    fromEmail: FROM_EMAIL,
    fromName: EMAIL_FROM_NAME,
  })
);

app.use('/api/meta', metaRoutes());

app.get('/api/health', (_req, res) => {
  const routes = [];
  app._router?.stack?.forEach((layer) => {
    if (layer.name === 'router' && layer.handle?.stack) {
      layer.handle.stack.forEach((r) => {
        if (r.route) {
          const methods = Object.keys(r.route.methods).join(',').toUpperCase();
          routes.push(`${methods} ${layer.regexp.toString().match(/\/[a-z/]*/)?.[0] || '?'}${r.route.path}`);
        }
      });
    }
  });
  res.json({ ok: true, routes });
});

app.use((_req, res, _next) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

app.use((err, _req, res, _next) => {
  console.error('Unhandled server error:', err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

async function migrateUserMembershipCodeIndex() {
  try {
    await User.updateMany({ membershipCode: null }, { $unset: { membershipCode: '' } });
    await User.collection.dropIndex('membershipCode_1');
  } catch (error) {
    if (
      error?.codeName !== 'IndexNotFound' &&
      !String(error?.message || '').includes('index not found')
    ) {
      console.error('User index migration warning:', error.message || error);
    }
  }
  await User.syncIndexes();
}

mongoose.connection.once('open', () => {
  migrateUserMembershipCodeIndex().catch(console.error);
});

await mongoose.connect(DB_URI, { dbName: DB_NAME || undefined });

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
