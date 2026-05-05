const WHATSAPP_NUMBER = 'WHATSAPP_NUMBER';
const SHARE_TEXT = 'Conhece a Lina? Uma IA companheira para idosos pelo WhatsApp 💚 https://lina.ai';

// Extra padding so the section title isn't hidden behind the sticky navbar
const NAV_OFFSET = 64;
// How many px scrolled before the navbar gets its solid background
const NAVBAR_SCROLL_THRESHOLD = 50;

function openWhatsApp() {
  window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=Oi%20Lina!`, '_blank');
}

function shareWhatsApp() {
  window.open(`https://wa.me/?text=${encodeURIComponent(SHARE_TEXT)}`, '_blank');
}

document.addEventListener('DOMContentLoaded', function () {
  const navbar = document.getElementById('navbar');

  // Solid navbar background after scrolling past the hero fold
  window.addEventListener('scroll', function () {
    navbar.classList.toggle('scrolled', window.scrollY > NAVBAR_SCROLL_THRESHOLD);
  }, { passive: true });

  // Smooth scroll for anchor links, accounting for sticky navbar height
  document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener('click', function (e) {
      const target = document.querySelector(this.getAttribute('href'));
      if (!target) return;
      e.preventDefault();
      window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - NAV_OFFSET, behavior: 'smooth' });
    });
  });

  // Fade-in sections as they enter the viewport
  const observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('.reveal').forEach(function (el) {
    observer.observe(el);
  });
});
