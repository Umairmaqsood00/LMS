import { readFile } from 'node:fs/promises';
import { sql, config } from '../server/db.js';

const database = process.env.DB_DATABASE || 'LMS_Project_DB';
if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(database)) throw new Error('Invalid database name.');
const master = await new sql.ConnectionPool(config('master')).connect();
try {
  const exists = await master.request().input('name', database).query('SELECT DB_ID(@name) AS id');
  if (exists.recordset[0].id) throw new Error(`${database} already exists. Setup stopped without changing it. Use database/02-objects.sql to update only views/procedures.`);
  await master.request().query(`CREATE DATABASE [${database}]`);
} finally { await master.close(); }
const pool = await new sql.ConnectionPool(config(database)).connect();
try {
  for (const file of ['01-schema.sql', '02-objects.sql']) {
    let source = await readFile(new URL(`../database/${file}`, import.meta.url), 'utf8');
    source = source.replace(/USE LMS_Project_DB;/g, `USE [${database}];`);
    for (const batch of source.split(/^\s*GO\s*$/im)) if (batch.trim()) await pool.request().batch(batch);
  }
  console.log(`Created ${database}: 17 tables, sample data, 2 views, 2 stored procedures.`);
} finally { await pool.close(); }
