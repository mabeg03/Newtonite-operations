import { pool } from '../db.js';
import { canAccessWorkItem, canManageWorkItem } from '../utils/authorization.js';
import { assertTransition } from '../utils/workflow.js';

export async function getUserTeamIds(userId) {
  const [rows] = await pool.query('SELECT team_id FROM team_members WHERE user_id=?', [userId]);
  return rows.map(row => Number(row.team_id));
}

export async function getItemById(id) {
  const [rows] = await pool.query(
    `SELECT w.*, t.name AS team_name, a.name AS assignee_name, c.name AS creator_name
     FROM work_items w JOIN teams t ON t.id=w.team_id
     LEFT JOIN users a ON a.id=w.assignee_id JOIN users c ON c.id=w.created_by WHERE w.id=?`, [id]);
  return rows[0] || null;
}

export async function assertItemAccess(user, item, manage = false) {
  const teamIds = await getUserTeamIds(user.id);
  const allowed = manage ? canManageWorkItem(user, item, teamIds) : canAccessWorkItem(user, item, teamIds);
  if (!allowed) {
    const error = new Error('You do not have access to this work item.');
    error.status = 403;
    throw error;
  }
}

export async function logActivity(conn, itemId, actorId, action, summary, details = null) {
  await conn.query(
    'INSERT INTO activity_logs(work_item_id,actor_id,action,summary,details) VALUES(?,?,?,?,?)',
    [itemId, actorId, action, summary, details ? JSON.stringify(details) : null]
  );
}

export async function createWorkItem(user, data, idempotencyKey) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    if (idempotencyKey) {
      const [existing] = await conn.query(
        'SELECT response_json FROM idempotency_keys WHERE user_id=? AND idem_key=? FOR UPDATE',
        [user.id, idempotencyKey]);
      if (existing.length) {
        await conn.commit();
        const saved = existing[0].response_json;
        return { item: typeof saved === 'string' ? JSON.parse(saved) : saved, replayed: true };
      }
    }
    const [members] = await conn.query('SELECT team_id FROM team_members WHERE user_id=? AND team_id=?', [user.id, data.team_id]);
    if (user.role !== 'ADMIN' && !members.length) {
      const error = new Error('You must belong to the selected team to create work there.');
      error.status = 403;
      throw error;
    }
    if (data.assignee_id) {
      const [assigneeMembership] = await conn.query('SELECT 1 FROM team_members WHERE user_id=? AND team_id=?', [data.assignee_id, data.team_id]);
      if (!assigneeMembership.length) {
        const error = new Error('Assignee must be a member of the selected team.');
        error.status = 422;
        throw error;
      }
    }
    const [result] = await conn.query(
      `INSERT INTO work_items(title,description,type,status,priority,team_id,assignee_id,created_by,due_at)
       VALUES(?,?,?,'OPEN',?,?,?,?,?)`,
      [data.title, data.description || '', data.type || 'TASK', data.priority || 'MEDIUM', data.team_id, data.assignee_id || null, user.id, data.due_at || null]);
    await logActivity(conn, result.insertId, user.id, 'CREATED', `Created work item: ${data.title}`, { title: data.title });
    const [rows] = await conn.query('SELECT * FROM work_items WHERE id=?', [result.insertId]);
    const item = rows[0];
    if (idempotencyKey) {
      await conn.query('INSERT INTO idempotency_keys(user_id,idem_key,response_json) VALUES(?,?,?)',
        [user.id, idempotencyKey, JSON.stringify(item)]);
    }
    await conn.commit();
    return { item, replayed: false };
  } catch (error) {
    await conn.rollback();
    // If two requests race on the unique (user_id, idem_key) constraint,
    // the losing transaction rolls back its work item and replays the winner's response.
    if (idempotencyKey && error.code === 'ER_DUP_ENTRY') {
      const [existing] = await conn.query(
        'SELECT response_json FROM idempotency_keys WHERE user_id=? AND idem_key=?',
        [user.id, idempotencyKey]
      );
      if (existing.length) return { item: JSON.parse(existing[0].response_json), replayed: true };
    }
    throw error;
  } finally {
    conn.release();
  }
}

