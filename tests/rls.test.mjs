import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const a = '11111111-1111-4111-8111-111111111111'
const b = '22222222-2222-4222-8222-222222222222'

test('数据库 RLS：匿名拒绝、用户隔离、禁止伪造归属、旧访客策略移除、可重复迁移', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth, public to anon, authenticated;
      grant execute on function auth.uid() to anon, authenticated;
      insert into auth.users values ('${a}'), ('${b}');
    `)
    const schema = await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8')
    await db.exec(schema)
    // Simulate old header policies and unclaimed guest data before upgrading again.
    await db.exec(`
      create policy "tasks scoped to owner header" on tasks for all using (true);
      create policy "projects scoped to owner header" on projects for all using (true);
      insert into tasks (id,owner,text) values ('33333333-3333-4333-8333-333333333333','guest','legacy');
      insert into projects (id,owner,name) values ('inbox','guest','legacy');
    `)
    await db.exec(schema)
    await db.exec(`set role authenticated; set request.jwt.claim.sub = '${a}';`)
    for (const [table, fields, values] of [
      ['tasks', 'id,owner,user_id,text', `'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','${a}','${a}','A task'`],
      ['projects', 'id,owner,user_id,name', `'inbox','${a}','${a}','A inbox'`],
    ]) {
      await db.exec(`insert into ${table} (${fields}) values (${values});`)
      assert.equal((await db.query(`select * from ${table}`)).rows.length, 1)
      await assert.rejects(db.exec(`update ${table} set user_id = '${b}'`), /row-level security/)
    }
    await db.exec(`set request.jwt.claim.sub = '${b}'; set request.headers = '{"x-owner-id":"${a}"}';`)
    for (const table of ['tasks', 'projects']) {
      assert.equal((await db.query(`select * from ${table}`)).rows.length, 0)
      assert.equal((await db.query(`update ${table} set owner = '${b}' returning *`)).rows.length, 0)
      assert.equal((await db.query(`delete from ${table} returning *`)).rows.length, 0)
    }
    await assert.rejects(db.exec(`insert into tasks (id,owner,user_id) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','${a}','${a}')`), /row-level security/)
    await assert.rejects(db.exec(`insert into projects (id,owner,user_id,name) values ('forged','${a}','${b}','forged')`), /row-level security/)
    // Same inbox id is valid for two accounts; upsert cannot hijack the other owner.
    await db.exec(`insert into projects (id,owner,user_id,name) values ('inbox','${b}','${b}','B inbox')`)
    await assert.rejects(db.exec(`insert into projects (id,owner,user_id,name) values ('inbox','${a}','${a}','stolen') on conflict(owner,id) do update set name='stolen'`), /row-level security/)
    await db.exec(`set role anon; set request.jwt.claim.sub = '';`)
    for (const table of ['tasks', 'projects']) await assert.rejects(db.query(`select * from ${table}`), /permission denied/)
    await assert.rejects(db.exec(`insert into tasks (id,owner,user_id) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','${b}','${b}')`), /permission denied/)
    await assert.rejects(db.exec(`insert into projects (id,owner,user_id,name) values ('anon','${b}','${b}','anon')`), /permission denied/)
    await db.exec(`reset role`)
    assert.equal((await db.query(`select * from tasks where user_id is null`)).rows.length, 1)
    assert.equal((await db.query(`select * from projects where user_id is null`)).rows.length, 1)
    // 手动排序持久化：迁移给已有数据补 position 列并默认 0
    assert.equal((await db.query(`select position from tasks where user_id is null`)).rows[0].position, 0)
    assert.equal((await db.query(`select name from projects where user_id='${a}'`)).rows[0].name, 'A inbox')
  } finally { await db.close() }
})
