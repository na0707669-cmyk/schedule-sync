const { query } = require('../../_db');

module.exports = async function handler(req, res) {
    res.setHeader('Content-Type', 'application/json');
    const { id } = req.query;
    if (req.method !== 'GET') {
        return res.status(405).json({ detail: 'Method not allowed' });
    }
    try {
        const roomRes = await query('SELECT * FROM rooms WHERE id = $1', [id]);
        if (roomRes.rows.length === 0) {
            return res.status(404).json({ detail: 'Room not found' });
        }
        const room = roomRes.rows[0];
        const partRes = await query(
            'SELECT id, nickname, is_kicked FROM participants WHERE room_id = $1 ORDER BY created_at',
            [id]
        );
        return res.status(200).json({
            room,
            participants: partRes.rows,
            admin_id: room.admin_id,
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ detail: String(err) });
    }
};
