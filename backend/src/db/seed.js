import bcrypt from 'bcryptjs';
import { pool } from '../db.js';

const users = [
  ['Newtonite Admin','admin@newtonite.local','Admin123!','ADMIN'],
  ['Team Manager','manager@newtonite.local','Manager123!','MANAGER'],
  ['Team Lead','lead@newtonite.local','Lead123!','LEAD'],
  ['Team Member','member@newtonite.local','Member123!','MEMBER']
];
const conn = await pool.getConnection();
try {
  await conn.beginTransaction();
  const ids = {};
  for (const [name,email,password,role] of users) {
    const hash = await bcrypt.hash(password, 12);
    await conn.query(
      `INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)
       ON DUPLICATE KEY UPDATE name=VALUES(name), role=VALUES(role)`,
      [name,email,hash,role]
    );
    const [[row]] = await conn.query('SELECT id FROM users WHERE email=?',[email]);
    ids[email] = row.id;
  }
  for (const teamName of ['Operations','Platform','Finance']) {
    await conn.query('INSERT INTO teams(name) VALUES (?) ON DUPLICATE KEY UPDATE name=VALUES(name)', [teamName]);
  }
  const [teamRows] = await conn.query('SELECT id,name FROM teams WHERE name IN (?,?,?)',['Operations','Platform','Finance']);
  const operations = teamRows.find(t=>t.name==='Operations');
  const platform = teamRows.find(t=>t.name==='Platform');
  const finance = teamRows.find(t=>t.name==='Finance');
  const memberships = [
    [operations.id, ids['admin@newtonite.local']],
    [operations.id, ids['manager@newtonite.local']],
    [operations.id, ids['lead@newtonite.local']],
    [operations.id, ids['member@newtonite.local']],
    [platform.id, ids['admin@newtonite.local']],
    [platform.id, ids['lead@newtonite.local']],
    [platform.id, ids['member@newtonite.local']],
    [finance.id, ids['admin@newtonite.local']],
    [finance.id, ids['manager@newtonite.local']]
  ];
  for (const [teamId,userId] of memberships) {
    await conn.query('INSERT IGNORE INTO team_members(team_id,user_id) VALUES(?,?)',[teamId,userId]);
  }
  const [[count]] = await conn.query('SELECT COUNT(*) AS count FROM work_items');
  if (Number(count.count) === 0) {
    const [result] = await conn.query(
      `INSERT INTO work_items(title,description,status,priority,team_id,assignee_id,created_by,due_at)
       VALUES
       ('Investigate delayed payment','Review the payment provider callback and identify the cause of delayed settlement.','OPEN','HIGH',?,?,?,DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 DAY)),
       ('Prepare incident follow-up','Collect the timeline and write follow-up actions for the recent API incident.','IN_PROGRESS','MEDIUM',?,?,?,DATE_ADD(UTC_TIMESTAMP(), INTERVAL 3 DAY))`,
      [operations.id,ids['member@newtonite.local'],ids['manager@newtonite.local'],operations.id,ids['manager@newtonite.local'],ids['manager@newtonite.local']]
    );
    const [items] = await conn.query('SELECT id, title, created_by FROM work_items ORDER BY id DESC LIMIT 2');
    for (const item of items) {
      await conn.query('INSERT INTO activity_logs(work_item_id,actor_id,action,summary) VALUES(?,?,?,?)',
        [item.id,item.created_by,'CREATED',`Created work item: ${item.title}`]);
    }

    // A thousand varied sample rows make server-side pagination and filters easy to demo.
    const [[maxBeforeSamples]] = await conn.query('SELECT MAX(id) AS max_id FROM work_items');
    const statuses = ['OPEN','IN_PROGRESS','BLOCKED','AWAITING_APPROVAL','RESOLVED'];
    const priorities = ['LOW','MEDIUM','HIGH','CRITICAL'];
    const types = ['TASK','INCIDENT','CUSTOMER_ISSUE','PAYMENT','COMPLIANCE'];
    const samples = [];
    for (let i=1; i<=1000; i++) {
      const team = [operations, platform, finance][i % 3];
      const creator = team.name === 'Finance' ? ids['manager@newtonite.local']
        : team.name === 'Platform' ? ids['lead@newtonite.local']
        : ids['member@newtonite.local'];
      const assignee = team.name === 'Finance' ? ids['manager@newtonite.local']
        : team.name === 'Platform' ? (i % 2 ? ids['lead@newtonite.local'] : ids['member@newtonite.local'])
        : (i % 4 ? ids['member@newtonite.local'] : null);
      samples.push([
        `Sample ${types[i % types.length].toLowerCase().replace('_',' ')} request ${String(i).padStart(4,'0')}`,
        `Seeded demonstration item ${i}. Use this record to test filtering, pagination, assignment, and workflow behaviour.`,
        types[i % types.length], statuses[i % statuses.length], priorities[i % priorities.length],
        team.id, assignee, creator, null
      ]);
    }
    const placeholders = samples.map(()=>'(?,?,?,?,?,?,?,?,?)').join(',');
    await conn.query(
      `INSERT INTO work_items(title,description,type,status,priority,team_id,assignee_id,created_by,due_at) VALUES ${placeholders}`,
      samples.flat()
    );
    await conn.query(
      `INSERT INTO activity_logs(work_item_id,actor_id,action,summary,details)
       SELECT id,created_by,'CREATED',CONCAT('Seeded demo work item: ',title),JSON_OBJECT('seeded',true)
       FROM work_items WHERE id > ?`,
      [maxBeforeSamples.max_id]
    );
  }
  await conn.commit();
  console.log('Seed complete. Demo passwords are documented in README.md.');
} catch (err) {
  await conn.rollback();
  throw err;
} finally {
  conn.release();
  await pool.end();
}
