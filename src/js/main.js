(() => {
  const t = document.querySelector('.nav-toggle'), n = document.getElementById('nav');
  if (t && n) {
    t.addEventListener('click', () => { const o = n.classList.toggle('open'); t.setAttribute('aria-expanded', o); });
    n.addEventListener('click', (e) => { if (e.target.tagName === 'A') { n.classList.remove('open'); t.setAttribute('aria-expanded', 'false'); } });
  }
  document.querySelectorAll('[data-year]').forEach((el) => (el.textContent = new Date().getFullYear()));
})();

// Our Work gallery lightbox
(() => {
  const links = [...document.querySelectorAll('a[data-lightbox]')];
  if (!links.length) return;
  const box = document.createElement('div');
  box.className = 'glb'; box.hidden = true;
  box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Photo viewer');
  box.innerHTML = '<button class="glb-close" aria-label="Close">&times;</button><button class="glb-prev" aria-label="Previous photo">&#8249;</button><img alt=""><p></p><button class="glb-next" aria-label="Next photo">&#8250;</button>';
  document.body.appendChild(box);
  const img = box.querySelector('img'), cap = box.querySelector('p');
  let i = 0, last = null;
  const show = (n) => { i = (n + links.length) % links.length; const a = links[i]; img.src = a.href; img.alt = a.dataset.caption || ''; cap.textContent = a.dataset.caption || ''; };
  const open = (n) => { last = document.activeElement; show(n); box.hidden = false; document.body.style.overflow = 'hidden'; box.querySelector('.glb-close').focus(); };
  const close = () => { box.hidden = true; img.removeAttribute('src'); document.body.style.overflow = ''; last && last.focus(); };
  links.forEach((a, n) => a.addEventListener('click', (e) => { e.preventDefault(); open(n); }));
  box.querySelector('.glb-close').onclick = close;
  box.querySelector('.glb-prev').onclick = (e) => { e.stopPropagation(); show(i - 1); };
  box.querySelector('.glb-next').onclick = (e) => { e.stopPropagation(); show(i + 1); };
  box.addEventListener('click', (e) => { if (e.target === box) close(); });
  document.addEventListener('keydown', (e) => { if (box.hidden) return; if (e.key === 'Escape') close(); if (e.key === 'ArrowLeft') show(i - 1); if (e.key === 'ArrowRight') show(i + 1); });
  let x0 = null; box.addEventListener('touchstart', (e) => (x0 = e.touches[0].clientX), { passive: true });
  box.addEventListener('touchend', (e) => { if (x0 == null) return; const d = e.changedTouches[0].clientX - x0; if (Math.abs(d) > 50) show(i + (d < 0 ? 1 : -1)); x0 = null; });
})();
