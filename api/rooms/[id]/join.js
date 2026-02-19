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
        const room = roomRes.rows[0];
        const nickname = (req.body?.nickname || '').trim();
        if (!nickname) {
            return res.status(400).json({ detail: 'Nickname cannot be empty' });
        }
        const now = new Date().toISOString();
        const partRes = await query(
            `INSERT INTO participants (room_id, nickname, created_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (room_id, nickname) DO UPDATE SET nickname = EXCLUDED.nickname
       RETURNING id`,
            [id, nickname, now]
        );
        const participant_id = partRes.rows[0].id;
        // Set admin if not set yet
        await query(
            'UPDATE rooms SET admin_id = $1 WHERE id = $2 AND admin_id IS NULL',
            [participant_id, id]
        );
        const updatedRoom = (await query('SELECT * FROM rooms WHERE id = $1', [id])).rows[0];
        return res.status(200).json({
            participant_id,
            nickname,
            is_admin: updatedRoom.admin_id === participant_id,
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ detail: String(err) });
    }
};
