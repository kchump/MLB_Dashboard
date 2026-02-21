
const page_cache = new Map();

function team_storage_key(team) {
  return 'mlb_dash_team_open__' + team;
}

function division_storage_key(div_id) {
  return 'mlb_dash_div_open__' + div_id;
}

function read_collapsed(key, default_collapsed) {
  try {
    const v = localStorage.getItem(key);
    if (v === '1') return true;
    if (v === '0') return false;
  } catch (e) {}
  return default_collapsed;
}

function write_collapsed(key, collapsed) {
  try {
    localStorage.setItem(key, collapsed ? '1' : '0');
  } catch (e) {}
}

async function load_page(file, page_id) {
  const content = document.getElementById('content_root');
  if (!content) return;
  content.innerHTML = '<div style="padding:12px;color:rgba(96,103,112,0.95);">Loading…</div>';

  let html = page_cache.get(file);
  if (!html) {
    const r = await fetch(file); // let the browser cache normally
    html = await r.text();
    page_cache.set(file, html);
  }

  content.innerHTML = html;

  // Plotly fragments include inline <script> tags; scripts inserted via innerHTML do not run.
  // Re-create those script tags so the browser executes them.
  const scripts = Array.from(content.querySelectorAll('script'));
  scripts.forEach(old => {
    const s = document.createElement('script');
    if (old.type) s.type = old.type;
    if (old.src) {
      s.src = old.src;
    } else {
      s.text = old.textContent || '';
    }
    content.appendChild(s);
    old.remove();
  });

  // Keep the “active” highlight in the sidebar
  const links = document.querySelectorAll('.toc_link');
  links.forEach(a => a.classList.toggle('active', a.dataset.page === page_id));

  try { localStorage.setItem('mlb_dash_active_page', page_id); } catch (e) {}
  // Warm a couple pages ahead (best-effort)
  const active = document.querySelector(`.toc_link[data-page="${page_id}"]`);
  if (active) {
    const lis = Array.from(active.closest('.player_list')?.querySelectorAll('.toc_link') || []);
    const i = lis.indexOf(active);
    [i + 1, i + 2].forEach(j => {
      const a = lis[j];
      if (!a) return;
      const f = a.dataset.file;
      if (!f || page_cache.has(f)) return;
      fetch(f).then(r => r.text()).then(t => page_cache.set(f, t)).catch(() => {});
    });
  }
}

function set_team_role_tab(team, role) {
  document.querySelectorAll('.role_tab').forEach(btn => {
    if (btn.dataset.team === team) {
      btn.classList.toggle('active', btn.dataset.role === role);
    }
  });

  document.querySelectorAll('.role_list').forEach(list => {
    if (list.dataset.team === team) {
      list.style.display = (list.dataset.role === role) ? '' : 'none';
    }
  });

  const search = document.getElementById('player_search');
  apply_search_and_filters((search && search.value) ? search.value : '');
}

function activate_page(page_id) {
let a = null;
document.querySelectorAll('.toc_link').forEach(x => {
  if (x.dataset.page === page_id) a = x;
});
if (!a) return;

  const file = a.dataset.file;
  if (!file) return;

  load_page(file, page_id);

  // update hash without hard jump
  history.replaceState(null, '', '#' + encodeURIComponent(page_id));
}

function default_page_id() {
  const h = window.location.hash || '';
  const raw = h.startsWith('#') ? h.slice(1) : h;
  if (raw) return decodeURIComponent(raw);

  try {
    const saved = localStorage.getItem('mlb_dash_active_page');
    if (saved) return saved;
  } catch (e) {}

  return 'home';
}

function on_hash_change() {
  const pid = default_page_id();
  activate_page(pid);
}

