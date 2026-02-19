const { query, initDb } = require('../_db');
const { randomUUID } = require('crypto');

module.exports = async function handler(req, res) {
    res.setHeader('Content-Type', 'application/json');
    if (req.method !== 'POST') {
        return res.status(405).json({ detail: 'Method not allowed' });
    }
    try {
        await initDb();
        const id = randomUUID();
        const now = new Date().toISOString();
        await query(
            'INSERT INTO rooms (id, admin_id, created_at) VALUES ($1, NULL, $2)',
            [id, now]
        );
        return res.status(200).json({ room_id: id });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ detail: String(err) });
    }
};
