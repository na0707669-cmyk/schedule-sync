const { query, SEOUL_LOCATIONS } = require('../../_db');

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
        const res2 = await query(
            `SELECT lv.location, lv.participant_id, p.nickname
       FROM location_votes lv
       JOIN participants p ON lv.participant_id = p.id
       WHERE lv.room_id = $1 AND p.is_kicked = 0
       ORDER BY lv.location`,
            [id]
        );
        const votes = {};
        res2.rows.forEach(row => {
            if (!votes[row.location]) votes[row.location] = [];
            votes[row.location].push({ participant_id: row.participant_id, nickname: row.nickname });
        });
        return res.status(200).json({ votes, locations: SEOUL_LOCATIONS });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ detail: String(err) });
    }
};
