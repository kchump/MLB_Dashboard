

/* ===== visualization.js ===== */

/*#################################################################### Globals and general functions ####################################################################*/
const page_cache = new Map();
let year_page_lookup = null;
let active_content_file = '';
let active_page_id = '';
const year_fallback_notice_by_page = new Map(); // page_id -> { last_played_year }
let retired_players_set = new Set();
const fantasy_year_cache = new Map();
const favorites_storage_key = 'mlb_dash_favorites';
const watchlist_storage_key = 'mlb_dash_watchlist';
/* ################# */
function get_stored_people(storage_key) {
  try {
    const raw = localStorage.getItem(storage_key);
    if (!raw) return new Set();

    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return new Set();

    return new Set(arr.map(x => String(x || '').trim()).filter(Boolean));
  } catch (e) {
    return new Set();
  }
}
/* ################# */
function save_stored_people(storage_key, values) {
  try {
    localStorage.setItem(storage_key, JSON.stringify(Array.from(values)));
  } catch (e) {}
}
/* ################# */
function get_favorites() {
  return get_stored_people(favorites_storage_key);
}
/* ################# */
function get_watchlist() {
  return get_stored_people(watchlist_storage_key);
}
/* ################# */
// function sidebar_entity_key_from_values(person_key, page_id) {
//   const pk = String(person_key || '').trim();
//   const pid = String(page_id || '').trim();
//   if (!pk || !pid) return '';
//   return `${pk}__${pid}`;
// }
// /* ################# */
// function sidebar_entity_key_from_link(a) {
//   if (!a) return '';
//   return sidebar_entity_key_from_values(a.dataset.person_key, a.dataset.page);
// }
function sidebar_entity_key_from_values(person_key, page_id) {
  const pid = String(page_id || '').trim();
  if (!pid) return '';
  return pid;
}
/* ################# */
function sidebar_entity_key_from_link(a) {
  if (!a) return '';
  return String(a.dataset.page || '').trim();
}
/* ################# */
function toggle_stored_person(storage_key, entity_key) {
  const key = String(entity_key || '').trim();
  if (!key) return false;

  const values = get_stored_people(storage_key);

  if (values.has(key)) {
    values.delete(key);
    save_stored_people(storage_key, values);
    return false;
  }

  values.add(key);
  save_stored_people(storage_key, values);
  return true;
}
/* ################# */
function toggle_favorite_person(entity_key) {
  return toggle_stored_person(favorites_storage_key, entity_key);
}
/* ################# */
function toggle_watchlist_person(entity_key) {
  return toggle_stored_person(watchlist_storage_key, entity_key);
}
/* ################# */
function bind_toc_link_clicks(scope) {
  const root = scope || document;

  root.querySelectorAll('.toc_link').forEach(a => {
    if (a.dataset.click_bound === '1') return;
    a.dataset.click_bound = '1';

    const page_id = a.dataset.page;
    const file = a.dataset.file;
    if (!page_id || !file) return;

    a.addEventListener('click', (e) => {
      e.preventDefault();
      activate_page(page_id);
    });
  });
}
/* ################# */
function update_sidebar_custom_icons(root) {
  const scope = root || document;
  const favorites = get_favorites();
  const watchlist = get_watchlist();

  scope.querySelectorAll('.toc_link[data-person_key]').forEach(a => {
    const entity_key = sidebar_entity_key_from_link(a);
    if (!entity_key) return;

    let fav_icon = a.querySelector(':scope > .fav_icon');
    if (!fav_icon) {
      fav_icon = document.createElement('span');
      fav_icon.className = 'fav_icon';
      fav_icon.setAttribute('aria-hidden', 'true');
      fav_icon.textContent = '★';
      a.appendChild(fav_icon);
    }

    let watch_icon = a.querySelector(':scope > .watch_icon');
    if (!watch_icon) {
      watch_icon = document.createElement('span');
      watch_icon.className = 'watch_icon';
      watch_icon.setAttribute('aria-hidden', 'true');
      watch_icon.textContent = '✓';
      a.appendChild(watch_icon);
    }

    fav_icon.classList.toggle('active', favorites.has(entity_key));
    watch_icon.classList.toggle('active', watchlist.has(entity_key));
  });
}
/* ################# */
function render_custom_sidebar_list(list_id, empty_id, people_set) {
  const list = document.getElementById(list_id);
  const empty = document.getElementById(empty_id);
  if (!list) return;

  list.innerHTML = '';

  const seen = new Set();

  function get_last_name_sort_key(a) {
    const name = String(a?.dataset?.name || a?.textContent || '').trim();
    if (!name) return '';

    const parts = name.split(/\s+/).filter(Boolean);
    if (!parts.length) return '';

    return parts[parts.length - 1].toLowerCase();
  }

  function get_full_name_sort_key(a) {
    return String(a?.dataset?.name || a?.textContent || '').trim().toLowerCase();
  }

  function get_pos_sort_key(a) {
    const pos_order = {
      'C': 1,
      '1B': 2,
      '2B': 3,
      '3B': 4,
      'SS': 5,
      'OF': 6,
      'DH': 7,
      'P': 8,
    };

    const role = String(a?.dataset?.role || '').trim().toLowerCase();
    if (role !== 'batters' && role !== 'hitters' && role !== 'hitter' && role !== 'lineup') {
      return 999;
    }

    const name = String(a?.dataset?.name || '').trim();
    const text = String(a?.textContent || '')
      .replace(/[★✓]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    const tail = name && text.toLowerCase().startsWith(name.toLowerCase())
      ? text.slice(name.length).trim()
      : text;

    const match = tail.match(/\b(C|1B|2B|3B|SS|OF|DH|SP|RP|P)(?:\/(C|1B|2B|3B|SS|OF|DH|SP|RP|P))?\b/i);
    if (!match) return 999;

    let primary_pos = String(match[1] || '').toUpperCase();

    if (primary_pos === 'SP' || primary_pos === 'RP') primary_pos = 'P';

    return pos_order[primary_pos] || 999;
  }

  function grouped_section_key(a) {
    const role = String(a?.dataset?.role || '').trim().toLowerCase();

    if (role === 'rotation' || role === 'sp' || role === 'starter' || role === 'starters') return 'Rotation';
    if (role === 'bullpen' || role === 'rp' || role === 'reliever' || role === 'relievers') return 'Bullpen';
    if (role === 'lineup' || role === 'batters' || role === 'hitters' || role === 'hitter') return 'Lineup';

    return 'Lineup';
  }

  const section_order = ['Rotation', 'Bullpen', 'Lineup'];
  const grouped = new Map(section_order.map(section => [section, []]));

  // const links = Array.from(document.querySelectorAll('.toc_link[data-person_key]'))
  //   .filter(a => !a.closest('.favorites_block') && !a.closest('.watchlist_block'))
  //   .filter(a => {
  //     const entity_key = sidebar_entity_key_from_link(a);
  //     const person_key = String(a.dataset.person_key || '').trim();
  //     const page = String(a.dataset.page || '').trim();
  //     const dedupe_key = `${entity_key}__${page}`;

  //     const matches_saved_key =
  //       (entity_key && people_set.has(entity_key)) ||
  //       (person_key && people_set.has(person_key));

  //     if (!entity_key || !page || !matches_saved_key || seen.has(dedupe_key)) return false;

  //     seen.add(dedupe_key);
  //     return true;
  //   });
  const links = Array.from(document.querySelectorAll('.toc_link[data-person_key]'))
    .filter(a => !a.closest('.favorites_block') && !a.closest('.watchlist_block'))
    .filter(a => {
      const entity_key = sidebar_entity_key_from_link(a);
      const page = String(a.dataset.page || '').trim();

      if (!entity_key || !page || !people_set.has(entity_key) || seen.has(page)) return false;

      seen.add(page);
      return true;
    });

  links.forEach(a => {
    const section = grouped_section_key(a);
    if (!grouped.has(section)) grouped.set(section, []);
    grouped.get(section).push(a);
  });

  let appended_player_count = 0;
  let appended_section_count = 0;

  section_order.forEach(section => {
    const items = grouped.get(section) || [];
    if (!items.length) return;

    items.sort((a, b) => {
      const a_role = String(a?.dataset?.role || '').trim().toLowerCase();
      const b_role = String(b?.dataset?.role || '').trim().toLowerCase();

      const a_pos_sort = get_pos_sort_key(a);
      const b_pos_sort = get_pos_sort_key(b);

      const a_is_hitter = a_pos_sort !== 999;
      const b_is_hitter = b_pos_sort !== 999;

      if (a_is_hitter && b_is_hitter) {
        const pos_cmp = a_pos_sort - b_pos_sort;
        if (pos_cmp !== 0) return pos_cmp;
      }

      const last_cmp = get_last_name_sort_key(a).localeCompare(get_last_name_sort_key(b));
      if (last_cmp !== 0) return last_cmp;

      const full_cmp = get_full_name_sort_key(a).localeCompare(get_full_name_sort_key(b));
      if (full_cmp !== 0) return full_cmp;

      return String(a.dataset.page || '').localeCompare(String(b.dataset.page || ''));
    });

    const section_nodes = [];

    items.forEach(a => {
      const li = a.closest('.player_li');
      if (!li) return;

      const clone = li.cloneNode(true);

      clone.style.display = '';
      clone.querySelectorAll('[style]').forEach(el => {
        if (el.style && el.style.display === 'none') {
          el.style.display = '';
        }
      });

      section_nodes.push(clone);
    });

    if (!section_nodes.length) return;

    if (appended_section_count > 0 && (section === 'Bullpen' || section === 'Lineup')) {
      const spacer = document.createElement('div');
      spacer.className = 'custom_sidebar_section_spacer';
      spacer.style.height = '8px';
      list.appendChild(spacer);
    }

    const header = document.createElement('div');
    header.className = 'sub_role_label';
    header.textContent = section;
    list.appendChild(header);

    section_nodes.forEach(node => list.appendChild(node));

    appended_player_count += section_nodes.length;
    appended_section_count += 1;
  });

  if (empty) {
    empty.style.display = appended_player_count ? 'none' : '';
  }

  bind_toc_link_clicks(list);
  update_sidebar_custom_icons(list);
}
/* ################# */
function render_favorites_sidebar() {
  render_custom_sidebar_list('favorites_list', 'favorites_empty', get_favorites());
}
/* ################# */
function render_watchlist_sidebar() {
  render_custom_sidebar_list('watchlist_list', 'watchlist_empty', get_watchlist());
}
/* ################# */
function current_page_person_key() {
  const active = document.querySelector('.toc_link.active[data-person_key]');
  if (active) return String(active.dataset.person_key || '').trim();

  const year_buttons = document.querySelector('#content_root .year_buttons[data-person_key]');
  if (year_buttons) return String(year_buttons.dataset.person_key || '').trim();

  return '';
}
/* ################# */
function current_page_storage_key() {
  const active = document.querySelector('.toc_link.active[data-person_key][data-page]');
  if (active) return sidebar_entity_key_from_link(active);

  const year_buttons = document.querySelector('#content_root .year_buttons[data-person_key]');
  if (!year_buttons) return '';

  const person_key = String(year_buttons.dataset.person_key || '').trim();
  const page_id = String(active_page_id || '').trim();

  return sidebar_entity_key_from_values(person_key, page_id);
}
/* ################# */
/* ################# */
function sync_player_page_action_buttons() {
  const content = document.getElementById('content_root');
  if (!content) return;

  const header = content.querySelector('.player_header');
  if (!header) return;

  const person_key = current_page_person_key();
  const storage_key = current_page_storage_key();
  if (!person_key || !storage_key) return;

  let actions_row = content.querySelector('.player_header_actions');
  if (!actions_row) {
    actions_row = document.createElement('div');
    actions_row.className = 'player_header_actions';
    header.insertAdjacentElement('afterend', actions_row);
  }

  let favorite_btn = actions_row.querySelector('.favorite_page_btn');
  if (!favorite_btn) {
    favorite_btn = document.createElement('button');
    favorite_btn.type = 'button';
    favorite_btn.className = 'favorite_page_btn';
    actions_row.appendChild(favorite_btn);
  }

  let watchlist_btn = actions_row.querySelector('.watchlist_page_btn');
  if (!watchlist_btn) {
    watchlist_btn = document.createElement('button');
    watchlist_btn.type = 'button';
    watchlist_btn.className = 'watchlist_page_btn';
    actions_row.appendChild(watchlist_btn);
  }

  const is_favorite = get_favorites().has(storage_key);
  const is_watchlist = get_watchlist().has(storage_key);

  favorite_btn.classList.toggle('active', is_favorite);
  favorite_btn.setAttribute('aria-pressed', is_favorite ? 'true' : 'false');
  favorite_btn.textContent = is_favorite ? '★ Favorite' : '☆ Favorite';

  watchlist_btn.classList.toggle('active', is_watchlist);
  watchlist_btn.setAttribute('aria-pressed', is_watchlist ? 'true' : 'false');
  watchlist_btn.textContent = is_watchlist ? '✓ Watchlist' : '+ Watchlist';

  if (favorite_btn.dataset.bound !== '1') {
    favorite_btn.dataset.bound = '1';
    favorite_btn.addEventListener('click', () => {
      const key = current_page_storage_key();
      if (!key) return;
      toggle_favorite_person(key);
      refresh_custom_player_lists_ui();
    });
  }

  if (watchlist_btn.dataset.bound !== '1') {
    watchlist_btn.dataset.bound = '1';
    watchlist_btn.addEventListener('click', () => {
      const key = current_page_storage_key();
      if (!key) return;
      toggle_watchlist_person(key);
      refresh_custom_player_lists_ui();
    });
  }
}
/* ################# */
function refresh_custom_player_lists_ui() {
  render_favorites_sidebar();
  render_watchlist_sidebar();
  update_sidebar_custom_icons(document);
  sync_player_page_action_buttons();

  const search = document.getElementById('player_search');
  apply_search_and_filters((search && search.value) ? search.value : '');
}
/* ################# */
async function load_fantasy_year(year) {
  const y = String(year || '').trim();
  if (!y) return null;

  if (fantasy_year_cache.has(y)) {
    return fantasy_year_cache.get(y);
  }

  try {
    const r = await fetch(`assets/fantasy_${y}.json`, { cache: 'no-store' });
    if (!r.ok) {
      fantasy_year_cache.set(y, null);
      return null;
    }

    // const data = await r.json();
    const text = await r.text();
    const safe_text = text
      .replace(/\b-Infinity\b/g, 'null')
      .replace(/\bInfinity\b/g, 'null')
      .replace(/\bInf\b/g, 'null')
      .replace(/\bNaN\b/g, 'null');

    const data = JSON.parse(safe_text);
    fantasy_year_cache.set(y, data);
    return data;
  } catch (e) {
    fantasy_year_cache.set(y, null);
    return null;
  }
}
/* ################# */
// function fantasy_role_section_priority(role) {
//   const r = String(role || '').trim().toLowerCase();

//   if (r === 'batters' || r === 'hitter' || r === 'hitters' || r === 'lineup') {
//     return ['batters', 'hitters', 'lineup'];
//   }

//   if (r === 'starters' || r === 'starter' || r === 'sp' || r === 'rotation') {
//     return ['starters', 'starter', 'sp', 'rotation', 'pitchers'];
//   }

//   if (r === 'bullpen' || r === 'relievers' || r === 'reliever' || r === 'rp') {
//     return ['bullpen', 'relievers', 'reliever', 'rp', 'pitchers'];
//   }

//   if (r === 'pitchers' || r === 'pitcher') {
//     return ['pitchers', 'starters', 'starter', 'sp', 'rotation', 'bullpen', 'relievers', 'reliever', 'rp'];
//   }

//   return [];
// }
/* ################# */
// function find_player_row_in_sections(data, person_key, preferred_sections) {
//   if (!data) return null;

//   const target = String(person_key || '').trim().toLowerCase();
//   const target_norm = normalize_matchup_person_key(person_key);
//   const preferred = new Set((preferred_sections || []).map(x => String(x || '').trim().toLowerCase()));

//   if (!target && !target_norm) return null;
//   if (!preferred.size) return null;

//   for (const scope_val of Object.values(data)) {
//     if (!scope_val || typeof scope_val !== 'object') continue;

//     for (const [section_name, section_val] of Object.entries(scope_val)) {
//       const section_key = String(section_name || '').trim().toLowerCase();
//       if (!preferred.has(section_key) || !Array.isArray(section_val)) continue;

//       for (const row of section_val) {
//         if (target && String(row.person_key || '').trim().toLowerCase() === target) {
//           return row;
//         }
//       }
//     }
//   }

//   if (!target_norm) return null;

//   for (const scope_val of Object.values(data)) {
//     if (!scope_val || typeof scope_val !== 'object') continue;

//     for (const [section_name, section_val] of Object.entries(scope_val)) {
//       const section_key = String(section_name || '').trim().toLowerCase();
//       if (!preferred.has(section_key) || !Array.isArray(section_val)) continue;

//       for (const row of section_val) {
//         const row_person_key = normalize_matchup_person_key(row.person_key || '');
//         if (row_person_key && row_person_key === target_norm) {
//           return row;
//         }

//         const row_name = normalize_matchup_person_key(row.name || '');
//         if (row_name && row_name === target_norm) {
//           return row;
//         }
//       }
//     }
//   }

//   return null;
// }
function find_player_row_in_sections(data, person_key, role) {
  if (!data) return null;

  const target = String(person_key || '').trim().toLowerCase();
  const target_norm = normalize_matchup_person_key(person_key);

  if (!target && !target_norm) return null;

  const role_text = String(role || '').trim().toLowerCase();

  function section_matches(section_name) {
    const s = String(section_name || '').trim().toLowerCase();

    if (role_text === 'batters' || role_text === 'hitter' || role_text === 'hitters' || role_text === 'lineup') {
      return s === 'hitters';
    }

    if (role_text === 'starters' || role_text === 'starter' || role_text === 'sp' || role_text === 'rotation') {
      return s === 'sp';
    }

    if (role_text === 'bullpen' || role_text === 'relievers' || role_text === 'reliever' || role_text === 'rp') {
      return s === 'rp';
    }

    if (role_text === 'pitchers' || role_text === 'pitcher') {
      return s === 'sp' || s === 'rp';
    }

    return false;
  }

  for (const scope_val of Object.values(data)) {
    if (!scope_val || typeof scope_val !== 'object') continue;

    for (const [section_name, section_val] of Object.entries(scope_val)) {
      if (!section_matches(section_name) || !Array.isArray(section_val)) continue;

      for (const row of section_val) {
        if (target && String(row.person_key || '').trim().toLowerCase() === target) {
          return row;
        }
      }
    }
  }

  if (!target_norm) return null;

  for (const scope_val of Object.values(data)) {
    if (!scope_val || typeof scope_val !== 'object') continue;

    for (const [section_name, section_val] of Object.entries(scope_val)) {
      if (!section_matches(section_name) || !Array.isArray(section_val)) continue;

      for (const row of section_val) {
        const row_person_key = normalize_matchup_person_key(row.person_key || '');
        if (row_person_key && row_person_key === target_norm) {
          return row;
        }

        const row_name = normalize_matchup_person_key(row.name || '');
        if (row_name && row_name === target_norm) {
          return row;
        }
      }
    }
  }

  return null;
}
/* ################# */
function find_player_row_anywhere(data, person_key, role) {
  if (!data) return null;

  // const preferred_sections = fantasy_role_section_priority(role);
  // const preferred_row = find_player_row_in_sections(data, person_key, preferred_sections);
  const preferred_row = find_player_row_in_sections(data, person_key, role);
  if (preferred_row) return preferred_row;

  const target = String(person_key || '').trim().toLowerCase();
  if (!target) return null;

  for (const scope_val of Object.values(data)) {
    if (!scope_val || typeof scope_val !== 'object') continue;

    for (const section_val of Object.values(scope_val)) {
      if (!Array.isArray(section_val)) continue;

      for (const row of section_val) {
        if (String(row.person_key || '').trim().toLowerCase() === target) {
          return row;
        }
      }
    }
  }

  const target_norm = normalize_matchup_person_key(person_key);
  if (!target_norm) return null;

  for (const scope_val of Object.values(data)) {
    if (!scope_val || typeof scope_val !== 'object') continue;

    for (const section_val of Object.values(scope_val)) {
      if (!Array.isArray(section_val)) continue;

      for (const row of section_val) {
        const row_person_key = normalize_matchup_person_key(row.person_key || '');
        if (row_person_key && row_person_key === target_norm) {
          return row;
        }

        const row_name = normalize_matchup_person_key(row.name || '');
        if (row_name && row_name === target_norm) {
          return row;
        }
      }
    }
  }

  return null;
}
/* ################# */
async function val_for_year_person(year, person_key, role) { //absolute value comparison of Val and S Val
  const data = await load_fantasy_year(year);

  const row = find_player_row_anywhere(data, person_key, role);

  if (!row) return null;

  const val_num = Number(row.Val);
  const s_val_num = Number(row['S Val']);

  const has_val = row.Val !== '' && row.Val != null && !Number.isNaN(val_num);
  const has_s_val = row['S Val'] !== '' && row['S Val'] != null && !Number.isNaN(s_val_num);

  if (!has_val && !has_s_val) return null;
  if (!has_val) return s_val_num;
  if (!has_s_val) return val_num;

  return Math.abs(s_val_num) > Math.abs(val_num) ? s_val_num : val_num;
}
/* ################# */
function format_year_option_label(year, is_current, val) {
  const base_label = is_current ? 'Current' : String(year);
  if (val == null) return base_label;
  return `${base_label} (fValue: ${val.toFixed(2)})`;
}
/* ################# */
function normalize_matchup_person_key(s) {
  return remove_accents(String(s || ''))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
/* ################# */
function safe_page_filename(s) {
  let raw = remove_accents(String(s || '').trim());

  // remove trailing period from Jr.
  raw = raw.replace(/\bJr\.$/i, 'Jr');

  const out = raw.replace(/[^a-zA-Z0-9_\-\.]+/g, '_').replace(/^_+|_+$/g, '');
  return out || 'page';
}
/* ################# */
function is_visible(el) {
  if (!el) return false;
  return (el.style.display !== 'none');
}
/* ################# */
function ui_name(s) {
  if (s == null) return '';
  const t = String(s).replace(/_/g, ' ').trim();
  if (t === 'Home') return 'Home';
  return t;
}
/*#################################################################### Year lookup + in-content year selector ####################################################################*/
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
/* ################# */
async function load_retired_players() {
  if (retired_players_set.size) return retired_players_set;

  try {
    const r = await fetch('assets/retired_players.json', { cache: 'no-store' });
    if (!r.ok) {
      retired_players_set = new Set();
      return retired_players_set;
    }

    const data = await r.json();
    retired_players_set = new Set((data.players || []).map(x => String(x)));
    return retired_players_set;
  } catch (e) {
    retired_players_set = new Set();
    return retired_players_set;
  }
}
/* ################# */
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

  const req = String(requested_file || '').trim();
  if (!req) return null;

  function year_for_file(file) {
    const f = String(file || '').trim();
    if (!f) return null;

    for (const y of years) {
      const role_map = (year_page_lookup[y] || {})[role] || {};
      if (String(role_map[person_key] || '') === f) return String(y);
    }
    return null;
  }

  // Collect all known files for this person+role across all years
  const known_files = [];
  for (const y of years) {
    const role_map = (year_page_lookup[y] || {})[role] || {};
    const f = role_map[person_key];
    if (f) known_files.push(String(f));
  }

  // If the requested file is already one of the known year files, do NOT fallback.
  // This prevents infinite bouncing.
  if (known_files.includes(req)) return null;

  // Otherwise, pick a sensible fallback: current year if available, else newest available.
  const label_current_year = String(window.DEFAULT_SEASON_YEAR || '').trim();

  if (label_current_year && years.includes(label_current_year)) {
    const role_map = (year_page_lookup[label_current_year] || {})[role] || {};
    const f = role_map[person_key];
    if (f) {
      return { file: String(f), year: year_for_file(f) || String(label_current_year) };
    }
  }

  if (known_files.length) {
    const f = String(known_files[0]);
    return { file: f, year: year_for_file(f) || null };
  }

  return null;
}
/* ################# */
async function render_year_select_in_content(content_root) {
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

    const disclaimer = document.createElement('div');
    disclaimer.className = 'year_select_disclaimer';
    disclaimer.style.fontSize = '12px';
    disclaimer.style.fontWeight = '700';
    disclaimer.style.color = 'rgba(209, 83, 49, 0.95)';
    disclaimer.style.marginLeft = '10px';
    disclaimer.style.display = 'none';

    let any_selected = false;

    function sync_year_fallback_disclaimer() {
      const pid = String(active_page_id || '');
      const n = pid ? year_fallback_notice_by_page.get(pid) : null;
      const y = n ? String(n.last_played_year || '').trim() : '';

      const is_retired = retired_players_set.has(person_key);

      if (y && !is_retired) {
        disclaimer.textContent = `No data since ${y}`;
        disclaimer.style.display = '';
      } else {
        disclaimer.textContent = '';
        disclaimer.style.display = 'none';
      }
    }
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

    const option_jobs = years.map(async y => {
      const role_map = (year_page_lookup[y] || {})[role] || {};
      const file = role_map[person_key];
      if (!file) return null;

      const is_current = label_current_year && (String(y) === String(label_current_year));
      const val = await val_for_year_person(y, person_key, role);
      const label_text = format_year_option_label(y, is_current, val);
      const is_selected = (file === active_file);

      return { label_text, file, is_selected };
    });

    Promise.all(option_jobs).then(options => {
      options.forEach(opt => {
        if (!opt) return;
        add_opt(opt.label_text, opt.file, opt.is_selected);
      });

      if (!any_selected && sel.options.length) {
        sel.selectedIndex = 0;
      }

      sync_year_fallback_disclaimer();
    });
    // // If the currently-loaded file isn't one of the year options, just show the top option.
    // // Navigation is handled earlier (pre-DOM) in load_page to avoid flicker.
    // if (!any_selected && sel.options.length) {
    //   sel.selectedIndex = 0;
    // }

    // sync_year_fallback_disclaimer();

    sel.addEventListener('change', (e) => {
      e.preventDefault();

      const file = sel.value;
      if (!file) return;

      load_page(file, active_page_id || (document.querySelector('.toc_link.active')?.dataset.page || ''));
      if (active_page_id) history.replaceState(null, '', '#' + encodeURIComponent(active_page_id));
    });

    wrap.appendChild(label);

    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.appendChild(sel);
    row.appendChild(disclaimer);

    wrap.appendChild(row);
    el.appendChild(wrap);
  });
}
/*#################################################################### Sidebar collapse persistence (keys + read/write) ####################################################################*/
function team_storage_key(team) {
  return 'mlb_dash_team_open__' + team;
}
/* ################# */
function division_storage_key(div_id) {
  return 'mlb_dash_div_open__' + div_id;
}
/* ################# */
// function read_collapsed(key, default_collapsed) {
//   try {
//     const v = localStorage.getItem(key);
//     if (v === '1') return true;
//     if (v === '0') return false;
//   } catch (e) {}
//   return default_collapsed;
// }
function read_collapsed(key, default_collapsed) {
  try {
    const v = sessionStorage.getItem(key);
    if (v === '1') return true;
    if (v === '0') return false;
  } catch (e) {}
  return default_collapsed;
}
/* ################# */
// function write_collapsed(key, collapsed) { // previously kept persistent collapse states across visits
//   try {
//     localStorage.setItem(key, collapsed ? '1' : '0');
//   } catch (e) {}
// }
function write_collapsed(key, collapsed) {
  try {
    sessionStorage.setItem(key, collapsed ? '1' : '0');
  } catch (e) {}
}
/* ################# */
function read_soft_theme() {
  try {
    return localStorage.getItem('mlb_dash_soft_theme') === '1';
  } catch (e) {}
  return false;
}
/* ################# */
function write_soft_theme(enabled) {
  try {
    localStorage.setItem('mlb_dash_soft_theme', enabled ? '1' : '0');
  } catch (e) {}
}
/* ################# */
function set_soft_theme(enabled) {
  document.body.classList.toggle('soft_theme', !!enabled);

  const btn = document.getElementById('theme_toggle');
  if (btn) btn.textContent = enabled ? 'Light' : 'Dark-ish';

  write_soft_theme(!!enabled);
  repaint_standard_stats_tables(document);
  requestAnimationFrame(() => repaint_standard_stats_tables(document));
  setTimeout(() => repaint_standard_stats_tables(document), 60);
}
/* ################# */
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
/* ################# */
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
/*#################################################################### Content/page loading + activation (TOC + hash) ####################################################################*/
async function load_page(file, page_id) {
  const content = document.getElementById('content_root');
  if (!content) return;

  const pid = String(page_id || active_page_id || '').trim();

  content.innerHTML = '<div style="padding:12px;color:rgba(96,103,112,0.95);">Loading…</div>';

  let html = page_cache.get(file);
  if (!html) {
    const r = await fetch(file);
    html = await r.text();
    page_cache.set(file, html);
  }

  // Pre-resolve year fallback BEFORE touching the live DOM to avoid flicker
  await load_year_page_lookup();
  await load_retired_players();
  const fb = year_fallback_file_from_html(html, file);
  if (fb && fb.file) {
    year_fallback_notice_by_page.set(pid, {
      last_played_year: String(fb.year || '').trim(),
    });
    await load_page(fb.file, pid);
    return;
  }

  content.innerHTML = html;
  active_content_file = file || '';
  active_page_id = pid || active_page_id || '';

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
  links.forEach(a => a.classList.toggle('active', a.dataset.page === pid));

  try { localStorage.setItem('mlb_dash_active_page', pid); } catch (e) {}

  await load_year_page_lookup();
  await render_year_select_in_content(content);
    wrap_player_page_scroll_shell(content);
  install_plotly_tick_popovers(content);
  const plots = Array.from(content.querySelectorAll('.js-plotly-plot'));
  plots.forEach(plot => {
    if (plot.dataset.table_repaint_bound === '1') return;
    plot.dataset.table_repaint_bound = '1';

    const repaint = () => repaint_standard_stats_tables(content);

    plot.on?.('plotly_afterplot', repaint);
    plot.on?.('plotly_relayout', repaint);
    plot.on?.('plotly_restyle', repaint);
  });
  requestAnimationFrame(() => {
    repaint_standard_stats_tables(content);
    requestAnimationFrame(() => repaint_standard_stats_tables(content));
  });

  init_matchups_page_if_present(content);
  init_fantasy_page_if_present(content);
  apply_mobile_scale();
  refresh_custom_player_lists_ui();

  const active = document.querySelector(`.toc_link[data-page="${pid}"]`);
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
/* ################# */
// function activate_page(page_id) {
//   let a = null;
//   document.querySelectorAll('.toc_link').forEach(x => {
//     if (x.dataset.page === page_id) a = x;
//   });
//   if (!a) return;

//   const file = a.dataset.file;
//   if (!file) return;

//   load_page(file, page_id);

//   history.replaceState(null, '', '#' + encodeURIComponent(page_id));
// }
function activate_page(page_id, { update_history = true } = {}) { /* back button works now? */
  let a = null;
  document.querySelectorAll('.toc_link').forEach(x => {
    if (x.dataset.page === page_id) a = x;
  });
  if (!a) return;

  const file = a.dataset.file;
  if (!file) return;

  load_page(file, page_id);

  if (update_history) {
    const new_hash = '#' + encodeURIComponent(page_id);
    if (window.location.hash !== new_hash) {
      history.pushState(null, '', new_hash);
    }
  }
}
/* ################# */
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
/* ################# */
// function on_hash_change() {
//   const pid = default_page_id();
//   activate_page(pid);
// }
function on_hash_change() { /* back button works now? */
  const pid = default_page_id();

  let a = null;
  document.querySelectorAll('.toc_link').forEach(x => {
    if (x.dataset.page === pid) a = x;
  });

  if (!a) return;

  const file = a.dataset.file;
  if (!file) return;

  load_page(file, pid);
}
/*#################################################################### Sidebar team role tabs ####################################################################*/
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
/*#################################################################### Search + filters (including search-mode open/restore) ####################################################################*/
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
        collapsed = read_collapsed(division_storage_key(div_id), true);
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
/* ################# */
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
/* ################# */
function current_filters() {
  const hide_minors = !!(document.getElementById('filter_hide_minors') && document.getElementById('filter_hide_minors').checked);
  const hide_non_top_100_prospects = !!(document.getElementById('filter_hide_non_top_100_prospects') && document.getElementById('filter_hide_non_top_100_prospects').checked);
  const hide_oos = !!(document.getElementById('filter_hide_oos') && document.getElementById('filter_hide_oos').checked);
  return { hide_minors, hide_non_top_100_prospects, hide_oos };
}
/* ################# */
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
      const is_oos = (a.dataset.is_oos === '1');
      const is_susp = (a.dataset.is_susp === '1');
      const is_prospect = (a.dataset.is_prospect === '1');
      const is_top_100 = (a.dataset.is_top_100 === '1');
      const skip_search = (a.dataset.skip_search === '1');

      let show = true;

      if (searching && !skip_search && !name.includes(query)) show = false;
      if (searching && skip_search) show = false;
      if (f.hide_minors && is_minors) show = false;
      if (f.hide_non_top_100_prospects && is_minors && is_prospect && !is_top_100) show = false;
      if (f.hide_oos && (is_oos || is_susp)) show = false;

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
    const is_custom_block = db.classList.contains('favorites_block') || db.classList.contains('watchlist_block');

    if (is_custom_block) {
      let any_visible_player = false;

      db.querySelectorAll('.toc_link').forEach(a => {
        const name = String(a.dataset.name || '').toLowerCase();
        const is_minors = (a.dataset.is_minors === '1');
        const is_oos = (a.dataset.is_oos === '1');
        const is_susp = (a.dataset.is_susp === '1');
        const is_prospect = (a.dataset.is_prospect === '1');
        const is_top_100 = (a.dataset.is_top_100 === '1');
        const skip_search = (a.dataset.skip_search === '1');

        let show = true;

        if (searching && !skip_search && !name.includes(query)) show = false;
        if (searching && skip_search) show = false;
        if (f.hide_minors && is_minors) show = false;
        if (f.hide_non_top_100_prospects && is_minors && is_prospect && !is_top_100) show = false;
        if (f.hide_oos && (is_oos || is_susp)) show = false;

        const li = a.closest('.player_li');
        if (li) li.style.display = show ? '' : 'none';
        if (show) any_visible_player = true;
      });

      db.querySelectorAll('.role_list').forEach(role_list => {
        cleanup_role_list(role_list);
      });

      db.style.display = any_visible_player ? '' : 'none';
      return;
    }

    const any_visible_team = Array.from(db.querySelectorAll('.team_block')).some(tb => tb.style.display !== 'none');
    db.style.display = any_visible_team ? '' : 'none';
  });
}
/*#################################################################### WIP: Clickable Stat Keys ####################################################################*/
const stat_glossary = {
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
/* ################# */
let stat_popover_nodes = null;
/* ################# */
function escape_html(s) {
  return String(s || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
/* ################# */
function wrap_paragraphs(text) {
  const parts = String(text || '').split('\n').map(x => x.trim()).filter(Boolean);
  if (!parts.length) return '<p>No description found.</p>';
  return parts.map(x => `<p>${escape_html(x)}</p>`).join('');
}
/* ################# */
function stat_popover_on_keydown(e) {
  if (e.key === 'Escape') remove_stat_popover();
}
/* ################# */
function remove_stat_popover() {
  if (!stat_popover_nodes) return;
  stat_popover_nodes.backdrop.remove();
  stat_popover_nodes.popover.remove();
  stat_popover_nodes = null;
  document.removeEventListener('keydown', stat_popover_on_keydown, true);
}
/* ################# */
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
/* ################# */
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
/* ################# */
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
/* ################# */
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
/* ################# */
function normalize_stat_label(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[%]/g, ' pct')
    .replace(/[^a-z0-9 ]+/g, '');
}
/* ################# */
function parse_json_dataset(s) {
  try {
    return JSON.parse(String(s || ''));
  } catch {
    return null;
  }
}
/* ################# */
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
/* ################# */
// function apply_mobile_scale() {
//   const content = document.getElementById('content_root');
//   if (!content) return;

//   const is_touch_mobile = window.matchMedia('(max-width: 900px) and (pointer: coarse)').matches;
//   const page = content.querySelector('.player_page');
//   const has_static = !!page && !!page.querySelector('.static_page');

//   if (!is_touch_mobile || !page || has_static) {
//     content.style.transform = '';
//     content.style.transformOrigin = '';
//     content.style.width = '';
//     content.style.maxWidth = '';
//     return;
//   }

//   const pad = 20;
//   const base_width = 1350;
//   const target_w = Math.max(320, window.innerWidth - pad);
//   const scale = Math.min(1, target_w / base_width);

//   content.style.transform = `scale(${scale})`;
//   content.style.transformOrigin = 'top left';
//   content.style.width = `${Math.ceil(base_width * scale)}px`;
//   content.style.maxWidth = 'none';
// }
function apply_mobile_scale() {
  const content = document.getElementById('content_root');
  if (!content) return;

  const is_touch_mobile = window.matchMedia('(max-width: 900px) and (pointer: coarse)').matches;
  const page = content.querySelector('.player_page');
  const has_static = !!page && !!page.querySelector('.static_page');

  const ua = navigator.userAgent || '';
  const is_ios = /iPhone|iPad|iPod/.test(ua);

  if (!is_touch_mobile || !page || has_static || is_ios) {
    content.style.transform = '';
    content.style.transformOrigin = '';
    content.style.width = '';
    content.style.maxWidth = '';
    return;
  }

  const pad = 20;
  const base_width = 1350;
  const target_w = Math.max(320, window.innerWidth - pad);
  const scale = Math.min(1, target_w / base_width);

  content.style.transform = `scale(${scale})`;
  content.style.transformOrigin = 'top left';
  content.style.width = `${Math.ceil(base_width * scale)}px`;
  content.style.maxWidth = 'none';
}
/* ################# */
function wrap_player_page_scroll_shell(root) {
  const scope = root || document;
  const pages = Array.from(scope.querySelectorAll('.player_page'));

  pages.forEach(page => {
    if (page.id === 'fantasy') return;

    if (page.querySelector(':scope > .player_page_scroll')) return;

    const kids = Array.from(page.childNodes);
    const scroll = document.createElement('div');
    scroll.className = 'player_page_scroll';

    const inner = document.createElement('div');
    inner.className = 'player_page_inner';

    kids.forEach(node => inner.appendChild(node));
    scroll.appendChild(inner);
    page.appendChild(scroll);
  });
}
/* ################# */
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
/*#################################################################### Plotly standard-stats table theme repaint ####################################################################*/
function normalize_svg_fill(fill) {
  return String(fill || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}
/* ################# */
function parse_svg_fill(fill) {
  const f = normalize_svg_fill(fill);
  if (!f || f === 'none' || f === 'transparent') return null;

  let m = f.match(/^rgba?\(([\d.]+),([\d.]+),([\d.]+)(?:,([\d.]+))?\)$/);
  if (m) {
    return {
      r: Number(m[1]),
      g: Number(m[2]),
      b: Number(m[3]),
      a: m[4] == null ? 1 : Number(m[4]),
    };
  }

  m = f.match(/^#([0-9a-f]{6})$/);
  if (m) {
    const hex = m[1];
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
      a: 1,
    };
  }

  return null;
}
/* ################# */
function is_neutral_fill(fill) {
  const c = parse_svg_fill(fill);
  if (!c) return false;

  const spread = Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b);
  return spread <= 14;
}
/* ################# */
// function is_stat_fill(fill) {
//   const c = parse_svg_fill(fill);
//   if (!c || c.a === 0) return false;

//   const spread = Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b);
//   if (spread < 18) return false;

//   const blue_like = (c.b - c.r >= 30) && (c.b - c.g >= 18);
//   const red_like = (c.r - c.g >= 30) && (c.r - c.b >= 18);

//   return blue_like || red_like;
// }
function is_stat_fill(fill) {
  const c = parse_svg_fill(fill);
  if (!c || c.a === 0) return false;

  const spread = Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b);
  if (spread < 18) return false;

  const blue_like = (c.b - c.r >= 30) && (c.b - c.g >= 18);
  const red_like = (c.r - c.g >= 30) && (c.r - c.b >= 18);
  const gold_like = (
    c.r >= 120 &&
    c.g >= 90 &&
    c.b <= 95 &&
    (c.r - c.b >= 35) &&
    (c.g - c.b >= 10)
  );

  return blue_like || red_like || gold_like;
}
/* ################# */
function is_close_rgb(c, r, g, b, tol = 8) {
  if (!c) return false;
  return (
    Math.abs(c.r - r) <= tol &&
    Math.abs(c.g - g) <= tol &&
    Math.abs(c.b - b) <= tol
  );
}
/* ################# */
function is_gold_stat_fill(fill) {
  const c = parse_svg_fill(fill);
  if (!c || c.a === 0) return false;

  return (
    c.r >= 120 &&
    c.g >= 90 &&
    c.b <= 95 &&
    (c.r - c.b >= 35) &&
    (c.g - c.b >= 10)
  );
}
/* ################# */
function is_deep_gold_fill(fill) {
  const c = parse_svg_fill(fill);
  if (!c || c.a === 0) return false;
  if (!is_gold_stat_fill(fill)) return false;

  const t = mix_frac_to_target(c, { r: 184, g: 134, b: 11 });
  if (t == null) return false;

  return t >= 0.75;
}
/* ################# */
function is_blue_stat_fill(fill) {
  const c = parse_svg_fill(fill);
  if (!c || c.a === 0) return false;

  return (
    (c.b - c.r >= 30) &&
    (c.b - c.g >= 18)
  );
}
/* ################# */
function mix_frac_to_target(c, target) {
  if (!c || !target) return null;

  const denom_r = target.r - 235;
  const denom_g = target.g - 240;
  const denom_b = target.b - 248;

  const vals = [];

  if (Math.abs(denom_r) > 1e-9) vals.push((c.r - 235) / denom_r);
  if (Math.abs(denom_g) > 1e-9) vals.push((c.g - 240) / denom_g);
  if (Math.abs(denom_b) > 1e-9) vals.push((c.b - 248) / denom_b);

  if (!vals.length) return null;

  const t = vals.reduce((a, b) => a + b, 0) / vals.length;
  return Math.max(0, Math.min(1, t));
}
/* ################# */
function is_deep_blue_fill(fill) {
  const c = parse_svg_fill(fill);
  if (!c || c.a === 0) return false;
  if (!is_blue_stat_fill(fill)) return false;

  const t = mix_frac_to_target(c, { r: 35, g: 85, b: 210 });
  if (t == null) return false;

  return t >= 0.75;
}
function get_css_var(name, fallback = '') {
  const v = getComputedStyle(document.body).getPropertyValue(name);
  return String(v || '').trim() || fallback;
}
/* ################# */
function get_table_default_text_fill() {
  return get_css_var('--text', '#1c1c1c');
}
/* ################# */
function is_red_stat_fill(fill) {
  const c = parse_svg_fill(fill);
  if (!c || c.a === 0) return false;

  return (
    (c.r - c.g >= 30) &&
    (c.r - c.b >= 18)
  );
}
/* ################# */
function is_deep_red_fill(fill) {
  const c = parse_svg_fill(fill);
  if (!c || c.a === 0) return false;
  if (!is_red_stat_fill(fill)) return false;

  const t = mix_frac_to_target(c, { r: 210, g: 35, b: 35 });
  if (t == null) return false;

  return t >= 0.75;
}
/* ################# */
// function should_use_white_table_text(text_node, cell_fill, is_dark) {
//   if (!cell_fill) return false;

//   const is_deep_blue = is_deep_blue_fill(cell_fill);
//   const is_deep_red = is_deep_red_fill(cell_fill);

//   if (!is_deep_blue && !is_deep_red) return false;

//   if (is_dark) {
//     return is_deep_blue;
//   }

//   return !row_has_reduced_sample_opacity(text_node);
// }
function should_use_white_table_text(text_node, cell_fill, is_dark) {
  if (!cell_fill) return false;

  const is_deep_blue = is_deep_blue_fill(cell_fill);
  const is_deep_red = is_deep_red_fill(cell_fill);
  const is_deep_gold = is_deep_gold_fill(cell_fill);

  if (is_deep_gold) return true;
  if (!is_deep_blue && !is_deep_red) return false;

  if (is_dark) {
    return is_deep_blue;
  }

  return !row_has_reduced_sample_opacity(text_node);
}
/* ################# */
function get_table_text_cell_fill(text_node) {
  if (!text_node) return '';

  let node = text_node;
  for (let i = 0; i < 5 && node; i += 1) {
    if (node.querySelectorAll) {
      const rects = Array.from(node.querySelectorAll('rect'));
      const filled_rect = rects.find(r => {
        const fill = r.style.fill || r.getAttribute('fill') || '';
        const parsed = parse_svg_fill(fill);
        return parsed && parsed.a !== 0;
      });

      if (filled_rect) {
        return filled_rect.style.fill || filled_rect.getAttribute('fill') || '';
      }
    }
    node = node.parentNode;
  }

  return '';
}
/* ################# */
function is_dark_text_fill(fill) {
  const c = parse_svg_fill(fill);
  if (!c || c.a === 0) return false;

  return (
    c.r <= 120 &&
    c.g <= 120 &&
    c.b <= 120
  );
}
/* ################# */
function clamp_byte(v) {
  return Math.max(0, Math.min(255, Math.round(v)));
}
/* ################# */
function rgba_string(c) {
  const a = c.a == null ? 1 : c.a;
  return `rgba(${clamp_byte(c.r)},${clamp_byte(c.g)},${clamp_byte(c.b)},${a})`;
}
/* ################# */
// function dark_mode_stat_fill(fill) {
//   const c = parse_svg_fill(fill);
//   if (!c || c.a === 0) return fill;

//   const spread = Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b);
//   const lum = (0.2126 * c.r) + (0.7152 * c.g) + (0.0722 * c.b);

//   if (spread < 18) return fill;

//   const blue_like = (c.b - c.r >= 30) && (c.b - c.g >= 18);
//   const red_like = (c.r - c.g >= 30) && (c.r - c.b >= 18);

//   if (!blue_like && !red_like) return fill;

//   // Only darken the pale end of the gradient.
//   // Stronger colors already read fine with light text.
//   if (lum < 150) return fill;

//   const strength = Math.min(0.35, Math.max(0.12, (lum - 150) / 220));

//   return rgba_string({
//     r: c.r * (1 - strength),
//     g: c.g * (1 - strength),
//     b: c.b * (1 - strength),
//     a: c.a,
//   });
// }
function dark_mode_stat_fill(fill) {
  const c = parse_svg_fill(fill);
  if (!c || c.a === 0) return fill;

  const spread = Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b);
  const lum = (0.2126 * c.r) + (0.7152 * c.g) + (0.0722 * c.b);

  if (spread < 18) return fill;

  const blue_like = (c.b - c.r >= 30) && (c.b - c.g >= 18);
  const red_like = (c.r - c.g >= 30) && (c.r - c.b >= 18);
  const gold_like = (
    c.r >= 120 &&
    c.g >= 90 &&
    c.b <= 95 &&
    (c.r - c.b >= 35) &&
    (c.g - c.b >= 10)
  );

  if (!blue_like && !red_like && !gold_like) return fill;

  if (lum < 150) return fill;

  const strength = Math.min(0.35, Math.max(0.12, (lum - 150) / 220));

  return rgba_string({
    r: c.r * (1 - strength),
    g: c.g * (1 - strength),
    b: c.b * (1 - strength),
    a: c.a,
  });
}
/* ################# */
function normalize_table_header_label(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}
/* ################# */
function parse_table_number(s) {
  const raw = String(s || '').trim();
  if (!raw) return NaN;

  if (/^\d+\.\d$/.test(raw)) {
    return Number(raw);
  }

  const cleaned = raw.replace(/,/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}
/* ################# */
function get_table_view_for_text_node(text_node) {
  if (!text_node) return null;
  return text_node.closest('.table-control-view');
}
/* ################# */
function get_column_blocks_for_text_node(text_node) {
  const table_view = get_table_view_for_text_node(text_node);
  if (!table_view) return [];
  return Array.from(table_view.querySelectorAll('.column-block'));
}
/* ################# */
function get_cell_holder_for_text_node(text_node) {
  if (!text_node) return null;
  return text_node.closest('.cell-text-holder');
}
/* ################# */
function get_column_block_for_text_node(text_node) {
  if (!text_node) return null;
  return text_node.closest('.column-block');
}
/* ################# */
function get_column_cell_holders(column_block) {
  if (!column_block) return [];
  return Array.from(column_block.querySelectorAll('.cell-text-holder'));
}
/* ################# */
function get_text_from_holder(holder) {
  if (!holder) return '';
  const text_node = holder.querySelector('.cell-text');
  return String(text_node?.textContent || '').trim();
}
/* ################# */
function get_row_index_for_text_node(text_node) {
  const holder = get_cell_holder_for_text_node(text_node);
  const column_block = get_column_block_for_text_node(text_node);
  if (!holder || !column_block) return -1;

  const holders = get_column_cell_holders(column_block);
  return holders.indexOf(holder);
}
/* ################# */
function get_column_values(column_block) {
  return get_column_cell_holders(column_block).map(get_text_from_holder);
}
/* ################# */
function get_column_header_text(column_block) {
  if (!column_block) return '';

  const texts = Array.from(column_block.querySelectorAll('text'))
    .map(x => String(x.textContent || '').trim())
    .filter(Boolean);

  const values = new Set(get_column_values(column_block).filter(Boolean));

  const header = texts.find(x => !values.has(x));
  if (header) return header;

  return '';
}
/* ################# */
function get_column_map_for_text_node(text_node) {
  const out = new Map();
  const column_blocks = get_column_blocks_for_text_node(text_node);

  column_blocks.forEach(column_block => {
    const header = normalize_table_header_label(get_column_header_text(column_block));
    if (!header) return;
    if (!out.has(header)) out.set(header, column_block);
  });

  return out;
}
/* ################# */
function get_value_from_column_at_row(text_node, header_name, row_idx) {
  if (row_idx < 0) return '';

  const column_map = get_column_map_for_text_node(text_node);
  const column_block = column_map.get(normalize_table_header_label(header_name));
  if (!column_block) return '';

  const holders = get_column_cell_holders(column_block);
  if (row_idx >= holders.length) return '';

  return get_text_from_holder(holders[row_idx]);
}
/* ################# */
function get_table_row_sample_info(text_node) {
  const row_idx = get_row_index_for_text_node(text_node);
  if (row_idx < 0) return null;

  const pa_text = get_value_from_column_at_row(text_node, 'PA', row_idx);
  const ip_text = get_value_from_column_at_row(text_node, 'IP', row_idx);
  const role_text = get_value_from_column_at_row(text_node, 'Role', row_idx);

  const pa = parse_table_number(pa_text);
  const ip = parse_table_number(ip_text);
  const role = String(role_text || '').trim().toUpperCase();

  const has_pa = Number.isFinite(pa);
  const has_ip = Number.isFinite(ip);

  if (has_pa) {
    return {
      is_hitter: true,
      sample: pa,
      threshold: 50,
      reduced: pa < 50,
      role: '',
    };
  }

  if (has_ip) {
    const is_bullpen = role === 'RP' || role === 'CL';
    const threshold = is_bullpen ? 10 : 20;

    return {
      is_hitter: false,
      sample: ip,
      threshold,
      reduced: ip < threshold,
      role,
    };
  }

  return null;
}
/* ################# */
function row_has_reduced_sample_opacity(text_node) {
  const info = get_table_row_sample_info(text_node);
  if (!info) return false;
  return info.reduced;
}
/* ################# */
function repaint_standard_stats_tables(root) {
  const scope = root || document;
  const is_dark = document.body.classList.contains('soft_theme');

  const plots = Array.from(scope.querySelectorAll('.player_page .js-plotly-plot, .player_page .plotly-graph-div'));

  plots.forEach(plot => {
    const all_texts = Array.from(plot.querySelectorAll('text'));

  all_texts.forEach(t => {
    if (t.dataset.orig_fill === undefined) {
      t.dataset.orig_fill = t.style.fill || t.getAttribute('fill') || '';
    }

    const orig_fill = t.dataset.orig_fill || '';

if (t.closest('g.table')) {
  const cell_fill = get_table_text_cell_fill(t);
  const use_white = should_use_white_table_text(t, cell_fill, is_dark);
  const css_text_fill = get_table_default_text_fill();

  if (use_white) {
    t.style.fill = '#ffffff';
    return;
  }

  if (is_dark) {
    t.style.fill = css_text_fill;
    return;
  }

  if (orig_fill) {
    t.style.fill = orig_fill;
  } else {
    t.style.fill = css_text_fill;
  }
  return;
}

    if (!is_dark) {
      if (orig_fill) {
        t.style.fill = orig_fill;
      } else {
        t.style.removeProperty('fill');
      }
      return;
    }

if (is_dark_text_fill(orig_fill)) {
  t.style.fill = get_table_default_text_fill();
} else if (orig_fill) {
      t.style.fill = orig_fill;
    } else {
      t.style.removeProperty('fill');
    }
  });

    const table_groups = Array.from(plot.querySelectorAll('g.table'));

    table_groups.forEach(table_group => {
      const rects = Array.from(table_group.querySelectorAll('rect'));

      rects.forEach(r => {
        if (r.dataset.orig_fill === undefined) {
          r.dataset.orig_fill = r.style.fill || r.getAttribute('fill') || '';
        }

        if (r.dataset.orig_stroke === undefined) {
          r.dataset.orig_stroke = r.style.stroke || r.getAttribute('stroke') || '';
        }

        if (r.dataset.orig_stroke_width === undefined) {
          r.dataset.orig_stroke_width = r.style.strokeWidth || r.getAttribute('stroke-width') || '';
        }

        const orig_fill = r.dataset.orig_fill || '';
        const parsed = parse_svg_fill(orig_fill);

        if (!is_dark) {
          if (orig_fill) {
            r.style.fill = orig_fill;
          } else {
            r.style.removeProperty('fill');
          }

          if (r.dataset.orig_stroke) {
            r.style.stroke = r.dataset.orig_stroke;
          } else {
            r.style.removeProperty('stroke');
          }

          if (r.dataset.orig_stroke_width) {
            r.style.strokeWidth = r.dataset.orig_stroke_width;
          } else {
            r.style.removeProperty('stroke-width');
          }

          return;
        }

        if (!parsed || parsed.a === 0) return;

        if (is_stat_fill(orig_fill)) {
          r.style.fill = dark_mode_stat_fill(orig_fill);
          return;
        }

        const is_light_body = is_close_rgb(parsed, 235, 240, 248, 10);
        const is_light_header = is_close_rgb(parsed, 205, 215, 230, 10);
        const is_light_year_header = is_close_rgb(parsed, 35, 85, 210, 16) && parsed.a > 0 && parsed.a < 0.5;

        if (is_light_body) {
          r.style.fill = '#3b424b';
          return;
        }

        if (is_light_header) {
          r.style.fill = '#272c33';
          return;
        }

        if (is_light_year_header) {
          r.style.fill = 'rgba(35,85,210,0.35)';
          return;
        }

        r.style.fill = orig_fill;
      });
    });
  });
}
/*#################################################################### Fantasy page init hook ####################################################################*/
function init_fantasy_page_if_present(content) {
  const scope = content || document;
  const root = scope.querySelector('#fantasy_controls_root');
  if (!root) return;

  if (typeof render_fantasy_page === 'function') {
    render_fantasy_page();
  }
}
/*#################################################################### DOMContentLoaded wiring (events + initial state) ####################################################################*/
document.addEventListener('DOMContentLoaded', () => {
  const toggle_sidebar_btn = document.getElementById('toggle_sidebar');
  const theme_toggle_btn = document.getElementById('theme_toggle');
  requestAnimationFrame(() => repaint_standard_stats_tables(document));

  if (theme_toggle_btn) {
    theme_toggle_btn.addEventListener('click', () => {
      const enabled = !document.body.classList.contains('soft_theme');
      set_soft_theme(enabled);
    });
  }

  install_stat_glossary_popovers();
    wrap_player_page_scroll_shell(document);
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
    const collapsed = read_collapsed(team_storage_key(team), true); /* teams collapsed by default */
    set_team_collapsed(team, collapsed);
  });

  document.querySelectorAll('.division_block').forEach(db => {
    const div_id = db.dataset.division || '';
    const collapsed = read_collapsed(division_storage_key(div_id), true); /* divisions collapsed by default */
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
  refresh_custom_player_lists_ui();

  const cb_minors = document.getElementById('filter_hide_minors');
  if (cb_minors) cb_minors.addEventListener('change', () => apply_search_and_filters((search && search.value) ? search.value : ''));

  const cb_non_top_100 = document.getElementById('filter_hide_non_top_100_prospects');
  if (cb_non_top_100) cb_non_top_100.addEventListener('change', () => apply_search_and_filters((search && search.value) ? search.value : ''));

  const cb_oos = document.getElementById('filter_hide_oos');
  if (cb_oos) cb_oos.addEventListener('change', () => apply_search_and_filters((search && search.value) ? search.value : ''));

  window.addEventListener('hashchange', on_hash_change);

  window.addEventListener('resize', apply_mobile_scale);
  apply_mobile_scale();

  on_hash_change();
  apply_search_and_filters((search && search.value) ? search.value : '');
});
/*#################################################################### END OF FILE ####################################################################*/

/* ===== matchups.js ===== */

//#################################################################### H) Matchups page (index/lists, UI builders, fragment rendering, form modes) ####################################################################
const matchups_cache = new Map();
let matchups_index = null;

let matchups_lists = null;
const MATCHUPS_DEBUG = true;
//#################################################################### Debug ####################################################################
function dbg(...args) {
  if (!MATCHUPS_DEBUG) return;
  console.log('[matchups]', ...args);
}
//#################################################################### Index + lists loaders ####################################################################
function join_matchups_fragment_path(idx, year, rel_path) {
  const y = String(year ?? '');
  const root = idx?.fragment_roots?.[y] || '';

  if (!root || !rel_path) return '';

  return `${root}/${rel_path}`.replace(/\/+/g, '/');
}
//#################
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
//#################
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
//#################
let matchups_rosters = null;

async function load_matchups_rosters() {
  if (matchups_rosters !== null) return matchups_rosters;

  try {
    const r = await fetch('assets/matchups/rosters.json', { cache: 'no-store' });
    if (!r.ok) {
      matchups_rosters = null;
      return null;
    }

    matchups_rosters = await r.json();
    dbg('loaded rosters.json keys:', Object.keys(matchups_rosters || {}));
    return matchups_rosters;

  } catch (e) {
    matchups_rosters = null;
    return null;
  }
}
//#################################################################### Select utils ####################################################################
async function fetch_matchups_for_date(date_str) {
  const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${encodeURIComponent(date_str)}&hydrate=probablePitcher`;

  const r = await fetch(url, { cache:'no-store' });
  if (!r.ok) return [];

  const j = await r.json();
  const games = (j.dates && j.dates[0] && Array.isArray(j.dates[0].games)) ? j.dates[0].games : [];

  const out = [];

  for (const g of games) {

    const away_id = g?.teams?.away?.team?.id;
    const home_id = g?.teams?.home?.team?.id;

    const away_team = normalize_matchups_team_code(team_id_to_code[away_id] || '');
    const home_team = normalize_matchups_team_code(team_id_to_code[home_id] || '');

    if (!away_team || !home_team) continue;

    const away_p = remove_accents(g?.teams?.away?.probablePitcher?.fullName || '');
    const home_p = remove_accents(g?.teams?.home?.probablePitcher?.fullName || '');

    out.push({
      home_team,
      away_team,
      home_pitcher: home_p,
      away_pitcher: away_p
    });
  }

  return out;
}
//#################
function team_logo_html(team) {
  const t = normalize_matchups_team_code(team);
  if (!t) return '';

  return `<img class="matchups_team_logo" src="./team_logos/${t}.png" alt="${t}" loading="lazy">`;
}
//#################
function side_aliases(side) {
  const s = String(side || '').trim();
  if (s === 'Away') return ['Away', '@'];
  if (s === 'Home') return ['Home', 'vs', 'VS'];
  return [s];
}
//#################
function opposite_side(side) {
  const s = String(side || '').trim();
  if (s === 'Away') return 'Home';
  if (s === 'Home') return 'Away';
  return '';
}
//#################
function make_select(id, label_text) {
  const wrap = document.createElement('div');
  wrap.className = 'matchups_row'

  const label = document.createElement('div');
  label.textContent = label_text;
  label.className = 'matchups_label'

  const sel = document.createElement('select');
  sel.id = id;
  sel.dataset.field = String(id || '').replace(/^matchups_/, '');
  sel.className = 'matchups_select'

  // keep placeholder styling in sync, but only bind once
  if (sel.dataset.ph_bound !== '1') {
    sel.dataset.ph_bound = '1';
    sel.addEventListener('change', () => sync_select_placeholder_class(sel));
  }

  wrap.appendChild(label);
  wrap.appendChild(sel);

  return { wrap, sel };
}
//#################
function sync_select_placeholder_class(sel) {
  if (!sel) return;
  const is_placeholder = !String(sel.value || '').trim();
  sel.classList.toggle('is_placeholder', is_placeholder);
}
//#################
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
}
//#################
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
}
//#################
function set_grouped_or_flat(sel, groups, flat, placeholder) {
  const has_groups = Array.isArray(groups) && groups.length;

  if (has_groups) {
    set_select_options_grouped(sel, groups, placeholder);
    return;
  }

  set_select_options(sel, flat || [], placeholder);
}
//#################
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
//#################################################################### Sidebar-derived lists ####################################################################
function sort_names_last(arr) {
  function last_name_key(name) {
    const s = String(name || '').trim();
    if (!s) return '';
    const parts = s.split(/\s+/);
    return parts[parts.length - 1].toLowerCase();
  }

  return (arr || []).slice().sort((a, b) => {
    const ka = last_name_key(a);
    const kb = last_name_key(b);
    if (ka !== kb) return ka < kb ? -1 : 1;
    return String(a).localeCompare(String(b));
  });
}
//#################
function roster_groups_from_map(map_obj, suffix) {
  const src = (map_obj && typeof map_obj === 'object') ? map_obj : {};
  return Object.keys(src).sort().map(team => ({
    label: suffix ? `${team} — ${suffix}` : team,
    options: sort_names_last(src[team] || [])
  }));
}
//#################
function flat_from_roster_map(map_obj) {
  const src = (map_obj && typeof map_obj === 'object') ? map_obj : {};
  const out = [];
  Object.keys(src).forEach(team => {
    (src[team] || []).forEach(n => out.push(String(n || '').trim()));
  });
  return sort_names_last(Array.from(new Set(out.filter(Boolean))));
}
//#################
function roster_team_map_from_groups(groups) {
  const out = {};
  (groups || []).forEach(g => {
    const team = String(g.label || '').split(/\s*[—-]\s*/)[0].trim();
    (g.options || []).forEach(n => {
      const nm = String(n || '').trim();
      if (nm) out[nm] = team;
    });
  });
  return out;
}
//#################
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
//#################################################################### Grouping + allowed-sets helpers ####################################################################
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
//#################
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
//#################
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
//#################################################################### Fragment resolving + caching ####################################################################
function resolve_matchups_path(idx, year, rel_path) {
  const y = String(year ?? '');
  const root = idx?.fragment_roots?.[y] || '';

  if (!root || !rel_path) return null;

  return `${root}/${String(rel_path).replace(/^\/+/, '')}`.replace(/\/+/g, '/');
}
//#################
// function resolve_fragment(idx, year, mode, keys) {
//   if (!idx || !idx.modes || !idx.modes[mode]) return null;

//   let cur = idx.modes[mode].fragments;
//   if (!cur) return null;

//   cur = cur[String(year)];
//   if (!cur) return null;

//   for (const k of keys) {
//     if (!cur || typeof cur !== 'object') return null;
//     cur = cur[String(k)];
//   }

//   return (typeof cur === 'string') ? cur : null;
// }
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

  if (typeof cur !== 'string') return null;

  return resolve_matchups_path(idx, year, cur);
}
//#################
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
//#################################################################### Projected pitchers (StatsAPI probables -> sp_vs_team fragments) ####################################################################
function remove_accents(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}
//#################
function to_yyyy_mm_dd_local(d) {
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
//#################
function add_days_local(d, days) {
  const x = new Date(d.getTime());
  x.setDate(x.getDate() + Number(days || 0));
  return x;
}
//#################
function mmdd_key_local(d) {
  const mm = d.getMonth() + 1; // 1-12
  const dd = d.getDate();      // 1-31
  return (mm * 100) + dd;      // e.g. Apr 5 => 405
}
//#################
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
//#################
function normalize_matchups_team_code(team) {
  const t = String(team || '').trim().toUpperCase();
  if (!t) return '';
  if (t === 'CWS') return 'CHW';
  return t;
}

// MLB teamId
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
  133: 'ATH',
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
  145: 'CHW',
  146: 'MIA',
  147: 'NYY',
  158: 'MIL',
};
//#################
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
//#################################################################### Sorting helpers ####################################################################
function matchup_sort_key(team, opp) {
  const a = String(team || '').trim();
  const b = String(opp || '').trim();
  const lo = (a && b) ? (a < b ? a : b) : (a || b);
  const hi = (a && b) ? (a < b ? b : a) : '';
  return `${lo}||${hi}`;
}
//#################
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
//#################################################################### Matchups page init ####################################################################
function init_matchups_page_if_present(content_root) {
  if (!content_root) return;

  const mode_root = content_root.querySelector('#matchups_mode_root');
  const form_root = content_root.querySelector('#matchups_form_root');
  let results_root = content_root.querySelector('#matchups_results_root');
  if (!mode_root || !form_root || !results_root) return;

  if (form_root.dataset.inited === '1') return;
  form_root.dataset.inited = '1';

  mode_root.innerHTML = '';
  form_root.innerHTML = '';
  results_root.innerHTML = '';

  const multi_form_state = {
    multi_starter: { n: 1, rows: [] }, // [{ pitcher, side, team }]
    multi_hitter: { n: 1, rows: [] },  // [{ hitter, side, pitcher }]
    multi_hitter_today: { n: 1, rows: [] }, // [{ hitter }]
    multi_hitter_week: { n: 1, rows: [] },  // [{ hitter }]
  };

  //#################################################################### Small helpers ####################################################################
  function clamp_rows_n(x) {
    const v = Number(x);
    if (!Number.isFinite(v)) return 1;
    return Math.max(1, Math.min(15, Math.floor(v)));
  }
  //#################
  function snapshot_multi_state(mode) {
    if (
      mode !== 'multi_starter' &&
      mode !== 'multi_hitter' &&
      mode !== 'multi_hitter_today' &&
      mode !== 'multi_hitter_week'
    ) return;

    const st = multi_form_state[mode];
    const n = clamp_rows_n(st.n);

    const out = [];
    for (let i = 0; i < n; i++) {
      if (mode === 'multi_starter') {
        const p = document.getElementById(`matchups_pitcher_${i}`)?.value || '';
        const s = document.getElementById(`matchups_side_${i}`)?.value || '';
        const t = document.getElementById(`matchups_team_${i}`)?.value || '';
        out.push({ pitcher: p, side: s, team: t });
      } else if (mode === 'multi_hitter') {
        const h = document.getElementById(`matchups_hitter_${i}`)?.value || '';
        const s = document.getElementById(`matchups_side_${i}`)?.value || '';
        const p = document.getElementById(`matchups_pitcher_${i}`)?.value || '';
        out.push({ hitter: h, side: s, pitcher: p });
      } else {
        const h = document.getElementById(`matchups_hitter_${i}`)?.value || '';
        out.push({ hitter: h });
      }
    }

    st.rows = out;
    st.n = n;
  }
  //#################################################################### Mode bar ####################################################################
  const mode_bar = document.createElement('div');
  mode_bar.className = 'matchups_mode_bar';

  const mode_select = document.createElement('select');
  mode_select.style.padding = '8px 10px';
  mode_select.style.border = '1px solid var(--border)';
  mode_select.style.borderRadius = '10px';

  const modes = [
    ['gameday_matchup', 'Gameday Matchup Preview'],
    ['projected_pitchers', 'Projected Starting Pitchers'],
    ['best_worst_hitters', 'Projected Best and Worst Hitters'],
    ['favorite_hitters_today', "Project Today's Favorite Hitters"],
    ['multi_hitter_today', "Project Today's Fantasy Lineup"],
    ['multi_hitter_week', "Project Weekly Fantasy Hitter Moves"],
    ['multi_starter', 'Specific Starting Pitcher Matchups'],
    ['rp_inning', 'Specific Reliever Inning Preview'],
    ['multi_hitter', 'Specific Hitter Matchups'],
  ];

  modes.forEach(m => {
    const o = document.createElement('option');
    o.value = m[0];
    o.textContent = m[1];
    mode_select.appendChild(o);
  });

  const row_controls = document.createElement('div');
  row_controls.className = 'matchups_row_controls';
  row_controls.style.display = 'none';
  row_controls.style.alignItems = 'center';
  row_controls.style.gap = '8px';

  const rows_label = document.createElement('div');
  rows_label.style.fontSize = '12px';
  rows_label.style.fontWeight = '700';
  rows_label.style.color = 'var(--muted)'
  rows_label.textContent = 'Rows: 1';

  const rows_minus = document.createElement('button');
  rows_minus.type = 'button';
  rows_minus.className = 'matchups_submit matchups_rows_btn';
  rows_minus.textContent = '−';

  const rows_plus = document.createElement('button');
  rows_plus.type = 'button';
  rows_plus.className = 'matchups_submit matchups_rows_btn';
  rows_plus.textContent = '+';

  row_controls.appendChild(rows_label);
  row_controls.appendChild(rows_minus);
  row_controls.appendChild(rows_plus);

  mode_bar.appendChild(mode_select);
  // mode_bar.appendChild(row_controls);
  mode_root.appendChild(mode_bar);

  //#################
  function sync_row_controls() {
    const mode = mode_select.value;
    const is_multi = (
      mode === 'multi_starter' ||
      mode === 'multi_hitter' ||
      mode === 'multi_hitter_today' ||
      mode === 'multi_hitter_week'
    );

    row_controls.style.display = is_multi ? 'flex' : 'none';

    if (is_multi) {
      const n = clamp_rows_n(multi_form_state[mode].n);
      multi_form_state[mode].n = n;
      rows_label.textContent = `Rows: ${n}`;
      rows_minus.disabled = (n <= 1);
      rows_plus.disabled = (n >= 15);
    }
  }

  rows_minus.addEventListener('click', (e) => {
    e.preventDefault();

    const mode = mode_select.value;
    if (
      mode !== 'multi_starter' &&
      mode !== 'multi_hitter' &&
      mode !== 'multi_hitter_today' &&
      mode !== 'multi_hitter_week'
    ) return;

    snapshot_multi_state(mode);
    multi_form_state[mode].n = clamp_rows_n(multi_form_state[mode].n - 1);
    sync_row_controls();
    build_form();
  });

  rows_plus.addEventListener('click', (e) => {
    e.preventDefault();

    const mode = mode_select.value;
    if (
      mode !== 'multi_starter' &&
      mode !== 'multi_hitter' &&
      mode !== 'multi_hitter_today' &&
      mode !== 'multi_hitter_week'
    ) return;

    snapshot_multi_state(mode);
    multi_form_state[mode].n = clamp_rows_n(multi_form_state[mode].n + 1);
    sync_row_controls();
    build_form();
  });

  sync_row_controls();

  //#################################################################### Render helpers ####################################################################
  function clear_results() {
    results_root.innerHTML = '';
  }
  //#################
  function parse_matchup_stat_number(s) {
    const raw = String(s || '').trim();
    if (!raw) return NaN;

    const x = raw.replace(/,/g, '');
    const m = x.match(/-?(?:\d+(?:\.\d*)?|\.\d+)/);
    return m ? Number(m[0]) : NaN;
  }
  //#################
  function header_index(header, name) {
    return (header || []).findIndex(h => String(h || '').trim() === String(name || '').trim());
  }
  //#################
  function row_sample_alpha_mult(header, row_cells, opts) {
    const options = (opts && typeof opts === 'object') ? opts : {};

    const idx_pa = header_index(header, 'PA');
    if (idx_pa >= 0) {
      const pa = parse_matchup_stat_number(row_cells[idx_pa]);
      if (Number.isFinite(pa)) {
        const t = clamp(pa / 200, 0, 1);
        return 0.25 + 0.75 * (t ** 2);
      }
    }

    const idx_ip = header_index(header, 'IP');
    if (idx_ip >= 0) {
      const ip = parse_matchup_stat_number(row_cells[idx_ip]);
      if (Number.isFinite(ip)) {
        const thresh = options.invert_stats ? 25 : 50;
        const t = clamp(ip / thresh, 0, 1);
        return 0.25 + 0.75 * (t ** 2);
      }
    }

    return 1;
  }
  //#################
  function clamp(x, lo, hi) {
    return Math.max(lo, Math.min(hi, x));
  }
  //#################
  function rgba_from_two_sided_value(v, worst, neutral_lo, neutral_hi, best, alpha_mult = 1) {
    const val = Number(v);
    if (!Number.isFinite(val)) return '';

    const lo = Math.min(worst, best);
    const hi = Math.max(worst, best);
    const vv = clamp(val, lo, hi);

    const nlo = Math.min(neutral_lo, neutral_hi);
    const nhi = Math.max(neutral_lo, neutral_hi);

    if (vv >= nlo && vv <= nhi) return '';

    const frac = (vv - worst) / (best - worst);
    const f = clamp(frac, 0, 1);

    const alpha_min = 0.25;
    const alpha_max = 0.95;
    const alpha_curve_pow = 0.40;

    const d = clamp(Math.abs(f - 0.5) * 2.0, 0, 1);
    let a = alpha_min + (alpha_max - alpha_min) * Math.pow(d, alpha_curve_pow);
    a = clamp(a * Number(alpha_mult || 1), 0, 1);

    if (f > 0.5) return `rgba(210,35,35,${a.toFixed(3)})`;
    return `rgba(35,85,210,${a.toFixed(3)})`;
  }
  //#################
  function is_matchup_stat_col(header_text) {
    const h = String(header_text || '').trim();
    return h.startsWith('+');
  }
  //#################
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
  //#################
  function is_fallback_heat_col(header_text) {
    const h = String(header_text || '').trim();
    return ['All', 'RHB', 'LHB', 'FB', 'SI', 'CT', 'SL', 'SW', 'CB', 'CH', 'SP'].includes(h);
  }
  //#################
  async function ensure_year_page_lookup_loaded() {
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
//#################
function matchup_name_col_idx(header) {
  const cols = (header || []).map(x => String(x || '').trim());

  for (const name of ['Name', 'Pitcher', 'Hitter']) {
    const idx = cols.findIndex(x => x === name);
    if (idx >= 0) return idx;
  }

  return -1;
}
//#################
function infer_matchup_link_role(header, explicit_role) {
  const forced = String(explicit_role || '').trim();
  if (forced) return forced;

  const cols = new Set((header || []).map(x => String(x || '').trim()));

  if (cols.has('Pitcher')) return 'starters';

  if (cols.has('IP') && !cols.has('PA')) {
    if (cols.has('RHB') || cols.has('LHB')) return 'starters';
    return 'starters';
  }

  if (cols.has('PA')) return 'batters';
  if (cols.has('AVG') || cols.has('OBP') || cols.has('SLG') || cols.has('OPS')) return 'batters';

  return '';
}
//#################
function resolve_matchup_player_href(name, role, year) {
  const lookup = (year_page_lookup && typeof year_page_lookup === 'object') ? year_page_lookup : null;
  if (!lookup) return '';

  const person_key = normalize_matchup_person_key(name);
  const role_key = String(role || '').trim();
  if (!person_key || !role_key) return '';

  const preferred_year = String(year || window.DEFAULT_SEASON_YEAR || '').trim();

  const years_to_try = [
    preferred_year,
    ...Object.keys(lookup || {}).sort((a, b) => Number(b) - Number(a))
  ].filter(Boolean);

  function find_slug_in_bucket(bucket, wanted_role, wanted_person_key) {
    if (!bucket || typeof bucket !== 'object') return '';

    for (const [slug, meta] of Object.entries(bucket)) {
      if (!meta || typeof meta !== 'object') continue;

      const meta_role = String(meta.role || '').trim();
      const meta_person_key = String(meta.person_key || '').trim();

      if (meta_role === wanted_role && meta_person_key === wanted_person_key) {
        return slug;
      }
    }

    return '';
  }

  for (const y of years_to_try) {
    const bucket = lookup[y];
    const slug = find_slug_in_bucket(bucket, role_key, person_key);
    if (slug) return `#${slug}`;
  }

  return '';
}
//#################
function append_matchup_player_link(td, raw_text, header, col_idx, link_role, link_year) {
  const name_idx = matchup_name_col_idx(header);
  const is_name_col = (col_idx === name_idx);

  if (!is_name_col) {
    td.textContent = raw_text;
    return;
  }

  const href = resolve_matchup_player_href(raw_text, link_role, link_year);
  if (!href) {
    td.textContent = raw_text;
    return;
  }

  const a = document.createElement('a');
  a.href = href;
  a.textContent = raw_text;
  a.className = 'matchups_player_link';

  td.textContent = '';
  td.appendChild(a);
}
//#################
  // async function render_fragments(paths, opts) {
  //   clear_results();

  //   const options = (opts && typeof opts === 'object') ? opts : {};
  //   const invert_stats = !!options.invert_stats;
  //   const requested_drop_cols = Array.isArray(options.drop_cols) ? options.drop_cols : [];
  //   const dummy_rows = Array.isArray(options.dummy_rows) ? options.dummy_rows : [];
  //   const override_rows = Array.isArray(options.override_rows) ? options.override_rows : [];
  //   const compact_table = !!options.compact_table;
  //   const keep_all_pitch_cols = !!options.keep_all_pitch_cols;
  async function render_fragments(paths, opts) {
    const options = (opts && typeof opts === 'object') ? opts : {};
    const skip_clear = !!options.skip_clear;

    if (!skip_clear) {
      clear_results();
    }

    const invert_stats = !!options.invert_stats;
    const requested_drop_cols = Array.isArray(options.drop_cols) ? options.drop_cols : [];
    const dummy_rows = Array.isArray(options.dummy_rows) ? options.dummy_rows : [];
    const override_rows = Array.isArray(options.override_rows) ? options.override_rows : [];
    const compact_table = !!options.compact_table;
    const keep_all_pitch_cols = !!options.keep_all_pitch_cols;
    await ensure_year_page_lookup_loaded();

  const link_role = infer_matchup_link_role(header, options.link_role);
  const link_year = String(
    options.link_year ||
    document.getElementById('matchups_year')?.value ||
    window.DEFAULT_SEASON_YEAR ||
    ''
  ).trim();

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

    if ((!header || !rows.length) && dummy_rows.length) {
      const union_header = [];

      dummy_rows.forEach(x => {
        (x?.header_cells || []).forEach(h => {
          const hh = String(h || '').trim();
          if (hh && !union_header.includes(hh)) union_header.push(hh);
        });
      });

      header = union_header.slice();

      dummy_rows.forEach(x => {
        const row_header = Array.isArray(x?.header_cells) ? x.header_cells : [];
        const row_cells_src = Array.isArray(x?.row_cells) ? x.row_cells : [];

        const row_map = {};
        row_header.forEach((h, i) => {
          row_map[String(h || '').trim()] = row_cells_src[i];
        });

        rows.push(header.map(h => {
          const v = row_map[String(h || '').trim()];
          return (v == null || String(v).trim() === '') ? '—' : v;
        }));
      });
    }

    if (!header || !rows.length) return;

    // Remove Park / ParkFactor columns and hide empty pitch columns
    const drop_cols = new Set(['Throws', 'Bats', 'Park', 'ParkFactor', ...requested_drop_cols]);

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
      if (pitch_cols.has(name) && !col_has_value[i] && !keep_all_pitch_cols) return;

      keep_idx.push(i);
    });

    header = keep_idx.map(i => header[i]);
    rows.forEach((r, k) => {
      rows[k] = keep_idx.map(i => r[i]);
    });

    if (override_rows.length) {
      rows.forEach((r, row_idx) => {
        const override = override_rows[row_idx] || null;
        if (!override || typeof override !== 'object') return;

        header.forEach((col_name, col_idx) => {
          if (Object.prototype.hasOwnProperty.call(override, col_name)) {
            r[col_idx] = override[col_name];
          }
        });
      });
    }
    //#################
    function decimals_in_raw(raw) {
      const s = String(raw || '').trim();
      const m = s.match(/-?(?:\d+)(?:\.(\d+))?/);
      if (!m) return null;
      return m[1] ? m[1].length : 0;
    }
    //#################
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
    table.style.tableLayout = 'auto';

    if (compact_table) {
      table.classList.add('compact_matchup_table');
    }

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
    rows.forEach((r, row_idx) => {
      const tr = document.createElement('tr');
      tr.dataset.entryOrder = String(row_idx);

      const alpha_mult = row_sample_alpha_mult(header, r, options);

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
        // td.textContent = raw;
        append_matchup_player_link(td, raw, header, j, link_role, link_year);

        if (is_matchup_stat_col(h)) {
          const v0 = parse_matchup_stat_number(raw);
          if (Number.isFinite(v0)) {
            const v = invert_stats ? -v0 : v0;

            if (invert_stats) {
              const txt = format_like_raw(raw, v);
              td.textContent = (v > 0 ? `+${txt}` : String(txt));
            }

            const is_all = String(h || '').trim() === '+All';
            const worst = is_all ? -40 : -70;
            const best = is_all ? 40 : 70;

            td.style.background = rgba_from_two_sided_value(v, worst, -5, 10, best, alpha_mult);
            td.style.color = 'var(--text)';
          }
        }

        if (is_fallback_heat_col(h)) {
          const v = parse_matchup_stat_number(raw);
          if (Number.isFinite(v)) {
            const is_allish = (h === 'All' || h === 'RHB' || h === 'LHB');
            const worst = is_allish ? -40 : -70;
            const best = is_allish ? 40 : 70;
            const neutral_lo = is_allish ? -5 : 0;
            const neutral_hi = 5;

            td.style.background = rgba_from_two_sided_value(v, worst, neutral_lo, neutral_hi, best, alpha_mult);
            td.style.color = 'var(--text)';
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
  //#################
  async function all_value_for_fragment(path) {
    const html = await load_matchup_fragment(path);
    if (!html) return NaN;

    const parts = extract_table_parts(html);
    if (!parts || !parts.header_cells.length || !parts.row_cells.length) return NaN;

    const idx_all = parts.header_cells.findIndex(h => String(h || '').trim() === '+All');
    if (idx_all < 0) return NaN;

    return parse_matchup_stat_number(parts.row_cells[idx_all]);
  }
  //#################
  // function resolve_sp_vs_team_path(idx, y, pitcher, side, opp) {
  //   const mode_root = idx?.modes?.sp_vs_team?.fragments?.[String(y)];
  //   if (!mode_root || typeof mode_root !== 'object') return null;

  //   const pitcher_key = find_fragment_key_loose(mode_root, pitcher);
  //   if (!pitcher_key) {
  //     dbg('resolve_sp_vs_team_path pitcher miss', {
  //       year: y,
  //       pitcher,
  //       side,
  //       opp,
  //       pitcher_keys_sample: Object.keys(mode_root).slice(0, 20)
  //     });
  //     return null;
  //   }

  //   function try_side(side_value) {
  //     for (const s2 of side_aliases(side_value)) {
  //       const side_root = mode_root?.[pitcher_key]?.[String(s2)];
  //       if (!side_root || typeof side_root !== 'object') continue;

  //       const opp_key = find_fragment_key_loose(side_root, opp);
  //       if (opp_key) {
  //         return side_root[opp_key];
  //       }

  //       dbg('resolve_sp_vs_team_path opp miss in side', {
  //         year: y,
  //         pitcher,
  //         pitcher_key,
  //         side_value,
  //         side_key: s2,
  //         opp,
  //         opp_keys: Object.keys(side_root)
  //       });
  //     }

  //     return null;
  //   }

  //   let path = try_side(side);
  //   if (path) return path;

  //   const other = opposite_side(side);
  //   path = try_side(other);

  //   if (!path) {
  //     dbg('resolve_sp_vs_team_path full miss', {
  //       year: y,
  //       pitcher,
  //       pitcher_key,
  //       side,
  //       other_side: other,
  //       opp
  //     });
  //   }

  //   return path || null;
  // }
function resolve_sp_vs_team_path(idx, y, pitcher, side, opp) {
  const mode_root = idx?.modes?.sp_vs_team?.fragments?.[String(y)];
  if (!mode_root || typeof mode_root !== 'object') return null;

  const pitcher_key = find_fragment_key_loose(mode_root, pitcher);
  if (!pitcher_key) {
    dbg('resolve_sp_vs_team_path pitcher miss', {
      year: y,
      pitcher,
      side,
      opp,
      pitcher_keys_sample: Object.keys(mode_root).slice(0, 20)
    });
    return null;
  }

  function try_side(side_value) {
    for (const s2 of side_aliases(side_value)) {
      const side_root = mode_root?.[pitcher_key]?.[String(s2)];
      if (!side_root || typeof side_root !== 'object') continue;

      const opp_key = find_fragment_key_loose(side_root, opp);
      if (opp_key) {
        return resolve_matchups_path(idx, y, side_root[opp_key]);
      }

      dbg('resolve_sp_vs_team_path opp miss in side', {
        year: y,
        pitcher,
        pitcher_key,
        side_value,
        side_key: s2,
        opp,
        opp_keys: Object.keys(side_root)
      });
    }

    return null;
  }

  let path = try_side(side);
  if (path) return path;

  const other = opposite_side(side);
  path = try_side(other);

  if (!path) {
    dbg('resolve_sp_vs_team_path full miss', {
      year: y,
      pitcher,
      pitcher_key,
      side,
      other_side: other,
      opp
    });
  }

  return path || null;
}
  //#################
  async function build_pitcher_panel_section(idx_obj, year_lists_obj, year_val, pitcher_name, side, opp_team, logo_team, side_text) {
    const path = pitcher_name ? resolve_sp_vs_team_path(idx_obj, year_val, pitcher_name, side, opp_team) : null;

    if (path) {
      return {
        title: '',
        hide_title: true,
        logo_team,
        side_text,
        paths: [path],
        opts: {
          drop_cols: ['Team', 'Opp', 'Away', 'Bats', 'Throws'],
          compact_table: true
        }
      };
    }

    return {
      title: '',
      hide_title: true,
      logo_team,
      side_text,
      paths: [],
      opts: {
        compact_table: true,
        dummy_rows: build_personalized_pitcher_fallback_dummy_rows(year_lists_obj, pitcher_name, year_val)
      }
    };
  }
  //#################
  function fallback_rec_for_name(map_obj, name) {
    const m = (map_obj && typeof map_obj === 'object') ? map_obj : {};
    const direct = m[String(name || '').trim()];
    if (direct && typeof direct === 'object') return direct;

    const wanted = normalize_matchup_person_key(name);
    if (!wanted) return null;

    for (const [k, rec] of Object.entries(m)) {
      if (normalize_matchup_person_key(k) === wanted && rec && typeof rec === 'object') {
        return rec;
      }
    }

    return null;
  }
  //#################
  function round_matchup_value(v, digits) {
    const n = Number(v);
    if (!Number.isFinite(n)) return NaN;

    const d = Number.isFinite(Number(digits)) ? Number(digits) : 2;
    const p = 10 ** d;
    return Math.round((n + Number.EPSILON) * p) / p;
  }
  //#################
  function display_stat(v, digits) {
    const n = round_matchup_value(v, digits);
    if (!Number.isFinite(n)) return '—';

    const s = n.toFixed(digits);
    return s.replace(/\.?0+$/, '');
  }
  //#################
  function dummy_row_all_value(row) {
    if (!row || !Array.isArray(row.header_cells) || !Array.isArray(row.row_cells)) return NaN;

    const idx = row.header_cells.findIndex(h => String(h || '').trim() === 'All');
    if (idx < 0) return NaN;

    return parse_matchup_stat_number(row.row_cells[idx]);
  }
  //#################
  function sort_dummy_rows_by_all_desc(dummy_rows) {
    return (dummy_rows || []).slice().sort((a, b) => {
      const av = dummy_row_all_value(a);
      const bv = dummy_row_all_value(b);

      const a_ok = Number.isFinite(av);
      const b_ok = Number.isFinite(bv);

      if (a_ok && b_ok) return bv - av;
      if (a_ok && !b_ok) return -1;
      if (!a_ok && b_ok) return 1;
      return 0;
    });
  }
  //#################
  function finite_num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  }
  //#################
  function display_num(v) {
    return display_stat(v, 2);
  }
  //#################
  function display_sample(v) {
    const n = Number(v);
    return Number.isFinite(n) ? display_stat(n, 1) : '—';
  }
  //#################
  function display_ip(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n.toFixed(1) : '—';
  }
  //#################
  function fallback_display_all(rec, current_year) {
    if (!rec || typeof rec !== 'object') return NaN;

    const display_all = finite_num(rec.display_all);
    if (Number.isFinite(display_all)) return display_all;

    const all_v = finite_num(rec.all);
    if (Number.isFinite(all_v)) return all_v;

    return NaN;
  }
  //#################
  function effective_hitter_side(hitter_bat, pitcher_throw) {
    const b = String(hitter_bat || '').trim().toUpperCase();
    const t = String(pitcher_throw || '').trim().toUpperCase();

    if (b === 'L' || b === 'R') return b;
    if (b === 'S') {
      if (t === 'L') return 'R';
      if (t === 'R') return 'L';
    }

    return '';
  }
  //#################
  function hitter_split_col_from_pitcher_throw(pitcher_throw) {
    const t = String(pitcher_throw || '').trim().toUpperCase();
    if (t === 'L') return 'LHP';
    if (t === 'R') return 'RHP';
    return '';
  }
  //#################
  function pitch_cols_for_pitcher_side(pitcher_rec, hitter_side_effective) {
    const out = [];
    const side = String(hitter_side_effective || '').trim().toUpperCase();
    if (!pitcher_rec || !side) return out;

    ['FB', 'SI', 'CT', 'SL', 'SW', 'CB', 'CH', 'SP'].forEach(pt => {
      const col = `${pt} ${side}`;
      if (Number.isFinite(finite_num(pitcher_rec[col]))) {
        out.push(pt);
      }
    });

    return out;
  }
  //#################
  function build_personalized_hitter_fallback_rows(year_lists_obj, hitters_list, pitcher_name, current_year) {
    const hitter_map = (year_lists_obj && year_lists_obj.fallback_hitter_all && typeof year_lists_obj.fallback_hitter_all === 'object')
      ? year_lists_obj.fallback_hitter_all
      : {};

    const pitcher_map = (year_lists_obj && year_lists_obj.fallback_pitcher_all && typeof year_lists_obj.fallback_pitcher_all === 'object')
      ? year_lists_obj.fallback_pitcher_all
      : {};

    const pitcher_rec = fallback_rec_for_name(pitcher_map, pitcher_name);
    const pitcher_throw = String((pitcher_rec && pitcher_rec.throws) || '').trim().toUpperCase();

    const rows = [];
    const pitch_union = new Set();

    (hitters_list || []).forEach(hitter_name => {
      const rec = fallback_rec_for_name(hitter_map, hitter_name);
      if (!rec) {
        rows.push({
          name: String(hitter_name || ''),
          pa: '—',
          all: '—',
          year: '—',
          pitch_vals: {}
        });
        return;
      }

      const hitter_bat = String(rec.bats || '').trim().toUpperCase();
      const eff_side = effective_hitter_side(hitter_bat, pitcher_throw);
      const hitter_all_col = hitter_split_col_from_pitcher_throw(pitcher_throw);

      let all_val = NaN;
      let year_text = String(rec.year || '—').trim() || '—';
      let pitch_vals = {};

      const handed_all_val = finite_num(rec[hitter_all_col]);
      const can_use_handed_all = pitcher_throw && hitter_all_col && Number.isFinite(handed_all_val);

      if (can_use_handed_all) {
        all_val = handed_all_val;
      } else {
        all_val = fallback_display_all(rec, current_year);
      }

      if (pitcher_rec && pitcher_throw && eff_side) {
        const pitcher_pitchs = pitch_cols_for_pitcher_side(pitcher_rec, eff_side);
        pitcher_pitchs.forEach(pt => {
          pitch_union.add(pt);
          const col = `${pt} ${pitcher_throw}`;
          const v = finite_num(rec[col]);
          pitch_vals[pt] = Number.isFinite(v) ? display_num(v) : '—';
        });
      } else {
        pitch_vals = {};
      }

      rows.push({
        name: String(hitter_name || ''),
        pa: display_sample(rec.PA),
        all: display_num(all_val),
        year: year_text,
        pitch_vals
      });
    });

    const pitch_headers = ['FB', 'SI', 'CT', 'SL', 'SW', 'CB', 'CH', 'SP'].filter(pt => pitch_union.has(pt));

    const header_cells = ['Name', 'PA', 'All', ...pitch_headers, 'Year'];

    const dummy_rows = rows.map(r => ({
      header_cells: header_cells.slice(),
      row_cells: [
        r.name,
        r.pa,
        r.all,
        ...pitch_headers.map(pt => r.pitch_vals[pt] || '—'),
        r.year
      ]
    }));

    return sort_dummy_rows_by_all_desc(dummy_rows);
  }
  //#################
  function build_personalized_pitcher_fallback_dummy_rows(year_lists_obj, pitcher_name, current_year) {
    const pitcher_map = (year_lists_obj && year_lists_obj.fallback_pitcher_all && typeof year_lists_obj.fallback_pitcher_all === 'object')
      ? year_lists_obj.fallback_pitcher_all
      : {};

    const rec = fallback_rec_for_name(pitcher_map, pitcher_name);
    if (!rec) {
      return [{
        header_cells: ['Name', 'IP', 'All', 'RHB', 'LHB', 'Year'],
        row_cells: [String(pitcher_name || 'TBD'), '—', '—', '—', '—', '—']
      }];
    }

    const all_val = fallback_display_all(rec, current_year);

    function first_finite(obj, keys) {
      for (const k of keys) {
        const v = finite_num(obj[k]);
        if (Number.isFinite(v)) return v;
      }
      return NaN;
    }

    const pitch_headers = ['FB', 'SI', 'CT', 'SL', 'SW', 'CB', 'CH', 'SP'].filter(pt => {
      return Number.isFinite(first_finite(rec, [
        pt,
        `${pt} R`,
        `${pt} L`,
        `${pt} RHB`,
        `${pt} LHB`
      ]));
    });

    const pitch_totals = {};
    pitch_headers.forEach(pt => {
      const v_total = first_finite(rec, [pt]);
      const v_r = first_finite(rec, [`${pt} R`, `${pt} RHB`]);
      const v_l = first_finite(rec, [`${pt} L`, `${pt} LHB`]);

      if (Number.isFinite(v_total)) {
        pitch_totals[pt] = display_num(v_total);
      } else if (Number.isFinite(v_r) && Number.isFinite(v_l)) {
        pitch_totals[pt] = display_num(v_r + v_l);
      } else if (Number.isFinite(v_r)) {
        pitch_totals[pt] = display_num(v_r);
      } else if (Number.isFinite(v_l)) {
        pitch_totals[pt] = display_num(v_l);
      } else {
        pitch_totals[pt] = '—';
      }
    });

    return [{
      header_cells: ['Name', 'IP', 'All', 'RHB', 'LHB', ...pitch_headers, 'Year'],
      row_cells: [
        String(pitcher_name || 'TBD'),
        display_ip(rec.IP),
        display_num(all_val),
        display_num(first_finite(rec, ['RHB', 'R', 'vs RHB'])),
        display_num(first_finite(rec, ['LHB', 'L', 'vs LHB'])),
        ...pitch_headers.map(pt => pitch_totals[pt] || '—'),
        String(rec.year || '—').trim() || '—'
      ]
    }];
  }
  //#################
  async function build_lineup_sections(idx_obj, year_lists_obj, year_val, hitters_list, side, pitcher_name, title_matchup, title_fallback) {
    const matchup_paths = [];
    const fallback_hitters = [];

    for (const hitter_name of (hitters_list || [])) {
      const path = resolve_hvp_with_pf_fallback(idx_obj, year_val, hitter_name, side, pitcher_name);

      if (path) {
        matchup_paths.push(path);
        continue;
      }

      fallback_hitters.push(hitter_name);
    }

    const sorted_matchup_paths = await sort_paths_by_all(matchup_paths, true);

    const sections = [];

    if (sorted_matchup_paths.length) {
      sections.push({
        title: title_matchup,
        paths: sorted_matchup_paths,
        opts: {
          drop_cols: ['Team', 'Pitcher', 'Opp', 'Away', 'IP', 'Bats', 'Throws']
        }
      });
    }

if (fallback_hitters.length) {
  const fallback_dummy_rows = build_personalized_hitter_fallback_rows(
    year_lists_obj,
    fallback_hitters,
    pitcher_name,
    year_val
  );

  sections.push({
    title: title_fallback,
    hide_title: false,
    paths: [],
    opts: {
      dummy_rows: fallback_dummy_rows
    }
  });
}

    return sections;
  }
  //#################
  function sort_first_results_table_by_team_name() {
    const results = document.getElementById('matchups_results_root');
    if (!results) return;

    const table = results.querySelector('table.matchup_table');
    if (!table) return;

    const thead = table.querySelector('thead');
    const tbody = table.querySelector('tbody');
    if (!thead || !tbody) return;

    const ths = Array.from(thead.querySelectorAll('th'));
    const idx_team = ths.findIndex(th => String(th.textContent || '').trim() === 'Team');
    const idx_opp = ths.findIndex(th => String(th.textContent || '').trim() === 'Opp');

    if (idx_team < 0) return;

    const trs = Array.from(tbody.querySelectorAll('tr'));

    trs.sort((a, b) => {
      const at = String(a.children[idx_team] ? a.children[idx_team].textContent : '').trim();
      const bt = String(b.children[idx_team] ? b.children[idx_team].textContent : '').trim();
      if (at !== bt) return at.localeCompare(bt);

      if (idx_opp >= 0) {
        const ao = String(a.children[idx_opp] ? a.children[idx_opp].textContent : '').trim();
        const bo = String(b.children[idx_opp] ? b.children[idx_opp].textContent : '').trim();
        if (ao !== bo) return ao.localeCompare(bo);
      }

      return 0;
    });

    trs.forEach(tr => tbody.appendChild(tr));
  }
  //#################
  async function render_section_into(mount, sec) {
    const prev = results_root;
    results_root = mount;
    try {
      await render_fragments(sec.paths || [], sec.opts || null);
    } finally {
      results_root = prev;
    }
  }
  //#################
  async function sort_paths_by_all(paths, desc) {
    const cleaned = (paths || []).filter(Boolean);

    const scored = await Promise.all(
      cleaned.map(async p => ({ p, v: await all_value_for_fragment(p) }))
    );

    scored.sort((a, b) => {
      const ao = Number.isFinite(a.v);
      const bo = Number.isFinite(b.v);

      if (ao && bo) return desc ? (b.v - a.v) : (a.v - b.v);
      if (ao && !bo) return -1;
      if (!ao && bo) return 1;
      return 0;
    });

    return scored.map(x => x.p);
  }
  //#################
  function normalize_fragment_lookup_key(s) {
    return remove_accents(String(s || ''))
      .replace(/[_\-]+/g, ' ')
      .replace(/\.(?=$|\s)/g, ' ')
      .replace(/[^a-zA-Z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }
  //#################
function find_fragment_key_loose(obj, wanted_name) {
  const src = (obj && typeof obj === 'object') ? obj : null;
  if (!src) return '';

  const wanted_raw = String(wanted_name || '').trim();
  if (!wanted_raw) return '';

  const wanted_no_accents = remove_accents(wanted_raw);
  const wanted_no_trailing_period_words = wanted_no_accents.replace(/\.(?=$|\s)/g, '');

  const exact_candidates = [
    wanted_raw,
    wanted_no_accents,
    wanted_no_trailing_period_words,
    safe_page_filename(wanted_raw),
    safe_page_filename(wanted_no_accents),
    safe_page_filename(wanted_no_trailing_period_words)
  ].filter(Boolean);

  for (const k of exact_candidates) {
    if (Object.prototype.hasOwnProperty.call(src, k)) {
      return k;
    }
  }

  const wanted_norm = normalize_fragment_lookup_key(wanted_raw);

  for (const k of Object.keys(src)) {
    if (normalize_fragment_lookup_key(k) === wanted_norm) {
      return k;
    }
  }

  dbg('find_fragment_key_loose miss', {
    wanted_raw,
    wanted_no_accents,
    wanted_no_trailing_period_words,
    exact_candidates,
    wanted_norm,
    sample_keys: Object.keys(src).slice(0, 25),
    sample_norm_keys: Object.keys(src).slice(0, 25).map(k => ({
      key: k,
      norm: normalize_fragment_lookup_key(k)
    }))
  });

  return '';
}
   //#################
  // function resolve_hvp_with_pf_fallback(idx, y, hitter_name, side, pitcher_name) {
  //   const mode_root = idx?.modes?.hitter_vs_pitcher?.fragments?.[String(y)];
  //   if (!mode_root || typeof mode_root !== 'object') return null;

  //   const hitter_key = find_fragment_key_loose(mode_root, hitter_name);
  //   if (!hitter_key) {
  //     dbg('resolve_hvp_with_pf_fallback hitter miss', {
  //       year: y,
  //       hitter_name,
  //       side,
  //       pitcher_name,
  //       hitter_keys_sample: Object.keys(mode_root).slice(0, 15)
  //     });
  //     return null;
  //   }

  //   function try_side(side_value) {
  //     for (const s2 of side_aliases(side_value)) {
  //       const side_root = mode_root?.[hitter_key]?.[String(s2)];
  //       if (!side_root || typeof side_root !== 'object') continue;

  //       const pitcher_key = find_fragment_key_loose(side_root, pitcher_name);
  //       if (pitcher_key) {
  //         return side_root[pitcher_key];
  //       }

  //       dbg('resolve_hvp_with_pf_fallback pitcher miss in side', {
  //         year: y,
  //         hitter_name,
  //         hitter_key,
  //         side_value,
  //         side_key: s2,
  //         pitcher_name,
  //         pitcher_keys_sample: Object.keys(side_root).slice(0, 20)
  //       });
  //     }

  //     return null;
  //   }

  //   let path = try_side(side);
  //   if (path) return path;

  //   const other = opposite_side(side);
  //   path = try_side(other);

  //   if (!path) {
  //     dbg('resolve_hvp_with_pf_fallback full miss', {
  //       year: y,
  //       hitter_name,
  //       hitter_key,
  //       side,
  //       other_side: other,
  //       pitcher_name
  //     });
  //   }

  //   return path || null;
  // }
  function resolve_hvp_with_pf_fallback(idx, y, hitter_name, side, pitcher_name) {
  const mode_root = idx?.modes?.hitter_vs_pitcher?.fragments?.[String(y)];
  if (!mode_root || typeof mode_root !== 'object') return null;

  const hitter_key = find_fragment_key_loose(mode_root, hitter_name);
  if (!hitter_key) {
    dbg('resolve_hvp_with_pf_fallback hitter miss', {
      year: y,
      hitter_name,
      side,
      pitcher_name,
      hitter_keys_sample: Object.keys(mode_root).slice(0, 15)
    });
    return null;
  }

  function try_side(side_value) {
    for (const s2 of side_aliases(side_value)) {
      const side_root = mode_root?.[hitter_key]?.[String(s2)];
      if (!side_root || typeof side_root !== 'object') continue;

      const pitcher_key = find_fragment_key_loose(side_root, pitcher_name);
      if (pitcher_key) {
        return resolve_matchups_path(idx, y, side_root[pitcher_key]);
      }

      dbg('resolve_hvp_with_pf_fallback pitcher miss in side', {
        year: y,
        hitter_name,
        hitter_key,
        side_value,
        side_key: s2,
        pitcher_name,
        pitcher_keys_sample: Object.keys(side_root).slice(0, 20)
      });
    }

    return null;
  }

  let path = try_side(side);
  if (path) return path;

  const other = opposite_side(side);
  path = try_side(other);

  if (!path) {
    dbg('resolve_hvp_with_pf_fallback full miss', {
      year: y,
      hitter_name,
      hitter_key,
      side,
      other_side: other,
      pitcher_name
    });
  }

  return path || null;
}
  //#################
  function roster_hitters_for_team(roster_pack, team_code) {
    if (!roster_pack || typeof roster_pack !== 'object') return [];

    const hitters_by_team = (roster_pack.hitters_by_team && typeof roster_pack.hitters_by_team === 'object')
      ? roster_pack.hitters_by_team
      : {};

    const t = normalize_matchups_team_code(team_code);
    const alt = (t === 'CHW') ? 'CWS' : (t === 'CWS' ? 'CHW' : '');

    const arr = hitters_by_team[t] || (alt ? hitters_by_team[alt] : null);

    return Array.isArray(arr) ? arr.map(x => String(x || '').trim()).filter(Boolean) : [];
  }
  //#################
  function build_lineup_hvp_paths(idx, y, hitters_list, side, pitcher) {
    const paths = [];
    for (const h of (hitters_list || [])) {
      const p = resolve_hvp_with_pf_fallback(idx, y, h, side, pitcher);
      if (!p) continue;
      paths.push(p);
    }

    return paths;
  }
  //#################
  function build_slate_hvp_paths(idx, y, games, roster_pack) {
    const paths = [];

    for (const g of (games || [])) {
      const home_team = g.home_team;
      const away_team = g.away_team;

      const home_pitcher = g.home_pitcher;
      const away_pitcher = g.away_pitcher;

      const home_hitters = roster_hitters_for_team(roster_pack, home_team);
      const away_hitters = roster_hitters_for_team(roster_pack, away_team);

      if (home_pitcher) {
        paths.push(
          ...build_lineup_hvp_paths(idx, y, away_hitters, 'Away', home_pitcher)
        );
      }

      if (away_pitcher) {
        paths.push(
          ...build_lineup_hvp_paths(idx, y, home_hitters, 'Home', away_pitcher)
        );
      }
    }

    return [...new Set(paths)];
  }
  //#################
  async function render_multiple_fragments(sections, layout_opts) {
    clear_results();

    const options = (layout_opts && typeof layout_opts === 'object') ? layout_opts : {};
    const cols = Number.isFinite(Number(options.cols)) ? Math.max(1, Math.min(4, Math.floor(options.cols))) : 2;
    const gap = options.gap != null ? String(options.gap) : '10px';

    const grid = document.createElement('div');
    grid.className = 'matchups_results_grid';
    grid.style.gap = gap;
    grid.style.setProperty('--matchups_results_cols', String(cols));

    results_root.appendChild(grid);

    const original_results_root = results_root;

    for (const sec of (sections || [])) {
      const title = (sec && sec.title != null) ? String(sec.title) : '';
      const hide_title = !!(sec && sec.hide_title);
      const side_text = (sec && sec.side_text != null) ? String(sec.side_text) : '';
      const paths = (sec && Array.isArray(sec.paths)) ? sec.paths : [];
      const opts = (sec && sec.opts && typeof sec.opts === 'object') ? sec.opts : null;
      const logo_team = (sec && sec.logo_team != null) ? String(sec.logo_team) : '';

      const cell = document.createElement('div');
      if (sec && sec.cell_class) {
        cell.className = sec.cell_class;
      }

      if (logo_team) {
        const logo_wrap = document.createElement('div');
        logo_wrap.style.display = 'flex';
        logo_wrap.style.justifyContent = 'center';
        logo_wrap.style.alignItems = 'center';
        logo_wrap.style.margin = '2px 2px 6px 2px';

        logo_wrap.innerHTML = team_logo_html(logo_team);
        cell.appendChild(logo_wrap);
      }

      if (side_text) {
        const side_div = document.createElement('div');
        side_div.textContent = side_text;
        side_div.style.fontSize = '12px';
        side_div.style.fontWeight = '800';
        side_div.style.color = 'var(--muted)'
        side_div.style.margin = '0 2px 8px 2px';
        side_div.style.textAlign = 'center';
        cell.appendChild(side_div);
      }

      if (title && !hide_title) {
        const h = document.createElement('div');
        h.textContent = title;
        h.style.fontSize = '12px';
        h.style.fontWeight = '800';
        h.style.color = 'var(--muted)'
        h.style.margin = '0 2px 8px 2px';
        h.style.textAlign = 'center';
        cell.appendChild(h);
      }

      const mount = document.createElement('div');
      cell.appendChild(mount);
      grid.appendChild(cell);

      // render_fragments clears results_root, so temporarily redirect it to this cell
      const prev = results_root;
      results_root = mount;
      try {
        await render_fragments(paths || [], opts || null);
      } finally {
        results_root = prev;
      }
    }

    // restore (in case anything else relies on it later)
    results_root = original_results_root;
  }
  //#################################################################### Form builder ####################################################################
  async function build_form() {
    const skip_snapshot = form_root.dataset.skip_snapshot === '1';
    form_root.dataset.skip_snapshot = '0';
    const current_mode = mode_select.value;
    const built_mode = String(form_root.dataset.mode || '').trim();

    if (!skip_snapshot && built_mode && built_mode === current_mode) {
      snapshot_multi_state(current_mode);
    }

    const prev_year = document.getElementById('matchups_year')?.value || '';

    form_root.innerHTML = '';
    clear_results();

    const idx = await load_matchups_index();
    if (!idx) return;

    const lists = await load_matchups_lists();
    await load_matchups_rosters();

    dbg('build_form mode:', mode_select.value);
    dbg('idx years:', idx && idx.years ? idx.years : '(none)');
    dbg('lists years:', (lists && Array.isArray(lists.years)) ? lists.years : '(none)');
    //#################
    function derive_years(idx_obj) {
      const out = new Set();

      const direct = (idx_obj && idx_obj.years) ? idx_obj.years : [];
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
    //#################
    function year_has_any_fragments(idx_obj, y) {
      const yy = String(y || '').trim();
      if (!/^\d{4}$/.test(yy)) return false;

      const modes_obj = (idx_obj && idx_obj.modes) ? idx_obj.modes : {};
      for (const m of Object.keys(modes_obj)) {
        const fr = (modes_obj[m] && modes_obj[m].fragments) ? modes_obj[m].fragments : null;
        if (!fr || typeof fr !== 'object') continue;

        const root = fr[yy];
        if (root && typeof root === 'object' && Object.keys(root).length) return true;
      }

      return false;
    }

    let years = derive_years(idx);

    // Only keep years that actually have fragment trees in matchups_index.json.
    // This keeps the dropdown aligned with years that have real fragment folder output.
    years = (years || []).filter(y => year_has_any_fragments(idx, y));

    let hitters = [];
    let pitchers = [];
    let teams = [];
    let year_lists = { hitters_by_team: [], pitchers_by_team: [] };
    //#################
    const preferred_year = String(window.DEFAULT_SEASON_YEAR || '2026');
    //#################
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
      //#################
      function fallback_name_set_by_flag(map_obj, flag_name) {
        const out = new Set();

        Object.entries((map_obj && typeof map_obj === 'object') ? map_obj : {}).forEach(([name, rec]) => {
          if (rec && rec[flag_name]) out.add(String(name || '').trim());
        });

        return out;
      }
      //#################
      function filter_roster_map_to_allowed(map_obj, allowed_set) {
        const src = (map_obj && typeof map_obj === 'object') ? map_obj : {};
        const out = {};

        const allowed_norm = new Set(
          Array.from(allowed_set || []).map(x => normalize_matchup_person_key(x))
        );

        Object.keys(src).forEach(team => {
          const kept = (src[team] || []).filter(name => allowed_norm.has(normalize_matchup_person_key(name)));
          if (kept.length) out[team] = kept;
        });

        return out;
      }

      dbg('lists.by_year exists:', !!by_year);
      dbg('pack exists for year:', !!pack);
      if (by_year && !pack) dbg('available by_year years:', Object.keys(by_year).slice(0, 20));

      const rosters_obj = matchups_rosters || {};
      const roster_hitters_by_team = (rosters_obj && rosters_obj.hitters_by_team && typeof rosters_obj.hitters_by_team === 'object')
        ? rosters_obj.hitters_by_team
        : {};
      const roster_starters_by_team = (rosters_obj && rosters_obj.starters_by_team && typeof rosters_obj.starters_by_team === 'object')
        ? rosters_obj.starters_by_team
        : {};
      const roster_relievers_by_team = (rosters_obj && rosters_obj.relievers_by_team && typeof rosters_obj.relievers_by_team === 'object')
        ? rosters_obj.relievers_by_team
        : {};

      const fallback_hitter_map = (pack && pack.fallback_hitter_all && typeof pack.fallback_hitter_all === 'object')
        ? pack.fallback_hitter_all
        : {};

      const fallback_pitcher_map = (pack && pack.fallback_pitcher_all && typeof pack.fallback_pitcher_all === 'object')
        ? pack.fallback_pitcher_all
        : {};

      const hitter_allowed = fallback_name_set_by_flag(fallback_hitter_map, 'in_hitter_matchups');
      const starter_allowed = fallback_name_set_by_flag(fallback_pitcher_map, 'in_starter_matchups');
      const pitcher_allowed = fallback_name_set_by_flag(fallback_pitcher_map, 'in_hitter_matchups');

      const filtered_hitters_by_team = filter_roster_map_to_allowed(roster_hitters_by_team, hitter_allowed);
      const filtered_starters_by_team = filter_roster_map_to_allowed(roster_starters_by_team, starter_allowed);
      const filtered_relievers_by_team = filter_roster_map_to_allowed(roster_relievers_by_team, pitcher_allowed);
      dbg('selected year', year_val);
      dbg('fallback Elvis rec', fallback_pitcher_map['Elvis Alvarado']);
      dbg('pitcher_allowed has Elvis', pitcher_allowed.has('Elvis Alvarado'));
      dbg('ATH relievers raw', roster_relievers_by_team.ATH);
      dbg('ATH relievers filtered', filtered_relievers_by_team.ATH);

      const roster_hitter_groups = roster_groups_from_map(filtered_hitters_by_team, '');
      const roster_sp_groups = roster_groups_from_map(filtered_starters_by_team, 'Starters');
      const roster_rp_groups = roster_groups_from_map(filtered_relievers_by_team, 'Relievers');

      const roster_hitter_team_map =
        (rosters_obj && rosters_obj.hitter_team_map && typeof rosters_obj.hitter_team_map === 'object')
          ? rosters_obj.hitter_team_map
          : roster_team_map_from_groups(roster_hitter_groups);

      const roster_starter_team_map =
        (rosters_obj && rosters_obj.starter_team_map && typeof rosters_obj.starter_team_map === 'object')
          ? rosters_obj.starter_team_map
          : roster_team_map_from_groups(roster_sp_groups);

      const roster_reliever_team_map =
        (rosters_obj && rosters_obj.reliever_team_map && typeof rosters_obj.reliever_team_map === 'object')
          ? rosters_obj.reliever_team_map
          : roster_team_map_from_groups(roster_rp_groups);

      hitters = flat_from_roster_map(filtered_hitters_by_team);
      const pitchers_sp_roster = flat_from_roster_map(filtered_starters_by_team);
      const pitchers_rp_roster = flat_from_roster_map(filtered_relievers_by_team);
      pitchers = sort_names_last(Array.from(new Set([].concat(pitchers_sp_roster, pitchers_rp_roster))));

      teams = Array.from(new Set(
        Object.keys(filtered_hitters_by_team)
          .concat(Object.keys(filtered_starters_by_team))
          .concat(Object.keys(filtered_relievers_by_team))
      )).sort();

      year_lists = {
        hvp_pitchers_by_hitter_side: (pack && pack.hvp_pitchers_by_hitter_side && typeof pack.hvp_pitchers_by_hitter_side === 'object')
          ? pack.hvp_pitchers_by_hitter_side
          : {},
        hitters_by_team: roster_hitter_groups,
        pitchers_by_team: roster_sp_groups.concat(roster_rp_groups),
        pitchers_rp_by_team: roster_rp_groups,
        pitchers_sp_by_team: roster_sp_groups,
        hitter_team_map: roster_hitter_team_map,
        starter_team_map: roster_starter_team_map,
        reliever_team_map: roster_reliever_team_map,
        pitchers_rp: pitchers_rp_roster,
        pitchers_sp: pitchers_sp_roster,
        fallback_hitter_all: (pack && pack.fallback_hitter_all && typeof pack.fallback_hitter_all === 'object')
          ? pack.fallback_hitter_all
          : {},
        fallback_pitcher_all: (pack && pack.fallback_pitcher_all && typeof pack.fallback_pitcher_all === 'object')
          ? pack.fallback_pitcher_all
          : {},
      };

      return;
    }

    const initial_year = String(prev_year || preferred_year || (years[0] || '')).trim();
    refresh_lists_from_year(initial_year);

    const mode = mode_select.value;
    form_root.dataset.mode = mode;
    //#################
    function build_select(id, label_text, options, placeholder) {
      const { wrap, sel } = make_select(id, label_text);
      set_select_options(sel, options, placeholder);
      return { wrap, sel };
    }
    //#################
    function build_side_select(id) {
      return build_select(id, 'Away/Home', ['Away', 'Home'], 'Select');
    }

    let year_sel = null;

    const year_choices = Array.isArray(years) ? years : [];
    const has_multiple_years = year_choices.length > 1;

    const hide_year_for_modes = (
      mode === 'projected_pitchers' ||
      mode === 'gameday_matchup' ||
      mode === 'best_worst_hitters' ||
      mode === 'favorite_hitters_today' ||
      mode === 'multi_hitter_today' ||
      mode === 'multi_hitter_week'
    );
    const show_year_dropdown = (!hide_year_for_modes && has_multiple_years);

    function selected_year_value() {
      if (year_sel && year_sel.value) return String(year_sel.value || '').trim();
      if (preferred_year && year_choices.includes(String(preferred_year))) return String(preferred_year);
      return String(year_choices[0] || preferred_year || '').trim();
    }

    if (show_year_dropdown) {
      const year_obj = make_select('matchups_year', 'Year');
      set_select_options(year_obj.sel, year_choices, 'Select year');
      form_root.appendChild(year_obj.wrap);

      year_obj.sel.value = String(prev_year || preferred_year || (year_choices[0] || '')).trim();
      sync_select_placeholder_class(year_obj.sel);

      year_obj.sel.addEventListener('change', () => {
        refresh_lists_from_year(year_obj.sel.value);
        clear_results();
        build_form();
      });

      year_sel = year_obj.sel;
    } else {
      year_sel = { value: selected_year_value() };
      refresh_lists_from_year(year_sel.value);
    }
    //#################
    function append_projected_starters_disclaimer() {
      const cutoff_mmdd = 415;

      const disclaimer = document.createElement('div');
      disclaimer.className = 'matchups_disclaimer';
      disclaimer.textContent = "Small sample sizes need to fill out before this can process everyone/for accuracy";
      disclaimer.style.margin = '6px 0 10px 0';
      disclaimer.style.display = (mmdd_key_local(new Date()) < cutoff_mmdd) ? '' : 'none';

      form_root.appendChild(disclaimer);
    }

    append_projected_starters_disclaimer();
    form_root.appendChild(row_controls);
    //#################
    function append_row(row_root, items) {
      const row_div = document.createElement('div');
      row_div.className = 'matchups_form_row';

      (items || []).forEach(x => {
        if (!x || !x.wrap) return;
        row_div.appendChild(x.wrap);
      });

      row_root.appendChild(row_div);
      return row_div;
    }
    //#################
    function build_action_buttons(on_submit, on_clear, submit_text, opts) {
      const options = (opts && typeof opts === 'object') ? opts : {};
      const show_sort = options.show_sort !== false;
      const sort_mode = String(options.sort_mode || 'team');
      const extra_node = options.extra_node || null;

      const wrap = document.createElement('div');
      wrap.style.marginTop = '10px';
      wrap.style.display = 'flex';
      wrap.style.gap = '8px';
      wrap.style.alignItems = 'center';

      let sort_btn = null;
      //#################
      function reset_sort_button() {
        if (!sort_btn) return;
        sort_btn.dataset.mode = 'all';
        sort_btn.textContent = 'Sort +All';
      }

      const submit_btn = document.createElement('button');
      submit_btn.type = 'button';
      submit_btn.textContent = submit_text || 'Submit';
      submit_btn.className = 'matchups_submit';
      submit_btn.addEventListener('click', (e) => {
        e.preventDefault();
        reset_sort_button();
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
        reset_sort_button();
        if (typeof on_clear === 'function') on_clear();
      });

      wrap.appendChild(submit_btn);
      wrap.appendChild(clear_btn);

      function parse_sort_num(s) {
        const raw = String(s || '').trim();
        if (!raw || raw === '—') return NaN;
        const x = raw.replace(/,/g, '');
        const m = x.match(/-?(?:\d+(?:\.\d*)?|\.\d+)/);
        return m ? Number(m[0]) : NaN;
      }

      function sort_results_by_col_idx(col_idx, cmp) {
        const results = document.getElementById('matchups_results_root');
        if (!results) return;

        const table = results.querySelector('table.matchup_table');
        if (!table) return;

        const tbody = table.querySelector('tbody');
        if (!tbody) return;

        const trs = Array.from(tbody.querySelectorAll('tr'));
        trs.sort((a, b) => cmp(a, b, col_idx));
        trs.forEach(tr => tbody.appendChild(tr));
      }

      function header_index_for(label) {
        const results = document.getElementById('matchups_results_root');
        const table = results ? results.querySelector('table.matchup_table') : null;
        if (!table) return -1;

        const ths = Array.from(table.querySelectorAll('thead th'));
        return ths.findIndex(th => String(th.textContent || '').trim() === label);
      }

      function sort_by_all_desc() {
        let idx_all = header_index_for('+All');
        if (idx_all < 0) idx_all = header_index_for('All');
        if (idx_all < 0) return;

        sort_results_by_col_idx(idx_all, (a, b, idx) => {
          const av = parse_sort_num(a.children[idx] ? a.children[idx].textContent : '');
          const bv = parse_sort_num(b.children[idx] ? b.children[idx].textContent : '');

          const a_ok = Number.isFinite(av);
          const b_ok = Number.isFinite(bv);

          if (a_ok && b_ok) return (bv - av);
          if (a_ok && !b_ok) return -1;
          if (!a_ok && b_ok) return 1;
          return 0;
        });
      }

      function sort_by_team_name() {
        const idx_team = header_index_for('Team');
        const idx_opp = header_index_for('+All');

        const team_i = (idx_team >= 0) ? idx_team : 0;
        const opp_i = (idx_opp >= 0) ? idx_opp : 1;

        sort_results_by_col_idx(team_i, (a, b) => {
          const at = String(a.children[team_i] ? a.children[team_i].textContent : '').trim();
          const bt = String(b.children[team_i] ? b.children[team_i].textContent : '').trim();
          if (at !== bt) return at.localeCompare(bt);

          const ao = String(a.children[opp_i] ? a.children[opp_i].textContent : '').trim();
          const bo = String(b.children[opp_i] ? b.children[opp_i].textContent : '').trim();
          if (ao !== bo) return ao.localeCompare(bo);

          return 0;
        });
      }

      function sort_by_entry_order() {
        sort_results_by_col_idx(0, (a, b) => {
          const ae = Number(a.dataset.entryOrder || 0);
          const be = Number(b.dataset.entryOrder || 0);
          return ae - be;
        });
      }

      if (show_sort) {
        sort_btn = document.createElement('button');
        sort_btn.type = 'button';
        sort_btn.className = 'matchups_submit';
        sort_btn.textContent = 'Sort +All';
        sort_btn.dataset.mode = 'all';

        sort_btn.addEventListener('click', (e) => {
          e.preventDefault();

          const m = String(sort_btn.dataset.mode || 'all');

          if (sort_mode === 'entry') {
            if (m === 'all') {
              sort_by_all_desc();
              sort_btn.dataset.mode = 'entry';
              sort_btn.textContent = 'Sort Entry Order';
            } else {
              sort_by_entry_order();
              sort_btn.dataset.mode = 'all';
              sort_btn.textContent = 'Sort +All';
            }
            return;
          }

          if (m === 'all') {
            sort_by_all_desc();
            sort_btn.dataset.mode = 'team';
            sort_btn.textContent = 'Sort by Team Name';
          } else {
            sort_by_team_name();
            sort_btn.dataset.mode = 'all';
            sort_btn.textContent = 'Sort +All';
          }
        });

        wrap.appendChild(sort_btn);
        if (extra_node) {
          wrap.appendChild(extra_node);
        }
      }

      form_root.appendChild(wrap);
      return { wrap, submit_btn, clear_btn, sort_btn };
    }

    sync_row_controls();
    //#################
    function base_team_from_label(label) {
      const s = String(label || '').trim();
      if (!s) return '';
      const parts = s.split(/\s*[—-]\s*/);
      return String(parts[0] || '').trim();
    }
    //#################
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
    //#################
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
    //#################
    function get_pitcher_team_maps() {
      const sp_groups = build_pitcher_groups(year_lists);
      const rp_groups = Array.isArray(year_lists.pitchers_rp_by_team) ? year_lists.pitchers_rp_by_team : [];

      const sp_map = build_team_map_from_groups(sp_groups);
      const rp_map = build_team_map_from_groups(rp_groups);

      return { sp_groups, rp_groups, sp_map, rp_map };
    }
    //#################
    function get_hitter_team_map() {
      const map_obj = (year_lists && year_lists.hitter_team_map && typeof year_lists.hitter_team_map === 'object')
        ? year_lists.hitter_team_map
        : {};
      return map_obj;
    }
    //#################
    async function render_many(paths, opts) {
      await render_fragments(paths.filter(Boolean), opts);
    }
    //#################
    function build_hitter_only_rows(mode_key) {
      const rows = [];

      const grid = document.createElement('div');
      grid.className = 'matchups_hitter_only_grid';
      grid.style.display = 'grid';
      grid.style.gridTemplateColumns = 'minmax(0, 1fr) minmax(0, 1fr)';
      grid.style.gap = '16px';
      grid.style.alignItems = 'start';
      grid.style.width = '100%';

      const left_col = document.createElement('div');
      left_col.className = 'matchups_hitter_only_col';
      left_col.style.display = 'grid';
      left_col.style.gap = '10px';

      const right_col = document.createElement('div');
      right_col.className = 'matchups_hitter_only_col';
      right_col.style.display = 'grid';
      right_col.style.gap = '10px';

      grid.appendChild(left_col);
      grid.appendChild(right_col);
      form_root.appendChild(grid);

      function add_row(i) {
        const row_div = document.createElement('div');
        row_div.className = 'matchups_form_row';

        const { wrap: h_wrap, sel: h_sel } = make_select(`matchups_hitter_${i}`, `Hitter ${i + 1}`);
        set_grouped_or_flat(h_sel, year_lists.hitters_by_team, hitters, 'Select hitter');

        h_sel.classList.add('matchups_select_hitter_long');
        row_div.appendChild(h_wrap);

        if (i < 8) {
          left_col.appendChild(row_div);
        } else {
          right_col.appendChild(row_div);
        }

        const row = { h_sel };
        rows.push(row);

        h_sel.addEventListener('change', () => {
          clear_results();
        });

        const saved = (multi_form_state[mode_key].rows && multi_form_state[mode_key].rows[i])
          ? multi_form_state[mode_key].rows[i]
          : null;

        if (saved) {
          row.h_sel.value = saved.hitter || '';
          sync_select_placeholder_class(row.h_sel);
        }
      }

      const st = multi_form_state[mode_key];
      const n = clamp_rows_n(st.n);
      st.n = n;

      for (let i = 0; i < n; i++) add_row(i);

      return rows;
    }
        //#################
    function sunday_of_current_h2h_week_local(d) {
      const x = new Date(d.getTime());
      const day = x.getDay(); // 0 = sunday, 6 = saturday
      const add = (7 - day) % 7;
      x.setDate(x.getDate() + add);
      return x;
    }
    //#################
    async function fetch_matchups_for_date_range(start_date, end_date) {
      const out = [];
      let cur = new Date(start_date.getTime());

      while (to_yyyy_mm_dd_local(cur) <= to_yyyy_mm_dd_local(end_date)) {
        const date_str = to_yyyy_mm_dd_local(cur);
        const games = await fetch_matchups_for_date(date_str);
        out.push({
          date_str,
          games
        });
        cur = add_days_local(cur, 1);
      }

      return out;
    }
    //#################
    function find_game_for_team(games, team_code) {
      const t = normalize_matchups_team_code(team_code);
      return (games || []).find(g => {
        return (
          normalize_matchups_team_code(g.home_team) === t ||
          normalize_matchups_team_code(g.away_team) === t
        );
      }) || null;
    }
    //#################
    function matchup_info_for_team_game(game, team_code) {
      const t = normalize_matchups_team_code(team_code);
      if (!game || !t) return null;

      const home_team = normalize_matchups_team_code(game.home_team);
      const away_team = normalize_matchups_team_code(game.away_team);

      if (away_team === t) {
        const pitcher = String(game.home_pitcher || '').trim();
        if (!pitcher) return null;

        return {
          team: away_team,
          opp: home_team,
          side: 'Away',
          pitcher
        };
      }

      if (home_team === t) {
        const pitcher = String(game.away_pitcher || '').trim();
        if (!pitcher) return null;

        return {
          team: home_team,
          opp: away_team,
          side: 'Home',
          pitcher
        };
      }

      return null;
    }
    //#################
    function enrich_dummy_row(dummy_row, extra_cols) {
      const header_cells = Array.isArray(dummy_row?.header_cells) ? dummy_row.header_cells.slice() : [];
      const row_cells = Array.isArray(dummy_row?.row_cells) ? dummy_row.row_cells.slice() : [];

      const extras = Array.isArray(extra_cols) ? extra_cols : [];
      const extra_headers = extras.map(x => x.header);
      const extra_values = extras.map(x => x.value);

      return {
        header_cells: extra_headers.concat(header_cells),
        row_cells: extra_values.concat(row_cells)
      };
    }
    //#################
    function reorder_week_fallback_dummy_row(dummy_row, extra_vals) {
      const src_headers = Array.isArray(dummy_row?.header_cells) ? dummy_row.header_cells : [];
      const src_cells = Array.isArray(dummy_row?.row_cells) ? dummy_row.row_cells : [];

      const row_map = {};
      src_headers.forEach((h, i) => {
        row_map[String(h || '').trim()] = src_cells[i];
      });

      const extras = (extra_vals && typeof extra_vals === 'object') ? extra_vals : {};

      const ordered_headers = ['Name', 'PA', 'Away', 'Opp', 'Pitcher', 'All']; /*removed date*/
      const ordered_cells = [
        row_map['Name'] ?? '—',
        row_map['PA'] ?? '—',
        extras.Away ?? '—',
        extras.Opp ?? '—',
        extras.Pitcher ?? '—',
        row_map['All'] ?? '—'
        // ,extras.Date ?? '—'
      ];

      const pitch_headers = src_headers.filter(h => {
        const hh = String(h || '').trim();
        return !ordered_headers.includes(hh) && hh !== 'Year';
      });

      const pitch_cells = pitch_headers.map(h => {
        const hh = String(h || '').trim();
        return row_map[hh] ?? '—';
      });

      return {
        header_cells: ordered_headers.concat(pitch_headers),
        row_cells: ordered_cells.concat(pitch_cells)
      };
    }
    //#################
    function sort_table_rows_by_all(table) {
      if (!table) return;

      const thead = table.querySelector('thead');
      const tbody = table.querySelector('tbody');
      if (!thead || !tbody) return;

      const ths = Array.from(thead.querySelectorAll('th'));
      let idx_all = ths.findIndex(th => String(th.textContent || '').trim() === '+All');
      if (idx_all < 0) idx_all = ths.findIndex(th => String(th.textContent || '').trim() === 'All');
      if (idx_all < 0) return;

      const trs = Array.from(tbody.querySelectorAll('tr'));
      trs.sort((a, b) => {
        const av = parse_matchup_stat_number(a.children[idx_all] ? a.children[idx_all].textContent : '');
        const bv = parse_matchup_stat_number(b.children[idx_all] ? b.children[idx_all].textContent : '');

        const a_ok = Number.isFinite(av);
        const b_ok = Number.isFinite(bv);

        if (a_ok && b_ok) return bv - av;
        if (a_ok && !b_ok) return -1;
        if (!a_ok && b_ok) return 1;
        return 0;
      });

      trs.forEach(tr => tbody.appendChild(tr));
    }
    //#################
    function sort_all_results_tables_by_all() {
      const results = document.getElementById('matchups_results_root');
      if (!results) return;

      const tables = Array.from(results.querySelectorAll('table.matchup_table'));
      tables.forEach(sort_table_rows_by_all);
    }
    //#################
    function render_section_title(mount, title_text) {
      const h = document.createElement('div');
      h.textContent = title_text;
      h.style.fontSize = '12px';
      h.style.fontWeight = '800';
      h.style.color = 'var(--muted)';
      h.style.margin = '0 2px 8px 2px';
      h.style.textAlign = 'center';
      mount.appendChild(h);
    }
    //#################
    async function render_stacked_section(title_text, paths, opts) {
      const has_paths = Array.isArray(paths) && paths.length;
      const has_dummy = !!(opts && Array.isArray(opts.dummy_rows) && opts.dummy_rows.length);

      if (!has_paths && !has_dummy) return;

      const block = document.createElement('div');
      block.className = 'matchups_stacked_block';
      block.style.marginBottom = '16px';

      render_section_title(block, title_text);

      const mount = document.createElement('div');
      block.appendChild(mount);
      results_root.appendChild(block);

      // await render_section_into(mount, {
      //   title: '',
      //   hide_title: true,
      //   paths: paths || [],
      //   opts: opts || {}
      // });
      await render_section_into(mount, {
        title: '',
        hide_title: true,
        paths: paths || [],
        opts: {
          ...(opts || {}),
          skip_clear: true
        }
      });
    }
    //#################
    async function render_hitter_week_blocks(blocks) {
      clear_results();

      for (const block of (blocks || [])) {
        const hitter_name = String(block?.hitter_name || '').trim();
        const matchup_paths = Array.isArray(block?.matchup_paths) ? block.matchup_paths : [];
        const matchup_override_rows = Array.isArray(block?.matchup_override_rows) ? block.matchup_override_rows : [];
        const fallback_dummy_rows = Array.isArray(block?.fallback_dummy_rows) ? block.fallback_dummy_rows : [];

        if (!hitter_name) continue;
        if (!matchup_paths.length && !fallback_dummy_rows.length) continue;

        const hitter_block = document.createElement('div');
        hitter_block.className = 'matchups_hitter_week_block';
        hitter_block.style.marginBottom = '22px';

        const hitter_header = document.createElement('div');
        hitter_header.textContent = hitter_name;
        hitter_header.style.fontSize = '14px';
        hitter_header.style.fontWeight = '800';
        hitter_header.style.color = 'var(--text)';
        hitter_header.style.margin = '0 2px 8px 2px';
        hitter_block.appendChild(hitter_header);

        results_root.appendChild(hitter_block);

        if (matchup_paths.length) {
          const matchup_title = document.createElement('div');
          matchup_title.textContent = `${hitter_name} Matchup`;
          matchup_title.style.fontSize = '12px';
          matchup_title.style.fontWeight = '800';
          matchup_title.style.color = 'var(--muted)';
          matchup_title.style.margin = '0 2px 8px 2px';
          matchup_title.style.textAlign = 'center';
          hitter_block.appendChild(matchup_title);

          const matchup_mount = document.createElement('div');
          hitter_block.appendChild(matchup_mount);

          await render_section_into(matchup_mount, {
            title: '',
            hide_title: true,
            paths: matchup_paths,
            opts: {
              override_rows: matchup_override_rows,
              keep_all_pitch_cols: true,
              drop_cols: ['+KN'],
              skip_clear: true
            }
          });
        }

        if (fallback_dummy_rows.length) {
          const fallback_title = document.createElement('div');
          fallback_title.textContent = `${hitter_name} Fallback`;
          fallback_title.style.fontSize = '12px';
          fallback_title.style.fontWeight = '800';
          fallback_title.style.color = 'var(--muted)';
          fallback_title.style.margin = '12px 2px 8px 2px';
          fallback_title.style.textAlign = 'center';
          hitter_block.appendChild(fallback_title);

          const fallback_mount = document.createElement('div');
          hitter_block.appendChild(fallback_mount);

          await render_section_into(fallback_mount, {
            title: '',
            hide_title: true,
            paths: [],
            opts: {
              dummy_rows: fallback_dummy_rows,
              keep_all_pitch_cols: true,
              drop_cols: ['+KN'],
              skip_clear: true
            }
          });
        }
      }

      sort_all_results_tables_by_all();
    }
    //#################
    function day_offset_from_label(v) {
      const s = String(v || '').trim();
      if (s === 'Today') return 0;
      if (s === 'Yesterday') return -1;
      if (s === '2 days ago') return -2;
      if (s === '3 days ago') return -3;
      if (s === 'Tomorrow') return 1;

      const m = s.match(/^\+(\d+)\s*days?$/i);
      if (m) return Number(m[1]) || 0;

      return 0;
    }
    //#################
    function prefer_fragment_year() {
      const y = String(window.DEFAULT_SEASON_YEAR || '').trim();
      if (y && Array.isArray(years) && years.includes(y)) return y;
      if (Array.isArray(years) && years.length) return String(years[0]);
      return y || '';
    }
    //#################
    function roster_pack_for_year(rosters_obj, y) {
      if (!rosters_obj || typeof rosters_obj !== 'object') return null;
      return rosters_obj;
    }
    //#################################################################### Mode: projected_pitchers ####################################################################
    if (mode === 'projected_pitchers') {
      const day_obj = make_select('matchups_proj_day', 'Day');
      set_select_options(day_obj.sel, ['3 days ago', '2 days ago', 'Yesterday', 'Today', 'Tomorrow', '+2 days', '+3 days', '+4 days'], 'Select');

      form_root.appendChild(day_obj.wrap);

      day_obj.sel.value = 'Today';
      let projected_req_id = 0;
      sync_select_placeholder_class(day_obj.sel);
      //#################
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

          if (req_id !== projected_req_id) return;

          const resolved = [];
          for (const p of probables) {
            const p_key = safe_page_filename(p.pitcher);
            const t_key = safe_page_filename(p.opp);

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
            results_root.innerHTML = `<div style='padding:10px;color:var(--muted);'>No matchups found for ${date_str}.</div>`;
            return;
          }

          if (req_id !== projected_req_id) return;

          await render_many(paths);
          sort_first_results_table_by_team_name();

        } catch (e) {
          dbg('projected_pitchers submit error', e);
        }
      }
      //#################
      function clear_mode() {
        clear_results();
        day_obj.sel.value = 'Today';
        sync_select_placeholder_class(day_obj.sel);
      }

      build_action_buttons(submit, clear_mode, 'Load');

      return;
    }
    //#################################################################### Mode: gameday_matchup ####################################################################
    if (mode === 'gameday_matchup') {
      const day_obj = make_select('matchups_gd_day', 'Day');
      set_select_options(day_obj.sel, ['3 days ago', '2 days ago', 'Yesterday', 'Today', 'Tomorrow', '+2 days', '+3 days', '+4 days'], 'Select');
      form_root.appendChild(day_obj.wrap);

      const team_obj = make_select('matchups_gd_team', 'Team');
      set_select_options(team_obj.sel, [], 'Select team');
      form_root.appendChild(team_obj.wrap);

      day_obj.sel.value = 'Today';
      sync_select_placeholder_class(day_obj.sel);

      let gd_req_id = 0;
      //#################
async function refresh_team_choices() {
  const prev_team = String(team_obj.sel.value || '').trim();

  const offset = day_offset_from_label(day_obj.sel.value);
  const d = add_days_local(new Date(), offset);
  const date_str = to_yyyy_mm_dd_local(d);

  const games = await fetch_matchups_for_date(date_str);

  const playing = new Set();

  games.forEach(g => {
    if (g.home_team) playing.add(g.home_team);
    if (g.away_team) playing.add(g.away_team);
  });

  const options = [...playing].sort();
  set_select_options(team_obj.sel, options, 'Select team');

  if (prev_team && options.includes(prev_team)) {
    team_obj.sel.value = prev_team;
  }

  sync_select_placeholder_class(team_obj.sel);
}

      day_obj.sel.addEventListener('change',()=>{
        clear_results();
        refresh_team_choices();
      });

      refresh_team_choices();
      //#################
      async function submit() {
        const req_id = ++gd_req_id;

        clear_results();

        try {
          const idx = await load_matchups_index();
          if (!idx) return;

          const offset = day_offset_from_label(day_obj.sel.value);
          const d = add_days_local(new Date(), offset);
          const date_str = to_yyyy_mm_dd_local(d);

          const selected_team = String(team_obj.sel.value || '').trim();
          if (!selected_team) return;

          const games = await fetch_matchups_for_date(date_str);
          if (req_id !== gd_req_id) return;

          const game = games.find(g => g.home_team === selected_team || g.away_team === selected_team);
          if (!game) {
            results_root.innerHTML = `<div style="padding:10px;color:var(--muted);">No game found for ${selected_team} on ${date_str}.</div>`;
            return;
          }

          const home_team = game.home_team;
          const away_team = game.away_team;

          const home_pitcher = game.home_pitcher;
          const away_pitcher = game.away_pitcher;

          const y = prefer_fragment_year();
          if (!y) return;

          dbg('gameday game', {
            date_str,
            y,
            selected_team,
            home_team,
            away_team,
            home_pitcher,
            away_pitcher
          });

          const rosters = await load_matchups_rosters();
          const roster_pack = roster_pack_for_year(rosters, y);

          dbg('gameday roster_pack', {
            has_rosters: !!rosters,
            has_roster_pack: !!roster_pack
          });

          const home_hitters = roster_hitters_for_team(roster_pack, home_team);
          const away_hitters = roster_hitters_for_team(roster_pack, away_team);

          dbg('gameday hitters', {
            home_hitters_n: home_hitters.length,
            away_hitters_n: away_hitters.length
          });

          const home_pitcher_section = await build_pitcher_panel_section(
            idx,
            year_lists,
            y,
            home_pitcher,
            'Home',
            away_team,
            home_team,
            'Home'
          );

          const away_pitcher_section = await build_pitcher_panel_section(
            idx,
            year_lists,
            y,
            away_pitcher,
            'Away',
            home_team,
            away_team,
            'Away'
          );

          dbg('pitcher sections', {
            home_pitcher_section,
            away_pitcher_section
          });

          const home_lineup_sections = await build_lineup_sections(
            idx,
            year_lists,
            y,
            home_hitters,
            'Home',
            away_pitcher,
            '',
            "No matchup data - these are their scores against this pitcher's mix from this side"
          );

          const away_lineup_sections = await build_lineup_sections(
            idx,
            year_lists,
            y,
            away_hitters,
            'Away',
            home_pitcher,
            '',
            "No matchup data - these are their scores against this pitcher's mix from this side"
          );

          dbg('lineup sections', {
            home_lineup_sections,
            away_lineup_sections
          });

          if (req_id !== gd_req_id) return;

          const header = document.createElement('div');
          header.className = 'matchups_header';
          header.textContent = `${date_str}: ${away_team} @ ${home_team}`;

          results_root.appendChild(header);

          const board = document.createElement('div');
          board.className = 'matchups_gameday_board';
          results_root.appendChild(board);

          function split_lineup_sections(sections) {
            const out = {
              matchup: null,
              fallback: null
            };

            (sections || []).forEach(sec => {
              const has_paths = Array.isArray(sec.paths) && sec.paths.length;
              const has_dummy = !!(sec.opts && Array.isArray(sec.opts.dummy_rows) && sec.opts.dummy_rows.length);

              if (has_paths && !out.matchup) {
                out.matchup = sec;
                return;
              }

              if (has_dummy && !out.fallback) {
                out.fallback = sec;
              }
            });

            return out;
          }

          async function render_team_column(team_code, side_text, pitcher_section, split_sections) {
            const col = document.createElement('div');
            col.className = 'matchups_gameday_col';
            board.appendChild(col);

            const logo_wrap = document.createElement('div');
            logo_wrap.style.display = 'flex';
            logo_wrap.style.justifyContent = 'center';
            logo_wrap.style.alignItems = 'center';
            logo_wrap.style.margin = '2px 2px 2px 2px';
            logo_wrap.innerHTML = team_logo_html(team_code);
            col.appendChild(logo_wrap);

            const side_div = document.createElement('div');
            side_div.textContent = side_text;
            side_div.style.fontSize = '12px';
            side_div.style.fontWeight = '800';
            side_div.style.color = 'var(--muted)';
            side_div.style.margin = '0 2px 2px 2px';
            side_div.style.textAlign = 'center';
            col.appendChild(side_div);

            async function mount_section(sec, extra_class) {
              const section = document.createElement('div');
              section.className = 'matchups_gameday_section';
              if (extra_class) section.classList.add(extra_class);
              col.appendChild(section);

              if (sec && sec.title && !sec.hide_title) {
                const h = document.createElement('div');
                h.textContent = sec.title;
                h.style.fontSize = '12px';
                h.style.fontWeight = '800';
                h.style.color = 'var(--muted)';
                h.style.margin = '0 2px 8px 2px';
                h.style.textAlign = 'center';
                section.appendChild(h);
              }

              const mount = document.createElement('div');
              section.appendChild(mount);

              if (sec) {
                await render_section_into(mount, sec);
              }

              return section;
            }

            const pitcher_mount = await mount_section(pitcher_section, 'matchups_gameday_pitcher_slot');
            const lineup_mount = await mount_section(split_sections.matchup, 'matchups_gameday_lineup_slot');
            const fallback_mount = await mount_section(split_sections.fallback, 'matchups_gameday_fallback_slot');

            const candidate_widths = [lineup_mount, fallback_mount]
              .map(sec => {
                const wrap = sec.querySelector('.matchup_table_wrap');
                return wrap ? wrap.getBoundingClientRect().width : 0;
              })
              .filter(w => w > 0);

            const target_width = candidate_widths.length ? Math.max(...candidate_widths) : 0;

            if (target_width > 0 && pitcher_mount) {
              const pitcher_wrap = pitcher_mount.querySelector('.matchup_table_wrap');
              if (pitcher_wrap) {
                pitcher_wrap.style.width = `${Math.ceil(target_width)}px`;
              }

              const pitcher_table = pitcher_mount.querySelector('table.matchup_table');
              if (pitcher_table) {
                pitcher_table.style.width = '100%';
                pitcher_table.style.minWidth = '0';
              }
            }

            return {
              col,
              pitcher_mount,
              lineup_mount,
              fallback_mount
            };
          }

          const home_split = split_lineup_sections(home_lineup_sections);
          const away_split = split_lineup_sections(away_lineup_sections);

          const home_rendered = await render_team_column(home_team, 'Home', home_pitcher_section, home_split);
          const away_rendered = await render_team_column(away_team, 'Away', away_pitcher_section, away_split);

          const board_style = window.getComputedStyle(board);
          const board_cols = String(board_style.gridTemplateColumns || '')
            .split(' ')
            .filter(Boolean);

          const is_two_col_board = board_cols.length >= 2;

          home_rendered.lineup_mount.style.minHeight = '';
          away_rendered.lineup_mount.style.minHeight = '';

          if (is_two_col_board) {
            const home_lineup_wrap = home_rendered.lineup_mount
              ? home_rendered.lineup_mount.querySelector('.matchup_table_wrap')
              : null;

            const away_lineup_wrap = away_rendered.lineup_mount
              ? away_rendered.lineup_mount.querySelector('.matchup_table_wrap')
              : null;

            const home_lineup_height = home_lineup_wrap
              ? home_lineup_wrap.getBoundingClientRect().height
              : home_rendered.lineup_mount.getBoundingClientRect().height;

            const away_lineup_height = away_lineup_wrap
              ? away_lineup_wrap.getBoundingClientRect().height
              : away_rendered.lineup_mount.getBoundingClientRect().height;

            const max_lineup_height = Math.max(home_lineup_height, away_lineup_height);

            if (max_lineup_height > 0) {
              home_rendered.lineup_mount.style.minHeight = `${Math.ceil(max_lineup_height)}px`;
              away_rendered.lineup_mount.style.minHeight = `${Math.ceil(max_lineup_height)}px`;
            }
          }

        } catch (e) {
          console.error('[matchups] gameday submit error', e);
          results_root.innerHTML = `<div style="padding:10px;color:var(--muted);">Gameday matchup failed to load.</div>`;
        }
      }
      //#################
      function clear_mode(){
        clear_results();
        day_obj.sel.value='Today';
        team_obj.sel.value='';
        refresh_team_choices();
      }

      build_action_buttons(submit, clear_mode, 'Load', { show_sort: false });

      return;
    }
    //#################################################################### Mode: best_worst_hitters ####################################################################
    if (mode === 'best_worst_hitters') {

      const day_obj = make_select('matchups_bw_day','Day');
      set_select_options(day_obj.sel, ['3 days ago', '2 days ago', 'Yesterday', 'Today', 'Tomorrow', '+2 days', '+3 days', '+4 days'], 'Select');
      form_root.appendChild(day_obj.wrap);

      day_obj.sel.value='Today';
      sync_select_placeholder_class(day_obj.sel);

      let bw_req_id=0;
      //#################
      async function submit(){
        const req_id=++bw_req_id;
        clear_results();

        const idx=await load_matchups_index();
        if(!idx)return;

        const offset=day_offset_from_label(day_obj.sel.value);
        const d=add_days_local(new Date(),offset);
        const date_str=to_yyyy_mm_dd_local(d);

        const games=await fetch_matchups_for_date(date_str);
        if(req_id!==bw_req_id)return;

        const y=prefer_fragment_year();
        if(!y)return;

        const rosters=await load_matchups_rosters();
        const roster_pack=roster_pack_for_year(rosters,y);

        const all_paths=build_slate_hvp_paths(idx,y,games,roster_pack);
        if (!all_paths.length) {
          results_root.innerHTML = `<div style="padding:10px;color:var(--muted);">No hitter matchup fragments found for ${date_str}.</div>`;
          return;
        }

        const scored = await Promise.all(
          all_paths.map(async p => ({ path: p, value: await all_value_for_fragment(p) }))
        );

        const top20 = scored
          .filter(x => Number.isFinite(x.value) && x.value >= 0)
          .sort((a, b) => b.value - a.value)
          .slice(0, 20)
          .map(x => x.path);

        const bottom20 = scored
          .filter(x => Number.isFinite(x.value) && x.value < 0)
          .sort((a, b) => a.value - b.value)
          .slice(0, 20)
          .map(x => x.path);

        const best_worst_drop_cols = [
          'Away', 'Opp', '+FB', '+SI', '+CT', '+SL', '+SW', '+CB', '+CH', '+SP', '+KN', 'Bats', 'Throws'
        ];

        await render_multiple_fragments([
          {
            title: 'Top 20 Hitters',
            paths: top20,
            opts: { drop_cols: best_worst_drop_cols },
            cell_class: 'matchups_best_worst_cell'
          },
          {
            title: 'Bottom 20 Hitters',
            paths: bottom20,
            opts: { drop_cols: best_worst_drop_cols },
            cell_class: 'matchups_best_worst_cell'
          }
          ], { cols: 2, gap: '20px' });
      }
      //#################
      function clear_mode(){
        clear_results();
        day_obj.sel.value='Today';
      }

      build_action_buttons(submit, clear_mode, 'Load', { show_sort: false });
      return;
    }
    //#################################################################### Mode: multi_starter ####################################################################
    if (mode === 'multi_starter') {
      const rows = [];
      //#################
      function add_row(i) {
        const row_div = document.createElement('div');
        row_div.className = 'matchups_form_row';

        const pitcher_obj = make_select(`matchups_pitcher_${i}`, `Pitcher ${i + 1}`);
        set_grouped_or_flat(pitcher_obj.sel, year_lists.pitchers_sp_by_team, year_lists.pitchers_sp, 'Select starter');

        const side_obj = build_side_select(`matchups_side_${i}`);
        const team_obj = make_select(`matchups_team_${i}`, 'Opp');
        pitcher_obj.sel.style.width = '310px';
        side_obj.sel.style.width = '88px';
        team_obj.sel.style.width = '92px';
        //#################
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

      form_root.insertBefore(side_toggle, form_root.firstChild?.nextSibling || form_root.firstChild);
      //#################
      async function submit() {
        snapshot_multi_state('multi_starter');

        const y = year_sel.value;
        if (!y) return;

        const resolved_rows = rows
          .filter(r => r.p_sel.value && r.s_sel.value && r.t_sel.value)
          .map(r => {
            const path = resolve_sp_vs_team_path(idx, y, r.p_sel.value, r.s_sel.value, r.t_sel.value);

            return {
              path,
              requested_side: r.s_sel.value
            };
          })
          .filter(x => x.path);

        const seen = new Set();
        const uniq = [];
        const override_rows = [];

        for (const x of resolved_rows) {
          if (seen.has(x.path)) continue;
          seen.add(x.path);
          uniq.push(x.path);
          override_rows.push({ Away: x.requested_side });
        }

        await render_many(uniq, { override_rows });
      }
      //#################
      function clear_mode() {
        clear_results();
        multi_form_state.multi_starter.rows = [];
        multi_form_state.multi_starter.n = 1;
        form_root.dataset.skip_snapshot = '1';
        sync_row_controls();
        build_form();
      }

      build_action_buttons(submit, clear_mode);
      return;
    }
    //#################################################################### Mode: multi_hitter ####################################################################
    if (mode === 'multi_hitter') {
      const rows = [];

      //#################
      function refresh_row_pitchers(row) {
        const hitter_team_map = get_hitter_team_map();
        const hitter_team = hitter_team_map[String(row.h_sel.value || '').trim()] || '';

        const starter_groups = Array.isArray(year_lists.pitchers_sp_by_team) ? year_lists.pitchers_sp_by_team : [];
        const reliever_groups = Array.isArray(year_lists.pitchers_rp_by_team) ? year_lists.pitchers_rp_by_team : [];
        let base_groups = starter_groups.concat(reliever_groups);

        if (hitter_team) {
          base_groups = filter_groups_excluding_team(base_groups, hitter_team);
        }

        rebuild_select_keep_value(row.p_sel, () => {
          set_grouped_or_flat(row.p_sel, base_groups, [], 'Select pitcher');
        });
      }
      //#################
      function add_row(i) {
        const row_div = document.createElement('div');
        row_div.className = 'matchups_form_row';

        const { wrap: h_wrap, sel: h_sel } = make_select(`matchups_hitter_${i}`, `Hitter ${i + 1}`);
        set_grouped_or_flat(h_sel, year_lists.hitters_by_team, hitters, 'Select hitter');

        const { wrap: s_wrap, sel: s_sel } = make_select(`matchups_side_${i}`, 'Away/Home');
        set_select_options(s_sel, ['Away', 'Home'], 'Select');

        const { wrap: p_wrap, sel: p_sel } = make_select(`matchups_pitcher_${i}`, 'Pitcher');
        const pitcher_groups = build_pitcher_groups(year_lists);
        set_grouped_or_flat(p_sel, pitcher_groups, pitchers, 'Select pitcher');

        h_sel.classList.add('matchups_select_hitter_long');
        s_sel.classList.add('matchups_select_side_short');
        p_sel.classList.add('matchups_select_pitcher_long');

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
      //#################
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

      form_root.insertBefore(side_toggle, form_root.firstChild?.nextSibling || form_root.firstChild);
      //#################
      async function submit() {
        snapshot_multi_state('multi_hitter');

        const y = year_sel.value;
        if (!y) return;

        const paths = [];
        const override_rows = [];
        const dummy_rows = [];

        for (const r of rows) {
          const hitter_name = String(r.h_sel.value || '').trim();
          const side = String(r.s_sel.value || '').trim();
          const pitcher_name = String(r.p_sel.value || '').trim();

          if (!hitter_name || !side || !pitcher_name) continue;

          const path = resolve_hvp_with_pf_fallback(idx, y, hitter_name, side, pitcher_name);

          if (path) {
            paths.push(path);
            override_rows.push({ Away: side });
            continue;
          }

          const fallback_rows = build_personalized_hitter_fallback_rows(
            year_lists,
            [hitter_name],
            pitcher_name,
            y
          );

          if (fallback_rows.length) {
            dummy_rows.push(fallback_rows[0]);
            override_rows.push({ Away: side });
          }
        }
        await render_many(paths, {
          dummy_rows,
          override_rows,
          keep_all_pitch_cols: true
        });
      }

      //#################
      function clear_mode() {
        clear_results();
        multi_form_state.multi_hitter.rows = [];
        multi_form_state.multi_hitter.n = 1;
        form_root.dataset.skip_snapshot = '1';
        sync_row_controls();
        build_form();
      }

      build_action_buttons(submit, clear_mode);
      return;
    }
    //#################################################################### Mode: favorite_hitters_today ####################################################################
if (mode === 'favorite_hitters_today') {
//#################
function favorite_hitter_names() {
  const stored = Array.from(get_stored_people(favorites_storage_key));
  const hitter_team_map = get_hitter_team_map();
  const out = [];
  const seen = new Set();

  const canonical_by_norm = {};

  Object.keys(hitter_team_map || {}).forEach(name => {
    const norm = normalize_matchup_person_key(name);
    if (norm && !canonical_by_norm[norm]) {
      canonical_by_norm[norm] = name;
    }
  });

  function canonical_name(raw_name) {
    const norm = normalize_matchup_person_key(raw_name);
    return canonical_by_norm[norm] || '';
  }

  for (const raw of stored) {
    const s = String(raw || '').trim();
    if (!s) continue;

    let candidate = '';

    candidate = canonical_name(s);

    if (!candidate && s.includes('__')) {
      const left = s.split('__')[0].trim();
      candidate = canonical_name(left);
    }

    if (!candidate) {
      const m = s.match(/^[a-z]+-batters-(.+)$/i);
      if (m) {
        candidate = canonical_name(m[1].replace(/-/g, ' ').trim());
      }
    }

    if (!candidate || seen.has(candidate)) continue;

    seen.add(candidate);
    out.push(candidate);
  }

  return out;
}
  //#################
  async function submit() {
    const y = prefer_fragment_year();
    if (!y) return;

    const d = new Date();
    const date_str = to_yyyy_mm_dd_local(d);

    const games = await fetch_matchups_for_date(date_str);

    const matchup_paths = [];
    const matchup_override_rows = [];
    const fallback_dummy_rows = [];

    const seen_matchup_keys = new Set();
    const seen_fallback_keys = new Set();

    const favorite_hitters = favorite_hitter_names();

    for (const hitter_name of favorite_hitters) {
      const hitter_team = String(get_hitter_team_map()[hitter_name] || '').trim();
      if (!hitter_team) continue;

      const game = find_game_for_team(games, hitter_team);
      if (!game) continue;

      const matchup_info = matchup_info_for_team_game(game, hitter_team);
      if (!matchup_info) continue;

      const path = resolve_hvp_with_pf_fallback(
        idx,
        y,
        hitter_name,
        matchup_info.side,
        matchup_info.pitcher
      );

      if (path) {
        const dedupe_key = [
          hitter_name,
          matchup_info.side,
          matchup_info.opp,
          matchup_info.pitcher,
          path
        ].join('||');

        if (seen_matchup_keys.has(dedupe_key)) continue;
        seen_matchup_keys.add(dedupe_key);

        matchup_paths.push(path);
        matchup_override_rows.push({
          Away: matchup_info.side
        });
        continue;
      }

      const fallback_rows = build_personalized_hitter_fallback_rows(
        year_lists,
        [hitter_name],
        matchup_info.pitcher,
        y
      );

      if (!fallback_rows.length) continue;

      const fallback_key = [
        hitter_name,
        matchup_info.side,
        matchup_info.opp,
        matchup_info.pitcher
      ].join('||');

      if (seen_fallback_keys.has(fallback_key)) continue;
      seen_fallback_keys.add(fallback_key);

      fallback_dummy_rows.push(
        reorder_week_fallback_dummy_row(fallback_rows[0], {
          Away: matchup_info.side,
          Opp: matchup_info.opp,
          Pitcher: matchup_info.pitcher,
          Date: date_str
        })
      );
    }

    clear_results();

    await render_stacked_section('Matchups', matchup_paths, {
      override_rows: matchup_override_rows,
      keep_all_pitch_cols: true,
      drop_cols: ['+KN']
    });

    await render_stacked_section('Fallback', [], {
      dummy_rows: fallback_dummy_rows,
      keep_all_pitch_cols: true,
      drop_cols: ['+KN']
    });

    sort_all_results_tables_by_all();
  }
  //#################
  function clear_mode() {
    clear_results();
  }

  build_action_buttons(submit, clear_mode, 'Submit', { show_sort: false });
  return;
}
    //#################################################################### Mode: multi_hitter_today ####################################################################
    if (mode === 'multi_hitter_today') {
      const rows = build_hitter_only_rows('multi_hitter_today');

      //#################
      async function submit() {
        snapshot_multi_state('multi_hitter_today');

        const y = prefer_fragment_year();
        if (!y) return;

        const d = new Date();
        const date_str = to_yyyy_mm_dd_local(d);

        const games = await fetch_matchups_for_date(date_str);

        const matchup_paths = [];
        const matchup_override_rows = [];
        const fallback_dummy_rows = [];

        const seen_matchup_keys = new Set();
        const seen_fallback_keys = new Set();

        for (const r of rows) {
          const hitter_name = String(r.h_sel.value || '').trim();
          if (!hitter_name) continue;

          const hitter_team = String(get_hitter_team_map()[hitter_name] || '').trim();
          if (!hitter_team) continue;

          const game = find_game_for_team(games, hitter_team);
          if (!game) continue;

          const matchup_info = matchup_info_for_team_game(game, hitter_team);
          if (!matchup_info) continue;

          const path = resolve_hvp_with_pf_fallback(
            idx,
            y,
            hitter_name,
            matchup_info.side,
            matchup_info.pitcher
          );

          if (path) {
            const dedupe_key = [
              hitter_name,
              matchup_info.side,
              matchup_info.opp,
              matchup_info.pitcher,
              path
            ].join('||');

            if (seen_matchup_keys.has(dedupe_key)) continue;
            seen_matchup_keys.add(dedupe_key);

            matchup_paths.push(path);
            matchup_override_rows.push({
              Away: matchup_info.side
            });
            continue;
          }

          const fallback_rows = build_personalized_hitter_fallback_rows(
            year_lists,
            [hitter_name],
            matchup_info.pitcher,
            y
          );

          if (!fallback_rows.length) continue;

          const fallback_key = [
            hitter_name,
            matchup_info.side,
            matchup_info.opp,
            matchup_info.pitcher
          ].join('||');

          if (seen_fallback_keys.has(fallback_key)) continue;
          seen_fallback_keys.add(fallback_key);

            fallback_dummy_rows.push(
              reorder_week_fallback_dummy_row(fallback_rows[0], {
                Away: matchup_info.side,
                Opp: matchup_info.opp,
                Pitcher: matchup_info.pitcher,
                Date: date_str
              })
            );
        }

        clear_results();

        await render_stacked_section('Matchups', matchup_paths, {
          override_rows: matchup_override_rows,
          keep_all_pitch_cols: true,
          drop_cols: ['+KN']
        });

        await render_stacked_section('Fallback', [], {
          dummy_rows: fallback_dummy_rows,
          keep_all_pitch_cols: true,
          drop_cols: ['+KN']
        });

        sort_all_results_tables_by_all();
      }
      //#################
      function clear_mode() {
        clear_results();
        multi_form_state.multi_hitter_today.rows = [];
        multi_form_state.multi_hitter_today.n = 1;
        form_root.dataset.skip_snapshot = '1';
        sync_row_controls();
        build_form();
      }

      // build_action_buttons(submit, clear_mode);
      build_action_buttons(submit, clear_mode, 'Submit', { show_sort: false });
      return;
    }
    //#################################################################### Mode: multi_hitter_week ####################################################################
    if (mode === 'multi_hitter_week') {
      const rows = build_hitter_only_rows('multi_hitter_week');

      //#################
      async function submit() {
        snapshot_multi_state('multi_hitter_week');

        const y = prefer_fragment_year();
        if (!y) return;

        const start_date = new Date();
        const end_date = sunday_of_current_h2h_week_local(start_date);

        const schedule_days = await fetch_matchups_for_date_range(start_date, end_date);

        const hitter_blocks = [];

        for (const r of rows) {
          const hitter_name = String(r.h_sel.value || '').trim();
          if (!hitter_name) continue;

          const hitter_team = String(get_hitter_team_map()[hitter_name] || '').trim();
          if (!hitter_team) continue;

          const matchup_paths = [];
          const matchup_override_rows = [];
          const fallback_dummy_rows = [];

          const seen_games = new Set();

          for (const day_pack of schedule_days) {
            const date_str = String(day_pack?.date_str || '').trim();
            const games = Array.isArray(day_pack?.games) ? day_pack.games : [];

            const game = find_game_for_team(games, hitter_team);
            if (!game) continue;

            const matchup_info = matchup_info_for_team_game(game, hitter_team);
            if (!matchup_info) continue;

            const game_key = [
              date_str,
              hitter_name,
              matchup_info.side,
              matchup_info.opp,
              matchup_info.pitcher
            ].join('||');

            if (seen_games.has(game_key)) continue;
            seen_games.add(game_key);

            const path = resolve_hvp_with_pf_fallback(
              idx,
              y,
              hitter_name,
              matchup_info.side,
              matchup_info.pitcher
            );

            if (path) {
              matchup_paths.push(path);
              matchup_override_rows.push({
                Away: matchup_info.side,
                Opp: matchup_info.opp,
                Pitcher: matchup_info.pitcher
              });
              continue;
            }

            const fallback_rows = build_personalized_hitter_fallback_rows(
              year_lists,
              [hitter_name],
              matchup_info.pitcher,
              y
            );

            if (!fallback_rows.length) continue;

            fallback_dummy_rows.push(
              enrich_dummy_row(fallback_rows[0], [
                // { header: 'Date', value: date_str },
                { header: 'Away', value: matchup_info.side },
                { header: 'Opp', value: matchup_info.opp },
                { header: 'Pitcher', value: matchup_info.pitcher }
              ])
            );
          }

          if (matchup_paths.length || fallback_dummy_rows.length) {
            hitter_blocks.push({
              hitter_name,
              matchup_paths,
              matchup_override_rows,
              fallback_dummy_rows
            });
          }
        }

        await render_hitter_week_blocks(hitter_blocks);
      }
      //#################
      function clear_mode() {
        clear_results();
        multi_form_state.multi_hitter_week.rows = [];
        multi_form_state.multi_hitter_week.n = 1;
        form_root.dataset.skip_snapshot = '1';
        sync_row_controls();
        build_form();
      }

      // build_action_buttons(submit, clear_mode);
      build_action_buttons(submit, clear_mode, 'Submit', { show_sort: false });
      return;
    }
    //#################################################################### Mode: rp_inning ####################################################################
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

      const rp_info = document.createElement('div');
      rp_info.className = 'matchups_inline_info';
      rp_info.style.display = 'none';
      rp_info.style.fontSize = '12px';
      rp_info.style.fontWeight = '700';
      rp_info.style.color = 'var(--muted)'
      rp_info.style.marginLeft = '4px';
      rp_info.style.whiteSpace = 'nowrap';
      //#################
      function sync_rp_info() {
        const pitcher_name = String(pitcher_sel.value || '').trim();
        if (!pitcher_name) {
          rp_info.textContent = '';
          rp_info.style.display = 'none';
          return;
        }

        const rec = fallback_rec_for_name(year_lists.fallback_pitcher_all, pitcher_name);
        const ip_text = rec ? display_ip(rec.IP) : '—';

        rp_info.textContent = `${pitcher_name}: ${ip_text} IP`;
        rp_info.style.display = '';
      }

      const { wrap: b1_wrap, sel: b1_sel } = make_select('matchups_b1', 'Batter 1');
      const { wrap: b2_wrap, sel: b2_sel } = make_select('matchups_b2', 'Batter 2');
      const { wrap: b3_wrap, sel: b3_sel } = make_select('matchups_b3', 'Batter 3');
      pitcher_sel.style.width = '300px';
      side_sel.style.width = '88px';
      b1_sel.style.width = '170px';
      b2_sel.style.width = '170px';
      b3_sel.style.width = '170px';
      //#################
      function refresh_hitters_excluding_rp_team() {
        const { rp_map } = get_pitcher_team_maps();
        const rp_team = rp_map[String(pitcher_sel.value || '').trim()] || '';

        const hitter_groups = Array.isArray(year_lists.hitters_by_team) ? year_lists.hitters_by_team : [];
        const groups_ok = rp_team ? filter_groups_excluding_team(hitter_groups, rp_team) : hitter_groups;

        const prev_b1 = String(b1_sel.value || '').trim();
        const prev_b2 = String(b2_sel.value || '').trim();
        const prev_b3 = String(b3_sel.value || '').trim();

        set_grouped_or_flat(b1_sel, groups_ok, hitters, 'Select batter');
        set_grouped_or_flat(b2_sel, groups_ok, hitters, 'Select batter');
        set_grouped_or_flat(b3_sel, groups_ok, hitters, 'Select batter');

        if (prev_b1 && Array.from(b1_sel.options).some(o => o.value === prev_b1)) b1_sel.value = prev_b1;
        if (prev_b2 && Array.from(b2_sel.options).some(o => o.value === prev_b2)) b2_sel.value = prev_b2;
        if (prev_b3 && Array.from(b3_sel.options).some(o => o.value === prev_b3)) b3_sel.value = prev_b3;

        sync_select_placeholder_class(b1_sel);
        sync_select_placeholder_class(b2_sel);
        sync_select_placeholder_class(b3_sel);

        apply_same_team_filter();
      }

      refresh_hitters_excluding_rp_team();

      pitcher_sel.addEventListener('change', () => {
        refresh_hitters_excluding_rp_team();
        sync_rp_info();
        clear_results();
      });
      //#################
      function apply_same_team_filter() {
        const map_obj = (year_lists && year_lists.hitter_team_map && typeof year_lists.hitter_team_map === 'object')
          ? year_lists.hitter_team_map
          : {};

        const { rp_map } = get_pitcher_team_maps();
        const rp_team = rp_map[String(pitcher_sel.value || '').trim()] || '';

        const prev_b1 = String(b1_sel.value || '').trim();
        const prev_b2 = String(b2_sel.value || '').trim();
        const prev_b3 = String(b3_sel.value || '').trim();

        const selected_team =
          (prev_b1 && map_obj[prev_b1]) ||
          (prev_b2 && map_obj[prev_b2]) ||
          (prev_b3 && map_obj[prev_b3]) ||
          '';

        let base_groups = Array.isArray(year_lists.hitters_by_team) ? year_lists.hitters_by_team : [];
        if (rp_team) base_groups = filter_groups_excluding_team(base_groups, rp_team);

        if (selected_team) {
          base_groups = base_groups.filter(g => String(g.label || '').trim() === selected_team);
        }

        function groups_for(slot_name) {
          const used = new Set();
          if (slot_name !== 'b1' && prev_b1) used.add(prev_b1);
          if (slot_name !== 'b2' && prev_b2) used.add(prev_b2);
          if (slot_name !== 'b3' && prev_b3) used.add(prev_b3);

          return base_groups.map(g => ({
            label: g.label,
            options: (g.options || []).filter(x => !used.has(String(x || '').trim()))
          })).filter(g => g.options.length);
        }

        const groups_b1 = groups_for('b1');
        const groups_b2 = groups_for('b2');
        const groups_b3 = groups_for('b3');

        set_grouped_or_flat(b1_sel, groups_b1, [], 'Select batter');
        set_grouped_or_flat(b2_sel, groups_b2, [], 'Select batter');
        set_grouped_or_flat(b3_sel, groups_b3, [], 'Select batter');

        if (prev_b1 && groups_b1.some(g => (g.options || []).includes(prev_b1))) b1_sel.value = prev_b1;
        else b1_sel.value = '';

        if (prev_b2 && groups_b2.some(g => (g.options || []).includes(prev_b2))) b2_sel.value = prev_b2;
        else b2_sel.value = '';

        if (prev_b3 && groups_b3.some(g => (g.options || []).includes(prev_b3))) b3_sel.value = prev_b3;
        else b3_sel.value = '';

        sync_select_placeholder_class(b1_sel);
        sync_select_placeholder_class(b2_sel);
        sync_select_placeholder_class(b3_sel);
      }

      b1_sel.addEventListener('change', () => {
        apply_same_team_filter('b1');
        clear_results();
      });

      b2_sel.addEventListener('change', () => {
        apply_same_team_filter('b2');
        clear_results();
      });

      b3_sel.addEventListener('change', () => {
        apply_same_team_filter('b3');
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
      //#################
      async function submit() {
        const y = year_sel.value;
        const p = pitcher_sel.value;
        const s = side_sel.value;
        const b1 = b1_sel.value;
        const b2 = b2_sel.value;
        const b3 = b3_sel.value;

        if (!y || !p || !s || !b1 || !b2 || !b3) return;

        const p_key = safe_page_filename(p);

        function resolve_rp_hvp_path(hitter_name) {
          return resolve_hvp_with_pf_fallback(idx, y, hitter_name, s, p);
        }

        const resolved_rows = [
          { hitter: b1, path: resolve_rp_hvp_path(b1), requested_side: s },
          { hitter: b2, path: resolve_rp_hvp_path(b2), requested_side: s },
          { hitter: b3, path: resolve_rp_hvp_path(b3), requested_side: s },
        ].filter(x => x.path);

        const paths = resolved_rows.map(x => x.path);
        const override_rows = resolved_rows.map(x => ({ Away: x.requested_side }));

        await render_many(paths, {invert_stats: true, override_rows, drop_cols: ['Pitcher', 'IP', 'Away', 'Bats', 'Throws']});
      }
      //#################
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
        sync_rp_info();
      }

          sync_rp_info();
          build_action_buttons(submit, clear_mode, 'Submit', {sort_mode: 'entry', extra_node: rp_info});
      return;
    }
  }
  //#################################################################### Wiring ####################################################################
  let last_mode_value = mode_select.value;

  mode_select.addEventListener('change', () => {
    snapshot_multi_state(last_mode_value);

    const next_mode = mode_select.value;
    const last_was_multi = (
      last_mode_value === 'multi_starter' ||
      last_mode_value === 'multi_hitter' ||
      last_mode_value === 'multi_hitter_today' ||
      last_mode_value === 'multi_hitter_week'
    );

    const next_is_multi = (
      next_mode === 'multi_starter' ||
      next_mode === 'multi_hitter' ||
      next_mode === 'multi_hitter_today' ||
      next_mode === 'multi_hitter_week'
    );

    if (last_mode_value !== next_mode && (last_was_multi || next_is_multi)) {
      multi_form_state.multi_starter.rows = [];
      multi_form_state.multi_starter.n = 1;
      multi_form_state.multi_hitter.rows = [];
      multi_form_state.multi_hitter.n = 1;
      multi_form_state.multi_hitter_today.rows = [];
      multi_form_state.multi_hitter_today.n = 1;
      multi_form_state.multi_hitter_week.rows = [];
      multi_form_state.multi_hitter_week.n = 1;
    }

    last_mode_value = next_mode;
    sync_row_controls();
    build_form();
  });

  build_form();
}

/* ===== fantasy.js ===== */

/*#################################################################### Fantasy ####################################################################*/
const fantasy_state = {
  year: null,
  section: 'hitters',
  scope: 'majors',
  hitter_pos: 'ALL',
  team: 'ALL',
  qual_min: '',
  sort_key: 'Val',
  sort_desc: true,
  data_cache: new Map(),
  scales: null,
  show_gradients: false,
};
/* ################# */
const fantasy_display_columns = {
  majors: {
    hitters: [
      'Name', 'Pos', '2nd Pos', 'Team',
      'Pts', 'PPG', 'Score', 'All', 'Con', 'Disc', 'Val', 'S Val', 'vSzn', 'RHP', 'LHP', 'R Hit', 'R Pwr', 'L Hit', 'L Pwr', 'PA', 'H', '2B', '3B', 'R', 'HR', 'RBI', 'SB', 'BB', 'SO',
      'AVG', 'OBP', 'SLG', 'OPS', 'Pts +/-', 'Whiff%', 'SwSp%', '≥100', 'R Eye', 'L Eye', 'BB%', 'K%', 'FB R', 'SI R', 'CT R', 'SL R', 'SW R', 'CB R', 'CH R', 'SP R', 'FB L', 'SI L', 'CT L', 'SL L', 'SW L', 'CB L', 'CH L', 'SP L'
    ],
    sp: [
      'Name', 'Team',
      'Pts', 'PPG', 'Score', 'All', 'Con', 'Disc', 'Val', 'S Val', 'vSzn', 'Velo', 'Stf', 'Rarity', 'LCon', 'LDisc', 'W', 'L', 'IP', 'BB', 'K', 'QS/SV', 'ERA', 'WHIP', 'Days +/-', 'BB%', 'K%', 'SwStr%', 'CSW%', '≥50 Qual',
      'FB Stf', 'FB R', 'FB L', 'SI Stf', 'SI R', 'SI L', 'CT Stf', 'CT R', 'CT L', 'SL Stf', 'SL R', 'SL L', 'SW Stf', 'SW R', 'SW L', 'CB Stf', 'CB R', 'CB L', 'CH Stf', 'CH R', 'CH L', 'SP Stf', 'SP R', 'SP L'
    ],
    rp: [
      'Name', 'Team',
      'Pts', 'PPG', 'Score', 'All', 'Con', 'Disc', 'Val', 'S Val', 'vSzn', 'Velo', 'Stf', 'Rarity', 'LCon', 'LDisc', 'W', 'L', 'IP', 'BB', 'K', 'QS/SV', 'BS', 'ERA', 'WHIP', 'Days +/-', 'BB%', 'K%', 'SwStr%', 'CSW%', '≥50 Qual',
      'FB Stf', 'FB R', 'FB L', 'SI Stf', 'SI R', 'SI L', 'CT Stf', 'CT R', 'CT L', 'SL Stf', 'SL R', 'SL L', 'SW Stf', 'SW R', 'SW L', 'CB Stf', 'CB R', 'CB L', 'CH Stf', 'CH R', 'CH L', 'SP Stf', 'SP R', 'SP L'
    ],
  },
  playoffs: {
    hitters: ['Name', 'Pos', '2nd Pos', 'Team', 'All', 'Con', 'Disc', 'PA', 'HR', 'AVG', 'OBP', 'SLG', 'OPS', 'SwSp%', '≥100', 'Whiff%', 'R Eye', 'L Eye'],
    sp: ['Name', 'Team', 'Velo', 'Stf', 'All', 'Con', 'Disc', 'IP', 'K', 'WHIP', 'SwStr%', 'Days +/-', 'BB%', 'K%'],
    rp: ['Name', 'Team', 'Velo', 'Stf', 'All', 'Con', 'Disc', 'IP', 'K', 'WHIP', 'SwStr%', 'Days +/-', 'BB%', 'K%'],
  },
  spring: {
    hitters: ['Name', 'Pos', '2nd Pos', 'Team', 'All', 'Con', 'Disc', 'PA', 'HR', 'AVG', 'OBP', 'SLG', 'OPS', 'SwSp%', '≥100', 'Whiff%', 'R Eye', 'L Eye'],
    sp: ['Name', 'Team', 'Velo', 'Stf', 'All', 'Con', 'Disc', 'IP', 'K', 'WHIP', 'SwStr%', 'Days +/-', 'BB%', 'K%'],
    rp: ['Name', 'Team', 'Velo', 'Stf', 'All', 'Con', 'Disc', 'IP', 'K', 'WHIP', 'SwStr%', 'Days +/-', 'BB%', 'K%'],
  },
  minors: {
    hitters: ['Name', 'Pos', '2nd Pos', 'Team', 'All', 'Con', 'Disc', 'PA', 'HR', 'AVG', 'OBP', 'SLG', 'OPS', 'SwSp%', '≥100', 'Whiff%', 'R Eye', 'L Eye'],
    sp: ['Name', 'Team', 'Velo', 'Stf', 'All', 'Con', 'Disc', 'IP', 'K', 'WHIP', 'SwStr%', 'Days +/-', 'BB%', 'K%'],
    rp: ['Name', 'Team', 'Velo', 'Stf', 'All', 'Con', 'Disc', 'IP', 'K', 'WHIP', 'SwStr%', 'Days +/-', 'BB%', 'K%'],
  },
};
/* ################# */
const fantasy_sort_columns = {
  majors: {
    hitters: [
      'Pts', 'PPG', 'Score', 'All', 'Con', 'Disc', 'Val', 'S Val', 'vSzn', 'RHP', 'LHP', 'R Hit', 'R Pwr', 'L Hit', 'L Pwr', 'PA', 'H', '2B', '3B', 'R', 'HR', 'RBI', 'SB', 'BB', 'SO',
      'AVG', 'OBP', 'SLG', 'OPS', 'Pts +/-', 'Whiff%', 'SwSp%', '≥100', 'R Eye', 'L Eye', 'BB%', 'K%', 'FB R', 'SI R', 'CT R', 'SL R', 'SW R', 'CB R', 'CH R', 'SP R', 'FB L', 'SI L', 'CT L', 'SL L', 'SW L', 'CB L', 'CH L', 'SP L'
    ],
    sp: [
      'Pts', 'PPG', 'Score', 'All', 'Con', 'Disc', 'Val', 'S Val', 'vSzn', 'Velo', 'Stf', 'Rarity', 'LCon', 'LDisc', 'W', 'L', 'IP', 'BB', 'K', 'QS/SV', 'ERA', 'WHIP', 'Days +/-', 'BB%', 'K%', 'SwStr%', 'CSW%', '≥50 Qual',
      'FB Stf', 'FB R', 'FB L', 'SI Stf', 'SI R', 'SI L', 'CT Stf', 'CT R', 'CT L', 'SL Stf', 'SL R', 'SL L', 'SW Stf', 'SW R', 'SW L', 'CB Stf', 'CB R', 'CB L', 'CH Stf', 'CH R', 'CH L', 'SP Stf', 'SP R', 'SP L'
    ],
    rp: [
      'Pts', 'PPG', 'Score', 'All', 'Con', 'Disc', 'Val', 'S Val', 'vSzn', 'Velo', 'Stf', 'Rarity', 'LCon', 'LDisc', 'W', 'L', 'IP', 'BB', 'K', 'QS/SV', 'BS', 'ERA', 'WHIP', 'Days +/-', 'BB%', 'K%', 'SwStr%', 'CSW%', '≥50 Qual',
      'FB Stf', 'FB R', 'FB L', 'SI Stf', 'SI R', 'SI L', 'CT Stf', 'CT R', 'CT L', 'SL Stf', 'SL R', 'SL L', 'SW Stf', 'SW R', 'SW L', 'CB Stf', 'CB R', 'CB L', 'CH Stf', 'CH R', 'CH L', 'SP Stf', 'SP R', 'SP L'
    ],
  },
  playoffs: {
    hitters: ['All', 'Con', 'Disc', 'PA', 'HR', 'AVG', 'OBP', 'SLG', 'OPS', 'SwSp%', '≥100', 'Whiff%', 'R Eye', 'L Eye'],
    sp: ['Velo', 'Stf', 'All', 'Con', 'Disc', 'IP', 'K', 'WHIP', 'SwStr%', 'Days +/-', 'BB%', 'K%'],
    rp: ['Velo', 'Stf', 'All', 'Con', 'Disc', 'IP', 'K', 'WHIP', 'SwStr%', 'Days +/-', 'BB%', 'K%'],
  },
  spring: {
    hitters: ['All', 'Con', 'Disc', 'PA', 'HR', 'AVG', 'OBP', 'SLG', 'OPS', 'SwSp%', '≥100', 'Whiff%', 'R Eye', 'L Eye'],
    sp: ['Velo', 'Stf', 'All', 'Con', 'Disc', 'IP', 'K', 'WHIP', 'SwStr%', 'Days +/-', 'BB%', 'K%'],
    rp: ['Velo', 'Stf', 'All', 'Con', 'Disc', 'IP', 'K', 'WHIP', 'SwStr%', 'Days +/-', 'BB%', 'K%'],
  },
  minors: {
    hitters: ['All', 'Con', 'Disc', 'PA', 'HR', 'AVG', 'OBP', 'SLG', 'OPS', 'SwSp%', '≥100', 'Whiff%', 'R Eye', 'L Eye'],
    sp: ['Velo', 'Stf', 'All', 'Con', 'Disc', 'IP', 'K', 'WHIP', 'SwStr%', 'Days +/-', 'BB%', 'K%'],
    rp: ['Velo', 'Stf', 'All', 'Con', 'Disc', 'IP', 'K', 'WHIP', 'SwStr%', 'Days +/-', 'BB%', 'K%'],
  },
};
/* ################# */
const fantasy_hitter_positions = ['All', 'C', '1B', '2B', '3B', 'SS', 'OF', 'DH', 'P'];
/* ################# */
const fantasy_qual_options = {
  hitters: ['', '25', '50', '100', '200', '300', '400', '500'],
  sp: ['', '10', '25', '50', '100', '150'],
  rp: ['', '5', '10', '25', '50'],
};

/* ################# */
function fantasy_qual_label() {
  return fantasy_state.section === 'hitters' ? 'Min PA' : 'Min IP';
}

/* ################# */
function fantasy_qual_key() {
  return fantasy_state.section === 'hitters' ? 'PA' : 'IP';
}
/* ################# */
function fantasy_removals_storage_key() {
  return 'fantasy_removed_players_v1';
}

/* ################# */
function fantasy_get_removed_map() {
  try {
    const raw = sessionStorage.getItem(fantasy_removals_storage_key());
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    return {};
  }
}
/* ################# */
function fantasy_set_removed_map(map) {
  sessionStorage.setItem(fantasy_removals_storage_key(), JSON.stringify(map || {}));
}

/* ################# */
function fantasy_removed_bucket_key() {
  return [
    String(fantasy_state.year || ''),
    String(fantasy_state.scope || ''),
    String(fantasy_state.section || ''),
  ].join('|');
}

/* ################# */
function fantasy_is_removed(row) {
  const map = fantasy_get_removed_map();
  const bucket = map[fantasy_removed_bucket_key()] || {};
  const person_key = String(row.person_key || '');
  return Boolean(person_key && bucket[person_key]);
}

/* ################# */
function fantasy_remove_player(row) {
  const map = fantasy_get_removed_map();
  const bucket_key = fantasy_removed_bucket_key();
  const bucket = map[bucket_key] || {};
  const person_key = String(row.person_key || '');

  if (!person_key) return;

  bucket[person_key] = 1;
  map[bucket_key] = bucket;
  fantasy_set_removed_map(map);
}

/* ################# */
function fantasy_clear_removed_players() {
  const map = fantasy_get_removed_map();
  delete map[fantasy_removed_bucket_key()];
  fantasy_set_removed_map(map);
}
/* ################# */
// function fantasy_sort_desc(key) {
//   const source_key = fantasy_gradient_source_key({}, key);
//   const scales = fantasy_state.scales || {};
//   const panel_lookup = scales.panel_scale_lookup || {};
//   const spec = panel_lookup[source_key];

//   if (spec) {
//     return spec.higher_is_better !== false;
//   }

//   return true;
// }
function fantasy_sort_desc(key) {
  const source_key = fantasy_gradient_source_key({}, key);
  const scales = fantasy_state.scales || {};
  const panel_lookup = scales.panel_scale_lookup || {};
  const spec = panel_lookup[source_key];

  if (spec) {
    if (spec.mode === 'bad_only') {
      return false;
    }

    if (spec.mode === 'good_only') {
      return true;
    }

    return spec.higher_is_better !== false;
  }

  return true;
}
/* ################# */
// function fantasy_num(v) {
//   return typeof v === 'number' && !Number.isNaN(v) ? v : null;
// }
function fantasy_num(v) {
  if (v == null || v === '') return null;

  if (typeof v === 'number') {
    return Number.isNaN(v) ? null : v;
  }

  const num = Number(v);
  return Number.isNaN(num) ? null : num;
}
/* ################# */
function fantasy_pct_value(v) {
  const num = fantasy_num(v);
  if (num == null) return null;
  return num * 100.0;
}
/* ################# */
function fantasy_is_pct2_key(key) {
  return new Set([
    'Pts +/-', 'Days +/-',
    'Whiff%', 'SwSp%', '≥100',
    'R Eye', 'L Eye', 'BB%', 'K%',
    'SwStr%', 'CSW%'
  ]).has(key);
}
/* ################# */
function fantasy_fmt(key, v) {
  if (v == null || v === '') return '';

  const int_keys = new Set([
    'PA', 'R', 'HR', 'RBI', 'SB',
    'K', 'BB', 'QS/SV', 'Pts', '≥50 Qual'
  ]);

  const two_dec_keys = new Set([
    'PPG', 'S PPG',
    'LDisc', 'LCon'
  ]);

  const two_dec_keep_leading_zero_keys = new Set([
    'ERA', 'WHIP'
  ]);

  const three_dec_keys = new Set([
    'AVG', 'OBP', 'SLG', 'OPS', 'S OPS'
  ]);

  const pct2_keys = new Set([
    'Pts +/-', 'Days +/-', 'S Days +/-',
    'Whiff%', 'SwSp%', '≥100',
    'R Eye', 'L Eye', 'BB%', 'K%',
    'SwStr%', 'CSW%'
  ]);

  const one_dec_keys = new Set([
    'IP', 'S IP',
    'Score', 'All', 'Con', 'Disc', 'Val', 'vSzn',
    'S Score', 'S All', 'S Con', 'S Disc', 'S Val', 'S Stf',
    'Velo', 'Stf'
  ]);

  if (int_keys.has(key)) return String(Math.round(Number(v)));

  if (two_dec_keys.has(key)) return Number(v).toFixed(2).replace(/^0(?=\.)/, '');

  if (two_dec_keep_leading_zero_keys.has(key)) return Number(v).toFixed(2);

  if (three_dec_keys.has(key)) return Number(v).toFixed(3).replace(/^0(?=\.)/, '');

  if (pct2_keys.has(key)) return `${(Number(v) * 100).toFixed(2).replace(/^0(?=\.)/, '')}%`;

  if (one_dec_keys.has(key)) return Number(v).toFixed(1);

  return String(v);
}

/* ################# */
function fantasy_player_link(row) {
  const safe_name = escape_html(row.name || '');
  const person_key = row.person_key || '';
  const role = row.role === 'sp' ? 'starters' : row.role === 'rp' ? 'bullpen' : 'batters';

  return `
    <a href="#" class="fantasy_player_link" data-person_key="${escape_html(person_key)}" data-role="${escape_html(role)}">${safe_name}</a>
  `;
}
/* ################# */
async function load_fantasy_scales() {
  if (fantasy_state.scales) return fantasy_state.scales;

  const resp = await fetch('assets/fantasy_scales.json');
  if (!resp.ok) {
    throw new Error('Missing fantasy scales');
  }

  fantasy_state.scales = await resp.json();
  return fantasy_state.scales;
}
/* ################# */
async function load_fantasy_data(year) {
  const y = String(year);

  if (fantasy_state.data_cache.has(y)) {
    return fantasy_state.data_cache.get(y);
  }

  const resp = await fetch(`assets/fantasy_${y}.json`);
  if (!resp.ok) {
    throw new Error(`Missing fantasy data for ${y}`);
  }

  const data = await resp.json();
  fantasy_state.data_cache.set(y, data);
  return data;
}

/* ################# */
function fantasy_current_columns() {
  const cols = fantasy_display_columns[fantasy_state.scope][fantasy_state.section] || [];

  if (
    fantasy_state.scope === 'majors' &&
    fantasy_state.section === 'hitters' &&
    Number(fantasy_state.year) < 2023
  ) {
    const blocked = new Set(['R Hit', 'R Pwr', 'L Hit', 'L Pwr']);
    return cols.filter(col => !blocked.has(col));
  }

  return cols;
}
/* ################# */
function fantasy_sortable_columns() {
  return new Set(fantasy_current_columns().filter(col => {
    const sortable = fantasy_sort_columns[fantasy_state.scope][fantasy_state.section] || [];
    return sortable.includes(col);
  }));
}
/* ################# *//* teams handling */
function fantasy_is_multi_team_placeholder(team) {
  const s = String(team || '').trim();
  return s === '- - -' || s === '---';
}
/* ################# */
function fantasy_split_teams_value(teams_value) {
  return String(teams_value || '')
    .split(',')
    .map(team => String(team || '').trim())
    .filter(team => team);
}
/* ################# */
function fantasy_last_team_from_teams_value(teams_value) {
  const teams = fantasy_split_teams_value(teams_value);
  return teams.length ? teams[teams.length - 1] : '';
}
/* ################# */
function fantasy_effective_team(row) {
  const display_team = String(row.team || '').trim();

  if (fantasy_state.scope === 'playoffs') {
    const playoff_team = fantasy_last_team_from_teams_value(row.Teams);
    return playoff_team || display_team;
  }

  return display_team;
}
/* ################# */
// function fantasy_row_with_effective_team(row) {
//   const out = { ...row };

//   if (fantasy_state.scope === 'playoffs') {
//     const playoff_team = fantasy_last_team_from_teams_value(out.Teams);
//     if (playoff_team) {
//       out.team = playoff_team;
//     }
//   }

//   return out;
// }

function fantasy_effective_team(row) {
  const display_team = String(row.team || '').trim();

  const wbc_teams = new Set([
    'AUS', 'BRA', 'CAN', 'CO', 'CUB', 'CZE', 'DR', 'JPN', 'KOR',
    'MEX', 'NED', 'NIC', 'PAN', 'PR', 'VEN', 'TAI',
  ]);

  if (fantasy_state.scope === 'playoffs' && fantasy_is_multi_team_placeholder(display_team)) {
    const playoff_team = fantasy_last_team_from_teams_value(row.Teams);
    const playoff_team_upper = String(playoff_team || '').trim().toUpperCase();

    if (wbc_teams.has(playoff_team_upper)) {
      return 'WBC';
    }

    return playoff_team || display_team;
  }

  if (wbc_teams.has(display_team.toUpperCase())) {
    return 'WBC';
  }

  return display_team;
}
/* ################# */
function fantasy_row_with_position_fallback(row, data) {
  const out = { ...row };

  if (String(out.pos || '').trim() && String(out.pos2 || '').trim()) {
    return out;
  }

  const person_key = String(out.person_key || '');
  if (!person_key) return out;

  const majors_hitters = data?.majors?.hitters || [];
  const fallback_row = majors_hitters.find(r => String(r.person_key || '') === person_key);

  if (!fallback_row) return out;

  if (!String(out.pos || '').trim()) {
    out.pos = fallback_row.pos || '';
  }

  if (!String(out.pos2 || '').trim()) {
    out.pos2 = fallback_row.pos2 || '';
  }

  return out;
}
/* ################# */
// function fantasy_team_options(data) {
//   const rows = fantasy_current_rows(data);

//   const teams = Array.from(
//     new Set(
//       rows
//         .map(row => String(row.team || '').trim())
//         .filter(team => team && team.toUpperCase() !== 'FA')
//         .filter(team => team.toUpperCase() !== 'FREE AGENTS')
//         .filter(team => team.toUpperCase() !== 'FREE AGENT')
//     )
//   ).sort((a, b) => a.localeCompare(b));

//   return ['ALL', ...teams];
// }
function fantasy_team_options(data) {
  const rows = fantasy_current_rows(data);

  const teams = Array.from(
    new Set(
      rows.flatMap(row => {
        const display_team = String(row.team || '').trim();

        if (
          fantasy_state.scope === 'majors' &&
          fantasy_is_multi_team_placeholder(display_team)
        ) {
          return fantasy_split_teams_value(row.Teams);
        }

        return display_team ? [display_team] : [];
      })
    )
  )
    .filter(team => team && team.toUpperCase() !== 'FA')
    .filter(team => team.toUpperCase() !== 'FREE AGENTS')
    .filter(team => team.toUpperCase() !== 'FREE AGENT')
    .sort((a, b) => a.localeCompare(b));

  return ['ALL', ...teams];
}
/* ################# */
// function fantasy_current_rows(data) {
//   let rows = data?.[fantasy_state.scope]?.[fantasy_state.section] || [];

//   if (fantasy_state.section === 'hitters' && fantasy_state.scope !== 'majors') {
//     rows = rows.map(row => fantasy_row_with_position_fallback(row, data));
//   }

//   return rows;
// }
function fantasy_current_rows(data) {
  let rows = data?.[fantasy_state.scope]?.[fantasy_state.section] || [];

  rows = rows.map(row => ({
    ...row,
    team: fantasy_effective_team(row),
  }));

  if (fantasy_state.section === 'hitters' && fantasy_state.scope !== 'majors') {
    rows = rows.map(row => fantasy_row_with_position_fallback(row, data));
  }

  return rows;
}
/* ################# */
function fantasy_filter_rows(data) {
  let rows = fantasy_current_rows(data).slice();

  rows = rows.filter(row => !fantasy_is_removed(row));

  // if (fantasy_state.team !== 'ALL') {
  //   rows = rows.filter(row => String(row.team || '').toUpperCase() === fantasy_state.team);
  // }
if (fantasy_state.team !== 'ALL') {
  rows = rows.filter(row => {
    const display_team = String(row.team || '').trim().toUpperCase();

    if (
      fantasy_state.scope === 'majors' &&
      fantasy_is_multi_team_placeholder(row.team)
    ) {
      const teams = fantasy_split_teams_value(row.Teams).map(team => team.toUpperCase());
      return teams.includes(fantasy_state.team);
    }

    return display_team === fantasy_state.team;
  });
}

  if (fantasy_state.section === 'hitters' && fantasy_state.hitter_pos !== 'ALL') {
    rows = rows.filter(row => {
      const pos = String(row.pos || '').toUpperCase();
      const pos2 = String(row.pos2 || '').toUpperCase();
      return pos === fantasy_state.hitter_pos || pos2 === fantasy_state.hitter_pos;
    });
  }

  if (fantasy_state.qual_min !== '') {
    const qual_key = fantasy_qual_key();
    const qual_min = Number(fantasy_state.qual_min);

    rows = rows.filter(row => {
      const value = Number(row[qual_key]);
      return !Number.isNaN(value) && value >= qual_min;
    });
  }

  return rows;
}
/* ################# */
// function fantasy_sort_rows(rows) {
//   const key = fantasy_state.sort_key;
//   const desc = fantasy_state.sort_desc;

//   rows.sort((a, b) => {
//     let av = fantasy_num(a[key]);
//     let bv = fantasy_num(b[key]);

//     if (fantasy_is_pct2_key(key)) {
//       av = fantasy_pct_value(a[key]);
//       bv = fantasy_pct_value(b[key]);
//     }

//     if (av == null && bv == null) return String(a.name || '').localeCompare(String(b.name || ''));
//     if (av == null) return 1;
//     if (bv == null) return -1;

//     if (av === bv) return String(a.name || '').localeCompare(String(b.name || ''));

//     return desc ? bv - av : av - bv;
//   });

//   return rows;
// }
function fantasy_sort_value(row, key) {
  if (key === 'All') {
    if (fantasy_state.scope === 'playoffs') {
      return fantasy_num(row['pAll']) ?? fantasy_num(row['All']);
    }

    if (fantasy_state.scope === 'spring') {
      return fantasy_num(row['sAll']) ?? fantasy_num(row['All']);
    }

    if (fantasy_state.scope === 'minors') {
      const has_m_all = fantasy_num(row['mAll']);
      const has_m_all_prev = fantasy_num(row['mAll -1']);

      if (has_m_all != null || has_m_all_prev != null) {
        return (has_m_all ?? 0) + (has_m_all_prev ?? 0);
      }

      return fantasy_num(row['All']);
    }
  }

  let value = fantasy_num(row[key]);

  if (fantasy_is_pct2_key(key)) {
    value = fantasy_pct_value(row[key]);
  }

  return value;
}
/* ################# */
function fantasy_sort_rows(rows) {
  const key = fantasy_state.sort_key;
  const desc = fantasy_state.sort_desc;

  rows.sort((a, b) => {
    const av = fantasy_sort_value(a, key);
    const bv = fantasy_sort_value(b, key);

    if (av == null && bv == null) return String(a.name || '').localeCompare(String(b.name || ''));
    if (av == null) return 1;
    if (bv == null) return -1;

    if (av === bv) return String(a.name || '').localeCompare(String(b.name || ''));

    return desc ? bv - av : av - bv;
  });

  return rows;
}
/* ################# */
function fantasy_default_sort_key() {
  if (fantasy_state.scope === 'majors') {
    return 'Val';
  }

  if (fantasy_state.scope === 'playoffs') {
    return 'All';
  }

  if (fantasy_state.scope === 'spring') {
    return 'All';
  }

  if (fantasy_state.scope === 'minors') {
    return 'All';
  }

  const cols = fantasy_sort_columns[fantasy_state.scope][fantasy_state.section] || [];
  return cols[0] || 'All';
}

/* ################# */
function fantasy_build_controls_html(data) {
  // const fantasy_years = [];
  // for (let y = 2026; y >= 2015; y -= 1) {
  //   fantasy_years.push(y);
  // }
  const min_year = fantasy_state.scope === 'minors' ? 2022 : 2015;

  const fantasy_years = [];
  for (let y = 2026; y >= min_year; y -= 1) {
    fantasy_years.push(y);
  }
  const team_options = fantasy_team_options(data);

  const year_options = fantasy_years
    .map(y => `<option value="${y}" ${y === fantasy_state.year ? 'selected' : ''}>${y}</option>`)
    .join('');

  const section_options = [
    ['hitters', 'Hitters'],
    ['sp', 'SP'],
    ['rp', 'RP'],
  ].map(([value, label]) => `<option value="${value}" ${value === fantasy_state.section ? 'selected' : ''}>${label}</option>`).join('');

  const scope_options = [
    ['majors', 'MLB'],
    ['playoffs', 'Playoffs'],
    ['spring', 'Spring'],
    ['minors', 'Minor Leagues'],
  ].map(([value, label]) => `<option value="${value}" ${value === fantasy_state.scope ? 'selected' : ''}>${label}</option>`).join('');

  const team_options_html = team_options
    .map(value => {
      const label = value === 'ALL' ? 'All Teams' : value;
      return `<option value="${value}" ${value === fantasy_state.team ? 'selected' : ''}>${label}</option>`;
    })
    .join('');

  const pos_wrap = fantasy_state.section === 'hitters'
    ? `
      <div>
        <div class="matchups_label">Position</div>
        <select id="fantasy_hitter_pos" class="matchups_select">
          ${fantasy_hitter_positions.map(value => `<option value="${value}" ${value === fantasy_state.hitter_pos ? 'selected' : ''}>${value}</option>`).join('')}
        </select>
      </div>
    `
    : '';

  const qual_options = (fantasy_qual_options[fantasy_state.section] || [''])
    .map(value => {
      const label = value === '' ? 'All' : value;
      return `<option value="${value}" ${String(value) === String(fantasy_state.qual_min) ? 'selected' : ''}>${label}</option>`;
    })
    .join('');

  const qual_wrap = `
    <div>
      <div class="matchups_label">${fantasy_qual_label()}</div>
      <select id="fantasy_qual_min" class="matchups_select">
        ${qual_options}
      </select>
    </div>
  `;

  return `
    <div class="matchups_form_row">
      <div>
        <div class="matchups_label">Section</div>
        <select id="fantasy_section" class="matchups_select">
          ${section_options}
        </select>
      </div>

      <div>
        <div class="matchups_label">Scope</div>
        <select id="fantasy_scope" class="matchups_select">
          ${scope_options}
        </select>
      </div>

      ${pos_wrap}
      ${qual_wrap}

    <div>
      <div class="matchups_label">Year</div>
      <div class="fantasy_year_row">
        <select id="fantasy_year" class="matchups_select">
          ${year_options}
        </select>

        <select id="fantasy_team" class="matchups_select">
          ${team_options_html}
        </select>

        <span class="matchups_disclaimer">Pre-2025 positions not 100% accurate until I enter them myself, also teams can be wonky (WIP)</span>
      </div>
    </div>

      <div class="fantasy_checkbox_wrap">
        <label class="fantasy_filter_row" for="fantasy_show_gradients">
          <input id="fantasy_show_gradients" type="checkbox" ${fantasy_state.show_gradients ? 'checked' : ''} />
          <span>Show Heat Mapping</span>
        </label>
      </div>

      <div class="fantasy_clear_wrap">
        <div class="matchups_label">&nbsp;</div>
        <button id="fantasy_undo_removals" type="button" class="matchups_submit fantasy_clear_btn">Undo Removals</button>
      </div>
    </div>
  `;
}
/* ################# */
function fantasy_column_divider_class(col) {
  if (fantasy_state.scope !== 'majors') return '';

  const heavy_dividers_by_section = {
    hitters: new Set(['Pts', 'Val', 'RHP', 'R Hit', 'PA', 'AVG', 'Pts +/-', 'Whiff%', 'R Eye', 'FB R', 'FB L']),
    sp: new Set(['Pts', 'Velo', 'W', 'Val', 'LCon', 'ERA', 'Days +/-', '≥50 Qual', 'FB Stf']),
    rp: new Set(['Pts', 'Velo', 'W', 'Val', 'LCon', 'ERA', 'Days +/-', '≥50 Qual', 'FB Stf']),
  };

  const light_dividers_by_section = {
    hitters: new Set(),
    sp: new Set(['SI Stf', 'CT Stf', 'SL Stf', 'SW Stf', 'CB Stf', 'CH Stf', 'SP Stf']),
    rp: new Set(['SI Stf', 'CT Stf', 'SL Stf', 'SW Stf', 'CB Stf', 'CH Stf', 'SP Stf']),
  };

  const heavy = heavy_dividers_by_section[fantasy_state.section] || new Set();
  const light = light_dividers_by_section[fantasy_state.section] || new Set();

  if (heavy.has(col)) return ' fantasy_divider_before';
  if (light.has(col)) return ' fantasy_divider_before_light';
  return '';
}
/* ################# */
function fantasy_display_label(col) {
  const label_map = {
    'Days +/-': 'Consistency',
    'Pts +/-': 'Consistency',
    'vSzn': 'Val (Season)',
    'S Val': 'Val (Streak)',
    'SwSp%': 'Sweet Spot%',
    'LCon': 'Loc for Contact',
    'Rarity': 'Funkiness',
    'Con': 'Contact',
    'Disc': 'Discipline',
    'LDisc': 'Loc for K/BB',
    '≥50 Qual': '+Pitches',
    'SO': 'K',
    'Velo': 'pVelo',
    };

  return label_map[col] || col;
}
/* ################# */
function fantasy_gradient_source_key(row, col) {
  const scope = String(fantasy_state.scope || '');
  const section = String(fantasy_state.section || '');

  if (!col || col === 'Name' || col === 'Pos' || col === '2nd Pos' || col === 'Team') {
    return '';
  }

  const shared_pitch_type_cols = new Set([
    'FB R', 'FB L',
    'SI R', 'SI L',
    'CT R', 'CT L',
    'SL R', 'SL L',
    'SW R', 'SW L',
    'CB R', 'CB L',
    'CH R', 'CH L',
    'SP R', 'SP L',
  ]);

  const shared_pitch_type_key_map = {
    'FB R': 'FB',
    'FB L': 'FB',
    'SI R': 'SI',
    'SI L': 'SI',
    'CT R': 'CT',
    'CT L': 'CT',
    'SL R': 'SL',
    'SL L': 'SL',
    'SW R': 'SW',
    'SW L': 'SW',
    'CB R': 'CB',
    'CB L': 'CB',
    'CH R': 'CH',
    'CH L': 'CH',
    'SP R': 'SP',
    'SP L': 'SP',
  };

  if (scope === 'majors' && section === 'hitters' && shared_pitch_type_cols.has(col)) {
    return `${scope}|${section}|${shared_pitch_type_key_map[col]}`;
  }

  const base_map = {
    playoffs: {
      hitters: {
        'All': 'pAll',
        'Con': 'Playoff Con',
        'Disc': 'Playoff Disc',
        'SwSp%': 'Playoff SwSp%',
        '≥100': 'Playoff ≥100',
        'Whiff%': 'Playoff Whiff%',
        'R Eye': 'Playoff R Eye',
        'L Eye': 'Playoff L Eye',
      },
      sp: {
        'All': 'pAll',
        'Con': 'Playoff Con',
        'Disc': 'Playoff Disc',
        'Velo': 'Playoff Velo',
        'Stf': 'Playoff Stf',
        'SwStr%': 'Playoff SwStr%',
        // 'Strike%': 'Playoff Strike%',
        'Days +/-': 'Playoff Days +/-',
        'BB%': 'Playoff BB%',
        'K%': 'Playoff K%',
      },
      rp: {
        'All': 'pAll',
        'Con': 'Playoff Con',
        'Disc': 'Playoff Disc',
        'Velo': 'Playoff Velo',
        'Stf': 'Playoff Stf',
        'SwStr%': 'Playoff SwStr%',
        // 'Strike%': 'Playoff Strike%',
        'Days +/-': 'Playoff Days +/-',
        'BB%': 'Playoff BB%',
        'K%': 'Playoff K%',
      },
    },

    spring: {
      hitters: {
        'All': 'sAll',
        'Con': 'Spring Con',
        'Disc': 'Spring Disc',
        'SwSp%': 'Spring SwSp%',
        '≥100': 'Spring ≥100',
        'Whiff%': 'Spring Whiff%',
        'R Eye': 'Spring R Eye',
        'L Eye': 'Spring L Eye',
      },
      sp: {
        'All': 'sAll',
        'Con': 'Spring Con',
        'Disc': 'Spring Disc',
        'Velo': 'Spring Velo',
        'Stf': 'Spring Stf',
        'SwStr%': 'Spring SwStr%',
        // 'Strike%': 'Spring Strike%',
        'Days +/-': 'Spring Days +/-',
        'BB%': 'Spring BB%',
        'K%': 'Spring K%',
      },
      rp: {
        'All': 'sAll',
        'Con': 'Spring Con',
        'Disc': 'Spring Disc',
        'Velo': 'Spring Velo',
        'Stf': 'Spring Stf',
        'SwStr%': 'Spring SwStr%',
        // 'Strike%': 'Spring Strike%',
        'Days +/-': 'Spring Days +/-',
        'BB%': 'Spring BB%',
        'K%': 'Spring K%',
      },
    },

    minors: {
      hitters: {
        'All': 'mAll',
        'Con': 'Minors Con',
        'Disc': 'Minors Disc',
        'SwSp%': 'Minors SwSp%',
        '≥100': 'Minors ≥100',
        'Whiff%': 'Minors Whiff%',
        'R Eye': 'Minors R Eye',
        'L Eye': 'Minors L Eye',
      },
      sp: {
        'All': 'mAll',
        'Con': 'Minors Con',
        'Disc': 'Minors Disc',
        'Velo': 'Minors Velo',
        'Stf': 'Minors Stf',
        'SwStr%': 'Minors SwStr%',
        // 'Strike%': 'Minors Strike%',
        'Days +/-': 'Minors Days +/-',
        'BB%': 'Minors BB%',
        'K%': 'Minors K%',
        'LCon': 'Minors LCon',
        'LDisc': 'Minors LDisc',
      },
      rp: {
        'All': 'mAll',
        'Con': 'Minors Con',
        'Disc': 'Minors Disc',
        'Velo': 'Minors Velo',
        'Stf': 'Minors Stf',
        'SwStr%': 'Minors SwStr%',
        // 'Strike%': 'Minors Strike%',
        'Days +/-': 'Minors Days +/-',
        'BB%': 'Minors BB%',
        'K%': 'Minors K%',
        'LCon': 'Minors LCon',
        'LDisc': 'Minors LDisc',
      },
    },
  };

  if (scope === 'minors') {
    const selected_year = Number(fantasy_state.year);
    const prev_minors_year = Number(row.prev_minors_year);
    const use_prev = !Number.isNaN(selected_year) && !Number.isNaN(prev_minors_year) && selected_year === prev_minors_year;

    if (use_prev) {
      const prev_map = {
        hitters: {
          'All': 'mAll -1',
          'Con': 'Prev Minors Con',
          'Disc': 'Prev Minors Disc',
          'SwSp%': 'Prev Minors SwSp%',
          '≥100': 'Prev Minors ≥100',
          'Whiff%': 'Prev Minors Whiff%',
          'R Eye': 'Prev Minors R Eye',
          'L Eye': 'Prev Minors L Eye',
        },
        sp: {
          'All': 'mAll -1',
          'Con': 'Prev Minors Con',
          'Disc': 'Prev Minors Disc',
          'Velo': 'Prev Minors Velo',
          'Stf': 'Prev Minors Stf',
          'SwStr%': 'Prev Minors SwStr%',
          // 'Strike%': 'Prev Minors Strike%',
          'Days +/-': 'Prev Minors Days +/-',
          'LCon': 'Prev Minors LCon',
          'LDisc': 'Prev Minors LDisc',
        },
        rp: {
          'All': 'mAll -1',
          'Con': 'Prev Minors Con',
          'Disc': 'Prev Minors Disc',
          'Velo': 'Prev Minors Velo',
          'Stf': 'Prev Minors Stf',
          'SwStr%': 'Prev Minors SwStr%',
          // 'Strike%': 'Prev Minors Strike%',
          'Days +/-': 'Prev Minors Days +/-',
          'LCon': 'Prev Minors LCon',
          'LDisc': 'Prev Minors LDisc',
        },
      };

      const mapped_prev = (prev_map[section] || {})[col] || col;
      return `${scope}|${section}|${mapped_prev}`;
    }
  }

  const mapped = (((base_map[scope] || {})[section] || {})[col]) || col;
  return `${scope}|${section}|${mapped}`;
}
/* ################# */
function fantasy_use_gold_for_value(value, spec) {
  const num_value = Number(value);
  const gold = Number(spec?.gold);

  if (Number.isNaN(num_value) || Number.isNaN(gold)) return false;

  const higher_is_better = spec?.higher_is_better !== false;
  return higher_is_better ? num_value >= gold : num_value <= gold;
}
/* ################# */
function fantasy_blend_rgba_on_rgb(rgba_str, base_rgb = [235, 240, 248]) {
  if (typeof rgba_str !== 'string') return '';

  const s = rgba_str.trim();
  if (s.startsWith('rgb(')) return s;
  if (!s.startsWith('rgba(')) return '';

  const parts = s.replace('rgba(', '').replace(')', '').split(',');
  if (parts.length !== 4) return '';

  const r = Number(parts[0].trim());
  const g = Number(parts[1].trim());
  const b = Number(parts[2].trim());
  const a = Number(parts[3].trim());

  const br = base_rgb[0];
  const bg = base_rgb[1];
  const bb = base_rgb[2];

  const out_r = Math.round(r * a + br * (1 - a));
  const out_g = Math.round(g * a + bg * (1 - a));
  const out_b = Math.round(b * a + bb * (1 - a));

  return `rgb(${out_r},${out_g},${out_b})`;
}

/* ################# */
// function fantasy_standard_stats_gradient(frac) {
//   if (frac == null || Number.isNaN(frac)) return '';

//   const x = Math.max(0, Math.min(1, Number(frac)));
//   const alpha_min = 0.25;
//   const alpha_max = 0.95;
//   const alpha_curve_pow = 0.40;

//   const d = Math.max(0, Math.min(1, Math.abs(x - 0.5) * 2.0));
//   const t = Math.max(0, (d - 0.10) / 0.90);
//   const alpha = alpha_min + (alpha_max - alpha_min) * (t ** alpha_curve_pow);

//   const rgb = x > 0.5 ? [210, 35, 35] : [35, 85, 210];
//   return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha.toFixed(3)})`;
// }
function fantasy_standard_stats_gradient(frac, use_gold = false) {
  if (frac == null || Number.isNaN(frac)) return '';

  const x = Math.max(0, Math.min(1, Number(frac)));
  const alpha_min = 0.25;
  const alpha_max = 0.95;
  const alpha_curve_pow = 0.40;

  const d = Math.max(0, Math.min(1, Math.abs(x - 0.5) * 2.0));
  const t = Math.max(0, (d - 0.10) / 0.90);
  const alpha = alpha_min + (alpha_max - alpha_min) * (t ** alpha_curve_pow);

  const rgb = x > 0.5
    ? (use_gold ? [184, 134, 11] : [210, 35, 35])
    : [35, 85, 210];

  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha.toFixed(3)})`;
}
/* ################# */
// function fantasy_gradient_good_only_stats(frac) {
//   if (frac == null || Number.isNaN(frac)) return '';

//   const t = Math.max(0, Math.min(1, Number(frac)));
//   const frac2 = 0.5 + 0.5 * t;

//   const alpha_min = 0.25;
//   const alpha_max = 0.95;
//   const alpha_curve_pow = 0.40;

//   const d = Math.max(0, Math.min(1, Math.abs(frac2 - 0.5) * 2.0));
//   const alpha = alpha_min + (alpha_max - alpha_min) * (d ** alpha_curve_pow);

//   return fantasy_blend_rgba_on_rgb(`rgba(210,35,35,${alpha.toFixed(3)})`);
// }
function fantasy_gradient_good_only_stats(frac, use_gold = false) {
  if (frac == null || Number.isNaN(frac)) return '';

  const t = Math.max(0, Math.min(1, Number(frac)));
  const frac2 = 0.5 + 0.5 * t;

  const alpha_min = 0.25;
  const alpha_max = 0.95;
  const alpha_curve_pow = 0.40;

  const d = Math.max(0, Math.min(1, Math.abs(frac2 - 0.5) * 2.0));
  const alpha = alpha_min + (alpha_max - alpha_min) * (d ** alpha_curve_pow);

  const rgb = use_gold ? [184, 134, 11] : [210, 35, 35];
  return fantasy_blend_rgba_on_rgb(`rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha.toFixed(3)})`);
}
/* ################# */
function fantasy_gradient_bad_only_stats(frac) {
  if (frac == null || Number.isNaN(frac)) return '';

  const t = Math.max(0, Math.min(1, Number(frac)));
  const frac2 = 0.5 - 0.5 * t;

  const alpha_min = 0.25;
  const alpha_max = 0.95;
  const alpha_curve_pow = 0.40;

  const d = Math.max(0, Math.min(1, Math.abs(frac2 - 0.5) * 2.0));
  const alpha = alpha_min + (alpha_max - alpha_min) * (d ** alpha_curve_pow);

  return fantasy_blend_rgba_on_rgb(`rgba(35,85,210,${alpha.toFixed(3)})`);
}
/* ################# */
function fantasy_graph_bar_fill(v, spec) {
  let value = Number(v);
  let worst = Number(spec.worst);
  let neutral_lo = Number(spec.neutral_lo);
  let neutral_hi = Number(spec.neutral_hi);
  let best = Number(spec.best);
  const higher_is_better = spec.higher_is_better !== false;

  if (!higher_is_better) {
    value = -value;
    [worst, best] = [-worst, -best];
    [neutral_lo, neutral_hi] = [-neutral_hi, -neutral_lo];
  }

  const lo = Math.min(worst, best);
  const hi = Math.max(worst, best);
  value = Math.min(Math.max(value, lo), hi);

  const mid = 0.5 * (neutral_lo + neutral_hi);
  if (!(lo <= mid && mid <= hi)) return 0.5;

  if (value <= mid) {
    const denom = Math.max(1e-12, mid - worst);
    const t = Math.max(0, Math.min(1, (value - worst) / denom));
    return 0.5 * t;
  }

  const denom = Math.max(1e-12, best - mid);
  const t = Math.max(0, Math.min(1, (value - mid) / denom));
  return 0.5 + 0.5 * t;
}
/* ################# */
function fantasy_sample_is_reduced(row) {
  if (fantasy_state.section === 'hitters') {
    const pa = fantasy_num(row['PA']);
    if (pa == null) return false;
    return pa < 50;
  }

  const ip = fantasy_num(row['IP']);
  if (ip == null) return false;

  if (fantasy_state.section === 'rp') {
    return ip < 10;
  }

  return ip < 20;
}
/* ################# */
function fantasy_is_deep_gradient_color(style_str) {
  const m = String(style_str || '').match(/background:\s*rgb\((\d+),(\d+),(\d+)\)/i);
  if (!m) return false;

  const r = Number(m[1]);
  const g = Number(m[2]);
  const b = Number(m[3]);

  const blue_like = (b - r >= 30) && (b - g >= 18);
  const red_like = (r - g >= 30) && (r - b >= 18);

  if (!blue_like && !red_like) return false;

  if (blue_like) {
    return b <= 170;
  }

  return r <= 220 ? false : false;
}
/* ################# */
// function fantasy_is_deep_blue_or_red(style_str) {
//   const m = String(style_str || '').match(/background:\s*rgb\((\d+),(\d+),(\d+)\)/i);
//   if (!m) return { deep_blue: false, deep_red: false };

//   const r = Number(m[1]);
//   const g = Number(m[2]);
//   const b = Number(m[3]);

//   const deep_blue = (b - r >= 30) && (b - g >= 18) && b <= 170;
//   const deep_red = (r - g >= 30) && (r - b >= 18) && r >= 185;

//   return { deep_blue, deep_red };
// }
function fantasy_is_deep_blue_or_red(style_str) {
  const m = String(style_str || '').match(/background:\s*rgb\((\d+),(\d+),(\d+)\)/i);
  if (!m) return { deep_blue: false, deep_red: false, deep_gold: false };

  const r = Number(m[1]);
  const g = Number(m[2]);
  const b = Number(m[3]);

  const deep_blue = (b - r >= 30) && (b - g >= 18) && b <= 170;
  const deep_red = (r - g >= 30) && (r - b >= 18) && r >= 185;
  const deep_gold = r >= 140 && g >= 100 && b <= 90;

  return { deep_blue, deep_red, deep_gold };
}
/* ################# */
// function fantasy_should_use_white_text(row, col, gradient_style) {
//   if (!gradient_style) return false;

//   const { deep_blue, deep_red } = fantasy_is_deep_blue_or_red(gradient_style);

//   if (!deep_blue && !deep_red) return false;

//   if (document.body.classList.contains('soft_theme')) {
//     return deep_blue;
//   }

//   return !fantasy_sample_is_reduced(row);
// }
function fantasy_should_use_white_text(row, col, gradient_style) {
  if (!gradient_style) return false;

  const { deep_blue, deep_red, deep_gold } = fantasy_is_deep_blue_or_red(gradient_style);

  if (deep_gold) return true;
  if (!deep_blue && !deep_red) return false;

  if (document.body.classList.contains('soft_theme')) {
    return deep_blue;
  }

  return !fantasy_sample_is_reduced(row);
}
/* ################# */
function fantasy_gradient_style(row, col, value) {
  if (!fantasy_state.show_gradients) return '';
  if (value == null) return '';

  const scales = fantasy_state.scales || {};
  const panel_lookup = scales.panel_scale_lookup || {};
  const source_key = fantasy_gradient_source_key(row, col);
  // const spec = panel_lookup[source_key];

  // if (!spec) return '';
  let spec = panel_lookup[source_key];

  if (fantasy_state.scope === 'majors' && fantasy_state.section === 'rp') {
    if (col === 'PPG' || col === 'S PPG') {
      spec = {
        ...(spec || {}),
        worst: 3.5,
        neutral_lo: 4,
        neutral_hi: 4.5,
        best: 6.5,
        higher_is_better: true,
      };
    }
  }

  if (!spec) return '';

  const num_value = Number(value);
  if (Number.isNaN(num_value)) return '';

  // if (spec.mode === 'good_only') {
  //   const start = Number(spec.start);
  //   const end = Number(spec.end);

  //   if (Number.isNaN(start) || Number.isNaN(end)) return '';
  //   if (num_value < start) return '';

  //   const frac = end === start ? 1.0 : (num_value - start) / (end - start);
  //   const bg = fantasy_gradient_good_only_stats(Math.max(0, Math.min(1, frac)));
  //   return bg ? `background:${bg};` : '';
  // }
    if (spec.mode === 'good_only') {
    const start = Number(spec.start);
    const end = Number(spec.end);

    if (Number.isNaN(start) || Number.isNaN(end)) return '';
    if (num_value < start) return '';

    const frac = end === start ? 1.0 : (num_value - start) / (end - start);
    const use_gold = fantasy_use_gold_for_value(num_value, spec);
    const bg = fantasy_gradient_good_only_stats(Math.max(0, Math.min(1, frac)), use_gold);
    return bg ? `background:${bg};` : '';
  }

  if (spec.mode === 'bad_only') {
    const start = Number(spec.start);
    const end = Number(spec.end);

    if (Number.isNaN(start) || Number.isNaN(end)) return '';
    if (num_value < start) return '';

    const frac = end === start ? 1.0 : (num_value - start) / (end - start);
    const bg = fantasy_gradient_bad_only_stats(Math.max(0, Math.min(1, frac)));
    return bg ? `background:${bg};` : '';
  }

  let worst = Number(spec.worst);
  let neutral_lo = Number(spec.neutral_lo);
  let neutral_hi = Number(spec.neutral_hi);
  let best = Number(spec.best);
  const higher_is_better = spec.higher_is_better !== false;

  if (!higher_is_better) {
    worst = -worst;
    best = -best;
    neutral_lo = -Number(spec.neutral_hi);
    neutral_hi = -Number(spec.neutral_lo);
  }

  const lo_n = Math.min(neutral_lo, neutral_hi);
  const hi_n = Math.max(neutral_lo, neutral_hi);

  let adj_value = num_value;
  if (!higher_is_better) {
    adj_value = -adj_value;
  }

  if (adj_value >= lo_n && adj_value <= hi_n) {
    return '';
  }

  const frac = fantasy_graph_bar_fill(num_value, spec);
  // const bg = fantasy_blend_rgba_on_rgb(fantasy_standard_stats_gradient(frac));
  const use_gold = fantasy_use_gold_for_value(num_value, spec);
  const bg = fantasy_blend_rgba_on_rgb(fantasy_standard_stats_gradient(frac, use_gold));
  if (!bg) return '';

  let text_shadow = '';
  const is_dark_mode = document.body.classList.contains('soft_theme');

  const low_span = Math.max(1e-12, neutral_lo - worst);
  const high_span = Math.max(1e-12, best - neutral_hi);

  const low_outline_cutoff = neutral_lo - (0.30 * low_span);
  const high_outline_cutoff = neutral_hi + (0.30 * high_span);

  if (
    is_dark_mode &&
    (
      (adj_value < neutral_lo && adj_value >= low_outline_cutoff) ||
      (adj_value > neutral_hi && adj_value <= high_outline_cutoff)
    )
  ) {
    text_shadow = '0 0 0.6px rgba(0,0,0,0.95)';
  }

  return `background:${bg};${text_shadow ? `text-shadow:${text_shadow};` : ''}`;
}
/* ################# */
function fantasy_build_table_html(rows) {
  const cols = fantasy_current_columns();
  const sortable_cols = fantasy_sortable_columns();
  const is_majors = fantasy_state.scope === 'majors';

  const header_html = cols.map((col, col_idx) => {
    const sticky_cls = col_idx === 0 ? ' fantasy_sticky_col' : '';
    const divider_cls = fantasy_column_divider_class(col);

    if (!sortable_cols.has(col)) {
      return `<th class="fantasy_th${sticky_cls}${divider_cls}">${escape_html(fantasy_display_label(col))}</th>`;
    }

    let arrow = '↕';
    let active_cls = '';

    if (fantasy_state.sort_key === col) {
      arrow = fantasy_state.sort_desc ? '↓' : '↑';
      active_cls = ' fantasy_sort_btn_active';
    }

    return `
      <th class="fantasy_th fantasy_th_sort${sticky_cls}${divider_cls}">
        <button type="button" class="fantasy_sort_btn${active_cls}" data-sort_key="${escape_html(col)}">
          <span class="fantasy_sort_label">${escape_html(fantasy_display_label(col))}</span>
          <span class="fantasy_sort_arrow">${arrow}</span>
        </button>
      </th>
    `;
  }).join('');

  const body_html = rows.map(row => {
    const tds = cols.map((col, col_idx) => {
      let value = '';
      let cls = 'fantasy_td fantasy_td_center';

      if (col_idx === 0) {
        cls += ' fantasy_sticky_col';
      }

      cls += fantasy_column_divider_class(col);

      if (col === 'Name') {
        const remove_btn = `
          <button
            type="button"
            class="fantasy_remove_btn"
            data-person_key="${escape_html(String(row.person_key || ''))}"
            aria-label="Remove ${escape_html(String(row.name || ''))}"
            title="Remove"
          >×</button>
        `;
        value = `<div class="fantasy_name_cell">${fantasy_player_link(row)}${remove_btn}</div>`;
      } else if (col === 'Pos') {
        value = escape_html(String(row.pos || ''));
      } else if (col === '2nd Pos') {
        value = escape_html(String(row.pos2 || ''));
      } else if (col === 'Team') {
        value = escape_html(String(row.team || ''));
      } else {
        let raw = row[col];

        if (String(col).startsWith('S ') && (raw === 0 || raw === 0.0)) {
          raw = '';
        }

        value = escape_html(fantasy_fmt(col, raw));
      }

      const raw_num = fantasy_num(row[col]);
      const gradient_style = fantasy_gradient_style(row, col, raw_num);
      const use_white_text = fantasy_should_use_white_text(row, col, gradient_style);
      const cell_fill_class = use_white_text ? 'fantasy_cell_fill fantasy_cell_fill_white_text' : 'fantasy_cell_fill';

      if (col === 'Name' || col === 'Pos' || col === '2nd Pos' || col === 'Team') {
        return `<td class="${cls}">${value}</td>`;
      }

      return `
        <td class="${cls}">
          <div class="${cell_fill_class}" style="${gradient_style}">
            ${value}
          </div>
        </td>
      `;
    }).join('');

    return `<tr class="fantasy_tr">${tds}</tr>`;
  }).join('');

  return `
    <div class="fantasy_scroll_shell">
      <div class="fantasy_top_scroll" aria-hidden="true">
        <div class="fantasy_top_scroll_inner"></div>
      </div>

      <div class="fantasy_table_wrap">
        <table class="fantasy_table${is_majors ? ' fantasy_table_majors' : ''}">
          <thead>
            <tr>${header_html}</tr>
          </thead>
          <tbody>
            ${body_html}
          </tbody>
        </table>
      </div>
    </div>
  `;
}
/* ################# */
function fantasy_capture_scroll_state(results_root) {
  const table_wrap = results_root?.querySelector('.fantasy_table_wrap');
  return {
    table_scroll_left: table_wrap ? table_wrap.scrollLeft : 0,
  };
}
/* ################# */
function fantasy_restore_scroll_state(results_root, scroll_state) {
  if (!scroll_state) return;

  const table_wrap = results_root?.querySelector('.fantasy_table_wrap');
  const top_scroll = results_root?.querySelector('.fantasy_top_scroll');

  const left = Number(scroll_state.table_scroll_left || 0);

  if (table_wrap) {
    table_wrap.scrollLeft = left;
  }

  if (top_scroll) {
    top_scroll.scrollLeft = left;
  }
}
/* ################# */
function fantasy_sync_top_scroll(results_root) {
  const shell = results_root?.querySelector('.fantasy_scroll_shell');
  if (!shell) return;

  const top_scroll = shell.querySelector('.fantasy_top_scroll');
  const top_inner = shell.querySelector('.fantasy_top_scroll_inner');
  const table_wrap = shell.querySelector('.fantasy_table_wrap');

  if (!top_scroll || !top_inner || !table_wrap) return;

  const scroll_width = Math.ceil(table_wrap.scrollWidth);
  const viewport_width = Math.ceil(table_wrap.clientWidth);
  const needs_scroll = scroll_width > viewport_width + 1;

  top_inner.style.width = `${scroll_width}px`;
  top_scroll.style.display = needs_scroll ? 'block' : 'none';
  top_scroll.scrollLeft = table_wrap.scrollLeft;
}
/* ################# */
function fantasy_bind_top_scroll(results_root, scroll_state = null) {
  const shell = results_root?.querySelector('.fantasy_scroll_shell');
  if (!shell) return;

  const top_scroll = shell.querySelector('.fantasy_top_scroll');
  const table_wrap = shell.querySelector('.fantasy_table_wrap');
  const table = shell.querySelector('.fantasy_table');

  if (!top_scroll || !table_wrap || !table) return;

  let syncing_from_top = false;
  let syncing_from_bottom = false;

  function sync_sizes() {
    fantasy_sync_top_scroll(results_root);
  }

  top_scroll.addEventListener('scroll', () => {
    if (syncing_from_bottom) return;
    syncing_from_top = true;
    table_wrap.scrollLeft = top_scroll.scrollLeft;
    syncing_from_top = false;
  });

  table_wrap.addEventListener('scroll', () => {
    if (syncing_from_top) return;
    syncing_from_bottom = true;
    top_scroll.scrollLeft = table_wrap.scrollLeft;
    syncing_from_bottom = false;
  });

  requestAnimationFrame(() => {
    sync_sizes();
    fantasy_restore_scroll_state(results_root, scroll_state);

    requestAnimationFrame(() => {
      sync_sizes();
      fantasy_restore_scroll_state(results_root, scroll_state);
    });

    setTimeout(() => {
      sync_sizes();
      fantasy_restore_scroll_state(results_root, scroll_state);
    }, 0);

    setTimeout(() => {
      sync_sizes();
      fantasy_restore_scroll_state(results_root, scroll_state);
    }, 60);
  
    setTimeout(() => {
  sync_sizes();
  fantasy_restore_scroll_state(results_root, scroll_state);
}, 180);
  });

  if (window.ResizeObserver) {
    const ro = new ResizeObserver(() => {
      sync_sizes();
    });

    ro.observe(table_wrap);
    ro.observe(table);
  } else {
    window.addEventListener('resize', sync_sizes);
  }
}
/* ################# */
async function render_fantasy_page() {
  const controls_root = document.getElementById('fantasy_controls_root');
  const results_root = document.getElementById('fantasy_results_root');

  if (!controls_root || !results_root) return;

  const scroll_state = fantasy_capture_scroll_state(results_root);

  if (!fantasy_state.year) {
    fantasy_state.year = Number(window.year_page_lookup ? Object.keys(window.year_page_lookup).sort().slice(-1)[0] : new Date().getFullYear());
  }

  if (!fantasy_state.sort_key) {
    fantasy_state.sort_key = fantasy_default_sort_key();
    fantasy_state.sort_desc = fantasy_sort_desc(fantasy_state.sort_key);
  }

  controls_root.innerHTML = fantasy_build_controls_html({ majors: {}, playoffs: {}, spring: {}, minors: {} });

  try {
    await load_fantasy_scales();
    const data = await load_fantasy_data(fantasy_state.year);
    controls_root.innerHTML = fantasy_build_controls_html(data);
    const rows = fantasy_sort_rows(fantasy_filter_rows(data));
    results_root.innerHTML = fantasy_build_table_html(rows);
    fantasy_bind_top_scroll(results_root, scroll_state);
  } catch (err) {
    results_root.innerHTML = `<div class="static_page"><p>${escape_html(String(err.message || err))}</p></div>`;
  }

  const section_el = document.getElementById('fantasy_section');
  const scope_el = document.getElementById('fantasy_scope');
  const pos_el = document.getElementById('fantasy_hitter_pos');
  const qual_el = document.getElementById('fantasy_qual_min');
  const team_el = document.getElementById('fantasy_team');
  const year_el = document.getElementById('fantasy_year');
  const undo_el = document.getElementById('fantasy_undo_removals');
  const gradients_el = document.getElementById('fantasy_show_gradients');

  if (section_el) {
    section_el.addEventListener('change', () => {
      fantasy_state.section = section_el.value;
      fantasy_state.sort_key = fantasy_default_sort_key();
      fantasy_state.sort_desc = fantasy_sort_desc(fantasy_state.sort_key);
      render_fantasy_page();
    });
  }

  if (scope_el) {
    // scope_el.addEventListener('change', () => {
    //   fantasy_state.scope = scope_el.value;
    //   fantasy_state.sort_key = fantasy_default_sort_key();
    //   fantasy_state.sort_desc = fantasy_sort_desc(fantasy_state.sort_key);
    //   render_fantasy_page();
    // });
      scope_el.addEventListener('change', () => {
      fantasy_state.scope = scope_el.value;

      if (fantasy_state.scope === 'minors' && Number(fantasy_state.year) < 2022) {
        fantasy_state.year = 2026;
      }

      fantasy_state.sort_key = fantasy_default_sort_key();
      fantasy_state.sort_desc = fantasy_sort_desc(fantasy_state.sort_key);
      render_fantasy_page();
    });
  }

  if (pos_el) {
    pos_el.addEventListener('change', () => {
      fantasy_state.hitter_pos = pos_el.value;
      render_fantasy_page();
    });
  }

  if (qual_el) {
    qual_el.addEventListener('change', () => {
      fantasy_state.qual_min = qual_el.value;
      render_fantasy_page();
    });
  }

  if (year_el) {
    year_el.addEventListener('change', () => {
      fantasy_state.year = Number(year_el.value);
      render_fantasy_page();
    });
  }

  if (team_el) {
    team_el.addEventListener('change', () => {
      fantasy_state.team = team_el.value;
      render_fantasy_page();
    });
  }

  if (gradients_el) {
    gradients_el.addEventListener('change', () => {
      fantasy_state.show_gradients = !!gradients_el.checked;
      render_fantasy_page();
    });
  }

  if (undo_el) {
    undo_el.addEventListener('click', () => {
      fantasy_clear_removed_players();
      render_fantasy_page();
    });
  }

  results_root.querySelectorAll('.fantasy_sort_btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-sort_key');
      if (!key) return;

      if (fantasy_state.sort_key === key) {
        fantasy_state.sort_desc = !fantasy_state.sort_desc;
      } else {
        fantasy_state.sort_key = key;
        fantasy_state.sort_desc = fantasy_sort_desc(key);
      }

      render_fantasy_page();
    });
  });

  results_root.querySelectorAll('.fantasy_remove_btn').forEach(btn => {
    btn.addEventListener('click', evt => {
      evt.preventDefault();
      evt.stopPropagation();

      const tr = btn.closest('tr');
      if (!tr) return;

      const row_name_link = tr.querySelector('.fantasy_player_link');
      if (!row_name_link) return;

      const person_key = row_name_link.getAttribute('data-person_key') || '';
      if (!person_key) return;

      fantasy_remove_player({ person_key: person_key });
      render_fantasy_page();
    });
  });

  results_root.querySelectorAll('.fantasy_player_link').forEach(el => {
    el.addEventListener('click', evt => {
      evt.preventDefault();

      const person_key = el.getAttribute('data-person_key') || '';
      const role = el.getAttribute('data-role') || '';

      const links = Array.from(document.querySelectorAll(`.toc_link[data-role="${role}"]`));
      const match = links.find(link => {
        const file = link.getAttribute('data-file') || '';
        const page = link.getAttribute('data-page') || '';
        const pk = page.toLowerCase();
        return pk.includes(person_key.toLowerCase()) || file.toLowerCase().includes(person_key.toLowerCase());
      });

      if (match) {
        match.click();
      }
    });
  });
}