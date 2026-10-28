(() => {
  const $ = (id) => document.getElementById(id);
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const state = { today: null, maxDate: null, month: null, days: {}, date: null, time: null, photos: [] };

  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
  const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return { y, m: m - 1, d }; };
  const fmtTime = (t) => { const [h, m] = t.split(':').map(Number); return `${((h + 11) % 12) + 1}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`; };
  const fmtDate = (s) => { const { y, m, d } = parse(s); return new Date(Date.UTC(y, m, d)).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' }); };
  const daysIn = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const diff = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5) + 1;

  async function loadMonth(y, m) {
    const first = ymd(y, m, 1), last = ymd(y, m, daysIn(y, m));
    const start = state.today && first < state.today ? state.today : first;
    const days = state.today ? Math.max(1, diff(start, last)) : 62;
    const r = await fetch(`/api/availability?start=${start}&days=${days}`, { cache: 'no-store' });
    if (!r.ok) throw new Error('Could not load availability');
    const data = await r.json();
    state.today = data.today; state.maxDate = data.maxDate;
    for (const d of data.days) state.days[d.date] = d;
    const msg = $('booking-message');
    if (data.bookingMessage) { msg.textContent = data.bookingMessage; msg.hidden = false; } else msg.hidden = true;
    return data;
  }

  function renderCal() {
    const { y, m } = state.month;
    $('cal-title').textContent = `${MONTHS[m]} ${y}`;
    const cal = $('cal'); cal.innerHTML = '';
    ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach((d) => { const e = document.createElement('div'); e.className = 'dow'; e.textContent = d; cal.appendChild(e); });
    const firstDow = new Date(Date.UTC(y, m, 1)).getUTCDay();
    for (let i = 0; i < firstDow; i++) { const e = document.createElement('div'); e.className = 'empty'; cal.appendChild(e); }
    for (let d = 1; d <= daysIn(y, m); d++) {
      const date = ymd(y, m, d), info = state.days[date];
      const b = document.createElement('button'); b.type = 'button'; b.textContent = d; b.dataset.date = date;
      const ok = info && info.open && info.slots.length;
      if (info && info.holiday) { b.className = 'holiday'; b.title = `Closed: ${info.holiday}`; }
      if (ok) { b.className = 'avail'; b.setAttribute('aria-label', `${fmtDate(date)}, ${info.slots.length} times available`); }
      else { b.disabled = true; b.setAttribute('aria-label', `${fmtDate(date)}, ${info && info.holiday ? 'closed for ' + info.holiday : 'unavailable'}`); }
      if (date === state.today) b.classList.add('today');
      if (date === state.date) b.classList.add('selected');
      b.addEventListener('click', () => selectDate(date));
      cal.appendChild(b);
    }
    const t = parse(state.today), mx = parse(state.maxDate);
    $('cal-prev').disabled = y * 12 + m <= t.y * 12 + t.m;
    $('cal-next').disabled = y * 12 + m >= mx.y * 12 + mx.m;
  }

  function selectDate(date) {
    state.date = date; state.time = null;
    renderCal(); renderSlots(); updateSummary();
    if (window.innerWidth < 960) $('step-time').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderSlots() {
    const box = $('slots'); box.innerHTML = '';
    const info = state.date && state.days[state.date];
    if (!info) { $('slot-hint').textContent = 'Select a day above to see availability.'; return; }
    if (!info.slots.length) { $('slot-hint').textContent = 'Nothing left available on this day. Please pick another day.'; return; }
    $('slot-hint').textContent = `Available times on ${fmtDate(state.date)}:`;
    for (const t of info.slots) {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = fmtTime(t); b.dataset.time = t;
      b.setAttribute('role', 'option');
      if (t === state.time) { b.classList.add('selected'); b.setAttribute('aria-selected', 'true'); }
      b.addEventListener('click', () => { state.time = t; renderSlots(); updateSummary(); if (window.innerWidth < 960) $('book-form').scrollIntoView({ behavior: 'smooth' }); });
      box.appendChild(b);
    }
  }

  function updateSummary() {
    $('sum-date').textContent = state.date ? fmtDate(state.date) : '—';
    $('sum-time').textContent = state.time ? fmtTime(state.time) : '—';
    $('submit-btn').disabled = !(state.date && state.time);
  }

  async function goMonth(delta) {
    let { y, m } = state.month; m += delta; if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; }
    state.month = { y, m };
    $('cal-title').textContent = 'Loading…';
    try { await loadMonth(y, m); } catch (e) { showErr(e.message); }
    renderCal();
  }

  // ---------- photos ----------
  function compress(file) {
    return new Promise((resolve) => {
      if (!file.type.startsWith('image/')) return resolve(null);
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        const max = 1600, s = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        c.toBlob((b) => { URL.revokeObjectURL(url); resolve(b ? new File([b], (file.name || 'photo').replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : null); }, 'image/jpeg', 0.8);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(file.size <= 1.5 * 1024 * 1024 ? file : null); };
      img.src = url;
    });
  }
  function renderThumbs() {
    const box = $('thumbs'); box.innerHTML = '';
    state.photos.forEach((f, i) => {
      const fig = document.createElement('figure'), img = document.createElement('img'), x = document.createElement('button');
      img.src = URL.createObjectURL(f); img.alt = `Photo ${i + 1}`;
      x.type = 'button'; x.textContent = '×'; x.setAttribute('aria-label', 'Remove photo');
      x.onclick = () => { state.photos.splice(i, 1); renderThumbs(); };
      fig.append(img, x); box.appendChild(fig);
    });
  }
  $('photos').addEventListener('change', async (e) => {
    const err = $('photos-err'); err.style.display = 'none';
    for (const f of [...e.target.files]) {
      if (state.photos.length >= 4) { err.textContent = 'Up to 4 photos.'; err.style.display = 'block'; break; }
      const c = await compress(f);
      if (c && c.size <= 1.5 * 1024 * 1024) state.photos.push(c);
      else { err.textContent = `Couldn't use "${f.name}". Try a JPG or PNG photo.`; err.style.display = 'block'; }
    }
    e.target.value = ''; renderThumbs();
  });

  // ---------- vehicle + insurance: native <select>s (reliable on phones; no <datalist>) ----------
  const OTHER = '__other';
  const addOpt = (sel, value, label) => { const o = document.createElement('option'); o.value = value; o.textContent = label ?? value; sel.appendChild(o); };
  const resetSel = (sel, placeholder) => { sel.innerHTML = ''; addOpt(sel, '', placeholder); };
  // Show a text box when "Other (type it in)" is chosen (or `force` is true).
  function toggleOther(sel, input, force) {
    const on = force || sel.value === OTHER;
    input.hidden = !on; if (!on) input.value = '';
    return on;
  }
  const vehicleData = window.LYKNU_VEHICLES || {};
  (function vehicleFields() {
    const yearSel = $('vehicleYear'), make = $('vehicleMake'), model = $('vehicleModel'), makeO = $('vehicleMakeOther'), modelO = $('vehicleModelOther');
    for (let y = new Date().getFullYear() + 1; y >= 1980; y--) addOpt(yearSel, y);
    Object.keys(vehicleData).forEach((m) => addOpt(make, m));
    addOpt(make, OTHER, 'Other (type it in)');
    function buildModels() {
      const m = make.value;
      if (!m) { resetSel(model, 'Select make first'); model.disabled = true; toggleOther(model, modelO, false); return; }
      if (m === OTHER) { // unknown make: model is typed too
        resetSel(model, 'Other (type it in)'); addOpt(model, OTHER, 'Other (type it in)'); model.value = OTHER; model.disabled = true;
        toggleOther(model, modelO, true); return;
      }
      resetSel(model, 'Select model'); (vehicleData[m] || []).forEach((v) => addOpt(model, v));
      addOpt(model, OTHER, 'Other (type it in)'); model.disabled = false; toggleOther(model, modelO, false);
    }
    make.addEventListener('change', () => {
      const on = toggleOther(make, makeO); buildModels();
      if (on) makeO.focus();
    });
    model.addEventListener('change', () => { if (toggleOther(model, modelO)) modelO.focus(); });
  })();
  $('insurance').addEventListener('change', () => { if (toggleOther($('insurance'), $('insuranceOther'))) $('insuranceOther').focus(); });
  // Value to send for a select that may be "Other" (typed text).
  function picked(selId, otherId) { const s = $(selId); return s.value === OTHER ? $(otherId).value.trim() : s.value.trim(); }


  // ---------- submit ----------
  function showErr(msg) { const a = $('form-alert'); a.textContent = msg; a.hidden = !msg; }
  function fieldErrors(fields = {}) {
    document.querySelectorAll('#book-form .f').forEach((f) => f.classList.remove('invalid'));
    let first = null;
    for (const [k, v] of Object.entries(fields)) {
      const input = document.getElementById(k);
      if (input) { const f = input.closest('.f'); f.classList.add('invalid'); f.querySelector('.err').textContent = v; first ||= input; }
      if (k === 'photos') { $('photos-err').textContent = v; $('photos-err').style.display = 'block'; }
    }
    if (first) first.focus();
  }
  function validate(form) {
    const v = (n) => form.elements[n].value.trim(), e = {};
    if (v('name').length < 2) e.name = 'Enter your name.';
    if (!v('phone')) e.phone = 'Phone number is required so we can reach you about your appointment.';
    else if (v('phone').replace(/\D/g, '').length < 10) e.phone = 'Enter a phone number with area code (at least 10 digits).';
    if (v('email') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v('email'))) e.email = 'Enter a valid email or leave it blank.';
    if (!/^(19|20)\d{2}$/.test(v('vehicleYear'))) e.vehicleYear = 'Choose the year.';
    if (!picked('vehicleMake', 'vehicleMakeOther')) e.vehicleMake = $('vehicleMake').value === OTHER ? 'Type the make.' : 'Choose the make.';
    if (!picked('vehicleModel', 'vehicleModelOther')) e.vehicleModel = $('vehicleModel').value === OTHER ? 'Type the model.' : 'Choose the model.';
    if (v('description').length < 5) e.description = 'Briefly describe the damage or problem.';
    return e;
  }

  $('book-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target; showErr('');
    if (!state.date || !state.time) { showErr('Please pick a day and time first.'); return; }
    const errs = validate(form); fieldErrors(errs);
    if (Object.keys(errs).length) return;
    const fd = new FormData(form);
    fd.set('date', state.date); fd.set('time', state.time);
    fd.set('vehicleMake', picked('vehicleMake', 'vehicleMakeOther')); fd.set('vehicleModel', picked('vehicleModel', 'vehicleModelOther'));
    fd.set('insurance', picked('insurance', 'insuranceOther'));
    ['vehicleMakeOther', 'vehicleModelOther', 'insuranceOther'].forEach((k) => fd.delete(k));
    state.photos.forEach((p) => fd.append('photos', p, p.name));
    const btn = $('submit-btn'); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Booking…';
    try {
      const r = await fetch('/api/book', { method: 'POST', body: fd });
      const data = await r.json().catch(() => ({}));
      if (r.ok && data.ok) {
        $('booking-root').hidden = true; $('confirm').hidden = false;
        $('confirm-when').textContent = data.when || `${fmtDate(state.date)} at ${fmtTime(state.time)}`;
        $('confirm-id').textContent = data.id;
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      if (data.fields) fieldErrors(data.fields);
      showErr(data.error || 'Something went wrong. Please call us to book.');
      if (r.status === 409) { // slot taken: refresh availability
        delete state.days[state.date]; state.time = null;
        await loadMonth(state.month.y, state.month.m); renderCal(); renderSlots(); updateSummary();
      }
    } catch {
      showErr('Network problem — please try again or call us to book.');
    } finally {
      btn.innerHTML = 'Book My Estimate'; updateSummary();
    }
  });

  $('cal-prev').addEventListener('click', () => goMonth(-1));
  $('cal-next').addEventListener('click', () => goMonth(1));

  (async () => {
    try {
      const now = new Date();
      // first load: up to 62 days from shop "today" to learn today/maxDate and find the first open date
      const r = await fetch('/api/availability?days=62', { cache: 'no-store' });
      if (!r.ok) throw new Error();
      const data = await r.json();
      state.today = data.today; state.maxDate = data.maxDate;
      for (const d of data.days) state.days[d.date] = d;
      if (data.bookingMessage) { $('booking-message').textContent = data.bookingMessage; $('booking-message').hidden = false; }
      const firstOpen = data.days.find((d) => d.open);
      const base = parse(firstOpen ? firstOpen.date : data.today);
      state.month = { y: base.y, m: base.m };
      renderCal();
      if (!firstOpen) $('slot-hint').textContent = 'No online times are open right now. Please call us to schedule.';
      void now;
    } catch {
      $('cal-title').textContent = 'Unavailable';
      showErr('Online booking is temporarily unavailable. Please call us to schedule your estimate.');
    }
  })();
})();
