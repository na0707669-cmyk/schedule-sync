// Shared PostgreSQL client for all API functions
const { Pool } = require('pg');

let pool;

function getPool() {
    if (!pool) {
        pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false },
            max: 1, // serverless: keep connections minimal
        });
    }
    return pool;
}

async function query(text, params) {
    const client = await getPool().connect();
    try {
        const result = await client.query(text, params);
        return result;
    } finally {
        client.release();
    }
}

async function initDb() {
    await query(`
    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      admin_id INTEGER,
      created_at TEXT NOT NULL
    )
  `);
    await query(`
    CREATE TABLE IF NOT EXISTS participants (
      id SERIAL PRIMARY KEY,
      room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      nickname TEXT NOT NULL,
      is_kicked INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      UNIQUE(room_id, nickname)
    )
  `);
    await query(`
    CREATE TABLE IF NOT EXISTS votes (
      id SERIAL PRIMARY KEY,
      room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      participant_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      time_slot TEXT NOT NULL DEFAULT 'lunch' CHECK(time_slot IN ('lunch','dinner')),
      status TEXT NOT NULL CHECK(status IN ('green','yellow','red')),
      UNIQUE(participant_id, date, time_slot)
    )
  `);
    await query(`
    CREATE TABLE IF NOT EXISTS notes (
      id SERIAL PRIMARY KEY,
      room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      UNIQUE(room_id, date)
    )
  `);
    await query(`
    CREATE TABLE IF NOT EXISTS location_votes (
      id SERIAL PRIMARY KEY,
      room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      participant_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
      location TEXT NOT NULL,
      UNIQUE(participant_id, location)
    )
  `);
}

const SEOUL_LOCATIONS = [
    '강남', '서초', '잠실/송파/강동', '영등포/여의도/강서',
    '건대/성수/왕십리', '종로/중구', '홍대/합정/마포',
    '용산/이태원/한남', '성북/노원/중랑', '구로/관악/동작',
];

module.exports = { query, initDb, SEOUL_LOCATIONS };
