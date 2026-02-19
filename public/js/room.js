// ═══════════════════════════════════════════════════════════════════════════
// ScheduleSync — Room Page Logic v3
// Features: localStorage persistence, admin/kick, location voting
// ═══════════════════════════════════════════════════════════════════════════

(function () {
    'use strict';

    // ── State ──────────────────────────────────────────────────────────────
    const ROOM_ID = window.location.pathname.split('/room/')[1];
    const LS_KEY = `sc_${ROOM_ID}`;  // localStorage key

    let participantId = null;
    let nickname = null;
    let isAdmin = false;
    let isKicked = false;
    let currentYear, currentMonth;
    let allVotesData = {};
    let myVotes = {};
    let totalParticipants = 0;
    let participants = [];
    let adminId = null;

    // Location voting state
    let locationVotesData = {};   // { location: [{participant_id, nickname}] }
    let locationList = [];        // ordered list from server
    let myLocationVotes = new Set();

    const weekdayToggleState = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    let currentScope = 'all';

    const userTZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const todayLocal = new Date(new Date().toLocaleString('en-US', { timeZone: userTZ }));
    const todayStr = formatDate(todayLocal);

    let noteModalDate = null;

    currentYear = todayLocal.getFullYear();
    currentMonth = todayLocal.getMonth();

    // ── Init: check localStorage first ────────────────────────────────────
    const saved = loadFromStorage();
    if (saved) {
        participantId = saved.participantId;
        nickname = saved.nickname;
        // Verify with server before proceeding
        verifyAndInit();
    } else {
        showNicknameModal();
    }

    function loadFromStorage() {
        try {
            const raw = localStorage.getItem(LS_KEY);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch { return null; }
    }

    function saveToStorage(pid, nick) {
        localStorage.setItem(LS_KEY, JSON.stringify({ participantId: pid, nickname: nick }));
    }

    function clearStorage() {
        localStorage.removeItem(LS_KEY);
    }

    async function verifyAndInit() {
        try {
            // 1. Try to check status with existing ID
            const res = await fetch(`/api/rooms/${ROOM_ID}/status/${participantId}`);
            if (res.ok) {
                const data = await res.json();
                if (data.is_kicked) {
                    clearStorage();
                    showKickedModal();
                    return;
                }
                hideNicknameModal();
                initRoom();
                return;
            }
        } catch (e) {
            console.warn('Status check failed, trying auto-rejoin...', e);
        }

        // 2. If check failed (server reset or ID invalid), try to RE-JOIN with stored nickname
        console.log('Session invalid, attempting auto-rejoin with:', nickname);
        if (nickname) {
            try {
                const joinRes = await fetch(`/api/rooms/${ROOM_ID}/join`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ nickname: nickname })
                });
                if (joinRes.ok) {
                    const data = await joinRes.json();
                    participantId = data.participant_id;
                    isAdmin = data.is_admin;
                    saveToStorage(participantId, nickname); // Update storage with new ID
                    hideNicknameModal();
                    initRoom();
                    return;
                }
            } catch (e) {
                console.error('Auto-rejoin failed', e);
            }
        }

        // 3. Last resort: Ask user to login again
        clearStorage();
        showNicknameModal();
    }

    // ── Modals ─────────────────────────────────────────────────────────────
    function showNicknameModal() {
        document.getElementById('nickname-modal').style.display = 'flex';
        setTimeout(() => document.getElementById('nickname-input').focus(), 100);
    }

    function hideNicknameModal() {
        document.getElementById('nickname-modal').style.display = 'none';
        document.getElementById('room-app').style.display = 'flex';
    }

    function showKickedModal() {
        document.getElementById('kicked-modal').style.display = 'flex';
        document.getElementById('room-app').style.display = 'none';
        document.getElementById('nickname-modal').style.display = 'none';
    }

    // ── Nickname Form ──────────────────────────────────────────────────────
    document.getElementById('nickname-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('nickname-input');
        const nick = input.value.trim();
        if (!nick) return;
        try {
            const res = await fetch(`/api/rooms/${ROOM_ID}/join`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nickname: nick }),
            });
            if (!res.ok) throw new Error('Join failed');
            const data = await res.json();
            participantId = data.participant_id;
            nickname = data.nickname;
            isAdmin = data.is_admin;
            saveToStorage(participantId, nickname);
            hideNicknameModal();
            initRoom();
        } catch {
            alert('입장에 실패했습니다. 다시 시도해주세요.');
        }
    });

    // ── Room Initialization ────────────────────────────────────────────────
    async function initRoom() {
        document.getElementById('user-badge').textContent = `👤 ${nickname}`;
        await loadVotes();
        await loadLocationVotes();
        renderCalendar();
        renderLocationVoting();
        setupNavigation();
        setupCopyLink();
        setupScopeButtons();
        setupNoteModal();

        // Poll every 10 seconds
        setInterval(async () => {
            // Check if kicked
            try {
                const res = await fetch(`/api/rooms/${ROOM_ID}/status/${participantId}`);
                const data = await res.json();
                if (data.is_kicked) {
                    clearStorage();
                    showKickedModal();
                    return;
                }
            } catch { }

            await loadVotes();
            await loadLocationVotes();
            renderCalendar();
            renderLocationVoting();
        }, 10000);
    }

    // ── API: Votes ─────────────────────────────────────────────────────────
    async function loadVotes() {
        try {
            const res = await fetch(`/api/rooms/${ROOM_ID}/votes`);
            const data = await res.json();
            totalParticipants = data.total_participants;
            participants = data.participants;
            adminId = data.admin_id;
            allVotesData = data.dates || {};

            isAdmin = (adminId === participantId);
            const adminBadge = document.getElementById('admin-badge');
            adminBadge.style.display = isAdmin ? 'inline-flex' : 'none';

            myVotes = {};
            for (const [date, info] of Object.entries(allVotesData)) {
                for (const slot of ['lunch', 'dinner']) {
                    const slotInfo = info[slot];
                    if (slotInfo) {
                        const myVote = slotInfo.votes.find(v => v.participant_id === participantId);
                        if (myVote) myVotes[`${date}_${slot}`] = myVote.status;
                    }
                }
            }
            renderParticipants();
        } catch (err) {
            console.error('Failed to load votes:', err);
        }
    }

    async function submitVote(date, timeSlot, status) {
        try {
            const res = await fetch(`/api/rooms/${ROOM_ID}/vote`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ participant_id: participantId, date, time_slot: timeSlot, status }),
            });
            if (res.status === 403) {
                clearStorage();
                showKickedModal();
            }
        } catch (err) {
            console.error('Vote failed:', err);
        }
    }

    async function submitNote(date, note) {
        try {
            await fetch(`/api/rooms/${ROOM_ID}/note`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date, note }),
            });
        } catch (err) {
            console.error('Note save failed:', err);
        }
    }

    // ── API: Kick ──────────────────────────────────────────────────────────
    async function kickParticipant(targetId) {
        if (!isAdmin) return;
        if (!confirm('이 참가자를 강퇴하시겠습니까?')) return;
        try {
            const res = await fetch(
                `/api/rooms/${ROOM_ID}/participants/${targetId}?admin_id=${participantId}`,
                { method: 'DELETE' }
            );
            if (res.ok) {
                showToast('kick');
                await loadVotes();
                await loadLocationVotes();
                renderCalendar();
                renderLocationVoting();
            }
        } catch (err) {
            console.error('Kick failed:', err);
        }
    }

    // ── API: Location Votes ────────────────────────────────────────────────
    async function loadLocationVotes() {
        try {
            const res = await fetch(`/api/rooms/${ROOM_ID}/location-votes`);
            const data = await res.json();
            locationVotesData = data.votes || {};
            locationList = data.locations || [];

            // Rebuild my location votes set
            myLocationVotes = new Set();
            for (const [loc, voters] of Object.entries(locationVotesData)) {
                if (voters.some(v => v.participant_id === participantId)) {
                    myLocationVotes.add(loc);
                }
            }
        } catch (err) {
            console.error('Failed to load location votes:', err);
        }
    }

    async function toggleLocationVote(location) {
        if (isKicked) return;
        try {
            const res = await fetch(`/api/rooms/${ROOM_ID}/location-vote`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ participant_id: participantId, location }),
            });
            if (res.status === 403) { clearStorage(); showKickedModal(); return; }
            await loadLocationVotes();
            renderLocationVoting();
        } catch (err) {
            console.error('Location vote failed:', err);
        }
    }

    // ── Render Participants ────────────────────────────────────────────────
    function renderParticipants() {
        const list = document.getElementById('participant-list');
        const count = document.getElementById('participant-count');
        count.textContent = participants.length;
        list.innerHTML = '';
        for (const p of participants) {
            const li = document.createElement('li');
            const nameSpan = document.createElement('span');
            nameSpan.className = 'p-name';
            nameSpan.textContent = p.nickname;
            li.appendChild(nameSpan);

            if (p.id === participantId) li.classList.add('is-me');
            if (p.id === adminId) li.classList.add('is-admin');

            // Kick button: only show to admin, not for themselves
            if (isAdmin && p.id !== participantId) {
                const kickBtn = document.createElement('button');
                kickBtn.className = 'kick-btn';
                kickBtn.textContent = '강퇴';
                kickBtn.addEventListener('click', () => kickParticipant(p.id));
                li.appendChild(kickBtn);
            }

            list.appendChild(li);
        }
    }

    // ── Calendar Rendering ─────────────────────────────────────────────────
    function renderCalendar() {
        const label = document.getElementById('calendar-month-label');
        label.textContent = `${currentYear}년 ${currentMonth + 1}월`;

        const container = document.getElementById('calendar-cells');
        container.innerHTML = '';

        const firstDay = new Date(currentYear, currentMonth, 1);
        const startDow = firstDay.getDay(); // Sun=0

        const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

        for (let i = 0; i < startDow; i++) {
            const cell = document.createElement('div');
            cell.className = 'cal-cell empty';
            container.appendChild(cell);
        }

        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = formatDate(new Date(currentYear, currentMonth, d));
            const dateInfo = allVotesData[dateStr];

            const cell = document.createElement('div');
            cell.className = 'cal-cell';
            if (dateStr === todayStr) cell.classList.add('today');

            const header = document.createElement('div');
            header.className = 'cal-cell-header';

            const dateNum = document.createElement('span');
            dateNum.className = 'cal-date-num';
            dateNum.textContent = d;
            header.appendChild(dateNum);

            // Memo button — always visible, shows 📝 if note exists
            const memoBtn = document.createElement('button');
            memoBtn.className = 'memo-btn';
            memoBtn.title = '메모 보기/편집';
            memoBtn.textContent = (dateInfo && dateInfo.note) ? '📝' : '✏️';
            memoBtn.addEventListener('click', (e) => { e.stopPropagation(); openNoteModal(dateStr); });
            header.appendChild(memoBtn);
            cell.appendChild(header);

            cell.appendChild(buildSlot(dateStr, 'lunch', dateInfo));
            cell.appendChild(buildSlot(dateStr, 'dinner', dateInfo));

            container.appendChild(cell);
        }
    }

    function buildSlot(dateStr, slotName, dateInfo) {
        const slot = document.createElement('div');
        slot.className = `cal-slot ${slotName}-slot`;
        slot.dataset.date = dateStr;
        slot.dataset.slot = slotName;
        slot.textContent = slotName === 'lunch' ? '점심' : '저녁';

        const slotInfo = dateInfo && dateInfo[slotName];
        if (slotInfo && slotInfo.aggregate !== 'white') {
            slot.classList.add(`vote-${slotInfo.aggregate}`);
        }

        const myStatus = myVotes[`${dateStr}_${slotName}`];
        if (myStatus) {
            const dot = document.createElement('span');
            dot.className = `my-dot ${myStatus}`;
            slot.appendChild(dot);
        }

        if (isKicked) {
            slot.classList.add('disabled');
        } else {
            slot.addEventListener('click', (e) => handleSlotClick(e, dateStr, slotName));
        }
        return slot;
    }

    const CYCLE = [null, 'green', 'yellow', 'red'];

    async function handleSlotClick(e, dateStr, slotName) {
        e.stopPropagation();
        const key = `${dateStr}_${slotName}`;
        const currentStatus = myVotes[key] || null;
        const nextIdx = (CYCLE.indexOf(currentStatus) + 1) % CYCLE.length;
        const nextStatus = CYCLE[nextIdx];
        myVotes[key] = nextStatus;
        await submitVote(dateStr, slotName, nextStatus);
        await loadVotes();
        renderCalendar();
    }

    // ── Location Voting Render ─────────────────────────────────────────────
    function renderLocationVoting() {
        const grid = document.getElementById('location-grid');
        grid.innerHTML = '';

        // Find max votes for bar scaling
        let maxVotes = 0;
        for (const loc of locationList) {
            const count = (locationVotesData[loc] || []).length;
            if (count > maxVotes) maxVotes = count;
        }

        for (const loc of locationList) {
            const voters = locationVotesData[loc] || [];
            const count = voters.length;
            const iVoted = myLocationVotes.has(loc);
            const isTop = count > 0 && count === maxVotes;

            const card = document.createElement('div');
            card.className = 'location-card';
            if (iVoted) card.classList.add('voted');
            if (isTop) card.classList.add('top-voted');

            const nameLine = document.createElement('div');
            nameLine.className = 'loc-name';
            if (isTop) nameLine.innerHTML = `<span class="loc-crown">👑</span>${escapeHtml(loc)}`;
            else nameLine.textContent = loc;

            const countEl = document.createElement('div');
            countEl.className = 'loc-count';
            countEl.textContent = count > 0 ? `${count}표` : '';

            const barWrap = document.createElement('div');
            barWrap.className = 'loc-bar-wrap';
            const bar = document.createElement('div');
            bar.className = 'loc-bar';
            bar.style.width = maxVotes > 0 ? `${(count / maxVotes) * 100}%` : '0%';
            barWrap.appendChild(bar);

            const votersList = document.createElement('div');
            votersList.className = 'loc-voters';
            for (const v of voters) {
                const chip = document.createElement('span');
                chip.className = 'loc-voter-chip';
                chip.textContent = v.nickname;
                votersList.appendChild(chip);
            }

            card.appendChild(nameLine);
            card.appendChild(countEl);
            card.appendChild(barWrap);
            card.appendChild(votersList);

            card.addEventListener('click', () => toggleLocationVote(loc));
            grid.appendChild(card);
        }
    }

    // ── Scope Buttons ──────────────────────────────────────────────────────
    function setupScopeButtons() {
        document.querySelectorAll('.scope-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.scope-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentScope = btn.dataset.scope;
                for (let i = 0; i < 7; i++) weekdayToggleState[i] = 0;
                document.querySelectorAll('.weekday-toggle').forEach(b => { b.className = 'weekday-toggle'; });
            });
        });
    }

    // ── Weekday Bulk Toggle ────────────────────────────────────────────────
    const TOGGLE_CLASSES = ['', 'active-green', 'active-yellow', 'active-red'];
    const TOGGLE_STATUS = [null, 'green', 'yellow', 'red'];

    document.getElementById('weekday-toggle-row').addEventListener('click', async (e) => {
        const btn = e.target.closest('.weekday-toggle');
        if (!btn) return;
        const dayOfWeek = parseInt(btn.dataset.day, 10);
        const current = weekdayToggleState[dayOfWeek];
        const next = (current + 1) % 4;
        weekdayToggleState[dayOfWeek] = next;
        btn.className = 'weekday-toggle';
        if (TOGGLE_CLASSES[next]) btn.classList.add(TOGGLE_CLASSES[next]);

        const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
        const status = TOGGLE_STATUS[next];
        const promises = [];

        for (let d = 1; d <= daysInMonth; d++) {
            const dt = new Date(currentYear, currentMonth, d);
            if (dt.getDay() === dayOfWeek) {
                const dateStr = formatDate(dt);
                const slotsToApply = currentScope === 'all' ? ['lunch', 'dinner'] : [currentScope];
                for (const slot of slotsToApply) {
                    myVotes[`${dateStr}_${slot}`] = status;
                    promises.push(submitVote(dateStr, slot, status));
                }
            }
        }

        await Promise.all(promises);
        await loadVotes();
        renderCalendar();
    });

    // ── Note Modal ─────────────────────────────────────────────────────────
    function setupNoteModal() {
        document.getElementById('note-modal-close').addEventListener('click', closeNoteModal);
        document.getElementById('note-modal').addEventListener('click', (e) => {
            if (e.target === document.getElementById('note-modal')) closeNoteModal();
        });
        const textarea = document.getElementById('note-textarea');
        const charCount = document.getElementById('note-char-count');
        textarea.addEventListener('input', () => { charCount.textContent = textarea.value.length; });
        document.getElementById('note-save-btn').addEventListener('click', async () => {
            const note = document.getElementById('note-textarea').value.trim();
            await submitNote(noteModalDate, note);
            await loadVotes();
            renderCalendar();
            closeNoteModal();
            showToast('note');
        });
    }

    function openNoteModal(dateStr) {
        noteModalDate = dateStr;
        const [, m, d] = dateStr.split('-');
        document.getElementById('note-modal-date-title').textContent = `${parseInt(m)}월 ${parseInt(d)}일`;

        const dateInfo = allVotesData[dateStr];
        const currentNote = (dateInfo && dateInfo.note) || '';
        const textarea = document.getElementById('note-textarea');
        textarea.value = currentNote;
        document.getElementById('note-char-count').textContent = currentNote.length;

        const summary = document.getElementById('note-vote-summary');
        summary.innerHTML = '';

        for (const slot of ['lunch', 'dinner']) {
            const slotLabel = slot === 'lunch' ? '점심' : '저녁';
            const slotInfo = dateInfo && dateInfo[slot];
            const votes = slotInfo ? slotInfo.votes : [];
            const agg = slotInfo ? slotInfo.aggregate : 'white';

            const row = document.createElement('div');
            row.className = 'slot-summary-row';

            const aggDot = document.createElement('span');
            aggDot.className = `slot-agg-dot ${agg}`;

            const labelEl = document.createElement('span');
            labelEl.className = 'slot-summary-label';
            labelEl.innerHTML = `<span class="slot-tag ${slot}-tag">${slotLabel}</span>`;

            const votesList = document.createElement('div');
            votesList.className = 'slot-votes-list';
            if (votes.length === 0) {
                votesList.innerHTML = `<span style="font-size:0.75rem;color:var(--text-muted)">투표 없음</span>`;
            } else {
                for (const v of votes) {
                    const chip = document.createElement('span');
                    chip.className = `vote-chip ${v.status}`;
                    chip.innerHTML = `<span class="chip-dot"></span>${escapeHtml(v.nickname)}`;
                    votesList.appendChild(chip);
                }
            }

            row.appendChild(aggDot);
            row.appendChild(labelEl);
            row.appendChild(votesList);
            summary.appendChild(row);
        }

        document.getElementById('note-modal').style.display = 'flex';
        textarea.focus();
    }

    function closeNoteModal() {
        document.getElementById('note-modal').style.display = 'none';
        noteModalDate = null;
    }

    // ── Navigation ─────────────────────────────────────────────────────────
    function setupNavigation() {
        document.getElementById('prev-month').addEventListener('click', () => {
            currentMonth--;
            if (currentMonth < 0) { currentMonth = 11; currentYear--; }
            resetWeekdayToggles();
            renderCalendar();
        });
        document.getElementById('next-month').addEventListener('click', () => {
            currentMonth++;
            if (currentMonth > 11) { currentMonth = 0; currentYear++; }
            resetWeekdayToggles();
            renderCalendar();
        });
    }

    function resetWeekdayToggles() {
        for (let i = 0; i < 7; i++) weekdayToggleState[i] = 0;
        document.querySelectorAll('.weekday-toggle').forEach(btn => { btn.className = 'weekday-toggle'; });
    }

    // ── Copy Link ──────────────────────────────────────────────────────────
    function setupCopyLink() {
        document.getElementById('copy-link-btn').addEventListener('click', () => {
            const url = window.location.href;
            navigator.clipboard.writeText(url).then(() => showToast('link')).catch(() => {
                const ta = document.createElement('textarea');
                ta.value = url; document.body.appendChild(ta); ta.select();
                document.execCommand('copy'); document.body.removeChild(ta);
                showToast('link');
            });
        });
    }

    function showToast(type) {
        const map = { link: 'toast', note: 'toast-note', kick: 'toast-kick' };
        const el = document.getElementById(map[type] || 'toast');
        el.style.display = 'block';
        setTimeout(() => { el.style.display = 'none'; }, 2500);
    }

    // ── Helpers ─────────────────────────────────────────────────────────────
    function formatDate(dt) {
        const y = dt.getFullYear();
        const m = String(dt.getMonth() + 1).padStart(2, '0');
        const d = String(dt.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
})();