function set_search_mode(is_searching) {
  // divisions: remember + force open during search, restore after
  document.querySelectorAll('.division_block').forEach(db => {
    const div_id = db.dataset.division || '';
    const btn = Array.from(document.querySelectorAll('.division_title')).find(b => (b.dataset.division || '') === div_id);

    if (is_searching) {
      if (db.dataset.prev_collapsed === undefined) {
        db.dataset.prev_collapsed = db.classList.contains('collapsed') ? '1' : '0';
      }
      db.classList.remove('collapsed');
      if (btn) btn.setAttribute('aria-expanded', 'true');
    } else {
      let collapsed = false;

      if (db.dataset.prev_collapsed !== undefined) {
        collapsed = (db.dataset.prev_collapsed === '1');
        delete db.dataset.prev_collapsed;
      } else {
collapsed = read_collapsed(division_storage_key(div_id), false);

      }

      db.classList.toggle('collapsed', collapsed);
      if (btn) btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    }
  });

  // teams: remember + force open during search, restore after
  document.querySelectorAll('.team_block').forEach(tb => {
    const team = tb.dataset.team || '';
    const btn = Array.from(document.querySelectorAll('.team_title')).find(b => (b.dataset.team || '') === team);

    if (is_searching) {
      if (tb.dataset.prev_collapsed === undefined) {
        tb.dataset.prev_collapsed = tb.classList.contains('collapsed') ? '1' : '0';
      }

      tb.classList.remove('collapsed');
      if (btn) btn.setAttribute('aria-expanded', 'true');
    } else {
      let collapsed = true;

      if (tb.dataset.prev_collapsed !== undefined) {
        collapsed = (tb.dataset.prev_collapsed === '1');
        delete tb.dataset.prev_collapsed;
      } else {
collapsed = read_collapsed(team_storage_key(team), true);
      }

      tb.classList.toggle('collapsed', collapsed);
      if (btn) btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    }
  });

  // hide tabs during search (since all role_lists are shown)
  document.querySelectorAll('.role_tabs').forEach(tabs => {
    tabs.style.display = is_searching ? 'none' : '';
  });

  // role lists: show all during search; otherwise show only active tab for each team
  document.querySelectorAll('.role_list').forEach(list => {
    if (is_searching) {
      list.style.display = '';
      return;
    }

    const team = list.dataset.team;
    const active_tab = Array.from(document.querySelectorAll('.role_tab.active')).find(t => (t.dataset.team || '') === team);
    const active_role = active_tab ? active_tab.dataset.role : 'batters';
    list.style.display = (list.dataset.role === active_role) ? '' : 'none';
  });
}

function is_visible(el) {
  if (!el) return false;
  return (el.style.display !== 'none');
}

function cleanup_role_list(role_list) {
  if (!role_list) return;

  // Determine whether this list is hidden only because it's not the active tab.
  const in_search = (document.body.dataset.is_searching === '1');
  const team = role_list.dataset.team || '';
let active_tab = null;
document.querySelectorAll('.role_tab.active').forEach(t => {
  if (t.dataset.team === team) active_tab = t;
});
  const active_role = active_tab ? (active_tab.dataset.role || 'batters') : 'batters';

  const hidden_by_tab = (!in_search && (role_list.dataset.role !== active_role));
  if (hidden_by_tab) return;

  // Always reset subheaders before deciding what to show/hide
  role_list.querySelectorAll('.sub_role_label').forEach(el => el.style.display = '');

  const lis = Array.from(role_list.querySelectorAll('.player_li'));
  const has_any_player_visible = lis.some(li => is_visible(li));

  // Show/hide the entire role_list based on visible players
  role_list.style.display = has_any_player_visible ? '' : 'none';
  if (!has_any_player_visible) return;

  const ul = role_list.querySelector('.player_list');
  if (!ul) return;

  // Hide sub_role_label blocks that have no visible player_li until the next sub_role_label
  const kids = Array.from(ul.children);
  for (let i = 0; i < kids.length; i++) {
    const kid = kids[i];
    if (!kid.classList || !kid.classList.contains('sub_role_label')) continue;

    let any_visible_in_section = false;

    for (let j = i + 1; j < kids.length; j++) {
      const nxt = kids[j];

      if (nxt.classList && nxt.classList.contains('sub_role_label')) break;

      if (nxt.classList && nxt.classList.contains('player_li') && is_visible(nxt)) {
        any_visible_in_section = true;
        break;
      }

      const li = (nxt.querySelector ? nxt.querySelector('.player_li') : null);
      if (li && is_visible(li)) {
        any_visible_in_section = true;
        break;
      }
    }

    kid.style.display = any_visible_in_section ? '' : 'none';
  }
}

