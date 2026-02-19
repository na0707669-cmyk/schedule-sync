const { query } = require('../../../_db');

module.exports = async function handler(req, res) {
    res.setHeader('Content-Type', 'application/json');
    const { id, pid } = req.query;
    if (req.method !== 'DELETE') {
        return res.status(405).json({ detail: 'Method not allowed' });
    }
    try {
        const admin_id = parseInt(req.query.admin_id, 10);
        const participant_id = parseInt(pid, 10);
        const roomRes = await query('SELECT * FROM rooms WHERE id = $1', [id]);
        if (roomRes.rows.length === 0) {
            return res.status(404).json({ detail: 'Room not found' });
        }
        const room = roomRes.rows[0];
        if (room.admin_id !== admin_id) {
            return res.status(403).json({ detail: 'Not authorized' });
        }
        if (participant_id === admin_id) {
            return res.status(400).json({ detail: 'Cannot kick yourself' });
        }
        await query('UPDATE participants SET is_kicked = 1 WHERE id = $1 AND room_id = $2', [participant_id, id]);
        await query('DELETE FROM votes WHERE participant_id = $1 AND room_id = $2', [participant_id, id]);
        await query('DELETE FROM location_votes WHERE participant_id = $1 AND room_id = $2', [participant_id, id]);
        return res.status(200).json({ ok: true });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ detail: String(err) });
    }
};
