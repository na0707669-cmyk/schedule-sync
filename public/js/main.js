// ═══════════════════════════════════════════════════════════════════════════
// ScheduleSync — Landing Page Logic
// ═══════════════════════════════════════════════════════════════════════════

const btn = document.getElementById('create-room-btn');
if (btn && !btn.dataset.bound) {
    btn.dataset.bound = '1';
    btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.innerHTML = '<span class="btn-icon">⏳</span> 생성 중…';

        try {
            const res = await fetch('/api/rooms', { method: 'POST' });
            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.detail || '서버 오류가 발생했습니다.');
            }
            const data = await res.json();
            window.location.href = `/room/${data.room_id}`;
        } catch (err) {
            alert(`방 생성 실패: ${err.message}`);
            btn.disabled = false;
            btn.innerHTML = '<span class="btn-icon">🚀</span> 방 만들기';
        }
    });
}
