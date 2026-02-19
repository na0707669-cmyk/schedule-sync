const { query, SEOUL_LOCATIONS } = require('../../_db');

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
        const { participant_id, location } = req.body || {};
        const kickRes = await query(
            'SELECT is_kicked FROM participants WHERE id = $1 AND room_id = $2',
            [participant_id, id]
        );
        if (!kickRes.rows.length || kickRes.rows[0].is_kicked) {
            return res.status(403).json({ detail: 'Participant has been kicked' });
        }
        if (!SEOUL_LOCATIONS.includes(location)) {
            return res.status(400).json({ detail: 'Invalid location' });
        }
        const existing = await query(
            'SELECT id FROM location_votes WHERE participant_id = $1 AND location = $2',
            [participant_id, location]
        );
        let added;
        if (existing.rows.length) {
            await query('DELETE FROM location_votes WHERE participant_id = $1 AND location = $2', [participant_id, location]);
            added = false;
        } else {
            await query(
                'INSERT INTO location_votes (room_id, participant_id, location) VALUES ($1, $2, $3)',
                [id, participant_id, location]
            );
            added = true;
        }
        return res.status(200).json({ ok: true, added });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ detail: String(err) });
    }
};