function current_filters() {
  const hide_minors = !!(document.getElementById('filter_hide_minors') && document.getElementById('filter_hide_minors').checked);
  const hide_hurt = !!(document.getElementById('filter_hide_hurt') && document.getElementById('filter_hide_hurt').checked);
  return { hide_minors, hide_hurt };
}

function apply_search_and_filters(q) {
  const query = (q || '').trim().toLowerCase();
  const searching = query.length > 0;

  const was_searching = (document.body.dataset.is_searching === '1');
  document.body.dataset.is_searching = searching ? '1' : '0';

  if (!searching) {
    set_search_mode(false);
  } else if (searching !== was_searching) {
    set_search_mode(true);
  }

  const f = current_filters();

  const team_blocks = document.querySelectorAll('.team_block');
  team_blocks.forEach(tb => {
    let any_visible_in_team = false;

    tb.querySelectorAll('.toc_link').forEach(a => {
      const name = a.dataset.name || '';
      const is_minors = (a.dataset.is_minors === '1');
      const is_hurt = (a.dataset.is_hurt === '1');
    const is_susp = (a.dataset.is_susp === '1');

      let show = true;

      if (searching && !name.includes(query)) show = false;
      if (f.hide_minors && is_minors) show = false;
      if (f.hide_hurt && (is_hurt || is_susp)) show = false;

      const li = a.closest('.player_li');
      if (li) li.style.display = show ? '' : 'none';
      if (show) any_visible_in_team = true;
    });

    tb.querySelectorAll('.role_list').forEach(role_list => {
      cleanup_role_list(role_list);
    });

    tb.style.display = any_visible_in_team ? '' : 'none';
  });

  document.querySelectorAll('.division_block').forEach(db => {
    const any_visible_team = Array.from(db.querySelectorAll('.team_block')).some(tb => tb.style.display !== 'none');
    db.style.display = any_visible_team ? '' : 'none';
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const toggle_sidebar_btn = document.getElementById('toggle_sidebar');
  const is_touch_mobile = window.matchMedia('(max-width: 900px) and (pointer: coarse)').matches;
  if (toggle_sidebar_btn && !is_touch_mobile) toggle_sidebar_btn.style.display = 'none';
  const sidebar = document.querySelector('.sidebar');

  function set_sidebar_hidden(hidden) {
    if (!sidebar) return;
    sidebar.classList.toggle('hidden', hidden);

    if (toggle_sidebar_btn) {
      toggle_sidebar_btn.textContent = hidden ? '☰ Teams' : 'Hide Teams';
    }
  }

  if (toggle_sidebar_btn) {
    toggle_sidebar_btn.addEventListener('click', () => {
      const hidden = sidebar && sidebar.classList.contains('hidden');
      set_sidebar_hidden(!hidden);
    });
  }

  function set_division_collapsed(div_id, collapsed) {
    const blocks = Array.from(document.querySelectorAll('.division_block'));
    const btns = Array.from(document.querySelectorAll('.division_title'));

    const block = blocks.find(b => (b.dataset.division || '') === div_id);
    const btn = btns.find(b => (b.dataset.division || '') === div_id);
    if (!block || !btn) return;

    write_collapsed(division_storage_key(div_id), collapsed);
    block.classList.toggle('collapsed', collapsed);
    btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  }

  function init_division_collapsed_defaults() {
    document.querySelectorAll('.division_block').forEach(db => {
      const div_id = db.dataset.division || '';
      const collapsed = read_collapsed(division_storage_key(div_id), false);
      set_division_collapsed(div_id, collapsed);
    });
  }


function set_team_collapsed(team, collapsed) {
  let block = null;
  let btn = null;

  document.querySelectorAll('.team_block').forEach(b => {
    if (b.dataset.team === team) block = b;
  });

  document.querySelectorAll('.team_title').forEach(b => {
    if (b.dataset.team === team) btn = b;
  });

  if (!block || !btn) return;

    write_collapsed(team_storage_key(team), collapsed);
  block.classList.toggle('collapsed', collapsed);
  btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');

  if (!collapsed && document.body.dataset.is_searching !== '1') {
    set_team_role_tab(team, 'batters');
  }
}

  function init_team_collapsed_defaults() {
    document.querySelectorAll('.team_block').forEach(tb => {
      const team = tb.dataset.team || '';
      const collapsed = read_collapsed(team_storage_key(team), true);
      set_team_collapsed(team, collapsed);
    });
  }

  document.querySelectorAll('.team_title').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();

      const block = btn.closest('.team_block');
      if (!block) return;

      const team = block.dataset.team || '';
      const collapsed = block.classList.contains('collapsed');

      set_team_collapsed(team, !collapsed);
    });
  });
  init_team_collapsed_defaults();

  document.querySelectorAll('.division_title').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();

      const block = btn.closest('.division_block');
      if (!block) return;

      const div_id = block.dataset.division || '';
      const collapsed = block.classList.contains('collapsed');
      set_division_collapsed(div_id, !collapsed);
    });
  });

  init_division_collapsed_defaults();

  document.querySelectorAll('.role_tab').forEach(btn => {
    btn.addEventListener('click', () => {
      set_team_role_tab(btn.dataset.team, btn.dataset.role);
    });
  });

  // Link clicks now load pages via fetch
  document.querySelectorAll('.toc_link').forEach(a => {
    const page_id = a.dataset.page;
    const file = a.dataset.file;
    if (!page_id || !file) return;

    a.addEventListener('click', (e) => {
      e.preventDefault();
      activate_page(page_id);
    });
  });

  const search = document.getElementById('player_search');
  const clear_btn = document.getElementById('search_clear');

  function sync_clear_btn() {
    if (!clear_btn || !search) return;
    const has_text = (search.value && search.value.trim().length);
    clear_btn.style.display = has_text ? 'inline-flex' : 'none';
  }

  if (search) {
    search.addEventListener('input', () => {
      apply_search_and_filters(search.value);
      sync_clear_btn();
    });
    search.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        search.value = '';
        apply_search_and_filters('');
        sync_clear_btn();
      }
    });
  }

  if (clear_btn && search) {
    clear_btn.addEventListener('click', () => {
      search.value = '';
      apply_search_and_filters('');
      sync_clear_btn();
      search.focus();
    });
  }

  sync_clear_btn();

  const cb_minors = document.getElementById('filter_hide_minors');
  if (cb_minors) cb_minors.addEventListener('change', () => apply_search_and_filters((search && search.value) ? search.value : ''));

  const cb_hurt = document.getElementById('filter_hide_hurt');
  if (cb_hurt) cb_hurt.addEventListener('change', () => apply_search_and_filters((search && search.value) ? search.value : ''));

  window.addEventListener('hashchange', on_hash_change);

  on_hash_change();
function apply_mobile_scale() {
  const is_touch_mobile = window.matchMedia('(max-width: 900px) and (pointer: coarse)').matches;
  const content = document.getElementById('content_root');
  if (!content) return;

  const page = content.querySelector('.player_page');
  if (!page) return;

  // Do NOT scale static pages (Home / Key)
  const has_static = page.querySelector('.static_page');

  if (!is_touch_mobile || has_static) {
    content.style.transform = '';
    content.style.transformOrigin = '';
    content.style.width = '';
    return;
  }

  const pad = 20;
  const target_w = Math.max(320, window.innerWidth - pad);
  const scale = Math.min(1, target_w / 1350);

  content.style.transform = `scale(${scale})`;
  content.style.transformOrigin = 'top left';
  content.style.width = `${Math.ceil(1350 * scale)}px`;
}

  window.addEventListener('resize', apply_mobile_scale);
  apply_mobile_scale();
  apply_search_and_filters((search && search.value) ? search.value : '');
  sync_clear_btn();
});
