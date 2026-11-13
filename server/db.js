import 'dotenv/config';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
export const windowsAuth = process.env.DB_WINDOWS_AUTH !== 'false';
export const sql = require(windowsAuth ? 'mssql/msnodesqlv8' : 'mssql');

export function config(database = process.env.DB_DATABASE || 'LMS_Project_DB') {
  const server = process.env.DB_SERVER || 'localhost\\SQLEXPRESS';
  if (windowsAuth) {
    return { connectionString: `Driver={ODBC Driver 18 for SQL Server};Server=${server};Database=${database};Trusted_Connection=Yes;Encrypt=${process.env.DB_ENCRYPT === 'true' ? 'Yes' : 'No'};TrustServerCertificate=${process.env.DB_TRUST_CERTIFICATE === 'false' ? 'No' : 'Yes'};`, options: { trustedConnection: true } };
  }
  return { server, database, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    options: { encrypt: process.env.DB_ENCRYPT === 'true', trustServerCertificate: process.env.DB_TRUST_CERTIFICATE !== 'false' } };
}

let pool;
export async function connect() {
  if (!pool) pool = await new sql.ConnectionPool(config()).connect();
  return pool;
}

export async function query(text, values = {}, connection) {
  const request = new sql.Request(connection || await connect());
  for (const [key, value] of Object.entries(values)) request.input(key, value);
  return request.query(text);
}

export async function transaction(work) {
  const tx = new sql.Transaction(await connect());
  await tx.begin();
  try { const result = await work(tx); await tx.commit(); return result; }
  catch (error) { await tx.rollback(); throw error; }
}
