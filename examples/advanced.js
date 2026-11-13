// Page logic for the hard cases: everything a real app would wire up itself.

initDropdown();
initTabs();
initDialog();
initDrawer();
initTooltips();
initRepoList();
initEnvironments();
initShadowCounter();
initGestures();

function initDropdown() {
  const button = document.querySelector('#assignee-btn');
  const menu = document.querySelector('#assignee-menu');
  const value = document.querySelector('#assignee-value');

  // ? mousedown, not click: a bare synthetic click would never open it
  button.addEventListener('mousedown', (e) => {
    e.preventDefault();
    toggle(menu.hidden);
  });

  menu.addEventListener('click', (e) => {
    const option = e.target.closest('[role=option]');

    if (option) {
      value.textContent = option.textContent;
      toggle(false);
    }
  });

  document.addEventListener('mousedown', (e) => {
    if (
      !menu.hidden &&
      !button.contains(e.target) &&
      !menu.contains(e.target)
    ) {
      toggle(false);
    }
  });

  function toggle(open) {
    menu.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
  }
}

function initTabs() {
  const tabs = Array.from(document.querySelectorAll('[role=tab]'));

  for (const tab of tabs) {
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', (e) => {
      const index = tabs.indexOf(tab);

      if (e.key === 'ArrowRight') {
        select(tabs[(index + 1) % tabs.length], true);
      } else if (e.key === 'ArrowLeft') {
        select(tabs[(index - 1 + tabs.length) % tabs.length], true);
      }
    });
  }

  function select(tab, focus = false) {
    for (const item of tabs) {
      const isCurrent = item === tab;

      item.classList.toggle('kd-active', isCurrent);
      item.setAttribute('aria-selected', String(isCurrent));
      item.tabIndex = isCurrent ? 0 : -1;
      document.getElementById(item.getAttribute('aria-controls')).hidden =
        !isCurrent;
    }

    if (focus) {
      tab.focus();
    }
  }
}

function initDialog() {
  const dialog = document.querySelector('#invite-dialog');
  const form = document.querySelector('#invite-form');
  const email = document.querySelector('#invite-email');
  const state = document.querySelector('#invite-state');

  document.querySelector('#invite-btn').addEventListener('click', () => {
    dialog.showModal();
    email.focus();
  });

  document
    .querySelector('#invite-cancel')
    .addEventListener('click', () => dialog.close());

  form.addEventListener('submit', () => {
    state.textContent = email.value
      ? `Invite sent to ${email.value}`
      : 'Invite sent';
    state.hidden = false;
    email.value = '';
  });
}

function initDrawer() {
  const drawer = document.querySelector('#drawer');

  document.querySelector('#drawer-btn').addEventListener('click', () => {
    drawer.hidden = false;
  });

  document.querySelector('#drawer-close').addEventListener('click', () => {
    drawer.hidden = true;
  });

  drawer.addEventListener('click', (e) => {
    if (e.target === drawer) {
      drawer.hidden = true;
    }
  });
}

// ? tooltips come and go on mouseenter / mouseleave, which the target raises from the mirrored pointer
function initTooltips() {
  for (const el of document.querySelectorAll('[data-tip]')) {
    let tip = null;

    el.addEventListener('mouseenter', () => {
      tip = document.createElement('span');
      tip.className = 'tooltip';
      tip.setAttribute('role', 'tooltip');
      tip.textContent = el.dataset.tip;
      el.parentElement.appendChild(tip);
    });

    el.addEventListener('mouseleave', () => {
      tip?.remove();
      tip = null;
    });
  }
}

function initRepoList() {
  const search = document.querySelector('#repo-search');
  const rows = Array.from(document.querySelectorAll('#repo-list li'));
  let timer = null;

  search.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(filter, 150);
  });

  document.addEventListener('keydown', (e) => {
    const typing =
      /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) ||
      e.target.isContentEditable;

    if (e.key === '/' && !typing) {
      e.preventDefault();
      search.focus();
    } else if (e.key === 'Escape' && e.target === search) {
      search.value = '';
      filter();
      search.blur();
    }
  });

  for (const row of rows) {
    const button = row.querySelector('button');

    button.addEventListener('click', () => {
      const archived = button.textContent === 'Archive';

      button.textContent = archived ? 'Restore' : 'Archive';
      row.firstElementChild.classList.toggle('kd-text-muted', archived);
      row.firstElementChild.classList.toggle('kd-text-line-through', archived);
    });
  }

  function filter() {
    const term = search.value.trim().toLowerCase();

    for (const row of rows) {
      row.hidden =
        term !== '' &&
        !row.firstElementChild.textContent.toLowerCase().includes(term);
    }
  }
}

