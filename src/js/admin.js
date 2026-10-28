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
    if (!r.ok) { const e = new Error(data.error || 'Request failed'); e.fields = data.fields; throw e; }
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

  // ---------- repairs (customer status tracker) ----------
  const OTHER = '__other';
  const R = { editing: null, repair: null, stages: [], byWo: {} };
  const fmtWhen = (iso) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const addOpt = (sel, value, label) => { const o = document.createElement('option'); o.value = value; o.textContent = label ?? value; sel.appendChild(o); };
  const resetSel = (sel, placeholder) => { sel.innerHTML = ''; addOpt(sel, '', placeholder); };
  function toggleOther(sel, input, force) { const on = force || sel.value === OTHER; input.hidden = !on; if (!on) input.value = ''; return on; }
  const vData = window.LYKNU_VEHICLES || {};
  function buildModels() {
    const make = $('rv-make'), model = $('rv-model');
    if (!make.value) { resetSel(model, 'Select make first'); model.disabled = true; toggleOther(model, $('rv-model-o'), false); return; }
    if (make.value === OTHER) { resetSel(model, 'Other (type it in)'); addOpt(model, OTHER, 'Other (type it in)'); model.value = OTHER; model.disabled = true; toggleOther(model, $('rv-model-o'), true); return; }
    resetSel(model, 'Select model'); (vData[make.value] || []).forEach((v) => addOpt(model, v));
    addOpt(model, OTHER, 'Other (type it in)'); model.disabled = false; toggleOther(model, $('rv-model-o'), false);
  }
  (function initVehicleSelects() {
    for (let y = new Date().getFullYear() + 1; y >= 1980; y--) addOpt($('rv-year'), y);
    Object.keys(vData).forEach((m) => addOpt($('rv-make'), m));
    addOpt($('rv-make'), OTHER, 'Other (type it in)');
    $('rv-make').addEventListener('change', () => { const on = toggleOther($('rv-make'), $('rv-make-o')); buildModels(); if (on) $('rv-make-o').focus(); });
    $('rv-model').addEventListener('change', () => { if (toggleOther($('rv-model'), $('rv-model-o'))) $('rv-model-o').focus(); });
  })();
  const pickedVal = (selId, otherId) => ($(selId).value === OTHER ? $(otherId).value.trim() : $(selId).value.trim());
  function setVehicle(year, make, model) {
    const ys = $('rv-year');
    if (year && ![...ys.options].some((o) => o.value === String(year))) addOpt(ys, year);
    ys.value = year || '';
    const known = make && Object.prototype.hasOwnProperty.call(vData, make);
    $('rv-make').value = !make ? '' : known ? make : OTHER;
    toggleOther($('rv-make'), $('rv-make-o'), !!make && !known); $('rv-make-o').value = make && !known ? make : '';
    buildModels();
    if (make && known) {
      const hit = (vData[make] || []).includes(model);
      $('rv-model').value = !model ? '' : hit ? model : OTHER;
      toggleOther($('rv-model'), $('rv-model-o'), !!model && !hit); $('rv-model-o').value = model && !hit ? model : '';
    } else if (make) $('rv-model-o').value = model || '';
  }

  const FIELD_IDS = { workOrder: 'rep-wo', name: 'rep-name', phone: 'rep-phone', email: 'rep-email', vehicleYear: 'rv-year', vehicleMake: 'rv-make', vehicleModel: 'rv-model', stage: 'rep-stage', estimatedCompletion: 'rep-est', note: 'rep-note' };
  function clearFieldErrors() {
    $('rep-form-error').hidden = true;
    document.querySelectorAll('#rep-form .f.invalid').forEach((f) => { f.classList.remove('invalid'); f.querySelector('.err').textContent = ''; });
  }
  function showFieldErrors(e) {
    const box = $('rep-form-error'); box.textContent = e.message; box.hidden = false;
    let first = null;
    Object.entries(e.fields || {}).forEach(([k, msg]) => {
      const inp = $(FIELD_IDS[k]); if (!inp) return;
      const f = inp.closest('.f'); f.classList.add('invalid'); f.querySelector('.err').textContent = msg; first = first || inp;
    });
    (first || box).scrollIntoView({ block: 'center', behavior: 'smooth' }); if (first) first.focus({ preventScroll: true });
  }
  const emailNote = (res) => (res.emailed === 'sent' ? ' Customer emailed.' : res.emailed === 'skipped' ? ' (Email is not set up on the site yet, so nothing was emailed.)' : res.emailed === 'failed' ? ' (The email could not be sent.)' : '');

  function showList() { $('rep-form').hidden = true; $('rep-list-view').hidden = false; R.editing = null; loadRepairs(); }
  function updateNotifyBox() {
    const has = !!$('rep-email').value.trim();
    $('rep-notify').disabled = !has;
    $('rep-notify-hint').textContent = has ? '(sent when the stage changes)' : '(no email on file)';
    if (!has) $('rep-notify').checked = false;
  }
  $('rep-email').addEventListener('input', () => { const had = !$('rep-notify').disabled; updateNotifyBox(); if (!had && $('rep-email').value.trim()) $('rep-notify').checked = true; });
  function openForm(repair) {
    clearFieldErrors();
    R.repair = repair || null; R.editing = repair ? repair.workOrder : null;
    $('rep-list-view').hidden = true; $('rep-form').hidden = false;
    $('rep-form-title').textContent = repair ? `Work order #${repair.workOrder}` : 'Add a repair';
    const sel = $('rep-stage'); sel.innerHTML = ''; R.stages.forEach((s) => addOpt(sel, s.id, s.label));
    $('rep-wo').value = repair ? repair.workOrder : ''; $('rep-wo').readOnly = !!repair;
    $('rep-name').value = repair?.name || ''; $('rep-phone').value = repair?.phone || ''; $('rep-email').value = repair?.email || '';
    setVehicle(repair?.vehicleYear, repair?.vehicleMake, repair?.vehicleModel);
    sel.value = repair?.stage || 'estimate';
    $('rep-note').value = repair?.note || ''; $('rep-est').value = repair?.estimatedCompletion || ''; $('rep-parts').checked = !!repair?.waitingOnParts;
    updateNotifyBox(); $('rep-notify').checked = !!repair?.email;
    const done = !!repair?.archived, ready = repair?.stage === 'ready';
    $('rep-advance').hidden = !repair || done || !repair.nextStage;
    if (repair?.nextStage) $('rep-advance').textContent = 'Advance to: ' + (R.stages.find((s) => s.id === repair.nextStage)?.label || '');
    $('rep-pickup').hidden = !repair || done || !ready;
    $('rep-restore').hidden = !repair || !done;
    $('rep-delete').hidden = !repair;
    $('rep-save').textContent = repair ? 'Save changes' : 'Add repair';
    $('rep-history-box').hidden = !repair;
    const h = $('rep-history'); h.innerHTML = '';
    (repair?.history || []).slice().reverse().forEach((x) => {
      const li = document.createElement('li');
      li.innerHTML = `<strong>${esc(x.stage === 'picked-up' ? 'Picked up' : (R.stages.find((s) => s.id === x.stage)?.label || x.stage))}</strong><span class="muted">${esc(fmtWhen(x.at))}</span>`;
      h.appendChild(li);
    });
    window.scrollTo({ top: 0 });
    (repair ? $('rep-stage') : $('rep-wo')).focus({ preventScroll: true });
  }
  function formBody() {
    const b = {
      name: $('rep-name').value, phone: $('rep-phone').value, email: $('rep-email').value,
      vehicleYear: $('rv-year').value, vehicleMake: pickedVal('rv-make', 'rv-make-o'), vehicleModel: pickedVal('rv-model', 'rv-model-o'),
      stage: $('rep-stage').value, note: $('rep-note').value, estimatedCompletion: $('rep-est').value, waitingOnParts: $('rep-parts').checked,
    };
    if (!R.editing) b.workOrder = $('rep-wo').value.trim(); else b.notify = $('rep-notify').checked;
    return b;
  }
  async function saveRepair() {
    clearFieldErrors();
    const btn = $('rep-save'); btn.disabled = true;
    try {
      const editing = !!R.editing;
      const opts = { method: editing ? 'PUT' : 'POST', body: JSON.stringify(formBody()) };
      const res = await api(editing ? 'repairs/' + R.editing : 'repairs', opts);
      toast((editing ? 'Saved.' : `Added work order #${res.repair.workOrder}.`) + emailNote(res));
      showList();
    } catch (x) { showFieldErrors(x); } finally { btn.disabled = false; }
  }
  $('rep-form').addEventListener('submit', (e) => { e.preventDefault(); saveRepair(); });
  $('rep-advance').addEventListener('click', () => { if (R.repair?.nextStage) { $('rep-stage').value = R.repair.nextStage; saveRepair(); } });
  $('rep-cancel').addEventListener('click', showList);
  $('rep-new').addEventListener('click', () => openForm(null));
  async function repAction(path, method, msg) {
    try { await api(path, { method }); toast(msg); showList(); } catch (x) { toast(x.message); }
  }
  function repOk(q) { return window.confirm(q); }
  function repPick() {
    if (!repOk('Mark work order ' + R.editing + ' as collected by the customer?')) return;
    repAction('repairs/' + R.editing + '/pickup', 'POST', 'Done.');
  }
  function repBack() { repAction('repairs/' + R.editing + '/restore', 'POST', 'Back on the active list.'); }
  function repDel() {
    if (!repOk('Remove work order ' + R.editing + '? The customer will no longer be able to look it up.')) return;
    repAction('repairs/' + R.editing, 'DELETE', 'Removed.');
  }
  $('rep-pickup').addEventListener('click', repPick);
  $('rep-restore').addEventListener('click', repBack);
  $('rep-delete').addEventListener('click', repDel);

  function repCard(r) {
    const next = r.nextStage ? (R.stages.find((s) => s.id === r.nextStage)?.label || '') : '';
    const div = document.createElement('div'); div.className = 'appt rep-card' + (r.archived ? ' is-done' : '');
    div.innerHTML = `<div class="rep-head"><strong class="rep-wo">#${esc(r.workOrder)}</strong><span class="rep-name">${esc(r.name)}</span></div>
      <div class="rep-veh">${esc(r.vehicle)}</div>
      <div class="rep-meta"><span class="chip chip-stage">${esc(r.archived ? 'Picked up' : r.stageLabel)}</span>${r.waitingOnParts ? '<span class="badge-parts">Waiting on parts</span>' : ''}<span class="muted">Updated ${esc(fmtWhen(r.updatedAt))}</span></div>
      <div class="rep-btns"></div>`;
    const btns = div.querySelector('.rep-btns');
    const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'btn btn-outline btn-lg'; edit.textContent = 'Open / edit';
    edit.addEventListener('click', () => openForm(r)); btns.appendChild(edit);
    if (!r.archived && next) {
      const adv = document.createElement('button'); adv.type = 'button'; adv.className = 'btn btn-red btn-lg'; adv.textContent = 'Advance to: ' + next;
      adv.addEventListener('click', () => advanceFromList(r, next)); btns.appendChild(adv);
    }
    return div;
  }
  async function advanceFromList(r, next) {
    const mail = r.email ? ` ${r.name.split(' ')[0]} will be emailed about it.` : '';
    if (!window.confirm(`Move work order ${r.workOrder} to "${next}"?${mail}`)) return;
    try { const res = await api(`repairs/${r.workOrder}/advance`, { method: 'POST', body: JSON.stringify({ notify: !!r.email }) }); toast(`Now at: ${next}.` + emailNote(res)); loadRepairs(); }
    catch (x) { toast(x.message); }
  }
  async function loadRepairs() {
    const box = $('rep-list');
    try {
      const qs = new URLSearchParams({ q: $('rep-q').value.trim(), archived: $('rep-archived').checked ? '1' : '0' });
      const data = await api('repairs?' + qs);
      R.stages = data.stages;
      box.innerHTML = '';
      if (!data.repairs.length) { box.innerHTML = `<p class="muted rep-empty">${$('rep-q').value.trim() ? 'No repairs match that search.' : 'No active repairs yet. Tap "+ Add a repair" when a new work order comes in.'}</p>`; return; }
      data.repairs.forEach((r) => box.appendChild(repCard(r)));
    } catch (x) { box.innerHTML = `<div class="alert error">${esc(x.message)}</div>`; }
  }
  let repTimer;
  $('rep-q').addEventListener('input', () => { clearTimeout(repTimer); repTimer = setTimeout(loadRepairs, 250); });
  $('rep-archived').addEventListener('change', loadRepairs);
  document.querySelector('.tabs [data-tab="repairs"]').addEventListener('click', showList);

  async function start() {
    showApp(true);
    try { await loadSettings(); await Promise.all([loadAppts(), loadBlocks(), loadRepairs()]); }
    catch (x) { if (token) toast(x.message); }
  }
  if (token) start(); else showApp(false);
})();
