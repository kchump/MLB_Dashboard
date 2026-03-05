/* =============================================================================
   MLB Dashboard JS (assets/app.js)
   - Sections (by functional proximity):
     A) Global state + small utils
     B) Year lookup + in-content year selector
     C) Sidebar collapse persistence (keys + read/write)
     D) Content/page loading + activation (TOC + hash)
     E) Sidebar team role tabs
     F) Search + filters (including search-mode open/restore)
     G) Mobile scaling for Plotly-heavy pages
     H) Matchups page (index/lists, UI builders, fragment rendering, form modes)
     I) DOMContentLoaded wiring (events + initial state)
   ============================================================================= */

/*#################################################################### A) Global state + small utils ####################################################################*/
const page_cache = new Map();

let year_page_lookup = null;

let active_content_file = '';
let active_page_id = '';

function safe_page_filename(s) {
  const raw = String(s || '').trim();
  const out = raw.replace(/[^a-zA-Z0-9_\-\.]+/g, '_').replace(/^_+|_+$/g, '');
  return out || 'page';
}

function is_visible(el) {
  if (!el) return false;
  return (el.style.display !== 'none');
}

function ui_name(s) {
  if (s == null) return '';
  const t = String(s).replace(/_/g, ' ').trim();
  if (t === 'Home') return 'Home';
  return t;
}

/*#################################################################### B) Year lookup + in-content year selector ####################################################################*/
async function load_year_page_lookup() {
  if (year_page_lookup !== null) return year_page_lookup;

  try {
    const r = await fetch('assets/year_page_lookup.json', { cache: 'no-store' });
    if (!r.ok) {
      year_page_lookup = {};
      return year_page_lookup;
    }
    year_page_lookup = await r.json();
    return year_page_lookup;
  } catch (e) {
    year_page_lookup = {};
    return year_page_lookup;
  }
}

function year_fallback_file_from_html(html, requested_file) {
  if (!html || !year_page_lookup) return null;

  // Parse without touching the live DOM (prevents visible flicker)
  const doc = new DOMParser().parseFromString(String(html), 'text/html');
  const el = doc.querySelector('.year_buttons[data-person_key][data-role]');
  if (!el) return null;

  const person_key = String(el.getAttribute('data-person_key') || '').trim();
  const role = String(el.getAttribute('data-role') || '').trim();
  if (!person_key || !role) return null;

  const years = Object.keys(year_page_lookup)
    .map(y => String(y))
    .filter(y => /^\d{4}$/.test(y))
    .sort((a, b) => Number(b) - Number(a));

  if (!years.length) return null;

  const label_current_year = String(window.DEFAULT_SEASON_YEAR || '').trim();

  // Prefer current year if it exists, otherwise highest available year
  const preferred = (label_current_year && years.includes(label_current_year))
    ? [label_current_year].concat(years.filter(y => y !== label_current_year))
    : years;

  for (const y of preferred) {
    const role_map = (year_page_lookup[y] || {})[role] || {};
    const f = role_map[person_key];
    if (f && String(f) !== String(requested_file)) return f;
  }

  return null;
}

function render_year_select_in_content(content_root) {
  if (!content_root || !year_page_lookup) return;

  const year_blocks = Array.from(content_root.querySelectorAll('.year_buttons'));
  if (!year_blocks.length) return;

  const years = Object.keys(year_page_lookup)
    .map(y => String(y))
    .filter(y => /^\d{4}$/.test(y))
    .sort((a, b) => Number(b) - Number(a));

  const label_current_year = String(window.DEFAULT_SEASON_YEAR || '').trim();

  year_blocks.forEach(el => {
    const person_key = (el.getAttribute('data-person_key') || '').trim();
    const role = (el.getAttribute('data-role') || '').trim();

    el.innerHTML = '';
    if (!person_key || !role) return;

    const active_file = active_content_file || (document.querySelector('.toc_link.active')?.dataset.file || '');

    const wrap = document.createElement('div');
    wrap.className = 'year_select_wrap';

    const label = document.createElement('div');
    label.className = 'year_select_label';
    label.textContent = 'Year';

    const sel = document.createElement('select');
    sel.className = 'year_select';

    let any_selected = false;

    function add_opt(text, file, is_selected) {
      const o = document.createElement('option');
      o.value = file;
      o.textContent = text;
      if (is_selected) {
        o.selected = true;
        any_selected = true;
      }
      sel.appendChild(o);
    }

    years.forEach(y => {
      const role_map = (year_page_lookup[y] || {})[role] || {};
      const file = role_map[person_key];
      if (!file) return;

      const is_current = label_current_year && (String(y) === String(label_current_year));
      const label_text = is_current ? 'Current' : String(y);
      const is_selected = (file === active_file);

      add_opt(label_text, file, is_selected);
    });

// If the currently-loaded file isn't one of the year options, just show the top option.
// Navigation is handled earlier (pre-DOM) in load_page to avoid flicker.
if (!any_selected && sel.options.length) {
  sel.selectedIndex = 0;
}

    sel.addEventListener('change', (e) => {
      e.preventDefault();
      const file = sel.value;
      if (!file) return;
      load_page(file, active_page_id || (document.querySelector('.toc_link.active')?.dataset.page || ''));
      if (active_page_id) history.replaceState(null, '', '#' + encodeURIComponent(active_page_id));
    });

    wrap.appendChild(label);
    wrap.appendChild(sel);
    el.appendChild(wrap);
  });
}

/*#################################################################### C) Sidebar collapse persistence (keys + read/write) ####################################################################*/
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

