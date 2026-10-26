(() => {
  'use strict';

  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const $ = (selector, context = document) => context.querySelector(selector);
  const $$ = (selector, context = document) => Array.from(context.querySelectorAll(selector));

  /* ---------------------------------------------------------------
     Theme
  --------------------------------------------------------------- */
  const themeToggles = $$('[data-theme-toggle]');
  const themeMeta = $('meta[name="theme-color"]');

  const applyTheme = (theme, persist = true) => {
    root.dataset.theme = theme;
    const night = theme === 'night';

    if (themeMeta) {
      themeMeta.setAttribute('content', night ? '#0b0713' : '#f0eee7');
    }

    themeToggles.forEach((button) => {
      const text = $('.theme-toggle__text', button);
      if (text) text.textContent = night ? 'Day' : 'Night';
      button.setAttribute('aria-label', night ? 'Switch to day mode' : 'Switch to night mode');
    });

    if (persist) {
      try {
        localStorage.setItem('amethystium-theme-v2', theme);
      } catch (_) {}
    }

    document.dispatchEvent(new CustomEvent('amethystium:theme', { detail: { theme } }));
  };

  const setTheme = (theme, event) => {
    if (reduceMotion || !document.startViewTransition) {
      applyTheme(theme);
      return;
    }

    const button = event && event.currentTarget;
    const rect = button && button.getBoundingClientRect ? button.getBoundingClientRect() : null;
    const x = (event && event.clientX) || (rect ? rect.left + rect.width / 2 : window.innerWidth / 2);
    const y = (event && event.clientY) || (rect ? rect.top + rect.height / 2 : 0);

    const transition = document.startViewTransition(() => applyTheme(theme));

    transition.ready
      .then(() => {
        const radius = Math.hypot(
          Math.max(x, window.innerWidth - x),
          Math.max(y, window.innerHeight - y)
        );
        document.documentElement.animate(
          {
            clipPath: [
              `circle(0px at ${x}px ${y}px)`,
              `circle(${radius}px at ${x}px ${y}px)`,
            ],
          },
          {
            duration: 680,
            easing: 'cubic-bezier(.76,0,.24,1)',
            pseudoElement: '::view-transition-new(root)',
          }
        );
      })
      .catch(() => {});
  };

  themeToggles.forEach((button) => {
    button.addEventListener('click', (event) => {
      const next = root.dataset.theme === 'night' ? 'day' : 'night';
      setTheme(next, event);
    });
  });

  applyTheme(root.dataset.theme === 'night' ? 'night' : 'day', false);

  /* ---------------------------------------------------------------
     Header, scroll progress, active navigation
  --------------------------------------------------------------- */
  const header = $('.site-header');
  const navLinks = $$('.site-nav a');
  const sections = navLinks
    .map((link) => $(link.getAttribute('href')))
    .filter(Boolean);

  let scrollFrame = 0;

  const updateScroll = () => {
    scrollFrame = 0;
    const y = window.scrollY || window.pageYOffset || 0;

    if (header) {
      header.classList.toggle('is-scrolled', y > 24);
      const max = document.documentElement.scrollHeight - window.innerHeight;
      header.style.setProperty('--progress', max > 0 ? Math.min(1, y / max) : 0);

      if (y < window.innerHeight * 0.5) {
        navLinks.forEach((link) => link.removeAttribute('aria-current'));
      }
    }
  };

  const requestScrollUpdate = () => {
    if (!scrollFrame) scrollFrame = requestAnimationFrame(updateScroll);
  };

  window.addEventListener('scroll', requestScrollUpdate, { passive: true });
  window.addEventListener('resize', requestScrollUpdate);
  updateScroll();

  const setActiveNav = (id) => {
    navLinks.forEach((link) => {
      if (link.getAttribute('href') === `#${id}`) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    });
  };

  if ('IntersectionObserver' in window && sections.length) {
    const navObserver = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) setActiveNav(visible[0].target.id);
      },
      { rootMargin: '-35% 0px -55% 0px', threshold: 0 }
    );
    sections.forEach((section) => navObserver.observe(section));
  }

  /* ---------------------------------------------------------------
     Mobile menu
  --------------------------------------------------------------- */
  const menuButton = $('.menu-toggle');
  const menuDialog = $('#menu-dialog');

  if (menuButton && menuDialog && typeof menuDialog.showModal === 'function') {
    menuButton.addEventListener('click', () => {
      menuDialog.showModal();
      root.classList.add('menu-open');
    });

    menuDialog.addEventListener('close', () => {
      root.classList.remove('menu-open');
    });

    const closeButton = $('.menu-dialog__close', menuDialog);
    if (closeButton) {
      closeButton.addEventListener('click', () => menuDialog.close());
    }

    $$('.menu-dialog__nav a', menuDialog).forEach((link) => {
      link.addEventListener('click', () => menuDialog.close());
    });
  }

  /* ---------------------------------------------------------------
     Reveal on scroll
  --------------------------------------------------------------- */
  const revealElements = $$('[data-reveal]');

  if (reduceMotion || !('IntersectionObserver' in window)) {
    revealElements.forEach((element) => element.classList.add('is-in'));
  } else {
    const revealObserver = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-in');
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
    );

    revealElements.forEach((element) => revealObserver.observe(element));
  }

  /* ---------------------------------------------------------------
     Hero wordmark: letters lift toward the pointer
  --------------------------------------------------------------- */
  const hero = $('.hero');
  const heroTitle = $('.hero__title');
  let charMasks = [];
  let chars = [];
  let charOffsets = [];
  let titlePointer = null;
  let titleFrame = 0;
  let maxLift = 8;

  const measureTitle = () => {
    if (!heroTitle) return;
    charMasks = $$('.char-mask', heroTitle);
    chars = $$('.char', heroTitle);
    const fontSize = parseFloat(getComputedStyle(heroTitle).fontSize) || 100;
    maxLift = Math.min(16, fontSize * 0.12);
    const titleRect = heroTitle.getBoundingClientRect();
    charOffsets = charMasks.map((mask) => {
      const rect = mask.getBoundingClientRect();
      return {
        x: rect.left - titleRect.left + rect.width / 2,
        y: rect.top - titleRect.top + rect.height / 2,
      };
    });
  };

  const updateTitle = () => {
    titleFrame = 0;
    if (!finePointer || reduceMotion || !titlePointer || !heroTitle) return;

    const titleRect = heroTitle.getBoundingClientRect();
    const pointerX = titlePointer.clientX - titleRect.left;
    const pointerY = titlePointer.clientY - titleRect.top;

    chars.forEach((char, index) => {
      const offset = charOffsets[index];
      if (!offset) return;
      const distance = Math.hypot(pointerX - offset.x, pointerY - offset.y);
      const lift = distance < 280 ? (1 - distance / 280) * maxLift : 0;
      char.style.transform = lift > 0.1 ? `translateY(${-lift}px)` : '';
    });
  };

  if (hero) {
    hero.addEventListener(
      'pointermove',
      (event) => {
        titlePointer = event;
        if (!titleFrame) titleFrame = requestAnimationFrame(updateTitle);
      },
      { passive: true }
    );

    hero.addEventListener('pointerleave', () => {
      titlePointer = null;
      chars.forEach((char) => {
        char.style.transform = '';
      });
    });
  }

  measureTitle();
  window.addEventListener('resize', () => {
    measureTitle();
    if (titlePointer) updateTitle();
  });
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(measureTitle);
  }

  /* ---------------------------------------------------------------
     Portrait: cursor spotlight and gentle tilt
  --------------------------------------------------------------- */
  const portrait = $('.portrait');
  const portraitInner = portrait ? $('.portrait__inner', portrait) : null;

  if (portrait && portraitInner && finePointer && !reduceMotion) {
    portrait.addEventListener(
      'pointermove',
      (event) => {
        const rect = portrait.getBoundingClientRect();
        const innerRect = portraitInner.getBoundingClientRect();
        const x = Math.min(Math.max(event.clientX - innerRect.left, 0), innerRect.width);
        const y = Math.min(Math.max(event.clientY - innerRect.top, 0), innerRect.height);

        portraitInner.style.setProperty('--mx', `${x}px`);
        portraitInner.style.setProperty('--my', `${y}px`);
        portrait.style.setProperty('--ry', `${((event.clientX - rect.left) / rect.width - 0.5) * 7}deg`);
        portrait.style.setProperty('--rx', `${((event.clientY - rect.top) / rect.height - 0.5) * -7}deg`);
      },
      { passive: true }
    );

    portrait.addEventListener('pointerleave', () => {
      portrait.style.setProperty('--rx', '0deg');
      portrait.style.setProperty('--ry', '0deg');
    });
  }

  /* ---------------------------------------------------------------
     Magnetic links
  --------------------------------------------------------------- */
  if (finePointer && !reduceMotion) {
    $$('.link-cta, .copy-button').forEach((element) => {
      element.classList.add('magnetic');

      element.addEventListener(
        'pointermove',
        (event) => {
          const rect = element.getBoundingClientRect();
          const x = event.clientX - rect.left - rect.width / 2;
          const y = event.clientY - rect.top - rect.height / 2;
          element.style.setProperty('--tx', `${Math.max(-16, Math.min(16, x * 0.18))}px`);
          element.style.setProperty('--ty', `${Math.max(-12, Math.min(12, y * 0.22))}px`);
        },
        { passive: true }
      );

      element.addEventListener('pointerleave', () => {
        element.style.setProperty('--tx', '0px');
        element.style.setProperty('--ty', '0px');
      });
    });
  }

  /* ---------------------------------------------------------------
     Custom crystal cursor
  --------------------------------------------------------------- */
  const cursor = $('.cursor');

  if (cursor && finePointer && !reduceMotion) {
    root.classList.add('has-cursor');

    const ring = $('.cursor__ring', cursor);
    const core = $('.cursor__core', cursor);
    const label = $('.cursor__label', cursor);
    const hoverSelector = 'a, button, [data-cursor-label], .portrait';

    let mouseX = -100;
    let mouseY = -100;
    let ringX = -100;
    let ringY = -100;

    window.addEventListener(
      'pointermove',
      (event) => {
        mouseX = event.clientX;
        mouseY = event.clientY;
      },
      { passive: true }
    );

    window.addEventListener('pointerdown', () => cursor.classList.add('is-down'));
    window.addEventListener('pointerup', () => cursor.classList.remove('is-down'));

    const drawCursor = () => {
      ringX += (mouseX - ringX) * 0.14;
      ringY += (mouseY - ringY) * 0.14;

      ring.style.translate = `${ringX}px ${ringY}px`;
      core.style.translate = `${mouseX}px ${mouseY}px`;
      label.style.translate = `${ringX + 24}px ${ringY + 24}px`;

      requestAnimationFrame(drawCursor);
    };

    requestAnimationFrame(drawCursor);

    document.addEventListener(
      'pointerover',
      (event) => {
        const target = event.target.closest(hoverSelector);
        if (!target) return;

        cursor.classList.add('is-hover');
        const text = target.dataset ? target.dataset.cursorLabel : '';
        if (text) {
          label.textContent = text;
          cursor.classList.add('has-label');
        } else {
          cursor.classList.remove('has-label');
        }
      },
      { passive: true }
    );

    document.addEventListener(
      'pointerout',
      (event) => {
        const target = event.target.closest(hoverSelector);
        if (!target) return;
        const nextTarget = event.relatedTarget && event.relatedTarget.closest
          ? event.relatedTarget.closest(hoverSelector)
          : null;
        if (nextTarget) return;
        cursor.classList.remove('is-hover', 'has-label');
      },
      { passive: true }
    );
  }

  /* ---------------------------------------------------------------
     Research topics → publication filters
  --------------------------------------------------------------- */
  const researchItems = $$('.research__item');
  const pubItems = $$('.pub');
  const pubGroups = $$('.pub-group');
  const statusFilters = $$('[data-filter]');
  const topicChip = $('.filter--topic');
  const pubCount = $('.pub__count');
  const pubEmpty = $('.pub__empty');

  const topicLabels = {
    css: 'Computational Social Science',
    networks: 'Network Analysis',
    communication: 'Computational Communication',
    'info-networks': 'Social and Information Networks',
  };

  let activeStatus = 'all';
  let activeTopic = null;

  const applyFilters = () => {
    pubItems.forEach((item) => {
      const statusMatch = activeStatus === 'all' || item.dataset.status === activeStatus;
      const topicMatch =
        !activeTopic || (item.dataset.topics || '').split(/\s+/).includes(activeTopic);
      const visible = statusMatch && topicMatch;
      item.hidden = !visible;
      if (visible) item.classList.add('is-in');
    });

    pubGroups.forEach((group) => {
      const hasVisible = $$('.pub', group).some((item) => !item.hidden);
      group.hidden = !hasVisible;
    });

    const count = pubItems.filter((item) => !item.hidden).length;
    if (pubCount) {
      pubCount.textContent = `Showing ${count} ${count === 1 ? 'publication' : 'publications'}`;
    }
    if (pubEmpty) pubEmpty.hidden = count !== 0;

    statusFilters.forEach((button) => {
      const isActive = !activeTopic && button.dataset.filter === activeStatus;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    });

    researchItems.forEach((button) => {
      const isActive = button.dataset.topic === activeTopic;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    });

    if (topicChip) {
      if (activeTopic) {
        const topicName = topicLabels[activeTopic] || activeTopic;
        topicChip.hidden = false;
        topicChip.textContent = `${topicName} ×`;
        topicChip.setAttribute('aria-label', `Clear topic filter: ${topicName}`);
      } else {
        topicChip.hidden = true;
        topicChip.textContent = '';
      }
    }
  };

  statusFilters.forEach((button) => {
    button.addEventListener('click', () => {
      activeStatus = button.dataset.filter;
      activeTopic = null;
      applyFilters();
    });
  });

  researchItems.forEach((button) => {
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => {
      const topic = button.dataset.topic;
      if (activeTopic === topic) {
        activeTopic = null;
        applyFilters();
        return;
      }

      activeTopic = topic;
      activeStatus = 'all';
      applyFilters();

      const publications = $('#publications');
      if (publications) {
        publications.scrollIntoView({
          behavior: reduceMotion ? 'auto' : 'smooth',
          block: 'start',
        });
      }
    });
  });

  if (topicChip) {
    topicChip.addEventListener('click', () => {
      activeTopic = null;
      applyFilters();
    });
  }

  applyFilters();

  /* ---------------------------------------------------------------
     Copy email
  --------------------------------------------------------------- */
  const copyButton = $('[data-copy]');
  const copyFeedback = $('.copy-feedback');

  if (copyButton && copyFeedback) {
    copyButton.addEventListener('click', async () => {
      const value = copyButton.dataset.copy;
      let copied = false;

      try {
        await navigator.clipboard.writeText(value);
        copied = true;
      } catch (_) {
        const textarea = document.createElement('textarea');
        textarea.value = value;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        try {
          copied = document.execCommand('copy');
        } catch (_) {}
        textarea.remove();
      }

      copyFeedback.textContent = copied
        ? 'Copied to clipboard'
        : 'Copy failed — select the address above';
      window.clearTimeout(copyFeedback._timer);
      copyFeedback._timer = window.setTimeout(() => {
        copyFeedback.textContent = '';
      }, 2800);
    });
  }

  /* ---------------------------------------------------------------
     Living network canvas
  --------------------------------------------------------------- */
  class LivingNetwork {
    constructor(canvas) {
      this.canvas = canvas;
      this.context = canvas.getContext('2d');
      this.hero = canvas.closest('.hero') || canvas.parentElement;
      this.nodes = [];
      this.dust = [];
      this.sparks = [];
      this.ripples = [];
      this.pointer = { x: -9999, y: -9999, active: false };
      this.width = 0;
      this.height = 0;
      this.frame = 0;
      this.visible = true;
      this.resizeFrame = 0;
      this.reduced = reduceMotion;
      this.night = root.dataset.theme === 'night';
      this.line = '91, 62, 155';
      this.node = '124, 92, 214';
      this.alpha = 0.3;

      this.resize();
      this.refreshPalette();
      this.bind();

      if (this.reduced) {
        this.drawStatic();
      } else {
        this.start();
      }
    }

    resize() {
      const rect = this.hero.getBoundingClientRect();
      this.width = Math.max(1, Math.round(rect.width));
      this.height = Math.max(1, Math.round(rect.height));

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.canvas.width = Math.round(this.width * dpr);
      this.canvas.height = Math.round(this.height * dpr);
      this.canvas.style.width = `${this.width}px`;
      this.canvas.style.height = `${this.height}px`;
      this.context.setTransform(dpr, 0, 0, dpr, 0, 0);

      const golden = Math.PI * (3 - Math.sqrt(5));
      const scatter = this.reduced ? 0 : 1;
      const centerX = this.width * (this.width > 900 ? 0.58 : 0.5);
      const centerY = this.height * (this.width > 900 ? 0.48 : 0.5);
      const radiusX = this.width * (this.width > 900 ? 0.36 : 0.44);
      const radiusY = this.height * (this.width > 900 ? 0.36 : 0.4);

      this.homeCenterX = centerX;
      this.homeCenterY = centerY;

      const count = Math.round(
        Math.min(120, Math.max(34, (this.width * this.height) / 15000))
      );

      this.nodes = Array.from({ length: count }, (_, index) => {
        const t = Math.sqrt((index + 0.5) / count);
        const angle = index * golden;
        const jitter = 0.94 + Math.random() * 0.12;
        const hx = centerX + Math.cos(angle) * radiusX * t * jitter;
        const hy = centerY + Math.sin(angle) * radiusY * t * jitter;

        return {
          x: scatter ? Math.random() * this.width : hx,
          y: scatter ? Math.random() * this.height : hy,
          hx,
          hy,
          vx: (Math.random() - 0.5) * 0.45 * scatter,
          vy: (Math.random() - 0.5) * 0.45 * scatter,
          r: Math.random() * 1.05 + 0.9,
          hub: Math.random() < 0.18,
          phase: Math.random() * Math.PI * 2,
          twinkle: 0.55 + Math.random() * 1.6,
        };
      });

      const dustCount = Math.round(
        Math.min(180, Math.max(44, count * 1.35))
      );

      this.dust = Array.from({ length: dustCount }, (_, index) => {
        const t = Math.sqrt((index + 0.5) / dustCount);
        const angle = index * golden + 0.9;
        const jitter = 0.92 + Math.random() * 0.16;
        const hx = centerX + Math.cos(angle) * radiusX * 0.8 * t * jitter;
        const hy = centerY + Math.sin(angle) * radiusY * 0.8 * t * jitter;

        return {
          x: scatter ? Math.random() * this.width : hx,
          y: scatter ? Math.random() * this.height : hy,
          hx,
          hy,
          vx: (Math.random() - 0.5) * 0.16 * scatter,
          vy: (Math.random() - 0.5) * 0.16 * scatter,
          r: Math.random() * 0.85 + 0.3,
          phase: Math.random() * Math.PI * 2,
          speed: 0.35 + Math.random() * 0.65,
          alpha: 0.16 + Math.random() * 0.24,
        };
      });

      this.ripples = [];
      this.sparks = [];
      this.homeScale = 1;
      this.homeScaleUntil = 0;
      this.nextPulseAt = performance.now() / 1000 + 7 + Math.random() * 2;

      if (this.reduced) this.drawStatic();
    }

    refreshPalette() {
      const styles = getComputedStyle(root);
      this.line = (styles.getPropertyValue('--net-line') || this.line).trim();
      this.node = (styles.getPropertyValue('--net-node') || this.node).trim();
      const alpha = parseFloat(styles.getPropertyValue('--net-alpha'));
      this.alpha = Number.isFinite(alpha) ? alpha : 0.26;
      this.night = root.dataset.theme === 'night';
      if (this.reduced) this.drawStatic();
    }

    bind() {
      document.addEventListener('amethystium:theme', () => this.refreshPalette());

      if ('ResizeObserver' in window) {
        this.resizeObserver = new ResizeObserver(() => {
          cancelAnimationFrame(this.resizeFrame);
          this.resizeFrame = requestAnimationFrame(() => this.resize());
        });
        this.resizeObserver.observe(this.hero);
      } else {
        window.addEventListener('resize', () => this.resize());
      }

      if (this.reduced) return;

      this.hero.addEventListener(
        'pointermove',
        (event) => {
          const rect = this.canvas.getBoundingClientRect();
          this.pointer.x = event.clientX - rect.left;
          this.pointer.y = event.clientY - rect.top;
          this.pointer.active = true;
        },
        { passive: true }
      );

      this.hero.addEventListener('pointerleave', () => {
        this.pointer.active = false;
        this.pointer.x = -9999;
        this.pointer.y = -9999;
      });

      this.hero.addEventListener('pointerdown', (event) => {
        if (event.target.closest('a, button')) return;
        const rect = this.canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        this.ripples.push({ x, y, radius: 0, alpha: 0.65 });

        for (let i = 0; i < 26; i += 1) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 0.7 + Math.random() * 3.2;
          this.sparks.push({
            x,
            y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 1,
            decay: 0.014 + Math.random() * 0.018,
            r: 0.5 + Math.random() * 1.7,
          });
        }

        this.nodes.forEach((node) => {
          const dx = node.x - x;
          const dy = node.y - y;
          const distance = Math.hypot(dx, dy);
          if (distance < 320 && distance > 0.1) {
            const force = (1 - distance / 320) * 3.2;
            node.vx += (dx / distance) * force + (-dy / distance) * force * 0.22;
            node.vy += (dy / distance) * force + (dx / distance) * force * 0.22;
          }
        });

        this.dust.forEach((particle) => {
          const dx = particle.x - x;
          const dy = particle.y - y;
          const distance = Math.hypot(dx, dy);
          if (distance < 260 && distance > 0.1) {
            const force = (1 - distance / 260) * 0.7;
            particle.vx += (dx / distance) * force;
            particle.vy += (dy / distance) * force;
          }
        });
      });

      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          this.stop();
        } else if (this.visible) {
          this.start();
        }
      });

      if ('IntersectionObserver' in window) {
        const observer = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              this.visible = entry.isIntersecting;
              if (this.visible) this.start();
              else this.stop();
            });
          },
          { threshold: 0 }
        );
        observer.observe(this.hero);
      }
    }

    start() {
      if (this.reduced || this.frame) return;
      const loop = () => {
        this.step();
        this.frame = requestAnimationFrame(loop);
      };
      this.frame = requestAnimationFrame(loop);
    }

    stop() {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
    }

    pulseFromCenter(strength) {
      const centerX = this.homeCenterX;
      const centerY = this.homeCenterY;
      const now = performance.now() / 1000;

      this.homeScale = 1.55;
      this.homeScaleUntil = now + 1.8;

      this.nodes.forEach((node) => {
        const dx = node.x - centerX;
        const dy = node.y - centerY;
        const distance = Math.hypot(dx, dy) || 1;
        const force = strength * 0.5 * (0.6 + Math.random() * 0.7);
        node.vx += (dx / distance) * force;
        node.vy += (dy / distance) * force;
      });

      this.dust.forEach((particle) => {
        const dx = particle.x - centerX;
        const dy = particle.y - centerY;
        const distance = Math.hypot(dx, dy) || 1;
        const force = strength * 0.25 * (0.6 + Math.random() * 0.7);
        particle.vx += (dx / distance) * force;
        particle.vy += (dy / distance) * force;
      });
    }

    step() {
      const context = this.context;
      const nodes = this.nodes;
      const pointer = this.pointer;
      const time = performance.now() / 1000;

      context.clearRect(0, 0, this.width, this.height);
      context.globalCompositeOperation = this.night ? 'lighter' : 'source-over';

      if (time >= this.nextPulseAt) {
        this.nextPulseAt = time + 12 + Math.random() * 4;
        this.pulseFromCenter(1.4);
        this.ripples.push({
          x: this.homeCenterX,
          y: this.homeCenterY,
          radius: 0,
          alpha: 0.16,
        });
      }

      if (this.homeScale > 1 && time > this.homeScaleUntil) {
        this.homeScale = 1;
      }

      this.dust.forEach((particle) => {
        if (pointer.active) {
          const dx = particle.x - pointer.x;
          const dy = particle.y - pointer.y;
          const distance = Math.hypot(dx, dy) || 1;
          if (distance < 180) {
            const force = (1 - distance / 180) * 0.16;
            particle.vx += (dx / distance) * force;
            particle.vy += (dy / distance) * force;
          }
        }

        const targetX = this.homeCenterX + (particle.hx - this.homeCenterX) * this.homeScale;
        const targetY = this.homeCenterY + (particle.hy - this.homeCenterY) * this.homeScale;
        particle.vx += (targetX - particle.x) * 0.0035;
        particle.vy += (targetY - particle.y) * 0.0035;
        particle.vx *= 0.986;
        particle.vy *= 0.986;
        particle.x += particle.vx;
        particle.y += particle.vy;
        if (particle.x < -40) particle.x = -40;
        else if (particle.x > this.width + 40) particle.x = this.width + 40;
        if (particle.y < -40) particle.y = -40;
        else if (particle.y > this.height + 40) particle.y = this.height + 40;

        const twinkle = 0.55 + 0.45 * Math.sin(time * particle.speed + particle.phase);
        context.beginPath();
        context.arc(particle.x, particle.y, particle.r, 0, Math.PI * 2);
        context.fillStyle = `rgba(${this.node}, ${particle.alpha * twinkle * (this.night ? 1.25 : 1)})`;
        context.fill();
      });

      nodes.forEach((node) => {
        if (pointer.active) {
          const dx = node.x - pointer.x;
          const dy = node.y - pointer.y;
          const distance = Math.hypot(dx, dy) || 1;
          if (distance < 240) {
            const force = (1 - distance / 240) * 0.55;
            node.vx += (dx / distance) * force;
            node.vy += (dy / distance) * force;
            node.vx += (-dy / distance) * force * 0.35;
            node.vy += (dx / distance) * force * 0.35;
          }
        }

        const homeX = this.homeCenterX + (node.hx - this.homeCenterX) * this.homeScale;
        const homeY = this.homeCenterY + (node.hy - this.homeCenterY) * this.homeScale;
        node.vx += (homeX - node.x) * 0.0045;
        node.vy += (homeY - node.y) * 0.0045;
        node.vx += Math.cos(time * 0.6 + node.phase) * 0.004;
        node.vy += Math.sin(time * 0.5 + node.phase) * 0.004;

        node.vx *= 0.982;
        node.vy *= 0.982;

        const speed = Math.hypot(node.vx, node.vy);
        if (speed > 2.6) {
          node.vx = (node.vx / speed) * 2.6;
          node.vy = (node.vy / speed) * 2.6;
        }

        node.x += node.vx;
        node.y += node.vy;

        if (node.x < -80) node.x = -80;
        else if (node.x > this.width + 80) node.x = this.width + 80;
        if (node.y < -80) node.y = -80;
        else if (node.y > this.height + 80) node.y = this.height + 80;
      });

      const maxDistance = 150;
      const buckets = [[], [], [], []];

      for (let i = 0; i < nodes.length; i += 1) {
        for (let j = i + 1; j < nodes.length; j += 1) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const distanceSquared = dx * dx + dy * dy;
          if (distanceSquared < maxDistance * maxDistance) {
            const distance = Math.sqrt(distanceSquared);
            const bucket = Math.min(
              3,
              Math.max(0, Math.floor((1 - distance / maxDistance) * 4))
            );
            buckets[bucket].push(i, j);
          }
        }
      }

      context.lineWidth = 0.7;

      for (let bucket = 0; bucket < buckets.length; bucket += 1) {
        const pairs = buckets[bucket];
        if (!pairs.length) continue;

        context.beginPath();
        for (let k = 0; k < pairs.length; k += 2) {
          const a = nodes[pairs[k]];
          const b = nodes[pairs[k + 1]];
          context.moveTo(a.x, a.y);
          context.lineTo(b.x, b.y);
        }
        context.strokeStyle = `rgba(${this.line}, ${this.alpha * (0.18 + bucket * 0.16)})`;
        context.stroke();
      }

      if (pointer.active) {
        context.beginPath();
        let linked = 0;

        nodes.forEach((node) => {
          const dx = node.x - pointer.x;
          const dy = node.y - pointer.y;
          if (Math.hypot(dx, dy) < 240) {
            context.moveTo(pointer.x, pointer.y);
            context.lineTo(node.x, node.y);
            linked += 1;
          }
        });

        if (linked) {
          context.strokeStyle = `rgba(${this.node}, ${this.night ? 0.55 : 0.36})`;
          context.lineWidth = 1;
          context.stroke();
        }

        context.beginPath();
        nodes.forEach((node) => {
          const dx = node.x - pointer.x;
          const dy = node.y - pointer.y;
          if (Math.hypot(dx, dy) < 240) {
            context.moveTo(node.x + node.r * 3.8, node.y);
            context.arc(node.x, node.y, node.r * 3.8, 0, Math.PI * 2);
          }
        });
        context.fillStyle = `rgba(${this.node}, ${this.night ? 0.15 : 0.09})`;
        context.fill();
      }

      nodes.forEach((node) => {
        if (node.hub) return;
        const twinkle = 0.74 + 0.26 * Math.sin(time * node.twinkle + node.phase);
        context.beginPath();
        context.arc(node.x, node.y, node.r, 0, Math.PI * 2);
        context.fillStyle = `rgba(${this.node}, ${Math.min(0.82, this.alpha * 2.1) * twinkle})`;
        context.fill();
      });

      nodes.forEach((node) => {
        if (!node.hub) return;
        const twinkle = 0.74 + 0.26 * Math.sin(time * node.twinkle + node.phase);
        context.beginPath();
        context.arc(node.x, node.y, node.r * 1.35, 0, Math.PI * 2);
        context.fillStyle = `rgba(${this.node}, ${Math.min(0.95, this.alpha * 2.8) * twinkle})`;
        context.fill();
      });

      if (this.ripples.length) {
        this.ripples.forEach((ripple) => {
          ripple.radius += 4.2;
          ripple.alpha *= 0.965;
          context.beginPath();
          context.arc(ripple.x, ripple.y, ripple.radius, 0, Math.PI * 2);
          context.strokeStyle = `rgba(${this.node}, ${Math.max(0, ripple.alpha)})`;
          context.lineWidth = 1;
          context.stroke();
        });
        this.ripples = this.ripples.filter((ripple) => ripple.alpha > 0.02);
      }

      if (this.sparks.length) {
        this.sparks.forEach((spark) => {
          spark.x += spark.vx;
          spark.y += spark.vy;
          spark.vx *= 0.98;
          spark.vy *= 0.98;
          spark.life -= spark.decay;

          if (spark.life <= 0) return;

          context.beginPath();
          context.arc(spark.x, spark.y, spark.r, 0, Math.PI * 2);
          context.fillStyle = `rgba(${this.node}, ${Math.max(0, spark.life) * 0.8})`;
          context.fill();
        });
        this.sparks = this.sparks.filter((spark) => spark.life > 0);
      }

      context.globalCompositeOperation = 'source-over';
    }

    drawStatic() {
      const context = this.context;
      context.clearRect(0, 0, this.width, this.height);
      context.globalCompositeOperation = this.night ? 'lighter' : 'source-over';

      this.dust.forEach((particle) => {
        context.beginPath();
        context.arc(particle.x, particle.y, particle.r, 0, Math.PI * 2);
        context.fillStyle = `rgba(${this.node}, ${particle.alpha * (this.night ? 1.2 : 1)})`;
        context.fill();
      });

      const maxDistance = 160;
      context.beginPath();

      for (let i = 0; i < this.nodes.length; i += 1) {
        for (let j = i + 1; j < this.nodes.length; j += 1) {
          const dx = this.nodes[i].x - this.nodes[j].x;
          const dy = this.nodes[i].y - this.nodes[j].y;
          if (dx * dx + dy * dy < maxDistance * maxDistance) {
            context.moveTo(this.nodes[i].x, this.nodes[i].y);
            context.lineTo(this.nodes[j].x, this.nodes[j].y);
          }
        }
      }

      context.strokeStyle = `rgba(${this.line}, ${this.alpha * 0.5})`;
      context.lineWidth = 0.7;
      context.stroke();

      context.beginPath();
      this.nodes.forEach((node) => {
        const radius = node.r * (node.hub ? 1.35 : 1);
        context.moveTo(node.x + radius, node.y);
        context.arc(node.x, node.y, radius, 0, Math.PI * 2);
      });
      context.fillStyle = `rgba(${this.node}, ${Math.min(0.82, this.alpha * 2.1)})`;
      context.fill();
      context.globalCompositeOperation = 'source-over';
    }
  }

  const canvas = $('.hero__canvas');
  if (canvas) {
    window.__amethystiumNetwork = new LivingNetwork(canvas);
  }
})();