function initEnvironments() {
  const table = document.querySelector('#env-table');
  const body = table.tBodies[0];
  const regions = ['eu-west-1', 'eu-central-1', 'us-east-1', 'ap-south-1'];
  let added = 0;
  let sortedBy = -1;
  let ascending = true;

  document.querySelector('#add-env-btn').addEventListener('click', () => {
    added += 1;

    const row = document.createElement('tr');
    const region = regions[added % regions.length];

    row.innerHTML =
      `<td>review-${added}</td><td>${region}</td><td class="kd-font-mono">1</td>` +
      '<td class="kd-text-end"><button class="kd-btn kd-btn--ghost kd-btn--sm" type="button" data-remove>Remove</button></td>';
    body.appendChild(row);
  });

  body.addEventListener('click', (e) => {
    const button = e.target.closest('[data-remove]');

    if (button) {
      button.closest('tr').remove();
    }
  });

  for (const header of table.querySelectorAll('[data-sort]')) {
    header.addEventListener('click', () => {
      const column = Number(header.dataset.sort);

      ascending = sortedBy === column ? !ascending : true;
      sortedBy = column;

      const rows = Array.from(body.rows).sort((a, b) => {
        const left = a.cells[column].textContent;
        const right = b.cells[column].textContent;
        const result = left.localeCompare(right, undefined, { numeric: true });

        return ascending ? result : -result;
      });

      body.append(...rows);
    });
  }
}

function initGestures() {
  const drop = document.querySelector('#label-drop');
  const badge = document.querySelector('#gesture-badge');
  const gestureReadout = document.querySelector('#gesture-readout');
  const dial = document.querySelector('#wheel-dial');
  const wheelValue = document.querySelector('#wheel-value');
  const pasteNote = document.querySelector('#paste-note');
  const pasteReadout = document.querySelector('#paste-readout');
  const selectionReadout = document.querySelector('#selection-readout');
  const applied = [];
  let turns = 0;

  for (const label of document.querySelectorAll('[data-label]')) {
    label.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', label.dataset.label);
      e.dataTransfer.effectAllowed = 'copy';
      label.classList.add('is-dragging');
    });

    label.addEventListener('dragend', () => {
      label.classList.remove('is-dragging');
    });
  }

  drop.addEventListener('dragenter', () => {
    drop.classList.add('is-over');
  });

  drop.addEventListener('dragleave', () => {
    drop.classList.remove('is-over');
  });

  // ? without preventDefault here the browser never raises the drop
  drop.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });

  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('is-over');

    const label = e.dataTransfer.getData('text/plain');

    if (!label || applied.includes(label)) {
      return;
    }

    applied.push(label);
    drop.textContent = 'Applied: ' + applied.join(', ');
  });

  // ? the pasted text lands through the input event; this shows the paste itself arrived
  pasteNote.addEventListener('paste', (e) => {
    const text = e.clipboardData.getData('text/plain');

    pasteReadout.textContent = text
      ? 'pasted ' + text.length + ' characters'
      : 'pasted nothing';
  });

  badge.addEventListener('dblclick', () => {
    gestureReadout.textContent = 'double click';
  });

  // ? the page menu replaces the browser one, which no extension can open
  badge.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    gestureReadout.textContent = 'right click';
  });

  dial.addEventListener('wheel', (e) => {
    e.preventDefault();
    turns += Math.sign(e.deltaY);
    wheelValue.textContent = String(turns);
  });

  document.addEventListener('selectionchange', () => {
    const text = document.getSelection().toString().trim();

    selectionReadout.textContent = text ? 'selected: ' + text : '';
  });
}

function initShadowCounter() {
  const host = document.querySelector('#shadow-host');
  const root = host.attachShadow({ mode: 'open' });
  let count = 0;

  root.innerHTML =
    '<style>button{padding:.5rem .9rem;border:1px solid currentColor;border-radius:4px;background:transparent;color:inherit;font:inherit;cursor:pointer}</style>' +
    '<div style="display:flex;align-items:center;gap:.75rem;font-size:.8rem">' +
    '<button type=button>Count</button><span>0</span></div>';

  root.querySelector('button').addEventListener('click', () => {
    count += 1;
    root.querySelector('span').textContent = String(count);
  });
}