/*#################################################################### D) Content/page loading + activation (TOC + hash) ####################################################################*/
async function load_page(file, page_id) {
  const content = document.getElementById('content_root');
  if (!content) return;

  content.innerHTML = '<div style="padding:12px;color:rgba(96,103,112,0.95);">Loading…</div>';

  let html = page_cache.get(file);
  if (!html) {
    const r = await fetch(file);
    html = await r.text();
    page_cache.set(file, html);
  }

  // Pre-resolve year fallback BEFORE touching the live DOM to avoid flicker
  await load_year_page_lookup();
  const fallback_file = year_fallback_file_from_html(html, file);
  if (fallback_file) {
    load_page(fallback_file, page_id);
    return;
  }

  content.innerHTML = html;
  active_content_file = file || '';
  active_page_id = page_id || active_page_id || '';

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

  const links = document.querySelectorAll('.toc_link');
  links.forEach(a => a.classList.toggle('active', a.dataset.page === page_id));

  try { localStorage.setItem('mlb_dash_active_page', page_id); } catch (e) {}

  await load_year_page_lookup();
  render_year_select_in_content(content);
  install_plotly_tick_popovers(content);

  init_matchups_page_if_present(content);

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

function activate_page(page_id) {
  let a = null;
  document.querySelectorAll('.toc_link').forEach(x => {
    if (x.dataset.page === page_id) a = x;
  });
  if (!a) return;

  const file = a.dataset.file;
  if (!file) return;

  load_page(file, page_id);

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

/*#################################################################### E) Sidebar team role tabs ####################################################################*/
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

/*#################################################################### F) Search + filters (including search-mode open/restore) ####################################################################*/
function set_search_mode(is_searching) {
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

  document.querySelectorAll('.role_tabs').forEach(tabs => {
    tabs.style.display = is_searching ? 'none' : '';
  });

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

function cleanup_role_list(role_list) {
  if (!role_list) return;

  const in_search = (document.body.dataset.is_searching === '1');
  const team = role_list.dataset.team || '';

  let active_tab = null;
  document.querySelectorAll('.role_tab.active').forEach(t => {
    if (t.dataset.team === team) active_tab = t;
  });

  const active_role = active_tab ? (active_tab.dataset.role || 'batters') : 'batters';
  const hidden_by_tab = (!in_search && (role_list.dataset.role !== active_role));
  if (hidden_by_tab) return;

  role_list.querySelectorAll('.sub_role_label').forEach(el => el.style.display = '');

  const lis = Array.from(role_list.querySelectorAll('.player_li'));
  const has_any_player_visible = lis.some(li => is_visible(li));

  role_list.style.display = has_any_player_visible ? '' : 'none';
  if (!has_any_player_visible) return;

  const ul = role_list.querySelector('.player_list');
  if (!ul) return;

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

/*#################################################################### G) Mobile scaling for Plotly-heavy pages ####################################################################*/
function apply_mobile_scale() {
  const is_touch_mobile = window.matchMedia('(max-width: 900px) and (pointer: coarse)').matches;
  const content = document.getElementById('content_root');
  if (!content) return;

  const page = content.querySelector('.player_page');
  if (!page) return;

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

/*#################################################################### H) Matchups page (index/lists, UI builders, fragment rendering, form modes) ####################################################################*/
const matchups_cache = new Map();
let matchups_index = null;

async function load_matchups_index() {
  if (matchups_index !== null) return matchups_index;

  try {
    const r = await fetch('assets/matchups/matchups_index.json', { cache: 'no-store' });
    if (!r.ok) {
      matchups_index = null;
      return null;
    }
    matchups_index = await r.json();
    dbg('loaded matchups_index.json keys:', Object.keys(matchups_index || {}));
    return matchups_index;
  } catch (e) {
    matchups_index = null;
    return null;
  }
}

let matchups_lists = null;
const MATCHUPS_DEBUG = true;

function dbg(...args) {
  if (!MATCHUPS_DEBUG) return;
  console.log('[matchups]', ...args);
}

async function load_matchups_lists() {
  if (matchups_lists !== null) return matchups_lists;

  try {
    const r = await fetch('assets/matchups/matchups_lists.json', { cache: 'no-store' });
    if (!r.ok) {
      matchups_lists = null;
      return null;
    }
    matchups_lists = await r.json();
    dbg('loaded matchups_lists.json keys:', Object.keys(matchups_lists || {}));
    if (matchups_lists && matchups_lists.by_year && typeof matchups_lists.by_year === 'object') {
      dbg('matchups_lists by_year years:', Object.keys(matchups_lists.by_year).slice(0, 10));
    } else {
      dbg('matchups_lists has no by_year (or wrong shape)');
    }
    return matchups_lists;
  } catch (e) {
    matchups_lists = null;
    return null;
  }
}

function make_select(id, label_text) {
  const wrap = document.createElement('div');
  wrap.style.display = 'grid';
  wrap.style.gap = '6px';

  const label = document.createElement('div');
  label.textContent = label_text;
  label.style.fontSize = '12px';
  label.style.fontWeight = '700';
  label.style.color = 'rgba(96,103,112,0.95)';

  const sel = document.createElement('select');
  sel.id = id;
  sel.dataset.field = String(id || '').replace(/^matchups_/, '');
  sel.style.border = '1px solid var(--border)';
  sel.style.borderRadius = '10px';
  sel.style.padding = '8px 10px';
  sel.style.fontSize = '13px';
  sel.style.background = 'white';

  // keep placeholder styling in sync, but only bind once
  if (sel.dataset.ph_bound !== '1') {
    sel.dataset.ph_bound = '1';
    sel.addEventListener('change', () => sync_select_placeholder_class(sel));
  }

  wrap.appendChild(label);
  wrap.appendChild(sel);

  return { wrap, sel };
}

function sync_select_placeholder_class(sel) {
  if (!sel) return;
  const is_placeholder = !String(sel.value || '').trim();
  sel.classList.toggle('is_placeholder', is_placeholder);
}

function set_select_options(sel, options, placeholder) {
  sel.innerHTML = '';

  const ph = document.createElement('option');
  ph.value = '';
  ph.textContent = placeholder;
  sel.appendChild(ph);

  (options || []).forEach(v => {
    const o = document.createElement('option');
    o.value = v;
    o.textContent = ui_name(v);
    sel.appendChild(o);
  });

  sync_select_placeholder_class(sel);
  // sel.addEventListener('change', () => sync_select_placeholder_class(sel));
}

function set_select_options_grouped(sel, groups, placeholder) {
  sel.innerHTML = '';

  const ph = document.createElement('option');
  ph.value = '';
  ph.textContent = placeholder;
  sel.appendChild(ph);

  (groups || []).forEach(g => {
    const og = document.createElement('optgroup');
    og.label = g.label;

    (g.options || []).forEach(v => {
      const o = document.createElement('option');
      o.value = v;
      o.textContent = ui_name(v);
      og.appendChild(o);
    });

    sel.appendChild(og);
  });

  sync_select_placeholder_class(sel);
  // sel.addEventListener('change', () => sync_select_placeholder_class(sel));
}

function set_grouped_or_flat(sel, groups, flat, placeholder) {
  const has_groups = Array.isArray(groups) && groups.length;
  if (has_groups) {
    set_select_options_grouped(sel, groups, placeholder);
    return;
  }
  set_select_options(sel, flat || [], placeholder);
}

function rebuild_select_keep_value(sel, rebuild_fn) {
  if (!sel || typeof rebuild_fn !== 'function') return;

  const prev = String(sel.value || '').trim();
  rebuild_fn();

  if (prev) {
    const still_exists = Array.from(sel.options || []).some(o => String(o.value) === prev);
    if (still_exists) sel.value = prev;
  }

  sync_select_placeholder_class(sel);
}

function build_sidebar_lists() {
  const out = {
    hitters_by_team: [],
    pitchers_sp_by_team: [],
    pitchers_rp_by_team: [],
    hitters: [],
    pitchers_sp: [],
    pitchers_rp: [],
    hitter_team_map: {},
  };

  const team_blocks = Array.from(document.querySelectorAll('.team_block'));
  if (!team_blocks.length) return out;

  function last_name_key(name) {
    const s = String(name || '').trim();
    if (!s) return '';
    const parts = s.split(/\s+/);
    return parts[parts.length - 1].toLowerCase();
  }

  function sort_names(arr) {
    return arr.sort((a, b) => {
      const ka = last_name_key(a);
      const kb = last_name_key(b);
      if (ka !== kb) return ka < kb ? -1 : 1;
      return String(a).localeCompare(String(b));
    });
  }

  function group_from_role_list(tb, role) {
    const team = String(tb.dataset.team || '').trim();
    if (!team) return null;

    const rl = tb.querySelector(`.role_list[data-role="${role}"]`);
    if (!rl) return { label: team, options: [] };

    const names = Array.from(rl.querySelectorAll('.toc_link'))
      .map(a => String(a.textContent || '').trim())
      .filter(Boolean);

    return { label: team, options: sort_names(names) };
  }

  const hitters = [];
  const sp = [];
  const rp = [];

  team_blocks.forEach(tb => {
    const team = String(tb.dataset.team || '').trim();
    if (!team) return;

    const h_g = group_from_role_list(tb, 'batters');
    const sp_g = group_from_role_list(tb, 'starters');
    const rp_g = group_from_role_list(tb, 'relievers');

    if (h_g && h_g.options.length) {
      out.hitters_by_team.push({ label: team, options: h_g.options });
      h_g.options.forEach(n => {
        hitters.push(n);
        out.hitter_team_map[n] = team;
      });
    }

    if (sp_g && sp_g.options.length) {
      out.pitchers_sp_by_team.push({ label: `${team} — Starters`, options: sp_g.options });
      sp_g.options.forEach(n => sp.push(n));
    }

    if (rp_g && rp_g.options.length) {
      out.pitchers_rp_by_team.push({ label: `${team} — Relievers`, options: rp_g.options });
      rp_g.options.forEach(n => rp.push(n));
    }
  });

  out.hitters = Array.from(new Set(hitters));
  out.pitchers_sp = Array.from(new Set(sp));
  out.pitchers_rp = Array.from(new Set(rp));

  sort_names(out.hitters);
  sort_names(out.pitchers_sp);
  sort_names(out.pitchers_rp);

  return out;
}

function build_pitcher_groups(year_lists) {
  const sp = Array.isArray(year_lists.pitchers_sp_by_team) ? year_lists.pitchers_sp_by_team : [];
  const rp = Array.isArray(year_lists.pitchers_rp_by_team) ? year_lists.pitchers_rp_by_team : [];

  if (!sp.length && !rp.length) {
    return Array.isArray(year_lists.pitchers_by_team) ? year_lists.pitchers_by_team : [];
  }

  function base_team(label) {
    const s = String(label || '').trim();
    if (!s) return '';
    const parts = s.split(/\s*[—-]\s*/);
    return String(parts[0] || '').trim();
  }

  const sp_map = new Map();
  sp.forEach(g => {
    const t = base_team(g.label);
    const opts = Array.isArray(g.options) ? g.options : [];
    if (!t || !opts.length) return;
    sp_map.set(t, opts);
  });

  const rp_map = new Map();
  rp.forEach(g => {
    const t = base_team(g.label);
    const opts = Array.isArray(g.options) ? g.options : [];
    if (!t || !opts.length) return;
    rp_map.set(t, opts);
  });

  const teams = new Set();
  for (const t of sp_map.keys()) teams.add(t);
  for (const t of rp_map.keys()) teams.add(t);

  const out = [];
  Array.from(teams).filter(Boolean).sort().forEach(t => {
    const sp_opts = sp_map.get(t) || [];
    const rp_opts = rp_map.get(t) || [];

    if (sp_opts.length) out.push({ label: `${t} — Starters`, options: sp_opts });
    if (rp_opts.length) out.push({ label: `${t} — Relievers`, options: rp_opts });
  });

  return out;
}

function filter_groups_to_allowed(groups, allowed_set) {
  const gs = Array.isArray(groups) ? groups : [];
  if (!allowed_set || !(allowed_set instanceof Set)) return gs;

  const out = [];
  gs.forEach(g => {
    const opts = (g && Array.isArray(g.options)) ? g.options : [];
    const kept = opts.filter(x => allowed_set.has(String(x)));
    if (kept.length) out.push({ label: g.label, options: kept });
  });
  return out;
}

function allowed_pitchers_for_hitter_side(year_lists, hitter, side) {
  const hvp = (year_lists && year_lists.hvp_pitchers_by_hitter_side && typeof year_lists.hvp_pitchers_by_hitter_side === 'object')
    ? year_lists.hvp_pitchers_by_hitter_side
    : null;

  const h = String(hitter || '').trim();
  const s = String(side || '').trim();

  if (!h || !hvp || !hvp[h]) return null;

  if (!s) {
    const a = Array.isArray(hvp[h]['Away']) ? hvp[h]['Away'] : [];
    const v = Array.isArray(hvp[h]['Home']) ? hvp[h]['Home'] : [];
    return new Set([].concat(a, v).map(x => String(x)));
  }

  const arr = Array.isArray(hvp[h][s]) ? hvp[h][s] : [];
  return new Set(arr.map(x => String(x)));
}

function resolve_fragment(idx, year, mode, keys) {
  if (!idx || !idx.modes || !idx.modes[mode]) return null;

  let cur = idx.modes[mode].fragments;
  if (!cur) return null;

  cur = cur[String(year)];
  if (!cur) return null;

  for (const k of keys) {
    if (!cur || typeof cur !== 'object') return null;
    cur = cur[String(k)];
  }

  return (typeof cur === 'string') ? cur : null;
}

async function load_matchup_fragment(path) {
  if (!path) return null;

  const cached = matchups_cache.get(path);
  if (cached) return cached;

  try {
    const r = await fetch(path, { cache: 'no-store' });
    if (!r.ok) return null;
    const html = await r.text();
    matchups_cache.set(path, html);
    return html;
  } catch (e) {
    return null;
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////
// Projected Pitchers (StatsAPI probables -> sp_vs_team fragments)
////////////////////////////////////////////////////////////////////////////////////////////////////

function remove_accents(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function to_yyyy_mm_dd_local(d) {
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function add_days_local(d, days) {
  const x = new Date(d.getTime());
  x.setDate(x.getDate() + Number(days || 0));
  return x;
}

function mmdd_key_local(d) {
  const mm = d.getMonth() + 1; // 1-12
  const dd = d.getDate();      // 1-31
  return (mm * 100) + dd;      // e.g. Apr 5 => 405
}

function most_recent_prior_year(years, cur_year) {
  const ys = (years || [])
    .map(y => String(y || '').trim())
    .filter(y => /^\d{4}$/.test(y))
    .map(y => Number(y))
    .filter(n => Number.isFinite(n))
    .sort((a, b) => b - a);

  const cur = Number(cur_year);
  if (!Number.isFinite(cur)) return ys[0] ? String(ys[0]) : String(cur_year || '');

  const prior = ys.find(y => y < cur);
  return prior ? String(prior) : (ys[0] ? String(ys[0]) : String(cur));
}

// MLB teamId -> your 3-letter code used by your matchup CSVs/fragments
const team_id_to_code = {
  108: 'LAA',
  109: 'ARI',
  110: 'BAL',
  111: 'BOS',
  112: 'CHC',
  113: 'CIN',
  114: 'CLE',
  115: 'COL',
  116: 'DET',
  117: 'HOU',
  118: 'KC',
  119: 'LAD',
  120: 'WAS',
  121: 'NYM',
  133: 'ATH', // Athletics
  134: 'PIT',
  135: 'SD',
  136: 'SEA',
  137: 'SF',
  138: 'STL',
  139: 'TB',
  140: 'TEX',
  141: 'TOR',
  142: 'MIN',
  143: 'PHI',
  144: 'ATL',
  145: 'CWS',
  146: 'MIA',
  147: 'NYY',
  158: 'MIL',
};

async function fetch_probable_pitchers_for_date(date_str) {
  const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${encodeURIComponent(date_str)}&hydrate=probablePitcher`;
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) return [];

  const j = await r.json();
  const games = (j.dates && j.dates[0] && Array.isArray(j.dates[0].games)) ? j.dates[0].games : [];
  const out = [];

  for (const g of games) {
    const away_id = g?.teams?.away?.team?.id;
    const home_id = g?.teams?.home?.team?.id;

    const away_team = team_id_to_code[away_id] || '';
    const home_team = team_id_to_code[home_id] || '';
    if (!away_team || !home_team) continue;

    const away_p = g?.teams?.away?.probablePitcher?.fullName || '';
    const home_p = g?.teams?.home?.probablePitcher?.fullName || '';

    // Away SP is "Away" vs home team
    if (away_p) {
      out.push({
        pitcher: remove_accents(away_p),
        team: away_team,
        opp: home_team,
        side: 'Away',
      });
    }

    // Home SP is "vs" vs away team
// Home SP is "Home" vs away team
if (home_p) {
  out.push({
    pitcher: remove_accents(home_p),
    team: home_team,
    opp: away_team,
    side: 'Home',
  });
}
  }

  return out;
}

function matchup_sort_key(team, opp) {
  const a = String(team || '').trim();
  const b = String(opp || '').trim();
  const lo = (a && b) ? (a < b ? a : b) : (a || b);
  const hi = (a && b) ? (a < b ? b : a) : '';
  return `${lo}||${hi}`;
}

function sort_projected_rows(rows) {
  function norm(s) {
    return String(s || '').trim().toUpperCase();
  }

  function side_rank(s) {
    const x = norm(s);
    if (x === 'AWAY') return 0;
    if (x === 'HOME') return 1;
    return 2;
  }

  return (rows || []).slice().sort((x, y) => {
    const tx = norm(x.team);
    const ty = norm(y.team);
    if (tx !== ty) return tx < ty ? -1 : 1;

    const sx = side_rank(x.side);
    const sy = side_rank(y.side);
    if (sx !== sy) return sx < sy ? -1 : 1;

    const ox = norm(x.opp);
    const oy = norm(y.opp);
    if (ox !== oy) return ox < oy ? -1 : 1;

    const px = String(x.pitcher || '').trim();
    const py = String(y.pitcher || '').trim();
    if (px !== py) return px.localeCompare(py);

    return 0;
  });
}

function init_matchups_page_if_present(content_root) {
  if (!content_root) return;

  const mode_root = content_root.querySelector('#matchups_mode_root');
  const form_root = content_root.querySelector('#matchups_form_root');
  const results_root = content_root.querySelector('#matchups_results_root');
  if (!mode_root || !form_root || !results_root) return;

  if (form_root.dataset.inited === '1') return;
  form_root.dataset.inited = '1';

  mode_root.innerHTML = '';
  form_root.innerHTML = '';
  results_root.innerHTML = '';

  const multi_form_state = {
    multi_starter: { n: 1, rows: [] }, // [{ pitcher, side, team }]
    multi_hitter: { n: 1, rows: [] },  // [{ hitter, side, pitcher }]
  };

  function clamp_rows_n(x) {
    const v = Number(x);
    if (!Number.isFinite(v)) return 1;
    return Math.max(1, Math.min(7, Math.floor(v)));
  }

  function snapshot_multi_state(mode) {
    if (mode !== 'multi_starter' && mode !== 'multi_hitter') return;

    const st = multi_form_state[mode];
    const n = clamp_rows_n(st.n);

    const out = [];
    for (let i = 0; i < n; i++) {
      if (mode === 'multi_starter') {
        const p = document.getElementById(`matchups_pitcher_${i}`)?.value || '';
        const s = document.getElementById(`matchups_side_${i}`)?.value || '';
        const t = document.getElementById(`matchups_team_${i}`)?.value || '';
        out.push({ pitcher: p, side: s, team: t });
      } else {
        const h = document.getElementById(`matchups_hitter_${i}`)?.value || '';
        const s = document.getElementById(`matchups_side_${i}`)?.value || '';
        const p = document.getElementById(`matchups_pitcher_${i}`)?.value || '';
        out.push({ hitter: h, side: s, pitcher: p });
      }
    }

    st.rows = out;
    st.n = n;
  }

  const mode_bar = document.createElement('div');
  mode_bar.style.display = 'flex';
  mode_bar.style.justifyContent = 'space-between';
  mode_bar.style.alignItems = 'center';
  mode_bar.style.gap = '10px';

  const mode_select = document.createElement('select');
  mode_select.style.padding = '8px 10px';
  mode_select.style.border = '1px solid var(--border)';
  mode_select.style.borderRadius = '10px';

  const modes = [
    ['projected_pitchers', 'Projected Starters'],
    ['multi_starter', 'Starting Pitchers'],
    ['rp_inning', 'Reliever Inning'],
    ['multi_hitter', 'Hitters']
  ];

  modes.forEach(m => {
    const o = document.createElement('option');
    o.value = m[0];
    o.textContent = m[1];
    mode_select.appendChild(o);
  });

  const row_controls = document.createElement('div');
  row_controls.style.display = 'none';
  row_controls.style.alignItems = 'center';
  row_controls.style.gap = '8px';

  const rows_label = document.createElement('div');
  rows_label.style.fontSize = '12px';
  rows_label.style.fontWeight = '700';
  rows_label.style.color = 'rgba(96,103,112,0.95)';
  rows_label.textContent = 'Rows: 1';

  const rows_minus = document.createElement('button');
  rows_minus.type = 'button';
  rows_minus.className = 'matchups_submit';
  rows_minus.textContent = '−';

  const rows_plus = document.createElement('button');
  rows_plus.type = 'button';
  rows_plus.className = 'matchups_submit';
  rows_plus.textContent = '+';

  row_controls.appendChild(rows_label);
  row_controls.appendChild(rows_minus);
  row_controls.appendChild(rows_plus);

  mode_bar.appendChild(mode_select);
  mode_bar.appendChild(row_controls);
  mode_root.appendChild(mode_bar);

  function sync_row_controls() {
    const mode = mode_select.value;
    const is_multi = (mode === 'multi_starter' || mode === 'multi_hitter');

    row_controls.style.display = is_multi ? 'flex' : 'none';

    if (is_multi) {
      const n = clamp_rows_n(multi_form_state[mode].n);
      multi_form_state[mode].n = n;
      rows_label.textContent = `Rows: ${n}`;
      rows_minus.disabled = (n <= 1);
      rows_plus.disabled = (n >= 7);
    }
  }

  rows_minus.addEventListener('click', (e) => {
    e.preventDefault();
    const mode = mode_select.value;
    if (mode !== 'multi_starter' && mode !== 'multi_hitter') return;

    snapshot_multi_state(mode);
    multi_form_state[mode].n = clamp_rows_n(multi_form_state[mode].n - 1);
    sync_row_controls();
    build_form();
  });

  rows_plus.addEventListener('click', (e) => {
    e.preventDefault();
    const mode = mode_select.value;
    if (mode !== 'multi_starter' && mode !== 'multi_hitter') return;

    snapshot_multi_state(mode);
    multi_form_state[mode].n = clamp_rows_n(multi_form_state[mode].n + 1);
    sync_row_controls();
    build_form();
  });

  sync_row_controls();

  function clear_results() {
    results_root.innerHTML = '';
  }

  function parse_matchup_stat_number(s) {
    const raw = String(s || '').trim();
    if (!raw) return NaN;

    const x = raw.replace(/,/g, '');
    const m = x.match(/-?(?:\d+(?:\.\d*)?|\.\d+)/);
    return m ? Number(m[0]) : NaN;
  }

  function clamp(x, lo, hi) {
    return Math.max(lo, Math.min(hi, x));
  }

  function rgba_from_two_sided_value(v, worst, neutral_lo, neutral_hi, best) {
    const val = Number(v);
    if (!Number.isFinite(val)) return '';

    const lo = Math.min(worst, best);
    const hi = Math.max(worst, best);
    const vv = clamp(val, lo, hi);

    const nlo = Math.min(neutral_lo, neutral_hi);
    const nhi = Math.max(neutral_lo, neutral_hi);

    if (vv >= nlo && vv <= nhi) {
      return '';
    }

    const frac = (vv - worst) / (best - worst);
    const f = clamp(frac, 0, 1);

    const alpha_min = 0.25;
    const alpha_max = 0.95;
    const alpha_curve_pow = 0.40;

    const d = clamp(Math.abs(f - 0.5) * 2.0, 0, 1);
    const a = alpha_min + (alpha_max - alpha_min) * Math.pow(d, alpha_curve_pow);

    if (f > 0.5) return `rgba(210,35,35,${a.toFixed(3)})`;
    return `rgba(35,85,210,${a.toFixed(3)})`;
  }

  function is_matchup_stat_col(header_text) {
    const h = String(header_text || '').trim();
    return h.startsWith('+');
  }

  function extract_table_parts(fragment_html) {
    const doc = new DOMParser().parseFromString(fragment_html, 'text/html');
    const table = doc.querySelector('table.matchup_table') || doc.querySelector('table');
    if (!table) return null;

    const thead = table.querySelector('thead');
    const tbody = table.querySelector('tbody');

    const header_cells = thead ? Array.from(thead.querySelectorAll('th')).map(th => th.textContent.trim()) : [];
    const row_cells = tbody ? Array.from(tbody.querySelectorAll('td')).map(td => td.textContent.trim()) : [];

    return { header_cells, row_cells };
  }

  async function render_fragments(paths, opts) {
    clear_results();

    const options = opts && typeof opts === 'object' ? opts : {};
    const invert_stats = !!options.invert_stats;

    const rows = [];
    let header = null;

    for (const p of (paths || [])) {
      if (!p) continue;

      const html = await load_matchup_fragment(p);
      if (!html) continue;

      const parts = extract_table_parts(html);
      if (!parts) continue;

      if (!header && parts.header_cells.length) header = parts.header_cells;
      if (parts.row_cells.length) rows.push(parts.row_cells);
    }

    if (!header || !rows.length) return;

// Remove Park / ParkFactor columns and hide empty pitch columns
const drop_cols = new Set(['Park', 'ParkFactor']);

const pitch_cols = new Set([
  '+FB', '+SI', '+CT', '+SL', '+SW', '+CB', '+CH', '+SP', '+KN'
]);

function cell_has_value(v) {
  const s = String(v || '').trim();
  return s && s !== '—';
}

// precompute whether each column has any value
const col_has_value = new Array(header.length).fill(false);

rows.forEach(r => {
  for (let i = 0; i < header.length; i++) {
    if (!col_has_value[i] && cell_has_value(r[i])) {
      col_has_value[i] = true;
    }
  }
});

const keep_idx = [];

header.forEach((h, i) => {
  const name = String(h || '').trim();

  if (drop_cols.has(name)) return;

  if (pitch_cols.has(name) && !col_has_value[i]) return;

  keep_idx.push(i);
});

header = keep_idx.map(i => header[i]);
rows.forEach((r, k) => {
  rows[k] = keep_idx.map(i => r[i]);
});

    function decimals_in_raw(raw) {
      const s = String(raw || '').trim();
      const m = s.match(/-?(?:\d+)(?:\.(\d+))?/);
      if (!m) return null;
      return m[1] ? m[1].length : 0;
    }

    function format_like_raw(raw, val) {
      const d = decimals_in_raw(raw);
      if (d === null) return String(val);
      if (!Number.isFinite(val)) return String(raw || '').trim();
      if (d === 0) return String(Math.round(val));
      return val.toFixed(d);
    }

    const wrap = document.createElement('div');
    wrap.className = 'matchup_table_wrap';

    const table = document.createElement('table');
    table.className = 'matchup_table';

    const thead = document.createElement('thead');
    const trh = document.createElement('tr');
    header.forEach(h => {
      const th = document.createElement('th');
      th.textContent = h;
      trh.appendChild(th);
    });
    thead.appendChild(trh);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    rows.forEach(r => {
      const tr = document.createElement('tr');

      r.forEach((cell, j) => {
        const td = document.createElement('td');

        const raw = String(cell || '').trim();
        if (!raw) {
          td.textContent = '—';
          td.classList.add('cell_dash');
          tr.appendChild(td);
          return;
        }

        const h = (header && header[j]) ? header[j] : '';

        td.textContent = raw;

        if (is_matchup_stat_col(h)) {
          const v0 = parse_matchup_stat_number(raw);
          if (Number.isFinite(v0)) {
            const v = invert_stats ? -v0 : v0;

            if (invert_stats) {
              const txt = format_like_raw(raw, v);
              td.textContent = (v > 0 ? `+${txt}` : String(txt));
            }

            td.style.background = rgba_from_two_sided_value(v, -100, -10, 10, 100);
            td.style.color = 'rgba(20,20,20,0.95)';
          }
        }

        tr.appendChild(td);
      });

      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    wrap.appendChild(table);
    results_root.appendChild(wrap);
  }

  async function build_form() {
    snapshot_multi_state(mode_select.value);

const prev_year = document.getElementById('matchups_year')?.value || '';

form_root.innerHTML = '';
clear_results();

    const idx = await load_matchups_index();
    if (!idx) return;

    const lists = await load_matchups_lists();

    dbg('build_form mode:', mode_select.value);
    dbg('idx years:', idx && idx.years ? idx.years : '(none)');
    dbg('lists years:', (lists && Array.isArray(lists.years)) ? lists.years : '(none)');

    function derive_years(idx_obj) {
      const out = new Set();

      const direct = idx_obj && idx_obj.years ? idx_obj.years : [];
      (direct || []).forEach(y => {
        const s = String(y || '').trim();
        if (/^\d{4}$/.test(s)) out.add(s);
      });

      if (out.size) {
        return Array.from(out).sort((a, b) => Number(b) - Number(a));
      }

      const modes_obj = (idx_obj && idx_obj.modes) ? idx_obj.modes : {};
      Object.keys(modes_obj).forEach(m => {
        const fr = (modes_obj[m] && modes_obj[m].fragments) ? modes_obj[m].fragments : null;
        if (!fr || typeof fr !== 'object') return;
        Object.keys(fr).forEach(y => {
          const s = String(y || '').trim();
          if (/^\d{4}$/.test(s)) out.add(s);
        });
      });

      return Array.from(out).sort((a, b) => Number(b) - Number(a));
    }

    let years = derive_years(idx);

    if (lists && Array.isArray(lists.years) && lists.years.length) {
      const a = years || [];
      const b = lists.years.map(y => String(y).trim());
      years = Array.from(new Set(a.concat(b)))
        .filter(y => /^\d{4}$/.test(y))
        .sort((a2, b2) => Number(b2) - Number(a2));
    }

    let hitters = [];
    let pitchers = [];
    let teams = [];
    let year_lists = { hitters_by_team: [], pitchers_by_team: [] };

    function last_name_key(name) {
      const s = String(name || '').trim();
      if (!s) return '';
      const parts = s.split(/\s+/);
      return parts[parts.length - 1].toLowerCase();
    }

    function get_mode_year_fragments(idx_obj, mode, y) {
      if (!idx_obj || !idx_obj.modes || !idx_obj.modes[mode]) return null;
      const fr = idx_obj.modes[mode].fragments;
      if (!fr || typeof fr !== 'object') return null;
      return fr[String(y)] || null;
    }

    const preferred_year = String(window.DEFAULT_SEASON_YEAR || '2026');

    function refresh_lists_from_year(y) {
      const year_val = String(y || '').trim();

      hitters = [];
      pitchers = [];
      teams = [];
      year_lists = { hitters_by_team: [], pitchers_by_team: [] };

      if (!year_val) return;
      dbg('refresh_lists_from_year year:', year_val);

      const by_year = (lists && lists.by_year && typeof lists.by_year === 'object') ? lists.by_year : null;
      const pack = by_year ? by_year[year_val] : null;

      dbg('lists.by_year exists:', !!by_year);
      dbg('pack exists for year:', !!pack);
      if (by_year && !pack) {
        dbg('available by_year years:', Object.keys(by_year).slice(0, 20));
      }

      if (pack && typeof pack === 'object') {
        hitters = Array.isArray(pack.hitters) ? pack.hitters : [];
        pitchers = Array.isArray(pack.pitchers) ? pack.pitchers : [];
        teams = Array.isArray(pack.teams) ? pack.teams : [];

        year_lists = {
          hvp_pitchers_by_hitter_side: (pack.hvp_pitchers_by_hitter_side && typeof pack.hvp_pitchers_by_hitter_side === 'object')
            ? pack.hvp_pitchers_by_hitter_side
            : {},
          hitters_by_team: Array.isArray(pack.hitters_by_team) ? pack.hitters_by_team : [],
          pitchers_by_team: Array.isArray(pack.pitchers_by_team) ? pack.pitchers_by_team : [],
          pitchers_rp_by_team: Array.isArray(pack.pitchers_rp_by_team) ? pack.pitchers_rp_by_team : [],
          pitchers_sp_by_team: Array.isArray(pack.pitchers_sp_by_team) ? pack.pitchers_sp_by_team : [],
          hitter_team_map: (pack.hitter_team_map && typeof pack.hitter_team_map === 'object') ? pack.hitter_team_map : {},
          pitchers_rp: Array.isArray(pack.pitchers_rp) ? pack.pitchers_rp : [],
          pitchers_sp: Array.isArray(pack.pitchers_sp) ? pack.pitchers_sp : [],
        };

        function has_any(x) {
          return Array.isArray(x) && x.length;
        }

        function finalize_year_lists_from_pack_or_partial() {
          year_lists.hitters_by_team = Array.isArray(year_lists.hitters_by_team) ? year_lists.hitters_by_team : [];
          year_lists.pitchers_by_team = Array.isArray(year_lists.pitchers_by_team) ? year_lists.pitchers_by_team : [];

          year_lists.pitchers_sp_by_team = Array.isArray(year_lists.pitchers_sp_by_team) ? year_lists.pitchers_sp_by_team : [];
          year_lists.pitchers_rp_by_team = Array.isArray(year_lists.pitchers_rp_by_team) ? year_lists.pitchers_rp_by_team : [];

          year_lists.pitchers_sp = Array.isArray(year_lists.pitchers_sp) ? year_lists.pitchers_sp : [];
          year_lists.pitchers_rp = Array.isArray(year_lists.pitchers_rp) ? year_lists.pitchers_rp : [];

          year_lists.hitter_team_map =
            (year_lists.hitter_team_map && typeof year_lists.hitter_team_map === 'object') ? year_lists.hitter_team_map : {};

          if (!has_any(year_lists.pitchers_sp_by_team) && has_any(year_lists.pitchers_by_team)) {
            year_lists.pitchers_sp_by_team = year_lists.pitchers_by_team;
          }

          if (!has_any(year_lists.pitchers_sp) && has_any(pitchers)) {
            year_lists.pitchers_sp = pitchers;
          }

          if (!has_any(hitters) && has_any(year_lists.hitters_by_team)) {
            const s = new Set();
            year_lists.hitters_by_team.forEach(g => (g.options || []).forEach(n => s.add(n)));
            hitters = Array.from(s);
          }
        }

        finalize_year_lists_from_pack_or_partial();

        if (String(year_val) === String(preferred_year)) {
          const sb = build_sidebar_lists();

          if (Array.isArray(sb.hitters_by_team) && sb.hitters_by_team.length) {
            hitters = sb.hitters;
            year_lists.hitters_by_team = sb.hitters_by_team;
            year_lists.hitter_team_map = sb.hitter_team_map;
          }

          if (Array.isArray(sb.pitchers_sp_by_team) && sb.pitchers_sp_by_team.length) {
            year_lists.pitchers_sp_by_team = sb.pitchers_sp_by_team;
            year_lists.pitchers_sp = sb.pitchers_sp;
          }

          if (Array.isArray(sb.pitchers_rp_by_team) && sb.pitchers_rp_by_team.length) {
            year_lists.pitchers_rp_by_team = sb.pitchers_rp_by_team;
            year_lists.pitchers_rp = sb.pitchers_rp;
          }

          const all_p = []
            .concat(year_lists.pitchers_sp || [])
            .concat(year_lists.pitchers_rp || []);
          pitchers = Array.from(new Set(all_p)).sort((a, b) => a.localeCompare(b));
        }

        const needs_hitters = !has_any(hitters) && !has_any(year_lists.hitters_by_team);
        const needs_pitchers = !has_any(pitchers) && !has_any(year_lists.pitchers_by_team);
        const needs_teams = !has_any(teams);

        if (!needs_hitters && !needs_pitchers && !needs_teams) {
          return;
        }

        dbg('pack was present but empty; falling back to fragment-derived lists');
      }

      const sp_team_root = get_mode_year_fragments(idx, 'sp_vs_team', year_val);
      const sp_2_root = get_mode_year_fragments(idx, 'sp_vs_2', year_val);
      const hvp_root = get_mode_year_fragments(idx, 'hitter_vs_pitcher', year_val);

      dbg('fallback roots present', {
        sp_vs_team: !!sp_team_root,
        sp_vs_2: !!sp_2_root,
        hitter_vs_pitcher: !!hvp_root,
      });

      const hitters_set = new Set();
      const pitchers_set = new Set();
      const teams_set = new Set();

      const hitters_by_team = new Map();
      const pitchers_by_team = new Map();

      dbg('fallback sizes', { hitters: hitters.length, pitchers: pitchers.length, teams: teams.length });

      function add_player(map_obj, team, player) {
        const t = String(team || '').trim() || 'Other';
        const p = String(player || '').trim();
        if (!p) return;
        if (!map_obj.has(t)) map_obj.set(t, new Set());
        map_obj.get(t).add(p);
      }

      if (sp_team_root && typeof sp_team_root === 'object') {
        Object.keys(sp_team_root).forEach(p => {
          pitchers_set.add(p);
          const sides = sp_team_root[p] || {};
          Object.keys(sides).forEach(s => {
            const tmap = sides[s] || {};
            Object.keys(tmap).forEach(t => {
              teams_set.add(t);
              add_player(pitchers_by_team, t, p);
            });
          });
        });
      }

      if (sp_2_root && typeof sp_2_root === 'object') {
        Object.keys(sp_2_root).forEach(p => {
          pitchers_set.add(p);
          const sides = sp_2_root[p] || {};
          Object.keys(sides).forEach(s => {
            const tmap = sides[s] || {};
            Object.keys(tmap).forEach(t => {
              teams_set.add(t);
              add_player(pitchers_by_team, t, p);
            });
          });
        });
      }

      if (hvp_root && typeof hvp_root === 'object') {
        Object.keys(hvp_root).forEach(h => {
          hitters_set.add(h);
          const sides = hvp_root[h] || {};
          Object.keys(sides).forEach(s => {
            const pmap = sides[s] || {};
            Object.keys(pmap).forEach(p => {
              pitchers_set.add(p);
            });
          });
        });
      }

      hitters = Array.from(hitters_set).sort((a, b) => {
        const ka = last_name_key(a);
        const kb = last_name_key(b);
        if (ka !== kb) return ka < kb ? -1 : 1;
        return String(a).localeCompare(String(b));
      });

      pitchers = Array.from(pitchers_set).sort((a, b) => {
        const ka = last_name_key(a);
        const kb = last_name_key(b);
        if (ka !== kb) return ka < kb ? -1 : 1;
        return String(a).localeCompare(String(b));
      });

      teams = Array.from(teams_set).sort();

      function map_to_groups(map_obj) {
        const groups = [];
        Array.from(map_obj.keys()).sort().forEach(t => {
          const opts = Array.from(map_obj.get(t) || []).sort((a, b) => {
            const ka = last_name_key(a);
            const kb = last_name_key(b);
            if (ka !== kb) return ka < kb ? -1 : 1;
            return String(a).localeCompare(String(b));
          });
          groups.push({ label: t, options: opts });
        });
        return groups;
      }

      const hb = map_to_groups(hitters_by_team);
      const pb = map_to_groups(pitchers_by_team);

      year_lists = {
        hitters_by_team: hb,
        pitchers_by_team: pb,
        pitchers_sp_by_team: pb,
        pitchers_rp_by_team: pb,
        pitchers_sp: pitchers,
        pitchers_rp: pitchers,
        hitter_team_map: year_lists.hitter_team_map || {},
      };
    }

    const initial_year = String(prev_year || preferred_year || (years[0] || '')).trim();
    refresh_lists_from_year(initial_year);
    const mode = mode_select.value;
    const is_projected = (mode === 'projected_pitchers');

    function build_select(id, label_text, options, placeholder) {
      const { wrap, sel } = make_select(id, label_text);
      set_select_options(sel, options, placeholder);
      return { wrap, sel };
    }

    function build_side_select(id) {
      return build_select(id, 'Away/Home', ['Away', 'Home'], 'Select');
    }

let year_sel = null;

if (!is_projected) {
  const year_obj = make_select('matchups_year', 'Year');
  set_select_options(year_obj.sel, years, 'Select year');
  form_root.appendChild(year_obj.wrap);

  year_obj.sel.value = String(prev_year || preferred_year || (years[0] || '')).trim();
  sync_select_placeholder_class(year_obj.sel);

  year_obj.sel.addEventListener('change', () => {
    refresh_lists_from_year(year_obj.sel.value);
    clear_results();
    build_form();
  });

  year_sel = year_obj.sel;
}

    function append_row(row_root, items) {
      const row_div = document.createElement('div');
      row_div.style.display = 'flex';
      row_div.style.flexWrap = 'wrap';
      row_div.style.gap = '8px';
      row_div.style.alignItems = 'flex-end';

      (items || []).forEach(x => {
        if (!x || !x.wrap) return;
        row_div.appendChild(x.wrap);
      });

      row_root.appendChild(row_div);
      return row_div;
    }

    function build_action_buttons(on_submit, on_clear, submit_text) {
      const wrap = document.createElement('div');
      wrap.style.marginTop = '10px';
      wrap.style.display = 'flex';
      wrap.style.gap = '8px';
      wrap.style.alignItems = 'center';

      const submit_btn = document.createElement('button');
      submit_btn.type = 'button';
      submit_btn.textContent = submit_text || 'Submit';
      submit_btn.className = 'matchups_submit';
      submit_btn.addEventListener('click', (e) => {
        e.preventDefault();
        if (typeof on_submit === 'function') on_submit();
      });

      const clear_btn = document.createElement('button');
      clear_btn.type = 'button';
      clear_btn.textContent = 'Clear';
      clear_btn.className = 'matchups_submit';
      clear_btn.style.background = 'rgba(210,35,35,0.12)';
      clear_btn.style.borderColor = 'rgba(210,35,35,0.35)';
      clear_btn.addEventListener('click', (e) => {
        e.preventDefault();
        if (typeof on_clear === 'function') on_clear();
      });

      wrap.appendChild(submit_btn);
      wrap.appendChild(clear_btn);

      form_root.appendChild(wrap);

      return { wrap, submit_btn, clear_btn };
    }

// const path = resolve_fragment(idx, y, 'sp_vs_team', [p_key, p.side, t_key]);
    sync_row_controls();

    function base_team_from_label(label) {
      const s = String(label || '').trim();
      if (!s) return '';
      const parts = s.split(/\s*[—-]\s*/);
      return String(parts[0] || '').trim();
    }

    function build_team_map_from_groups(groups) {
      const out = {};
      (groups || []).forEach(g => {
        const team = base_team_from_label(g && g.label);
        const opts = (g && Array.isArray(g.options)) ? g.options : [];
        if (!team) return;
        opts.forEach(n => {
          const nm = String(n || '').trim();
          if (nm && !out[nm]) out[nm] = team;
        });
      });
      return out;
    }

    function filter_groups_excluding_team(groups, excluded_team) {
      const ex = String(excluded_team || '').trim();
      if (!ex) return groups || [];

      const out = [];
      (groups || []).forEach(g => {
        const team = base_team_from_label(g && g.label);
        if (team && team === ex) return;

        const opts = (g && Array.isArray(g.options)) ? g.options : [];
        if (opts.length) out.push({ label: g.label, options: opts });
      });
      return out;
    }

    function filter_flat_excluding_team(flat, team_map, excluded_team) {
      const ex = String(excluded_team || '').trim();
      if (!ex) return flat || [];
      return (flat || []).filter(n => {
        const nm = String(n || '').trim();
        return nm && String(team_map[nm] || '').trim() !== ex;
      });
    }

    function get_pitcher_team_maps() {
      const sp_groups = build_pitcher_groups(year_lists);
      const rp_groups = Array.isArray(year_lists.pitchers_rp_by_team) ? year_lists.pitchers_rp_by_team : [];

      const sp_map = build_team_map_from_groups(sp_groups);
      const rp_map = build_team_map_from_groups(rp_groups);

      return { sp_groups, rp_groups, sp_map, rp_map };
    }

    function get_hitter_team_map() {
      const map_obj = (year_lists && year_lists.hitter_team_map && typeof year_lists.hitter_team_map === 'object')
        ? year_lists.hitter_team_map
        : {};
      return map_obj;
    }

    async function render_many(paths, opts) {
      await render_fragments(paths.filter(Boolean), opts);
    }

    if (mode === 'projected_pitchers') {
      const day_obj = make_select('matchups_proj_day', 'Day');
      set_select_options(day_obj.sel, ['Today', 'Tomorrow', '+2 days', '+3 days', '+4 days'], 'Select');

      form_root.appendChild(day_obj.wrap);

      day_obj.sel.value = 'Today';
      let projected_req_id = 0;
      sync_select_placeholder_class(day_obj.sel);

      function day_offset_from_label(v) {
        const s = String(v || '').trim();
        if (s === 'Today') return 0;
        if (s === 'Tomorrow') return 1;
        const m = s.match(/^\+(\d+)\s*days?$/i);
        if (m) return Number(m[1]) || 0;
        return 0;
      }

async function submit() {
  const req_id = ++projected_req_id;

  clear_results();

  if (!preferred_year) return;

  const offset = day_offset_from_label(day_obj.sel.value);

  const projected_date = add_days_local(new Date(), offset);
  const date_str = to_yyyy_mm_dd_local(projected_date);

  const cur_year = (Array.isArray(years) && years.length)
    ? (years.includes(String(preferred_year)) ? String(preferred_year) : String(years[0]))
    : String(preferred_year);

  const y = cur_year;

  try {
    const probables = await fetch_probable_pitchers_for_date(date_str);

    // If another submit started while we were waiting, bail.
    if (req_id !== projected_req_id) return;

    const resolved = [];
    for (const p of probables) {
      const p_key = safe_page_filename(p.pitcher);
      const t_key = safe_page_filename(p.opp);

      function side_aliases(side) {
        const s = String(side || '').trim();
        if (s === 'Away') return ['Away', '@'];
        if (s === 'Home') return ['Home', 'vs', 'VS'];
        return [s];
      }

      function opposite_side(side) {
        const s = String(side || '').trim();
        if (s === 'Away') return 'Home';
        if (s === 'Home') return 'Away';
        return '';
      }

      let path = null;

      for (const s2 of side_aliases(p.side)) {
        path = resolve_fragment(idx, y, 'sp_vs_team', [p_key, s2, t_key]);
        if (path) break;
      }

      if (!path) {
        const other = opposite_side(p.side);
        for (const s2 of side_aliases(other)) {
          path = resolve_fragment(idx, y, 'sp_vs_team', [p_key, s2, t_key]);
          if (path) break;
        }
      }

      if (!path) continue;

      resolved.push({
        team: p.team,
        opp: p.opp,
        side: p.side,
        pitcher: p.pitcher,
        path,
      });
    }

    const ordered = sort_projected_rows(resolved);

    const seen = new Set();
    const paths = [];
    for (const row of ordered) {
      if (seen.has(row.path)) continue;
      seen.add(row.path);
      paths.push(row.path);
    }

    if (!paths.length) {
      results_root.innerHTML = `<div style='padding:10px;color:rgba(96,103,112,0.95);'>No matchup fragments found for ${date_str}.</div>`;
      return;
    }

    // If another submit started while we were resolving, bail.
    if (req_id !== projected_req_id) return;

    await render_many(paths);
  } catch (e) {
    dbg('projected_pitchers submit error', e);
  }
}

      function clear_mode() {
        clear_results();
        day_obj.sel.value = 'Today';
        sync_select_placeholder_class(day_obj.sel);
      }

      const btns = build_action_buttons(submit, clear_mode, 'Load');

      const cutoff_mmdd = 410; // Apr 10
      const disclaimer = document.createElement('div');
      disclaimer.id = 'matchups_proj_disclaimer';
      disclaimer.textContent = 'Using 2025 season data until enough PA/IP are accrued';
      disclaimer.style.fontSize = '12px';
      disclaimer.style.fontWeight = '600';
      disclaimer.style.color = 'rgba(96,103,112,0.95)';
      disclaimer.style.marginLeft = '10px';
      disclaimer.style.display = 'none';

      btns.wrap.appendChild(disclaimer);
      function update_disclaimer_for_date(d) {
        const el = document.getElementById('matchups_proj_disclaimer');
        if (!el) return;
        el.style.display = (mmdd_key_local(d) < cutoff_mmdd) ? '' : 'none';
      }

      function refresh_mode_options() {
        clear_mode();
      }

      // year_sel.addEventListener('change', refresh_mode_options);
      return;
    }

    if (mode === 'multi_starter') {
      const rows = [];

      function add_row(i) {
        const row_div = document.createElement('div');
        row_div.style.display = 'flex';
        row_div.style.flexWrap = 'wrap';
        row_div.style.gap = '8px';
        row_div.style.alignItems = 'flex-end';

        const pitcher_obj = make_select(`matchups_pitcher_${i}`, `Pitcher ${i + 1}`);
        set_grouped_or_flat(pitcher_obj.sel, year_lists.pitchers_sp_by_team, year_lists.pitchers_sp, 'Select starter');

        const side_obj = build_side_select(`matchups_side_${i}`);

        const team_obj = make_select(`matchups_team_${i}`, 'Opp');

        function refresh_team_for_row() {
          const { sp_map } = get_pitcher_team_maps();
          const p_team = sp_map[String(pitcher_obj.sel.value || '').trim()] || '';
          const allowed_teams = p_team ? teams.filter(t => String(t) !== String(p_team)) : teams;

          set_select_options(team_obj.sel, allowed_teams, 'Select team');

          if (p_team && String(team_obj.sel.value || '').trim() === String(p_team)) {
            team_obj.sel.value = '';
          }
          sync_select_placeholder_class(team_obj.sel);
        }

        pitcher_obj.sel.addEventListener('change', () => {
          refresh_team_for_row();
          clear_results();
        });

        refresh_team_for_row();

        row_div.appendChild(pitcher_obj.wrap);
        row_div.appendChild(side_obj.wrap);
        row_div.appendChild(team_obj.wrap);

        form_root.appendChild(row_div);

        const saved = (multi_form_state.multi_starter.rows && multi_form_state.multi_starter.rows[i])
          ? multi_form_state.multi_starter.rows[i]
          : null;

        if (saved) {
          pitcher_obj.sel.value = saved.pitcher || '';
          side_obj.sel.value = saved.side || '';
          refresh_team_for_row();
          team_obj.sel.value = saved.team || '';
          sync_select_placeholder_class(pitcher_obj.sel);
          sync_select_placeholder_class(side_obj.sel);
          sync_select_placeholder_class(team_obj.sel);
        }

        rows.push({ p_sel: pitcher_obj.sel, s_sel: side_obj.sel, t_sel: team_obj.sel });
      }

      const st = multi_form_state.multi_starter;
      const n = clamp_rows_n(st.n);
      st.n = n;

      for (let i = 0; i < n; i++) add_row(i);

      const side_toggle = document.createElement('div');
      side_toggle.style.display = 'flex';
      side_toggle.style.gap = '8px';
      side_toggle.style.margin = '10px 0 6px 0';
      side_toggle.style.alignItems = 'center';

      const away_btn = document.createElement('button');
      away_btn.type = 'button';
      away_btn.className = 'matchups_submit';
      away_btn.textContent = 'Away';

      const home_btn = document.createElement('button');
      home_btn.type = 'button';
      home_btn.className = 'matchups_submit';
      home_btn.textContent = 'Home';

      function set_all_sides(v) {
        rows.forEach(r => {
          r.s_sel.value = v;
          sync_select_placeholder_class(r.s_sel);
        });
        clear_results();
      }

      away_btn.addEventListener('click', (e) => {
        e.preventDefault();
        set_all_sides('Away');
      });

      home_btn.addEventListener('click', (e) => {
        e.preventDefault();
        set_all_sides('Home');
      });

      side_toggle.appendChild(away_btn);
      side_toggle.appendChild(home_btn);

      form_root.insertBefore(side_toggle, form_root.firstChild.nextSibling);

      async function submit() {
        snapshot_multi_state('multi_starter');

        const y = year_sel.value;
        if (!y) return;

        const paths = rows
          .filter(r => r.p_sel.value && r.s_sel.value && r.t_sel.value)
          .map(r => {
            const p_key = safe_page_filename(r.p_sel.value);
            const s = r.s_sel.value;
            const t_key = safe_page_filename(r.t_sel.value);
                        function side_aliases(side) {
              const ss = String(side || '').trim();
              if (ss === 'Away') return ['Away', '@'];
              if (ss === 'Home') return ['Home', 'vs', 'VS'];
              return [ss];
            }

            function opposite_side(side) {
              const ss = String(side || '').trim();
              if (ss === 'Away') return 'Home';
              if (ss === 'Home') return 'Away';
              return '';
            }

            let path = null;

            // Try expected side first (with aliases)
            for (const s2 of side_aliases(s)) {
              path = resolve_fragment(idx, y, 'sp_vs_team', [p_key, s2, t_key]);
              if (path) break;
            }

            // If missing, assume PF-identical single fragment and try the opposite side
            if (!path) {
              const other = opposite_side(s);
              for (const s2 of side_aliases(other)) {
                path = resolve_fragment(idx, y, 'sp_vs_team', [p_key, s2, t_key]);
                if (path) break;
              }
            }

            return path;
          })
          .filter(Boolean);

        const seen = new Set();
        const uniq = [];
        for (const p of paths) {
          if (seen.has(p)) continue;
          seen.add(p);
          uniq.push(p);
        }

        await render_many(uniq);
      }

      function clear_mode() {
        clear_results();
        multi_form_state.multi_starter.rows = [];
        multi_form_state.multi_starter.n = 1;
        sync_row_controls();
        build_form();
      }

      build_action_buttons(submit, clear_mode);
      return;
    }

    if (mode === 'multi_hitter') {
      const rows = [];

      function refresh_row_pitchers(row) {
        const allowed = allowed_pitchers_for_hitter_side(year_lists, row.h_sel.value, row.s_sel.value);
        const base_groups = build_pitcher_groups(year_lists);

        rebuild_select_keep_value(row.p_sel, () => {
          if (allowed) {
            const filtered_groups = filter_groups_to_allowed(base_groups, allowed);

            if (filtered_groups.length) {
              set_grouped_or_flat(row.p_sel, filtered_groups, [], 'Select pitcher');
            } else {
              const flat = pitchers.filter(p => allowed.has(String(p)));
              set_grouped_or_flat(row.p_sel, [], flat, 'Select pitcher');
            }
          } else {
            set_grouped_or_flat(row.p_sel, base_groups, pitchers, 'Select pitcher');
          }
        });
      }

      function add_row(i) {
        const row_div = document.createElement('div');
        row_div.style.display = 'flex';
        row_div.style.flexWrap = 'wrap';
        row_div.style.gap = '8px';
        row_div.style.alignItems = 'flex-end';

        const { wrap: h_wrap, sel: h_sel } = make_select(`matchups_hitter_${i}`, `Hitter ${i + 1}`);
        set_grouped_or_flat(h_sel, year_lists.hitters_by_team, hitters, 'Select hitter');

        const { wrap: s_wrap, sel: s_sel } = make_select(`matchups_side_${i}`, 'Away/Home');
        set_select_options(s_sel, ['Away', 'Home'], 'Select');

        const { wrap: p_wrap, sel: p_sel } = make_select(`matchups_pitcher_${i}`, 'Pitcher');
        const pitcher_groups = build_pitcher_groups(year_lists);
        set_grouped_or_flat(p_sel, pitcher_groups, pitchers, 'Select pitcher');

        row_div.appendChild(h_wrap);
        row_div.appendChild(s_wrap);
        row_div.appendChild(p_wrap);

        form_root.appendChild(row_div);

        const row = { h_sel, s_sel, p_sel };
        rows.push(row);

        h_sel.addEventListener('change', () => {
          refresh_row_pitchers(row);
          clear_results();
        });

        s_sel.addEventListener('change', () => {
          refresh_row_pitchers(row);
          clear_results();
        });

        const saved = (multi_form_state.multi_hitter.rows && multi_form_state.multi_hitter.rows[i])
          ? multi_form_state.multi_hitter.rows[i]
          : null;

        if (saved) {
          row.h_sel.value = saved.hitter || '';
          row.s_sel.value = saved.side || '';
          refresh_row_pitchers(row);
          row.p_sel.value = saved.pitcher || '';
          sync_select_placeholder_class(row.h_sel);
          sync_select_placeholder_class(row.s_sel);
          sync_select_placeholder_class(row.p_sel);
        }
      }

      const st = multi_form_state.multi_hitter;
      const n = clamp_rows_n(st.n);
      st.n = n;

      for (let i = 0; i < n; i++) add_row(i);

      const side_toggle = document.createElement('div');
      side_toggle.style.display = 'flex';
      side_toggle.style.gap = '8px';
      side_toggle.style.margin = '10px 0 6px 0';
      side_toggle.style.alignItems = 'center';

      const away_btn = document.createElement('button');
      away_btn.type = 'button';
      away_btn.className = 'matchups_submit';
      away_btn.textContent = 'Away';

      const home_btn = document.createElement('button');
      home_btn.type = 'button';
      home_btn.className = 'matchups_submit';
      home_btn.textContent = 'Home';

      function set_all_sides(v) {
        rows.forEach(r => {
          r.s_sel.value = v;
          sync_select_placeholder_class(r.s_sel);
          refresh_row_pitchers(r);
        });
        clear_results();
      }

      away_btn.addEventListener('click', (e) => {
        e.preventDefault();
        set_all_sides('Away');
      });

      home_btn.addEventListener('click', (e) => {
        e.preventDefault();
        set_all_sides('Home');
      });

      side_toggle.appendChild(away_btn);
      side_toggle.appendChild(home_btn);

      form_root.insertBefore(side_toggle, form_root.firstChild.nextSibling);

      async function submit() {
        snapshot_multi_state('multi_hitter');

        const y = year_sel.value;
        if (!y) return;

        const paths = rows
          .filter(r => r.h_sel.value && r.s_sel.value && r.p_sel.value)
          .map(r => {
            const h_key = safe_page_filename(r.h_sel.value);
            const p_key = safe_page_filename(r.p_sel.value);
                        function side_aliases(side) {
              const ss = String(side || '').trim();
              if (ss === 'Away') return ['Away', '@'];
              if (ss === 'Home') return ['Home', 'vs', 'VS'];
              return [ss];
            }

            function opposite_side(side) {
              const ss = String(side || '').trim();
              if (ss === 'Away') return 'Home';
              if (ss === 'Home') return 'Away';
              return '';
            }

            const side = r.s_sel.value;
            let path = null;

            for (const s2 of side_aliases(side)) {
              path = resolve_fragment(idx, y, 'hitter_vs_pitcher', [h_key, s2, p_key]);
              if (path) break;
            }

            if (!path) {
              const other = opposite_side(side);
              for (const s2 of side_aliases(other)) {
                path = resolve_fragment(idx, y, 'hitter_vs_pitcher', [h_key, s2, p_key]);
                if (path) break;
              }
            }

            return path;
          })
          .filter(Boolean);

        const seen = new Set();
        const uniq = [];
        for (const p of paths) {
          if (seen.has(p)) continue;
          seen.add(p);
          uniq.push(p);
        }

        await render_many(uniq);
      }

      function clear_mode() {
        clear_results();
        multi_form_state.multi_hitter.rows = [];
        multi_form_state.multi_hitter.n = 1;
        sync_row_controls();
        build_form();
      }

      build_action_buttons(submit, clear_mode);
      return;
    }

    if (mode === 'rp_inning') {
      const pitcher_obj = make_select('matchups_pitcher', 'Pitcher');
      set_grouped_or_flat(
        pitcher_obj.sel,
        year_lists.pitchers_rp_by_team,
        year_lists.pitchers_rp,
        'Select reliever'
      );
      const pitcher_sel = pitcher_obj.sel;

      const side_obj = build_side_select('matchups_side');
      const side_sel = side_obj.sel;

      const { wrap: b1_wrap, sel: b1_sel } = make_select('matchups_b1', 'Batter 1');
      const { wrap: b2_wrap, sel: b2_sel } = make_select('matchups_b2', 'Batter 2');
      const { wrap: b3_wrap, sel: b3_sel } = make_select('matchups_b3', 'Batter 3');

      function hitters_for_team(team) {
        const t = String(team || '').trim();
        if (!t) return hitters;

        const g = (year_lists.hitters_by_team || []).find(x => String(x.label || '').trim() === t);
        const opts = g ? (g.options || []) : [];
        return opts.length ? opts : hitters;
      }

      function refresh_hitters_excluding_rp_team() {
        const { rp_map } = get_pitcher_team_maps();
        const rp_team = rp_map[String(pitcher_sel.value || '').trim()] || '';

        const hitter_groups = Array.isArray(year_lists.hitters_by_team) ? year_lists.hitters_by_team : [];
        const groups_ok = rp_team ? filter_groups_excluding_team(hitter_groups, rp_team) : hitter_groups;

        const hitter_team_map = get_hitter_team_map();
        const flat_ok = rp_team ? filter_flat_excluding_team(hitters, hitter_team_map, rp_team) : hitters;

        set_grouped_or_flat(b1_sel, groups_ok, flat_ok, 'Select batter');
        set_grouped_or_flat(b2_sel, groups_ok, flat_ok, 'Select batter');
        set_grouped_or_flat(b3_sel, groups_ok, flat_ok, 'Select batter');

        b1_sel.value = '';
        b2_sel.value = '';
        b3_sel.value = '';

        sync_select_placeholder_class(b1_sel);
        sync_select_placeholder_class(b2_sel);
        sync_select_placeholder_class(b3_sel);
      }

      refresh_hitters_excluding_rp_team();

      pitcher_sel.addEventListener('change', () => {
        refresh_hitters_excluding_rp_team();
        clear_results();
      });

      function apply_same_team_filter() {
        const map_obj = (year_lists && year_lists.hitter_team_map && typeof year_lists.hitter_team_map === 'object')
          ? year_lists.hitter_team_map
          : {};

        const b1 = String(b1_sel.value || '').trim();
        const prev_b2 = String(b2_sel.value || '').trim();
        const prev_b3 = String(b3_sel.value || '').trim();

        const team = b1 ? (map_obj[b1] || '') : '';
        const base_allowed = team ? hitters_for_team(team) : hitters;

        const allowed_b2 = base_allowed.filter(x => x !== b1);
        const allowed_b3 = base_allowed.filter(x => x !== b1 && x !== prev_b2);

        set_grouped_or_flat(b2_sel, [], allowed_b2, 'Select batter');
        set_grouped_or_flat(b3_sel, [], allowed_b3, 'Select batter');

        if (prev_b2 && allowed_b2.includes(prev_b2)) b2_sel.value = prev_b2;
        else b2_sel.value = '';

        const b2_now = String(b2_sel.value || '').trim();
        const allowed_b3_final = base_allowed.filter(x => x !== b1 && x !== b2_now);
        set_grouped_or_flat(b3_sel, [], allowed_b3_final, 'Select batter');

        if (prev_b3 && allowed_b3_final.includes(prev_b3)) b3_sel.value = prev_b3;
        else b3_sel.value = '';

        sync_select_placeholder_class(b2_sel);
        sync_select_placeholder_class(b3_sel);
      }

      b1_sel.addEventListener('change', () => {
        apply_same_team_filter();
        clear_results();
      });

      b2_sel.addEventListener('change', () => {
        apply_same_team_filter();
        clear_results();
      });

      b3_sel.addEventListener('change', () => {
        clear_results();
      });

      apply_same_team_filter();

      append_row(form_root, [
        { wrap: pitcher_obj.wrap, sel: pitcher_sel },
        side_obj,
      ]);

      form_root.appendChild(b1_wrap);
      form_root.appendChild(b2_wrap);
      form_root.appendChild(b3_wrap);

      async function submit() {
        const y = year_sel.value;
        const p = pitcher_sel.value;
        const s = side_sel.value;
        const b1 = b1_sel.value;
        const b2 = b2_sel.value;
        const b3 = b3_sel.value;

        if (!y || !p || !s || !b1 || !b2 || !b3) return;

        const p_key = safe_page_filename(p);

        function side_aliases(side) {
          const ss = String(side || '').trim();
          if (ss === 'Away') return ['Away', '@'];
          if (ss === 'Home') return ['Home', 'vs', 'VS'];
          return [ss];
        }

        function opposite_side(side) {
          const ss = String(side || '').trim();
          if (ss === 'Away') return 'Home';
          if (ss === 'Home') return 'Away';
          return '';
        }

        function resolve_hvp_with_pf_fallback(hitter_name) {
          const h_key = safe_page_filename(hitter_name);
          let path = null;

          for (const s2 of side_aliases(s)) {
            path = resolve_fragment(idx, y, 'hitter_vs_pitcher', [h_key, s2, p_key]);
            if (path) break;
          }

          if (!path) {
            const other = opposite_side(s);
            for (const s2 of side_aliases(other)) {
              path = resolve_fragment(idx, y, 'hitter_vs_pitcher', [h_key, s2, p_key]);
              if (path) break;
            }
          }

          return path;
        }

        const paths = [
          resolve_hvp_with_pf_fallback(b1),
          resolve_hvp_with_pf_fallback(b2),
          resolve_hvp_with_pf_fallback(b3),
        ];

        await render_many(paths, { invert_stats: true });
      }

      function clear_mode() {
        clear_results();

        pitcher_sel.value = '';
        side_sel.value = '';
        b1_sel.value = '';
        b2_sel.value = '';
        b3_sel.value = '';

        sync_select_placeholder_class(pitcher_sel);
        sync_select_placeholder_class(side_sel);
        sync_select_placeholder_class(b1_sel);
        sync_select_placeholder_class(b2_sel);
        sync_select_placeholder_class(b3_sel);

        refresh_hitters_excluding_rp_team();
        apply_same_team_filter();
      }

      build_action_buttons(submit, clear_mode);
      return;
    }
  }

  mode_select.addEventListener('change', () => {
    snapshot_multi_state(mode_select.value);
    sync_row_controls();
    build_form();
  });

  build_form();
}

/*#################################################################### A.5) Stat glossary popovers ####################################################################*/

const stat_glossary = {
  // Fill these in over time; keys should match data-stat values in HTML
  score: {
    title: 'Score',
    body: 'Contact, counting stats, discipline, and pitch score all wrapped up.',
  },
  all_pitches: {
    title: 'All Pitches',
    body: 'All Pitches Average. Scoring system similar to Score but per individual pitch.',
  },
  whiff_pct: {
    title: 'Whiff%',
    body: 'Whiff rate: Swings and Misses / Swings.',
  },
  csw_pct: {
    title: 'CSW%',
    body: 'Called Strikes + Whiffs / Pitches',
  },
  p_ipa: {
    title: 'P/PA',
    body: 'Pitches per Plate Appearance.',
  },
  sweet_spot_pct: {
    title: 'SwSp%',
    body: 'Sweet Spot %: typically balls hit between ~8 and ~32 degrees',
  },
  good_pitches: {
    title: 'Good Pitches',
    body: 'Pitch score on good quality pitches.',
  },
  meatballs: {
    title: 'Meatballs',
    body: 'Pitch score on bad quality pitches.',
  },
  // pitchers
  pvelo: {
    title: 'Velo',
    body: 'Perceived velocity',
  },
  swstr_pct: {
    title: 'SwStr%',
    body: 'Swings and Misses / Pitches.',
  },
  strike_pct: {
    title: 'Strike%',
    body: 'Percentage of pitches that are strikes',
  },
};

let stat_popover_nodes = null;

function escape_html(s) {
  return String(s || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function wrap_paragraphs(text) {
  const parts = String(text || '').split('\n').map(x => x.trim()).filter(Boolean);
  if (!parts.length) return '<p>No description found.</p>';
  return parts.map(x => `<p>${escape_html(x)}</p>`).join('');
}

function stat_popover_on_keydown(e) {
  if (e.key === 'Escape') remove_stat_popover();
}

function remove_stat_popover() {
  if (!stat_popover_nodes) return;
  stat_popover_nodes.backdrop.remove();
  stat_popover_nodes.popover.remove();
  stat_popover_nodes = null;
  document.removeEventListener('keydown', stat_popover_on_keydown, true);
}

function build_stat_popover_html(defn, stat_key) {
  const title = defn?.title || stat_key || 'Stat';
  const body = defn?.body || 'No description found.';

  return `
    <div class='stat_popover_header'>
      <div class='stat_popover_title'>${escape_html(title)}</div>
      <button type='button' class='stat_popover_close' aria-label='Close'>×</button>
    </div>
    <div class='stat_popover_body'>
      ${wrap_paragraphs(body)}
    </div>
  `;
}

function place_popover_near_anchor(popover_el, anchor_el) {
  const pad = 10;
  const r = anchor_el.getBoundingClientRect();
  const pr = popover_el.getBoundingClientRect();

  let left = r.left;
  let top = r.bottom + 8;

  left = Math.min(left, window.innerWidth - pr.width - pad);
  left = Math.max(left, pad);

  if (top + pr.height + pad > window.innerHeight) {
    top = r.top - pr.height - 8;
  }
  top = Math.max(top, pad);

  popover_el.style.left = `${Math.round(left)}px`;
  popover_el.style.top = `${Math.round(top)}px`;
}

function show_stat_popover(anchor_el, stat_key) {
  remove_stat_popover();

  const defn = stat_glossary[stat_key] || { title: stat_key, body: 'No description found.' };

  const backdrop = document.createElement('div');
  backdrop.className = 'stat_popover_backdrop';

  const popover = document.createElement('div');
  popover.className = 'stat_popover';
  popover.setAttribute('role', 'dialog');
  popover.setAttribute('aria-modal', 'true');
  popover.innerHTML = build_stat_popover_html(defn, stat_key);

  document.body.appendChild(backdrop);
  document.body.appendChild(popover);

  place_popover_near_anchor(popover, anchor_el);

  stat_popover_nodes = { backdrop, popover };

  const on_reflow = () => {
    if (!stat_popover_nodes) return;
    place_popover_near_anchor(popover, anchor_el);
  };

  const cleanup = () => {
    window.removeEventListener('resize', on_reflow);
    window.removeEventListener('scroll', on_reflow, true);
    document.removeEventListener('keydown', stat_popover_on_keydown, true);
    remove_stat_popover();
  };

  backdrop.addEventListener('click', cleanup, { passive: true });
  popover.querySelector('.stat_popover_close').addEventListener('click', cleanup);

  window.addEventListener('resize', on_reflow, { passive: true });
  window.addEventListener('scroll', on_reflow, { passive: true, capture: true });

  document.addEventListener('keydown', stat_popover_on_keydown, true);
}

function install_stat_glossary_popovers() {
  document.addEventListener('click', (e) => {
    const el = e.target.closest('.stat_key[data-stat]');
    if (!el) return;

    e.preventDefault();
    e.stopPropagation();

    const stat_key = el.getAttribute('data-stat');
    if (!stat_key) return;

    show_stat_popover(el, stat_key);
  });
}

function normalize_stat_label(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[%]/g, ' pct')
    .replace(/[^a-z0-9 ]+/g, '');
}

function parse_json_dataset(s) {
  try {
    return JSON.parse(String(s || ''));
  } catch {
    return null;
  }
}

function stat_key_from_label(plot_el, label_text) {
  const lbl = String(label_text || '').trim();
  if (!lbl) return null;

  const map = parse_json_dataset(plot_el?.dataset?.labelToStat);
  if (map && map[lbl]) return map[lbl];

  // Optional fallback if a plot didn’t get a mapping for some reason
  const norm = normalize_stat_label(lbl);

  if (norm === 'velo' || norm === 'pvelocity') return 'pvelo';
  if (norm === 'cs whiffs pct' || norm === 'csw pct') return 'csw_pct';
  if (norm === 'whiff pct') return 'whiff_pct';
  if (norm === 'swstr pct') return 'swstr_pct';
  if (norm === 'strike pct') return 'strike_pct';
  if (norm === 'swsp pct' || norm === 'sweet spot pct') return 'sweet_spot_pct';
  if (norm === 'ppa' || norm === 'ppa pitchespa' || norm === 'pppa') return 'p_ipa';

  return null;
}

function install_plotly_tick_popovers(root) {
  const scope = root || document;

  // Plotly charts end up as <div class="js-plotly-plot"> ... <svg> ...
  const plots = Array.from(scope.querySelectorAll('.js-plotly-plot'));
  plots.forEach(plot => {
    // Avoid re-binding
    if (plot.dataset.tick_popovers_inited === '1') return;
    plot.dataset.tick_popovers_inited = '1';

    function bind_once() {
      // y-axis tick labels are SVG <text> nodes under g.ytick
      const ticks = plot.querySelectorAll('g.ytick text, g.yaxislayer-above text');
      ticks.forEach(tn => {
        if (!tn || tn.dataset.pop_bound === '1') return;

        const raw = (tn.textContent || '').trim();
        const k = stat_key_from_label(plot, raw);
        if (!k) return;

        tn.dataset.pop_bound = '1';
        tn.style.cursor = 'pointer';

        tn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          show_stat_popover(tn, k);
        });
      });
    }

    // Bind after Plotly renders (covers first render + relayouts)
    plot.on?.('plotly_afterplot', bind_once);
    plot.on?.('plotly_relayout', bind_once);

    // Also try immediately in case it’s already rendered
    bind_once();
  });
}

/*#################################################################### I) DOMContentLoaded wiring (events + initial state) ####################################################################*/
document.addEventListener('DOMContentLoaded', () => {
  const toggle_sidebar_btn = document.getElementById('toggle_sidebar');
  const is_touch_mobile = window.matchMedia('(max-width: 900px) and (pointer: coarse)').matches;
  if (toggle_sidebar_btn && !is_touch_mobile) toggle_sidebar_btn.style.display = 'none';

  install_stat_glossary_popovers();
  install_plotly_tick_popovers(document);
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

  document.querySelectorAll('.team_block').forEach(tb => {
    const team = tb.dataset.team || '';
    const collapsed = read_collapsed(team_storage_key(team), true);
    set_team_collapsed(team, collapsed);
  });

  document.querySelectorAll('.division_block').forEach(db => {
    const div_id = db.dataset.division || '';
    const collapsed = read_collapsed(division_storage_key(div_id), false);
    set_division_collapsed(div_id, collapsed);
  });

  document.querySelectorAll('.role_tab').forEach(btn => {
    btn.addEventListener('click', () => {
      set_team_role_tab(btn.dataset.team, btn.dataset.role);
    });
  });

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

  window.addEventListener('resize', apply_mobile_scale);
  apply_mobile_scale();

  on_hash_change();
  apply_search_and_filters((search && search.value) ? search.value : '');
});