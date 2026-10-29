(() => {
  const $ = (id) => document.getElementById(id);
  const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const ORDER = [1,2,3,4,5,6,0];
  let token = sessionStorage.getItem('lyknu-admin') || '';
  let today = '';

  const pad = (n) => String(n).padStart(2, '0');
  const fmtTime = (t) => { if (!t) return ''; const [h, m] = t.split(':').map(Number); return `${((h + 11) % 12) + 1}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`; };
  const fmtDate = (s, o = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { timeZone: 'UTC', ...o }); };
  const addDays = (s, n) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2600); }

  async function api(path, opts = {}) {
    const r = await fetch('/api/admin/' + path, {
      ...opts,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}), ...(opts.headers || {}) },
      cache: 'no-store',
    });
    if (r.status === 401 && path !== 'login') { logout(); throw new Error('Session expired — please log in again.'); }
    const data = r.headers.get('content-type')?.includes('json') ? await r.json() : r;
    if (!r.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  function showApp(on) {
    $('login-form').hidden = on; $('app').hidden = !on; $('logout').hidden = !on;
  }
  function logout() { token = ''; sessionStorage.removeItem('lyknu-admin'); showApp(false); }

  $('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('login-err'); err.hidden = true;
    try {
      const { token: t } = await api('login', { method: 'POST', body: JSON.stringify({ password: $('password').value }) });
      token = t; sessionStorage.setItem('lyknu-admin', t); $('password').value = '';
      await start();
    } catch (x) { err.textContent = x.message; err.hidden = false; }
  });
  $('logout').addEventListener('click', logout);

  document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('active', x === b));
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.id === 'tab-' + b.dataset.tab));
  }));

  // ---------- appointments ----------
  async function loadAppts() {
    const box = $('appts'); box.innerHTML = '<p class="muted">Loading…</p>';
    const { appointments } = await api('appointments' + ($('show-canceled').checked ? '?canceled=1' : ''));
    if (!appointments.length) { box.innerHTML = '<div class="panel" style="margin-top:1rem"><p style="margin:0">No upcoming estimate appointments yet.</p></div>'; return; }
    const byDay = {};
    for (const a of appointments) (byDay[a.date] ||= []).push(a);
    box.innerHTML = '';
    for (const [date, list] of Object.entries(byDay)) {
      const sec = document.createElement('div'); sec.className = 'appt-day';
      sec.innerHTML = `<h3>${esc(fmtDate(date))}${date === today ? ' — Today' : ''}</h3>`;
      for (const a of list) {
        const el = document.createElement('div'); el.className = 'appt' + (a.status === 'canceled' ? ' canceled' : '');
        el.innerHTML = `
          <div class="time">${esc(fmtTime(a.time))}</div>
          <div>
            <div class="who">${esc(a.name)} · <a href="tel:${esc(a.phone.replace(/[^\d+]/g, ''))}">${esc(a.phone)}</a>${a.email ? ` · <a href="mailto:${esc(a.email)}">${esc(a.email)}</a>` : ''}</div>
            <div class="meta">${esc(a.vehicleYear)} ${esc(a.vehicleMake)} ${esc(a.vehicleModel)}${a.insurance ? ' · Insurance: ' + esc(a.insurance) : ''} · #${esc(a.id)}${a.status === 'canceled' ? ' · <strong>CANCELED</strong>' : ''}</div>
            <div class="desc">${esc(a.description)}</div>
            <div class="photos"></div>
          </div>
          <div>${a.status !== 'canceled' ? '<button class="btn btn-outline" data-cancel>Cancel</button>' : ''}</div>`;
        const ph = el.querySelector('.photos');
        for (const key of a.photos || []) {
          const img = document.createElement('img'); img.alt = 'Damage photo'; ph.appendChild(img);
          api('photo?key=' + encodeURIComponent(key)).then((r) => r.blob()).then((b) => {
            img.src = URL.createObjectURL(b);
            img.onclick = () => { const lb = document.createElement('div'); lb.className = 'lightbox'; lb.innerHTML = `<img src="${img.src}" alt="">`; lb.onclick = () => lb.remove(); document.body.appendChild(lb); };
          }).catch(() => img.remove());
        }
        const c = el.querySelector('[data-cancel]');
        if (c) c.addEventListener('click', async () => {
          if (!confirm(`Cancel ${a.name}'s estimate on ${fmtDate(a.date, { month: 'short', day: 'numeric' })} at ${fmtTime(a.time)}? The time will open back up for booking.\n\n(Tip: call the customer at ${a.phone} to let them know.)`)) return;
          try { await api(`appointments/${a.date}/${a.id}/cancel`, { method: 'POST' }); toast('Appointment canceled'); loadAppts(); } catch (x) { toast(x.message); }
        });
        sec.appendChild(el);
      }
      box.appendChild(sec);
    }
  }
  $('show-canceled').addEventListener('change', loadAppts);

  // ---------- blocks ----------
  async function loadBlocks() {
    const { blocks } = await api('blocks');
    const box = $('blocks');
    if (!blocks.length) { box.innerHTML = '<p class="muted m0">Nothing blocked. Your whole availability is open for booking.</p>'; return; }
    box.innerHTML = '';
    for (const b of blocks) {
      const dates = b.endDate && b.endDate !== b.startDate ? `${fmtDate(b.startDate, { weekday: 'short', month: 'short', day: 'numeric' })} – ${fmtDate(b.endDate, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}` : fmtDate(b.startDate, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
      const el = document.createElement('div'); el.className = 'block-item';
      el.innerHTML = `<div><strong>${esc(dates)}</strong><br><span class="muted">${b.allDay ? 'All day' : esc(fmtTime(b.startTime) + ' – ' + fmtTime(b.endTime))}${b.reason ? ' · ' + esc(b.reason) : ''}</span></div><button class="btn btn-outline">Remove</button>`;
      el.querySelector('button').onclick = async () => { await api('blocks/' + b.id, { method: 'DELETE' }); toast('Removed — those times are open again'); loadBlocks(); };
      box.appendChild(el);
    }
  }
  $('b-allday').addEventListener('change', (e) => { $('b-times').hidden = e.target.checked; });
  async function addBlock(body) {
    try { await api('blocks', { method: 'POST', body: JSON.stringify(body) }); toast('Blocked — customers can no longer book that time'); loadBlocks(); }
    catch (x) { toast(x.message); }
  }
  $('block-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const allDay = $('b-allday').checked;
    addBlock({ startDate: $('b-start').value, endDate: $('b-end').value || $('b-start').value, allDay, startTime: allDay ? '' : $('b-st').value, endTime: allDay ? '' : $('b-et').value, reason: $('b-reason').value });
    $('b-reason').value = '';
  });
  document.querySelectorAll('[data-quick]').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.quick === 'tomorrow') return addBlock({ startDate: addDays(today, 1), allDay: true, reason: 'Blocked tomorrow' });
    const now = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
    addBlock({ startDate: today, allDay: false, startTime: now, endTime: '23:59', reason: 'Rest of today' });
  }));

  // ---------- settings ----------
  let tz = 'America/New_York', holidays = [];
  function renderHours(s) {
    const tb = $('hours-body'); tb.innerHTML = '';
    for (const d of ORDER) {
      const v = s.weekly[d];
      const tr = document.createElement('tr'); tr.dataset.day = d; if (!v) tr.className = 'closed';
      tr.innerHTML = `<td data-l="Day"><strong>${DAYS[d]}</strong></td>
        <td data-l="Open?"><label class="toggle"><input type="checkbox" class="h-open" ${v ? 'checked' : ''}> Open</label></td>
        <td data-l="Start"><input type="time" class="h-o" value="${v?.open || '08:00'}"></td>
        <td data-l="End"><input type="time" class="h-c" value="${v?.close || '17:00'}"></td>
        <td data-l="Break from"><input type="time" class="h-bs" value="${v?.breakStart || ''}"></td>
        <td data-l="Break to"><input type="time" class="h-be" value="${v?.breakEnd || ''}"></td>`;
      tr.querySelector('.h-open').onchange = (e) => tr.classList.toggle('closed', !e.target.checked);
      tb.appendChild(tr);
    }
    $('s-hol').checked = s.closeMajorHolidays !== false;
    const hl = $('hol-list'); hl.innerHTML = '';
    for (const h of holidays) {
      const lab = document.createElement('label'); lab.className = 'toggle hol-item';
      const open = (s.openHolidayDates || []).includes(h.date);
      lab.innerHTML = `<input type="checkbox" class="hol-open" data-date="${h.date}" ${open ? 'checked' : ''}> <span><strong>${h.name}</strong> <span class="muted">${new Date(h.date + 'T12:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span></span><em>Open anyway</em>`;
      hl.appendChild(lab);
    }
    hl.hidden = !holidays.length;
    $('s-slot').value = String(s.slotMinutes);
    if (!$('s-slot').value) { const o = new Option(s.slotMinutes, s.slotMinutes); $('s-slot').add(o); $('s-slot').value = String(s.slotMinutes); }
    $('s-cap').value = s.capacityPerSlot; $('s-notice').value = s.minNoticeHours; $('s-ahead').value = s.maxDaysAhead; $('s-msg').value = s.bookingMessage || '';
  }
  async function loadSettings() {
    const r = await api('settings'); tz = r.timezone; today = r.today; holidays = r.holidays || []; $('tz').textContent = r.timezone;
    $('b-start').value = $('b-start').value || today; $('b-start').min = today; $('b-end').min = today;
    renderHours(r.settings);
  }
  $('settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const weekly = {};
    for (const tr of $('hours-body').children) {
      const q = (c) => tr.querySelector(c);
      if (!q('.h-open').checked) { weekly[tr.dataset.day] = null; continue; }
      if (q('.h-c').value <= q('.h-o').value) { toast(`${DAYS[tr.dataset.day]}: closing time must be after opening time`); return; }
      weekly[tr.dataset.day] = { open: q('.h-o').value, close: q('.h-c').value, breakStart: q('.h-bs').value, breakEnd: q('.h-be').value };
    }
    try {
      const { settings } = await api('settings', { method: 'PUT', body: JSON.stringify({ weekly, slotMinutes: $('s-slot').value, capacityPerSlot: $('s-cap').value, minNoticeHours: $('s-notice').value, maxDaysAhead: $('s-ahead').value, bookingMessage: $('s-msg').value, closeMajorHolidays: $('s-hol').checked, openHolidayDates: [...document.querySelectorAll('.hol-open:checked')].map((c) => c.dataset.date) }) });
      renderHours(settings); toast('Saved — the booking page is updated');
    } catch (x) { toast(x.message); }
  });

  async function start() {
    showApp(true);
    try { await loadSettings(); await Promise.all([loadAppts(), loadBlocks()]); }
    catch (x) { if (token) toast(x.message); }
  }
  if (token) start(); else showApp(false);
})();
