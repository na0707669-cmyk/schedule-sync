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
        const { participant_id, date, time_slot, status } = req.body || {};
        // Check kicked
        const kickRes = await query(
            'SELECT is_kicked FROM participants WHERE id = $1 AND room_id = $2',
            [participant_id, id]
        );
        if (!kickRes.rows.length || kickRes.rows[0].is_kicked) {
            return res.status(403).json({ detail: 'Participant has been kicked' });
        }
        if (!['lunch', 'dinner'].includes(time_slot)) {
            return res.status(400).json({ detail: 'Invalid time_slot' });
        }
        if (status !== null && status !== undefined && !['green', 'yellow', 'red'].includes(status)) {
            return res.status(400).json({ detail: 'Invalid status' });
        }
        if (status === null || status === undefined) {
            await query(
                'DELETE FROM votes WHERE participant_id = $1 AND date = $2 AND time_slot = $3',
                [participant_id, date, time_slot]
            );
        } else {
            await query(
                `INSERT INTO votes (room_id, participant_id, date, time_slot, status)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (participant_id, date, time_slot)
         DO UPDATE SET status = EXCLUDED.status`,
                [id, participant_id, date, time_slot, status]
            );
        }
        return res.status(200).json({ ok: true });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ detail: String(err) });
    }
};
