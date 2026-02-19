const { query } = require('../../_db');

module.exports = async function handler(req, res) {
    res.setHeader('Content-Type', 'application/json');
    const { id } = req.query;
    if (req.method !== 'POST') {
        return res.status(405).json({ detail: 'Method not allowed' });
    }
    try {
        const roomRes = await query('SELECT * FROM rooms WHERE id = $1', [id]);
        if (roomRes.rows.length === 0) {
            return res.status(404).json({ detail: 'Room not found' });
        }
        const { date, note } = req.body || {};
        const now = new Date().toISOString();
        await query(
            `INSERT INTO notes (room_id, date, note, updated_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (room_id, date)
       DO UPDATE SET note = EXCLUDED.note, updated_at = EXCLUDED.updated_at`,
            [id, date, (note || '').trim(), now]
        );
        return res.status(200).json({ ok: true });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ detail: String(err) });
    }
};
