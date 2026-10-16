import { Router } from 'express';
import { pool } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { assertItemAccess, createWorkItem, getItemById, getUserTeamIds, updateWorkItem, addComment, claimWorkItem } from '../services/workItems.js';

const router = Router();
router.use(authenticate);
const statuses = new Set(['OPEN','IN_PROGRESS','AWAITING_APPROVAL','BLOCKED','RESOLVED','CLOSED']);
const types = new Set(['INCIDENT','CUSTOMER_ISSUE','PAYMENT','COMPLIANCE','TASK']);
const priorities = new Set(['LOW','MEDIUM','HIGH','CRITICAL']);
const positiveId = value => /^\d+$/.test(String(value)) && Number(value) > 0;

router.get('/', async (req,res,next) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page || '1',10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit || '20',10) || 20));
    const where = [];
    const params = [];
    if (req.user.role !== 'ADMIN') {
      const teamIds = await getUserTeamIds(req.user.id);
      if (!teamIds.length) return res.json({items:[],pagination:{page,limit,total:0,pages:0}});
      where.push(`w.team_id IN (${teamIds.map(()=>'?').join(',')})`);
      params.push(...teamIds);
    }
    if (req.query.status && statuses.has(req.query.status)) { where.push('w.status=?'); params.push(req.query.status); }
    if (req.query.priority && priorities.has(req.query.priority)) { where.push('w.priority=?'); params.push(req.query.priority); }
    if (req.query.view === 'mine') { where.push('w.assignee_id=?'); params.push(req.user.id); }
    if (req.query.view === 'unassigned_urgent') { where.push('w.assignee_id IS NULL'); where.push("w.priority IN ('HIGH','CRITICAL')"); }
    if (req.query.view === 'awaiting_approval') { where.push("w.status='AWAITING_APPROVAL'"); }
    if (req.query.team_id && positiveId(req.query.team_id)) { where.push('w.team_id=?'); params.push(Number(req.query.team_id)); }
    if (req.query.assignee_id && positiveId(req.query.assignee_id)) { where.push('w.assignee_id=?'); params.push(Number(req.query.assignee_id)); }
    if (req.query.search) {
      const term = `%${String(req.query.search).slice(0,100)}%`;
      where.push('(w.title LIKE ? OR w.description LIKE ?)');
      params.push(term,term);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [[count]] = await pool.query(`SELECT COUNT(*) AS total FROM work_items w ${clause}`,params);
    const total = Number(count.total);
    const offset = (page-1)*limit;
    const [items] = await pool.query(
      `SELECT w.id,w.title,w.description,w.type,w.status,w.priority,w.team_id,t.name AS team_name,
              w.assignee_id,a.name AS assignee_name,w.created_by,c.name AS creator_name,
              w.due_at,w.version,w.created_at,w.updated_at
       FROM work_items w JOIN teams t ON t.id=w.team_id LEFT JOIN users a ON a.id=w.assignee_id
       JOIN users c ON c.id=w.created_by ${clause}
       ORDER BY FIELD(w.priority,'CRITICAL','HIGH','MEDIUM','LOW'), w.updated_at DESC
       LIMIT ? OFFSET ?`, [...params,limit,offset]);
    res.json({items,pagination:{page,limit,total,pages:Math.ceil(total/limit)}});
  } catch (err) { next(err); }
});

router.post('/', async (req,res,next) => {
  try {
    const { title, description='', type='TASK', priority='MEDIUM', team_id, assignee_id=null, due_at=null } = req.body;
    if (!String(title || '').trim() || String(title).length > 200) return res.status(422).json({error:'Title is required and must be at most 200 characters.'});
    if (!positiveId(team_id)) return res.status(422).json({error:'A valid team_id is required.'});
    if (!priorities.has(priority)) return res.status(422).json({error:'Priority is invalid.'});
    if (!types.has(type)) return res.status(422).json({error:'Type is invalid.'});
    if (assignee_id && !positiveId(assignee_id)) return res.status(422).json({error:'assignee_id must be a positive integer.'});
    const result = await createWorkItem(req.user,{title:String(title).trim(),description:String(description).slice(0,10000),type,priority,team_id:Number(team_id),assignee_id:assignee_id?Number(assignee_id):null,due_at}, req.get('Idempotency-Key'));
    res.status(result.replayed ? 200 : 201).json({item:result.item,replayed:result.replayed});
  } catch (err) { next(err); }
});