export async function updateWorkItem(user, id, data) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query('SELECT * FROM work_items WHERE id=? FOR UPDATE', [id]);
    const current = rows[0];
    if (!current) {
      const error = new Error('Work item not found.');
      error.status = 404;
      throw error;
    }
    const teamIds = await getUserTeamIds(user.id);
    if (!canManageWorkItem(user, current, teamIds)) {
      const error = new Error('You do not have permission to update this work item.');
      error.status = 403;
      throw error;
    }
    if (Number(data.version) !== Number(current.version)) {
      const error = new Error('This work item changed since you opened it. Refresh and review the latest version before saving.');
      error.status = 409;
      throw error;
    }
    const nextStatus = data.status ?? current.status;
    assertTransition(current.status, nextStatus);
    if (current.status === 'AWAITING_APPROVAL' && nextStatus === 'RESOLVED' && !['ADMIN','LEAD'].includes(user.role)) {
      const error = new Error('Only a team Lead or Admin can approve this work item.');
      error.status = 403;
      throw error;
    }
    const nextTeam = data.team_id ?? current.team_id;
    if (user.role !== 'ADMIN' && !teamIds.includes(Number(nextTeam))) {
      const error = new Error('You cannot move work to a team you do not belong to.');
      error.status = 403;
      throw error;
    }
    const nextAssignee = data.assignee_id === undefined ? current.assignee_id : (data.assignee_id || null);
    if (nextAssignee) {
      const [member] = await conn.query('SELECT 1 FROM team_members WHERE user_id=? AND team_id=?', [nextAssignee, nextTeam]);
      if (!member.length) {
        const error = new Error('Assignee must be a member of the selected team.');
        error.status = 422;
        throw error;
      }
    }
    const fields = {
      title: data.title ?? current.title,
      description: data.description ?? current.description,
      type: data.type ?? current.type ?? 'TASK',
      status: nextStatus,
      priority: data.priority ?? current.priority,
      team_id: nextTeam,
      assignee_id: nextAssignee,
      due_at: data.due_at === undefined ? current.due_at : (data.due_at || null)
    };
    const changes = {};
    for (const key of Object.keys(fields)) {
      if (String(fields[key] ?? '') !== String(current[key] ?? '')) changes[key] = { from: current[key], to: fields[key] };
    }
    await conn.query(
      `UPDATE work_items SET title=?,description=?,type=?,status=?,priority=?,team_id=?,assignee_id=?,due_at=?,version=version+1
       WHERE id=? AND version=?`,
      [fields.title, fields.description, fields.type, fields.status, fields.priority, fields.team_id, fields.assignee_id, fields.due_at, id, current.version]);
    if (Object.keys(changes).length) {
      const summary = `Updated work item: ${Object.keys(changes).join(', ')}`;
      await logActivity(conn, id, user.id, 'UPDATED', summary, changes);
    }
    const [updated] = await conn.query('SELECT * FROM work_items WHERE id=?', [id]);
    await conn.commit();
    return updated[0];
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}


export async function claimWorkItem(user, id, expectedVersion) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query('SELECT * FROM work_items WHERE id=? FOR UPDATE', [id]);
    const item = rows[0];
    if (!item) {
      const error = new Error('Work item not found.');
      error.status = 404;
      throw error;
    }
    const [teamRows] = await conn.query('SELECT team_id FROM team_members WHERE user_id=?', [user.id]);
    const teamIds = teamRows.map(row => Number(row.team_id));
    if (!canAccessWorkItem(user, item, teamIds)) {
      const error = new Error('You do not have access to this work item.');
      error.status = 403;
      throw error;
    }
    if (Number(item.version) !== Number(expectedVersion)) {
      const error = new Error('This work item changed. Refresh and try again.');
      error.status = 409;
      throw error;
    }
    if (item.assignee_id !== null) {
      const error = new Error('This work item has already been claimed.');
      error.status = 409;
      throw error;
    }
    const [result] = await conn.query(
      'UPDATE work_items SET assignee_id=?,version=version+1 WHERE id=? AND assignee_id IS NULL AND version=?',
      [user.id, id, expectedVersion]
    );
    if (result.affectedRows !== 1) {
      const error = new Error('Another user claimed this item first. Refresh to see the latest owner.');
      error.status = 409;
      throw error;
    }
    await logActivity(conn, id, user.id, 'CLAIMED', 'Claimed responsibility for this work item', { assignee_id: user.id });
    const [updated] = await conn.query('SELECT * FROM work_items WHERE id=?', [id]);
    await conn.commit();
    return updated[0];
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function addComment(user, id, body) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [items] = await conn.query('SELECT * FROM work_items WHERE id=? FOR UPDATE', [id]);
    if (!items.length) {
      const error = new Error('Work item not found.');
      error.status = 404;
      throw error;
    }
    const item = items[0];
    const [teams] = await conn.query('SELECT team_id FROM team_members WHERE user_id=?', [user.id]);
    if (!canAccessWorkItem(user, item, teams.map(t=>Number(t.team_id)))) {
      const error = new Error('You do not have access to this work item.');
      error.status = 403;
      throw error;
    }
    const [result] = await conn.query('INSERT INTO comments(work_item_id,author_id,body) VALUES(?,?,?)', [id,user.id,body]);
    await logActivity(conn, id, user.id, 'COMMENTED', 'Added a comment', { comment_id: result.insertId });
    const [comments] = await conn.query(
      `SELECT c.id,c.body,c.created_at,u.id AS author_id,u.name AS author_name
       FROM comments c JOIN users u ON u.id=c.author_id WHERE c.id=?`, [result.insertId]);
    await conn.commit();
    return comments[0];
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}
