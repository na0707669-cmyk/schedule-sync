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
            'SELECT id, nickname FROM participants WHERE room_id = $1 AND is_kicked = 0 ORDER BY created_at',
            [id]
        );
        const totalParticipants = partRes.rows.length;

        const voteRes = await query(
            `SELECT v.date, v.time_slot, v.status, v.participant_id, p.nickname
       FROM votes v
       JOIN participants p ON v.participant_id = p.id
       WHERE v.room_id = $1 AND p.is_kicked = 0
       ORDER BY v.date, v.time_slot`,
            [id]
        );
        const noteRes = await query(
            "SELECT date, note FROM notes WHERE room_id = $1 AND note != '' ORDER BY date",
            [id]
        );

        const notesByDate = {};
        noteRes.rows.forEach(n => { notesByDate[n.date] = n.note; });

        const bySlot = {};
        voteRes.rows.forEach(v => {
            const key = `${v.date}|${v.time_slot}`;
            if (!bySlot[key]) bySlot[key] = [];
            bySlot[key].push({ participant_id: v.participant_id, nickname: v.nickname, status: v.status });
        });

        function aggregate(votes) {
            const statuses = votes.map(v => v.status);
            if (statuses.includes('red')) return 'red';
            if (statuses.includes('yellow')) return 'yellow';
            if (statuses.length === totalParticipants && statuses.every(s => s === 'green')) return 'green';
            return 'white';
        }

        const allDates = new Set([
            ...Object.keys(bySlot).map(k => k.split('|')[0]),
            ...Object.keys(notesByDate),
        ]);

        const datesResult = {};
        allDates.forEach(date => {
            const lunchVotes = bySlot[`${date}|lunch`] || [];
            const dinnerVotes = bySlot[`${date}|dinner`] || [];
            datesResult[date] = {
                lunch: { aggregate: lunchVotes.length ? aggregate(lunchVotes) : 'white', votes: lunchVotes },
                dinner: { aggregate: dinnerVotes.length ? aggregate(dinnerVotes) : 'white', votes: dinnerVotes },
                note: notesByDate[date] || '',
            };
        });

        return res.status(200).json({
            total_participants: totalParticipants,
            participants: partRes.rows,
            admin_id: room.admin_id,
            dates: datesResult,
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ detail: String(err) });
    }
};
