(() => {
  const t = document.querySelector('.nav-toggle'), n = document.getElementById('nav');
  if (t && n) {
    t.addEventListener('click', () => { const o = n.classList.toggle('open'); t.setAttribute('aria-expanded', o); });
    n.addEventListener('click', (e) => { if (e.target.tagName === 'A') { n.classList.remove('open'); t.setAttribute('aria-expanded', 'false'); } });
  }
  document.querySelectorAll('[data-year]').forEach((el) => (el.textContent = new Date().getFullYear()));
})();

// header shadow on scroll + restrained scroll reveal (skipped for reduced motion)
(() => {
  const h = document.querySelector('.site-header');
  if (h) { const f = () => h.classList.toggle('scrolled', window.scrollY > 8); f(); window.addEventListener('scroll', f, { passive: true }); }
  const sel = '.section-head,.service,.paint-copy,.paint-fig,.chip,.about-grid>*,.step,.review,.insurance>*,.contact-grid>*,.rating-summary,.steps-cta';
  const els = [...document.querySelectorAll(sel)];
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!els.length || calm || !('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.12, rootMargin: '0px 0px -5% 0px' });
  els.forEach((el, i) => { el.classList.add('reveal'); el.style.setProperty('--d', ((i % 4) * 0.06) + 's'); io.observe(el); });
  // safety net: never leave content hidden
  setTimeout(() => els.forEach((el) => el.classList.add('in')), 6000);
})();