router.get('/:id', async (req,res,next) => {
  try {
    const item = await getItemById(req.params.id);
    if (!item) return res.status(404).json({error:'Work item not found.'});
    await assertItemAccess(req.user,item);
    const [comments] = await pool.query(
      `SELECT c.id,c.body,c.created_at,u.id AS author_id,u.name AS author_name
       FROM comments c JOIN users u ON u.id=c.author_id WHERE c.work_item_id=? ORDER BY c.created_at ASC`,[req.params.id]);
    res.json({item,comments});
  } catch (err) { next(err); }
});

router.patch('/:id', async (req,res,next) => {
  try {
    const { version, ...data } = req.body;
    if (!Number.isInteger(Number(version)) || Number(version) < 1) return res.status(422).json({error:'The version you last read is required.'});
    if (data.status && !statuses.has(data.status)) return res.status(422).json({error:'Status is invalid.'});
    if (data.type && !types.has(data.type)) return res.status(422).json({error:'Type is invalid.'});
    if (data.priority && !priorities.has(data.priority)) return res.status(422).json({error:'Priority is invalid.'});
    if (data.team_id !== undefined && !positiveId(data.team_id)) return res.status(422).json({error:'team_id must be a positive integer.'});
    if (data.assignee_id && !positiveId(data.assignee_id)) return res.status(422).json({error:'assignee_id must be a positive integer.'});
    if (data.title !== undefined && (!String(data.title).trim() || String(data.title).length > 200)) return res.status(422).json({error:'Title is required and must be at most 200 characters.'});
    const item = await updateWorkItem(req.user,req.params.id,{...data,version:Number(version)});
    res.json({item});
  } catch (err) { next(err); }
});


router.post('/:id/claim', async (req,res,next) => {
  try {
    const { version } = req.body;
    if (!Number.isInteger(Number(version)) || Number(version) < 1) return res.status(422).json({error:'The version you last read is required.'});
    const item = await claimWorkItem(req.user, req.params.id, Number(version));
    res.json({ item });
  } catch (err) { next(err); }
});

router.post('/:id/assign', async (req,res,next) => {
  try {
    const { version, assignee_id } = req.body;
    if (!Number.isInteger(Number(version)) || Number(version)<1) return res.status(422).json({error:'The version you last read is required.'});
    const item = await updateWorkItem(req.user,req.params.id,{version:Number(version),assignee_id:assignee_id || null});
    res.json({item});
  } catch (err) { next(err); }
});

router.post('/:id/comments', async (req,res,next) => {
  try {
    const body = String(req.body.body || '').trim();
    if (!body || body.length > 5000) return res.status(422).json({error:'Comment must contain 1–5000 characters.'});
    const comment = await addComment(req.user,req.params.id,body);
    res.status(201).json({comment});
  } catch (err) { next(err); }
});

router.get('/:id/activity', async (req,res,next) => {
  try {
    const item = await getItemById(req.params.id);
    if (!item) return res.status(404).json({error:'Work item not found.'});
    await assertItemAccess(req.user,item);
    const [activity] = await pool.query(
      `SELECT l.id,l.action,l.summary,l.details,l.created_at,u.id AS actor_id,u.name AS actor_name
       FROM activity_logs l JOIN users u ON u.id=l.actor_id
       WHERE l.work_item_id=? ORDER BY l.created_at DESC,l.id DESC LIMIT 200`,[req.params.id]);
    res.json({activity});
  } catch (err) { next(err); }
});

export default router;
