import { Router } from 'express';
import { pool } from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);
router.get('/', async (req,res,next) => {
  try {
    const [rows] = req.user.role === 'ADMIN'
      ? await pool.query('SELECT id,name FROM teams ORDER BY name')
      : await pool.query('SELECT t.id,t.name FROM teams t JOIN team_members tm ON tm.team_id=t.id WHERE tm.user_id=? ORDER BY t.name',[req.user.id]);
    res.json({ teams: rows });
  } catch (err) { next(err); }
});
router.get('/:id/members', async (req,res,next) => {
  try {
    if (req.user.role !== 'ADMIN') {
      const [membership] = await pool.query('SELECT 1 FROM team_members WHERE team_id=? AND user_id=?',[req.params.id,req.user.id]);
      if (!membership.length) return res.status(403).json({error:'You do not have access to this team.'});
    }
    const [rows] = await pool.query(
      `SELECT u.id,u.name,u.email,u.role FROM users u JOIN team_members tm ON tm.user_id=u.id WHERE tm.team_id=? ORDER BY u.name`,
      [req.params.id]);
    res.json({ members: rows });
  } catch (err) { next(err); }
});
export default router;
