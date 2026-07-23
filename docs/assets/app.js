

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
const sidebar_team_logo_cache = {
  loaded: false,
  by_team: new Map(),
};

/* ################# */
function sidebar_clean_mlb_logo_team(team) {
  let s = String(team || '').trim();
  if (!s) return '';

  const upper = s.toUpperCase();

  if (upper.startsWith('RETIRED::')) {
    s = s.slice('retired::'.length).trim();
  } else if (upper.startsWith('RETIRED:')) {
    s = s.slice('retired:'.length).trim();
  }

  const team_key = s.toUpperCase();

  const blocked_teams = new Set([
    '',
    'AUS', 'BRA', 'CAN', 'CO', 'CUB', 'CZE', 'DR', 'GB', 'GBR',
    'ISR', 'ITA', 'JPN', 'KOR', 'MEX', 'NED', 'NIC', 'PAN',
    'PR', 'TAI', 'TPE', 'USA', 'VEN',
    'WBC',
    'FA',
    'FREE AGENT',
    'FREE AGENTS',
    'JOURNEYMEN',
    'TOP 100 PROSPECTS',
    'TOP PROSPECTS',
    'MLB',
    'MILB',
    'MINORS',
    'MINOR LEAGUE',
    'MINOR LEAGUES',
    '- - -',
    '---',
    '--',
    'MISC',
  ]);

  if (blocked_teams.has(team_key)) return '';

  return team_key;
}
/* ################# */
async function load_sidebar_team_logos() {
  sidebar_team_logo_cache.by_team.clear();

  document.querySelectorAll('.team_block[data-team]').forEach(team_block => {
    const team = sidebar_clean_mlb_logo_team(team_block.dataset.team);
    if (!team) return;

    const logo = team_block.querySelector('.team_logo');
    const logo_src = String(logo?.getAttribute('src') || `./team_logos/${team}.png`).trim();

    if (logo_src) {
      sidebar_team_logo_cache.by_team.set(team, logo_src);
    }
  });

  sidebar_team_logo_cache.loaded = true;
  return sidebar_team_logo_cache.by_team;
}
/* ################# */
function sidebar_mlb_team_for_link(source_link, excluded_division_names = []) {
  const person_key = String(source_link?.dataset?.person_key || '').trim();
  if (!person_key) return '';

const source_team = sidebar_clean_mlb_logo_team(
  source_link.dataset.team ||
  source_link.closest?.('.team_block')?.dataset?.team ||
  ''
);
  const excluded = new Set((excluded_division_names || []).map(x => String(x || '').trim().toLowerCase()));

  const matches = Array.from(document.querySelectorAll(`.toc_link[data-person_key="${CSS.escape(person_key)}"]`))
    .filter(a => {
      const div = String(a.closest('.division_block')?.dataset?.division || '').trim().toLowerCase();
      return !excluded.has(div);
    });

  const teams = [];

  matches.forEach(a => {
const team = sidebar_clean_mlb_logo_team(
  a.dataset.team ||
  a.closest?.('.team_block')?.dataset?.team ||
  ''
);
    if (!team) return;
    if (team === source_team) return;

    teams.push(team);
  });

  if (!teams.length) return '';

  const counts = new Map();

  teams.forEach(team => {
    counts.set(team, (counts.get(team) || 0) + 1);
  });

  return Array.from(counts.entries())
    .sort((a, b) => {
      const count_cmp = b[1] - a[1];
      if (count_cmp !== 0) return count_cmp;

      return a[0].localeCompare(b[0]);
    })[0][0];
}
/* ################# */
/* ################# */
function sidebar_mlb_team_for_mapped_link(source_link, excluded_division_names = []) {
  return sidebar_mlb_team_for_link(source_link, excluded_division_names);
}
/* ################# */
function add_mapped_sidebar_player_logos(root, division_selector, excluded_division_names = [], logo_class = 'wbc_sidebar_player_logo') {
  const scope = root || document;

  scope.querySelectorAll(`${division_selector} .toc_link[data-person_key]`).forEach(a => {
    if (a.querySelector(`:scope > .${logo_class}`)) return;

    const team = sidebar_mlb_team_for_mapped_link(a, excluded_division_names);
    if (!team) return;

    const logo_src = sidebar_team_logo_cache.by_team.get(team) || team_logo_src_for_code(team);
    if (!logo_src) return;

    const img = document.createElement('img');
    img.className = logo_class;
    img.src = logo_src;
    img.alt = team;
    img.title = team;

    a.insertBefore(img, a.firstChild);
  });
}
/* ################# */
function add_wbc_sidebar_player_logos(root) {
  add_mapped_sidebar_player_logos(
    root,
    '.division_block[data-division="wbc"]',
    ['wbc'],
    'wbc_sidebar_player_logo'
  );
}
/* ################# */
function add_top_prospect_sidebar_player_logos(root) {
  const scope = root || document;

  scope.querySelectorAll('.team_block[data-team="Top 100 Prospects"] .toc_link[data-page]').forEach(a => {
    if (a.querySelector(':scope > .wbc_sidebar_player_logo')) return;

    const page = String(a.dataset.page || '').trim();
    const team = sidebar_clean_mlb_logo_team(page.split('-')[0] || '');
    if (!team) return;

    const logo_src = sidebar_team_logo_cache.by_team.get(team) || team_logo_src_for_code(team);
    if (!logo_src) return;

    const img = document.createElement('img');
    img.className = 'wbc_sidebar_player_logo';
    img.src = logo_src;
    img.alt = team;
    img.title = team;

    a.insertBefore(img, a.firstChild);
  });
}
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
  if (!page_id) return;

  a.addEventListener('click', (e) => {
    e.preventDefault();

    if (page_id === 'trade') {
      window.location.hash = '#trade';
      render_trade_page_from_hash();
      return;
    }

    if (!file) return;

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

    if (fav_icon.dataset.bound !== '1') {
      fav_icon.dataset.bound = '1';
      fav_icon.title = 'Toggle favorite';

      fav_icon.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const key = sidebar_entity_key_from_link(a);
        if (!key) return;

        toggle_favorite_person(key);
        refresh_custom_player_lists_ui();
      });
    }

    if (watch_icon.dataset.bound !== '1') {
      watch_icon.dataset.bound = '1';
      watch_icon.title = 'Toggle watchlist';

      watch_icon.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const key = sidebar_entity_key_from_link(a);
        if (!key) return;

        toggle_watchlist_person(key);
        refresh_custom_player_lists_ui();
      });
    }

    fav_icon.classList.toggle('active', favorites.has(entity_key));
    watch_icon.classList.toggle('active', watchlist.has(entity_key));
  });
}
/* ################# */
async function sort_active_team_sidebar_lists_by_fval() {
  const sort_year = String(window.DEFAULT_SEASON_YEAR || new Date().getFullYear());
  const fval_lookup = await sidebar_fval_lookup_for_year(sort_year);
  const excluded_divisions = new Set([
    'foreign',
    'inactive',
    'retired',
    'top_prospects',
    'top_100_prospects',
    'top prospects',
    'wbc',
  ]);

  const excluded_group_labels = new Set([
    'injured list',
    'il',
    'prospects',
    'top prospects',
    // 'minors',
    // 'minor league',
    // 'minor leagues',
    'foreign',
    'inactive',
    'retired',
    'wbc',
  ]);

  function group_label_is_fval_sortable(label) {
    const s = String(label || '').trim().toLowerCase();
    if (!s) return true;
    if (excluded_group_labels.has(s)) return false;
    if (s.includes('injured')) return false;
    if (s.includes('prospect')) return false;
    // if (s.includes('minor')) return false;
    return true;
  }

  for (const role_list of document.querySelectorAll('.team_block .role_list, .division_block[data-division*="prospect"] .role_list')) {
    const team_block = role_list.closest('.team_block');
    const division_block = role_list.closest('.division_block');

    const team = String(team_block?.dataset?.team || '').trim().toUpperCase();
    const division = String(division_block?.dataset?.division || '').trim().toLowerCase();
    const block_text = String(
      team_block?.dataset?.team ||
      division_block?.dataset?.division ||
      division_block?.querySelector('.division_title')?.textContent ||
      team_block?.querySelector('.team_title')?.textContent ||
      ''
    ).trim().toLowerCase();

    const is_top_prospects_block =
      division.includes('prospect') ||
      block_text.includes('prospect');

    if (!team && !is_top_prospects_block) continue;
    if (excluded_divisions.has(division) && !is_top_prospects_block) continue;

    const ul = role_list.querySelector('.player_list');
    if (!ul) continue;

    const role = fantasy_role_for_sidebar_link(role_list);
    const kids = Array.from(ul.children);

    let group = [];
    let group_label = '';

    async function flush_group() {
      if (!group.length) return;

      if (!is_top_prospects_block && !group_label_is_fval_sortable(group_label)) {
        group.forEach(li => ul.appendChild(li));
        group = [];
        return;
      }

      const rows = await Promise.all(group.map(async li => {
        const a = li.querySelector('.toc_link[data-person_key]');
        const stat_vals = a ? get_sidebar_fval_from_lookup(fval_lookup, a.dataset.person_key, role) : null;

        return {
          li,
          pts: stat_vals?.pts == null ? -Infinity : Number(stat_vals.pts),
          score: stat_vals?.score == null ? -Infinity : Number(stat_vals.score),
          has_pts: stat_vals?.pts != null && Number.isFinite(Number(stat_vals.pts)),
          has_score: stat_vals?.score != null && Number.isFinite(Number(stat_vals.score)),
          pos_sort: get_pos_sort_key(a),
          last_sort: get_sidebar_last_name_sort_key(a),
          full_sort: get_sidebar_full_name_sort_key(a),
          page_sort: String(a?.dataset?.page || ''),
        };
    }));

      rows.sort((x, y) => {
        if (is_top_prospects_block) {
          const x_rank = get_sidebar_prospect_rank_sort_key(x.li);
          const y_rank = get_sidebar_prospect_rank_sort_key(y.li);

          if (x_rank !== y_rank) return x_rank - y_rank;
          } else {
            const x_is_hitter = x.pos_sort !== 999;
            const y_is_hitter = y.pos_sort !== 999;

            if (x_is_hitter && y_is_hitter) {
              const pos_cmp = x.pos_sort - y.pos_sort;
              if (pos_cmp !== 0) return pos_cmp;
            }

            if (x.has_pts && y.has_pts) {
              const pts_cmp = y.pts - x.pts;
              if (pts_cmp !== 0) return pts_cmp;
            }

            if (x.has_pts !== y.has_pts) return x.has_pts ? -1 : 1;

            if (x.has_score && y.has_score) {
              const score_cmp = y.score - x.score;
              if (score_cmp !== 0) return score_cmp;
            }

            if (x.has_score !== y.has_score) return x.has_score ? -1 : 1;
          }

        const last_cmp = x.last_sort.localeCompare(y.last_sort);
        if (last_cmp !== 0) return last_cmp;

        const full_cmp = x.full_sort.localeCompare(y.full_sort);
        if (full_cmp !== 0) return full_cmp;

        return x.page_sort.localeCompare(y.page_sort);
      });

      rows.forEach(row => ul.appendChild(row.li));
      group = [];
    }

    for (const kid of kids) {
      if (kid.classList?.contains('sub_role_label')) {
        await flush_group();
        group_label = kid.textContent || '';
        ul.appendChild(kid);
      } else if (kid.classList?.contains('player_li')) {
        group.push(kid);
      } else {
        await flush_group();
        ul.appendChild(kid);
      }
    }

    await flush_group();
  }
}
/* ################# */
function get_sidebar_prospect_rank_sort_key(li) {
  const text = String(li?.textContent || '').replace(/[★✓]/g, ' ').trim();
  const m = text.match(/\bMLB\s*#\s*(\d+)\b/i) || text.match(/#\s*(\d+)/i);

  if (!m) return 999999;

  const n = Number(m[1]);
  return Number.isFinite(n) ? n : 999999;
}
/* ################# */
function get_pos_sort_key(a) {
  const pos_order = {
    'C': 1,
    '1B': 2,
    '2B': 3,
    '3B': 4,
    'SS': 5,
    'OF': 6,
    'UTIL': 7,
    'DH': 8,
    'P': 9,
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

  const match = tail.match(/\b(C|1B|2B|3B|SS|OF|UTIL|DH|SP|RP|P)(?:\/(C|1B|2B|3B|SS|OF|UTIL|DH|SP|RP|P))?\b/i);
  if (!match) return 999;

  let primary_pos = String(match[1] || '').toUpperCase();

  if (primary_pos === 'SP' || primary_pos === 'RP') primary_pos = 'P';

  return pos_order[primary_pos] || 999;
}
/* ################# */
function get_sidebar_last_name_sort_key(a) {
  const name = String(a?.dataset?.name || a?.textContent || '').trim();
  const parts = name.split(/\s+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1].toLowerCase() : '';
}

function get_sidebar_full_name_sort_key(a) {
  return String(a?.dataset?.name || a?.textContent || '').trim().toLowerCase();
}

function fantasy_role_for_sidebar_link(el) {
  const role = String(el?.dataset?.role || '').trim().toLowerCase();

  if (role === 'lineup' || role === 'batters' || role === 'hitter' || role === 'hitters') return 'hitters';
  if (role === 'rotation' || role === 'starter' || role === 'starters' || role === 'sp') return 'sp';
  if (role === 'bullpen' || role === 'reliever' || role === 'relievers' || role === 'rp') return 'rp';

  return role;
}
/* ################# */
async function render_custom_sidebar_list(list_id, empty_id, people_set) {
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

    function should_sort_by_fval(a) {
    const team_block = a?.closest?.('.team_block');
    const division_block = a?.closest?.('.division_block');

    const team = String(team_block?.dataset?.team || '').trim().toUpperCase();
    const division = String(division_block?.dataset?.division || '').trim().toLowerCase();

    if (!team) return false;

    const excluded_divisions = new Set([
      'foreign',
      'inactive',
      'retired',
      'top_prospects',
      'top_100_prospects',
      'top prospects',
      'wbc',
    ]);

    if (excluded_divisions.has(division)) return false;

    return true;
  }

  function grouped_section_key(a) {
    const role = String(a?.dataset?.role || '').trim().toLowerCase();

    if (role === 'rotation' || role === 'sp' || role === 'starter' || role === 'starters') return 'Rotation';
    if (role === 'bullpen' || role === 'rp' || role === 'reliever' || role === 'relievers') return 'Bullpen';
    if (role === 'lineup' || role === 'batters' || role === 'hitters' || role === 'hitter') return 'Lineup';

    return 'Lineup';
  }

    function team_info_for_sidebar_link(a) {
    const team_block = a?.closest?.('.team_block');
    if (!team_block) return null;

    const team = String(team_block.dataset.team || '').trim().toUpperCase();
    const logo = team_block.querySelector('.team_logo');
    const logo_src = logo ? String(logo.getAttribute('src') || '').trim() : '';

    if (!team || !logo_src) return null;

    return {
      team,
      logo_src,
      logo_alt: String(logo.getAttribute('alt') || team).trim(),
    };
  }

  function add_team_logo_to_custom_clone(clone, source_a) {
    const info = team_info_for_sidebar_link(source_a);
    if (!info) return;

    const a = clone.querySelector('.toc_link[data-person_key]');
    if (!a || a.querySelector(':scope > .custom_player_team_logo')) return;

    a.dataset.team = info.team;

    const img = document.createElement('img');
    img.className = 'custom_player_team_logo';
    img.src = info.logo_src;
    img.alt = info.logo_alt;
    img.title = info.team;

    a.insertBefore(img, a.firstChild);
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

  const label_current_year = String(window.DEFAULT_SEASON_YEAR || '').trim();
  const sort_year = label_current_year || String(new Date().getFullYear());

  for (const section of section_order) {
    const items = grouped.get(section) || [];
    if (!items.length) continue;

    const sort_rows = await Promise.all(items.map(async a => {
      const use_fval = should_sort_by_fval(a);
      // const val = use_fval
      //   ? await val_for_year_person(sort_year, a.dataset.person_key, fantasy_role_for_sidebar_link(a))
      //   : null;
      const lookup = await sidebar_fval_lookup_for_year(sort_year);

      const stat_vals = use_fval
        ? get_sidebar_fval_from_lookup(lookup, a.dataset.person_key, fantasy_role_for_sidebar_link(a))
        : null;

      return {
        a,
        use_fval,
        pts: stat_vals?.pts == null ? -Infinity : Number(stat_vals.pts),
        score: stat_vals?.score == null ? -Infinity : Number(stat_vals.score),
        has_pts: stat_vals?.pts != null && Number.isFinite(Number(stat_vals.pts)),
        has_score: stat_vals?.score != null && Number.isFinite(Number(stat_vals.score)),
        pos_sort: get_pos_sort_key(a),
        last_sort: get_last_name_sort_key(a),
        full_sort: get_full_name_sort_key(a),
        page_sort: String(a.dataset.page || ''),
      };
    }));

    sort_rows.sort((x, y) => {
      const x_is_hitter = x.pos_sort !== 999;
      const y_is_hitter = y.pos_sort !== 999;

      if (x_is_hitter && y_is_hitter) {
        const pos_cmp = x.pos_sort - y.pos_sort;
        if (pos_cmp !== 0) return pos_cmp;
      }

      if (x.use_fval && y.use_fval) {
        if (x.has_pts && y.has_pts) {
          const pts_cmp = y.pts - x.pts;
          if (pts_cmp !== 0) return pts_cmp;
        }

        if (x.has_pts !== y.has_pts) {
          return x.has_pts ? -1 : 1;
        }

        if (x.has_score && y.has_score) {
          const score_cmp = y.score - x.score;
          if (score_cmp !== 0) return score_cmp;
        }

        if (x.has_score !== y.has_score) {
          return x.has_score ? -1 : 1;
        }
      }

      const last_cmp = x.last_sort.localeCompare(y.last_sort);
      if (last_cmp !== 0) return last_cmp;

      const full_cmp = x.full_sort.localeCompare(y.full_sort);
      if (full_cmp !== 0) return full_cmp;

      return x.page_sort.localeCompare(y.page_sort);
    });

    items.splice(0, items.length, ...sort_rows.map(x => x.a));

    const section_nodes = [];

    items.forEach(a => {
      const li = a.closest('.player_li');
      if (!li) return;

      const clone = li.cloneNode(true);
      clone.querySelectorAll('.sidebar_streak_emoji').forEach(el => el.remove());
      add_team_logo_to_custom_clone(clone, a);

      clone.style.display = '';
      clone.querySelectorAll('[style]').forEach(el => {
        if (el.style && el.style.display === 'none') {
          el.style.display = '';
        }
      });

      section_nodes.push(clone);
    });

    if (!section_nodes.length) continue;

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
  }

  if (empty) {
    empty.style.display = appended_player_count ? 'none' : '';
  }

  bind_toc_link_clicks(list);
  update_sidebar_custom_icons(list);
}
/* ################# */
function sync_mapped_sidebar_team_ribbon(division_selector, excluded_division_names = []) {
  const block = document.querySelector(division_selector);
  if (!block) return;

  const title = block.querySelector('.division_title');
  if (!title) return;

  let ribbon = title.querySelector(':scope > .division_logos');
  if (!ribbon) {
    ribbon = document.createElement('span');
    ribbon.className = 'division_logos custom_sidebar_team_ribbon';
    title.appendChild(ribbon);
  }

  ribbon.innerHTML = '';

  const seen = new Set();

  block.querySelectorAll('.toc_link[data-person_key]').forEach(a => {
    const team = sidebar_mlb_team_for_link(a, excluded_division_names);
    if (!team || seen.has(team)) return;

    const logo_src = team_logo_src_for_code(team);
    if (!logo_src) return;

    seen.add(team);

    const img = document.createElement('img');
    img.className = 'division_logo';
    img.src = logo_src;
    img.alt = team;
    img.title = team;

    ribbon.appendChild(img);
  });

  ribbon.style.display = seen.size ? '' : 'none';
}
/* ################# */
function sync_custom_sidebar_team_ribbon(list_id) {
  const list = document.getElementById(list_id);
  if (!list) return;

  const block = list.closest('.division_block');
  const title = block?.querySelector?.('.division_title');
  if (!block || !title) return;

  let ribbon = title.querySelector(':scope > .division_logos');
  if (!ribbon) {
    ribbon = document.createElement('span');
    ribbon.className = 'division_logos custom_sidebar_team_ribbon';
    title.appendChild(ribbon);
  }

  ribbon.innerHTML = '';

  const seen = new Set();

  list.querySelectorAll('.toc_link[data-team]').forEach(a => {
    const team = String(a.dataset.team || '').trim().toUpperCase();
    if (!team || seen.has(team)) return;

    const img_src = a.querySelector(':scope > .custom_player_team_logo')?.getAttribute('src') || '';
    if (!img_src) return;

    seen.add(team);

    const img = document.createElement('img');
    img.className = 'division_logo';
    img.src = img_src;
    img.alt = team;
    img.title = team;
    ribbon.appendChild(img);
  });

  ribbon.style.display = seen.size ? '' : 'none';
}
/* ################# */
async function render_favorites_sidebar() {
  await render_custom_sidebar_list('favorites_list', 'favorites_empty', get_favorites());
  sync_custom_sidebar_team_ribbon('favorites_list');
}
/* ################# */
async function render_watchlist_sidebar() {
  await render_custom_sidebar_list('watchlist_list', 'watchlist_empty', get_watchlist());
  sync_custom_sidebar_team_ribbon('watchlist_list');
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
    const active = get_active_compare_link();
  if (active) return sidebar_entity_key_from_link(active);

  const year_buttons = document.querySelector('#content_root .year_buttons[data-person_key]');
  if (!year_buttons) return '';

  const person_key = String(year_buttons.dataset.person_key || '').trim();
  const page_id = String(active_page_id || '').trim();

  return sidebar_entity_key_from_values(person_key, page_id);
}
/* ################# */
let compare_payload_cache = null;
let compare_sidebar_link_lookup = null;
/* ################# */
async function load_compare_payload() {
  if (compare_payload_cache) return compare_payload_cache;

  try {
    const [current_r, prev_r] = await Promise.all([
      fetch('assets/compare.json', { cache: 'no-store' }),
      fetch('assets/compare_prev.json', { cache: 'no-store' }),
    ]);

    if (!current_r.ok) return null;

    const current_payload = await current_r.json();

    let prev_payload = {
      years: [],
      players: {},
    };

    if (prev_r.ok) {
      prev_payload = await prev_r.json();
    }

    compare_payload_cache = {
      ...current_payload,
      years: Array.from(new Set([
        ...(current_payload.years || []),
        ...(prev_payload.years || []),
      ])),
      players: {
        ...(current_payload.players || {}),
        ...(prev_payload.players || {}),
      },
    };

    return compare_payload_cache;
  } catch (e) {
    return null;
  }
}
/* ################# */
function compare_role_group_for_link(a) {
  const role = String(a?.dataset?.role || '').trim().toLowerCase();

  if (role === 'rotation' || role === 'sp' || role === 'starter' || role === 'starters') return 'rotation';
  if (role === 'bullpen' || role === 'rp' || role === 'reliever' || role === 'relievers') return 'bullpen';
  if (role === 'lineup' || role === 'batters' || role === 'hitters' || role === 'hitter') return 'lineup';

  return '';
}
/* ################# */
function compare_label_for_role_group(role_group) {
  if (role_group === 'rotation') return 'starter';
  if (role_group === 'bullpen') return 'reliever';
  return 'hitter';
}
/* ################# */
function fantasy_section_for_compare_role_group(role_group) {
  if (role_group === 'lineup') return 'hitters';
  if (role_group === 'rotation') return 'sp';
  if (role_group === 'bullpen') return 'rp';
  return '';
}
/* ################# */
function get_clean_compare_link_text(a) {
  if (!a) return '';

  const clone = a.cloneNode(true);

  clone.querySelectorAll('.fav_icon, .watch_icon, .custom_player_team_logo').forEach(el => el.remove());

  return String(clone.textContent || '')
    .replace(/[★✓]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
/* ################# */
function get_compare_link_team(a, fantasy_row = null) {
  const sidebar_team = String(a?.closest?.('.team_block')?.dataset?.team || '').trim().toUpperCase();
  if (sidebar_team) return sidebar_team;

  const fantasy_team = String(fantasy_row?.team || '').trim().toUpperCase();
  if (fantasy_team && fantasy_team !== 'MILB') return fantasy_team;

  return 'Other';
}
/* ################# */
function compare_fantasy_rows_for_role(data, role_group) {
  const section = fantasy_section_for_compare_role_group(role_group);
  if (!data || !section) return [];

  const rows = [];
  const allowed_scopes = ['majors', 'minors'];

  allowed_scopes.forEach(scope_name => {
    const scope_val = data[scope_name];
    if (!scope_val || typeof scope_val !== 'object') return;

    if (Array.isArray(scope_val[section])) {
      scope_val[section].forEach(row => rows.push(row));
    }

    if (scope_name === 'minors' && (section === 'sp' || section === 'rp')) {
      ['pitchers', section === 'sp' ? 'rp' : 'sp'].forEach(fallback_section => {
        if (!Array.isArray(scope_val[fallback_section])) return;
        scope_val[fallback_section].forEach(row => rows.push(row));
      });
    }
  });

  return rows;
}
/* ################# */
function build_compare_sidebar_link_lookup(role_group) {
  const out = new Map();

  Array.from(document.querySelectorAll('.toc_link[data-person_key][data-page][data-file]'))
    .filter(a => !a.closest('.favorites_block') && !a.closest('.watchlist_block'))
    .filter(a => compare_role_group_for_link(a) === role_group)
    .forEach(a => {
      const norm_key = normalize_matchup_person_key(a.dataset.person_key || a.dataset.name || get_clean_compare_link_text(a));
      if (!norm_key || out.has(norm_key)) return;
      out.set(norm_key, a);
    });

  return out;
}
/* ################# */
function compare_player_stat_value(player, stat_key) {
  const key = String(stat_key || '').trim();

  for (const table of player?.stats_tables || []) {
    for (const cell of table?.cells || []) {
      if (String(cell?.key || '').trim() !== key) continue;

      const value = Number(cell?.value);
      if (Number.isFinite(value)) return value;
    }
  }

  for (const panel of player?.panels || []) {
    for (const row of panel?.rows || []) {
      if (String(row?.key || '').trim() !== key) continue;

      const value = Number(row?.value);
      if (Number.isFinite(value)) return value;
    }
  }

  return -Infinity;
}
/* ################# */
function compare_num_or_neg_inf(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : -Infinity;
}
/* ################# */
function get_real_sidebar_link_for_page(page_id) {
  const page = String(page_id || '').trim();
  if (!page) return null;

  if (!compare_sidebar_link_lookup) {
    compare_sidebar_link_lookup = build_compare_sidebar_link_lookup();
  }

  return compare_sidebar_link_lookup.get(page) || null;
}
/* ################# */
function get_active_compare_link() {
  const active_page = String(active_page_id || document.querySelector('.toc_link.active[data-page]')?.dataset?.page || '').trim();
  const real = get_real_sidebar_link_for_page(active_page);
  if (real) return real;

  return document.querySelector('.toc_link.active[data-person_key][data-page]');
}
/* ################# */
function compare_lookup_player_from_payload(compare_players, compare_id) {
  const id = String(compare_id || '').trim();
  if (!id) return null;

  if (compare_players[id]) return compare_players[id];

  const base_id = id.split('~')[0];
  const season_suffix = id.includes('~') ? `~${id.split('~').slice(1).join('~')}` : '';

  const parts = base_id.split('-');
  if (parts.length < 3) return null;

  const suffix = parts.slice(1).join('-');

  const matches = Object.entries(compare_players)
    .filter(([key]) => {
      const key_base = key.split('~')[0];
      const key_season_suffix = key.includes('~') ? `~${key.split('~').slice(1).join('~')}` : '';

      return key_base.endsWith(`-${suffix}`) &&
        key_season_suffix === season_suffix;
    });

  if (matches.length === 1) return matches[0][1];

  return null;
}
/* ################# */
function compare_link_is_minors(a, fantasy_row = null, compare_player = null) {
  const team = String(
    fantasy_row?.team ||
    compare_player?.team ||
    ''
  ).trim().toUpperCase();

  const link_text = get_clean_compare_link_text(a).toLowerCase();
  const division = String(
    a?.closest?.('.division_block')?.dataset?.division || ''
  ).trim().toLowerCase();

  return team === 'MILB' ||
    String(a?.dataset?.is_minors || '') === '1' ||
    link_text.includes(' minors') ||
    division.includes('prospect') ||
    compare_player?.has_major_sample === false;
}
/* ################# */
function compare_panel_title_matches(title, label) {
  const t = String(title || '').trim().toLowerCase();
  const l = String(label || '').trim().toLowerCase();

  return t === l || t.startsWith(`${l} `) || t.startsWith(`${l} (`);
}
/* ################# */
function compare_player_has_required_panels(player, is_minors) {
  if (!player) return false;

  if (player.compare_eligible === false) return false;

  const panels = Array.isArray(player?.panels) ? player.panels : [];
  const stats_tables = Array.isArray(player?.stats_tables) ? player.stats_tables : [];

  const has_overall = panels.some(panel => compare_panel_title_matches(panel?.title, 'Overall'));
  const has_minors = panels.some(panel => compare_panel_title_matches(panel?.title, 'Minors'));

  return has_overall || has_minors || stats_tables.length > 0;
}
/* ################# */
async function active_compare_page_is_eligible(active, role_group) {
  if (!active || !role_group) return false;

  const page = String(active.dataset.page || '').trim();
  if (!page) return false;

  const payload = await load_compare_payload();
  const players_lookup = payload?.players || {};
  const player = compare_lookup_player_from_payload(players_lookup, page);
  if (!player) return false;

  const player_role_group = String(player.role_group || '').trim().toLowerCase();
  if (player_role_group && player_role_group !== role_group) return false;

  return compare_player_has_required_panels(player, compare_link_is_minors(active, null, player));
}
/* ################# */
function get_compare_historical_entries_for_page(compare_players, active_page, role_group) {
  const page = String(active_page || '').trim();
  if (!page) return [];

  const active_parts = page.split('-');
  const active_suffix = active_parts.length >= 3
    ? active_parts.slice(1).join('-')
    : page;

  return Object.entries(compare_players || {})
    .filter(([compare_id, player]) => {
      if (!compare_id.includes('~')) return false;

      const player_role = String(player?.role_group || '').trim().toLowerCase();
      if (player_role !== role_group) return false;

      const payload_page = String(player?.page_id || '').trim();
      const payload_parts = payload_page.split('-');
      const payload_suffix = payload_parts.length >= 3
        ? payload_parts.slice(1).join('-')
        : payload_page;

      return payload_suffix === active_suffix;
    })
    .map(([compare_id, player]) => ({
      a: null,
      row: null,
      page: compare_id,
      navigation_page: String(player?.page_id || '').trim(),
      team: String(player?.team || 'Other').trim(),
      name: String(player?.name || '').trim(),
      pts: -Infinity,
      score: -Infinity,
      season: Number(player?.season),
      eligible: player?.compare_eligible !== false,
      missing_compare_data: player?.compare_eligible === false,
      is_historical: true,
    }))
    .sort((a, b) => b.season - a.season);
}
/* ################# */
async function get_compare_peer_links_for_active_page({ include_ineligible = false } = {}) {
  const active = get_active_compare_link();
  if (!active) return [];

  const role_group = compare_role_group_for_link(active);
  if (!role_group) return [];

  const active_page = String(active.dataset.page || '').trim();

  const compare_payload = await load_compare_payload();
  const compare_players = compare_payload?.players || {};

  const out = get_compare_historical_entries_for_page(
    compare_players,
    active_page,
    role_group
  );

  const seen_pages = new Set(out.map(x => x.page));

  Object.entries(compare_players).forEach(([compare_id, player]) => {
    const page = String(compare_id || '').trim();

    if (!page || page.includes('~')) return;
    if (page === active_page || seen_pages.has(page)) return;

    const player_role_group = String(
      player?.role_group || ''
    ).trim().toLowerCase();

    if (player_role_group !== role_group) return;

    const a = get_real_sidebar_link_for_page(page);

    const eligible = compare_player_has_required_panels(
      player,
      compare_link_is_minors(a, null, player)
    );

    if (!include_ineligible && !eligible) return;

    const team = String(
      player?.team ||
      a?.dataset?.team ||
      a?.closest?.('.team_block')?.dataset?.team ||
      'Other'
    ).trim();

    const name = String(
      player?.name ||
      get_clean_compare_link_text(a) ||
      page
    ).trim();

    seen_pages.add(page);

    out.push({
      a,
      row: null,
      page,
      navigation_page: String(player?.page_id || page).trim(),
      team,
      name,
      pts: compare_player_stat_value(player, 'Pts'),
      score: compare_player_stat_value(player, 'Score'),
      season: Number(player?.season),
      eligible,
      missing_compare_data: !eligible,
      is_historical: false,
    });
  });

  out.sort((x, y) => {
    if (x.is_historical && y.is_historical) {
      return Number(y.season || 0) - Number(x.season || 0);
    }

    if (x.is_historical !== y.is_historical) {
      return x.is_historical ? -1 : 1;
    }

    const team_cmp = x.team.localeCompare(y.team);
    if (team_cmp !== 0) return team_cmp;

    const x_has_pts = x.pts !== -Infinity;
    const y_has_pts = y.pts !== -Infinity;

    if (x_has_pts && y_has_pts) {
      const pts_cmp = y.pts - x.pts;
      if (pts_cmp !== 0) return pts_cmp;
    }

    if (x_has_pts !== y_has_pts) {
      return x_has_pts ? -1 : 1;
    }

    const x_has_score = x.score !== -Infinity;
    const y_has_score = y.score !== -Infinity;

    if (x_has_score && y_has_score) {
      const score_cmp = y.score - x.score;
      if (score_cmp !== 0) return score_cmp;
    }

    if (x_has_score !== y_has_score) {
      return x_has_score ? -1 : 1;
    }

    return x.name.toLowerCase().localeCompare(
      y.name.toLowerCase()
    );
  });

  return out;
}
/* ################# */
function compare_hash_for_pages(page_ids) {
  const clean_pages = page_ids
    .map(x => String(x || '').trim())
    .filter(Boolean);

  return '#compare?players=' + clean_pages.map(encodeURIComponent).join(';');
}
/* ################# */
function parse_compare_hash_players() {
  const raw = String(window.location.hash || '');
  const q = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : '';
  const params = new URLSearchParams(q);
  const players_raw = String(params.get('players') || '').trim();

  return players_raw
    .split(';')
    .map(x => {
      try {
        return decodeURIComponent(x);
      } catch (e) {
        return x;
      }
    })
    .map(x => String(x || '').trim())
    .filter(Boolean);
}
/* ################# */
function escape_attr(s) {
  return escape_html(s).replaceAll('`', '&#96;');
}
/* ################# */
function compare_num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
/* ################# */
function compare_clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
/* ################# */
function compare_scale_frac(value, spec) {
  const v = compare_num(value);
  if (v == null || !spec) return null;

  const higher_is_better = spec.higher_is_better !== false;

  if (spec.mode === 'good_only' || spec.mode === 'bad_only') {
    const start = compare_num(spec.start);
    const end = compare_num(spec.end);
    if (start == null || end == null || start === end) return null;

    let frac = (v - start) / (end - start);
    if (spec.mode === 'bad_only' || !higher_is_better) {
      frac = 1 - frac;
    }

    return compare_clamp01(frac);
  }

  const worst = compare_num(spec.worst);
  const neutral_lo = compare_num(spec.neutral_lo);
  const neutral_hi = compare_num(spec.neutral_hi);
  const best = compare_num(spec.best);

  if (worst == null || best == null || worst === best) return null;

  if (neutral_lo != null && neutral_hi != null) {
    if (higher_is_better) {
      if (v <= neutral_lo) {
        return 0.5 * compare_clamp01((v - worst) / (neutral_lo - worst));
      }

      if (v <= neutral_hi) {
        return 0.5;
      }

      return 0.5 + (0.5 * compare_clamp01((v - neutral_hi) / (best - neutral_hi)));
    }

    if (v >= neutral_lo) {
      return 0.5 * compare_clamp01((worst - v) / (worst - neutral_lo));
    }

    if (v >= neutral_hi) {
      return 0.5;
    }

    return 0.5 + (0.5 * compare_clamp01((neutral_hi - v) / (neutral_hi - best)));
  }

  let frac = (v - worst) / (best - worst);
  if (!higher_is_better) frac = 1 - frac;

  return compare_clamp01(frac);
}
/* ################# */
function compare_is_gold(value, spec) {
  const v = compare_num(value);
  const gold = compare_num(spec?.gold);
  if (v == null || gold == null) return false;

  if (spec?.higher_is_better === false || spec?.mode === 'bad_only') {
    return v <= gold;
  }

  return v >= gold;
}
/* ################# */
function compare_color_class(value, spec) {
  const frac = compare_scale_frac(value, spec);
  if (frac == null) return '';

  if (compare_is_gold(value, spec)) return 'compare_gold';

  if (frac >= 0.52) return 'compare_red';
  if (frac <= 0.48) return 'compare_blue';

  return '';
}
/* ################# */
function compare_format_value(value, fmt) {
  const f = String(fmt || '').trim().toLowerCase();

  if (value == null || value === '') return '';

  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);

  if (f === 'text') return String(value);
  if (f === 'int') return String(Math.round(n));
  if (f === 'ip1') return n.toFixed(1);
  if (f === 'avg') return n.toFixed(3).replace(/^0/, '');
  if (f === 'pct') return `${(n * 100).toFixed(2)}%`;
  if (f === 'num') return n.toFixed(2);

  return String(value);
}
/* ################# */
function compare_display_value(obj) {
  const display = obj?.display;
  if (display != null && String(display).trim() !== '') return String(display);

  return compare_format_value(obj?.value, obj?.fmt || obj?.scale?.fmt);
}
/* ################# */
function compare_team_cell_html(team) {
  const t = String(team || '').trim().toUpperCase();
  if (!t) return '';

  const logo = Array.from(document.querySelectorAll('.team_block[data-team]'))
    .find(tb => String(tb.dataset.team || '').trim().toUpperCase() === t)
    ?.querySelector('.team_logo');

  const src = logo ? String(logo.getAttribute('src') || '').trim() : '';

  if (!src) return escape_html(team);

  return `
    <span class='compare_team_cell' title='${escape_attr(t)}'>
      <img class='compare_team_logo' src='${escape_attr(src)}' alt='${escape_attr(t)}'>
    </span>
  `;
}
/* ################# */
function compare_parse_rgba(fill) {
  const s = String(fill || '').trim();

  if (!s || s === 'none' || s === 'transparent') return null;

  let m = s.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i);
  if (m) {
    return {
      r: Number(m[1]),
      g: Number(m[2]),
      b: Number(m[3]),
      a: m[4] == null ? 1 : Number(m[4]),
    };
  }

  m = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (m) {
    let hex = m[1];

    if (hex.length === 3) {
      hex = hex.split('').map(x => x + x).join('');
    }

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
function compare_blend_on_light_base(c) {
  if (!c) return null;

  const a = Number.isFinite(c.a) ? Math.max(0, Math.min(1, c.a)) : 1;
  const base = { r: 235, g: 240, b: 248 };

  return {
    r: c.r * a + base.r * (1 - a),
    g: c.g * a + base.g * (1 - a),
    b: c.b * a + base.b * (1 - a),
  };
}
/* ################# */
function compare_fill_should_use_white_text(fill) {
  const c = compare_blend_on_light_base(compare_parse_rgba(fill));
  if (!c) return false;

  const is_blue = c.b - c.r >= 25 && c.b - c.g >= 15;
  const is_red = c.r - c.g >= 25 && c.r - c.b >= 15;

  if (!is_blue && !is_red) return false;

  const lum = (0.2126 * c.r) + (0.7152 * c.g) + (0.0722 * c.b);
  return lum < 150;
}
/* ################# */
function compare_rgba_string(c) {
  if (!c) return '';
  const a = c.a == null ? 1 : c.a;
  return `rgba(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)},${a})`;
}
/* ################# */
function compare_is_light_table_base(fill) {
  const c = compare_parse_rgba(fill);
  if (!c || c.a === 0) return false;

  return (
    Math.abs(c.r - 235) <= 16 &&
    Math.abs(c.g - 240) <= 16 &&
    Math.abs(c.b - 248) <= 16
  );
}
/* ################# */
function compare_is_stat_fill(fill) {
  const c = compare_parse_rgba(fill);
  if (!c || c.a === 0) return false;

  const blue_like = (c.b - c.r >= 30) && (c.b - c.g >= 18);
  const red_like = (c.r - c.g >= 30) && (c.r - c.b >= 18);
  const gold_like = (
    c.r >= 180 &&
    c.g >= 125 &&
    c.b <= 95 &&
    (c.r - c.b >= 65) &&
    (c.g - c.b >= 30)
  );

  return blue_like || red_like || gold_like;
}
/* ################# */
function compare_darken_stat_fill_for_dark_mode(fill) {
  const c = compare_parse_rgba(fill);
  if (!c || c.a === 0) return fill;

  if (!compare_is_stat_fill(fill)) return fill;

  const gold_like = (
    c.r >= 180 &&
    c.g >= 125 &&
    c.b <= 95 &&
    (c.r - c.b >= 65) &&
    (c.g - c.b >= 30)
  );

  if (gold_like) return fill;

  const lum = (0.2126 * c.r) + (0.7152 * c.g) + (0.0722 * c.b);
  if (lum < 150) return fill;

  const strength = Math.min(0.35, Math.max(0.12, (lum - 150) / 220));

  return compare_rgba_string({
    r: c.r * (1 - strength),
    g: c.g * (1 - strength),
    b: c.b * (1 - strength),
    a: c.a,
  });
}
/* ################# */
function compare_fill_is_plain_light_cell(fill) {
  const c = compare_parse_rgba(fill);
  if (!c || c.a === 0) return false;

  const is_light_body =
    Math.abs(c.r - 235) <= 18 &&
    Math.abs(c.g - 240) <= 18 &&
    Math.abs(c.b - 248) <= 18;

  const is_light_alt =
    Math.abs(c.r - 226) <= 22 &&
    Math.abs(c.g - 233) <= 22 &&
    Math.abs(c.b - 243) <= 22;

  return is_light_body || is_light_alt;
}
/* ################# */
function compare_blend_compare_stat_fill_on_light_base(fill) {
  if (!fill) return '';

  const c = compare_parse_rgba(fill);
  if (!c) return fill;

  const a = Number.isFinite(c.a) ? Math.max(0, Math.min(1, c.a)) : 1;
  const base = { r: 235, g: 240, b: 248 };

  return compare_rgba_string({
    r: c.r * a + base.r * (1 - a),
    g: c.g * a + base.g * (1 - a),
    b: c.b * a + base.b * (1 - a),
    a: 1,
  });
}
/* ################# */
function compare_display_fill(fill, is_dark) {
  if (!fill) return '';

  if (compare_fill_is_plain_light_cell(fill)) {
    return is_dark ? '#3b424b' : fill;
  }

  if (compare_is_stat_fill(fill)) {
    const blended = compare_blend_compare_stat_fill_on_light_base(fill);
    return is_dark ? compare_darken_stat_fill_for_dark_mode(blended) : blended;
  }

  return fill;
}
/* ################# */
function compare_blend_on_base(c, is_dark) {
  if (!c) return null;

  const a = Number.isFinite(c.a) ? Math.max(0, Math.min(1, c.a)) : 1;
  const base = is_dark
    ? { r: 59, g: 66, b: 75 }
    : { r: 235, g: 240, b: 248 };

  return {
    r: c.r * a + base.r * (1 - a),
    g: c.g * a + base.g * (1 - a),
    b: c.b * a + base.b * (1 - a),
  };
}
/* ################# */
function compare_cell_text_color(fill, is_gold, is_dark) {
  if (is_gold) return '#000';

  if (!fill) {
    return is_dark ? 'var(--text)' : '#000';
  }

  const c = compare_blend_on_base(compare_parse_rgba(fill), is_dark);
  if (!c) {
    return is_dark ? 'var(--text)' : '#000';
  }

  const is_blue = c.b - c.r >= 25 && c.b - c.g >= 15;
  const is_red = c.r - c.g >= 25 && c.r - c.b >= 15;
  const is_goldish = c.r >= 175 && c.g >= 125 && c.b <= 105;

  if (is_goldish) return '#000';
  if (is_blue || is_red) return '#fff';

  return is_dark ? 'var(--text)' : '#000';
}
/* ################# */
function compare_cell_html(cell, scales) {
  const display = compare_display_value(cell);
  const fill = String(cell?.fill_color || '').trim();
  const is_gold = cell?.is_gold === true;
  const is_dark = document.body.classList.contains('soft_theme');

  const cls = is_gold ? 'compare_gold' : '';
  const style_parts = [];

  const display_fill = compare_display_fill(fill, is_dark);
  const fallback_fill = is_dark ? '#3b424b' : '#ebf0f8';
  const final_fill = display_fill || fallback_fill;

  if (!is_gold && final_fill) {
    style_parts.push(`background:${escape_attr(final_fill)}`);
  }

    const text_fill = compare_cell_text_color(final_fill, is_gold, is_dark);
  if (text_fill) {
    style_parts.push(`color:${text_fill}`);
  }

  const style = style_parts.length ? ` style="${style_parts.join(';')};"` : '';

  let content = escape_html(display);

  if (String(cell?.key || '').trim() === 'Team' && display) {
    content = compare_team_cell_html(display);
  }

  return `<td class='compare_stat_cell ${cls}' data-fill-color='${escape_attr(fill)}' data-is-gold='${is_gold ? '1' : '0'}'${style}>${content}</td>`;
}
/* ################# */
function refresh_compare_table_cell_theme(root) {
  const scope = root || document;
  const is_dark = document.body.classList.contains('soft_theme');

  scope.querySelectorAll('.compare_stat_cell').forEach(td => {
    const fill = String(td.dataset.fillColor || '').trim();
    const is_gold = td.dataset.isGold === '1';

    td.classList.toggle('compare_gold', is_gold);

    if (is_gold) {
      td.style.background = '';
      td.style.color = '#000';
      return;
    }

    const display_fill = compare_display_fill(fill, is_dark);
    const fallback_fill = is_dark ? '#3b424b' : '#ebf0f8';
    const final_fill = display_fill || fallback_fill;

    td.style.background = final_fill;

    const text_fill = compare_cell_text_color(final_fill, is_gold, is_dark);

    if (text_fill) {
      td.style.color = text_fill;
    } else {
      td.style.removeProperty('color');
    }
  });
}
/* ################# */
function compare_table_html(tbl, scales) {
  const headers = Array.isArray(tbl?.headers) ? tbl.headers : [];
  const cells = Array.isArray(tbl?.cells) ? tbl.cells : [];

  return `
    <table class='compare_stats_table'>
      <thead>
        <tr>${headers.map(h => `<th>${escape_html(h)}</th>`).join('')}</tr>
      </thead>
      <tbody>
        <tr>${cells.map(c => compare_cell_html(c, scales)).join('')}</tr>
      </tbody>
    </table>
  `;
}
/* ################# */
function compare_should_show_pct_marker(row) {
  return row?.show_pct_marker !== false;
}
/* ################# */
function compare_pct_marker_text(frac, is_gold = false) {
  const n = Number(frac);
  if (!Number.isFinite(n)) return '';

  const pct = Math.max(0, Math.min(100, Math.round(n * 100)));

  if (pct === 100 && !is_gold) return '99';

  return String(pct);
}
/* ################# */
function compare_pct_marker_left(frac) {
  const n = Number(frac);
  if (!Number.isFinite(n)) return '9px';

  const pct = Math.max(0, Math.min(100, n * 100));

  return `clamp(9.5px, ${pct}%, calc(100% - 9.5px))`;
}
/* ################# */
function compare_pct_marker_text_color(fill, is_gold) {
  return '#fff';
}
/* ################# */
function compare_bar_html(row, scales) {
  const row_frac = Number(row?.frac);
  const spec = row?.scale || scales?.[row?.scale_key] || row || null;
  const calc_frac = compare_scale_frac(row?.value, spec);
  const frac = Number.isFinite(row_frac) ? row_frac : calc_frac;

  const width = frac == null ? 0 : Math.round(frac * 1000) / 10;
  const display = compare_display_value(row);
  const fill = String(row?.fill_color || '').trim();
  const is_gold = row?.is_gold === true;
  const is_dark = document.body.classList.contains('soft_theme');
  const marker_fill = is_gold
    ? ''
    : compare_display_fill(fill, is_dark);

  const cls = is_gold ? ' compare_gold' : '';
  const style = (!is_gold && fill) ? `background:${escape_attr(fill)};` : '';

  const show_marker = frac != null && compare_should_show_pct_marker(row);
  const marker_text = show_marker ? compare_pct_marker_text(frac, is_gold) : '';
  const marker_left = show_marker ? compare_pct_marker_left(frac) : 0;
  const marker_text_color = compare_pct_marker_text_color(fill, is_gold);
  const marker_edge_class = '';

  const marker_style = [
    `left:${marker_left}`,
    `color:${marker_text_color}`,
    (!is_gold && marker_fill) ? `background:${escape_attr(marker_fill)}` : '',
  ].filter(Boolean).join(';');

  const marker_html = show_marker
    ? `<div class='compare_bar_pct_marker${cls}${marker_edge_class}' style='${marker_style};'>${escape_html(marker_text)}</div>`
    : '';
  return `
    <div class='compare_panel_row'>
      <div class='compare_panel_label'>${escape_html(row?.label || '')}</div>
      <div class='compare_bar_track'>
        <div class='compare_bar_fill${cls}' style='width:${width}%;${style}'></div>
        ${marker_html}
      </div>
      <div class='compare_panel_value'>${escape_html(display)}</div>
    </div>
  `;
}
/* ################# */
const compare_hidden_panels_storage_key = 'mlb_dash_compare_hidden_panels';
/* ################# */
function get_compare_hidden_panels() {
  try {
    const raw = sessionStorage.getItem(compare_hidden_panels_storage_key);
    const values = raw ? JSON.parse(raw) : [];

    return new Set(
      Array.isArray(values)
        ? values.map(x => String(x || '').trim()).filter(Boolean)
        : []
    );
  } catch (e) {
    return new Set();
  }
}
/* ################# */
function save_compare_hidden_panels(hidden_panels) {
  try {
    sessionStorage.setItem(
      compare_hidden_panels_storage_key,
      JSON.stringify(Array.from(hidden_panels))
    );
  } catch (e) {}
}
/* ################# */
function compare_panel_hide_group_for_title(title) {
  const t = String(title || '').trim().toLowerCase();

  if (t === 'fielding' || t.startsWith('fielding ')) {
    return 'fielding';
  }

  if (t === 'misc scores' || t.startsWith('misc scores ')) {
    return 'misc_scores';
  }

  if (t === 'fantasy' || t.startsWith('fantasy ')) {
    return 'fantasy';
  }

  if (
    t === 'rhp' ||
    t.startsWith('rhp ') ||
    t.startsWith('rhp (') ||
    t === 'lhp' ||
    t.startsWith('lhp ') ||
    t.startsWith('lhp (')
  ) {
    return 'rhp_lhp';
  }

  if (
    t === 'rhb' ||
    t.startsWith('rhb ') ||
    t.startsWith('rhb (') ||
    t === 'lhb' ||
    t.startsWith('lhb ') ||
    t.startsWith('lhb (')
  ) {
    return 'rhb_lhb';
  }

  return '';
}
/* ################# */
function compare_panel_filter_controls_html() {
  const hidden_panels = get_compare_hidden_panels();

  const options = [
    ['fielding', 'Fielding'],
    ['misc_scores', 'Misc Scores'],
    ['fantasy', 'Fantasy'],
    ['rhp_lhp', 'RHP / LHP'],
    ['rhb_lhb', 'RHB / LHB'],
  ];

  return `
    <div class='inline_filter_controls compare_panel_filter_controls'>
      <div class='inline_filter_label compare_panel_filter_label'>Hide</div>

      ${options.map(([value, label]) => {
        return `
          <label class='inline_filter_option compare_panel_filter_option'>
            <input
              type='checkbox'
              class='compare_panel_filter_checkbox'
              value='${escape_attr(value)}'
              ${hidden_panels.has(value) ? 'checked' : ''}
            >
            <span>${escape_html(label)}</span>
          </label>
        `;
      }).join('')}
    </div>
  `;
}
/* ################# */
function apply_compare_panel_filters(root) {
  const scope = root || document;
  const hidden_panels = get_compare_hidden_panels();

  scope.querySelectorAll('.compare_panel[data-panel-hide-group]').forEach(panel => {
    const group = String(panel.dataset.panelHideGroup || '').trim();

    panel.style.display = group && hidden_panels.has(group)
      ? 'none'
      : '';
  });
}
/* ################# */
function bind_compare_panel_filter_controls(root) {
  const scope = root || document;

  scope.querySelectorAll('.compare_panel_filter_checkbox').forEach(checkbox => {
    if (checkbox.dataset.bound === '1') return;
    checkbox.dataset.bound = '1';

    checkbox.addEventListener('change', () => {
      const hidden_panels = get_compare_hidden_panels();
      const group = String(checkbox.value || '').trim();

      if (!group) return;

      if (checkbox.checked) {
        hidden_panels.add(group);
      } else {
        hidden_panels.delete(group);
      }

      save_compare_hidden_panels(hidden_panels);
      apply_compare_panel_filters(scope);
    });
  });

  apply_compare_panel_filters(scope);
}
/* ################# */
function compare_panel_html(panel, scales) {
  const rows = Array.isArray(panel?.rows) ? panel.rows : [];
  if (!rows.length) return '';

  const title = String(panel?.title || '').trim();
  const hide_group = compare_panel_hide_group_for_title(title);

  return `
    <div
      class='compare_panel'
      data-panel-hide-group='${escape_attr(hide_group)}'
    >
      <div class='compare_panel_title'>${escape_html(title)}</div>
      <div class='compare_panel_axis'>
        <span>POOR</span>
        <span>AVERAGE</span>
        <span>GREAT</span>
      </div>
      ${rows.map(row => compare_bar_html(row, scales)).join('')}
    </div>
  `;
}
/* ################# */
function compare_player_card_html(player, scales) {
  const stats_tables = Array.isArray(player?.stats_tables) ? player.stats_tables : [];
  const panels = Array.isArray(player?.panels) ? player.panels : [];
  const photo_src = String(player?.photo_src || '').trim();
  const page_id = String(player?.page_id || '').trim();
  const compare_id = String(
    player?.compare_id ||
    player?.page_id ||
    ''
  ).trim();

const role_group = String(
  player?.role_group || ''
).trim();

const person_key = String(
  player?.person_key || ''
).trim();

const own_pct_year = String(
  player?.season ||
  window.DEFAULT_SEASON_YEAR ||
  new Date().getFullYear()
).trim();

  const name_html = page_id
    ? `
      <a
        href='#${encodeURIComponent(page_id)}'
        class='compare_player_name_link'
        data-page='${escape_attr(page_id)}'
        data-compare-id='${escape_attr(compare_id)}'
      >${escape_html(player?.name || '')}</a>
    `
    : escape_html(player?.name || '');

  return `
    <div class='compare_player_card'>
      <div class='compare_player_name'>
  ${name_html}
  <span
    class='compare_player_own_pct'
    data-page='${escape_attr(page_id)}'
    data-compare-id='${escape_attr(compare_id)}'
    data-person-key='${escape_attr(person_key)}'
    data-role-group='${escape_attr(role_group)}'
    data-year='${escape_attr(own_pct_year)}'
  ></span>
</div>
      ${photo_src ? `<img class='compare_player_photo' src='${escape_attr(photo_src)}' alt='${escape_attr(player?.name || '')}'>` : ''}
      <div class='compare_stats_block'>
        ${stats_tables.map(tbl => compare_table_html(tbl, scales)).join('')}
      </div>
      <div class='compare_panels_block'>
        ${panels.map(panel => compare_panel_html(panel, scales)).join('')}
      </div>
    </div>
  `;
}
/* ################# */
function trade_hash_for_state(state) {
  const side_count = Math.min(3, Math.max(2, Number(state?.side_count || 2)));
  const raw_counts = Array.isArray(state?.player_counts) ? state.player_counts : [];

  const player_counts = Array.from({ length: side_count }, (_, i) => {
    const n = Number(raw_counts[i] || 1);
    return Math.min(5, Math.max(1, Number.isFinite(n) ? n : 1));
  });

  const sides = Array.from({ length: side_count }, (_, i) => {
    return (state?.sides?.[i] || [])
      .map(x => String(x || '').trim())
      .filter(Boolean)
      .slice(0, player_counts[i])
      .join(',');
  }).join(';');

  const params = new URLSearchParams();
  params.set('side_count', String(side_count));
  params.set('counts', player_counts.join(','));
  params.set('sides', sides);

  return '#trade?' + params.toString();
}
/* ################# */
function parse_trade_hash_state() {
  const raw = String(window.location.hash || '');
  const q = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : '';
  const params = new URLSearchParams(q);

  const sides_raw = String(params.get('sides') || '').trim();
  const parsed_sides = sides_raw
    ? sides_raw
      .split(';')
      .map(side => side.split(',').map(x => String(x || '').trim()).filter(Boolean))
    : [];

  const raw_side_count = Number(params.get('side_count') || parsed_sides.length || 2);
  const side_count = Math.min(3, Math.max(2, Number.isFinite(raw_side_count) ? raw_side_count : 2));

  const count_parts = String(params.get('counts') || '')
    .split(',')
    .map(x => Number(x));

  const player_counts = Array.from({ length: side_count }, (_, i) => {
    const n = count_parts[i];
    return Math.min(5, Math.max(1, Number.isFinite(n) ? n : 1));
  });

  const sides = Array.from({ length: side_count }, (_, i) => {
    return (parsed_sides[i] || []).slice(0, player_counts[i]);
  });

  return {
    side_count,
    player_counts,
    sides,
  };
}
/* ################# */
function trade_role_label(role_group) {
  if (role_group === 'rotation') return 'Starters';
  if (role_group === 'bullpen') return 'Relievers';
  if (role_group === 'lineup') return 'Hitters';
  return 'Players';
}
/* ################# */
function trade_player_type_from_payload_player(player) {
  const role_group = String(player?.role_group || '').trim().toLowerCase();

  if (role_group === 'rotation') return 'rotation';
  if (role_group === 'bullpen') return 'bullpen';
  if (role_group === 'lineup') return 'lineup';

  return '';
}
/* ################# */
function x_team_sort(team) {
  const t = String(team || '').trim().toUpperCase();
  if (t === 'MILB') return 'ZZZ_MILB';
  if (t === 'OTHER') return 'ZZZ_OTHER';
  return t;
}
/* ################# */
function trade_team_for_candidate(page, player) {
  const team = String(player?.team || '').trim().toUpperCase();
  if (team && team !== 'MILB') return team;

  const parts = String(page || '').split('-');
  const page_team = String(parts[0] || '').trim().toUpperCase();

  return page_team || 'Other';
}
/* ################# */
function trade_candidates_from_payload(players_lookup) {
  return Object.entries(players_lookup || {})
    .filter(([page]) => !String(page || '').includes('~'))
    .map(([page, player]) => ({
      page,
      player,
      name: String(player?.name || page).trim(),
      role_group: trade_player_type_from_payload_player(player),
      team: trade_team_for_candidate(page, player),
    }))
    .filter(x => x.page && x.name && x.role_group)
    .filter(x => compare_player_has_required_panels(x.player, false))
    .sort((a, b) => {
      const team_cmp = x_team_sort(a.team).localeCompare(x_team_sort(b.team));
      if (team_cmp !== 0) return team_cmp;

      const role_cmp = trade_role_label(a.role_group).localeCompare(trade_role_label(b.role_group));
      if (role_cmp !== 0) return role_cmp;

      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    });
}
/* ################# */
function trade_side_total_html(side_players) {
  let pts = 0;
  let score = 0;
  let pts_n = 0;
  let score_n = 0;

  side_players.forEach(player => {
    const tables = Array.isArray(player?.stats_tables) ? player.stats_tables : [];

    tables.forEach(tbl => {
      const headers = Array.isArray(tbl?.headers) ? tbl.headers : [];
      const cells = Array.isArray(tbl?.cells) ? tbl.cells : [];

      headers.forEach((h, i) => {
        const key = String(h || '').trim();
        const val = Number(cells[i]?.value);

        if (!Number.isFinite(val)) return;

        if (key === 'Pts') {
          pts += val;
          pts_n += 1;
        }

        if (key === 'Score') {
          score += val;
          score_n += 1;
        }
      });
    });
  });

  const pts_text = pts_n ? pts.toFixed(1) : '—';
  const score_text = score_n ? score.toFixed(1) : '—';

  return `
    <div class='trade_side_total'>
      <span>Pts: <b>${escape_html(pts_text)}</b></span>
      <span>Score: <b>${escape_html(score_text)}</b></span>
    </div>
  `;
}
/* ################# */
function trade_select_html(side_i, slot_i, selected_page, candidates) {
  const selected_player = candidates.find(x => x.page === selected_page);
  const selected_role = selected_player?.role_group || 'lineup';
  const list_id = `trade_player_list_${side_i}_${slot_i}`;
  const selected_name = selected_player?.name || '';

  const type_options = [
    ['lineup', 'Hitters'],
    ['rotation', 'Starters'],
    ['bullpen', 'Relievers'],
  ];

  const player_options = candidates
    .filter(x => x.role_group === selected_role)
    .sort((a, b) => {
      const team_cmp = x_team_sort(a.team).localeCompare(x_team_sort(b.team));
      if (team_cmp !== 0) return team_cmp;

      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    })
    .map(x => {
      return `<option value='${escape_attr(x.name)}' label='${escape_attr(x.team)} — ${escape_attr(trade_role_label(x.role_group))}' data-page='${escape_attr(x.page)}'></option>`;
    })
    .join('');

  return `
    <div class='trade_slot_controls' data-side='${side_i}' data-slot='${slot_i}'>
      <select class='trade_type_select'>
        ${type_options.map(([value, label]) => `<option value='${value}'${value === selected_role ? ' selected' : ''}>${label}</option>`).join('')}
      </select>
      <input
        type='text'
        class='trade_player_input'
        placeholder='Type player name'
        autocomplete='off'
        list='${escape_attr(list_id)}'
        value='${escape_attr(selected_name)}'
      >
      <input type='hidden' class='trade_player_page' value='${escape_attr(selected_page || '')}'>
      <datalist id='${escape_attr(list_id)}'>
        ${player_options}
      </datalist>
    </div>
  `;
}
/* ################# */
function trade_side_html(side_i, side_pages, candidates, players_lookup, scales, player_count) {
  const side_players = side_pages
    .slice(0, player_count)
    .map(page => compare_lookup_player_from_payload(players_lookup, page))
    .filter(Boolean);

  const controls = Array.from({ length: player_count }, (_, slot_i) => {
    return trade_select_html(side_i, slot_i, side_pages[slot_i] || '', candidates);
  }).join('');

  const side_label = side_i === 0 ? 'Team A' : side_i === 1 ? 'Team B' : 'Team C';

  return `
    <div class='trade_side' data-trade-side='${side_i}'>
      <div class='trade_side_header'>
        <div class='trade_side_title'>${side_label}</div>
      </div>
      <div class='trade_controls_grid'>
        ${controls}
      </div>
      <div class='trade_cards'>
        ${side_players.map(player => compare_player_card_html(player, scales)).join('')}
      </div>
    </div>
  `;
}
/* ################# */
function trade_top_controls_html(state) {
  const side_count = Number(state?.side_count || 2);
  const player_counts = Array.isArray(state?.player_counts) ? state.player_counts : [];

  const side_count_options = [2, 3].map(n => {
    return `<option value='${n}'${n === side_count ? ' selected' : ''}>${n}</option>`;
  }).join('');

  const side_count_control = `
    <div class='trade_top_control'>
      <div class='trade_top_label'>Sides</div>
      <select class='trade_side_count_select'>
        ${side_count_options}
      </select>
    </div>
  `;

  const player_count_controls = Array.from({ length: side_count }, (_, i) => {
    const side_label = i === 0 ? 'Team A Players' : i === 1 ? 'Team B Players' : 'Team C Players';
    const selected_count = Number(player_counts[i] || 1);

    const opts = [1, 2, 3, 4, 5].map(n => {
      return `<option value='${n}'${n === selected_count ? ' selected' : ''}>${n}</option>`;
    }).join('');

    return `
      <div class='trade_top_control'>
        <div class='trade_top_label'>${side_label}</div>
        <select class='trade_count_select' data-side='${i}'>
          ${opts}
        </select>
      </div>
    `;
  }).join('');

  return `
    <div class='trade_top_controls'>
      ${side_count_control}
      ${player_count_controls}
    </div>
  `;
}
/* ################# */
async function sync_compare_trade_streak_emojis(root) {
  const scope = root || document;
  const payload = await load_compare_payload();
  const players_lookup = payload?.players || {};

  scope.querySelectorAll(
    '.compare_player_name_link[data-compare-id]'
  ).forEach(a => {
    a.querySelector(
      ':scope > .compare_card_streak_emoji'
    )?.remove();

    const compare_id = String(
      a.dataset.compareId || ''
    ).trim();

    if (!compare_id) return;

    const player = compare_lookup_player_from_payload(
      players_lookup,
      compare_id
    );

    const emoji = String(
      player?.streak_emoji || ''
    ).trim();

    if (!emoji) return;

    const span = document.createElement('span');

    span.className = 'compare_card_streak_emoji';
    span.textContent = emoji;
    span.title = (
      emoji === '🔥'
        ? 'Hot streak'
        : 'Cold streak'
    );

    a.appendChild(document.createTextNode(' '));
    a.appendChild(span);
  });
}
/* ################# */
async function sync_fantasy_streak_emojis(root) {
  const scope = root || document;
  const sort_year = String(fantasy_state.year || window.DEFAULT_SEASON_YEAR || new Date().getFullYear());

  let lookup;

  try {
    lookup = await sidebar_fval_lookup_for_year(sort_year);
  } catch (err) {
    return;
  }

  scope.querySelectorAll('.fantasy_player_link[data-person_key]').forEach(a => {
    const name_cell = a.closest('.fantasy_name_cell');
    if (!name_cell) return;

    name_cell.querySelector(':scope > .fantasy_streak_emoji')?.remove();

    const person_key = String(a.dataset.person_key || '').trim();
    const role = String(a.dataset.role || '').trim();

    if (!person_key || !role) return;

    const stat_vals = get_sidebar_fval_from_lookup(lookup, person_key, role);
    const emoji = sidebar_streak_emoji_for_vals(stat_vals, role);

    if (!emoji) return;

    const remove_btn = name_cell.querySelector(':scope > .fantasy_remove_btn');
    const span = document.createElement('span');

    span.className = 'fantasy_streak_emoji';
    span.textContent = emoji;
    span.title = emoji === '🔥' ? 'Hot streak' : 'Cold streak';
    span.setAttribute('aria-label', span.title);

    if (remove_btn) {
      remove_btn.before(span);
    } else {
      name_cell.appendChild(span);
    }
  });
}
/* ################# */
async function render_trade_page_from_hash() {
  const content = document.getElementById('content_root');
  if (!content) return;

  const payload = await load_compare_payload();
  const players_lookup = payload?.players || {};
  const scales = payload?.scales || {};
  const candidates = trade_candidates_from_payload(players_lookup);
  const state = parse_trade_hash_state();

  content.innerHTML = `
    <div class='trade_page'>
      <div class='compare_header'>
        <div>
          <div class='compare_title'>Trade Calculator</div>
          <div class='compare_subtitle'>${state.side_count} sides · up to 5 players per side</div>
        </div>
      </div>

      <div class='trade_controls_row'>
        ${trade_top_controls_html(state)}
        ${compare_panel_filter_controls_html()}
      </div>

      <div class='trade_grid'>
        ${state.sides.map((side_pages, side_i) => {
          return trade_side_html(
            side_i,
            side_pages,
            candidates,
            players_lookup,
            scales,
            state.player_counts[side_i] || 1
          );
        }).join('')}
      </div>
    </div>
  `;

  content.querySelectorAll('.compare_player_name_link[data-page]').forEach(a => {
    if (a.dataset.bound === '1') return;
    a.dataset.bound = '1';

    a.addEventListener('click', e => {
      e.preventDefault();

      const page = String(a.dataset.page || '').trim();
      if (!page) return;

      activate_page(page);
    });
  });

  const side_count_select = content.querySelector('.trade_side_count_select');
  side_count_select?.addEventListener('change', () => {
    const next_state = parse_trade_hash_state();
    const next_side_count = Math.min(3, Math.max(2, Number(side_count_select.value || 2)));

    next_state.side_count = next_side_count;
    next_state.sides = next_state.sides.slice(0, next_side_count);
    next_state.player_counts = next_state.player_counts.slice(0, next_side_count);

    while (next_state.sides.length < next_side_count) next_state.sides.push([]);
    while (next_state.player_counts.length < next_side_count) next_state.player_counts.push(1);

    window.location.hash = trade_hash_for_state(next_state);
    render_trade_page_from_hash();
  });

  content.querySelectorAll('.trade_count_select[data-side]').forEach(sel => {
    sel.addEventListener('change', () => {
      const side_i = Number(sel.dataset.side);
      const next_state = parse_trade_hash_state();

      while (next_state.player_counts.length <= side_i) next_state.player_counts.push(1);
      while (next_state.sides.length <= side_i) next_state.sides.push([]);

      next_state.player_counts[side_i] = Math.min(5, Math.max(1, Number(sel.value || 1)));
      next_state.sides[side_i] = next_state.sides[side_i].slice(0, next_state.player_counts[side_i]);

      window.location.hash = trade_hash_for_state(next_state);
      render_trade_page_from_hash();
    });
  });

  content.querySelectorAll('.trade_slot_controls').forEach(row => {
    const side_i = Number(row.dataset.side);
    const slot_i = Number(row.dataset.slot);
    const type_sel = row.querySelector('.trade_type_select');
    const player_input = row.querySelector('.trade_player_input');
    const player_page = row.querySelector('.trade_player_page');
    const player_list = row.querySelector('datalist');

    function rebuild_players() {
      const role_group = String(type_sel.value || '').trim();

      if (player_input) player_input.value = '';
      if (player_page) player_page.value = '';
      if (player_list) player_list.innerHTML = '';

      candidates
        .filter(x => x.role_group === role_group)
        .sort((a, b) => {
          const team_cmp = x_team_sort(a.team).localeCompare(x_team_sort(b.team));
          if (team_cmp !== 0) return team_cmp;

          return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
        })
        .forEach(x => {
          const opt = document.createElement('option');
          opt.value = x.name;
          opt.label = `${x.team} — ${trade_role_label(x.role_group)}`;
          opt.dataset.page = x.page;
          player_list?.appendChild(opt);
        });
    }

    function set_trade_player_from_input() {
      const raw = String(player_input?.value || '').trim();
      const role_group = String(type_sel?.value || '').trim();
      const norm = normalize_matchup_person_key(raw);

      if (!player_page) return false;

      player_page.value = '';

      if (!norm) return false;

      const match = candidates.find(x => {
        return x.role_group === role_group &&
          normalize_matchup_person_key(x.name) === norm;
      });

      if (!match) return false;

      player_page.value = match.page;
      player_input.value = match.name;

      return true;
    }

    function sync_trade_hash() {
      set_trade_player_from_input();

      const next_state = parse_trade_hash_state();

      while (next_state.sides.length <= side_i) next_state.sides.push([]);
      while (next_state.player_counts.length <= side_i) next_state.player_counts.push(1);

      next_state.sides[side_i][slot_i] = String(player_page?.value || '').trim();
      next_state.sides[side_i] = next_state.sides[side_i].filter(Boolean).slice(0, next_state.player_counts[side_i]);

      window.location.hash = trade_hash_for_state(next_state);
      render_trade_page_from_hash();
    }

type_sel.addEventListener('change', () => {
  rebuild_players();
});

    player_input?.addEventListener('change', sync_trade_hash);

    player_input?.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;

      e.preventDefault();
      sync_trade_hash();
    });

    player_input?.addEventListener('input', () => {
      if (!player_page) return;
      player_page.value = '';
      set_trade_player_from_input();
    });
  });
  bind_compare_panel_filter_controls(content);
  refresh_compare_table_cell_theme(content);
  await sync_compare_trade_streak_emojis(content);
  await sync_compare_trade_own_pct(content);

  active_page_id = 'trade';
  active_content_file = '';

  document.querySelectorAll('.toc_link').forEach(a => a.classList.remove('active'));
}
/* ################# */
async function render_compare_page_from_hash() {
  const content = document.getElementById('content_root');
  if (!content) return;

  const page_ids = parse_compare_hash_players();
  if (!page_ids.length) return;

  const payload = await load_compare_payload();
  const players_lookup = payload?.players || {};
  const scales = payload?.scales || {};

  function compare_lookup_player(pid) {
    return compare_lookup_player_from_payload(
      players_lookup,
      pid
    );
  }

  const players = page_ids
    .map(pid => compare_lookup_player(pid))
    .filter(Boolean);
  if (!players.length) {
    content.innerHTML = `
      <div class='compare_page'>
        <div class='compare_header'>
          <button type='button' class='compare_back_btn'>← Back</button>
          <div class='compare_title'>Compare</div>
        </div>
        <div class='compare_empty'>No compare data found. Message me if you think this is supposed to work, lol.</div>
      </div>
    `;
    return;
  }

  const role_label = compare_label_for_role_group(players[0]?.role_group);

    content.innerHTML = `
      <div class='compare_page'>
        <div class='compare_top_row'>
          <div class='compare_header'>
            <button type='button' class='compare_back_btn'>← Back</button>
            <div>
              <div class='compare_title'>Compare Players</div>
              <div class='compare_subtitle'>${players.length} players</div>
            </div>
          </div>

          ${compare_panel_filter_controls_html()}
        </div>

        <div class='compare_grid'>
        ${players.map(player => compare_player_card_html(player, scales)).join('')}
      </div>
    </div>
  `;

    content.querySelectorAll('.compare_player_name_link[data-page]').forEach(a => {
    if (a.dataset.bound === '1') return;
    a.dataset.bound = '1';

    a.addEventListener('click', e => {
      e.preventDefault();

      const page = String(a.dataset.page || '').trim();
      if (!page) return;

      activate_page(page);
    });
  });
  
  bind_compare_panel_filter_controls(content);
  refresh_compare_table_cell_theme(content);
  await sync_compare_trade_streak_emojis(content);
  await sync_compare_trade_own_pct(content);
  const back_btn = content.querySelector('.compare_back_btn');
  back_btn?.addEventListener('click', () => {
    const first_page = String(page_ids[0] || '').trim();
    if (first_page) activate_page(first_page);
  });

  active_page_id = 'compare';
  active_content_file = '';

  document.querySelectorAll('.toc_link').forEach(a => a.classList.remove('active'));
}
/* ################# */
function sync_player_page_action_buttons() {
  const content = document.getElementById('content_root');
  if (!content) return;

  const sync_page_id = String(active_page_id || '').trim();
  const header = content.querySelector('.player_header');
  if (!header) return;

  const person_key = current_page_person_key();
  const storage_key = current_page_storage_key();
  if (!person_key || !storage_key) return;
  /* ################# */
  function sync_is_stale() {
    return (
      document.getElementById('content_root') !== content ||
      String(active_page_id || '').trim() !== sync_page_id
    );
  }

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

  let compare_wrap = actions_row.querySelector('.compare_page_wrap');

  if (!compare_wrap) {
    compare_wrap = document.createElement('div');
    compare_wrap.className = 'compare_page_wrap';

    const compare_btn = document.createElement('button');
    compare_btn.type = 'button';
    compare_btn.className = 'compare_page_btn';
    compare_btn.textContent = 'Compare';

    const compare_sel = document.createElement('input');
    compare_sel.type = 'text';
    compare_sel.className = 'compare_page_select compare_page_input';
    compare_sel.placeholder = 'Loading players…';
    compare_sel.setAttribute('autocomplete', 'off');

    const compare_list = document.createElement('datalist');
    compare_list.id = 'compare_page_player_list';

    const compare_msg = document.createElement('span');
    compare_msg.className = 'compare_page_msg';

    const compare_selected = document.createElement('div');
    compare_selected.className = 'compare_selected_players';

    compare_wrap.appendChild(compare_btn);
    compare_wrap.appendChild(compare_sel);
    compare_wrap.appendChild(compare_list);
    compare_wrap.appendChild(compare_msg);
    compare_wrap.appendChild(compare_selected);

    compare_sel.setAttribute('list', compare_list.id);
    actions_row.appendChild(compare_wrap);
  }

  const compare_btn = compare_wrap.querySelector('.compare_page_btn');
  const compare_sel = compare_wrap.querySelector('.compare_page_select');
  const compare_list = compare_wrap.querySelector('datalist');
  const compare_msg = compare_wrap.querySelector('.compare_page_msg');
  const compare_selected = compare_wrap.querySelector('.compare_selected_players');

  compare_wrap.querySelector('.compare_add_btn')?.remove();

  if (!compare_wrap.compare_pages) {
    compare_wrap.compare_pages = [];
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

  compare_wrap.style.display = 'inline-flex';
  compare_wrap.setAttribute('aria-busy', 'true');

  compare_sel.disabled = true;
  compare_sel.placeholder = 'Loading players…';

  compare_btn.disabled = true;

  if (compare_msg) {
    compare_msg.textContent = '';
  }
  /* ################# */
  async function load_compare_controls() {
    const active = get_active_compare_link();
    const active_page = String(
      active?.dataset?.page ||
      active_page_id ||
      ''
    ).trim();

    const role_group = compare_role_group_for_link(active);

    const active_compare_eligible = active && active_page && role_group
      ? await active_compare_page_is_eligible(active, role_group)
      : false;

    if (sync_is_stale()) return;

    const all_peers = active_compare_eligible
      ? await get_compare_peer_links_for_active_page({
          include_ineligible: true,
        })
      : [];

    if (sync_is_stale()) return;

    const peers = all_peers.filter(peer => peer.eligible);

    if (compare_list) {
      compare_list.innerHTML = '';
    }

    if (compare_msg) {
      compare_msg.textContent = '';
    }

    compare_sel.value = '';

    compare_wrap.compare_pages = (
      compare_wrap.compare_pages || []
    )
      .filter(page => peers.some(peer => peer.page === page))
      .slice(0, 4);
    /* ################# */
    function render_compare_selected() {
      if (!compare_selected) return;

      compare_selected.innerHTML = '';

      compare_wrap.compare_pages.forEach(page => {
        const peer = peers.find(x => x.page === page);
        if (!peer) return;

        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'compare_selected_chip';
        chip.textContent = `× ${peer.name}`;
        chip.title = 'Remove from comparison';

        chip.addEventListener('click', () => {
          compare_wrap.compare_pages = compare_wrap.compare_pages.filter(
            x => x !== page
          );

          render_compare_selected();
        });

        compare_selected.appendChild(chip);
      });
    }
    /* ################# */
    function add_compare_selection() {
      const raw = String(compare_sel.value || '').trim();
      const norm = normalize_matchup_person_key(raw);

      if (compare_msg) {
        compare_msg.textContent = '';
      }

      if (!norm) return;

      const matches = all_peers.filter(peer => {
        return normalize_matchup_person_key(peer.name) === norm;
      });

      if (!matches.length) {
        if (compare_msg) {
          compare_msg.textContent = 'Not in list';
        }

        return;
      }

      const peer = matches[0];

      if (!peer.eligible) {
        if (compare_msg) {
          compare_msg.textContent = 'Not in compare data';
        }

        return;
      }

      const page = String(peer.page || '').trim();
      if (!page) return;

      if (compare_wrap.compare_pages.includes(page)) {
        compare_sel.value = '';
        return;
      }

      if (compare_wrap.compare_pages.length >= 4) {
        if (compare_msg) {
          compare_msg.textContent = 'max 4 players';
        }

        return;
      }

      compare_wrap.compare_pages.push(page);
      compare_sel.value = '';
      render_compare_selected();
    }
    /* ################# */
    function go_compare() {
      const current_page = String(
        get_active_compare_link()?.dataset?.page ||
        active_page_id ||
        ''
      ).trim();

      const other_pages = (compare_wrap.compare_pages || [])
        .map(x => String(x || '').trim())
        .filter(Boolean);

      if (!current_page || !other_pages.length) return;

      window.location.hash = compare_hash_for_pages([
        current_page,
        ...other_pages,
      ]);

      render_compare_page_from_hash();
    }

    if (!active_compare_eligible || !all_peers.length) {
      compare_wrap.style.display = 'none';

      if (compare_selected) {
        compare_selected.innerHTML = '';
      }

      compare_wrap.removeAttribute('aria-busy');
      return;
    }

    all_peers.forEach(peer => {
      const opt = document.createElement('option');

      opt.value = peer.name;
      opt.label = `${peer.team}`;
      opt.dataset.page = peer.page;
      opt.dataset.eligible = peer.eligible ? '1' : '0';

      compare_list?.appendChild(opt);
    });

    render_compare_selected();

    compare_wrap.style.display = 'inline-flex';
    compare_wrap.removeAttribute('aria-busy');

    compare_sel.disabled = false;
    compare_sel.placeholder = 'Type player name';

    compare_btn.disabled = false;

    if (compare_btn.dataset.bound !== '1') {
      compare_btn.dataset.bound = '1';
      compare_btn.addEventListener('click', go_compare);
    }

    if (compare_sel.dataset.bound !== '1') {
      compare_sel.dataset.bound = '1';

      compare_sel.addEventListener('input', () => {
        if (compare_msg) {
          compare_msg.textContent = '';
        }
      });

      compare_sel.addEventListener('change', add_compare_selection);

      compare_sel.addEventListener('keydown', e => {
        if (e.key !== 'Enter') return;

        e.preventDefault();
        add_compare_selection();
      });
    }
  }

  if (
    compare_wrap.dataset.compareLoadingPage !== sync_page_id &&
    compare_wrap.dataset.compareReadyPage !== sync_page_id
  ) {
    compare_wrap.dataset.compareLoadingPage = sync_page_id;

    requestAnimationFrame(() => {
      setTimeout(() => {
        load_compare_controls()
          .then(() => {
            if (sync_is_stale()) return;

            delete compare_wrap.dataset.compareLoadingPage;
            compare_wrap.dataset.compareReadyPage = sync_page_id;
          })
          .catch(() => {
            if (sync_is_stale()) return;

            delete compare_wrap.dataset.compareLoadingPage;
            compare_wrap.removeAttribute('aria-busy');
            compare_wrap.style.display = 'none';
          });
      }, 0);
    });
  }
}
/* ################# */
async function refresh_custom_player_lists_ui() {
  await load_sidebar_team_logos();
  add_wbc_sidebar_player_logos(document);
  add_top_prospect_sidebar_player_logos(document);
sync_mapped_sidebar_team_ribbon('.division_block[data-division="top_100_prospects"]', ['top_100_prospects', 'top_prospects']);
sync_mapped_sidebar_team_ribbon('.division_block[data-division="top_prospects"]', ['top_100_prospects', 'top_prospects']);

  await sort_active_team_sidebar_lists_by_fval();
  await sync_sidebar_streak_emojis(document);
  await render_favorites_sidebar();
  await render_watchlist_sidebar();
  await sync_sidebar_streak_emojis(document);
  update_sidebar_custom_icons(document);
  await sync_player_page_action_buttons();

  const search = document.getElementById('player_search');
  apply_search_and_filters((search && search.value) ? search.value : '');
}
function fantasy_own_pct_text(value) {
  const n = Number(value);

  if (
    value == null ||
    value === '' ||
    !Number.isFinite(n)
  ) {
    return '';
  }

  return `Owned%: ${n.toFixed(1).replace(/\.0$/, '')}%`;
}
/* ################# */
async function fantasy_own_pct_for_person(
  year,
  person_key,
  role
) {
  const y = String(year || '').trim();
  const key = String(person_key || '').trim();

  if (!y || !key) return '';

  const data = await load_fantasy_year(y);
  if (!data) return '';

  const row = find_player_row_anywhere(
    data,
    key,
    role
  );

  if (!row) return '';

  return fantasy_own_pct_text(
    row['Own%']
  );
}
/* ################# */
function compare_fantasy_role_for_role_group(role_group) {
  const role = String(
    role_group || ''
  ).trim().toLowerCase();

  if (role === 'lineup') return 'hitters';
  if (role === 'rotation') return 'sp';
  if (role === 'bullpen') return 'rp';

  return '';
}
/* ################# */
async function sync_compare_trade_own_pct(root) {
  const scope = root || document;

  const current_year = String(
    window.DEFAULT_SEASON_YEAR ||
    new Date().getFullYear()
  ).trim();

  const nodes = Array.from(
    scope.querySelectorAll(
      '.compare_player_own_pct'
    )
  );

  await Promise.all(
    nodes.map(async node => {
      const page = String(
        node.dataset.page || ''
      ).trim();

      const person_key_from_node = String(
        node.dataset.personKey || ''
      ).trim();

      const role_group = String(
        node.dataset.roleGroup || ''
      ).trim();

      const player_year = String(
        node.dataset.year || ''
      ).trim();

      const is_current_compare = (
        player_year === current_year &&
        !String(
          node.dataset.compareId || ''
        ).includes('~')
      );

      if (!is_current_compare) {
        node.textContent = '';
        node.style.display = 'none';
        return;
      }

      const sidebar_link = Array.from(
        document.querySelectorAll(
          '.toc_link[data-page][data-person_key]'
        )
      ).find(a => {
        return String(
          a.dataset.page || ''
        ).trim() === page;
      });

      const person_key = (
        person_key_from_node ||
        String(
          sidebar_link?.dataset?.person_key ||
          sidebar_link?.dataset?.name ||
          ''
        ).trim()
      );

      const role = compare_fantasy_role_for_role_group(
        role_group
      );

      if (!person_key || !role) {
        node.textContent = '';
        node.style.display = 'none';
        return;
      }

      const text = await fantasy_own_pct_for_person(
        current_year,
        person_key,
        role
      );

      node.textContent = text;
      node.style.display = text
        ? ''
        : 'none';
    })
  );
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
const sidebar_fval_lookup_cache = new Map();
/* ################# */
async function sidebar_fval_lookup_for_year(year) {
  const y = String(year || '').trim();
  if (!y) return new Map();

  if (sidebar_fval_lookup_cache.has(y)) {
    return sidebar_fval_lookup_cache.get(y);
  }

  const data = await load_fantasy_year(y);
  const out = new Map();

  if (data) {
    for (const scope_val of Object.values(data)) {
      if (!scope_val || typeof scope_val !== 'object') continue;

      for (const [section_name, section_val] of Object.entries(scope_val)) {
        if (!Array.isArray(section_val)) continue;

        const section = String(section_name || '').trim().toLowerCase();

        section_val.forEach(row => {
          const person_key = String(row.person_key || '').trim();
          const norm_key = normalize_matchup_person_key(person_key || row.name || '');
          if (!norm_key) return;

          const pts_num = Number(row.Pts);
          const score_num = Number(row.Score);
          const s_ops_num = Number(row['S OPS']);
          const s_era_num = Number(row['S ERA']);
          const ops_num = Number(row.OPS);
          const era_num = Number(row.ERA);

          const has_pts = row.Pts !== '' && row.Pts != null && Number.isFinite(pts_num);
          const has_score = row.Score !== '' && row.Score != null && Number.isFinite(score_num);
          const has_s_ops = row['S OPS'] !== '' && row['S OPS'] != null && Number.isFinite(s_ops_num);
          const has_s_era = row['S ERA'] !== '' && row['S ERA'] != null && Number.isFinite(s_era_num);
          const has_ops = row.OPS !== '' && row.OPS != null && Number.isFinite(ops_num);
          const has_era = row.ERA !== '' && row.ERA != null && Number.isFinite(era_num);

          if (!has_pts && !has_score && !has_s_ops && !has_s_era && !has_ops && !has_era) return;

          const lookup_key = `${section}__${norm_key}`;

          if (out.has(lookup_key)) return;

          out.set(lookup_key, {
            pts: has_pts ? pts_num : null,
            score: has_score ? score_num : null,
            s_ops: has_s_ops ? s_ops_num : null,
            s_era: has_s_era ? s_era_num : null,
            ops: has_ops ? ops_num : null,
            era: has_era ? era_num : null,
          });
        });
      }
    }
  }

  sidebar_fval_lookup_cache.set(y, out);
  return out;
}
/* ################# */
function get_sidebar_fval_from_lookup(lookup, person_key, role) {
  const section = fantasy_role_for_sidebar_link({ dataset: { role } });
  const norm_key = normalize_matchup_person_key(person_key);
  if (!section || !norm_key) return null;

  const key = `${section}__${norm_key}`;
  return lookup.has(key) ? lookup.get(key) : null;
}
/* ################# */
function sidebar_link_is_active_player(a) {
  if (!a) return false;

  if (a.closest('.favorites_block') || a.closest('.watchlist_block')) return false;

  const team_block = a.closest('.team_block');
  const division_block = a.closest('.division_block');

  const team = String(team_block?.dataset?.team || a.dataset.team || '').trim().toUpperCase();
  const division = String(division_block?.dataset?.division || '').trim().toLowerCase();

  if (!team) return false;

  const blocked_teams = new Set([
    'FA',
    'FREE AGENT',
    'FREE AGENTS',
    'RETIRED',
    'WBC',
  ]);

  if (blocked_teams.has(team)) return false;
  if (team.startsWith('RETIRED')) return false;

  if (division === 'wbc') return false;
  if (division === 'retired') return false;
  if (division === 'inactive') return false;

  return true;
}
/* ################# */
function sidebar_streak_emoji_for_vals(stat_vals, role) {
  const r = fantasy_role_for_sidebar_link({ dataset: { role } });

  if (r === 'hitters') {
    const raw_s_ops = stat_vals?.s_ops;
    if (raw_s_ops == null || raw_s_ops === '') return '';

    const s_ops = Number(raw_s_ops);
    const ops = stat_vals?.ops == null || stat_vals.ops === '' ? NaN : Number(stat_vals.ops);

    if (!Number.isFinite(s_ops)) return '';

    const s_ops_is_below_season =
      Number.isFinite(ops) && s_ops < ops;

    if (s_ops > 0.830 && !s_ops_is_below_season) return '🔥';
    if (s_ops < 0.700 || (s_ops < 0.750 && s_ops_is_below_season)) return '❄️';

    return '';
  }

  if (r === 'sp' || r === 'rp') {
    const raw_s_era = stat_vals?.s_era;
    if (raw_s_era == null || raw_s_era === '') return '';

    const s_era = Number(raw_s_era);
    const era = stat_vals?.era == null || stat_vals.era === '' ? NaN : Number(stat_vals.era);

    if (!Number.isFinite(s_era)) return '';

    const s_era_is_worse_than_season =
      Number.isFinite(era) && s_era > era;

    if (s_era < 3.30 && !s_era_is_worse_than_season) return '🔥';
    if (s_era > 4.50 || (s_era > 4.20 && s_era_is_worse_than_season)) return '❄️';

    return '';
  }

  return '';
}
/* ################# */
async function sync_sidebar_streak_emojis(root = document) {
  const sort_year = String(window.DEFAULT_SEASON_YEAR || new Date().getFullYear());
  const lookup = await sidebar_fval_lookup_for_year(sort_year);
  const scope = root || document;

  scope.querySelectorAll('.toc_link[data-person_key]').forEach(a => {
    a.querySelector(':scope > .sidebar_streak_emoji')?.remove();

    const is_custom_list = !!a.closest('.favorites_block, .watchlist_block');

    if (!is_custom_list && !sidebar_link_is_active_player(a)) return;

    const stat_vals = get_sidebar_fval_from_lookup(lookup, a.dataset.person_key, a.dataset.role);
    const emoji = sidebar_streak_emoji_for_vals(stat_vals, a.dataset.role);
    if (!emoji) return;

    const span = document.createElement('span');
    span.className = 'sidebar_streak_emoji';
    span.textContent = emoji;
    span.title = emoji === '🔥' ? 'Hot streak' : 'Cold streak';

    a.appendChild(span);
  });
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

    const own_pct = document.createElement('span');
    own_pct.className = 'player_year_own_pct';
    own_pct.style.display = 'none';

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
    function add_opt(
      text,
      file,
      is_selected,
      year
    ) {
      const o = document.createElement('option');

      o.value = file;
      o.textContent = text;
      o.dataset.year = String(year || '');

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

      return {
        label_text,
        file,
        is_selected,
        year: y,
      };
    });

    Promise.all(option_jobs).then(options => {
      options.forEach(opt => {
        if (!opt) return;
        add_opt(
          opt.label_text,
          opt.file,
          opt.is_selected,
          opt.year
        );
      });

    if (!any_selected && sel.options.length) {
      sel.selectedIndex = 0;
    }

    const selected_option = sel.options[
      sel.selectedIndex
    ];

    const selected_year = String(
      selected_option?.dataset?.year ||
      label_current_year ||
      ''
    ).trim();

    const current_year = String(
      window.DEFAULT_SEASON_YEAR ||
      new Date().getFullYear()
    ).trim();

    if (selected_year !== current_year) {
      own_pct.textContent = '';
      own_pct.style.display = 'none';
    } else {
      fantasy_own_pct_for_person(
        current_year,
        person_key,
        role
      ).then(text => {
        own_pct.textContent = text;
        own_pct.style.display = text
          ? ''
          : 'none';
      });
    }

    sync_year_fallback_disclaimer();

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
    row.appendChild(own_pct);
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
  if (btn) btn.textContent = enabled ? 'Light' : 'Dark';

  write_soft_theme(!!enabled);
  repaint_standard_stats_tables(document);
  bring_pct_markers_to_front(document);

  requestAnimationFrame(() => {
    repaint_standard_stats_tables(document);
    bring_pct_markers_to_front(document);
  });

  setTimeout(() => {
    repaint_standard_stats_tables(document);
    bring_pct_markers_to_front(document);
  }, 60);
  
    refresh_compare_table_cell_theme(document);
  requestAnimationFrame(() => refresh_compare_table_cell_theme(document));
  setTimeout(() => refresh_compare_table_cell_theme(document), 60);
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

    const repaint = () => {
      repaint_standard_stats_tables(content);
      bring_pct_markers_to_front(content);
    };
    plot.on?.('plotly_afterplot', repaint);
    plot.on?.('plotly_relayout', repaint);
    plot.on?.('plotly_restyle', repaint);
  });
  requestAnimationFrame(() => {
    repaint_standard_stats_tables(content);
    bring_pct_markers_to_front(content);

    requestAnimationFrame(() => {
      repaint_standard_stats_tables(content);
      bring_pct_markers_to_front(content);
    });
  });

  init_matchups_page_if_present(content);
  init_fantasy_page_if_present(content);
  init_fantasy_trends_page_if_present(content);
  apply_mobile_scale();
  await load_sidebar_team_logos();
  add_wbc_sidebar_player_logos(document);
  add_top_prospect_sidebar_player_logos(document);
  sync_mapped_sidebar_team_ribbon('.division_block[data-division="top_100_prospects"]', ['top_100_prospects', 'top_prospects']);
  sync_mapped_sidebar_team_ribbon('.division_block[data-division="top_prospects"]', ['top_100_prospects', 'top_prospects']);
  repaint_standard_stats_tables(content);
  bring_pct_markers_to_front(content);

  requestAnimationFrame(() => {
    repaint_standard_stats_tables(content);
    bring_pct_markers_to_front(content);
  });

  await sync_sidebar_streak_emojis(document);
  await render_favorites_sidebar();
  await render_watchlist_sidebar();
  await sync_sidebar_streak_emojis(document);
  update_sidebar_custom_icons(document);
  sync_player_page_action_buttons();

  const search = document.getElementById('player_search');
  apply_search_and_filters((search && search.value) ? search.value : '');

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
  const page_part = raw.split('?')[0].trim();

  if (page_part) {
    try {
      return decodeURIComponent(page_part);
    } catch (e) {
      return page_part;
    }
  }

  try {
    const saved = localStorage.getItem('mlb_dash_active_page');
    if (saved) return saved;
  } catch (e) {}

  return 'home';
}
/* ################# */
function on_hash_change() { /* back button works now? */
  const raw_hash = String(window.location.hash || '');
  const pid = default_page_id();

  if (pid === 'compare' || raw_hash.startsWith('#compare?')) {
    render_compare_page_from_hash();
    return;
  }

  if (pid === 'trade' || raw_hash.startsWith('#trade?')) {
    render_trade_page_from_hash();
    return;
  }

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
function apply_mobile_scale() {
  const content = document.getElementById('content_root');
  if (!content) return;

  content.style.transform = '';
  content.style.transformOrigin = '';
  content.style.width = '';
  content.style.maxWidth = '';
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
function svg_ns() {
  return 'http://www.w3.org/2000/svg';
}
/* ################# */
function is_gold_gradient_fill(fill) {
  const f = String(fill || '').trim();
  return /^url\((['"]?)(?:[^#)]*)?#mlb_gold_gradient_[^)'" ]+\1\)$/i.test(f);
}
/* ################# */
function get_plot_svg_root(node) {
  if (!node) return null;

  if (node.tagName && String(node.tagName).toLowerCase() === 'svg') {
    return node;
  }

  if (node.querySelector) {
    const inner_svg = node.querySelector('svg');
    if (inner_svg) return inner_svg;
  }

  return node.closest ? node.closest('svg') : null;
}
/* ################# */
function ensure_gold_gradient_def(svg_root, gradient_key = 'default', opacity = 1) {
  if (!svg_root) return '';

  let defs = svg_root.querySelector('defs');
  if (!defs) {
    defs = document.createElementNS(svg_ns(), 'defs');
    svg_root.insertBefore(defs, svg_root.firstChild || null);
  }

  const a = Math.max(0, Math.min(1, Number(opacity)));
  const opacity_key = String(Math.round(a * 1000)).padStart(4, '0');
  const gradient_id = `mlb_gold_gradient_${gradient_key}_${opacity_key}`;

  let grad = defs.querySelector(`#${gradient_id}`);

  if (!grad) {
    grad = document.createElementNS(svg_ns(), 'linearGradient');
    grad.setAttribute('id', gradient_id);
    grad.setAttribute('x1', '0%');
    grad.setAttribute('y1', '0%');
    grad.setAttribute('x2', '100%');
    grad.setAttribute('y2', '0%');

    let stops;

    if (gradient_key === 'table') {
      stops = [
        ['0%', 'rgb(249,242,149)'],
        ['100%', 'rgb(224,170,62)'],
      ];
    } else {
      stops = [
        ['0%', 'rgb(249,242,149)'],
        ['32%', 'rgb(224,170,62)'],
        ['64%', 'rgb(250,243,152)'],
        ['100%', 'rgb(184,138,68)'],
      ];
    }

    stops.forEach(([offset, color]) => {
      const stop = document.createElementNS(svg_ns(), 'stop');
      stop.setAttribute('offset', offset);
      stop.setAttribute('stop-color', color);
      stop.setAttribute('stop-opacity', a.toFixed(3));
      grad.appendChild(stop);
    });

    defs.appendChild(grad);
  }

  return `url(#${gradient_id})`;
}
/* ################# */
function apply_gold_gradient_fill(rect, gradient_key = 'default', opacity = 1) {
  if (!rect) return;

  const svg_root = get_plot_svg_root(rect);
  if (!svg_root) return;

  const gradient_fill = ensure_gold_gradient_def(svg_root, gradient_key, opacity);
  if (!gradient_fill) return;

  rect.style.fill = gradient_fill;
  rect.setAttribute('fill', gradient_fill);
  rect.dataset.gold_gradient_applied = '1';
}
/* ################# */
function normalize_svg_fill(fill) {
  return String(fill || '')
    .trim()
    .replace(/\s+/g, '')
    .toLowerCase();
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
  if (is_gold_gradient_fill(fill)) return true;

  const c = parse_svg_fill(fill);
  if (!c || c.a === 0) return false;

  return (
    c.r >= 180 &&
    c.g >= 125 &&
    c.b <= 95 &&
    (c.r - c.b >= 65) &&
    (c.g - c.b >= 30)
  );
}
/* ################# */
function is_deep_gold_fill(fill) {
  return is_gold_stat_fill(fill);
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
function team_logo_src_for_code(team) {
  const t = sidebar_clean_mlb_logo_team(team);
  if (!t) return '';

  const cached_src = sidebar_team_logo_cache.by_team.get(t);
  if (cached_src) return cached_src;

  const logo = document.querySelector(`.team_block[data-team="${CSS.escape(t)}"] .team_logo`);
  const dom_src = String(logo?.getAttribute('src') || '').trim();
  if (dom_src) return dom_src;

  return `./team_logos/${t}.png`;
}
/* ################# */
function get_column_header_for_text_node(text_node) {
  if (!text_node || !text_node.closest('g.table')) return '';

  const box = text_node.getBoundingClientRect();
  const text_mid_x = box.x + (box.width / 2);
  const text_y = box.y;

  const candidates = Array.from(text_node.closest('g.table').querySelectorAll('text'))
    .filter(t => t !== text_node)
    .map(t => {
      const b = t.getBoundingClientRect();

      return {
        t,
        text: String(t.textContent || '').trim(),
        mid_x: b.x + (b.width / 2),
        y: b.y,
        dx: Math.abs((b.x + (b.width / 2)) - text_mid_x),
        dy: text_y - b.y,
      };
    })
    .filter(x => x.text && x.dy > 0 && x.dy < 80)
    .sort((a, b) => {
      const dx_cmp = a.dx - b.dx;
      if (dx_cmp !== 0) return dx_cmp;

      return a.dy - b.dy;
    });

  const best = candidates[0];
  if (!best || best.dx > 32) return '';

  return normalize_table_header_label(best.text);
}
/* ################# */
function replace_team_table_text_with_logo(text_node) {
  if (!text_node || !text_node.closest('g.table')) return false;

  const header = get_column_header_for_text_node(text_node);
  if (header !== 'team') return false;

  const team = String(text_node.textContent || '').trim().toUpperCase();
  if (!team || team === 'TEAM') return false;

  const logo_src = team_logo_src_for_code(team);
  if (!logo_src) {
    restore_team_table_text_if_needed(text_node);
    return false;
  }

  const holder = get_cell_holder_for_text_node(text_node) || text_node.parentNode;
  if (!holder) return false;

  holder.querySelectorAll(':scope > image.player_page_team_logo').forEach(img => img.remove());

  let box;
  try {
    box = text_node.getBBox();
  } catch (e) {
    return false;
  }

  const size = 18;
  const img = document.createElementNS(svg_ns(), 'image');
  img.classList.add('player_page_team_logo');
  img.setAttribute('href', logo_src);
  img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', logo_src);
  img.setAttribute('x', String(box.x + (box.width / 2) - (size / 2)));
  img.setAttribute('y', String(box.y + (box.height / 2) - (size / 2)));
  img.setAttribute('width', String(size));
  img.setAttribute('height', String(size));
  img.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  img.dataset.team = team;

  holder.appendChild(img);

  text_node.style.visibility = 'hidden';
  text_node.dataset.team_logo_replaced = '1';

  return true;
}
/* ################# */
function restore_team_table_text_if_needed(text_node) {
  if (!text_node || text_node.dataset.team_logo_replaced !== '1') return;

  text_node.style.removeProperty('visibility');
  delete text_node.dataset.team_logo_replaced;

  const holder = get_cell_holder_for_text_node(text_node) || text_node.parentNode;
  holder?.querySelectorAll(':scope > image.player_page_team_logo').forEach(img => img.remove());
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
function table_fill_fraction(fill) {
  if (is_gold_gradient_fill(fill)) {
    const m = String(fill || '').match(/mlb_gold_gradient_[^_]+_(\d{4})/i);
    if (m) return Math.max(0, Math.min(1, Number(m[1]) / 1000));
    return 1;
  }

  const c = parse_svg_fill(fill);
  if (!c || c.a === 0) return 0;

  if (is_gold_stat_fill(fill)) {
    return mix_frac_to_target(c, { r: 224, g: 170, b: 62 }) || 0;
  }

  if (is_blue_stat_fill(fill)) {
    return mix_frac_to_target(c, { r: 35, g: 85, b: 210 }) || 0;
  }

  if (is_red_stat_fill(fill)) {
    return mix_frac_to_target(c, { r: 210, g: 35, b: 35 }) || 0;
  }

  return 0;
}
/* ################# */
function standard_table_theme_rgb() {
  return document.body.classList.contains('soft_theme')
    ? { r: 62, g: 69, b: 78 }
    : { r: 235, g: 240, b: 248 };
}
/* ################# */
// function blend_rgba_fill_on_table_base(fill) {
//   if (is_gold_gradient_fill(fill)) return fill;

//   const c = parse_svg_fill(fill);
//   if (!c || c.a == null || c.a >= 1) return fill;

//   const base = standard_table_theme_rgb();
//   const a = Math.max(0, Math.min(1, c.a));

//   return `rgb(${clamp_byte(c.r * a + base.r * (1 - a))},${clamp_byte(c.g * a + base.g * (1 - a))},${clamp_byte(c.b * a + base.b * (1 - a))})`;
// }
function blend_rgba_fill_on_table_base(fill, element_opacity = 1) {
  if (is_gold_gradient_fill(fill)) return fill;

  const c = parse_svg_fill(fill);
  if (!c) return fill;

  const base = { r: 235, g: 240, b: 248 };

  const color_alpha = Math.max(0, Math.min(1, c.a == null ? 1 : c.a));
  const elem_alpha = Math.max(0, Math.min(1, Number(element_opacity)));
  const a = color_alpha * elem_alpha;

  return `rgb(${clamp_byte(c.r * a + base.r * (1 - a))},${clamp_byte(c.g * a + base.g * (1 - a))},${clamp_byte(c.b * a + base.b * (1 - a))})`;
}
/* ################# */
function fill_luminance(fill) {
  const c = parse_svg_fill(fill);
  if (!c) return 255;

  return (0.2126 * c.r) + (0.7152 * c.g) + (0.0722 * c.b);
}
/* ################# */
// function should_use_black_text_for_fill(fill) {
//   if (!fill) return false;
//   if (is_gold_gradient_fill(fill) || is_gold_stat_fill(fill)) return true;
//   if (!is_blue_stat_fill(fill) && !is_red_stat_fill(fill)) return false;

//   return fill_luminance(fill) >= 140 || table_fill_fraction(fill) < 0.55;
// }
// /* ################# */
// function should_use_white_table_text(text_node, cell_fill) {
//   if (!cell_fill) return false;

//   if (is_gold_gradient_fill(cell_fill) || is_gold_stat_fill(cell_fill)) {
//     return false;
//   }

//   if (!is_blue_stat_fill(cell_fill) && !is_red_stat_fill(cell_fill)) {
//     return false;
//   }

//   return !should_use_black_text_for_fill(cell_fill);
// }
function should_use_black_text_for_fill(fill) {
  return !!fill && (is_gold_gradient_fill(fill) || is_gold_stat_fill(fill));
}
/* ################# */
function should_use_white_table_text(text_node, cell_fill) {
  if (!cell_fill) return false;
  if (is_gold_gradient_fill(cell_fill) || is_gold_stat_fill(cell_fill)) return false;

  return is_blue_stat_fill(cell_fill) || is_red_stat_fill(cell_fill);
}
/* ################# */
function get_table_text_cell_fill(text_node) {
  if (!text_node) return '';

  const holder = get_cell_holder_for_text_node(text_node);
  const column_block = get_column_block_for_text_node(text_node);

  if (holder && column_block) {
    const row_idx = get_row_index_for_text_node(text_node);
    const rects = Array.from(column_block.querySelectorAll('rect'));

    const non_empty_rects = rects.filter(r => {
      const fill = r.style.fill || r.getAttribute('fill') || r.dataset.orig_fill || '';
      if (is_gold_gradient_fill(fill)) return true;

      const parsed = parse_svg_fill(fill);
      return parsed && parsed.a !== 0;
    });

    if (row_idx >= 0 && non_empty_rects[row_idx]) {
      const r = non_empty_rects[row_idx];
      return r.dataset.display_fill || r.style.fill || r.getAttribute('fill') || r.dataset.orig_fill || '';
    }
  }

  let node = text_node;
  for (let i = 0; i < 5 && node; i += 1) {
    if (node.querySelectorAll) {
      const rects = Array.from(node.querySelectorAll('rect'));
      const filled_rect = rects.find(r => {
        const fill = r.style.fill || r.getAttribute('fill') || r.dataset.orig_fill || '';
        if (is_gold_gradient_fill(fill)) return true;

        const parsed = parse_svg_fill(fill);
        return parsed && parsed.a !== 0;
      });

if (filled_rect) {
  return filled_rect.dataset.display_fill || filled_rect.style.fill || filled_rect.getAttribute('fill') || filled_rect.dataset.orig_fill || '';
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
function dark_mode_stat_fill(fill) {
  if (is_gold_gradient_fill(fill)) return fill;

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
  if (gold_like) return fill;

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
    const is_bullpen = role === 'RP' || role === 'CL' || role === 'Flex';
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
function repaint_gold_plot_bars(plot, is_dark) {
  const svg_root = get_plot_svg_root(plot);
  if (!svg_root) return;

  const bar_shapes = Array.from(
    plot.querySelectorAll('g.barlayer path, g.barlayer rect, g.trace.bars path, g.trace.bars rect')
  );

  function opacity_num(v, fallback = 1) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function restore_original_opacity(r) {
    const orig_opacity = r.dataset.orig_opacity || '';
    const orig_fill_opacity = r.dataset.orig_fill_opacity || '';

    if (orig_opacity) {
      r.style.opacity = orig_opacity;
      r.setAttribute('opacity', orig_opacity);
    } else {
      r.style.removeProperty('opacity');
      r.removeAttribute('opacity');
    }

    if (orig_fill_opacity) {
      r.style.fillOpacity = orig_fill_opacity;
      r.setAttribute('fill-opacity', orig_fill_opacity);
    } else {
      r.style.removeProperty('fill-opacity');
      r.removeAttribute('fill-opacity');
    }
  }

  function write_fill(r, fill) {
    if (fill) {
      r.style.fill = fill;
      r.setAttribute('fill', fill);
    } else {
      r.style.removeProperty('fill');
      r.removeAttribute('fill');
    }
  }

  bar_shapes.forEach(r => {
    if (r.dataset.orig_fill === undefined) {
      r.dataset.orig_fill = r.style.fill || r.getAttribute('fill') || '';
    }

    if (r.dataset.orig_opacity === undefined) {
      r.dataset.orig_opacity = r.style.opacity || r.getAttribute('opacity') || '';
    }

    if (r.dataset.orig_fill_opacity === undefined) {
      r.dataset.orig_fill_opacity = r.style.fillOpacity || r.getAttribute('fill-opacity') || '';
    }

    const orig_fill = r.dataset.orig_fill || '';
    if (!orig_fill) return;

    const parsed = parse_svg_fill(orig_fill);
    const elem_opacity = opacity_num(r.dataset.orig_fill_opacity || r.dataset.orig_opacity || 1);
    const color_alpha = parsed && parsed.a != null ? parsed.a : 1;
    const combined_opacity = Math.max(0, Math.min(1, color_alpha * elem_opacity));

    if (is_gold_stat_fill(orig_fill)) {
      apply_gold_gradient_fill(r, 'third', combined_opacity);
      r.style.opacity = '1';
      r.setAttribute('opacity', '1');
      r.style.fillOpacity = '1';
      r.setAttribute('fill-opacity', '1');
      return;
    }

    const display_fill = is_dark && is_stat_fill(orig_fill)
      ? dark_mode_stat_fill(orig_fill)
      : orig_fill;

    write_fill(r, display_fill);
    restore_original_opacity(r);
  });
}
/* ################# */
function should_use_black_bold_gold_text(text_node, cell_fill) {
  if (!cell_fill) return false;

  if (!is_gold_gradient_fill(cell_fill) && !is_gold_stat_fill(cell_fill)) {
    return false;
  }

  // if (row_has_reduced_sample_opacity(text_node) && table_fill_fraction(cell_fill) < 0.25) {
  //   return false;
  // }

  return true;
}
/* ################# */
function apply_table_text_style(text_node, { fill = '', font_weight = '', stroke = '', stroke_width = '', paint_order = '' } = {}) {
  if (!text_node) return;

  if (fill) {
    text_node.style.fill = fill;
    text_node.setAttribute('fill', fill);
  } else {
    text_node.style.removeProperty('fill');
    text_node.removeAttribute('fill');
  }

  if (font_weight) {
    text_node.style.fontWeight = font_weight;
    text_node.setAttribute('font-weight', font_weight);
  } else {
    text_node.style.removeProperty('font-weight');
    text_node.removeAttribute('font-weight');
  }

  if (stroke) {
    text_node.style.stroke = stroke;
    text_node.setAttribute('stroke', stroke);
  } else {
    text_node.style.removeProperty('stroke');
    text_node.removeAttribute('stroke');
  }

  if (stroke_width) {
    text_node.style.strokeWidth = stroke_width;
    text_node.setAttribute('stroke-width', stroke_width);
  } else {
    text_node.style.removeProperty('stroke-width');
    text_node.removeAttribute('stroke-width');
  }

  if (paint_order) {
    text_node.style.paintOrder = paint_order;
    text_node.setAttribute('paint-order', paint_order);
  } else {
    text_node.style.removeProperty('paint-order');
    text_node.removeAttribute('paint-order');
  }
}
/* ################# */
function bring_pct_markers_to_front(root) {
  const scope = root || document;

  scope.querySelectorAll('.player_page .js-plotly-plot, .player_page .plotly-graph-div').forEach(plot => {
    plot.querySelectorAll('g.scatterlayer').forEach(layer => {
      layer.parentNode?.appendChild(layer);
    });
  });
}
/* ################# */
function repaint_standard_stats_tables(root) {
  const scope = root || document;
  const is_dark = document.body.classList.contains('soft_theme');

  const plots = Array.from(scope.querySelectorAll('.player_page .js-plotly-plot, .player_page .plotly-graph-div'));

  plots.forEach(plot => {
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
  
        if (r.dataset.orig_opacity === undefined) {
          r.dataset.orig_opacity = r.style.opacity || r.getAttribute('opacity') || '';
        }

        if (r.dataset.orig_fill_opacity === undefined) {
          r.dataset.orig_fill_opacity = r.style.fillOpacity || r.getAttribute('fill-opacity') || '';
        }

        const orig_fill = r.dataset.orig_fill || '';
        const parsed = parse_svg_fill(orig_fill);
        const gold_candidate = is_gold_stat_fill(orig_fill);

        if (gold_candidate) {
          const elem_opacity = Number(r.dataset.orig_fill_opacity || r.dataset.orig_opacity || 1);
          const opacity = (parsed && parsed.a != null ? parsed.a : 1) * elem_opacity;
          apply_gold_gradient_fill(r, 'table', opacity);

          const display_fill = r.style.fill || r.getAttribute('fill') || '';
          r.dataset.display_fill = display_fill;

          r.style.opacity = '1';
          r.setAttribute('opacity', '1');
          r.style.fillOpacity = '1';
          r.setAttribute('fill-opacity', '1');
          return;
        }

        if (is_stat_fill(orig_fill)) {
          const elem_opacity = Number(r.dataset.orig_fill_opacity || r.dataset.orig_opacity || 1);
          const display_fill = blend_rgba_fill_on_table_base(orig_fill, elem_opacity);
          r.style.fill = display_fill;
          r.setAttribute('fill', display_fill);
          r.dataset.display_fill = display_fill;
          r.style.opacity = '1';
          r.setAttribute('opacity', '1');
          r.style.fillOpacity = '1';
          r.setAttribute('fill-opacity', '1');
          return;
        }

        if (!is_dark) {
          if (orig_fill) {
            r.style.fill = orig_fill;
            r.setAttribute('fill', orig_fill);
          } else {
            r.style.removeProperty('fill');
            r.removeAttribute('fill');
          }

          if (r.dataset.orig_stroke) {
            r.style.stroke = r.dataset.orig_stroke;
            r.setAttribute('stroke', r.dataset.orig_stroke);
          } else {
            r.style.removeProperty('stroke');
            r.removeAttribute('stroke');
          }

          if (r.dataset.orig_stroke_width) {
            r.style.strokeWidth = r.dataset.orig_stroke_width;
            r.setAttribute('stroke-width', r.dataset.orig_stroke_width);
          } else {
            r.style.removeProperty('stroke-width');
            r.removeAttribute('stroke-width');
          }

          return;
        }

        if (!parsed || parsed.a === 0) return;

        const is_light_body = is_close_rgb(parsed, 235, 240, 248, 10);
        const is_light_header = is_close_rgb(parsed, 205, 215, 230, 10);
        const is_light_year_header = is_close_rgb(parsed, 35, 85, 210, 16) && parsed.a > 0 && parsed.a < 0.5;

        if (is_light_body) {
          r.style.fill = '#3b424b';
          r.setAttribute('fill', '#3b424b');
          return;
        }

        if (is_light_header) {
          r.style.fill = '#272c33';
          r.setAttribute('fill', '#272c33');
          return;
        }

        if (is_light_year_header) {
          r.style.fill = 'rgba(35, 85, 210,0.35)';
          r.setAttribute('fill', 'rgba(35, 85, 210,0.35)');
          return;
        }

        r.style.fill = orig_fill;
        r.setAttribute('fill', orig_fill);
      });
    });

    const all_texts = Array.from(plot.querySelectorAll('text'));

    all_texts.forEach(t => {
      if (t.dataset.orig_fill === undefined) {
        t.dataset.orig_fill = t.style.fill || t.getAttribute('fill') || '';
      }

      const orig_fill = t.dataset.orig_fill || '';

      if (t.closest('g.table')) {
        if (replace_team_table_text_with_logo(t)) {
          return;
        }

        restore_team_table_text_if_needed(t);

        const cell_fill = get_table_text_cell_fill(t);
        const use_white = should_use_white_table_text(t, cell_fill);
        const use_gold_black = should_use_black_bold_gold_text(t, cell_fill);
        const css_text_fill = get_table_default_text_fill();

        if (use_gold_black) {
          apply_table_text_style(t, {
            fill: '#000000',
            // font_weight: '700',
          });
          return;
        }

        if (use_white) {
          apply_table_text_style(t, {
            fill: '#fff',
            font_weight: '',
          });
          return;
        }

        if (is_dark) {
          apply_table_text_style(t, {
            fill: css_text_fill,
            font_weight: '',
          });
          return;
        }

        if (orig_fill) {
          apply_table_text_style(t, {
            fill: orig_fill,
            font_weight: '',
          });
        } else {
          apply_table_text_style(t, {
            fill: css_text_fill,
            font_weight: '',
          });
        }
        return;
      }

      if (t.closest('g.scatterlayer')) {
        return;
      }

      if (!is_dark) {
        if (orig_fill) {
          t.style.fill = orig_fill;
          t.setAttribute('fill', orig_fill);
        } else {
          t.style.removeProperty('fill');
          t.removeAttribute('fill');
        }
        return;
      }

      if (is_dark_text_fill(orig_fill)) {
        t.style.fill = get_table_default_text_fill();
        t.setAttribute('fill', get_table_default_text_fill());
      } else if (orig_fill) {
        t.style.fill = orig_fill;
        t.setAttribute('fill', orig_fill);
      } else {
        t.style.removeProperty('fill');
        t.removeAttribute('fill');
      }
    });

    repaint_gold_plot_bars(plot, is_dark);
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
  set_soft_theme(read_soft_theme());

function set_sidebar_hidden(hidden) {
  if (!sidebar) return;

  sidebar.classList.toggle('hidden', hidden);
  document.body.classList.toggle('sidebar_hidden', hidden);

  if (toggle_sidebar_btn) {
    toggle_sidebar_btn.textContent = '☰ Sidebar';
    toggle_sidebar_btn.classList.toggle('sidebar_is_hidden', hidden);
    toggle_sidebar_btn.setAttribute(
      'aria-label',
      hidden ? 'Show sidebar' : 'Hide sidebar'
    );
    toggle_sidebar_btn.title = hidden ? 'Show sidebar' : 'Hide sidebar';
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
load_sidebar_team_logos().then(() => {
  add_wbc_sidebar_player_logos(document);
  add_top_prospect_sidebar_player_logos(document);
  sync_mapped_sidebar_team_ribbon('.division_block[data-division="top_100_prospects"]', ['top_100_prospects', 'top_prospects']);
  sync_mapped_sidebar_team_ribbon('.division_block[data-division="top_prospects"]', ['top_100_prospects', 'top_prospects']);
  refresh_custom_player_lists_ui();
});

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
const matchups_ownership_cache = new Map();
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
function append_matchup_team_logo(td, team) {
  const t = normalize_matchups_team_code(team);

  if (!t) {
    td.textContent = String(team || '').trim() || '—';
    return;
  }

  td.textContent = '';
  td.classList.add('matchups_team_logo_cell');
  td.innerHTML = team_logo_html(t);

  const text = document.createElement('span');
  text.className = 'matchups_team_logo_text';
  text.textContent = t;
  td.appendChild(text);
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

    if (v && typeof v === 'object') {
      o.value = v.value;
      o.textContent = v.label;
    } else {
      o.value = v;
      o.textContent = ui_name(v);
    }

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

function unique_player_names(arr) {
  const out = [];
  const seen = new Set();

  (arr || []).forEach(v => {
    const s = String(v || '').trim();
    const k = normalize_matchup_person_key(s);
    if (!s || seen.has(k)) return;

    seen.add(k);
    out.push(s);
  });

  return out;
}
//#################
function flat_names_from_groups(groups, flat) {
  const out = [];

  (groups || []).forEach(g => {
    (g.options || []).forEach(v => out.push(String(v || '').trim()));
  });

  (flat || []).forEach(v => out.push(String(v || '').trim()));

  return unique_player_names(out.filter(Boolean));
}
//#################
function current_player_input_options(input) {
  try {
    return JSON.parse(input.dataset.player_options || '[]');
  } catch (e) {
    return [];
  }
}
//#################
function set_player_input_options(input, groups, flat, placeholder) {
  if (!input) return;

  const opts = flat_names_from_groups(groups, flat);
  const list_id = input.getAttribute('list') || `${input.id}_list`;

  let dl = document.getElementById(list_id);
  if (!dl) {
    dl = document.createElement('datalist');
    dl.id = list_id;
    document.body.appendChild(dl);
  }

  dl.innerHTML = '';

  opts.forEach(v => {
    const o = document.createElement('option');
    o.value = v;
    dl.appendChild(o);
  });

  input.setAttribute('list', list_id);
  input.placeholder = placeholder || '';
  input.dataset.player_options = JSON.stringify(opts);

  sync_select_placeholder_class(input);
}
//#################
function make_player_input(id, label_text) {
  const wrap = document.createElement('div');
  wrap.className = 'matchups_row';

  const label = document.createElement('div');
  label.textContent = label_text;
  label.className = 'matchups_label';

  const input = document.createElement('input');
  input.id = id;
  input.type = 'text';
  input.dataset.field = String(id || '').replace(/^matchups_/, '');
  input.className = 'matchups_select matchups_player_input';
  input.autocomplete = 'off';

  const msg = document.createElement('span');
  msg.className = 'matchups_validation_msg';
  msg.textContent = '';

  input.addEventListener('input', () => sync_select_placeholder_class(input));
  input.addEventListener('change', () => sync_select_placeholder_class(input));

  wrap.appendChild(label);
  wrap.appendChild(input);
  wrap.appendChild(msg);

  return { wrap, sel: input, msg };
}
//#################
function canonical_player_name(raw, names) {
  const wanted = normalize_matchup_person_key(raw);
  if (!wanted) return '';

  return (names || []).find(n => normalize_matchup_person_key(n) === wanted) || '';
}
//#################
function set_player_validation_msg(input, text) {
  const msg = input?.closest('.matchups_row')?.querySelector('.matchups_validation_msg');
  if (!msg) return;

  const has_error = !!String(text || '').trim();

  msg.textContent = text || '';
  input.classList.toggle('is_invalid', has_error);
}
//#################
function validate_player_input(input, full_names, eligible_names) {
  if (!input) return true;

  const raw = String(input.value || '').trim();
  if (!raw) {
    set_player_validation_msg(input, '');
    return true;
  }

  const full_match = canonical_player_name(raw, full_names);
  const eligible_match = canonical_player_name(raw, eligible_names);

  if (!full_match) {
    set_player_validation_msg(input, 'Not in list');
    return false;
  }

  if (!eligible_match) {
    set_player_validation_msg(input, 'Below sample threshold');
    return false;
  }

  if (raw !== eligible_match) {
    input.value = eligible_match;
  }

  set_player_validation_msg(input, '');
  return true;
}
//#################
function attach_player_validation(input, full_names_fn, eligible_names_fn) {
  function run_validation() {
    const full_names = typeof full_names_fn === 'function' ? full_names_fn() : [];
    const eligible_names = typeof eligible_names_fn === 'function' ? eligible_names_fn() : [];

    validate_player_input(input, full_names, eligible_names);
  }

  input.addEventListener('input', run_validation);
  input.addEventListener('change', run_validation);
  input.addEventListener('blur', run_validation);
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
//#################################################################### Fantasy ownership ####################################################################
function matchup_fantasy_sections(data, section_names) {
  const scopes = ['majors', 'minors', 'spring', 'playoffs'];
  const rows = [];

  scopes.forEach(scope => {
    const root = data?.[scope];
    if (!root || typeof root !== 'object') return;

    for (const section_name of section_names) {
      const section = root[section_name];

      if (Array.isArray(section)) {
        rows.push(...section);
        break;
      }

      if (section && Array.isArray(section.rows)) {
        rows.push(...section.rows);
        break;
      }

      if (section && Array.isArray(section.data)) {
        rows.push(...section.data);
        break;
      }
    }
  });

  return rows;
}
//#################
function matchup_fantasy_ownership_raw(rec) {
  if (!rec || typeof rec !== 'object') return null;

  const keys = [
    'Own%',
    'Own',
    'Ownership%',
    'Ownership',
    'own_pct',
    'ownership_pct'
  ];

  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(rec, key)) continue;

    const value = rec[key];

    if (value != null && String(value).trim() !== '') {
      return value;
    }
  }

  return null;
}
//#################
function matchup_fantasy_player_name(rec) {
  if (!rec || typeof rec !== 'object') return '';

  return String(
    rec.Name ||
    rec.name ||
    rec.Player ||
    rec.player ||
    rec.PlayerName ||
    rec.player_name ||
    ''
  ).trim();
}
//#################
function add_matchup_ownership_rows(target, rows) {
  (rows || []).forEach(rec => {
    const name = matchup_fantasy_player_name(rec);
    const own = matchup_fantasy_ownership_raw(rec);
    const key = normalize_matchup_person_key(name);

    if (!key || own == null || target.has(key)) return;

    target.set(key, own);
  });
}
//#################
async function load_matchups_ownership_lookup(year) {
  const y = String(year || '').trim();
  if (!y) return null;

  if (matchups_ownership_cache.has(y)) {
    return matchups_ownership_cache.get(y);
  }

  const promise = (async () => {
    try {
      const r = await fetch(`assets/fantasy_${encodeURIComponent(y)}.json`, {
        cache: 'no-store'
      });

      if (!r.ok) return null;

      const data = await r.json();

      const lookup = {
        hitters: new Map(),
        starters: new Map(),
        relievers: new Map()
      };

      add_matchup_ownership_rows(
        lookup.hitters,
        matchup_fantasy_sections(data, ['hitters', 'batters'])
      );

      add_matchup_ownership_rows(
        lookup.starters,
        matchup_fantasy_sections(data, ['sp', 'starters'])
      );

      add_matchup_ownership_rows(
        lookup.relievers,
        matchup_fantasy_sections(data, ['rp', 'relievers'])
      );

      return lookup;
    } catch (e) {
      dbg('fantasy ownership load error', {
        year: y,
        error: e
      });

      return null;
    }
  })();

  matchups_ownership_cache.set(y, promise);
  return promise;
}
//#################
function matchup_ownership_display(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '—';
  if (raw.endsWith('%')) return raw;

  const cleaned = raw.replace(/,/g, '');
  const match = cleaned.match(/-?(?:\d+(?:\.\d*)?|\.\d+)/);
  const n = match ? Number(match[0]) : NaN;

  if (!Number.isFinite(n)) return raw;

  return `${n.toFixed(1).replace(/\.0$/, '')}%`;
}
//#################
function matchup_ownership_player_name(header, row) {
  const cols = (header || []).map(h => String(h || '').trim());

  let idx = cols.indexOf('Hitter');
  if (idx < 0) idx = cols.indexOf('Pitcher');
  if (idx < 0) idx = cols.indexOf('Name');

  return idx >= 0 ? String(row[idx] || '').trim() : '';
}
//#################
function matchup_ownership_for_row(header, row, lookup, role) {
  if (!lookup) return '—';

  const player_name = matchup_ownership_player_name(header, row);
  const key = normalize_matchup_person_key(player_name);
  if (!key) return '—';

  const role_key = String(role || '').trim().toLowerCase();

  let map = null;

  if (role_key === 'hitters' || role_key === 'batters') {
    map = lookup.hitters;
  } else if (
    role_key === 'relievers' ||
    role_key === 'rp' ||
    role_key === 'bullpen'
  ) {
    map = lookup.relievers;
  } else {
    map = lookup.starters;
  }

  if (!(map instanceof Map) || !map.has(key)) return '—';

  return matchup_ownership_display(map.get(key));
}
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
//#################################################################### Matchups URL state ####################################################################
function encode_matchups_url_part(v) {
  return encodeURIComponent(String(v || '').trim());
}
//#################
function decode_matchups_url_part(v) {
  try {
    return decodeURIComponent(String(v || '').trim());
  } catch (e) {
    return String(v || '').trim();
  }
}
//#################
function get_matchups_hash_params() {
  const hash = String(window.location.hash || '');
  const q_idx = hash.indexOf('?');
  if (q_idx < 0) return new URLSearchParams();

  return new URLSearchParams(hash.slice(q_idx + 1));
}
//#################
function set_matchups_hash_params(params, push_history = false) {
  const qs = params.toString();
  const next_hash = qs ? `#matchups?${qs}` : '#matchups';

  if (window.location.hash === next_hash) return;

  if (push_history) {
    history.pushState(null, '', next_hash);
  } else {
    history.replaceState(null, '', next_hash);
  }
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
  const initial_matchups_params = get_matchups_hash_params();
  const multi_form_state = {
    specific_starting_pitchers: { n: 1, rows: [] }, // [{ pitcher, side, team }]
    specific_hitters: { n: 1, rows: [] },  // [{ hitter, side, pitcher }]
    todays_fantasy_lineup: { n: 1, rows: [] }, // [{ hitter }]
    weekly_fantasy_hitter_moves: { n: 1, rows: [] },  // [{ hitter }]
    weekly_starting_pitcher_moves: { n: 1, rows: [] }, // [{ pitcher }]
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
      mode !== 'specific_starting_pitchers' &&
      mode !== 'specific_hitters' &&
      mode !== 'todays_fantasy_lineup' &&
      mode !== 'weekly_fantasy_hitter_moves' &&
      mode !== 'weekly_starting_pitcher_moves'
    ) return;

    const st = multi_form_state[mode];
    const n = clamp_rows_n(st.n);

    const out = [];
    for (let i = 0; i < n; i++) {
      if (mode === 'specific_starting_pitchers') {
        const p = document.getElementById(`matchups_pitcher_${i}`)?.value || '';
        const s = document.getElementById(`matchups_side_${i}`)?.value || '';
        const t = document.getElementById(`matchups_team_${i}`)?.value || '';
        out.push({ pitcher: p, side: s, team: t });
      } else if (mode === 'specific_hitters') {
        const h = document.getElementById(`matchups_hitter_${i}`)?.value || '';
        const s = document.getElementById(`matchups_side_${i}`)?.value || '';
        const p = document.getElementById(`matchups_pitcher_${i}`)?.value || '';
        out.push({ hitter: h, side: s, pitcher: p });
      } else if (mode === 'weekly_starting_pitcher_moves') {
        const p = document.getElementById(`matchups_pitcher_${i}`)?.value || '';
        out.push({ pitcher: p });
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
    ['todays_favorited_players', "Project Today's Favorited Players"],
    ['gameday_matchup', 'Gameday Matchup Preview'],
    ['projected_pitchers', 'Projected Starting Pitchers'],
    ['best_and_worst_hitters', 'Projected Best and Worst Hitters'],
    ['todays_fantasy_lineup', "Project Today's Fantasy Lineup"],
    ['weekly_fantasy_hitter_moves', "Project Weekly Fantasy Hitter Moves"],
    ['weekly_starting_pitcher_moves', "Project Weekly Starting Pitcher Moves"],
    ['specific_starting_pitchers', 'Specific Starting Pitcher Matchups'],
    ['reliever_inning', 'Specific Reliever Inning Preview'],
    ['specific_hitters', 'Specific Hitter Matchups'],
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
  const url_mode = String(initial_matchups_params.get('mode') || '').trim();
  if (url_mode && modes.some(m => m[0] === url_mode)) {
    mode_select.value = url_mode;
  }
  mode_root.appendChild(mode_bar);
  //#################
function clear_matchups_url_state() {
  const params = new URLSearchParams();
  params.set('mode', mode_select.value);
  set_matchups_hash_params(params, true);
}
  //#################
function write_matchups_url_state(extra_params) {
  const params = new URLSearchParams();

  params.set('mode', mode_select.value);

  const year_val = String(document.getElementById('matchups_year')?.value || '').trim();
  if (year_val) params.set('year', year_val);

  Object.entries(extra_params || {}).forEach(([k, v]) => {
    const val = String(v || '').trim();
    if (val) params.set(k, val);
  });

  set_matchups_hash_params(params, true);
}
//#################
function should_auto_submit_matchups_mode(mode_name) {
  return String(initial_matchups_params.get('mode') || '').trim() === String(mode_name || '').trim();
}
  //#################
  function sync_row_controls() {
    const mode = mode_select.value;
    const is_multi = (
      mode === 'specific_starting_pitchers' ||
      mode === 'specific_hitters' ||
      mode === 'todays_fantasy_lineup' ||
      mode === 'weekly_fantasy_hitter_moves' ||
      mode === 'weekly_starting_pitcher_moves'
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
    mode !== 'specific_starting_pitchers' &&
    mode !== 'specific_hitters' &&
    mode !== 'todays_fantasy_lineup' &&
    mode !== 'weekly_fantasy_hitter_moves' &&
    mode !== 'weekly_starting_pitcher_moves'
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
    mode !== 'specific_starting_pitchers' &&
    mode !== 'specific_hitters' &&
    mode !== 'todays_fantasy_lineup' &&
    mode !== 'weekly_fantasy_hitter_moves' &&
    mode !== 'weekly_starting_pitcher_moves'
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
  function matchup_display_header(h) {
    const s = String(h || '').trim();

    const display_map = {
      '+All': 'Pitches +/-',
      '+FB': 'FB +/-',
      '+SI': 'SI +/-',
      '+CT': 'CT +/-',
      '+SL': 'SL +/-',
      '+SW': 'SW +/-',
      '+CB': 'CB +/-',
      '+CH': 'CH +/-',
      '+SP': 'SP +/-',
      '+KN': 'KN +/-',
      'Pts +/-': 'Consistency',
      'Days +/-': 'Consistency',
    };

    return display_map[s] || s;
  }
  //#################
  function matchup_col_width(header_text, options) {
    const mode_key = String(options?.mode_key || '').trim();
    const h = String(header_text || '').trim();

    if (mode_key !== 'gameday_matchup') return '';

    if (h === 'Pitcher' || h === 'Hitter' || h === 'Name') return '150px';
    if (h === 'IP' || h === 'PA') return '58px';
    if (h === 'Score' || h === '+All' || h === 'All' || h === 'RHP' || h === 'LHP' || h === 'RHB' || h === 'LHB') return '72px';
    if (h === 'Consistency' || h === 'Pts +/-' || h === 'Days +/-') return '128px';
    if (h === 'Away' || h === 'Opp' || h === 'Team') return '70px';

    if ([
      '+FB', '+SI', '+CT', '+SL', '+SW', '+CB', '+CH', '+SP', '+KN',
      'FB', 'SI', 'CT', 'SL', 'SW', 'CB', 'CH', 'SP', 'KN'
    ].includes(h)) return '72px';

    return '80px';
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
        const t = clamp(pa / 100, 0, 1);
        return 0.25 + 0.75 * (t ** 2);
      }
    }

    const idx_ip = header_index(header, 'IP');
    if (idx_ip >= 0) {
      const ip = parse_matchup_stat_number(row_cells[idx_ip]);
      if (Number.isFinite(ip)) {
        const thresh = options.invert_stats ? 15 : 30;
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
function parse_matchup_rgba(fill) {
  const s = String(fill || '').trim();

  let m = s.match(/^rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)$/i);
  if (m) {
    return {
      r: Number(m[1]),
      g: Number(m[2]),
      b: Number(m[3]),
      a: m[4] == null ? 1 : Number(m[4]),
    };
  }

  m = s.match(/^#([0-9a-f]{6})$/i);
  if (m) {
    const h = m[1];
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: 1,
    };
  }

  return null;
}
//#################
function matchup_table_base_rgb() {
  const is_dark = document.body.classList.contains('soft_theme');

  return is_dark
    ? { r: 48, g: 56, b: 64 }
    : { r: 255, g: 255, b: 255 };
}
//#################
// function matchup_heat_text_color(fill) {
//   const c = parse_matchup_rgba(fill);
//   if (!c || c.a === 0) return '';

//   const base = matchup_table_base_rgb();
//   const a = clamp(c.a == null ? 1 : c.a, 0, 1);

//   const mixed = {
//     r: (c.r * a) + (base.r * (1 - a)),
//     g: (c.g * a) + (base.g * (1 - a)),
//     b: (c.b * a) + (base.b * (1 - a)),
//   };

//   const lum = (0.2126 * mixed.r) + (0.7152 * mixed.g) + (0.0722 * mixed.b);

//   return lum < 145 ? '#ffffff' : '#000000';
// }
function matchup_heat_text_color(fill) {
  const c = parse_matchup_rgba(fill);
  if (!c || c.a === 0) return '';

  const gold_like = (
    c.r >= 180 &&
    c.g >= 125 &&
    c.b <= 95 &&
    (c.r - c.b >= 65) &&
    (c.g - c.b >= 30)
  );

  return gold_like ? '#000000' : '#ffffff';
}
  //#################
// function rgba_from_two_sided_value(v, worst, neutral_lo, neutral_hi, best, alpha_mult = 1) {
//   const val = Number(v);
//   if (!Number.isFinite(val)) return '';

//   const lo = Math.min(worst, best);
//   const hi = Math.max(worst, best);
//   const vv = clamp(val, lo, hi);

//   const nlo = Math.min(neutral_lo, neutral_hi);
//   const nhi = Math.max(neutral_lo, neutral_hi);

//   if (vv >= nlo && vv <= nhi) return '';

//   const frac = (vv - worst) / (best - worst);
//   const f = clamp(frac, 0, 1);

//   const alpha_min = 0.25;
//   const alpha_max = 0.95;
//   const alpha_curve_pow = 0.40;

//   const d = clamp(Math.abs(f - 0.5) * 2.0, 0, 1);
//   let a = alpha_min + (alpha_max - alpha_min) * Math.pow(d, alpha_curve_pow);
//   a = clamp(a * Number(alpha_mult || 1), 0, 1);

//   if (f > 0.5) return `rgba(210, 35, 35,${a.toFixed(3)})`;

//   return `rgba(35, 85, 210,${a.toFixed(3)})`;
// }
function rgba_from_two_sided_value(v, worst, neutral_lo, neutral_hi, best, alpha_mult = 1) {
  const val = Number(v);
  if (!Number.isFinite(val)) return '';

  const lo = Math.min(worst, best);
  const hi = Math.max(worst, best);
  const vv = clamp(val, lo, hi);

  const nlo = Math.min(neutral_lo, neutral_hi);
  const nhi = Math.max(neutral_lo, neutral_hi);

  if (vv >= nlo && vv <= nhi) return '';

  let f;

  if (vv < nlo) {
    const frac = (vv - worst) / (nlo - worst);
    f = 0.5 * clamp(frac, 0, 1);
  } else {
    const frac = (vv - nhi) / (best - nhi);
    f = 0.5 + (0.5 * clamp(frac, 0, 1));
  }

  const alpha_min = 0.25;
  const alpha_max = 0.95;
  const alpha_curve_pow = 0.40;

  const d = clamp(Math.abs(f - 0.5) * 2.0, 0, 1);
  const strength = clamp(
    (alpha_min + (alpha_max - alpha_min) * Math.pow(d, alpha_curve_pow)) * Number(alpha_mult || 1),
    0,
    1
  );

  const color = f > 0.5
    ? { r: 210, g: 35, b: 35 }
    : { r: 35, g: 85, b: 210 };

  const fade_target = { r: 245, g: 247, b: 250 };

  const mixed = {
    r: Math.round((color.r * strength) + (fade_target.r * (1 - strength))),
    g: Math.round((color.g * strength) + (fade_target.g * (1 - strength))),
    b: Math.round((color.b * strength) + (fade_target.b * (1 - strength))),
  };

  return `rgb(${mixed.r},${mixed.g},${mixed.b})`;
}
  //#################
// function gold_gradient_fill(alpha_mult = 1) {
//   const a = clamp(Number(alpha_mult || 1), 0, 1);

//   // return `linear-gradient(
//   //   90deg,
//   //   rgba(249,242,149,${a.toFixed(3)}) 0%,
//   //   rgba(224,170,62,${a.toFixed(3)}) 33%,
//   //   rgba(250,243,152,${a.toFixed(3)}) 66%,
//   //   rgba(184,138,68,${a.toFixed(3)}) 100%
//   // )`;
// return `linear-gradient(
//   90deg,
//   rgba(249,242,149,${a.toFixed(3)}) 0%,
//   rgba(224,170,62,${a.toFixed(3)}) 100%
// )`;
// }
function gold_gradient_fill(alpha_mult = 1) {
  const strength = clamp(Number(alpha_mult || 1), 0, 1);
  const fade_target = { r: 245, g: 247, b: 250 };

  function mix(c) {
    return {
      r: Math.round((c.r * strength) + (fade_target.r * (1 - strength))),
      g: Math.round((c.g * strength) + (fade_target.g * (1 - strength))),
      b: Math.round((c.b * strength) + (fade_target.b * (1 - strength))),
    };
  }

  const c1 = mix({ r: 249, g: 242, b: 149 });
  const c2 = mix({ r: 224, g: 170, b: 62 });

  return `linear-gradient(
    90deg,
    rgb(${c1.r},${c1.g},${c1.b}) 0%,
    rgb(${c2.r},${c2.g},${c2.b}) 100%
  )`;
}
  //#################
function matchup_gold_threshold(header_text, gold_mode) { //makes stuff gold based on pitcher and hitter thresholds
  const h = String(header_text || '').trim();
  const mode = String(gold_mode || '').trim();

  const is_hitter_mode = mode === 'hitter';
  const is_pitcher_mode = !is_hitter_mode;

  if (h === 'Score' || h === '+All' || h === 'All' || h === 'RHP' || h === 'LHP' || h === 'RHB' || h === 'LHB') {
    return is_hitter_mode ? 100 : 50;
  }

  if ([
    '+FB', '+SI', '+CT', '+SL', '+SW', '+CB', '+CH', '+SP', '+KN',
    'FB', 'SI', 'CT', 'SL', 'SW', 'CB', 'CH', 'SP', 'KN'
  ].includes(h)) {
    return is_hitter_mode ? 100 : 70;
  }

  return Infinity;
}
  //#################
  function is_matchup_stat_col(header_text) {
    const h = String(header_text || '').trim();
    return h.startsWith('+') || h === 'Score';
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
    return ['All', 'RHB', 'LHB', 'RHP', 'LHP', 'FB', 'SI', 'CT', 'SL', 'SW', 'CB', 'CH', 'SP'].includes(h);
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
let matchup_sidebar_link_cache = null;

//#################
function matchup_role_to_page_role(role) {
  const r = String(role || '').trim().toLowerCase();

  if (r === 'sp' || r === 'starter' || r === 'starters') return 'starters';
  if (r === 'rp' || r === 'reliever' || r === 'relievers' || r === 'bullpen') return 'bullpen';
  return 'batters';
}
//#################
function matchup_sidebar_link_cache_key(name_or_person_key, role) {
  const nm = normalize_matchup_person_key(name_or_person_key);
  const rr = matchup_role_to_page_role(role);
  if (!nm || !rr) return '';
  return `${nm}||${rr}`;
}
//#################
function build_matchup_sidebar_link_cache() {
  const cache = new Map();
  const links = Array.from(document.querySelectorAll('.toc_link'));

  links.forEach(link => {
    const text_name = String(link.textContent || '').trim();
    const person_key = String(link.getAttribute('data-person_key') || '').trim();
    const data_role = String(link.getAttribute('data-role') || '').trim();
    const data_page = String(link.getAttribute('data-page') || '').trim();
    const href = String(link.getAttribute('href') || '').trim();

    const role = matchup_role_to_page_role(data_role);

    const key =
      matchup_sidebar_link_cache_key(person_key, role) ||
      matchup_sidebar_link_cache_key(text_name, role);

    if (!key) return;

    cache.set(key, {
      href,
      data_page,
      role,
      data_role,
      person_key
    });
  });

  return cache;
}
//#################
function ensure_matchup_sidebar_link_cache() {
  if (matchup_sidebar_link_cache instanceof Map) return matchup_sidebar_link_cache;

  matchup_sidebar_link_cache = build_matchup_sidebar_link_cache();
  return matchup_sidebar_link_cache;
}
//#################
function clear_matchup_sidebar_link_cache() {
  matchup_sidebar_link_cache = null;
}
//#################
function matchup_find_sidebar_link_data(name, role) {
  const cache = ensure_matchup_sidebar_link_cache();

  const direct_key = matchup_sidebar_link_cache_key(name, role);
  if (direct_key && cache.has(direct_key)) {
    return cache.get(direct_key);
  }

  return null;
}
//#################
function resolve_matchup_player_href(name, role, year) {
  const rec = matchup_find_sidebar_link_data(name, role);
  if (!rec) return '';

  if (rec.href && rec.href !== '#') {
    return rec.href;
  }

  const page = String(rec.data_page || '').trim();
  if (!page) return '';

  const y = String(year || '').trim();
  if (y) {
    return `#${encodeURIComponent(page)}?year=${encodeURIComponent(y)}`;
  }

  return `#${encodeURIComponent(page)}`;
}
//#################
function matchup_name_col_indices(header) {
  const cols = (header || []).map(x => String(x || '').trim());

  return {
    name: cols.findIndex(x => x === 'Name'),
    pitcher: cols.findIndex(x => x === 'Pitcher'),
    hitter: cols.findIndex(x => x === 'Hitter')
  };
}
//#################
function infer_matchup_link_roles(header, explicit_role, explicit_pitcher_role) {
  const forced_name_role = String(explicit_role || '').trim();
  const forced_pitcher_role = matchup_role_to_page_role(explicit_pitcher_role || 'starters');

  const cols = new Set((header || []).map(x => String(x || '').trim()));

  const out = {
    name_role: '',
    hitter_role: 'batters',
    pitcher_role: forced_pitcher_role || 'starters'
  };

  if (cols.has('Name')) {
    if (forced_name_role) {
      out.name_role = matchup_role_to_page_role(forced_name_role);
    } else if (cols.has('IP') && !cols.has('PA')) {
      out.name_role = forced_pitcher_role || 'starters';
    } else {
      out.name_role = 'batters';
    }
  }

  return out;
}
  //#################
  function matchup_player_role_for_cell(header, col_idx, row_idx, link_roles, row_pitcher_link_roles) {
    const idxs = matchup_name_col_indices(header);
    const roles = (link_roles && typeof link_roles === 'object') ? link_roles : {};

    if (col_idx === idxs.hitter) {
      return 'batters';
    }

    if (col_idx === idxs.pitcher) {
      const row_roles = Array.isArray(row_pitcher_link_roles) ? row_pitcher_link_roles : [];

      return matchup_role_to_page_role(
        row_roles[row_idx] || roles.pitcher_role || 'starters'
      );
    }

    if (col_idx === idxs.name) {
      return matchup_role_to_page_role(roles.name_role || '');
    }

    return '';
  }
  //#################
  function append_matchup_player_link(td, raw_text, role, link_year) {
    if (!role) {
      td.textContent = raw_text;
      return;
    }

    const href = resolve_matchup_player_href(raw_text, role, link_year);

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
  function append_matchup_streak_emoji(td, raw_text, role, lookup) {
    if (!td || !raw_text || !role || !lookup) return;

    const rec = matchup_find_sidebar_link_data(raw_text, role);
    if (!rec) return;

    const person_key = String(rec.person_key || '').trim();
    const streak_role = String(rec.data_role || rec.role || role).trim();

    if (!person_key || !streak_role) return;

    const stat_vals = get_sidebar_fval_from_lookup(
      lookup,
      person_key,
      streak_role
    );

    const emoji = sidebar_streak_emoji_for_vals(stat_vals, streak_role);
    if (!emoji) return;

    const span = document.createElement('span');
    span.className = 'matchups_streak_emoji';
    span.textContent = emoji;
    span.title = emoji === '🔥' ? 'Hot streak' : 'Cold streak';

    td.appendChild(document.createTextNode(' '));
    td.appendChild(span);
  }
  //#################
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

    const rows = [];
    let header = null;

    const link_year = String(
      options.link_year ||
      document.getElementById('matchups_year')?.value ||
      window.DEFAULT_SEASON_YEAR ||
      ''
    ).trim();

    let matchup_streak_lookup = null;

    try {
      const streak_year = String(
        link_year ||
        window.DEFAULT_SEASON_YEAR ||
        new Date().getFullYear()
      );

      matchup_streak_lookup = await sidebar_fval_lookup_for_year(streak_year);
    } catch (e) {
      matchup_streak_lookup = null;
    }

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

    const resolved_link_roles = infer_matchup_link_roles(
      header,
      options.link_role,
      options.pitcher_link_role
    );

    const row_pitcher_link_roles = Array.isArray(options.row_pitcher_link_roles)
      ? options.row_pitcher_link_roles
      : [];
    const gold_mode = String(options.gold_mode || '').trim();

    // Remove Park / ParkFactor columns and hide empty pitch columns
    const drop_cols = new Set(['Year', 'Throws', 'Bats', 'Park', 'ParkFactor', ...requested_drop_cols]);

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
    function consistency_key_for_table() {
      const cols = new Set(header.map(h => String(h || '').trim()));

      if (cols.has('Pts +/-')) return 'Pts +/-';
      if (cols.has('Days +/-')) return 'Days +/-';

      if (cols.has('Hitter')) return 'Pts +/-';
      if (cols.has('Pitcher') && !cols.has('Hitter')) return 'Days +/-';

      if (cols.has('Name') && cols.has('PA')) return 'Pts +/-';
      if (cols.has('Name') && cols.has('IP')) return 'Days +/-';

      return '';
    }
    //#################
    function consistency_col_idx() {
      return header.findIndex(h => {
        const hh = String(h || '').trim();
        return hh === 'Pts +/-' || hh === 'Days +/-' || hh === 'Consistency';
      });
    }
    //#################
    function row_name_for_consistency(r, key) {
      const cols = header.map(h => String(h || '').trim());

      let idx = -1;
      if (key === 'Pts +/-') {
        idx = cols.indexOf('Hitter');
        if (idx < 0) idx = cols.indexOf('Name');
      } else if (key === 'Days +/-') {
        idx = cols.indexOf('Pitcher');
        if (idx < 0) idx = cols.indexOf('Name');
      }

      return idx >= 0 ? String(r[idx] || '').trim() : '';
    }
    //#################
    function consistency_year_pack() {
      const by_year = (matchups_lists && matchups_lists.by_year && typeof matchups_lists.by_year === 'object')
        ? matchups_lists.by_year
        : {};

      const candidates = [
        link_year,
        document.getElementById('matchups_year')?.value,
        window.DEFAULT_SEASON_YEAR
      ].map(x => String(x || '').trim()).filter(Boolean);

      for (const y of candidates) {
        const pack = by_year[y];
        if (pack && typeof pack === 'object') return pack;
      }

      const ys = Object.keys(by_year).sort((a, b) => Number(b) - Number(a));
      return ys.length ? by_year[ys[0]] : {};
    }
    //#################
    function consistency_rec_for_row(r, key) {
      const nm = row_name_for_consistency(r, key);
      if (!nm) return null;

      const pack = consistency_year_pack();

      if (key === 'Pts +/-') {
        return fallback_rec_for_name(pack.fallback_hitter_all, nm);
      }

      if (key === 'Days +/-') {
        return fallback_rec_for_name(pack.fallback_pitcher_all, nm);
      }

      return null;
    }

    const consistency_key = consistency_key_for_table();

    if (consistency_key) {
      let c_idx = consistency_col_idx();

      if (c_idx < 0) {
        header.push(consistency_key);
        rows.forEach(r => r.push('—'));
        c_idx = header.length - 1;
      }

      rows.forEach(r => {
        const raw_cur = String(r[c_idx] || '').trim();
        if (raw_cur && raw_cur !== '—') return;

        const rec = consistency_rec_for_row(r, consistency_key);

        const streak_key = consistency_key === 'Pts +/-' ? 'S Pts +/-' : 'S Days +/-';
        const streak_key_alt = consistency_key === 'Pts +/-' ? 'S Pts+/-' : 'S Days+/-';

        const v =
          rec && rec[streak_key] != null && String(rec[streak_key]).trim() !== '' ? rec[streak_key] :
          rec && rec[streak_key_alt] != null && String(rec[streak_key_alt]).trim() !== '' ? rec[streak_key_alt] :
          rec ? rec[consistency_key] : null;

        r[c_idx] = (v == null || String(v).trim() === '') ? '—' : String(v);
      });

    const anchors = ['+All', 'All', 'RHP', 'RHB', 'LHP', 'LHB'];
    let anchor_idx = -1;

    header.forEach((h, i) => {
      if (anchors.includes(String(h || '').trim())) anchor_idx = i;
    });

    if (anchor_idx >= 0 && c_idx !== anchor_idx + 1) {
      const moved_header = header.splice(c_idx, 1)[0];
      const insert_idx = c_idx < anchor_idx ? anchor_idx : anchor_idx + 1;
      header.splice(insert_idx, 0, moved_header);

      rows.forEach(r => {
        const moved_cell = r.splice(c_idx, 1)[0];
        r.splice(insert_idx, 0, moved_cell);
      });
    }

    const score_idx = header.findIndex(h => String(h || '').trim() === 'Score');
    const all_idx = header.findIndex(h => String(h || '').trim() === '+All');

    if (score_idx >= 0 && all_idx >= 0 && score_idx !== all_idx - 1) {
      const moved_header = header.splice(score_idx, 1)[0];
      const insert_idx = score_idx < all_idx ? all_idx - 1 : all_idx;
      header.splice(insert_idx, 0, moved_header);

      rows.forEach(r => {
        const moved_cell = r.splice(score_idx, 1)[0];
        r.splice(insert_idx, 0, moved_cell);
      });
    }
    }
    //#################
    function decimals_in_raw(raw) {
      const s = String(raw || '').trim();
      const m = s.match(/-?(?:\d+)(?:\.(\d+))?/);
      if (!m) return null;
      return m[1] ? m[1].length : 0;
    }
    if (options.include_ownership) {
      const ownership_year = String(
        options.ownership_year ||
        link_year ||
        window.DEFAULT_SEASON_YEAR ||
        ''
      ).trim();

      const ownership_lookup = await load_matchups_ownership_lookup(
        ownership_year
      );

      let ownership_idx = header.findIndex(h => {
        return String(h || '').trim() === 'Own%';
      });

      if (ownership_idx < 0) {
        header.push('Own%');
        ownership_idx = header.length - 1;

        rows.forEach(r => {
          r.push(
            matchup_ownership_for_row(
              header,
              r,
              ownership_lookup,
              options.ownership_role
            )
          );
        });
      } else {
        rows.forEach(r => {
          r[ownership_idx] = matchup_ownership_for_row(
            header,
            r,
            ownership_lookup,
            options.ownership_role
          );
        });
      }
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
    //gameday columns lining up
    const use_gameday_col_widths = String(options.mode_key || '').trim() === 'gameday_matchup';

    if (use_gameday_col_widths) {
      table.classList.add('gameday_matchup_table');

      const colgroup = document.createElement('colgroup');

      header.forEach(h => {
        const col = document.createElement('col');
        const w = matchup_col_width(h, options);
        if (w) col.style.width = w;
        colgroup.appendChild(col);
      });

      table.appendChild(colgroup);
    }
    //gameday columns above
    const thead = document.createElement('thead');
    const trh = document.createElement('tr');
    header.forEach(h => {
      const th = document.createElement('th');
      th.dataset.rawHeader = String(h || '').trim();
      if (String(h || '').trim() === 'Own%') {
        th.classList.add('matchups_ownership_col');
      }
      th.textContent = matchup_display_header(h);
      trh.appendChild(th);
    });
    thead.appendChild(trh);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    rows.forEach((r, row_idx) => {
      const tr = document.createElement('tr');
      tr.dataset.entryOrder = String(row_idx);

      const alpha_mult = row_sample_alpha_mult(header, r, options);
      // let is_gold_cell = false;

      r.forEach((cell, j) => {
        const td = document.createElement('td');
        let is_gold_cell = false;

        const raw = String(cell || '').trim();
        if (!raw) {
          td.textContent = '—';
          td.classList.add('cell_dash');
          tr.appendChild(td);
          return;
        }

const h = (header && header[j]) ? header[j] : '';
const h_clean = String(h || '').trim();
if (h_clean === 'Own%') {
  td.classList.add('matchups_ownership_col');
}

if (h_clean === 'Team' || h_clean === 'Opp') {
  append_matchup_team_logo(td, raw);
  tr.appendChild(td);
  return;
}

  const player_role = matchup_player_role_for_cell(
    header,
    j,
    row_idx,
    resolved_link_roles,
    row_pitcher_link_roles
  );

  append_matchup_player_link(
    td,
    raw,
    player_role,
    link_year
  );

  append_matchup_streak_emoji(
    td,
    raw,
    player_role,
    matchup_streak_lookup
  );

        if (is_matchup_stat_col(h)) {
          const v0 = parse_matchup_stat_number(raw);
          if (Number.isFinite(v0)) {
            const v = invert_stats ? -v0 : v0;

            if (invert_stats) {
              const txt = format_like_raw(raw, v);
              td.textContent = (v > 0 ? `+${txt}` : String(txt));
            }

            const is_all = ['+All', 'Score'].includes(String(h || '').trim());
            const worst = is_all ? -40 : -70;
            const best = is_all ? 40 : 70;
            const gold_at = matchup_gold_threshold(h, gold_mode);

            if (v >= gold_at) {
              td.style.background = gold_gradient_fill(alpha_mult);
              is_gold_cell = true;
            } else {
                const bg = rgba_from_two_sided_value(v, worst, -5, 5, best, alpha_mult);
                td.style.background = bg;

                const text_color = matchup_heat_text_color(bg);
                td.style.color = text_color;

                const a = td.querySelector('a');
                if (a) a.style.color = text_color;
            }
          }
        }

        if (is_fallback_heat_col(h)) {
          const v = parse_matchup_stat_number(raw);
          if (Number.isFinite(v)) {
            const is_allish = (h === 'All' || h === 'RHB' || h === 'LHB' || h === 'RHP' || h === 'LHP');
            const worst = is_allish ? -40 : -70;
            const best = is_allish ? 40 : 70;
            const neutral_lo = is_allish ? -5 : 0;
            const neutral_hi = 5;
            const gold_at = matchup_gold_threshold(h, gold_mode);

            if (v >= gold_at) {
              td.style.background = gold_gradient_fill(alpha_mult);
              is_gold_cell = true;
            } else {
              const bg = rgba_from_two_sided_value(v, worst, neutral_lo, neutral_hi, best, alpha_mult);
              td.style.background = bg;

              const text_color = matchup_heat_text_color(bg);
              td.style.color = text_color;

              const a = td.querySelector('a');
              if (a) a.style.color = text_color;
            }
          }
        }

        if (h === 'Pts +/-' || h === 'Days +/-' || h === 'Consistency') {
          const key = h === 'Consistency' ? consistency_key : h;
          const v = parse_matchup_stat_number(raw);

          if (Number.isFinite(v)) {
            td.textContent = `${display_stat(v * 100, 1)}%`;

            const gold_at = key === 'Pts +/-' ? 0.35 : 0.50;

            if (v >= gold_at) {
              td.style.background = gold_gradient_fill(alpha_mult);
              is_gold_cell = true;
            } else {
              const bg = key === 'Pts +/-'
                ? rgba_from_two_sided_value(v, -0.20, 0.05, 0.10, 0.30, alpha_mult)
                : rgba_from_two_sided_value(v, -0.06, 0.14, 0.15, 0.50, alpha_mult);

              td.style.background = bg;

              const text_color = matchup_heat_text_color(bg);
              td.style.color = text_color;

              const a = td.querySelector('a');
              if (a) a.style.color = text_color;
            }
          }
        }
        
if (is_gold_cell) {
  const text_color = '#000000';

  td.style.color = text_color;
  // td.style.fontWeight = '700';

  const a = td.querySelector('a');
  if (a) {
    a.style.color = text_color;
    // a.style.fontWeight = '700';
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

    let idx_all = parts.header_cells.findIndex(h => String(h || '').trim() === 'Score');
    if (idx_all < 0) idx_all = parts.header_cells.findIndex(h => String(h || '').trim() === '+All');
    if (idx_all < 0) return NaN;

    return parse_matchup_stat_number(parts.row_cells[idx_all]);
  }
  //#################
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
          drop_cols: ['Year', 'Team', 'Opp', 'Away', 'Bats', 'Throws'],
          compact_table: true,
          mode_key: 'gameday_matchup',
          link_role: 'starters'
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
        dummy_rows: build_personalized_pitcher_fallback_dummy_rows(year_lists_obj, pitcher_name, year_val),
        link_role: 'starters'
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
function dummy_row_score_value(row) {
  if (!row || !Array.isArray(row.header_cells) || !Array.isArray(row.row_cells)) return NaN;

  const preferred_headers = ['All', 'RHP', 'LHP'];
  for (const label of preferred_headers) {
    const idx = row.header_cells.findIndex(h => String(h || '').trim() === label);
    if (idx >= 0) {
      const v = parse_matchup_stat_number(row.row_cells[idx]);
      if (Number.isFinite(v)) return v;
    }
  }

  return NaN;
}
  //#################
function sort_dummy_rows_by_all_desc(dummy_rows) {
  return (dummy_rows || []).slice().sort((a, b) => {
    const av = dummy_row_score_value(a);
    const bv = dummy_row_score_value(b);

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
  const pitcher_throw = String(
    (pitcher_rec && (pitcher_rec.Throws || pitcher_rec.throws)) || ''
  ).trim().toUpperCase();

  const rows = [];
  const pitch_union = new Set();

  let score_header = 'All';
  if (pitcher_throw === 'R') score_header = 'RHP';
  if (pitcher_throw === 'L') score_header = 'LHP';

  (hitters_list || []).forEach(hitter_name => {
    const rec = fallback_rec_for_name(hitter_map, hitter_name);
    if (!rec) {
      rows.push({
        name: String(hitter_name || ''),
        pa: '—',
        score: '—',
        year: '—',
        pitch_vals: {}
      });
      return;
    }

    const hitter_bat = String(rec.bats || '').trim().toUpperCase();
    const eff_side = effective_hitter_side(hitter_bat, pitcher_throw);
    const hitter_all_col = hitter_split_col_from_pitcher_throw(pitcher_throw);

    let score_val = NaN;
    let year_text = String(rec.year || '—').trim() || '—';
    let pitch_vals = {};

    const handed_score_val = finite_num(rec[hitter_all_col]);
    const can_use_handed_score = pitcher_throw && hitter_all_col && Number.isFinite(handed_score_val);

    if (can_use_handed_score) {
      score_val = handed_score_val;
    } else if (!pitcher_throw) {
      score_val = fallback_display_all(rec, current_year);
    } else {
      score_val = NaN;
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
      score: display_num(score_val),
      year: year_text,
      pitch_vals
    });
  });

  const pitch_headers = ['FB', 'SI', 'CT', 'SL', 'SW', 'CB', 'CH', 'SP'].filter(pt => pitch_union.has(pt));

  const header_cells = ['Name', 'PA', score_header, ...pitch_headers, 'Year', 'Pts +/-'];

  const dummy_rows = rows.map(r => ({
    header_cells: header_cells.slice(),
    row_cells: [
      r.name,
      r.pa,
      r.score,
      ...pitch_headers.map(pt => r.pitch_vals[pt] || '—'),
      r.year,
      String(fallback_rec_for_name(hitter_map, r.name)?.['Pts +/-'] || '—').trim() || '—'
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
        header_cells: ['Name', 'IP', 'All', 'RHB', 'LHB', 'Year', 'Days +/-'],
        row_cells: [String(pitcher_name || 'TBD'), '—', '—', '—', '—', '—', '—']
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
      header_cells: ['Name', 'IP', 'All', 'RHB', 'LHB', ...pitch_headers, 'Year', 'Days +/-'],
      row_cells: [
        String(pitcher_name || 'TBD'),
        display_ip(rec.IP),
        display_num(all_val),
        display_num(first_finite(rec, ['RHB', 'R', 'vs RHB'])),
        display_num(first_finite(rec, ['LHB', 'L', 'vs LHB'])),
        ...pitch_headers.map(pt => pitch_totals[pt] || '—'),
        String(rec.year || '—').trim() || '—',
        String(rec['Days +/-'] || '—').trim() || '—'
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
          drop_cols: ['Year', 'Team', 'Pitcher', 'Opp', 'Away', 'IP', 'Bats', 'Throws'],
          gold_mode: 'hitter',
          mode_key: 'gameday_matchup',
          link_role: 'batters'
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
      dummy_rows: fallback_dummy_rows,
      link_role: 'batters'
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

      const prev = results_root;
      results_root = mount;
      try {
        await render_fragments(paths || [], opts || null);
      } finally {
        results_root = prev;
      }
    }

    results_root = original_results_root;
  }
  let matchups_build_form_req_id = 0;
  //#################################################################### Form builder ####################################################################
  async function build_form() {
    const build_req_id = ++matchups_build_form_req_id;

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
    if (build_req_id !== matchups_build_form_req_id) return;
    if (!idx) return;

    const lists = await load_matchups_lists();
    if (build_req_id !== matchups_build_form_req_id) return;

    await load_matchups_rosters();
    if (build_req_id !== matchups_build_form_req_id) return;

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
      //#################
      function merge_group_options_into_roster_map(map_obj, groups, allowed_set) {
        const out = {};

        Object.entries((map_obj && typeof map_obj === 'object') ? map_obj : {}).forEach(([team, names]) => {
          out[team] = Array.isArray(names) ? names.slice() : [];
        });

        const allowed_norm = new Set(
          Array.from(allowed_set || []).map(x => normalize_matchup_person_key(x))
        );

        (groups || []).forEach(g => {
          const team = normalize_matchups_team_code(g?.label);
          if (!team) return;

          if (!out[team]) out[team] = [];

          (g.options || []).forEach(name => {
            const nm = String(name || '').trim();
            if (!nm) return;

            if (allowed_norm.size && !allowed_norm.has(normalize_matchup_person_key(nm))) return;

            const wanted = normalize_matchup_person_key(nm);
            const already = out[team].some(x => normalize_matchup_person_key(x) === wanted);

            if (!already) out[team].push(nm);
          });
        });

        Object.keys(out).forEach(team => {
          out[team] = sort_names_last(out[team]);
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

      const filtered_hitters_by_team = merge_group_options_into_roster_map(
        filter_roster_map_to_allowed(roster_hitters_by_team, hitter_allowed),
        pack?.hitters_by_team,
        hitter_allowed
      );

      const filtered_starters_by_team = merge_group_options_into_roster_map(
        filter_roster_map_to_allowed(roster_starters_by_team, starter_allowed),
        pack?.pitchers_sp_by_team,
        starter_allowed
      );

      const filtered_relievers_by_team = merge_group_options_into_roster_map(
        filter_roster_map_to_allowed(roster_relievers_by_team, pitcher_allowed),
        pack?.pitchers_rp_by_team,
        pitcher_allowed
      );
      dbg('selected year', year_val);
      dbg('fallback Elvis rec', fallback_pitcher_map['Elvis Alvarado']);
      dbg('pitcher_allowed has Elvis', pitcher_allowed.has('Elvis Alvarado'));
      dbg('ATH relievers raw', roster_relievers_by_team.ATH);
      dbg('ATH relievers filtered', filtered_relievers_by_team.ATH);

      const roster_hitter_groups = roster_groups_from_map(filtered_hitters_by_team, '');
      const roster_sp_groups = roster_groups_from_map(filtered_starters_by_team, 'Starters');
      const roster_rp_groups = roster_groups_from_map(filtered_relievers_by_team, 'Relievers');

      const roster_hitter_team_map = {
        ...((rosters_obj && rosters_obj.hitter_team_map && typeof rosters_obj.hitter_team_map === 'object') ? rosters_obj.hitter_team_map : {}),
        ...roster_team_map_from_groups(roster_hitter_groups)
      };

      const roster_starter_team_map = {
        ...((rosters_obj && rosters_obj.starter_team_map && typeof rosters_obj.starter_team_map === 'object') ? rosters_obj.starter_team_map : {}),
        ...roster_team_map_from_groups(roster_sp_groups)
      };

      const roster_reliever_team_map = {
        ...((rosters_obj && rosters_obj.reliever_team_map && typeof rosters_obj.reliever_team_map === 'object') ? rosters_obj.reliever_team_map : {}),
        ...roster_team_map_from_groups(roster_rp_groups)
      };

      const hitters_all_roster = sort_names_last(unique_player_names(
        flat_from_roster_map(roster_hitters_by_team).concat(
          flat_names_from_groups(pack?.hitters_by_team, pack?.hitters)
        )
      ));

      const pitchers_sp_all_roster = sort_names_last(unique_player_names(
        flat_from_roster_map(roster_starters_by_team).concat(
          flat_names_from_groups(pack?.pitchers_sp_by_team, pack?.pitchers_sp)
        )
      ));

      const pitchers_rp_all_roster = sort_names_last(unique_player_names(
        flat_from_roster_map(roster_relievers_by_team).concat(
          flat_names_from_groups(pack?.pitchers_rp_by_team, pack?.pitchers_rp)
        )
      ));

      const pitchers_all_roster = sort_names_last(unique_player_names(
        pitchers_sp_all_roster.concat(
          pitchers_rp_all_roster,
          flat_names_from_groups(pack?.pitchers_by_team, pack?.pitchers)
        )
      ));

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
        hitters_all: hitters_all_roster,
        pitchers_all: pitchers_all_roster,
        pitchers_sp_all: pitchers_sp_all_roster,
        pitchers_rp_all: pitchers_rp_all_roster,
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

    const url_year = String(initial_matchups_params.get('year') || '').trim();
    const initial_year = String(prev_year || url_year || preferred_year || (years[0] || '')).trim();
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
      mode === 'best_and_worst_hitters' ||
      mode === 'todays_favorited_players' ||
      mode === 'todays_fantasy_lineup' ||
      mode === 'weekly_fantasy_hitter_moves'
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

      year_obj.sel.value = String(prev_year || url_year || preferred_year || (year_choices[0] || '')).trim();
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
        sort_btn.dataset.mode = 'score';
        sort_btn.textContent = 'Sort Team Name';
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
      clear_btn.style.background = 'rgba(210, 35, 35,0.12)';
      clear_btn.style.borderColor = 'rgba(210, 35, 35,0.35)';
      clear_btn.addEventListener('click', (e) => {
        e.preventDefault();
        reset_sort_button();
        clear_matchups_url_state();
        if (typeof on_clear === 'function') on_clear();
      });

      wrap.appendChild(submit_btn);
      wrap.appendChild(clear_btn);
      //#################
      function parse_sort_num(s) {
        const raw = String(s || '').trim();
        if (!raw || raw === '—') return NaN;
        const x = raw.replace(/,/g, '');
        const m = x.match(/-?(?:\d+(?:\.\d*)?|\.\d+)/);
        return m ? Number(m[0]) : NaN;
      }
      //#################
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
      //#################
      function header_index_for(label) {
        const results = document.getElementById('matchups_results_root');
        const table = results ? results.querySelector('table.matchup_table') : null;
        if (!table) return -1;

        const target = String(label || '').trim();
        const ths = Array.from(table.querySelectorAll('thead th'));

        return ths.findIndex(th => {
          const raw = String(th.dataset.rawHeader || '').trim();
          const shown = String(th.textContent || '').trim();
          return raw === target || shown === target;
        });
      }
      //#################
      function sort_by_all_desc() {
        let idx_all = header_index_for('Score');
        if (idx_all < 0) idx_all = header_index_for('+All');
        if (idx_all < 0) idx_all = header_index_for('All');

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
      //#################
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
      //#################
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
        sort_btn.textContent = 'Sort Team Name';
        sort_btn.dataset.mode = 'score';

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
              sort_btn.textContent = 'Sort Score';
            }
            return;
          }

          if (m === 'score') {
            sort_by_team_name();
            sort_btn.dataset.mode = 'team';
            sort_btn.textContent = 'Sort Score';
          } else {
            sort_by_all_desc();
            sort_btn.dataset.mode = 'score';
            sort_btn.textContent = 'Sort Team Name';
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
    function pitcher_role_from_grouped_lists(pitcher_name) {
      const nm = String(pitcher_name || '').trim();
      if (!nm) return 'starters';

      const wanted = normalize_matchup_person_key(nm);

      const rp_groups = Array.isArray(year_lists.pitchers_rp_by_team) ? year_lists.pitchers_rp_by_team : [];
      for (const g of rp_groups) {
        const opts = Array.isArray(g.options) ? g.options : [];
        if (opts.some(x => normalize_matchup_person_key(x) === wanted)) {
          return 'bullpen';
        }
      }

      const sp_groups = Array.isArray(year_lists.pitchers_sp_by_team) ? year_lists.pitchers_sp_by_team : [];
      for (const g of sp_groups) {
        const opts = Array.isArray(g.options) ? g.options : [];
        if (opts.some(x => normalize_matchup_person_key(x) === wanted)) {
          return 'starters';
        }
      }

      return 'starters';
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
    function build_pitcher_only_rows(mode_key) {
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

      const { wrap: p_wrap, sel: p_sel } = make_player_input(`matchups_pitcher_${i}`, `Pitcher ${i + 1}`);
      set_player_input_options(p_sel, year_lists.pitchers_sp_by_team, year_lists.pitchers_sp, 'Enter SP');

      attach_player_validation(
        p_sel,
        () => year_lists.pitchers_sp_all || [],
        () => year_lists.pitchers_sp || []
      );

        p_sel.classList.add('matchups_select_pitcher_long');
        row_div.appendChild(p_wrap);

        if (i < 8) {
          left_col.appendChild(row_div);
        } else {
          right_col.appendChild(row_div);
        }

        const row = { p_sel };
        rows.push(row);

        p_sel.addEventListener('change', () => {
          clear_results();
        });

        const saved = (multi_form_state[mode_key].rows && multi_form_state[mode_key].rows[i])
          ? multi_form_state[mode_key].rows[i]
          : null;

        if (saved) {
          row.p_sel.value = saved.pitcher || '';
          sync_select_placeholder_class(row.p_sel);
        }
      }

      const st = multi_form_state[mode_key];
      const n = clamp_rows_n(st.n);
      st.n = n;

      for (let i = 0; i < n; i++) add_row(i);

      return rows;
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

        const { wrap: h_wrap, sel: h_sel } = make_player_input(`matchups_hitter_${i}`, `Hitter ${i + 1}`);
        set_player_input_options(h_sel, year_lists.hitters_by_team, hitters, 'Enter Hitter');

        attach_player_validation(
          h_sel,
          () => year_lists.hitters_all || [],
          () => hitters || []
        );

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

  const score_header =
    src_headers.find(h => {
      const hh = String(h || '').trim();
      return hh === 'All' || hh === 'RHP' || hh === 'LHP';
    }) || 'All';

  const consistency_header = src_headers.find(h => String(h || '').trim() === 'Pts +/-') ? 'Pts +/-' : '';
  const ordered_headers = ['Name', 'PA', 'Away', 'Opp', 'Pitcher', score_header].concat(
    consistency_header ? [consistency_header] : []
  );
  const ordered_cells = [
    row_map['Name'] ?? '—',
    row_map['PA'] ?? '—',
    extras.Away ?? '—',
    extras.Opp ?? '—',
    extras.Pitcher ?? '—',
    row_map[score_header] ?? '—'
  ];

  const pitch_headers = src_headers.filter(h => {
    const hh = String(h || '').trim();
    return !ordered_headers.includes(hh) && hh !== 'Year' && hh !== 'Pts +/-';
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

  function th_matches(th, label) {
    const target = String(label || '').trim();
    const raw = String(th.dataset.rawHeader || '').trim();
    const shown = String(th.textContent || '').trim();
    return raw === target || shown === target;
  }

  let idx_all = ths.findIndex(th => th_matches(th, 'Score'));
  if (idx_all < 0) idx_all = ths.findIndex(th => th_matches(th, '+All'));
  if (idx_all < 0) idx_all = ths.findIndex(th => th_matches(th, 'All'));
  if (idx_all < 0) idx_all = ths.findIndex(th => th_matches(th, 'RHP'));
  if (idx_all < 0) idx_all = ths.findIndex(th => th_matches(th, 'LHP'));
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
            drop_cols: ['Year', '+KN'],
            gold_mode: 'hitter',
            link_role: 'batters',
            skip_clear: true
          }
        });

        apply_matchups_table_dividers(matchup_mount, 'weekly_fantasy_hitter_moves', 'matchups');
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
            drop_cols: ['Year', '+KN'],
            skip_clear: true,
            link_role: 'batters'
          }
        });

        apply_matchups_table_dividers(fallback_mount, 'weekly_fantasy_hitter_moves', 'fallback');
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
  if (initial_matchups_params.get('day')) {
    day_obj.sel.value = initial_matchups_params.get('day');
  }
  let projected_req_id = 0;
  sync_select_placeholder_class(day_obj.sel);
  //#################
  async function submit() {
    const req_id = ++projected_req_id;

    clear_results();
    if (!preferred_year) return;
    write_matchups_url_state({
      day: day_obj.sel.value
    });
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

      const projected_pitcher_drop_cols = [
        '+FB',
        '+SI',
        '+CT',
        '+SL',
        '+SW',
        '+CB',
        '+CH',
        '+SP',
        '+KN',
      ];
      await render_many(paths, {
        link_role: 'starters',
        link_year: y,
        drop_cols: projected_pitcher_drop_cols,
        compact_table: true,
        include_ownership: true,
        ownership_year: y,
        ownership_role: 'starters'
      });
      apply_matchups_table_dividers(results_root, mode, 'default');
      sort_all_results_tables_by_all();

    } catch (e) {
      dbg('projected_pitchers submit error', e);
    }
  }
  //#################
  function clear_mode() {
    clear_results();
    day_obj.sel.value = 'Today';
  if (initial_matchups_params.get('day')) {
    day_obj.sel.value = initial_matchups_params.get('day');
  }
    sync_select_placeholder_class(day_obj.sel);
  }

  build_action_buttons(submit, clear_mode, 'Load');
if (should_auto_submit_matchups_mode(mode)) {
setTimeout(() => submit(), 0);
}
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

  const game_obj = make_select('matchups_gd_game', 'Game');
  set_select_options(game_obj.sel, [], 'Select game');
  game_obj.wrap.style.display = 'none';
  form_root.appendChild(game_obj.wrap);

  day_obj.sel.value = 'Today';
if (initial_matchups_params.get('day')) {
day_obj.sel.value = initial_matchups_params.get('day');
}
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

  const url_team = String(initial_matchups_params.get('team') || '').trim();
  if (!prev_team && url_team && options.includes(url_team)) {
    team_obj.sel.value = url_team;
  }

  sync_select_placeholder_class(team_obj.sel);

  await refresh_game_choices();
}
//#################
async function refresh_game_choices() {
  const selected_team = String(team_obj.sel.value || '').trim();

  if (!selected_team) {
    set_select_options(game_obj.sel, [], 'Select game');
    game_obj.wrap.style.display = 'none';
    return;
  }

  const prev_game = String(game_obj.sel.value || '').trim();

  const offset = day_offset_from_label(day_obj.sel.value);
  const d = add_days_local(new Date(), offset);
  const date_str = to_yyyy_mm_dd_local(d);

  const games = await fetch_matchups_for_date(date_str);
  const team_games = games.filter(g => g.home_team === selected_team || g.away_team === selected_team);

  if (team_games.length <= 1) {
    set_select_options(game_obj.sel, ['0'], 'Select game');
    game_obj.sel.value = '0';
    game_obj.wrap.style.display = 'none';
    sync_select_placeholder_class(game_obj.sel);
    return;
  }

  const options = team_games.map((g, i) => {
    const away = String(g.away_team || '');
    const home = String(g.home_team || '');
    const away_pitcher = String(g.away_pitcher || 'TBD');
    const home_pitcher = String(g.home_pitcher || 'TBD');

    return {
      value: String(i),
      label: `Game ${i + 1}: ${away} @ ${home} — ${away_pitcher} vs ${home_pitcher}`
    };
  });

  set_select_options(game_obj.sel, options, 'Select game');

  const url_game = String(initial_matchups_params.get('game') || '').trim();

  if (prev_game && options.some(opt => String(opt.value) === prev_game)) {
    game_obj.sel.value = prev_game;
  } else if (url_game && options.some(opt => String(opt.value) === url_game)) {
    game_obj.sel.value = url_game;
  } else {
    game_obj.sel.value = '0';
  }

  game_obj.wrap.style.display = '';
  sync_select_placeholder_class(game_obj.sel);
}

day_obj.sel.addEventListener('change', () => {
  clear_results();
  refresh_team_choices();
});

team_obj.sel.addEventListener('change', () => {
  clear_results();
  refresh_game_choices();
});

game_obj.sel.addEventListener('change', () => {
  clear_results();
});

refresh_team_choices().then(() => {
if (should_auto_submit_matchups_mode(mode)) {
submit();
}
});
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

      const team_games = games.filter(g => g.home_team === selected_team || g.away_team === selected_team);
      const selected_game_idx = Math.max(0, Number(game_obj.sel.value || 0));
      const game = team_games[selected_game_idx] || team_games[0];

      write_matchups_url_state({
        day: day_obj.sel.value,
        team: selected_team,
        game: String(selected_game_idx)
      });
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
        "No matchup data - these are scores against pitchers from this side (or All pitches)"
      );

      const away_lineup_sections = await build_lineup_sections(
        idx,
        year_lists,
        y,
        away_hitters,
        'Away',
        home_pitcher,
        '',
        "No matchup data - these are scores against pitchers from this side (or All pitches)"
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

            let divider_key = 'lineup';
            if (extra_class === 'matchups_gameday_pitcher_slot') divider_key = 'pitcher';
            if (extra_class === 'matchups_gameday_fallback_slot') divider_key = 'fallback';

            apply_matchups_table_dividers(mount, mode, divider_key);
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
    team_obj.sel.value = '';
    game_obj.sel.value = '';
    game_obj.wrap.style.display = 'none';
    refresh_team_choices();
  }

  build_action_buttons(submit, clear_mode, 'Load', { show_sort: false });
  return;
}
//#################################################################### Mode: todays_favorited_players ####################################################################
if (mode === 'todays_favorited_players') {
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
function favorite_probable_pitcher_names() {
  const stored = Array.from(get_stored_people(favorites_storage_key));
  const starter_team_map = (year_lists && year_lists.starter_team_map && typeof year_lists.starter_team_map === 'object')
    ? year_lists.starter_team_map
    : {};

  const canonical_by_norm = {};
  Object.keys(starter_team_map || {}).forEach(name => {
    const norm = normalize_matchup_person_key(name);
    if (norm && !canonical_by_norm[norm]) {
      canonical_by_norm[norm] = name;
    }
  });

  const out = [];
  const seen = new Set();

  function canonical_name(raw_name) {
    const norm = normalize_matchup_person_key(raw_name);
    return canonical_by_norm[norm] || '';
  }

  for (const raw of stored) {
    const s = String(raw || '').trim();
    if (!s) continue;

    let candidate = canonical_name(s);

    if (!candidate && s.includes('__')) {
      const left = s.split('__')[0].trim();
      candidate = canonical_name(left);
    }

    if (!candidate) {
      const m = s.match(/^[a-z]+-(starters|bullpen)-(.+)$/i);
      if (m) {
        candidate = canonical_name(m[2].replace(/-/g, ' ').trim());
      }
    }

    if (!candidate || seen.has(candidate)) continue;

    seen.add(candidate);
    out.push(candidate);
  }

  return out;
}
//#################
function combine_fallback_dummy_rows(sections) {
  const rows = [];

  (sections || []).forEach(sec => {
    const dummy_rows = Array.isArray(sec?.opts?.dummy_rows) ? sec.opts.dummy_rows : [];
    dummy_rows.forEach(r => rows.push(r));
  });

  const preferred = [
    'Name', 'PA',
    'All', 'RHP', 'LHP',
    'Pts +/-',
    'FB', 'SI', 'CT', 'SL', 'SW', 'CB', 'CH', 'SP',
    'Year'
  ];

  const seen = new Set();
  const found = [];

  rows.forEach(r => {
    (r.header_cells || []).forEach(h => {
      const hh = String(h || '').trim();
      if (hh && !seen.has(hh)) {
        seen.add(hh);
        found.push(hh);
      }
    });
  });

  const ordered_header = preferred.filter(h => seen.has(h)).concat(
    found.filter(h => !preferred.includes(h))
  );

  return rows.map(r => {
    const row_map = {};

    (r.header_cells || []).forEach((h, i) => {
      row_map[String(h || '').trim()] = (r.row_cells || [])[i];
    });

    return {
      header_cells: ordered_header.slice(),
      row_cells: ordered_header.map(h => {
        const v = row_map[h];
        return (v == null || String(v).trim() === '') ? '—' : v;
      })
    };
  });
}
//#################
async function submit() {
  const y = prefer_fragment_year();
  if (!y) return;
  write_matchups_url_state({});

  const d = new Date();
  const date_str = to_yyyy_mm_dd_local(d);

  const games = await fetch_matchups_for_date(date_str);

  const matchup_paths = [];
  const matchup_override_rows = [];
  const fallback_sections = [];

  const seen_matchup_keys = new Set();
  const seen_fallback_keys = new Set();

  const favorite_hitters = favorite_hitter_names();
  const favorite_pitchers = favorite_probable_pitcher_names();
  const favorite_pitcher_norms = new Set(
    favorite_pitchers.map(x => normalize_matchup_person_key(x)).filter(Boolean)
  );

  const pitcher_paths = [];
  const pitcher_override_rows = [];
  const seen_pitcher_keys = new Set();

  games.forEach(g => {
    [
      {
        pitcher: g.home_pitcher,
        side: 'Home',
        opp: g.away_team
      },
      {
        pitcher: g.away_pitcher,
        side: 'Away',
        opp: g.home_team
      }
    ].forEach(x => {
      const pitcher_name = String(x.pitcher || '').trim();
      if (!pitcher_name) return;

      if (!favorite_pitcher_norms.has(normalize_matchup_person_key(pitcher_name))) return;

      const path = resolve_sp_vs_team_path(idx, y, pitcher_name, x.side, x.opp);
      if (!path) return;

      const key = [pitcher_name, x.side, x.opp, path].join('||');
      if (seen_pitcher_keys.has(key)) return;
      seen_pitcher_keys.add(key);

      pitcher_paths.push(path);
      pitcher_override_rows.push({
        Away: x.side
      });
    });
  });

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

    const fallback_key = [
      hitter_name,
      matchup_info.side,
      matchup_info.opp,
      matchup_info.pitcher
    ].join('||');

    if (seen_fallback_keys.has(fallback_key)) continue;
    seen_fallback_keys.add(fallback_key);

    const lineup_sections = await build_lineup_sections(
      idx,
      year_lists,
      y,
      [hitter_name],
      matchup_info.side,
      matchup_info.pitcher,
      '',
      "No matchup data - these are scores against pitchers from this side (or All pitches)"
    );

    (lineup_sections || []).forEach(sec => {
      const has_dummy = !!(sec.opts && Array.isArray(sec.opts.dummy_rows) && sec.opts.dummy_rows.length);
      if (has_dummy) fallback_sections.push(sec);
    });
  }

  clear_results();

  await render_stacked_section('Probable Pitchers', pitcher_paths, {
    override_rows: pitcher_override_rows,
    drop_cols: ['Year', 'Bats', 'Throws'],
    link_role: 'starters'
  });
  apply_matchups_table_dividers(results_root, mode, 'pitchers');

  await render_stacked_section('Matchups', matchup_paths, {
    override_rows: matchup_override_rows,
    keep_all_pitch_cols: true,
    drop_cols: ['Year', '+KN'],
    gold_mode: 'hitter',
    link_role: 'batters'
  });
  apply_matchups_table_dividers(results_root, mode, 'matchups');

  const fallback_dummy_rows = combine_fallback_dummy_rows(fallback_sections);

  await render_stacked_section(
    'No matchup data - these are scores against pitchers from this side (or All pitches)',
    [],
    {
      dummy_rows: fallback_dummy_rows,
      keep_all_pitch_cols: true,
      compact_table: true,
      drop_cols: ['Year', '+KN'],
      link_role: 'batters',
      gold_mode: 'hitter'
    }
  );

  apply_matchups_table_dividers(results_root, mode, 'fallback');

  sort_all_results_tables_by_all();
}
//#################
function clear_mode() {
  clear_results();
}

build_action_buttons(submit, clear_mode, 'Submit', { show_sort: false });
if (should_auto_submit_matchups_mode(mode)) {
  setTimeout(() => submit(), 0);
}
return;
}
//#################################################################### Mode: best_and_worst_hitters ####################################################################
if (mode === 'best_and_worst_hitters') {

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
    write_matchups_url_state({
      day: day_obj.sel.value
    });

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
      'Year', 'Away', 'Opp', '+FB', '+SI', '+CT', '+SL', '+SW', '+CB', '+CH', '+SP', '+KN', 'Bats', 'Throws'
    ];

    await render_multiple_fragments([
      {
        title: 'Top 20 Hitters',
        paths: top20,
        opts: {
          drop_cols: best_worst_drop_cols,
          gold_mode: 'hitter',
          link_role: 'batters',
          include_ownership: true,
          ownership_year: y,
          ownership_role: 'hitters'
        },
        cell_class: 'matchups_best_worst_cell'
      },
      {
        title: 'Bottom 20 Hitters',
        paths: bottom20,
        opts: {
          drop_cols: best_worst_drop_cols,
          gold_mode: 'hitter',
          link_role: 'batters',
          include_ownership: true,
          ownership_year: y,
          ownership_role: 'hitters'
        },
        cell_class: 'matchups_best_worst_cell'
      }
      ], { cols: 2, gap: '20px' });
      apply_matchups_table_dividers(results_root, mode, 'default');
  }
  //#################
  function clear_mode(){
    clear_results();
    day_obj.sel.value='Today';
  }
  if (initial_matchups_params.get('day')) {
    day_obj.sel.value = initial_matchups_params.get('day');
  }

  build_action_buttons(submit, clear_mode, 'Load', { show_sort: false });
  if (should_auto_submit_matchups_mode(mode)) {
setTimeout(() => submit(), 0);
}
  return;
}

//#################################################################### Mode: todays_fantasy_lineup ####################################################################
if (mode === 'todays_fantasy_lineup') {
  const url_rows_raw = String(initial_matchups_params.get('rows') || '').trim();
  if (url_rows_raw && !multi_form_state.todays_fantasy_lineup.rows.length) {
    multi_form_state.todays_fantasy_lineup.rows = url_rows_raw.split(';').map(x => ({
      hitter: decode_matchups_url_part(x)
    })).filter(x => x.hitter);

    multi_form_state.todays_fantasy_lineup.n = clamp_rows_n(multi_form_state.todays_fantasy_lineup.rows.length || 1);
  }
  const rows = build_hitter_only_rows('todays_fantasy_lineup');

  //#################
  async function submit() {
    snapshot_multi_state('todays_fantasy_lineup');

    const y = prefer_fragment_year();
    if (!y) return;
const url_rows = rows
.map(r => encode_matchups_url_part(r.h_sel.value))
.filter(Boolean)
.join(';');

write_matchups_url_state({ rows: url_rows });

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
      drop_cols: ['Year', '+KN'],
      gold_mode: 'hitter',
      link_role: 'batters'
    });

    await render_stacked_section('Fallback', [], {
      dummy_rows: fallback_dummy_rows,
      keep_all_pitch_cols: true,
      drop_cols: ['Year', '+KN'],
      link_role: 'batters'
    });

    apply_matchups_table_dividers(results_root, mode, 'matchups');
    apply_matchups_table_dividers(results_root, mode, 'fallback');
    sort_all_results_tables_by_all();
  }
  //#################
  function clear_mode() {
    clear_results();
    multi_form_state.todays_fantasy_lineup.rows = [];
    multi_form_state.todays_fantasy_lineup.n = 1;
    form_root.dataset.skip_snapshot = '1';
    sync_row_controls();
    build_form();
  }

  build_action_buttons(submit, clear_mode, 'Submit', { show_sort: false });
  if (should_auto_submit_matchups_mode(mode)) {
setTimeout(() => submit(), 0);
}
  return;
}
//#################################################################### Mode: weekly_fantasy_hitter_moves ####################################################################
if (mode === 'weekly_fantasy_hitter_moves') {
  const url_rows_raw = String(initial_matchups_params.get('rows') || '').trim();
if (url_rows_raw && !multi_form_state.weekly_fantasy_hitter_moves.rows.length) {
multi_form_state.weekly_fantasy_hitter_moves.rows = url_rows_raw.split(';').map(x => ({
hitter: decode_matchups_url_part(x)
})).filter(x => x.hitter);

multi_form_state.weekly_fantasy_hitter_moves.n = clamp_rows_n(multi_form_state.weekly_fantasy_hitter_moves.rows.length || 1);
}
  const rows = build_hitter_only_rows('weekly_fantasy_hitter_moves');

  //#################
  async function submit() {
    snapshot_multi_state('weekly_fantasy_hitter_moves');

    const y = prefer_fragment_year();
    if (!y) return;
    const url_rows = rows
      .map(r => encode_matchups_url_part(r.h_sel.value))
      .filter(Boolean)
      .join(';');

    write_matchups_url_state({ rows: url_rows });

    const start_date = new Date();
    const end_date = add_days_local(start_date, 6);

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
    multi_form_state.weekly_fantasy_hitter_moves.rows = [];
    multi_form_state.weekly_fantasy_hitter_moves.n = 1;
    form_root.dataset.skip_snapshot = '1';
    sync_row_controls();
    build_form();
  }

  // build_action_buttons(submit, clear_mode);
  build_action_buttons(submit, clear_mode, 'Submit', { show_sort: false });
  if (should_auto_submit_matchups_mode(mode)) {
setTimeout(() => submit(), 0);
}
  return;
}
//#################################################################### Mode: weekly_starting_pitcher_moves ####################################################################
if (mode === 'weekly_starting_pitcher_moves') {
  const url_rows_raw = String(initial_matchups_params.get('rows') || '').trim();
  if (url_rows_raw && !multi_form_state.weekly_starting_pitcher_moves.rows.length) {
    multi_form_state.weekly_starting_pitcher_moves.rows = url_rows_raw.split(';').map(x => ({
      pitcher: decode_matchups_url_part(x)
    })).filter(x => x.pitcher);

    multi_form_state.weekly_starting_pitcher_moves.n = clamp_rows_n(multi_form_state.weekly_starting_pitcher_moves.rows.length || 1);
  }

  const rows = build_pitcher_only_rows('weekly_starting_pitcher_moves');

  //#################
  async function submit() {
    snapshot_multi_state('weekly_starting_pitcher_moves');

    const y = prefer_fragment_year();
    if (!y) return;

    const url_rows = rows
      .map(r => encode_matchups_url_part(r.p_sel.value))
      .filter(Boolean)
      .join(';');

    write_matchups_url_state({ rows: url_rows });

    const start_date = new Date();
    const end_date = add_days_local(start_date, 6);

    const schedule_days = await fetch_matchups_for_date_range(start_date, end_date);

    const pitcher_blocks = [];

    for (const r of rows) {
      const pitcher_name = String(r.p_sel.value || '').trim();
      if (!pitcher_name) continue;

      const pitcher_norm = normalize_matchup_person_key(pitcher_name);

      const matchup_paths = [];
      const matchup_override_rows = [];
      const seen_games = new Set();

      for (const day_pack of schedule_days) {
        const date_str = String(day_pack?.date_str || '').trim();
        const games = Array.isArray(day_pack?.games) ? day_pack.games : [];

        for (const g of games) {
          const candidates = [
            {
              pitcher: g.home_pitcher,
              side: 'Home',
              opp: g.away_team
            },
            {
              pitcher: g.away_pitcher,
              side: 'Away',
              opp: g.home_team
            }
          ];

          for (const x of candidates) {
            const probable_name = String(x.pitcher || '').trim();
            if (!probable_name) continue;
            if (normalize_matchup_person_key(probable_name) !== pitcher_norm) continue;

            const game_key = [
              date_str,
              pitcher_name,
              x.side,
              x.opp
            ].join('||');

            if (seen_games.has(game_key)) continue;
            seen_games.add(game_key);

            const path = resolve_sp_vs_team_path(idx, y, probable_name, x.side, x.opp);
            if (!path) continue;

            matchup_paths.push(path);
            matchup_override_rows.push({
              Away: x.side,
              Opp: x.opp
            });
          }
        }
      }

      if (matchup_paths.length) {
        pitcher_blocks.push({
          pitcher_name,
          matchup_paths,
          matchup_override_rows
        });
      }
    }

clear_results();

if (!pitcher_blocks.length) {
  results_root.innerHTML = `<div style="padding:10px;color:var(--muted);">No projected starts found for the selected pitchers.</div>`;
  return;
}

for (const block of pitcher_blocks) {
      const pitcher_name = String(block.pitcher_name || '').trim();
      const matchup_paths = Array.isArray(block.matchup_paths) ? block.matchup_paths : [];
      const matchup_override_rows = Array.isArray(block.matchup_override_rows) ? block.matchup_override_rows : [];

      if (!pitcher_name || !matchup_paths.length) continue;

      const pitcher_block = document.createElement('div');
      pitcher_block.className = 'matchups_hitter_week_block';
      pitcher_block.style.marginBottom = '22px';

      const pitcher_header = document.createElement('div');
      pitcher_header.textContent = pitcher_name;
      pitcher_header.style.fontSize = '14px';
      pitcher_header.style.fontWeight = '800';
      pitcher_header.style.color = 'var(--text)';
      pitcher_header.style.margin = '0 2px 8px 2px';
      pitcher_block.appendChild(pitcher_header);

      results_root.appendChild(pitcher_block);

      const mount = document.createElement('div');
      pitcher_block.appendChild(mount);

      await render_section_into(mount, {
        title: '',
        hide_title: true,
        paths: matchup_paths,
        opts: {
          override_rows: matchup_override_rows,
          drop_cols: ['Year', 'Team', 'Away', 'Bats', 'Throws'],
          link_role: 'starters',
          skip_clear: true
        }
      });

      apply_matchups_table_dividers(mount, 'weekly_starting_pitcher_moves', 'default');
    }

    sort_all_results_tables_by_all();
  }

  //#################
  function clear_mode() {
    clear_results();
    multi_form_state.weekly_starting_pitcher_moves.rows = [];
    multi_form_state.weekly_starting_pitcher_moves.n = 1;
    form_root.dataset.skip_snapshot = '1';
    sync_row_controls();
    build_form();
  }

  build_action_buttons(submit, clear_mode, 'Submit', { show_sort: false });

  if (should_auto_submit_matchups_mode(mode)) {
    setTimeout(() => submit(), 0);
  }

  return;
}
//#################################################################### Mode: specific_hitters ####################################################################
if (mode === 'specific_hitters') {
  const rows = [];

  //#################
  //#################
  function clean_pitcher_group_team(label) {
    return String(label || '')
      .replace(/\s+—\s+Starters$/i, '')
      .replace(/\s+—\s+Relievers$/i, '')
      .trim();
  }
  //#################
  function build_specific_hitter_pitcher_groups() {
    const starter_groups = Array.isArray(year_lists.pitchers_sp_by_team) ? year_lists.pitchers_sp_by_team : [];
    const reliever_groups = Array.isArray(year_lists.pitchers_rp_by_team) ? year_lists.pitchers_rp_by_team : [];

    const starters_by_team = new Map();
    const relievers_by_team = new Map();
    const teams = new Set();

    starter_groups.forEach(g => {
      const team = clean_pitcher_group_team(g.label);
      if (!team) return;

      teams.add(team);
      starters_by_team.set(team, g);
    });

    reliever_groups.forEach(g => {
      const team = clean_pitcher_group_team(g.label);
      if (!team) return;

      teams.add(team);
      relievers_by_team.set(team, g);
    });

    const out = [];

    Array.from(teams).sort((a, b) => a.localeCompare(b)).forEach(team => {
      const sg = starters_by_team.get(team);
      const rg = relievers_by_team.get(team);

      if (sg && Array.isArray(sg.options) && sg.options.length) {
        out.push(sg);
      }

      if (rg && Array.isArray(rg.options) && rg.options.length) {
        out.push(rg);
      }
    });

    return out;
  }
  //#################
  function refresh_row_pitchers(row) {
    const hitter_team_map = get_hitter_team_map();
    const hitter_team = hitter_team_map[String(row.h_sel.value || '').trim()] || '';

    let base_groups = build_specific_hitter_pitcher_groups();

    if (hitter_team) {
      base_groups = filter_groups_excluding_team(base_groups, hitter_team);
    }

    const prev = String(row.p_sel.value || '').trim();

    set_player_input_options(row.p_sel, base_groups, [], 'Enter Pitcher');

    if (prev) {
      row.p_sel.value = prev;
    }

    sync_select_placeholder_class(row.p_sel);
    validate_player_input(
      row.p_sel,
      year_lists.pitchers_all || [],
      pitchers || []
    );
  }
  //#################
  function pitcher_role_for_row(row) {
    const pitcher_name = String(row?.p_sel?.value || '').trim();
    if (!pitcher_name) return 'starters';

    const wanted = normalize_matchup_person_key(pitcher_name);

    function in_groups(groups) {
      if (!Array.isArray(groups)) return false;

      return groups.some(g => {
        const opts = Array.isArray(g.options) ? g.options : [];
        return opts.some(x => normalize_matchup_person_key(x) === wanted);
      });
    }

    const sp_groups = Array.isArray(year_lists.pitchers_sp_by_team) ? year_lists.pitchers_sp_by_team : [];
    const rp_groups = Array.isArray(year_lists.pitchers_rp_by_team) ? year_lists.pitchers_rp_by_team : [];

    const in_sp = in_groups(sp_groups);
    const in_rp = in_groups(rp_groups);

    if (in_sp) return 'starters';
    if (in_rp) return 'bullpen';

    return 'starters';
  }
    //#################
  function add_row(i) {
    const row_div = document.createElement('div');
    row_div.className = 'matchups_form_row';

    const { wrap: h_wrap, sel: h_sel } = make_player_input(`matchups_hitter_${i}`, `Hitter ${i + 1}`);
    set_player_input_options(h_sel, year_lists.hitters_by_team, hitters, 'Enter Hitter');

    attach_player_validation(
      h_sel,
      () => year_lists.hitters_all || [],
      () => hitters || []
    );

    const { wrap: s_wrap, sel: s_sel } = make_select(`matchups_side_${i}`, 'Away/Home');
    set_select_options(s_sel, ['Away', 'Home'], 'Select');

    const { wrap: p_wrap, sel: p_sel } = make_player_input(`matchups_pitcher_${i}`, 'Pitcher');
    const pitcher_groups = build_pitcher_groups(year_lists);
    set_player_input_options(p_sel, pitcher_groups, pitchers, 'Enter Pitcher');

    attach_player_validation(
      p_sel,
      () => year_lists.pitchers_all || [],
      () => pitchers || []
    );

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

    const saved = (multi_form_state.specific_hitters.rows && multi_form_state.specific_hitters.rows[i])
      ? multi_form_state.specific_hitters.rows[i]
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
  const url_rows_raw = String(initial_matchups_params.get('rows') || '').trim();
  if (url_rows_raw && !multi_form_state.specific_hitters.rows.length) {
    multi_form_state.specific_hitters.rows = url_rows_raw.split(';').map(x => {
      const parts = x.split('|').map(decode_matchups_url_part);
      return {
        hitter: parts[0] || '',
        side: parts[1] || '',
        pitcher: parts[2] || ''
      };
    }).filter(x => x.hitter || x.side || x.pitcher);

    multi_form_state.specific_hitters.n = clamp_rows_n(multi_form_state.specific_hitters.rows.length || 1);
  }
  const st = multi_form_state.specific_hitters;

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
    snapshot_multi_state('specific_hitters');

    const y = year_sel.value;
    if (!y) return;
    const url_rows = rows
      .map(r => [
        encode_matchups_url_part(r.h_sel.value),
        encode_matchups_url_part(r.s_sel.value),
        encode_matchups_url_part(r.p_sel.value)
      ].join('|'))
      .filter(x => x.replace(/\|/g, '').trim())
      .join(';');

    write_matchups_url_state({ year: y, rows: url_rows });

    const paths = [];
    const override_rows = [];
    const dummy_rows = [];
    const row_link_roles = [];

    for (const r of rows) {
      const hitter_name = String(r.h_sel.value || '').trim();
      const side = String(r.s_sel.value || '').trim();
      const pitcher_name = String(r.p_sel.value || '').trim();

      if (!hitter_name || !side || !pitcher_name) continue;
      const pitcher_link_role = pitcher_role_for_row(r);

      const path = resolve_hvp_with_pf_fallback(idx, y, hitter_name, side, pitcher_name);

      if (path) {
        paths.push(path);
        override_rows.push({ Away: side });
        row_link_roles.push(pitcher_link_role);
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
        row_link_roles.push(pitcher_link_role);
      }
    }
    await render_many(paths, {
      dummy_rows,
      override_rows,
      keep_all_pitch_cols: true,
      gold_mode: 'hitter',
      link_role: 'batters',
      row_pitcher_link_roles: row_link_roles
    });
    apply_matchups_table_dividers(results_root, mode, 'default');
  }

  //#################
  function clear_mode() {
    clear_results();
    multi_form_state.specific_hitters.rows = [];
    multi_form_state.specific_hitters.n = 1;
    form_root.dataset.skip_snapshot = '1';
    sync_row_controls();
    build_form();
  }

  build_action_buttons(submit, clear_mode);
  if (should_auto_submit_matchups_mode(mode)) {
setTimeout(() => submit(), 0);
}
  return;
}
//#################################################################### Mode: specific_starting_pitchers ####################################################################
if (mode === 'specific_starting_pitchers') {
  const rows = [];
  //#################
  function add_row(i) {
    const row_div = document.createElement('div');
    row_div.className = 'matchups_form_row';

    const pitcher_obj = make_player_input(`matchups_pitcher_${i}`, `Pitcher ${i + 1}`);
    set_player_input_options(pitcher_obj.sel, year_lists.pitchers_sp_by_team, year_lists.pitchers_sp, 'Enter SP');

    attach_player_validation(
      pitcher_obj.sel,
      () => year_lists.pitchers_sp_all || [],
      () => year_lists.pitchers_sp || []
    );

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

    const saved = (multi_form_state.specific_starting_pitchers.rows && multi_form_state.specific_starting_pitchers.rows[i])
      ? multi_form_state.specific_starting_pitchers.rows[i]
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
  const url_rows_raw = String(initial_matchups_params.get('rows') || '').trim();
  if (url_rows_raw && !multi_form_state.specific_starting_pitchers.rows.length) {
    multi_form_state.specific_starting_pitchers.rows = url_rows_raw.split(';').map(x => {
      const parts = x.split('|').map(decode_matchups_url_part);
      return {
        pitcher: parts[0] || '',
        side: parts[1] || '',
        team: parts[2] || ''
      };
    }).filter(x => x.pitcher || x.side || x.team);

    multi_form_state.specific_starting_pitchers.n = clamp_rows_n(multi_form_state.specific_starting_pitchers.rows.length || 1);
  }
  const st = multi_form_state.specific_starting_pitchers;
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
    snapshot_multi_state('specific_starting_pitchers');

    const y = year_sel.value;
    if (!y) return;
    const url_rows = rows
      .map(r => [
        encode_matchups_url_part(r.p_sel.value),
        encode_matchups_url_part(r.s_sel.value),
        encode_matchups_url_part(r.t_sel.value)
      ].join('|'))
      .filter(x => x.replace(/\|/g, '').trim())
      .join(';');

    write_matchups_url_state({ year: y, rows: url_rows });

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

    await render_many(uniq, {
      override_rows,
      link_role: 'starters'
    });
    apply_matchups_table_dividers(results_root, mode, 'default');
  }
  //#################
  function clear_mode() {
    clear_results();
    multi_form_state.specific_starting_pitchers.rows = [];
    multi_form_state.specific_starting_pitchers.n = 1;
    form_root.dataset.skip_snapshot = '1';
    sync_row_controls();
    build_form();
  }

  build_action_buttons(submit, clear_mode);
  if (should_auto_submit_matchups_mode(mode)) {
setTimeout(() => submit(), 0);
}
  return;
}
//#################################################################### Mode: reliever_inning ####################################################################
if (mode === 'reliever_inning') {
  const pitcher_obj = make_player_input('matchups_pitcher', 'Pitcher');
  set_player_input_options(
    pitcher_obj.sel,
    year_lists.pitchers_rp_by_team,
    year_lists.pitchers_rp,
    'Enter RP'
  );

  attach_player_validation(
    pitcher_obj.sel,
    () => year_lists.pitchers_rp_all || [],
    () => year_lists.pitchers_rp || []
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

const y = String(year_sel?.value || prefer_fragment_year() || window.DEFAULT_SEASON_YEAR || '').trim();
const href = resolve_matchup_player_href(pitcher_name, 'bullpen', y);

if (href) {
rp_info.innerHTML = `<a href="${escape_html(href)}" class="matchups_player_link">${escape_html(pitcher_name)}</a>: ${escape_html(ip_text)} IP`;
} else {
rp_info.textContent = `${pitcher_name}: ${ip_text} IP`;
}

rp_info.style.display = '';
}

  const { wrap: b1_wrap, sel: b1_sel } = make_player_input('matchups_b1', 'Batter 1');
  const { wrap: b2_wrap, sel: b2_sel } = make_player_input('matchups_b2', 'Batter 2');
  const { wrap: b3_wrap, sel: b3_sel } = make_player_input('matchups_b3', 'Batter 3');

  [b1_sel, b2_sel, b3_sel].forEach(sel => {
    attach_player_validation(
      sel,
      () => year_lists.hitters_all || [],
      () => hitters || []
    );
  });
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

    set_player_input_options(b1_sel, groups_ok, hitters, 'Select batter');
    set_player_input_options(b2_sel, groups_ok, hitters, 'Select batter');
    set_player_input_options(b3_sel, groups_ok, hitters, 'Select batter');

    if (prev_b1 && current_player_input_options(b1_sel).includes(prev_b1)) b1_sel.value = prev_b1;
    if (prev_b2 && current_player_input_options(b2_sel).includes(prev_b2)) b2_sel.value = prev_b2;
    if (prev_b3 && current_player_input_options(b3_sel).includes(prev_b3)) b3_sel.value = prev_b3;

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

    set_player_input_options(b1_sel, groups_b1, [], 'Select batter');
    set_player_input_options(b2_sel, groups_b2, [], 'Select batter');
    set_player_input_options(b3_sel, groups_b3, [], 'Select batter');

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

function set_url_select_value(sel, param_name, decode_value = true) {
const raw = String(initial_matchups_params.get(param_name) || '').trim();
if (!raw) return;

const val = decode_value ? decode_matchups_url_part(raw) : raw;
sel.value = val;
sync_select_placeholder_class(sel);
}

set_url_select_value(pitcher_sel, 'pitcher');
refresh_hitters_excluding_rp_team();
sync_rp_info();

set_url_select_value(side_sel, 'side', false);

set_url_select_value(b1_sel, 'b1');
set_url_select_value(b2_sel, 'b2');
set_url_select_value(b3_sel, 'b3');

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
    write_matchups_url_state({
      year: y,
      pitcher: encode_matchups_url_part(p),
      side: s,
      b1: encode_matchups_url_part(b1),
      b2: encode_matchups_url_part(b2),
      b3: encode_matchups_url_part(b3)
    });

    // const p_key = safe_page_filename(p);

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

    await render_many(paths, {
      invert_stats: true,
      override_rows,
      drop_cols: ['Year', 'Pitcher', 'IP', 'Away', 'Bats', 'Throws'],
      link_role: 'batters',
      pitcher_link_role: 'bullpen',
      compact_table: true
    });
    apply_matchups_table_dividers(results_root, mode, 'default');
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
      if (should_auto_submit_matchups_mode(mode)) {
setTimeout(() => submit(), 0);
}
  return;
}
  }
//#################################################################### Matchups table dividers ####################################################################
const matchups_table_divider_config = {
  gameday_matchup: {
    pitcher: { heavy_before: ['Score', '+All', 'Consistency', '+FB', 'All', 'FB', 'RHB'], light_before: ['+SL', '+CH'] },
    lineup: { heavy_before: ['Score', '+All', 'Consistency', '+FB'], light_before: ['+SL', '+CH'] },
    fallback: { heavy_before: ['All', 'Consistency', 'Year', 'LHP', 'RHP', 'FB'], light_before: [] },
  },

  projected_pitchers: {
    default: { heavy_before: ['Score', '+All', 'Consistency', '+FB', 'Own%'], light_before: ['+SL', '+CH'] },
  },

  weekly_starting_pitcher_moves: {
  default: { heavy_before: ['Score', '+All', 'Consistency', '+FB'], light_before: ['+SL', '+CH', 'Opp'] },
},

  best_and_worst_hitters: {
    default: { heavy_before: ['Score', '+All', 'Consistency', 'Own%'], light_before: ['Pitcher'] },
  },

  specific_starting_pitchers: {
    default: { heavy_before: ['Score', '+All', 'Consistency', '+FB'], light_before: ['+SL', '+CH'] },
  },

  specific_hitters: {
    default: { heavy_before: ['Score', '+All', 'Consistency', '+FB'], light_before: ['+SL', '+CH', 'Opp'] },
  },

  todays_favorited_players: {
    pitchers: { heavy_before: ['Score', '+All', 'Consistency', '+FB'], light_before: ['+SL', '+CH'] },
    matchups: { heavy_before: ['Score', '+All', 'Consistency', '+FB'], light_before: ['+SL', '+CH', 'Opp'] },
    fallback: { heavy_before: ['All', 'Consistency', 'RHP', 'LHP', 'FB',], light_before: ['Opp'] },
  },

  todays_fantasy_lineup: {
    matchups: { heavy_before: ['Score', '+All', 'Consistency', '+FB'], light_before: ['+SL', '+CH', 'Opp'] },
    fallback: { heavy_before: ['All', 'Consistency', 'RHP', 'LHP', 'FB'], light_before: ['Opp'] },
  },

  weekly_fantasy_hitter_moves: {
    matchups: { heavy_before: ['Score', '+All', 'Consistency', '+FB'], light_before: ['+SL', '+CH', 'Opp'] },
    fallback: { heavy_before: ['All', 'Consistency', 'RHP', 'LHP', 'FB'], light_before: ['SL', 'CH', 'Opp'] },
  },

  reliever_inning: {
    default: { heavy_before: ['Score', '+All', 'Consistency', '+FB'], light_before: ['+SL', '+CH'] },
  },
};
//#################
function normalize_matchups_header_text(v) {
  return String(v || '').replace(/\s+/g, ' ').trim();
}
//#################
function matchups_divider_set(values) {
  return new Set((values || []).map(normalize_matchups_header_text).filter(Boolean));
}
//#################
function matchups_divider_spec(mode, section_key = 'default') {
  const mode_config = matchups_table_divider_config[mode] || {};
  return mode_config[section_key] || mode_config.default || {};
}
//#################
function apply_matchups_table_dividers(root, mode, section_key = 'default') {
  const scope = root || results_root || document;
  const spec = matchups_divider_spec(mode, section_key);

  const heavy_before = matchups_divider_set(spec.heavy_before);
  const light_before = matchups_divider_set(spec.light_before);

  const tables = Array.from(scope.querySelectorAll('table.matchup_table'));

  tables.forEach(table => {
    const headers = Array.from(table.querySelectorAll('thead th'));
    if (!headers.length) return;

    headers.forEach((th, idx) => {
      const raw_label = normalize_matchups_header_text(th.dataset.rawHeader || '');
      const shown_label = normalize_matchups_header_text(th.textContent);

      const add_heavy = heavy_before.has(raw_label) || heavy_before.has(shown_label);
      const add_light = light_before.has(raw_label) || light_before.has(shown_label);

      if (!add_heavy && !add_light) return;

      Array.from(table.querySelectorAll('tr')).forEach(tr => {
        const cell = tr.children[idx];
        if (!cell) return;

        if (add_heavy) cell.classList.add('fantasy_divider_before');
        if (add_light) cell.classList.add('fantasy_divider_before_light');
      });
    });
  });
}
  //#################################################################### Wiring ####################################################################
  let last_mode_value = mode_select.value;

  mode_select.addEventListener('change', () => {
    snapshot_multi_state(last_mode_value);

    const next_mode = mode_select.value;
const last_was_multi = (
  last_mode_value === 'specific_starting_pitchers' ||
  last_mode_value === 'specific_hitters' ||
  last_mode_value === 'todays_fantasy_lineup' ||
  last_mode_value === 'weekly_fantasy_hitter_moves' ||
  last_mode_value === 'weekly_starting_pitcher_moves'
);

const next_is_multi = (
  next_mode === 'specific_starting_pitchers' ||
  next_mode === 'specific_hitters' ||
  next_mode === 'todays_fantasy_lineup' ||
  next_mode === 'weekly_fantasy_hitter_moves' ||
  next_mode === 'weekly_starting_pitcher_moves'
);

    if (last_mode_value !== next_mode && (last_was_multi || next_is_multi)) {
      multi_form_state.specific_starting_pitchers.rows = [];
      multi_form_state.specific_starting_pitchers.n = 1;
      multi_form_state.specific_hitters.rows = [];
      multi_form_state.specific_hitters.n = 1;
      multi_form_state.todays_fantasy_lineup.rows = [];
      multi_form_state.todays_fantasy_lineup.n = 1;
      multi_form_state.weekly_fantasy_hitter_moves.rows = [];
      multi_form_state.weekly_fantasy_hitter_moves.n = 1;
      multi_form_state.weekly_starting_pitcher_moves.rows = [];
      multi_form_state.weekly_starting_pitcher_moves.n = 1;
    }

    last_mode_value = next_mode;
    sync_row_controls();
    write_matchups_url_state({});
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
      'Pts', 'PPG', 'Score', 'All', 'rAll', 'S All', 'Con', 'Disc', 'Val', 'S Val', 'vSzn', 'RHP', 'LHP', 'R Hit', 'R Pwr', 'R ≥75', 'L Hit', 'L Pwr', 'L ≥75', 'PA', 'H', '2B', '3B', 'R', 'HR', 'RBI', 'SB', 'BB', 'SO',
      'AVG', 'OBP', 'SLG', 'OPS', 'Pts +/-', 'Whiff%', 'SwSp%', '≥100', 'R swCon', 'R swDisc', 'R Eye', 'L swCon', 'L swDisc', 'L Eye', 'BB%', 'K%', 'FB R', 'SI R', 'CT R', 'SL R', 'SW R', 'CB R', 'CH R', 'SP R', 'FB L', 'SI L', 'CT L', 'SL L', 'SW L', 'CB L', 'CH L', 'SP L'
    ],
    sp: [
      'Name', 'Team',
      'Pts', 'PPG', 'Score', 'All', 'rAll', 'S All', 'Con', 'Disc', 'Val', 'S Val', 'vSzn', 'Velo', 'Stf', 'Rarity', 'LCon', 'LDisc', 'W', 'L', 'IP', 'BB', 'K', 'QS/SV', 'ERA', 'WHIP', 'Days +/-', 'BB%', 'K%', 'SwStr%', 'CSW%', '≥50 Qual',
      'FB Stf', 'FB R', 'FB L', 'SI Stf', 'SI R', 'SI L', 'CT Stf', 'CT R', 'CT L', 'SL Stf', 'SL R', 'SL L', 'SW Stf', 'SW R', 'SW L', 'CB Stf', 'CB R', 'CB L', 'CH Stf', 'CH R', 'CH L', 'SP Stf', 'SP R', 'SP L'
    ],
    rp: [
      'Name', 'Team',
      'Pts', 'PPG', 'Score', 'All', 'rAll', 'S All', 'Con', 'Disc', 'Val', 'S Val', 'vSzn', 'Velo', 'Stf', 'Rarity', 'LCon', 'LDisc', 'W', 'L', 'IP', 'BB', 'K', 'QS/SV', 'BS', 'ERA', 'WHIP', 'Days +/-', 'BB%', 'K%', 'SwStr%', 'CSW%', '≥50 Qual',
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
fantasy_display_columns.majors.pitchers = [
  'Name', 'Role', 'Team',
  'Pts', 'PPG', 'Score', 'All', 'rAll', 'S All', 'Con', 'Disc', 'Val', 'S Val', 'vSzn',
  'Velo', 'Stf', 'Rarity', 'LCon', 'LDisc', 'W', 'L', 'IP', 'BB', 'K', 'QS/SV', 'BS',
  'ERA', 'WHIP', 'Days +/-', 'BB%', 'K%', 'SwStr%', 'CSW%', '≥50 Qual',
  'FB Stf', 'FB R', 'FB L', 'SI Stf', 'SI R', 'SI L', 'CT Stf', 'CT R', 'CT L',
  'SL Stf', 'SL R', 'SL L', 'SW Stf', 'SW R', 'SW L', 'CB Stf', 'CB R', 'CB L',
  'CH Stf', 'CH R', 'CH L', 'SP Stf', 'SP R', 'SP L'
];

fantasy_display_columns.playoffs.pitchers = ['Name', 'Role', ...fantasy_display_columns.playoffs.sp.filter(col => col !== 'Name')];
fantasy_display_columns.spring.pitchers = ['Name', 'Role', ...fantasy_display_columns.spring.sp.filter(col => col !== 'Name')];
fantasy_display_columns.minors.pitchers = ['Name', 'Role', ...fantasy_display_columns.minors.sp.filter(col => col !== 'Name')];
/* ################# */
const fantasy_sort_columns = {
  majors: {
    hitters: [
      'Pts', 'PPG', 'Score', 'All', 'rAll', 'S All', 'Con', 'Disc', 'Val', 'S Val', 'vSzn', 'RHP', 'LHP', 'R Hit', 'R Pwr', 'R ≥75', 'L Hit', 'L Pwr', 'L ≥75', 'PA', 'H', '2B', '3B', 'R', 'HR', 'RBI', 'SB', 'BB', 'SO',
      'AVG', 'OBP', 'SLG', 'OPS', 'Pts +/-', 'Whiff%', 'SwSp%', '≥100', 'R swCon', 'R swDisc', 'R Eye', 'L swCon', 'L swDisc', 'L Eye', 'BB%', 'K%', 'FB R', 'SI R', 'CT R', 'SL R', 'SW R', 'CB R', 'CH R', 'SP R', 'FB L', 'SI L', 'CT L', 'SL L', 'SW L', 'CB L', 'CH L', 'SP L'
    ],
    sp: [
      'Pts', 'PPG', 'Score', 'All', 'rAll', 'S All', 'Con', 'Disc', 'Val', 'S Val', 'vSzn', 'Velo', 'Stf', 'Rarity', 'LCon', 'LDisc', 'W', 'L', 'IP', 'BB', 'K', 'QS/SV', 'ERA', 'WHIP', 'Days +/-', 'BB%', 'K%', 'SwStr%', 'CSW%', '≥50 Qual',
      'FB Stf', 'FB R', 'FB L', 'SI Stf', 'SI R', 'SI L', 'CT Stf', 'CT R', 'CT L', 'SL Stf', 'SL R', 'SL L', 'SW Stf', 'SW R', 'SW L', 'CB Stf', 'CB R', 'CB L', 'CH Stf', 'CH R', 'CH L', 'SP Stf', 'SP R', 'SP L'
    ],
    rp: [
      'Pts', 'PPG', 'Score', 'All', 'rAll', 'S All', 'Con', 'Disc', 'Val', 'S Val', 'vSzn', 'Velo', 'Stf', 'Rarity', 'LCon', 'LDisc', 'W', 'L', 'IP', 'BB', 'K', 'QS/SV', 'BS', 'ERA', 'WHIP', 'Days +/-', 'BB%', 'K%', 'SwStr%', 'CSW%', '≥50 Qual',
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
fantasy_sort_columns.majors.pitchers = fantasy_sort_columns.majors.rp;
fantasy_sort_columns.playoffs.pitchers = fantasy_sort_columns.playoffs.sp;
fantasy_sort_columns.spring.pitchers = fantasy_sort_columns.spring.sp;
fantasy_sort_columns.minors.pitchers = fantasy_sort_columns.minors.sp;
/* ################# */
function fantasy_hitter_position_options() {
  const base = ['ALL', 'C', '1B', '2B', '3B', 'SS', 'OF', 'DH'];

  if (Number(fantasy_state.year) < 2022) {
    base.push('P');
  }

  return base;
}
/* ################# */
const fantasy_qual_options = {
  hitters: ['', '25', '50', '100', '200', '300', '400', '500'],
  pitchers: ['', '5', '10', '25', '50', '100', '150'],
  sp: ['', '10', '25', '50', '100', '150'],
  rp: ['', '5', '10', '25', '50'],
};
/* ################# */
const fantasy_sidebar_team_cache = new Map();
const fantasy_page_lookup = new Map();
/* ################# */
function fantasy_team_logo_html(team) {
  const team_key = String(team || '').trim().toUpperCase();
  if (!team_key) return '';
  if (team_key === '- - -' || team_key === '---') return '';

  if (typeof team_logo_html === 'function') {
    const html = String(team_logo_html(team_key) || '').trim();

    if (html) {
      return `
        <span class="fantasy_team_logo_wrap" title="${escape_html(team_key)}">
          ${html}
        </span>
      `;
    }
  }

  return escape_html(team_key);
}
/* ################# */
function fantasy_qualifier_label() {
  return fantasy_state.section === 'hitters' ? 'Min PA' : 'Min IP';
}
/* ################# */
function fantasy_qualifier_key() {
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
    'R Eye', 'L Eye', 'BB%', 'K%', 'R swCon', 'R swDisc', 'L swCon', 'L swDisc', 'R ≥75', 'L ≥75',
    'SwStr%', 'CSW%'
  ]).has(key);
}
/* ################# */
function fantasy_fmt(key, v) {
  if (v == null || v === '') return '';
  if (key === 'Own%') return `${Number(v).toFixed(1).replace(/\.0$/, '')}%`;
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
    'R Eye', 'L Eye', 'BB%', 'K%', 'R swCon', 'R swDisc', 'L swCon', 'L swDisc', 'R ≥75', 'L ≥75',
    'SwStr%', 'CSW%'
  ]);

  const one_dec_keys = new Set([
    'IP', 'S IP',
    'Score', 'All', 'Con', 'Disc', 'Val', 'vSzn',
    'S Score', 'rAll', 'S All', 'S Con', 'S Disc', 'S Val', 'S Stf',
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
function fantasy_role_to_page_role(role) {
  if (role === 'sp' || role === 'starters') return 'starters';
  if (role === 'rp' || role === 'bullpen') return 'bullpen';
  return 'batters';
}
/* ################# */
function fantasy_build_page_lookup() {
  fantasy_page_lookup.clear();

  document.querySelectorAll('.toc_link[data-page]').forEach(link => {
    const person_key = String(link.getAttribute('data-person_key') || '').trim();
    const role = String(link.getAttribute('data-role') || '').trim();
    const page = String(link.getAttribute('data-page') || '').trim();

    if (!person_key || !role || !page) return;

    fantasy_page_lookup.set(`${role}|${person_key}`, page);
  });
}
/* ################# */
function fantasy_lookup_sidebar_team(row) {
  const person_key = String(row.person_key || '').trim();
  const role = fantasy_role_to_page_role(row.role);
  const cache_key = `${role}|${person_key}`;

  if (fantasy_sidebar_team_cache.has(cache_key)) {
    return fantasy_sidebar_team_cache.get(cache_key);
  }

  const match = fantasy_find_toc_link({
    person_key: person_key,
    role: role,
  });

  const team = match ? String(match.getAttribute('data-team') || '').trim() : '';
  fantasy_sidebar_team_cache.set(cache_key, team);

  return team;
}
/* ################# */
function fantasy_find_toc_link(row) {
  const target_person_key = String(row.person_key || '').trim();
  const target_role = fantasy_role_to_page_role(row.role);

  const links = Array.from(document.querySelectorAll('.toc_link[data-page]'));

  for (const link of links) {
    const link_person_key = String(link.getAttribute('data-person_key') || '').trim();
    const link_role = String(link.getAttribute('data-role') || '').trim();

    if (link_role !== target_role) continue;
    if (target_person_key && link_person_key === target_person_key) {
      return link;
    }
  }

  return null;
}
/* ################# */
// function fantasy_player_link(row) {
//   const safe_name = escape_html(row.name || '');
//   const person_key = String(row.person_key || '');
//   const role = fantasy_role_to_page_role(row.role);

//   return `
//     <a href="#" class="fantasy_player_link" data-person_key="${escape_html(person_key)}" data-role="${escape_html(role)}">${safe_name}</a>
//   `;
// }
function fantasy_player_link(row) {
  const safe_name = escape_html(row.name || '');
  const person_key = String(row.person_key || '');
  const role = fantasy_role_to_page_role(row.role);

  const page_id = fantasy_page_lookup.get(`${role}|${person_key}`) || '';
  const href = page_id ? `#${page_id}` : '#';

  return `
    <a
      href="${escape_html(href)}"
      class="fantasy_player_link"
      data-person_key="${escape_html(person_key)}"
      data-role="${escape_html(role)}"
      data-page_id="${escape_html(page_id)}"
    >${safe_name}</a>
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
function fantasy_is_current_year() {
  return Number(fantasy_state.year) === Number(window.DEFAULT_SEASON_YEAR || 2026);
}
/* ################# */
function fantasy_current_columns() {
  let cols = [
    ...(fantasy_display_columns[fantasy_state.scope][fantasy_state.section] || []),
  ];

  if (fantasy_is_current_year() && !cols.includes('Own%')) {
    const team_idx = cols.indexOf('Team');

    if (team_idx >= 0) {
      cols.splice(team_idx, 0, 'Own%');
    }
  }

  if (
    fantasy_state.scope === 'majors' &&
    fantasy_state.section === 'hitters' &&
    Number(fantasy_state.year) < 2023
  ) {
    const blocked = new Set(['R Hit', 'R Pwr', 'L Hit', 'L Pwr']);
    cols = cols.filter(col => !blocked.has(col));
  }

  return cols;
}
/* ################# */
function fantasy_sortable_columns() {
  const sortable = fantasy_sort_columns[fantasy_state.scope][fantasy_state.section] || [];

  return new Set(fantasy_current_columns().filter(col => {
    if (col === 'Own%') {
      return fantasy_is_current_year();
    }

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
function fantasy_clean_team_value(team) {
  const s = String(team || '').trim();
  const upper = s.toUpperCase();

  if (!s) return '';

  const retired_match = upper.match(/^RETIRED:+(.+)$/);
  if (retired_match) {
    const retired_team = retired_match[1].trim();

    if (!retired_team || retired_team === 'JOURNEYMEN') {
      return '';
    }

    return retired_team;
  }

  const blocked = new Set([
    'CHICAGO',
    'LOS ANGELES',
    'NEW YORK',
    'RETIRED',
    'JOURNEYMEN',
  ]);

  if (blocked.has(upper)) return '';

  return s;
}
/* ################# */
function fantasy_team_values_from_row(row) {
  return fantasy_split_teams_value(row.Teams || row.teams)
    .map(team => fantasy_clean_team_value(team))
    .filter(team => team);
}
/* ################# */
function fantasy_effective_team(row) {
  const display_team = String(row.team || '').trim();
  const display_team_upper = display_team.toUpperCase();

  if (fantasy_is_multi_team_placeholder(display_team)) {
    return display_team;
  }

  const teams_from_row = fantasy_team_values_from_row(row);

  if (
    display_team_upper.startsWith('RETIRED:') ||
    display_team_upper === 'RETIRED' ||
    display_team_upper === 'JOURNEYMEN'
  ) {
    const cleaned_display_team = fantasy_clean_team_value(display_team);

    if (cleaned_display_team) {
      return cleaned_display_team;
    }

    if (teams_from_row.length) {
      return teams_from_row[teams_from_row.length - 1];
    }

    const sidebar_team = fantasy_lookup_sidebar_team(row);
    const cleaned_sidebar_team = fantasy_clean_team_value(sidebar_team);

    if (cleaned_sidebar_team && !fantasy_is_multi_team_placeholder(cleaned_sidebar_team)) {
      return cleaned_sidebar_team;
    }

    return '';
  }

  const wbc_teams = new Set([
    'AUS', 'BRA', 'CAN', 'CO', 'CUB', 'CZE', 'DR', 'JPN', 'KOR',
    'MEX', 'NED', 'NIC', 'PAN', 'PR', 'VEN', 'TAI',
  ]);

  if (wbc_teams.has(display_team_upper)) {
    return 'WBC';
  }

  const placeholder_teams = new Set([
    '', 'UNK', 'MILB', 'FA', 'FREE AGENT', 'FREE AGENTS',
    'IL', 'IL7', 'IL10', 'IL15', 'IL60',
  ]);

  if (placeholder_teams.has(display_team_upper)) {
    if (teams_from_row.length) {
      return teams_from_row[teams_from_row.length - 1];
    }

    const sidebar_team = fantasy_lookup_sidebar_team(row);
    if (sidebar_team && !fantasy_is_multi_team_placeholder(sidebar_team)) {
      return fantasy_clean_team_value(sidebar_team);
    }
  }

  return fantasy_clean_team_value(display_team);
}
/* ################# */
function fantasy_row_with_ownership_fallback(row, data) {
  const out = { ...row };

  if (!fantasy_is_current_year()) {
    return out;
  }

  if (fantasy_num(out['Own%']) != null) {
    return out;
  }

  const person_key = String(out.person_key || '');
  if (!person_key) return out;

  const sections = ['hitters', 'sp', 'rp'];

  for (const section of sections) {
    const fallback_row = (data?.majors?.[section] || []).find(
      row2 => String(row2.person_key || '') === person_key
    );

    const ownership = fantasy_num(fallback_row?.['Own%']);

    if (ownership != null) {
      out['Own%'] = ownership;
      break;
    }
  }

  return out;
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
function fantasy_team_options(data) {
  const rows = fantasy_current_rows(data);

  const teams = Array.from(
    new Set(
      rows.flatMap(row => {
        const raw_team = String(row.team || '').trim();
        const display_team = String(row.display_team || fantasy_effective_team(row) || '').trim();

        if (display_team === 'WBC') {
          return ['WBC'];
        }

        if (
          fantasy_state.scope === 'majors' &&
          fantasy_is_multi_team_placeholder(raw_team)
        ) {
          return fantasy_team_values_from_row(row);
        }

        return display_team ? [display_team] : [];
      })
    )
  )
    .filter(team => fantasy_clean_team_value(team))
    .filter(team => team && team.toUpperCase() !== 'FA')
    .filter(team => team.toUpperCase() !== 'FREE AGENTS')
    .filter(team => team.toUpperCase() !== 'FREE AGENT')
    .sort((a, b) => a.localeCompare(b));

  return ['ALL', ...teams];
}
/* ################# */
function fantasy_current_rows(data) {
  let rows;

  if (fantasy_state.section === 'pitchers') {
    const sp_rows = (data?.[fantasy_state.scope]?.sp || []).map(row => ({
      ...row,
      fantasy_role_label: 'SP',
      fantasy_source_section: 'sp',
      role: row.role || 'sp',
    }));

    const rp_rows = (data?.[fantasy_state.scope]?.rp || []).map(row => ({
      ...row,
      fantasy_role_label: 'RP',
      fantasy_source_section: 'rp',
      role: row.role || 'rp',
    }));

    rows = [...sp_rows, ...rp_rows];
  } else {
    rows = data?.[fantasy_state.scope]?.[fantasy_state.section] || [];
  }

  rows = rows.map(row => ({
    ...row,
    display_team: fantasy_effective_team(row),
  }));

  if (fantasy_state.section === 'hitters' && fantasy_state.scope !== 'majors') {
    rows = rows.map(row => fantasy_row_with_position_fallback(row, data));
  }

  if (fantasy_state.scope !== 'majors') {
    rows = rows.map(row => fantasy_row_with_ownership_fallback(row, data));
  }

  return rows;
}
/* ################# */
function fantasy_filter_rows(data) {
  let rows = fantasy_current_rows(data).slice();

  rows = rows.filter(row => !fantasy_is_removed(row));

  if (fantasy_state.team !== 'ALL') {
    rows = rows.filter(row => {
      const selected_team = String(fantasy_state.team || '').trim().toUpperCase();
      const raw_team = String(row.team || '').trim();
      const display_team = String(row.display_team || fantasy_effective_team(row) || '').trim().toUpperCase();

      if (display_team === selected_team) {
        return true;
      }

    if (
      fantasy_state.scope === 'majors' &&
      fantasy_is_multi_team_placeholder(raw_team)
    ) {
      const teams = fantasy_team_values_from_row(row).map(team => team.toUpperCase());
      return teams.includes(selected_team);
    }

    return false;
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
    const qual_key = fantasy_qualifier_key();
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
function fantasy_url_params() {
  const params = new URLSearchParams();

  params.set('year', String(fantasy_state.year || ''));
  params.set('section', String(fantasy_state.section || 'hitters'));
  params.set('scope', String(fantasy_state.scope || 'majors'));
  params.set('pos', String(fantasy_state.hitter_pos || 'ALL'));
  params.set('team', String(fantasy_state.team || 'ALL'));
  params.set('qual', String(fantasy_state.qual_min || ''));
  params.set('sort', String(fantasy_state.sort_key || ''));
  params.set('desc', fantasy_state.sort_desc ? '1' : '0');
  params.set('gradients', fantasy_state.show_gradients ? '1' : '0');

  return params;
}
/* ################# */
function fantasy_push_url(replace = false) {
  const params = fantasy_url_params();
  const url = `#fantasy?${params.toString()}`;

  if (replace) {
    history.replaceState(null, '', url);
  } else {
    history.pushState(null, '', url);
  }
}
/* ################# */
function fantasy_apply_url_state() {
  const hash = String(window.location.hash || '');

  if (!hash.startsWith('#fantasy?')) return;

  const query = hash.slice(hash.indexOf('?') + 1);
  const params = new URLSearchParams(query);

  fantasy_state.year = Number(params.get('year')) || fantasy_state.year;
  fantasy_state.section = params.get('section') || fantasy_state.section;
  fantasy_state.scope = params.get('scope') || fantasy_state.scope;
  fantasy_state.hitter_pos = params.get('pos') || fantasy_state.hitter_pos;
  fantasy_state.team = params.get('team') || fantasy_state.team;
  fantasy_state.qual_min = params.get('qual') ?? fantasy_state.qual_min;
  fantasy_state.sort_key = params.get('sort') || fantasy_state.sort_key;
  fantasy_state.sort_desc = params.get('desc') !== '0';
  fantasy_state.show_gradients = params.get('gradients') === '1';
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
    ['pitchers', 'Pitchers'],
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
          ${fantasy_hitter_position_options().map(value => {
            const label = value === 'ALL' ? 'All' : value;
            return `<option value="${value}" ${value === fantasy_state.hitter_pos ? 'selected' : ''}>${label}</option>`;
          }).join('')}
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
      <div class="matchups_label">${fantasy_qualifier_label()}</div>
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

        <span class="matchups_disclaimer">Pre-2025 positions and teams WIP</span>
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
    hitters: new Set(['Pts', 'Score', 'Con', 'Val', 'RHP', 'R Hit', 'PA', 'AVG', 'Pts +/-', 'Whiff%', 'R swCon', 'FB R', 'FB L']),
    sp: new Set(['Pts', 'Score', 'Con', 'Velo', 'W', 'Val', 'LCon', 'ERA', 'Days +/-', '≥50 Qual', 'FB Stf']),
    rp: new Set(['Pts', 'Score', 'Con', 'Velo', 'W', 'Val', 'LCon', 'ERA', 'Days +/-', '≥50 Qual', 'FB Stf']),
  };

  const light_dividers_by_section = {
    hitters: new Set(['L Hit', 'L swCon', 'BB%']),
    sp: new Set(['IP', 'SI Stf', 'CT Stf', 'SL Stf', 'SW Stf', 'CB Stf', 'CH Stf', 'SP Stf']),
    rp: new Set(['IP', 'SI Stf', 'CT Stf', 'SL Stf', 'SW Stf', 'CB Stf', 'CH Stf', 'SP Stf']),
  };

  const divider_section = fantasy_state.section === 'pitchers' ? 'sp' : fantasy_state.section;
  const heavy = heavy_dividers_by_section[divider_section] || new Set();
  const light = light_dividers_by_section[divider_section] || new Set();

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
    'Disc': 'Approach',
    'LDisc': 'Loc for K/BB',
    'R swCon': 'R Good Swing%',
    'L swCon': 'L Good Swing%',
    'R swDisc': 'R Bad Swing%',
    'L swDisc': 'L Bad Swing%',
    '≥50 Qual': '+Pitches',
    'SO': 'K',
    'Velo': 'pVelo',
    };

  return label_map[col] || col;
}
/* ################# */
function fantasy_gradient_source_key(row, col) {
  const scope = String(fantasy_state.scope || '');
  let section = String(fantasy_state.section || '');

  if (section === 'pitchers') {
    section = String(row.fantasy_source_section || row.role || 'sp');

    if (section === 'starters') section = 'sp';
    if (section === 'bullpen') section = 'rp';
  }

  if (
    !col ||
    col === 'Name' ||
    col === 'Role' ||
    col === 'Pos' ||
    col === '2nd Pos' ||
    col === 'Own%' ||
    col === 'Team'
  ) {
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
// function fantasy_blend_rgba_on_rgb(rgba_str, base_rgb = [235, 240, 248]) {
//   if (typeof rgba_str !== 'string') return '';

//   const s = rgba_str.trim();
//   if (s.startsWith('rgb(')) return s;
//   if (!s.startsWith('rgba(')) return '';

//   const parts = s.replace('rgba(', '').replace(')', '').split(',');
//   if (parts.length !== 4) return '';

//   const r = Number(parts[0].trim());
//   const g = Number(parts[1].trim());
//   const b = Number(parts[2].trim());
//   const a = Number(parts[3].trim());

//   const br = base_rgb[0];
//   const bg = base_rgb[1];
//   const bb = base_rgb[2];

//   const out_r = Math.round(r * a + br * (1 - a));
//   const out_g = Math.round(g * a + bg * (1 - a));
//   const out_b = Math.round(b * a + bb * (1 - a));

//   return `rgb(${out_r},${out_g},${out_b})`;
// }
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
  const a = Math.max(0, Math.min(1, Number(parts[3].trim())));

  const br = base_rgb[0];
  const bg = base_rgb[1];
  const bb = base_rgb[2];

  return `rgb(${
    Math.round(r * a + br * (1 - a))
  },${
    Math.round(g * a + bg * (1 - a))
  },${
    Math.round(b * a + bb * (1 - a))
  })`;
}
/* ################# */
// function fantasy_gold_gradient(alpha = 1) {
//   const a = Math.max(0, Math.min(1, Number(alpha)));

//   // return `linear-gradient(
//   //   90deg,
//   //   rgba(249,242,149,${a.toFixed(3)}) 0%,
//   //   rgba(224,170,62,${a.toFixed(3)}) 32%,
//   //   rgba(250,243,152,${a.toFixed(3)}) 64%,
//   //   rgba(184,138,68,${a.toFixed(3)}) 100%
//   // )`;
// return `linear-gradient(
//   90deg,
//   rgba(249,242,149,${a.toFixed(3)}) 0%,
//   rgba(224,170,62,${a.toFixed(3)}) 100%
// )`;
// }
function fantasy_gold_gradient(alpha = 1) {
  const a = Math.max(0, Math.min(1, Number(alpha)));

  const c1 = fantasy_blend_rgba_on_rgb(`rgba(249,242,149,${a.toFixed(3)})`);
  const c2 = fantasy_blend_rgba_on_rgb(`rgba(224,170,62,${a.toFixed(3)})`);

  return `linear-gradient(
    90deg,
    ${c1} 0%,
    ${c2} 100%
  )`;
}
/* ################# */
function fantasy_standard_stats_gradient(frac, use_gold = false) {
  if (frac == null || Number.isNaN(frac)) return '';

  const x = Math.max(0, Math.min(1, Number(frac)));
  const alpha_min = 0.25;
  const alpha_max = 0.95;
  const alpha_curve_pow = 0.40;

  const d = Math.max(0, Math.min(1, Math.abs(x - 0.5) * 2.0));
  const t = Math.max(0, (d - 0.10) / 0.90);
  const alpha = alpha_min + (alpha_max - alpha_min) * (t ** alpha_curve_pow);

  if (use_gold) {
    return fantasy_gold_gradient(alpha);
  }

  const rgb = x > 0.5 ? [210, 35, 35] : [35, 85, 210];
  // return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha.toFixed(3)})`;
  return fantasy_blend_rgba_on_rgb(`rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha.toFixed(3)})`);
}
/* ################# */
function fantasy_gradient_good_only_stats(frac, use_gold = false) {
  if (frac == null || Number.isNaN(frac)) return '';

  const t = Math.max(0, Math.min(1, Number(frac)));
  const frac2 = 0.5 + 0.5 * t;

  const alpha_min = 0.25;
  const alpha_max = 0.95;
  const alpha_curve_pow = 0.40;

  const d = Math.max(0, Math.min(1, Math.abs(frac2 - 0.5) * 2.0));
  const alpha = alpha_min + (alpha_max - alpha_min) * (d ** alpha_curve_pow);

  if (use_gold) {
    return fantasy_gold_gradient(alpha);
  }

  // return `rgba(210, 35, 35,${alpha.toFixed(3)})`;
  return fantasy_blend_rgba_on_rgb(`rgba(210, 35, 35,${alpha.toFixed(3)})`);
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

  // return `rgba(35, 85, 210,${alpha.toFixed(3)})`;
  return fantasy_blend_rgba_on_rgb(`rgba(35, 85, 210,${alpha.toFixed(3)})`);
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
function fantasy_should_use_white_text(row, col, gradient_style) {
  const s = String(gradient_style || '');
  if (!s) return false;
  if (s.includes('--fantasy-tone:gold')) return false;

  return /background:\s*rgba?\(/i.test(s);
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

  if (
    fantasy_state.scope === 'majors' &&
    (
      fantasy_state.section === 'rp' ||
      (fantasy_state.section === 'pitchers' && row.fantasy_source_section === 'rp')
    )
  ) {
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

    if (spec.mode === 'good_only') {
    const start = Number(spec.start);
    const end = Number(spec.end);

    if (Number.isNaN(start) || Number.isNaN(end)) return '';
    if (num_value < start) return '';

    const frac = end === start ? 1.0 : (num_value - start) / (end - start);
    const use_gold = fantasy_use_gold_for_value(num_value, spec);
    const bg = fantasy_gradient_good_only_stats(Math.max(0, Math.min(1, frac)), use_gold);
    if (!bg) return '';

const tone_tag = use_gold ? '--fantasy-tone:gold;' : '';
const preview_style = `background:${bg};${use_gold ? '--fantasy-tone:gold;' : ''}`;
const use_white = fantasy_should_use_white_text(row, col, preview_style);
const text_color = use_gold ? 'color:#000000;' : (use_white ? 'color:#ffffff;' : 'color:#000000;');
// const font_weight = use_gold ? 'font-weight:700;' : '';
const font_weight = ''

return `${tone_tag}background:${bg};${text_color}${font_weight}`;
  }

  if (spec.mode === 'bad_only') {
    const start = Number(spec.start);
    const end = Number(spec.end);

    if (Number.isNaN(start) || Number.isNaN(end)) return '';
    if (num_value < start) return '';

    const frac = end === start ? 1.0 : (num_value - start) / (end - start);
    const bg = fantasy_gradient_bad_only_stats(Math.max(0, Math.min(1, frac)));
    if (!bg) return '';

const preview_style = `background:${bg};`;
const use_white = fantasy_should_use_white_text(row, col, preview_style);
const text_color = use_white ? 'color:#ffffff;' : 'color:#000000;';

return `background:${bg};${text_color}`;
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
  const use_gold = fantasy_use_gold_for_value(num_value, spec);
  const raw_bg = fantasy_standard_stats_gradient(frac, use_gold);
const bg = raw_bg;
  if (!bg) return '';

const preview_style = `background:${bg};${use_gold ? '--fantasy-tone:gold;' : ''}`;
const use_white = fantasy_should_use_white_text(row, col, preview_style);
const tone_tag = use_gold ? '--fantasy-tone:gold;' : '';
const text_color = use_gold ? 'color:#000000;' : (use_white ? 'color:#ffffff;' : 'color:#000000;');
// const font_weight = use_gold ? 'font-weight:700;' : '';
const font_weight = ''

return `${tone_tag}background:${bg};${text_color}${font_weight}`;
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
      } else if (col === 'Role') {
        value = escape_html(String(row.fantasy_role_label || ''));
      // } else if (col === 'Team') {
      //   value = escape_html(String(row.display_team || fantasy_effective_team(row) || row.team || ''));
      //       } else {
      } else if (col === 'Team') {
        value = fantasy_team_logo_html(row.display_team || fantasy_effective_team(row) || row.team || '');
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

      if (col === 'Name' || col === 'Role' || col === 'Pos' || col === '2nd Pos' || col === 'Team') {
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
  fantasy_apply_url_state();

  if (!fantasy_state.year) {
    fantasy_state.year = Number(window.year_page_lookup ? Object.keys(window.year_page_lookup).sort().slice(-1)[0] : new Date().getFullYear());
  }

  if (
    fantasy_state.section === 'hitters' &&
    fantasy_state.hitter_pos === 'P' &&
    Number(fantasy_state.year) >= 2022
  ) {
    fantasy_state.hitter_pos = 'ALL';
  }

  if (!fantasy_state.sort_key) {
    fantasy_state.sort_key = fantasy_default_sort_key();
    fantasy_state.sort_desc = fantasy_sort_desc(fantasy_state.sort_key);
  }

  controls_root.innerHTML = fantasy_build_controls_html({ majors: {}, playoffs: {}, spring: {}, minors: {} });

  try {
    // await load_fantasy_scales();
    // const data = await load_fantasy_data(fantasy_state.year);
    await load_fantasy_scales();
    const data = await load_fantasy_data(fantasy_state.year);
    controls_root.innerHTML = fantasy_build_controls_html(data);
    fantasy_build_page_lookup();
    const rows = fantasy_sort_rows(fantasy_filter_rows(data));
    results_root.innerHTML = fantasy_build_table_html(rows);
    await sync_fantasy_streak_emojis(results_root);
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
      fantasy_push_url();
      render_fantasy_page();
    });
  }

  if (scope_el) {
      scope_el.addEventListener('change', () => {
      fantasy_state.scope = scope_el.value;

      if (fantasy_state.scope === 'minors' && Number(fantasy_state.year) < 2022) {
        fantasy_state.year = 2026;
      }

      fantasy_state.sort_key = fantasy_default_sort_key();
      fantasy_state.sort_desc = fantasy_sort_desc(fantasy_state.sort_key);
      fantasy_push_url();
      render_fantasy_page();
    });
  }

  if (pos_el) {
    pos_el.addEventListener('change', () => {
      fantasy_state.hitter_pos = pos_el.value;
      fantasy_push_url();
      render_fantasy_page();
    });
  }

  if (qual_el) {
    qual_el.addEventListener('change', () => {
      fantasy_state.qual_min = qual_el.value;
      fantasy_push_url();
      render_fantasy_page();
    });
  }

  if (year_el) {
    year_el.addEventListener('change', () => {
      fantasy_state.year = Number(year_el.value);
      fantasy_push_url();
      render_fantasy_page();
    });
  }

  if (team_el) {
    team_el.addEventListener('change', () => {
      fantasy_state.team = team_el.value;
      fantasy_push_url();
      render_fantasy_page();
    });
  }

  if (gradients_el) {
    gradients_el.addEventListener('change', () => {
      fantasy_state.show_gradients = !!gradients_el.checked;
      fantasy_push_url();
      render_fantasy_page();
    });
  }

  if (undo_el) {
    undo_el.addEventListener('click', () => {
      fantasy_clear_removed_players();
      fantasy_push_url();
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

      fantasy_push_url();
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
      fantasy_push_url();
      render_fantasy_page();
    });
  });

results_root.querySelectorAll('.fantasy_player_link').forEach(el => {
  el.addEventListener('click', evt => {
    evt.preventDefault();

    const cached_page_id = el.getAttribute('data-page_id') || '';
    if (cached_page_id) {
      const cached_match = document.querySelector(`.toc_link[data-page="${CSS.escape(cached_page_id)}"]`);
      if (cached_match) {
        cached_match.click();
        return;
      }
    }

    const row = {
      name: el.textContent || '',
      person_key: el.getAttribute('data-person_key') || '',
      role: el.getAttribute('data-role') || '',
    };

    const match = fantasy_find_toc_link(row);
    if (!match) return;

    const page_id = match.getAttribute('data-page') || '';
    if (page_id) {
      el.setAttribute('data-page_id', page_id);
      el.setAttribute('href', `#${page_id}`);
    }
    fantasy_push_url(true);
    match.click();
  });
});
}

/* ===== fantasy_trends.js ===== */

/*#################################################################### Fantasy Trends ####################################################################*/
const fantasy_trends_state = {
  year: null,
  data: null,
  prepared_rows: {
    hitters: [],
    pitchers: [],
  },
  scrollbar_observers: new Map(),
  hide_injured: false,
  filters: {
    free_agents: {
      hitters: 'ALL',
      pitchers: 'ALL',
    },
    undervalued: {
      hitters: 'ALL',
      pitchers: 'ALL',
    },
    overvalued: {
      hitters: 'ALL',
      pitchers: 'ALL',
    },
  },
  sorts: {
    free_agents: {
      hitters: {
        key: 'Own%',
        desc: true,
      },
      pitchers: {
        key: 'Own%',
        desc: true,
      },
    },
    undervalued: {
      hitters: {
        key: 'Own%',
        desc: false,
      },
      pitchers: {
        key: 'Own%',
        desc: false,
      },
    },
    overvalued: {
      hitters: {
        key: 'Own%',
        desc: true,
      },
      pitchers: {
        key: 'Own%',
        desc: true,
      },
    },
  },
};
/* ################# */
const fantasy_trends_hitter_columns = [
  'name',
  'Own%',
  'pos',
  'team',
  'S PA',
  'S PPG',
  'S Score',
  'S All',
  'S Con',
  'S Disc',
  'S OPS',
  'S Pts +/-',
  'Pts',
  'PPG',
  'Score',
  'All',
  'Con',
  'Disc',
  'RHP',
  'LHP',
  'Pts +/-',
  'rAll',
  'PA',
  'R',
  'HR',
  'RBI',
  'SB',
  'AVG',
  'OBP',
  'SLG',
  'OPS',
  'xOPS',
];
/* ################# */
const fantasy_trends_pitcher_columns = [
  'name',
  'Own%',
  'team',
  'S IP',
  'S PPG',
  'S Score',
  'S All',
  'S Con',
  'S Disc',
  'S ERA',
  'S WHIP',
  'S Days +/-',
  'Pts',
  'PPG',
  'Score',
  'All',
  'Con',
  'Disc',
  'Days +/-',
  'rAll',
  'IP',
  'BB',
  'K',
  'ERA',
  'WHIP',
  'pERA',
];
/* ################# */
function fantasy_trends_num(v) {
  const n = Number(v);

  return (
    v !== '' &&
    v != null &&
    Number.isFinite(n)
  )
    ? n
    : null;
}
/* ################# */
function fantasy_trends_role(row, section) {
  if (section === 'hitters') {
    return 'hitters';
  }

  const pitch_role = String(
    row?.fantasy_trends_section ||
    row?.pitch_role ||
    row?.role ||
    ''
  ).trim().toUpperCase();

  if (
    pitch_role === 'RP' ||
    pitch_role === 'CL' ||
    pitch_role === 'BULLPEN'
  ) {
    return 'rp';
  }

  if (section === 'rp') {
    return 'rp';
  }

  return 'sp';
}
/* ################# */
function fantasy_trends_page_role(section) {
  if (section === 'hitters') {
    return 'batters';
  }

  if (section === 'rp') {
    return 'bullpen';
  }

  return 'starters';
}
/* ################# */
function fantasy_trends_with_fantasy_state(section, callback) {
  const previous_state = {
    year: fantasy_state.year,
    scope: fantasy_state.scope,
    section: fantasy_state.section,
    show_gradients: fantasy_state.show_gradients,
  };

  fantasy_state.year = Number(
    fantasy_trends_state.year ||
    window.DEFAULT_SEASON_YEAR ||
    new Date().getFullYear()
  );

  fantasy_state.scope = 'majors';
  fantasy_state.section = section === 'hitters'
    ? 'hitters'
    : section;

  fantasy_state.show_gradients = true;

  try {
    return callback();
  } finally {
    fantasy_state.year = previous_state.year;
    fantasy_state.scope = previous_state.scope;
    fantasy_state.section = previous_state.section;
    fantasy_state.show_gradients = previous_state.show_gradients;
  }
}
/* ################# */
function fantasy_trends_current_or_season_num(row, streak_key, season_key) {
  const streak_value = fantasy_trends_num(
    row?.[streak_key]
  );

  if (streak_value != null) {
    return streak_value;
  }

  return fantasy_trends_num(
    row?.[season_key]
  );
}
/* ################# */
function fantasy_trends_consistency(row, section) {
  if (section === 'hitters') {
    return fantasy_trends_current_or_season_num(
      row,
      'S Pts +/-',
      'Pts +/-'
    );
  }

  return fantasy_trends_current_or_season_num(
    row,
    'S Days +/-',
    'Days +/-'
  );
}
/* ################# */
function fantasy_trends_ppg_threshold(section, row, thresholds) {
  const role = fantasy_trends_role(
    row,
    section
  );

  if (role === 'hitters') {
    return thresholds.hitters;
  }

  if (role === 'rp') {
    return thresholds.rp;
  }

  return thresholds.sp;
}
/* ################# */
function fantasy_trends_status_values(row) {
  return [
    row?.team,
    row?.Team,
    row?.status,
    row?.Status,
    row?.injury_status,
  ]
    .map(value => {
      return String(
        value || ''
      ).trim().toUpperCase();
    })
    .filter(value => {
      return value;
    });
}
/* ################# */
function fantasy_trends_raw_team_status(row) {
  return fantasy_trends_status_values(
    row
  )[0] || '';
}
/* ################# */
function fantasy_trends_is_injured(row) {
  const injured_statuses = new Set([
    'IL7',
    'IL10',
    'IL15',
    '7-DAY IL',
    '10-DAY IL',
    '15-DAY IL',
    '7 DAY IL',
    '10 DAY IL',
    '15 DAY IL',
  ]);

  return fantasy_trends_status_values(
    row
  ).some(value => {
    return injured_statuses.has(
      value
    );
  });
}
/* ################# */
function fantasy_trends_is_excluded_status(row) {
  const excluded_statuses = new Set([
    'IL60',
    '60-DAY IL',
    '60 DAY IL',
    'OFS',
    'OOS',
    'OUT FOR SEASON',
    'OUT_FOR_SEASON',
    'SUSP',
    'SUSPENDED',
  ]);

  return fantasy_trends_status_values(
    row
  ).some(value => {
    return excluded_statuses.has(
      value
    );
  });
}
/* ################# */
function fantasy_trends_page_id_from_lookup(row, section) {
  const person_key = String(
    row?.person_key || ''
  ).trim();

  if (!person_key) {
    return '';
  }

  const page_role = fantasy_trends_page_role(
    section
  );

  return String(
    fantasy_page_lookup.get(
      `${page_role}|${person_key}`
    ) || ''
  ).trim();
}
/* ################# */
function fantasy_trends_is_rostered(row, section) {
  if (
    row?.fantasy_trends_is_excluded != null
  ) {
    if (row.fantasy_trends_is_excluded) {
      return false;
    }

    if (row.fantasy_trends_is_injured) {
      return true;
    }

    return Boolean(
      row.fantasy_trends_page_id
    );
  }

  if (fantasy_trends_is_excluded_status(row)) {
    return false;
  }

  if (fantasy_trends_is_injured(row)) {
    return true;
  }

  const status = fantasy_trends_raw_team_status(
    row
  );

  const excluded_non_roster_statuses = new Set([
    '',
    'FA',
    'FREE AGENT',
    'FREE AGENTS',
    'MILB',
    'UNK',
    'RETIRED',
    'JOURNEYMEN',
  ]);

  if (
    excluded_non_roster_statuses.has(
      status
    )
  ) {
    return false;
  }

  return Boolean(
    fantasy_trends_page_id_from_lookup(
      row,
      section
    )
  );
}
/* ################# */
function fantasy_trends_should_include_roster_status(row, section) {
  const is_injured = row?.fantasy_trends_is_injured != null
    ? row.fantasy_trends_is_injured
    : fantasy_trends_is_injured(row);

  if (
    fantasy_trends_state.hide_injured &&
    is_injured
  ) {
    return false;
  }

  if (
    row?.fantasy_trends_is_rostered != null
  ) {
    return row.fantasy_trends_is_rostered;
  }

  return fantasy_trends_is_rostered(
    row,
    section
  );
}
/* ################# */
function fantasy_trends_is_free_agent(row, section) {
  const own_pct = fantasy_trends_num(
    row?.['Own%']
  );

  const rall = fantasy_trends_num(
    row?.rAll
  );

  const score = fantasy_trends_current_or_season_num(
    row,
    'S Score',
    'Score'
  );

  const all = fantasy_trends_current_or_season_num(
    row,
    'S All',
    'All'
  );

  const consistency = fantasy_trends_consistency(
    row,
    section
  );

  const ppg = fantasy_trends_current_or_season_num(
    row,
    'S PPG',
    'PPG'
  );

  if (
    own_pct == null ||
    rall == null ||
    score == null ||
    all == null ||
    consistency == null ||
    ppg == null
  ) {
    return false;
  }

  if (rall < 0) {
    return false;
  }

  const min_ppg = fantasy_trends_ppg_threshold(
    section,
    row,
    {
      hitters: 2.8,
      rp: 4.5,
      sp: 8,
    }
  );

  // Captures strong recent value, balanced quality, or one elite profile metric.
  const strong_profile = (
    rall >= 25 ||
    (
      score >= 40 &&
      all >= 10
    ) ||
    score >= 60 ||
    all >= 20
  );

  // Captures productive players whose current profile is positive and repeatable.
  const productive_non_fake_streak = (
    consistency >= 20 &&
    score >= 0 &&
    all >= 0
  );

  // Captures players producing useful games at an exceptional rate regardless of profile metrics.
  const elite_consistent_production = (
    consistency >= 35
  );

  return (
    own_pct >= 1 &&
    own_pct < 40 &&
    ppg >= min_ppg &&
    (
      strong_profile ||
      productive_non_fake_streak ||
      elite_consistent_production
    )
  );
}
/* ################# */
function fantasy_trends_is_undervalued(row, section) {
  const own_pct = fantasy_trends_num(
    row?.['Own%']
  );

  const rall = fantasy_trends_num(
    row?.rAll
  );

  const streak_score = fantasy_trends_num(
    row?.['S Score']
  );

  const streak_all = fantasy_trends_num(
    row?.['S All']
  );

  const streak_ppg = fantasy_trends_num(
    row?.['S PPG']
  );

  const season_score = fantasy_trends_num(
    row?.Score
  );

  const season_all = fantasy_trends_num(
    row?.All
  );

  const season_ppg = fantasy_trends_num(
    row?.PPG
  );

  const score = streak_score ?? season_score;
  const all = streak_all ?? season_all;
  const ppg = streak_ppg ?? season_ppg;

  // Season PPG determines whether the player's established production is already too strong.
  const threshold_ppg = season_ppg ?? streak_ppg;

  const consistency = fantasy_trends_consistency(
    row,
    section
  );

  if (
    own_pct == null ||
    rall == null ||
    score == null ||
    all == null ||
    consistency == null ||
    ppg == null ||
    threshold_ppg == null
  ) {
    return false;
  }

  const max_ppg = fantasy_trends_ppg_threshold(
    section,
    row,
    {
      hitters: 5.3,
      rp: 5.5,
      sp: 18,
    }
  );

  // Captures a strong current profile whose recent aggregate results remain negative.
  const good_player_minor_slump = (
    score >= 40 &&
    all >= 5 &&
    (
      (
        streak_score != null &&
        streak_all != null &&
        streak_score >= 40 &&
        streak_all >= 5
      ) ||
      (
        rall < 0 &&
        rall >= -15
      )
    )
  );

  // Captures under-the-radar hot players while rejecting severely mismatched Score and All profiles.
  const improving_player = (
    rall >= 25 &&
    (
      (
        score >= 20 &&
        all >= -15
      ) ||
      (
        score >= 0 &&
        all >= -5
      ) ||
      (
        score >= -20 &&
        all >= 5
      )
    )
  );

  // Captures a reliable hot streak with strong Score, All, and improved PPG.
  const hot_target = (
    streak_score != null &&
    streak_all != null &&
    streak_ppg != null &&
    streak_score >= 75 &&
    streak_all >= 20 &&
    rall >= 10 &&
    consistency >= 15 &&
    (
      season_ppg == null ||
      streak_ppg >= season_ppg * 1.1
    )
  );

  // Captures a dominant profile even when consistency has not yet reached the reliable range.
  const explosive_hot_target = (
    streak_score != null &&
    streak_all != null &&
    streak_score >= 80 &&
    streak_all >= 15 &&
    rall >= 10 &&
    consistency >= 0 &&
    consistency < 12
  );

  return (
    own_pct >= 40 &&
    own_pct < 95 &&
    consistency >= 0 &&
    threshold_ppg < max_ppg &&
    (
      good_player_minor_slump ||
      improving_player ||
      hot_target ||
      explosive_hot_target
    )
  );
}
/* ################# */
function fantasy_trends_is_overvalued(row, section) {
  const own_pct = fantasy_trends_num(
    row?.['Own%']
  );

  const rall = fantasy_trends_num(
    row?.rAll
  );

  const streak_score = fantasy_trends_num(
    row?.['S Score']
  );

  const streak_all = fantasy_trends_num(
    row?.['S All']
  );

  const streak_ppg = fantasy_trends_num(
    row?.['S PPG']
  );

  const season_score = fantasy_trends_num(
    row?.Score
  );

  const season_all = fantasy_trends_num(
    row?.All
  );

  const season_ppg = fantasy_trends_num(
    row?.PPG
  );

  const score = streak_score ?? season_score;
  const all = streak_all ?? season_all;
  const ppg = streak_ppg ?? season_ppg;

  const consistency = fantasy_trends_consistency(
    row,
    section
  );

  if (
    own_pct == null ||
    rall == null ||
    score == null ||
    all == null ||
    consistency == null ||
    ppg == null
  ) {
    return false;
  }

  // A Score above 80 is too strong for the player to be considered on the Hot Seat.
  if (score > 80) {
    return false;
  }

  const slump_ppg_floor = fantasy_trends_ppg_threshold(
    section,
    row,
    {
      hitters: 4,
      rp: 4.5,
      sp: 14,
    }
  );

  // Confirms that weak profile metrics are accompanied by actual negative results.
  const negative_results = (
    rall < 0 ||
    consistency < 0
  );

  // Captures players whose Score and All are both poor and whose results have turned negative.
  const weak_profile = (
    score < -25 &&
    all < -5 &&
    negative_results
  );

  // Captures severely weak All only after recent value or consistency becomes negative.
  const very_weak_all = (
    all < -15 &&
    negative_results
  );

  // Captures severely negative recent value while the player still retains meaningful PPG.
  const severe_slump = (
    rall <= -30 &&
    ppg >= slump_ppg_floor
  );

  // Captures a major recent profile collapse with negative consistency.
  const recent_profile_collapse = (
    streak_score != null &&
    streak_all != null &&
    consistency < 0 &&
    streak_score <= -25 &&
    (
      streak_all < 0 ||
      (
        season_all != null &&
        streak_all <= season_all - 15
      )
    )
  );

  // Captures a negative current profile with PPG at least 20% below the season rate.
  const recent_production_fade = (
    streak_score != null &&
    season_ppg != null &&
    streak_ppg != null &&
    consistency < 0 &&
    streak_score < 0 &&
    streak_ppg <= season_ppg * 0.8
  );

  return (
    own_pct >= 40 &&
    consistency < 12 &&
    (
      weak_profile ||
      very_weak_all ||
      severe_slump ||
      recent_profile_collapse ||
      recent_production_fade
    )
  );
}
/* ################# */
function fantasy_trends_hitter_position_values(row) {
  const values = [
    row?.pos,
    row?.Pos,
    row?.pos2,
    row?.['2nd'],
  ];

  return [
    ...new Set(
      values
        .flatMap(value => {
          return String(
            value || ''
          )
            .toUpperCase()
            .split(/[\/,|]+/);
        })
        .map(value => {
          return value.trim();
        })
        .filter(value => {
          return value;
        })
    ),
  ];
}
/* ################# */
function fantasy_trends_hitter_matches_position(row, selected_position) {
  const selected = String(
    selected_position || 'ALL'
  ).trim().toUpperCase();

  if (selected === 'ALL') {
    return true;
  }

  return fantasy_trends_hitter_position_values(
    row
  ).includes(selected);
}
/* ################# */
function fantasy_trends_pitcher_matches_role(row, selected_role) {
  const selected = String(
    selected_role || 'ALL'
  ).trim().toUpperCase();

  if (selected === 'ALL') {
    return true;
  }

  if (selected === 'SP') {
    return row?.fantasy_trends_section === 'sp';
  }

  if (selected === 'RP') {
    return row?.fantasy_trends_section === 'rp';
  }

  return true;
}
/* ################# */
function fantasy_trends_filter_values(trend_type) {
  return (
    fantasy_trends_state.filters?.[trend_type] ||
    {
      hitters: 'ALL',
      pitchers: 'ALL',
    }
  );
}
/* ################# */
function fantasy_trends_sort_state(trend_type, table_type) {
  return (
    fantasy_trends_state.sorts?.[trend_type]?.[table_type] ||
    {
      key: 'name',
      desc: false,
    }
  );
}
/* ################# */
function fantasy_trends_default_sort_fields(trend_type) {
  if (trend_type === 'free_agents') {
    return [
      {
        key: 'Own%',
        desc: true,
      },
      {
        key: 'rAll',
        desc: true,
      },
      {
        key: 'S All',
        desc: true,
      },
      {
        key: 'All',
        desc: true,
      },
    ];
  }

  if (trend_type === 'overvalued') {
    return [
      {
        key: 'Own%',
        desc: true,
      },
      {
        key: 'S All',
        desc: false,
      },
      {
        key: 'All',
        desc: false,
      },
    ];
  }

  return [
    {
      key: 'Own%',
      desc: false,
    },
    {
      key: 'S All',
      desc: true,
    },
    {
      key: 'All',
      desc: true,
    },
  ];
}
/* ################# */
function fantasy_trends_sort_value(row, key) {
  if (key === 'name') {
    return String(
      row?.name || ''
    ).toLowerCase();
  }

  if (key === 'pos') {
    return (
      row?.fantasy_trends_positions || []
    ).join('/').toLowerCase();
  }

  if (key === 'team') {
    return String(
      row?.display_team ||
      row?.team ||
      ''
    ).toLowerCase();
  }

  return fantasy_trends_num(
    row?.[key]
  );
}
/* ################# */
function fantasy_trends_compare_values(a, b, key, desc) {
  const av = fantasy_trends_sort_value(
    a,
    key
  );

  const bv = fantasy_trends_sort_value(
    b,
    key
  );

  if (
    typeof av === 'string' ||
    typeof bv === 'string'
  ) {
    const text_cmp = String(
      av || ''
    ).localeCompare(
      String(
        bv || ''
      )
    );

    return desc
      ? -text_cmp
      : text_cmp;
  }

  if (
    av == null &&
    bv == null
  ) {
    return 0;
  }

  if (av == null) {
    return 1;
  }

  if (bv == null) {
    return -1;
  }

  if (av === bv) {
    return 0;
  }

  return desc
    ? bv - av
    : av - bv;
}
/* ################# */
function fantasy_trends_sort_rows(rows, trend_type, table_type) {
  const sort_state = fantasy_trends_sort_state(
    trend_type,
    table_type
  );

  const default_fields = fantasy_trends_default_sort_fields(
    trend_type
  );

  const fields = [
    {
      key: sort_state.key,
      desc: sort_state.desc,
    },
    ...default_fields.filter(field => {
      return field.key !== sort_state.key;
    }),
  ];

  return [...rows].sort((a, b) => {
    for (const field of fields) {
      const cmp = fantasy_trends_compare_values(
        a,
        b,
        field.key,
        field.desc
      );

      if (cmp !== 0) {
        return cmp;
      }
    }

    return String(
      a?.name || ''
    ).localeCompare(
      String(
        b?.name || ''
      )
    );
  });
}
/* ################# */
function fantasy_trends_removals_storage_key() {
  return 'fantasy_trends_removed_players_v1';
}
/* ################# */
function fantasy_trends_get_removed_map() {
  try {
    const raw = sessionStorage.getItem(
      fantasy_trends_removals_storage_key()
    );

    const parsed = raw
      ? JSON.parse(raw)
      : {};

    return (
      parsed &&
      typeof parsed === 'object'
    )
      ? parsed
      : {};
  } catch (err) {
    return {};
  }
}
/* ################# */
function fantasy_trends_set_removed_map(map) {
  sessionStorage.setItem(
    fantasy_trends_removals_storage_key(),
    JSON.stringify(
      map || {}
    )
  );
}
/* ################# */
function fantasy_trends_removed_bucket_key(trend_type, table_type) {
  return [
    String(
      fantasy_trends_state.year || ''
    ),
    String(
      trend_type || ''
    ),
    String(
      table_type || ''
    ),
  ].join('|');
}
/* ################# */
function fantasy_trends_is_removed(row, trend_type, table_type) {
  const map = fantasy_trends_get_removed_map();

  const bucket = map[
    fantasy_trends_removed_bucket_key(
      trend_type,
      table_type
    )
  ] || {};

  const person_key = String(
    row?.person_key ||
    normalize_matchup_person_key(
      row?.name || ''
    ) ||
    ''
  );

  return Boolean(
    person_key &&
    bucket[person_key]
  );
}
/* ################# */
function fantasy_trends_remove_player(row, trend_type, table_type) {
  const map = fantasy_trends_get_removed_map();

  const bucket_key = fantasy_trends_removed_bucket_key(
    trend_type,
    table_type
  );

  const bucket = map[bucket_key] || {};

  const person_key = String(
    row?.person_key ||
    normalize_matchup_person_key(
      row?.name || ''
    ) ||
    ''
  );

  if (!person_key) {
    return;
  }

  bucket[person_key] = 1;
  map[bucket_key] = bucket;

  fantasy_trends_set_removed_map(
    map
  );
}
/* ################# */
function fantasy_trends_clear_removed_players(trend_type, table_type) {
  const map = fantasy_trends_get_removed_map();

  delete map[
    fantasy_trends_removed_bucket_key(
      trend_type,
      table_type
    )
  ];

  fantasy_trends_set_removed_map(
    map
  );
}
/* ################# */
function fantasy_trends_effective_team(row, section) {
  const fantasy_row = {
    ...row,
    role: row?.role || fantasy_trends_page_role(
      section
    ),
  };

  return fantasy_trends_with_fantasy_state(
    section,
    () => {
      return fantasy_effective_team(
        fantasy_row
      );
    }
  );
}
/* ################# */
function fantasy_trends_prepare_row(row, section) {
  const prepared_row = {
    ...row,
    fantasy_trends_section: section,
    fantasy_source_section: section === 'hitters'
      ? ''
      : section,
  };

  prepared_row.display_team = fantasy_trends_effective_team(
    prepared_row,
    section
  );

  prepared_row.fantasy_trends_page_id = fantasy_trends_page_id_from_lookup(
    prepared_row,
    section
  );

  prepared_row.fantasy_trends_is_injured = fantasy_trends_is_injured(
    prepared_row
  );

  prepared_row.fantasy_trends_is_excluded = fantasy_trends_is_excluded_status(
    prepared_row
  );

  prepared_row.fantasy_trends_positions = section === 'hitters'
    ? fantasy_trends_hitter_position_values(
        prepared_row
      )
    : [];

  prepared_row.fantasy_trends_is_rostered = fantasy_trends_is_rostered(
    prepared_row,
    section
  );

  prepared_row.fantasy_trends_qualifies_free_agents = fantasy_trends_is_free_agent(
    prepared_row,
    section
  );

  prepared_row.fantasy_trends_qualifies_undervalued = fantasy_trends_is_undervalued(
    prepared_row,
    section
  );

  prepared_row.fantasy_trends_qualifies_overvalued = fantasy_trends_is_overvalued(
    prepared_row,
    section
  );

  return prepared_row;
}
/* ################# */
function fantasy_trends_prepare_data(data) {
  const majors = data?.majors || {};

  const hitters = (
    majors.hitters || []
  ).map(row => {
    return fantasy_trends_prepare_row(
      row,
      'hitters'
    );
  });

  const pitchers = [
    ...(majors.sp || []).map(row => {
      return fantasy_trends_prepare_row(
        row,
        'sp'
      );
    }),
    ...(majors.rp || []).map(row => {
      return fantasy_trends_prepare_row(
        row,
        'rp'
      );
    }),
  ];

  fantasy_trends_state.prepared_rows = {
    hitters: hitters,
    pitchers: pitchers,
  };
}
/* ################# */
function fantasy_trends_row_qualifies(
  row,
  trend_type
) {
  if (trend_type === 'free_agents') {
    return Boolean(
      row.fantasy_trends_qualifies_free_agents
    );
  }

  if (trend_type === 'undervalued') {
    return Boolean(
      row.fantasy_trends_qualifies_undervalued
    );
  }

  if (trend_type === 'overvalued') {
    return Boolean(
      row.fantasy_trends_qualifies_overvalued
    );
  }

  return false;
}
/* ################# */
function fantasy_trends_collect_table_rows(
  trend_type,
  table_type
) {
  const filters = fantasy_trends_filter_values(
    trend_type
  );

  if (table_type === 'hitters') {
    const hitters = (
      fantasy_trends_state.prepared_rows.hitters || []
    )
      .filter(row => {
        return fantasy_trends_should_include_roster_status(
          row,
          'hitters'
        );
      })
      .filter(row => {
        return fantasy_trends_row_qualifies(
          row,
          trend_type
        );
      })
      .filter(row => {
        const selected_position = String(
          filters.hitters || 'ALL'
        ).trim().toUpperCase();

        if (selected_position === 'ALL') {
          return true;
        }

        return (
          row.fantasy_trends_positions || []
        ).includes(
          selected_position
        );
      })
      .filter(row => {
        return !fantasy_trends_is_removed(
          row,
          trend_type,
          'hitters'
        );
      });

    return fantasy_trends_sort_rows(
      hitters,
      trend_type,
      'hitters'
    );
  }

  const pitchers = (
    fantasy_trends_state.prepared_rows.pitchers || []
  )
    .filter(row => {
      return fantasy_trends_should_include_roster_status(
        row,
        row.fantasy_trends_section
      );
    })
    .filter(row => {
      return fantasy_trends_row_qualifies(
        row,
        trend_type
      );
    })
    .filter(row => {
      return fantasy_trends_pitcher_matches_role(
        row,
        filters.pitchers
      );
    })
    .filter(row => {
      return !fantasy_trends_is_removed(
        row,
        trend_type,
        'pitchers'
      );
    });

  return fantasy_trends_sort_rows(
    pitchers,
    trend_type,
    'pitchers'
  );
}
/* ################# */
function fantasy_trends_collect_rows(data, trend_type) {
  return {
    hitters: fantasy_trends_collect_table_rows(
      trend_type,
      'hitters'
    ),
    pitchers: fantasy_trends_collect_table_rows(
      trend_type,
      'pitchers'
    ),
  };
}
/* ################# */
function fantasy_trends_column_label(key) {
  const label_map = {
    name: 'Name',
    pos: 'Pos',
    team: 'Team',
    'S Disc': 'S Approach',
    Disc: 'Approach',
    'S Pts +/-': 'S Consistency',
    'Pts +/-': 'Consistency',
    'S Days +/-': 'S Consistency',
    'Days +/-': 'Consistency',
  };

  return label_map[key] || fantasy_display_label(
    key
  );
}
/* ################# */
function fantasy_trends_format_value(key, value) {
  if (
    value == null ||
    value === ''
  ) {
    return '—';
  }

  const formatted = fantasy_fmt(
    key,
    value
  );

  return formatted === ''
    ? '—'
    : formatted;
}
/* ################# */
function fantasy_trends_page_link(row, section) {
  if (row?.fantasy_trends_page_id) {
    return String(
      row.fantasy_trends_page_id
    ).trim();
  }

  return fantasy_trends_page_id_from_lookup(
    row,
    section
  );
}
/* ################# */
function fantasy_trends_name_html(row, section) {
  const page = fantasy_trends_page_link(
    row,
    section
  );

  const name = escape_html(
    row?.name || ''
  );

  const person_key = String(
    row?.person_key || ''
  );

  const role = fantasy_trends_page_role(
    section
  );

  if (!page) {
    return `
      <span
        class='fantasy_trends_player_name'
        data-person_key='${escape_attr(person_key)}'
        data-role='${escape_attr(role)}'
      >
        ${name}
      </span>
    `;
  }

  return `
    <a
      href='#${escape_attr(page)}'
      class='fantasy_player_link fantasy_trends_player_link'
      data-page='${escape_attr(page)}'
      data-page_id='${escape_attr(page)}'
      data-person_key='${escape_attr(person_key)}'
      data-role='${escape_attr(role)}'
    >${name}</a>
  `;
}
/* ################# */
function fantasy_trends_team_html(row, section) {
  const team = (
    row?.display_team ||
    fantasy_trends_effective_team(
      row,
      section
    )
  );

  if (!team) {
    return '—';
  }

  return (
    fantasy_team_logo_html(
      team
    ) ||
    escape_html(
      String(team)
    )
  );
}
/* ################# */
function fantasy_trends_gradient_style(row, key, section) {
  const value = fantasy_num(
    row?.[key]
  );

  if (value == null) {
    return '';
  }

  const role_section = fantasy_trends_role(
    row,
    section
  );

  return fantasy_trends_with_fantasy_state(
    role_section,
    () => {
      return fantasy_gradient_style(
        row,
        key,
        value
      );
    }
  );
}
/* ################# */
function fantasy_trends_column_class(key) {
  const classes = [];

  if (key === 'name') {
    classes.push(
      'fantasy_trends_sticky_name'
    );
  }

  const divider_columns = new Set([
    'team',
    'S Pts +/-',
    'S Days +/-',
    'PPG',
    'Pts +/-',
    'Days +/-',
    'rAll',
    'SB',
    'K',
    'OPS',
    'WHIP',
  ]);

  if (divider_columns.has(key)) {
    classes.push(
      'fantasy_trends_team_divider'
    );
  }

  return classes.length
    ? ` ${classes.join(' ')}`
    : '';
}
/* ################# */
function fantasy_trends_cell_html(
  row,
  key,
  section,
  trend_type,
  table_type
) {
  const column_class = fantasy_trends_column_class(
    key
  );

  if (key === 'pos') {
    const positions = [
      ...new Set(
        row?.fantasy_trends_positions || []
      ),
    ];

    return `
      <td class='fantasy_trends_position_cell${column_class}'>
        ${positions.length
          ? escape_html(
              positions.join('/')
            )
          : '—'}
      </td>
    `;
  }

  if (key === 'name') {
    const remove_btn = `
      <button
        type='button'
        class='fantasy_trends_remove_btn'
        data-person-key='${escape_attr(
          String(
            row?.person_key ||
            normalize_matchup_person_key(
              row?.name || ''
            ) ||
            ''
          )
        )}'
        data-trend-type='${escape_attr(trend_type)}'
        data-table-type='${escape_attr(table_type)}'
        aria-label='Remove ${escape_attr(
          String(
            row?.name || ''
          )
        )}'
        title='Remove'
      >×</button>
    `;

    return `
      <td class='fantasy_trends_name_cell${column_class}'>
        <div class='fantasy_trends_name_cell_inner'>
          ${fantasy_trends_name_html(
            row,
            section
          )}

          ${remove_btn}
        </div>
      </td>
    `;
  }

  if (key === 'team') {
    return `
      <td class='fantasy_trends_team_cell${column_class}'>
        ${fantasy_trends_team_html(
          row,
          section
        )}
      </td>
    `;
  }

  const gradient_style = fantasy_trends_gradient_style(
    row,
    key,
    section
  );

  const use_white_text = fantasy_should_use_white_text(
    row,
    key,
    gradient_style
  );

  const cell_fill_class = use_white_text
    ? 'fantasy_cell_fill fantasy_cell_fill_white_text'
    : 'fantasy_cell_fill';

  return `
    <td class='${column_class.trim()}'>
      <div
        class='${cell_fill_class}'
        style='${escape_attr(gradient_style)}'
      >
        ${escape_html(
          fantasy_trends_format_value(
            key,
            row?.[key]
          )
        )}
      </div>
    </td>
  `;
}
/* ################# */
function fantasy_trends_filter_select_html(trend_type, table_type) {
  const filters = fantasy_trends_filter_values(
    trend_type
  );

  const selected_value = String(
    filters?.[table_type] || 'ALL'
  ).trim().toUpperCase();

  const options = table_type === 'hitters'
    ? [
        ['ALL', 'All'],
        ['C', 'C'],
        ['1B', '1B'],
        ['2B', '2B'],
        ['3B', '3B'],
        ['SS', 'SS'],
        ['OF', 'OF'],
        ['DH', 'DH'],
      ]
    : [
        ['ALL', 'All'],
        ['SP', 'SP'],
        ['RP', 'RP'],
      ];

  return `
    <label class='fantasy_trends_filter_control'>
      <span>Position</span>

      <select
        class='fantasy_trends_filter_select'
        data-trend-type='${escape_attr(trend_type)}'
        data-table-type='${escape_attr(table_type)}'
      >
        ${options.map(([value, label]) => {
          return `
            <option
              value='${escape_attr(value)}'
              ${value === selected_value ? 'selected' : ''}
            >
              ${escape_html(label)}
            </option>
          `;
        }).join('')}
      </select>
    </label>
  `;
}
/* ################# */
function fantasy_trends_sort_header_html(key, trend_type, table_type) {
  const sort_state = fantasy_trends_sort_state(
    trend_type,
    table_type
  );

  let arrow = '↕';
  let active_class = '';

  if (sort_state.key === key) {
    arrow = sort_state.desc
      ? '↓'
      : '↑';

    active_class = ' fantasy_trends_sort_btn_active';
  }

  return `
    <th class='${fantasy_trends_column_class(key).trim()}'>
      <button
        type='button'
        class='fantasy_trends_sort_btn${active_class}'
        data-sort-key='${escape_attr(key)}'
        data-trend-type='${escape_attr(trend_type)}'
        data-table-type='${escape_attr(table_type)}'
      >
        <span class='fantasy_trends_sort_label'>
          ${escape_html(
            fantasy_trends_column_label(
              key
            )
          )}
        </span>

        <span class='fantasy_trends_sort_arrow'>
          ${arrow}
        </span>
      </button>
    </th>
  `;
}
/* ################# */
function fantasy_trends_table_html(
  rows,
  columns,
  section,
  title,
  trend_type
) {
  const table_type = section === 'hitters'
    ? 'hitters'
    : 'pitchers';

  const body_html = rows.length
    ? rows.map(row => {
        const row_section = section === 'pitchers'
          ? String(
              row.fantasy_trends_section || 'sp'
            )
          : section;

        return `
          <tr>
            ${columns.map(key => {
              return fantasy_trends_cell_html(
                row,
                key,
                row_section,
                trend_type,
                table_type
              );
            }).join('')}
          </tr>
        `;
      }).join('')
    : `
      <tr>
        <td
          class='fantasy_trends_empty'
          colspan='${columns.length}'
        >
          No qualifying players
        </td>
      </tr>
    `;

  return `
    <div
      class='fantasy_trends_table_block'
      data-trend-type='${escape_attr(trend_type)}'
      data-table-type='${escape_attr(table_type)}'
    >
      <div class='fantasy_trends_table_header'>
        <div class='fantasy_trends_table_header_left'>
          <div class='fantasy_trends_table_title'>
            ${escape_html(title)}

            <span class='fantasy_trends_count'>
              ${rows.length}
            </span>
          </div>

          ${fantasy_trends_filter_select_html(
            trend_type,
            table_type
          )}

          <button
            type='button'
            class='fantasy_trends_undo_removals'
            data-trend-type='${escape_attr(trend_type)}'
            data-table-type='${escape_attr(table_type)}'
          >
            Undo Removals
          </button>
        </div>
      </div>

      <div class='fantasy_trends_scroll_shell'>
        <div
          class='fantasy_trends_top_scroll'
          aria-hidden='true'
        >
          <div class='fantasy_trends_top_scroll_inner'></div>
        </div>

        <div class='fantasy_trends_table_wrap'>
          <table class='fantasy_trends_table'>
            <thead>
              <tr>
                ${columns.map(key => {
                  return fantasy_trends_sort_header_html(
                    key,
                    trend_type,
                    table_type
                  );
                }).join('')}
              </tr>
            </thead>

            <tbody>
              ${body_html}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}
/* ################# */
function fantasy_trends_table_config(table_type) {
  if (table_type === 'hitters') {
    return {
      columns: fantasy_trends_hitter_columns,
      section: 'hitters',
      title: 'Hitters',
    };
  }

  return {
    columns: fantasy_trends_pitcher_columns,
    section: 'pitchers',
    title: 'Pitchers',
  };
}
/* ################# */
function fantasy_trends_single_table_html(
  trend_type,
  table_type
) {
  const config = fantasy_trends_table_config(
    table_type
  );

  const rows = fantasy_trends_collect_table_rows(
    trend_type,
    table_type
  );

  return fantasy_trends_table_html(
    rows,
    config.columns,
    config.section,
    config.title,
    trend_type
  );
}
/* ################# */
function fantasy_trends_table_block(
  trend_type,
  table_type
) {
  const results_root = document.getElementById(
    'fantasy_trends_results_root'
  );

  if (!results_root) {
    return null;
  }

  return results_root.querySelector(
    `.fantasy_trends_table_block[data-trend-type='${CSS.escape(trend_type)}'][data-table-type='${CSS.escape(table_type)}']`
  );
}
/* ################# */
function fantasy_trends_table_blocks(root) {
  if (!root) {
    return [];
  }

  const blocks = [];

  if (
    root.matches?.(
      '.fantasy_trends_table_block'
    )
  ) {
    blocks.push(
      root
    );
  }

  blocks.push(
    ...root.querySelectorAll(
      '.fantasy_trends_table_block'
    )
  );

  return blocks;
}
/* ################# */
async function fantasy_trends_replace_table(
  trend_type,
  table_type
) {
  const old_block = fantasy_trends_table_block(
    trend_type,
    table_type
  );

  if (!old_block) {
    return;
  }

  const old_table_wrap = old_block.querySelector(
    '.fantasy_trends_table_wrap'
  );

  const scroll_left = old_table_wrap
    ? old_table_wrap.scrollLeft
    : 0;

  const observer_key = `${trend_type}|${table_type}`;

  const existing_observer = fantasy_trends_state.scrollbar_observers.get(
    observer_key
  );

  if (existing_observer) {
    existing_observer.disconnect();

    fantasy_trends_state.scrollbar_observers.delete(
      observer_key
    );
  }

  const template = document.createElement(
    'template'
  );

  template.innerHTML = fantasy_trends_single_table_html(
    trend_type,
    table_type
  ).trim();

  const new_block = template.content.firstElementChild;

  if (!new_block) {
    return;
  }

  old_block.replaceWith(
    new_block
  );

  bind_fantasy_trends_player_links(
    new_block
  );

  bind_fantasy_trends_filters(
    new_block
  );

  bind_fantasy_trends_sorting(
    new_block
  );

  bind_fantasy_trends_removals(
    new_block
  );

  bind_fantasy_trends_scrollbars(
    new_block,
    {
      [observer_key]: scroll_left,
    }
  );

  await sync_fantasy_streak_emojis(
    new_block
  );

  requestAnimationFrame(() => {
    fantasy_trends_sync_top_scroll(
      new_block
    );
  });
}
/* ################# */
async function fantasy_trends_replace_all_tables() {
  const table_keys = [
    ['free_agents', 'hitters'],
    ['free_agents', 'pitchers'],
    ['undervalued', 'hitters'],
    ['undervalued', 'pitchers'],
    ['overvalued', 'hitters'],
    ['overvalued', 'pitchers'],
  ];

  for (const [trend_type, table_type] of table_keys) {
    await fantasy_trends_replace_table(
      trend_type,
      table_type
    );
  }
}
/* ################# */
function fantasy_trends_section_html(title, trend_type, data) {
  const rows = fantasy_trends_collect_rows(
    data,
    trend_type
  );

  return `
    <section
      class='fantasy_trends_section'
      data-trend-type='${escape_attr(trend_type)}'
    >
      <div class='fantasy_trends_section_title'>
        ${escape_html(title)}
      </div>

      ${fantasy_trends_table_html(
        rows.hitters,
        fantasy_trends_hitter_columns,
        'hitters',
        'Hitters',
        trend_type
      )}

      ${fantasy_trends_table_html(
        rows.pitchers,
        fantasy_trends_pitcher_columns,
        'pitchers',
        'Pitchers',
        trend_type
      )}
    </section>
  `;
}
/* ################# */
function fantasy_trends_controls_html() {
  return `
    <div class='fantasy_trends_controls'>
      <div class='fantasy_trends_note'>
        Me trying to automate trends and my own opinions with formulas lol
      </div>

      <label
        class='fantasy_trends_hide_injured_control'
        for='fantasy_trends_hide_injured'
      >
        <input
          id='fantasy_trends_hide_injured'
          type='checkbox'
          ${fantasy_trends_state.hide_injured ? 'checked' : ''}
        >

        <span>Hide injured players</span>
      </label>
    </div>
  `;
}
/* ################# */
function fantasy_trends_results_html(data) {
  return `
    <div class='fantasy_trends_sections'>
      ${fantasy_trends_section_html(
        'Hot Free Agents',
        'free_agents',
        data
      )}

      ${fantasy_trends_section_html(
        'Buy Low/Target',
        'undervalued',
        data
      )}

      ${fantasy_trends_section_html(
        'Hot Seat/Skeptical',
        'overvalued',
        data
      )}
    </div>
  `;
}
/* ################# */
function fantasy_trends_capture_scroll_state(root) {
  const state = {};

  root?.querySelectorAll(
    '.fantasy_trends_table_block'
  ).forEach(block => {
    const trend_type = String(
      block.dataset.trendType || ''
    );

    const table_type = String(
      block.dataset.tableType || ''
    );

    const table_wrap = block.querySelector(
      '.fantasy_trends_table_wrap'
    );

    state[
      `${trend_type}|${table_type}`
    ] = table_wrap
      ? table_wrap.scrollLeft
      : 0;
  });

  return state;
}
/* ################# */
function fantasy_trends_restore_scroll_state(root, state) {
  if (!state) {
    return;
  }

  root?.querySelectorAll(
    '.fantasy_trends_table_block'
  ).forEach(block => {
    const trend_type = String(
      block.dataset.trendType || ''
    );

    const table_type = String(
      block.dataset.tableType || ''
    );

    const left = Number(
      state[
        `${trend_type}|${table_type}`
      ] || 0
    );

    const table_wrap = block.querySelector(
      '.fantasy_trends_table_wrap'
    );

    const top_scroll = block.querySelector(
      '.fantasy_trends_top_scroll'
    );

    if (table_wrap) {
      table_wrap.scrollLeft = left;
    }

    if (top_scroll) {
      top_scroll.scrollLeft = left;
    }
  });
}
/* ################# */
function fantasy_trends_sync_top_scroll(block) {
  const top_scroll = block.querySelector(
    '.fantasy_trends_top_scroll'
  );

  const top_inner = block.querySelector(
    '.fantasy_trends_top_scroll_inner'
  );

  const table_wrap = block.querySelector(
    '.fantasy_trends_table_wrap'
  );

  const table = block.querySelector(
    '.fantasy_trends_table'
  );

  if (
    !top_scroll ||
    !top_inner ||
    !table_wrap ||
    !table
  ) {
    return;
  }

  const scroll_width = Math.max(
    Math.ceil(
      table.scrollWidth
    ),
    Math.ceil(
      table_wrap.scrollWidth
    )
  );

  top_inner.style.width = `${scroll_width}px`;
  top_scroll.style.display = 'block';
  top_scroll.scrollLeft = table_wrap.scrollLeft;
}
/* ################# */
function bind_fantasy_trends_scrollbars(
  root,
  scroll_state = null
) {
  fantasy_trends_table_blocks(
    root
  ).forEach(block => {
    const trend_type = String(
      block.dataset.trendType || ''
    );

    const table_type = String(
      block.dataset.tableType || ''
    );

    const observer_key = `${trend_type}|${table_type}`;

    const old_observer = fantasy_trends_state.scrollbar_observers.get(
      observer_key
    );

    if (old_observer) {
      old_observer.disconnect();

      fantasy_trends_state.scrollbar_observers.delete(
        observer_key
      );
    }

    const top_scroll = block.querySelector(
      '.fantasy_trends_top_scroll'
    );

    const table_wrap = block.querySelector(
      '.fantasy_trends_table_wrap'
    );

    const table = block.querySelector(
      '.fantasy_trends_table'
    );

    if (
      !top_scroll ||
      !table_wrap ||
      !table
    ) {
      return;
    }

    let syncing_from_top = false;
    let syncing_from_bottom = false;

    top_scroll.addEventListener(
      'scroll',
      () => {
        if (syncing_from_bottom) {
          return;
        }

        syncing_from_top = true;
        table_wrap.scrollLeft = top_scroll.scrollLeft;
        syncing_from_top = false;
      }
    );

    table_wrap.addEventListener(
      'scroll',
      () => {
        if (syncing_from_top) {
          return;
        }

        syncing_from_bottom = true;
        top_scroll.scrollLeft = table_wrap.scrollLeft;
        syncing_from_bottom = false;
      }
    );

    const saved_left = Number(
      scroll_state?.[observer_key] || 0
    );

    const sync_layout = () => {
      fantasy_trends_sync_top_scroll(
        block
      );

      table_wrap.scrollLeft = saved_left;
      top_scroll.scrollLeft = saved_left;
    };

    requestAnimationFrame(() => {
      sync_layout();

      requestAnimationFrame(
        sync_layout
      );

      setTimeout(
        sync_layout,
        60
      );
    });

    if (window.ResizeObserver) {
      const resize_observer = new ResizeObserver(
        () => {
          fantasy_trends_sync_top_scroll(
            block
          );
        }
      );

      resize_observer.observe(
        table_wrap
      );

      resize_observer.observe(
        table
      );

      fantasy_trends_state.scrollbar_observers.set(
        observer_key,
        resize_observer
      );
    }
  });
}
/* ################# */
async function fantasy_trends_refresh_results(scroll_state = null) {
  const results_root = document.getElementById(
    'fantasy_trends_results_root'
  );

  if (
    !results_root ||
    !fantasy_trends_state.data
  ) {
    return;
  }

  const saved_scroll_state = scroll_state ||
    fantasy_trends_capture_scroll_state(
      results_root
    );

  results_root.innerHTML = fantasy_trends_results_html(
    fantasy_trends_state.data
  );

  bind_fantasy_trends_player_links(
    results_root
  );

  bind_fantasy_trends_filters(
    results_root
  );

  bind_fantasy_trends_sorting(
    results_root
  );

  bind_fantasy_trends_removals(
    results_root
  );

  bind_fantasy_trends_scrollbars(
    results_root,
    saved_scroll_state
  );

  await sync_fantasy_streak_emojis(
    results_root
  );

  requestAnimationFrame(() => {
    results_root.querySelectorAll(
      '.fantasy_trends_table_block'
    ).forEach(block => {
      fantasy_trends_sync_top_scroll(
        block
      );
    });
  });
}
/* ################# */
function bind_fantasy_trends_player_links(root) {
  const scope = root || document;

  scope.querySelectorAll(
    '.fantasy_trends_player_link[data-page]'
  ).forEach(a => {
    if (a.dataset.bound === '1') {
      return;
    }

    a.dataset.bound = '1';

    a.addEventListener('click', e => {
      e.preventDefault();

      const page = String(
        a.dataset.page || ''
      ).trim();

      if (!page) {
        return;
      }

      activate_page(
        page
      );
    });
  });
}
/* ################# */
function bind_fantasy_trends_filters(root) {
  const scope = root || document;

  scope.querySelectorAll(
    '.fantasy_trends_filter_select'
  ).forEach(select => {
    if (select.dataset.bound === '1') {
      return;
    }

    select.dataset.bound = '1';

    select.addEventListener('change', () => {
      const trend_type = String(
        select.dataset.trendType || ''
      ).trim();

      const table_type = String(
        select.dataset.tableType || ''
      ).trim();

      if (
        !fantasy_trends_state.filters?.[trend_type] ||
        ![
          'hitters',
          'pitchers',
        ].includes(table_type)
      ) {
        return;
      }

      fantasy_trends_state.filters[
        trend_type
      ][
        table_type
      ] = String(
        select.value || 'ALL'
      ).trim().toUpperCase();

      fantasy_trends_replace_table(
        trend_type,
        table_type
      );
    });
  });
}
/* ################# */
function bind_fantasy_trends_sorting(root) {
  const scope = root || document;

  scope.querySelectorAll(
    '.fantasy_trends_sort_btn'
  ).forEach(button => {
    if (button.dataset.bound === '1') {
      return;
    }

    button.dataset.bound = '1';

    button.addEventListener('click', () => {
      const trend_type = String(
        button.dataset.trendType || ''
      ).trim();

      const table_type = String(
        button.dataset.tableType || ''
      ).trim();

      const sort_key = String(
        button.dataset.sortKey || ''
      );

      const sort_state = fantasy_trends_state.sorts?.[
        trend_type
      ]?.[
        table_type
      ];

      if (
        !sort_state ||
        !sort_key
      ) {
        return;
      }

      if (sort_state.key === sort_key) {
        sort_state.desc = !sort_state.desc;
      } else {
        sort_state.key = sort_key;

        if (
          sort_key === 'name' ||
          sort_key === 'team'
        ) {
          sort_state.desc = false;
        } else if (sort_key === 'Own%') {
          sort_state.desc = trend_type !== 'undervalued';
        } else {
          const sample_section = table_type === 'hitters'
            ? 'hitters'
            : 'sp';

          sort_state.desc = fantasy_trends_with_fantasy_state(
            sample_section,
            () => {
              return fantasy_sort_desc(
                sort_key
              );
            }
          );
        }
      }

      fantasy_trends_replace_table(
        trend_type,
        table_type
      );
    });
  });
}
/* ################# */
function bind_fantasy_trends_removals(root) {
  const scope = root || document;

  scope.querySelectorAll(
    '.fantasy_trends_remove_btn'
  ).forEach(button => {
    if (button.dataset.bound === '1') {
      return;
    }

    button.dataset.bound = '1';

    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();

      const trend_type = String(
        button.dataset.trendType || ''
      ).trim();

      const table_type = String(
        button.dataset.tableType || ''
      ).trim();

      const person_key = String(
        button.dataset.personKey || ''
      ).trim();

      if (
        !trend_type ||
        !table_type ||
        !person_key
      ) {
        return;
      }

      fantasy_trends_remove_player(
        {
          person_key: person_key,
        },
        trend_type,
        table_type
      );

      fantasy_trends_replace_table(
        trend_type,
        table_type
      );
    });
  });

  scope.querySelectorAll(
    '.fantasy_trends_undo_removals'
  ).forEach(button => {
    if (button.dataset.bound === '1') {
      return;
    }

    button.dataset.bound = '1';

    button.addEventListener('click', () => {
      const trend_type = String(
        button.dataset.trendType || ''
      ).trim();

      const table_type = String(
        button.dataset.tableType || ''
      ).trim();

      if (
        !trend_type ||
        !table_type
      ) {
        return;
      }

      fantasy_trends_clear_removed_players(
        trend_type,
        table_type
      );

      fantasy_trends_replace_table(
        trend_type,
        table_type
      );
    });
  });
}
/* ################# */
function bind_fantasy_trends_controls(root) {
  const scope = root || document;

  const hide_injured = scope.querySelector(
    '#fantasy_trends_hide_injured'
  );

  if (
    hide_injured &&
    hide_injured.dataset.bound !== '1'
  ) {
    hide_injured.dataset.bound = '1';

    hide_injured.addEventListener(
      'change',
      () => {
        fantasy_trends_state.hide_injured = Boolean(
          hide_injured.checked
        );

        fantasy_trends_replace_all_tables();
      }
    );
  }
}
/* ################# */
async function render_fantasy_trends_page() {
  const controls_root = document.getElementById(
    'fantasy_trends_controls_root'
  );

  const results_root = document.getElementById(
    'fantasy_trends_results_root'
  );

  if (
    !controls_root ||
    !results_root
  ) {
    return;
  }

  const year = String(
    fantasy_trends_state.year ||
    window.DEFAULT_SEASON_YEAR ||
    new Date().getFullYear()
  );

  fantasy_trends_state.year = year;

  controls_root.innerHTML = fantasy_trends_controls_html();

  bind_fantasy_trends_controls(
    controls_root
  );

  results_root.innerHTML = `
    <div class='fantasy_trends_loading'>
      Loading…
    </div>
  `;

  try {
    await load_fantasy_scales();

    const data = await load_fantasy_data(
      year
    );

    if (!data) {
      fantasy_trends_state.data = null;

      results_root.innerHTML = `
        <div class='fantasy_trends_empty'>
          No fantasy data found for ${escape_html(year)}
        </div>
      `;

      return;
    }

    fantasy_trends_state.data = data;

    fantasy_build_page_lookup();

    fantasy_trends_prepare_data(
      data
    );

    await fantasy_trends_refresh_results();
  } catch (err) {
    fantasy_trends_state.data = null;

    results_root.innerHTML = `
      <div class='fantasy_trends_empty'>
        ${escape_html(
          String(
            err?.message ||
            err ||
            'Unable to load fantasy trends'
          )
        )}
      </div>
    `;
  }
}
/* ################# */
function init_fantasy_trends_page_if_present(content) {
  const scope = content || document;

  if (
    !scope.querySelector(
      '#fantasy_trends_results_root'
    )
  ) {
    return;
  }

  render_fantasy_trends_page();
}