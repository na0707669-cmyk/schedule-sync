const { query } = require('../../../_db');

module.exports = async function handler(req, res) {
    res.setHeader('Content-Type', 'application/json');
    const { id, pid } = req.query;
    if (req.method !== 'GET') {
        return res.status(405).json({ detail: 'Method not allowed' });
    }
    try {
        const participant_id = parseInt(pid, 10);
        const r = await query(
            'SELECT is_kicked FROM participants WHERE id = $1 AND room_id = $2',
            [participant_id, id]
        );
        const is_kicked = !r.rows.length || !!r.rows[0].is_kicked;
        return res.status(200).json({ is_kicked });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ detail: String(err) });
    }
};
