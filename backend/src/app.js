import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import authRoutes from './routes/auth.js';
import teamRoutes from './routes/teams.js';
import workItemRoutes from './routes/workItems.js';
import { notFound, errorHandler } from './middleware/errors.js';

export const app = express();
app.use(helmet());
const allowedOrigins = (
    process.env.FRONTEND_ORIGIN || 'http://localhost:5173'
)
    .split(',')
    .map(origin => origin.trim());

app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: '1mb' }));
app.use('/api/auth/login', rateLimit({ windowMs: 15*60*1000, limit: 30, standardHeaders: true, legacyHeaders: false }));
app.get('/api/health', (req,res) => res.json({status:'ok'}));
app.use('/api/auth', authRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/work-items', workItemRoutes);
app.use(notFound);
app.use(errorHandler);
