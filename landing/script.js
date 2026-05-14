const WHATSAPP_NUMBER = 'WHATSAPP_NUMBER';

function openWhatsApp() {
  window.open('https://wa.me/' + WHATSAPP_NUMBER + '?text=Oi%20Lina!', '_blank');
}

function shareWhatsApp() {
  const text = 'Conhece a Lina? Companhia de IA para idosos pelo WhatsApp 💚 https://elderlyagent.com';
  window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
}

// ── Navbar scroll ─────────────────────────────────────────────────────────────
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > 80);
}, { passive: true });

// ── GSAP hero animation ───────────────────────────────────────────────────────
if (window.gsap) {
  gsap.from('.hero-tag',   { opacity: 0, y: 20, duration: 0.7, delay: 0.2 });
  gsap.from('.hero-title', { opacity: 0, y: 30, duration: 0.8, delay: 0.4 });
  gsap.from('.hero-sub',   { opacity: 0, y: 20, duration: 0.7, delay: 0.6 });
  gsap.from('.hero-btns',  { opacity: 0, y: 20, duration: 0.7, delay: 0.8 });
  gsap.from('.hero-badge', { opacity: 0, y: 10, duration: 0.6, delay: 1.0 });
}

// ── IntersectionObserver ──────────────────────────────────────────────────────
const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    const el = entry.target;
    const delay = el.dataset.delay || 0;
    setTimeout(() => el.classList.add('visible'), Number(delay));
    observer.unobserve(el);
  });
}, { threshold: 0.12 });

document.querySelectorAll('.animate-section').forEach((el) => observer.observe(el));

// Cards with staggered delay
document.querySelectorAll('.animate-card').forEach((el, i) => {
  el.dataset.delay = i * 100;
  observer.observe(el);
});

// ── Carousel (testimonials) ───────────────────────────────────────────────────
const track  = document.getElementById('carousel');
const dotsEl = document.getElementById('carousel-dots');

if (track && dotsEl) {
  const cards = track.querySelectorAll('.t-card');
  const total = cards.length;
  let current = 0;
  let timer;

  // Build dots
  cards.forEach((_, i) => {
    const btn = document.createElement('button');
    btn.addEventListener('click', () => goTo(i));
    dotsEl.appendChild(btn);
  });

  function updateDots() {
    dotsEl.querySelectorAll('button').forEach((b, i) => {
      b.classList.toggle('active', i === current);
    });
  }

  function goTo(index) {
    current = index;
    const cardW = cards[0].offsetWidth + 24; // gap 24px
    track.style.transform = `translateX(-${current * cardW}px)`;
    updateDots();
  }

  function next() { goTo((current + 1) % total); }

  function startTimer() { timer = setInterval(next, 4000); }
  function stopTimer()  { clearInterval(timer); }

  track.parentElement.addEventListener('mouseenter', stopTimer);
  track.parentElement.addEventListener('mouseleave', startTimer);

  updateDots();
  startTimer();
}

// ── Smooth scroll for anchor links ────────────────────────────────────────────
document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener('click', (e) => {
    const target = document.querySelector(link.getAttribute('href'));
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: 'smooth' });
  });
});
