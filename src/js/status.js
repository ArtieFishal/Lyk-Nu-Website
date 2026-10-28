// Public repair status page: POST /api/status with work order + last 4 phone digits. Text is always set via textContent.
(function () {
  const $ = (id) => document.getElementById(id);
  const form = $('status-form'), result = $('status-result'), errBox = $('status-error'), btn = $('status-submit');
  if (!form) return;

  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const fmtWhen = (iso, tz) => new Date(iso).toLocaleString('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const fmtDay = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' });

  const params = new URLSearchParams(location.search);
  const pre = (params.get('wo') || '').replace(/\D/g, '').slice(0, 10);
  if (pre) $('wo').value = pre;

  function fieldError(id, msg) {
    const f = $(id).closest('.f');
    f.classList.toggle('invalid', !!msg);
    f.querySelector('.err').textContent = msg || '';
    $(id).setAttribute('aria-invalid', msg ? 'true' : 'false');
  }
  function showError(msg) { errBox.textContent = msg; errBox.hidden = !msg; }

  function render(r) {
    $('r-for').textContent = `Work order #${r.workOrder} · ${r.customer}`;
    $('r-vehicle').textContent = r.vehicle;
    $('r-stage').textContent = r.pickedUp ? 'Picked up' : r.stageLabel;
    $('r-parts').hidden = !r.waitingOnParts || r.pickedUp;
    const done = r.pickedUp ? r.stageCount : r.stageIndex + 1;
    const bar = $('r-bar');
    bar.setAttribute('aria-valuenow', String(done));
    bar.setAttribute('aria-valuetext', r.pickedUp ? 'Repair complete and picked up' : `Step ${done} of ${r.stageCount}: ${r.stageLabel}`);
    $('r-fill').style.width = Math.round((done / r.stageCount) * 100) + '%';
    $('r-step').textContent = r.pickedUp ? 'This repair is complete. Thank you for choosing us!' : `Step ${done} of ${r.stageCount}`;

    const list = $('r-steps'); list.textContent = '';
    r.stages.forEach((s, i) => {
      const state = r.pickedUp || i < r.stageIndex ? 'done' : i === r.stageIndex ? 'current' : 'todo';
      const li = el('li', 'step ' + state);
      if (state === 'current') li.setAttribute('aria-current', 'step');
      li.appendChild(el('span', 'dot', state === 'done' ? '✓' : String(i + 1))).setAttribute('aria-hidden', 'true');
      li.appendChild(el('span', 'lbl', s.label));
      li.appendChild(el('span', 'sr-only', state === 'done' ? ' (completed)' : state === 'current' ? ' (current stage)' : ' (upcoming)'));
      list.appendChild(li);
    });

    $('r-note-box').hidden = !r.note;
    $('r-note').textContent = r.note;
    const est = $('r-est');
    est.hidden = !r.estimatedCompletion || r.pickedUp;
    est.textContent = r.estimatedCompletion ? `Estimated completion: ${fmtDay(r.estimatedCompletion)} (an estimate; it can change)` : '';
    $('r-updated').textContent = `Last updated ${fmtWhen(r.updatedAt, r.timezone)}`;

    const hist = $('r-history'); hist.textContent = '';
    r.history.slice().reverse().forEach((h) => {
      const li = el('li');
      li.appendChild(el('strong', null, h.label));
      li.appendChild(el('span', 'muted', fmtWhen(h.at, r.timezone)));
      hist.appendChild(li);
    });
    $('r-call').href = 'tel:' + r.shopPhoneE164;
    form.hidden = true;
    result.hidden = false;
    const h = $('r-vehicle'); h.focus({ preventScroll: true });
    result.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showError('');
    const wo = $('wo').value.trim(), last4 = $('last4').value.trim();
    const woBad = !/^\d{3,10}$/.test(wo), l4Bad = !/^\d{4}$/.test(last4);
    fieldError('wo', woBad ? 'Enter your work order number (numbers only).' : '');
    fieldError('last4', l4Bad ? 'Enter exactly 4 digits.' : '');
    if (woBad || l4Bad) { $(woBad ? 'wo' : 'last4').focus(); return; }
    btn.disabled = true; btn.textContent = 'Checking…';
    try {
      const res = await fetch('/api/status', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workOrder: wo, last4 }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.repair) { showError(data.error || 'Something went wrong. Please try again, or call us.'); return; }
      render(data.repair);
    } catch { showError('We could not reach the server. Check your connection and try again, or call us.'); }
    finally { btn.disabled = false; btn.textContent = 'Check status'; }
  });

  $('r-again').addEventListener('click', () => {
    result.hidden = true; form.hidden = false;
    $('last4').value = '';
    $('wo').focus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
})();
