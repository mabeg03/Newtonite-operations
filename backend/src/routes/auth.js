import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.post('/login', async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
    const [rows] = await pool.query('SELECT id,name,email,password_hash,role FROM users WHERE email=?', [email]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Email or password is incorrect.' });
    }
    const token = jwt.sign({ id: user.id, name: user.name, email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '8h' });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err) { next(err); }
});

router.get('/me', authenticate, async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT id,name,email,role,created_at FROM users WHERE id=?', [req.user.id]);
    if (!rows.length) return res.status(401).json({ error: 'Account no longer exists.' });
    res.json({ user: rows[0] });
  } catch (err) { next(err); }
});

export default router;
