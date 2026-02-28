/* ============================================================
   main.js — Interactions for Neobrutalist Portfolio
   ============================================================ */

// ---------- Dark Mode Toggle ----------
const themeToggle = document.getElementById('themeToggle');
const htmlEl = document.documentElement;

// Check for saved preference; default to dark
function getPreferredTheme() {
  const saved = localStorage.getItem('theme');
  if (saved) return saved;
  return 'dark'; // Always default to dark mode when no preference is saved
}

function setTheme(theme) {
  htmlEl.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
}

// Initialize theme
setTheme(getPreferredTheme());

themeToggle.addEventListener('click', () => {
  const current = htmlEl.getAttribute('data-theme');
  setTheme(current === 'dark' ? 'light' : 'dark');
});

// ---------- Subtitle Rotation ----------
const subtitles = [
  'Systems Engineer',
  'ML Practitioner',
  'Cloud Native Builder',
  'Backend Engineer',
  'DevOps Enthusiast',
];

let currentSubtitleIndex = 0;
const subtitleEl = document.getElementById('subtitle');

if (subtitleEl) {
  function rotateSubtitle() {
    // Fade out
    subtitleEl.style.opacity = '0';
    subtitleEl.style.transform = 'translateY(8px)';

    setTimeout(() => {
      currentSubtitleIndex = (currentSubtitleIndex + 1) % subtitles.length;
      subtitleEl.innerHTML = `<span class="subtitle-text">${subtitles[currentSubtitleIndex]}</span>`;
      // Fade in
      subtitleEl.style.opacity = '1';
      subtitleEl.style.transform = 'translateY(0)';
    }, 300);
  }

  // Initialize first subtitle with styled span
  subtitleEl.innerHTML = `<span class="subtitle-text">${subtitles[0]}</span>`;
  subtitleEl.style.transition = 'opacity 0.3s ease, transform 0.3s ease';

  setInterval(rotateSubtitle, 2800);
}

// ---------- Scroll Reveal (IntersectionObserver) ----------
const revealElements = document.querySelectorAll('.reveal');

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        revealObserver.unobserve(entry.target); // animate once
      }
    });
  },
  { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
);

revealElements.forEach((el) => revealObserver.observe(el));

// ---------- Navbar Shadow on Scroll ----------
const nav = document.getElementById('nav');

window.addEventListener('scroll', () => {
  if (window.scrollY > 20) {
    nav.classList.add('nav--scrolled');
  } else {
    nav.classList.remove('nav--scrolled');
  }
});

// ---------- Mobile Hamburger ----------
const hamburger = document.getElementById('hamburger');
const mobileMenu = document.getElementById('mobileMenu');

hamburger.addEventListener('click', () => {
  hamburger.classList.toggle('active');
  mobileMenu.classList.toggle('active');
  document.body.style.overflow = mobileMenu.classList.contains('active') ? 'hidden' : '';
});

// Close mobile menu when a link is clicked
mobileMenu.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => {
    hamburger.classList.remove('active');
    mobileMenu.classList.remove('active');
    document.body.style.overflow = '';
  });
});

// ---------- Smooth Scroll for nav anchors ----------
document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
  anchor.addEventListener('click', (e) => {
    const targetId = anchor.getAttribute('href');
    if (targetId === '#') return;
    e.preventDefault();
    const target = document.querySelector(targetId);
    if (target) {
      const navHeight = nav.offsetHeight;
      const targetPosition = target.getBoundingClientRect().top + window.scrollY - navHeight;
      window.scrollTo({ top: targetPosition, behavior: 'smooth' });
    }
  });
});

// ---------- Scroll Spy Navigation ----------
const sections = document.querySelectorAll('section');
const navLinks = document.querySelectorAll('.nav__links a');

window.addEventListener('scroll', () => {
  let current = '';

  // Check if we're at the very bottom of the page
  const isAtBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 10;

  if (isAtBottom) {
    // If at bottom, force the last section to be active (usually Contact)
    const lastSection = sections[sections.length - 1];
    if (lastSection) {
      current = lastSection.getAttribute('id');
    }
  } else {
    sections.forEach(section => {
      const sectionTop = section.offsetTop;
      // Adjust offset to trigger slightly before the section reaches the top
      if (window.scrollY >= (sectionTop - 150)) {
        current = section.getAttribute('id');
      }
    });
  }

  navLinks.forEach(link => {
    link.classList.remove('active');
    if (link.getAttribute('href') === `#${current}`) {
      link.classList.add('active');
    }
  });
});

// ---------- Back to Top ----------
const backToTopBtn = document.getElementById('backToTopBtn');

if (backToTopBtn) {
  window.addEventListener('scroll', () => {
    if (window.scrollY > 300) {
      backToTopBtn.classList.add('show');
    } else {
      backToTopBtn.classList.remove('show');
    }
  });

  backToTopBtn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

// ---------- Interactive Project Images (Event Delegation) ----------
const imgBackdrop = document.createElement('div');
imgBackdrop.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.85);z-index:9998;display:none;cursor:zoom-out;';
document.body.appendChild(imgBackdrop);

document.addEventListener('click', (e) => {
  // Check if click was on a zoomable image
  if (e.target.matches('.eng-highlight__image, .project-showcase__gallery-item')) {
    const img = e.target;
    img.classList.add('zoomable-img'); // ensure class is there
    img.classList.toggle('expanded');

    if (img.classList.contains('expanded')) {
      imgBackdrop.style.display = 'block';
      document.body.style.overflow = 'hidden';
    } else {
      imgBackdrop.style.display = 'none';
      document.body.style.overflow = '';
    }
  }
  // Check if click was on the backdrop OR an already expanded image
  else if (e.target === imgBackdrop || e.target.matches('img.expanded')) {
    const expandedImg = document.querySelector('img.expanded');
    if (expandedImg) {
      expandedImg.classList.remove('expanded');
      imgBackdrop.style.display = 'none';
      document.body.style.overflow = '';
    }
  }
});
