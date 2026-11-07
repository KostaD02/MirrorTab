// Shared by every example page: the activity log, hover state and the iframe origin switch.
// Plain script, no build step; the pages are served as static files.

initActivityLog();
initHoverState();
initFrameOverride();

function initActivityLog() {
  const table = document.querySelector('#activity');
  const resetRef = document.querySelector('#activity-reset');

  if (!table) {
    return;
  }

  const rows = new Map();
  let pendingMove = null;
  let moveScheduled = false;

  for (const row of table.querySelectorAll('tbody tr')) {
    rows.set(row.dataset.event, {
      count: 0,
      countRef: row.querySelector('[data-count]'),
      targetRef: row.querySelector('[data-target]'),
    });
  }

  const capture = { capture: true, passive: true };

  document.addEventListener('click', (e) => record('click', e.target), capture);
  document.addEventListener('input', (e) => record('input', e.target), capture);
  document.addEventListener(
    'change',
    (e) => record('change', e.target),
    capture,
  );
  document.addEventListener(
    'keydown',
    (e) => record('keydown', e.target),
    capture,
  );
  document.addEventListener(
    'focusin',
    (e) => record('focus', e.target),
    capture,
  );
  document.addEventListener(
    'focusout',
    (e) => record('blur', e.target),
    capture,
  );
  document.addEventListener(
    'scroll',
    (e) => record('scroll', e.target),
    capture,
  );

  // ? mousemove arrives many times a frame, so the table is updated once per frame
  document.addEventListener(
    'mousemove',
    (e) => {
      pendingMove = e.target;
      if (!moveScheduled) {
        moveScheduled = true;
        requestAnimationFrame(() => {
          moveScheduled = false;
          record('mousemove', pendingMove);
        });
      }
    },
    capture,
  );

  if (resetRef) {
    resetRef.addEventListener('click', () => {
      for (const entry of rows.values()) {
        entry.count = 0;
        entry.countRef.textContent = '0';
        entry.targetRef.textContent = '';
      }
    });
  }

  function record(type, target) {
    const entry = rows.get(type);

    if (!entry || target === resetRef) {
      return;
    }

    entry.count += 1;
    entry.countRef.textContent = String(entry.count);
    entry.targetRef.textContent = describe(target);
  }

  function describe(target) {
    if (target === document || target === window) {
      return 'window';
    }

    if (!(target instanceof Element)) {
      return '';
    }

    const tag = target.tagName.toLowerCase();

    if (target.id) {
      return `${tag}#${target.id}`;
    }

    const text = target.textContent.trim().slice(0, 24);

    return text ? `${tag} "${text}"` : tag;
  }
}

// ? CSS :hover never fires on the target tab, so hover is mirrored into a class on data-hover elements
function initHoverState() {
  document.addEventListener('mouseover', (e) => {
    const el = e.target.closest('[data-hover]');

    if (el) {
      el.classList.add('is-hovered');
    }
  });

  document.addEventListener('mouseout', (e) => {
    const el = e.target.closest('[data-hover]');

    if (el && !el.contains(e.relatedTarget)) {
      el.classList.remove('is-hovered');
    }
  });
}

// ? ?frame=<same page on 127.0.0.1> swaps the iframe to another origin, since localhost and 127.0.0.1 differ
function initFrameOverride() {
  const frame = document.querySelector('iframe[data-override]');
  const hint = document.querySelector('#frame-origin');
  const override = new URLSearchParams(location.search).get('frame');

  if (!frame) {
    return;
  }

  if (override) {
    frame.src = override;
  }

  if (hint) {
    const src = new URL(frame.getAttribute('src'), location.href);
    const sameOrigin = src.origin === location.origin;

    hint.textContent = sameOrigin
      ? 'same-origin'
      : `cross-origin (${src.origin})`;
    hint.classList.add(
      sameOrigin ? 'kd-status-pill--idle' : 'kd-status-pill--warning',
    );
  }
}
