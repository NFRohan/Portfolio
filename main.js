/* ============================================================
   main.js — Interactions for Neobrutalist Portfolio
   ============================================================ */

// ---------- Motion Preference ----------
// CSS handles the declarative animations; this covers the ones only JS can
// stop (a setInterval) or choose (smooth vs instant scrolling).
const reduceMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const prefersReducedMotion = () => reduceMotionQuery.matches;
const scrollBehavior = () => (prefersReducedMotion() ? 'auto' : 'smooth');

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
  'AI-Native Systems Engineer',
  'AI Systems Engineer',
  'Backend & Infrastructure',
  'Distributed Systems',
  'Reliability Engineering',
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

  // Indefinite motion, so it has to be stoppable rather than just fast.
  let subtitleTimer = null;

  const startRotation = () => {
    if (subtitleTimer || prefersReducedMotion()) return;
    subtitleTimer = setInterval(rotateSubtitle, 2800);
  };

  const stopRotation = () => {
    if (!subtitleTimer) return;
    clearInterval(subtitleTimer);
    subtitleTimer = null;
    subtitleEl.innerHTML = `<span class="subtitle-text">${subtitles[currentSubtitleIndex]}</span>`;
    subtitleEl.style.opacity = '1';
    subtitleEl.style.transform = 'none';
  };

  startRotation();
  reduceMotionQuery.addEventListener('change', () => {
    prefersReducedMotion() ? stopRotation() : startRotation();
  });
}

// ---------- Scroll Reveal (IntersectionObserver) ----------
const revealElements = document.querySelectorAll('.reveal');

const revealObserver = new IntersectionObserver(
  (entries, observer) => {
    // Stagger only across elements entering in the same batch. Indexing by
    // DOM position instead would leave a lone element waiting on a delay
    // meant for neighbours that scrolled past long ago.
    const entering = entries.filter((entry) => entry.isIntersecting);

    entering.forEach((entry, i) => {
      const el = entry.target;
      const delay = entering.length > 1 && !prefersReducedMotion() ? Math.min(i * 70, 350) : 0;

      if (delay) {
        el.style.transitionDelay = `${delay}ms`;
        // Most of these are also .brutalist-card, whose hover press shares the
        // same transition. Leaving the delay set would make hover feel broken,
        // so drop it once the reveal has run.
        setTimeout(() => {
          el.style.transitionDelay = '';
        }, delay + 700);
      }

      el.classList.add('visible');
      observer.unobserve(el); // animate once
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

if (hamburger && mobileMenu) {
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
}

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
      window.scrollTo({ top: targetPosition, behavior: scrollBehavior() });
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
    window.scrollTo({ top: 0, behavior: scrollBehavior() });
  });
}

// ---------- Interactive Project Images (Event Delegation) ----------
// The image is moved into the backdrop while expanded, so the backdrop can be
// the scroll container. A position: fixed image cannot be panned, which left
// wide screenshots unreadable on a phone.
const imgBackdrop = document.createElement('div');
imgBackdrop.className = 'img-backdrop';
document.body.appendChild(imgBackdrop);

const ZOOMABLE = '.eng-highlight__image, .project-showcase__gallery-item';
let imgHome = null; // where to put the image back
let scrollBeforeExpand = 0;

function expandImage(img) {
  if (imgHome) collapseImage();

  // Lifting the image out collapses the figure it came from, which changes
  // the document height. Remember where we were so closing does not land
  // the reader somewhere else on the page.
  scrollBeforeExpand = window.scrollY;
  imgHome = { parent: img.parentNode, next: img.nextSibling };

  // A wide capture needs to render bigger than the viewport to stay legible;
  // a tall one (phone screenshot) already reads at full width.
  const wide = img.naturalWidth >= img.naturalHeight * 1.2;
  img.classList.add('zoomable-img', 'expanded', wide ? 'expanded--wide' : 'expanded--tall');

  imgBackdrop.appendChild(img);
  imgBackdrop.classList.add('is-open');
  // Open at the top-left. Starting mid-scroll on a wide capture looks like
  // the left has been cropped off, which is the whole thing being fixed here.
  imgBackdrop.scrollTop = 0;
  imgBackdrop.scrollLeft = 0;
  document.body.style.overflow = 'hidden';
}

function collapseImage() {
  const img = imgBackdrop.querySelector('img.expanded');
  if (img) {
    img.classList.remove('expanded', 'expanded--wide', 'expanded--tall');
    if (imgHome) imgHome.parent.insertBefore(img, imgHome.next);
  }
  imgHome = null;
  imgBackdrop.classList.remove('is-open');
  document.body.style.overflow = '';
  window.scrollTo({ top: scrollBeforeExpand, behavior: 'auto' });
}

document.addEventListener('click', (e) => {
  if (!imgHome && e.target.matches(ZOOMABLE)) {
    expandImage(e.target);
  } else if (imgHome && (e.target === imgBackdrop || e.target.matches('img.expanded'))) {
    collapseImage();
  }
});

// A full-screen overlay needs a keyboard way out.
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && imgHome) collapseImage();
});

// ---------- Metric Count-Up ----------
// The authored value stays in the HTML, so with JS off (or reduced motion on)
// the correct figure is already on screen and nothing here needs to run.
const metricEls = document.querySelectorAll('.case-metric__value');

if (metricEls.length && !prefersReducedMotion()) {
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);

  const countUp = (el) => {
    const authored = el.textContent.trim();
    // Preserve any prefix or suffix — "~6s", "9+", "55h" — and animate the digits only.
    const parts = authored.match(/^(\D*?)(\d[\d,]*)(.*)$/);
    if (!parts) return;

    const [, prefix, digits, suffix] = parts;
    const target = parseInt(digits.replace(/,/g, ''), 10);
    if (!Number.isFinite(target) || target < 2) return; // nothing worth counting to

    const grouped = digits.includes(',');
    const duration = 900;
    const started = performance.now();

    const tick = (now) => {
      const progress = Math.min((now - started) / duration, 1);
      const value = Math.round(target * easeOut(progress));
      el.textContent = prefix + (grouped ? value.toLocaleString() : value) + suffix;
      if (progress < 1) requestAnimationFrame(tick);
      else el.textContent = authored; // land exactly on the authored string
    };

    requestAnimationFrame(tick);
  };

  const metricObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        countUp(entry.target);
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.6 }
  );

  metricEls.forEach((el) => metricObserver.observe(el));
}

// ---------- Reading Progress (case-study pages only) ----------
if (document.querySelector('.project-showcase')) {
  const bar = document.createElement('div');
  bar.className = 'read-progress';
  bar.setAttribute('aria-hidden', 'true');
  document.body.appendChild(bar);

  let queued = false;

  const paint = () => {
    queued = false;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const ratio = max > 0 ? Math.min(window.scrollY / max, 1) : 0;
    bar.style.transform = `scaleX(${ratio})`;
  };

  // rAF-throttled and passive, so scrolling a long case study stays cheap.
  const onScroll = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(paint);
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  paint();
}
