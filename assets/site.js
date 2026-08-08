/* Inner pages: theme toggle, mobile menu, reveal on scroll, footer year. */
(function () {
  'use strict';

  var THEME_KEY = 'gg-theme';

  // ---------------------------------------------------------------------------------------------------------------
  //  t h e m e
  // ---------------------------------------------------------------------------------------------------------------

  function _applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'light' ? '#f6f8fc' : '#0d1220');
    try { localStorage.setItem(THEME_KEY, theme); } catch (ignored) { /* storage may be unavailable */ }
  }

  function _initTheme() {
    var btn = document.getElementById('themeToggle');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var current = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
      _applyTheme(current === 'light' ? 'dark' : 'light');
    });
  }

  // ---------------------------------------------------------------------------------------------------------------
  //  m e n u
  // ---------------------------------------------------------------------------------------------------------------

  function _initMenu() {
    var toggle = document.getElementById('menuToggle');
    var links = document.getElementById('navLinks');
    if (!toggle || !links) return;
    toggle.addEventListener('click', function () {
      var open = links.classList.toggle('open');
      toggle.classList.toggle('open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    links.addEventListener('click', function (event) {
      if (event.target.closest('a')) {
        links.classList.remove('open');
        toggle.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // ---------------------------------------------------------------------------------------------------------------
  //  r e v e a l
  // ---------------------------------------------------------------------------------------------------------------

  function _initReveal() {
    var items = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window)) {
      items.forEach(function (el) { el.classList.add('visible'); });
      return;
    }
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    items.forEach(function (el) { observer.observe(el); });
  }

  // ---------------------------------------------------------------------------------------------------------------
  //  o r b i t
  // ---------------------------------------------------------------------------------------------------------------

  // Returns the centre of an element relative to the orbit, in layout coordinates: the visual is
  // scaled down on small screens and getBoundingClientRect values would be scaled twice.
  function _centreOf(el) {
    return { x: el.offsetLeft + el.offsetWidth / 2, y: el.offsetTop + el.offsetHeight / 2 };
  }

  // Creates a travelling light pulse between two points of the orbit.
  function _emitSpark(visual, from, to, delay) {
    var spark = document.createElement('span');
    spark.className = 'orbit-spark';
    spark.style.left = from.x + 'px';
    spark.style.top = from.y + 'px';
    spark.style.setProperty('--dx', (to.x - from.x) + 'px');
    spark.style.setProperty('--dy', (to.y - from.y) + 'px');
    if (delay) spark.style.animationDelay = delay + 'ms';
    spark.addEventListener('animationend', function () { spark.remove(); });
    visual.appendChild(spark);
  }

  // Creates the shockwave ring that expands from the core.
  function _emitWave(visual) {
    var wave = document.createElement('span');
    wave.className = 'core-wave';
    wave.addEventListener('animationend', function () { wave.remove(); });
    visual.appendChild(wave);
  }

  // Re-applies a class so its animation restarts even on rapid repeated clicks.
  function _restartAnimation(el, className, duration) {
    el.classList.remove(className);
    void el.offsetWidth; // force reflow
    el.classList.add(className);
    window.setTimeout(function () { el.classList.remove(className); }, duration);
  }

  // A chip lights up, sends a spark to the core, and the core answers.
  function _activateChip(chip, visual, core) {
    _restartAnimation(chip, 'activated', 700);
    _emitSpark(visual, _centreOf(chip), { x: visual.clientWidth / 2, y: visual.clientHeight / 2 }, 0);
    if (core) window.setTimeout(function () { _restartAnimation(core, 'energized', 700); }, 420);
  }

  // The core flares, pushes out a shockwave and feeds the three chips in turn.
  function _activateCore(core, visual) {
    _restartAnimation(core, 'emitting', 900);
    _emitWave(visual);
    var centre = { x: visual.clientWidth / 2, y: visual.clientHeight / 2 };
    visual.querySelectorAll('.orbit-chip').forEach(function (chip, index) {
      var delay = index * 110;
      _emitSpark(visual, centre, _centreOf(chip), delay);
      window.setTimeout(function () { _restartAnimation(chip, 'activated', 700); }, delay + 380);
    });
  }

  // True when the browser should handle the click itself: new tab, new window, download, save.
  function _isModifiedClick(event) {
    return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
  }

  // Plays the animation, then follows the link. The link still works with JS off or motion reduced.
  function _animateThenFollow(element, event, play) {
    if (_isModifiedClick(event)) return;
    event.preventDefault();
    play();
    var href = element.getAttribute('href');
    window.setTimeout(function () { window.location.href = href; }, 520);
  }

  function _initOrbit() {
    var visual = document.querySelector('.hero-visual');
    if (!visual) return;
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    var core = visual.querySelector('.orbit-core');
    visual.querySelectorAll('.orbit-chip').forEach(function (chip) {
      chip.addEventListener('click', function (event) {
        _animateThenFollow(chip, event, function () { _activateChip(chip, visual, core); });
      });
    });
    if (core) {
      core.addEventListener('click', function (event) {
        _animateThenFollow(core, event, function () { _activateCore(core, visual); });
      });
    }
  }

  // ---------------------------------------------------------------------------------------------------------------
  //  i n i t
  // ---------------------------------------------------------------------------------------------------------------

  function _init() {
    _initTheme();
    _initMenu();
    _initReveal();
    _initOrbit();
    var year = document.getElementById('year');
    if (year) year.textContent = String(new Date().getFullYear());
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _init);
  else _init();
})();
