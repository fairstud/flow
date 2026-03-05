const SUPABASE_URL = 'https://cdvxlzjroubzzfxzrhmp.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_FcDPxHEqaBJ1jLi_rB8o0A_upxm2XZv';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  }
});

let currentUser = null;
let currentProfile = null;
let realtimeSub = null;
let replyTargetPostId = null;
let quoteTargetPost = null;

const SLOWMODE_MS = 5000;
const DAILY_POINTS_LIMIT = 200;
const POINTS_PER_MSG = 5;
const MIN_MSG_CHARS = 10;

const BOOST_LEVELS = [
  { level: 0, threshold: 0,     label: '',        color: '' },
  { level: 1, threshold: 500,   label: 'Level 1', color: '#4ade80' },
  { level: 2, threshold: 2000,  label: 'Level 2', color: '#60a5fa' },
  { level: 3, threshold: 5000,  label: 'Level 3', color: '#a78bfa' },
  { level: 4, threshold: 15000, label: 'Level 4', color: '#f59e0b' },
];

const BADGE_CATALOG = [
  { id: 'circle',   price: 100,   symbol: '●', color: 'white', label: 'Circle' },
  { id: 'square',   price: 100,   symbol: '■', color: 'white', label: 'Square' },
  { id: 'diamond',  price: 200,   symbol: '◆', color: 'white', label: 'Diamond' },
  { id: 'star',     price: 300,   symbol: '★', color: 'white', label: 'Star' },
  { id: 'triangle', price: 300,   symbol: '▲', color: 'white', label: 'Triangle' },
  { id: 'heart',    price: 500,   symbol: '♥', color: 'blue',  label: 'Heart' },
  { id: 'bolt',     price: 500,   symbol: '⚡', color: 'blue',  label: 'Lightning' },
  { id: 'clover',   price: 1000,  symbol: '♣', color: 'blue',  label: 'Clover' },
  { id: 'gem',      price: 2000,  symbol: '◈', color: 'blue',  label: 'Gem' },
  { id: 'shield',   price: 3000,  symbol: '⛨', color: 'blue',  label: 'Shield' },
  { id: 'sword',    price: 5000,  symbol: '⚔', color: 'blue',  label: 'Crossed Swords' },
  { id: 'fleur',    price: 7500,  symbol: '⚜', color: 'blue',  label: 'Fleur-de-lis' },
  { id: 'crown',    price: 10000, symbol: '♛', color: 'blue',  label: 'Crown' },
];

const _discLastSend = {};

function getOrCreateDeviceId() {
  let deviceId = localStorage.getItem('flow_device_id');
  if (!deviceId) {
    deviceId = 'dev_' + Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem('flow_device_id', deviceId);
  }
  return deviceId;
}

function isShadowbanned(profile) {
  return profile?.is_shadowbanned === true;
}

const icons = {
  like: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
  fire: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.56 2.75c4.37 6.03 6.02 9.42 8.03 17.72m2.54-15.6c3.72 4.35 4.4 8.15 5.15 17.99M19.79 22.75c-1.25.75-9.36.75-10.61 0"/></svg>',
  follow: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/><line x1="12" y1="12" x2="12" y2="18"/><line x1="9" y1="15" x2="15" y2="15"/></svg>',
  repost: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>',
  comment: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
  mention: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="8"/><path d="M8 19c1.5 2.5 4 2.5 8 0"/></svg>',
};

const qs  = (s, ctx = document) => ctx.querySelector(s);
const qsa = (s, ctx = document) => Array.from(ctx.querySelectorAll(s));

function esc(str) {
  if (str == null) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;');
}

function linkify(text) {
  return esc(text)
    .replace(/#(\w+)/g, '<a href="#/explore/#$1" class="tag-link">#$1</a>')
    .replace(/@(\w+)/g, '<a href="#/profile/$1">@$1</a>');
}

function timeAgo(d) {
  const s = Math.floor((Date.now() - new Date(d)) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  return new Date(d).toLocaleDateString('en', { month: 'short', day: 'numeric' });
}

function avatarEl(profile, size = 'size-md') {
  const init = (profile?.username || '?')[0].toUpperCase();
  if (profile?.avatar_url) {
    return `<div class="avatar ${size}"><img src="${esc(profile.avatar_url)}" alt="${esc(profile.username)}" loading="lazy" /></div>`;
  }
  return `<div class="avatar ${size}" style="background:${strToColor(profile?.username||'?')}">${esc(init)}</div>`;
}

function strToColor(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  const hue = Math.abs(h) % 360;
  return `hsl(${hue},55%,22%)`;
}

function isAdmin() {
  return currentProfile?.username === 'flow' || currentProfile?.username === 'noreply';
}

function isSystemAccount() {
  return currentProfile?.username === 'noreply';
}

function canPinPosts(profile) {
  return profile?.username === 'flow';
}

function badgesFor(profile) {
  if (!profile) return '';
  let b = '';
  if (profile.username === 'flow' || profile.verified)
    b += `<img class="verified-badge" src="https://img.icons8.com/fluency/96/instagram-verification-badge.png" title="${profile.username === 'flow' ? 'Admin' : 'Verified'}" />`;
  if (profile.equipped_badge) {
    const badge = BADGE_CATALOG.find(x => x.id === profile.equipped_badge);
    if (badge) b += `<span class="user-badge ${badge.color === 'blue' ? 'badge-blue' : 'badge-white'}" title="${esc(badge.label)}">${badge.symbol}</span>`;
  }
  return b;
}

function showToast(msg, type = '') {
  const el = qs('#toast-el');
  el.textContent = msg;
  el.style.background = type === 'error' ? 'rgba(60,10,10,.95)' : '';
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2800);
}

function setBtn(btn, loading, text) {
  btn.disabled = loading;
  btn.textContent = loading ? '…' : text;
}

function init() {
  setupAuth();
  setupLoginPage();
  setupCompose();
  setupReplyModal();
  setupQuoteModal();
  window.addEventListener('hashchange', () => route());
  initApp();
}

function route() {
  const hash = location.hash.replace(/^#\/?/, '') || 'feed';
  const parts = hash.split('/').filter(Boolean);
  const page = parts[0] || 'feed';
  const sub  = parts[1] || '';
  const sub2 = parts[2] || '';
  const params = new URLSearchParams(location.hash.split('?')[1] || '');

  if (page === 'login') {
    if (currentUser) {
      location.hash = '#/feed';
      return;
    }
    qs('#topbar').classList.add('hidden');
    qs('#sidebar').classList.add('hidden');
    qs('#right-panel').classList.add('hidden');
    qs('.bottom-nav').classList.add('hidden');
    qsa('.route-view').forEach(v => v.classList.add('hidden'));
    qs('#view-login').classList.remove('hidden');
    return;
  }

  if (!currentUser) {
    location.hash = '#/login';
    return;
  }

  qs('#topbar').classList.remove('hidden');
  qs('.bottom-nav').classList.remove('hidden');

  const navRoutes = ['feed','explore','notifications','bookmarks','settings','chats','communities','marketplace'];
  const isTopLevel = navRoutes.includes(page) || (page === 'profile' && !sub);
  qs('#back-btn').classList.toggle('hidden', isTopLevel);

  qsa('[data-route]').forEach(el => {
    const r = el.dataset.route;
    el.classList.toggle('active',
      r === page ||
      (r === 'profile' && page === 'profile' && !sub) ||
      (r === 'chats' && (page === 'chat' || page === 'group')) ||
      (r === 'communities' && page === 'c')
    );
  });

  qsa('.route-view').forEach(v => v.classList.add('hidden'));

  if (page === 'feed') { _rtViewedUserId = null; qs('#rt-banner')?.remove(); _rtBannerShown = false; _feedNewestTs = null; qs('#view-feed').classList.remove('hidden'); renderFeed(); }
  else if (page === 'explore') { qs('#view-explore').classList.remove('hidden'); renderExplore(sub, params.get('tag')); }
  else if (page === 'notifications') {
    if (!requireAuth()) return;
    qs('#view-notifications').classList.remove('hidden'); renderNotifications();
  }
  else if (page === 'bookmarks') {
    if (!requireAuth()) return;
    qs('#view-bookmarks').classList.remove('hidden'); renderBookmarks();
  }
  else if (page === 'profile') {
    if (!sub && !currentUser) { requireAuth(); return; }
    qs('#view-profile').classList.remove('hidden');
    renderProfile(sub || currentProfile?.username);
  }
  else if (page === 'post') { qs('#view-post').classList.remove('hidden'); renderPostDetail(sub); }
  else if (page === 'settings') {
    if (!requireAuth()) return;
    qs('#view-settings').classList.remove('hidden'); renderSettings();
  }
  else if (page === 'chats') {
    if (!requireAuth()) return;
    qs('#view-chats').classList.remove('hidden'); renderChats();
  }
  else if (page === 'chat') {
    if (!requireAuth()) return;
    qs('#view-chat').classList.remove('hidden'); renderChat(sub);
  }
  else if (page === 'group') {
    if (!requireAuth()) return;
    qs('#view-group').classList.remove('hidden'); renderGroupChat(sub);
  }
  else if (page === 'communities') {
    if (!requireAuth()) return;
    qs('#view-communities').classList.remove('hidden'); renderCommunities();
  }
  else if (page === 'marketplace') {
    if (!requireAuth()) return;
    qs('#view-marketplace').classList.remove('hidden'); renderMarketplace();
  }
  else if (page === 'c') {
    if (sub && !sub2) { location.hash = `#/c/${sub}/posts`; return; }
    if (sub2 === 'post' && parts[3]) {
      qs('#view-discussion').classList.remove('hidden'); renderDiscussion(sub, parts[3]);
    } else {
      qs('#view-community').classList.remove('hidden'); renderCommunity(sub, sub2 || 'posts');
    }
  }
  else location.hash = '#/feed';
}

function setupAuth() {
  qsa('.auth-tab').forEach(t => t.addEventListener('click', () => {
    qsa('.auth-tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    qsa('.auth-form').forEach(f => f.classList.remove('active'));
    qs(`#${t.dataset.tab}-form`).classList.add('active');
  }));

  let usernameDebounce;
  qs('#reg-username').addEventListener('input', function() {
    const currentVal = this.value;
    const filteredVal = currentVal.toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (currentVal !== filteredVal) this.value = filteredVal;
    const hint = qs('#username-hint');
    clearTimeout(usernameDebounce);
    if (filteredVal.length < 3) {
      hint.textContent = filteredVal.length ? 'Too short (min 3 chars)' : '';
      hint.style.color = 'var(--red)';
      return;
    }
    hint.textContent = 'Checking…';
    hint.style.color = 'var(--muted2)';
    usernameDebounce = setTimeout(async () => {
      if (qs('#reg-username').value !== filteredVal) return;
      try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 3000);
        const { data, error } = await sb.from('profiles').select('id').eq('username', filteredVal).maybeSingle().abortSignal(controller.signal);
        clearTimeout(t);
        if (qs('#reg-username').value !== filteredVal) return;
        if (error || data === undefined) { hint.textContent = ''; return; }
        hint.textContent = data ? 'Already taken' : 'Available ✓';
        hint.style.color = data ? 'var(--red)' : 'var(--green)';
      } catch { hint.textContent = ''; }
    }, 500);
  });

  qs('#login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const username = qs('#login-username').value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    const pass  = qs('#login-password').value;
    const errEl = qs('#login-error');
    const btn   = qs('#login-submit');
    errEl.textContent = ''; errEl.className = 'form-msg';
    if (!username || !pass) { errEl.textContent = 'Enter username and password.'; errEl.className = 'form-msg error'; return; }
    setBtn(btn, true, 'Sign in');
    
    const email = `${username}@flowapp.net`;
    const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
    
    setBtn(btn, false, 'Sign in');
    if (error) {
      errEl.textContent = error.message;
      errEl.className = 'form-msg error';
    } else if (data?.session) {
      currentUser = data.session.user;
      await ensureProfile();
      updateAuthUI();
      setComposeAvatar();
      qs('#page-auth').classList.add('hidden');
      qs('#page-app').classList.remove('hidden');
      if (!location.hash || location.hash === '#' || location.hash === '#/') location.hash = '#/feed';
      route();
      loadNotifCount();
      loadRightPanel();
      subscribeRealtime();
    }
  });

  qs('#register-form').addEventListener('submit', async e => {
    e.preventDefault();
    const username = qs('#reg-username').value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    const pass     = qs('#reg-password').value;
    const errEl    = qs('#reg-error');
    const btn      = qs('#reg-submit');
    errEl.textContent = ''; errEl.className = 'form-msg';
    if (!username || username.length < 3) { errEl.textContent = 'Username must be 3+ characters.'; errEl.className = 'form-msg error'; return; }
    if (pass.length < 8) { errEl.textContent = 'Password must be 8+ characters.'; errEl.className = 'form-msg error'; return; }
    
    const email = `${username}@flowapp.net`;
    
    setBtn(btn, true, 'Create account');
    const { data: authData, error } = await sb.auth.signUp({ email, password: pass, options: { data: { username } } });
    setBtn(btn, false, 'Create account');
    if (error) { errEl.textContent = error.message; errEl.className = 'form-msg error'; }
    else {
      errEl.textContent = 'Account created! Sign in with your username.'; errEl.className = 'form-msg success';
    }
  });

  qs('#logout-btn').addEventListener('click', () => {
    showConfirmModal({
      title: 'Sign out',
      message: 'Are you sure you want to sign out of your account?',
      confirmText: 'Sign out',
      confirmClass: 'btn-danger',
      onConfirm: () => sb.auth.signOut()
    });
  });
  qs('#new-post-btn').addEventListener('click', () => { if (!requireAuth()) return; qs('#compose-modal').classList.add('open'); setComposeAvatar(); });
  qs('#back-btn').addEventListener('click', () => history.back());
  qs('#notif-btn').addEventListener('click', () => { if (!requireAuth()) return; location.hash = '#/notifications'; });
}

function setupLoginPage() {
  qsa('.login-tab').forEach(t => t.addEventListener('click', () => {
    const tabName = t.dataset.tab === 'login-tab' ? 'login-page' : 'register-page';
    qsa('.login-tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    qsa('.login-form').forEach(f => f.classList.remove('active'));
    qs(`#${tabName}-form`).classList.add('active');
  }));

  let usernameDebounce;
  qs('#register-page-username').addEventListener('input', function() {
    const currentVal = this.value;
    const filteredVal = currentVal.toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (currentVal !== filteredVal) this.value = filteredVal;
    const hint = qs('#register-page-username-hint');
    clearTimeout(usernameDebounce);
    if (filteredVal.length < 3) {
      hint.textContent = filteredVal.length ? 'Too short (min 3 chars)' : '';
      hint.style.color = 'var(--red)';
      return;
    }
    hint.textContent = 'Checking…';
    hint.style.color = 'var(--muted2)';
    usernameDebounce = setTimeout(async () => {
      if (qs('#register-page-username').value !== filteredVal) return;
      try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 3000);
        const { data, error } = await sb.from('profiles').select('id').eq('username', filteredVal).maybeSingle().abortSignal(controller.signal);
        clearTimeout(t);
        if (qs('#register-page-username').value !== filteredVal) return;
        if (error || data === undefined) { hint.textContent = ''; return; }
        hint.textContent = data ? 'Already taken' : 'Available ✓';
        hint.style.color = data ? 'var(--red)' : 'var(--green)';
      } catch { hint.textContent = ''; }
    }, 500);
  });

  qs('#login-page-form').addEventListener('submit', async e => {
    e.preventDefault();
    const username = qs('#login-page-username').value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    const pass  = qs('#login-page-password').value;
    const errEl = qs('#login-page-error');
    const btn   = qs('#login-page-submit');
    errEl.textContent = ''; errEl.className = 'form-msg';
    if (!username || !pass) { errEl.textContent = 'Enter username and password.'; errEl.className = 'form-msg error'; return; }
    setBtn(btn, true, 'Sign in');
    
    const email = `${username}@flowapp.net`;
    const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
    
    setBtn(btn, false, 'Sign in');
    if (error) {
      errEl.textContent = error.message;
      errEl.className = 'form-msg error';
    } else if (data?.session) {
      currentUser = data.session.user;
      await ensureProfile();
      updateAuthUI();
      setComposeAvatar();
      location.hash = '#/feed';
      route();
      loadNotifCount();
      loadRightPanel();
      subscribeRealtime();
    }
  });

  qs('#register-page-form').addEventListener('submit', async e => {
    e.preventDefault();
    const username = qs('#register-page-username').value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    const pass     = qs('#register-page-password').value;
    const errEl    = qs('#register-page-error');
    const btn      = qs('#register-page-submit');
    errEl.textContent = ''; errEl.className = 'form-msg';
    if (!username || username.length < 3) { errEl.textContent = 'Username must be 3+ characters.'; errEl.className = 'form-msg error'; return; }
    if (pass.length < 8) { errEl.textContent = 'Password must be 8+ characters.'; errEl.className = 'form-msg error'; return; }
    
    const email = `${username}@flowapp.net`;
    
    setBtn(btn, true, 'Create account');
    const { data: authData, error } = await sb.auth.signUp({ email, password: pass, options: { data: { username } } });
    setBtn(btn, false, 'Create account');
    if (error) { errEl.textContent = error.message; errEl.className = 'form-msg error'; }
    else {
      errEl.textContent = 'Account created! Sign in with your username.'; errEl.className = 'form-msg success';
      setTimeout(() => {
        qs('#register-page-form').reset();
        qs('#login-page-username').focus();
        const loginTab = qsa('.login-tab')[0];
        loginTab.click();
      }, 1500);
    }
  });
}

async function renderFeed() {
  const view = qs('#view-feed');
  if (!view.dataset.loaded) {
    view.innerHTML = `
      <div class="view-header">
        <h1 class="view-title">Feed</h1>
        <div class="feed-tabs">
          <button class="feed-tab active" data-tab="for-you">For you</button>
          <button class="feed-tab" data-tab="following">Following</button>
        </div>
        <button class="icon-btn feed-refresh-btn" id="feed-refresh-btn" title="Refresh feed">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
        </button>
      </div>
      <div class="post-list" id="feed-posts"><div class="full-loader"><div class="spinner"></div></div></div>`;
    view.dataset.loaded = '1';
    qsa('.feed-tab', view).forEach(t => {
      t.addEventListener('click', () => {
        qsa('.feed-tab', view).forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        loadFeedPosts(t.dataset.tab);
      });
    });
    qs('#feed-refresh-btn')?.addEventListener('click', () => {
      loadFeedPosts(qs('.feed-tab.active', view)?.dataset.tab || 'for-you');
    });
  }
  const activeTab = qs('.feed-tab.active', view)?.dataset.tab || 'for-you';
  await loadFeedPosts(activeTab);
}

function scorePost(post, followingIds = [], seenIds = new Set()) {
  const now = Date.now();
  const ageMs = now - new Date(post.created_at).getTime();
  const ageHours = ageMs / 3_600_000;

  const likes     = (post.reactions || []).filter(r => r.type === 'like').length;
  const reposts   = (post.reposts || []).length;
  const bookmarks = (post.bookmarks || []).length;
  const comments  = post.comment_count || 0;
  const views     = post.view_count || 0;

  let score = likes * 3 + reposts * 5 + bookmarks * 4 + comments * 2 + views * 0.1;

  if (post.post_type === 'image') score *= 1.4;
  if (post.post_type === 'video') score *= 1.7;

  const decay = Math.pow(0.5, ageHours / 12);
  score *= decay;

  if (followingIds.includes(post.user_id)) score *= 1.6;

  if (seenIds.has(post.id)) score *= 0.1;

  score *= (0.85 + Math.random() * 0.3);

  return score;
}

async function loadFeedPosts(tab) {
  const list = qs('#feed-posts');
  if (!list) return;
  list.innerHTML = '<div class="full-loader"><div class="spinner"></div></div>';

  let query = sb.from('posts')
    .select('id, content, post_type, media_url, media_type, created_at, user_id, view_count, quote_of, profiles(id, username, avatar_url, display_name, verified), reactions(id, user_id, type), reposts(id, user_id), bookmarks(id, user_id)')
    .is('reply_to', null)
    .is('community_id', null)
    .limit(80);

  if (tab === 'following') {
    if (!currentUser) { list.innerHTML = emptyState('Sign in to see posts from people you follow.'); return; }
    const { data: follows } = await sb.from('follows').select('following_id').eq('follower_id', currentUser.id);
    const ids = (follows || []).map(f => f.following_id);
    if (!ids.length) { list.innerHTML = emptyState('Follow people to see their posts here.'); return; }
    query = query.in('user_id', ids).order('created_at', { ascending: false });
  } else {
    const weekAgo = new Date(Date.now() - 7 * 24 * 3_600_000).toISOString();
    query = query.gte('created_at', weekAgo).order('created_at', { ascending: false });
  }

  const { data, error } = await query;
  if (error) { list.innerHTML = emptyState('Error loading feed.'); return; }
  if (!data?.length) { list.innerHTML = emptyState(tab === 'following' ? 'Nothing here yet.' : 'Be the first to Flow!'); return; }

  let followingIds = [];
  if (currentUser && tab === 'for-you') {
    const { data: follows } = await sb.from('follows').select('following_id').eq('follower_id', currentUser.id);
    followingIds = (follows || []).map(f => f.following_id);
  }

  const seenIds = new Set(JSON.parse(sessionStorage.getItem('flow_seen') || '[]'));
  const scored = data
    .map(p => ({ post: p, score: scorePost(p, followingIds, seenIds) }))
    .sort((a, b) => b.score - a.score);

  const ranked = scored.slice(0, 40).map(s => s.post);

  ranked.forEach(p => seenIds.add(p.id));
  try { sessionStorage.setItem('flow_seen', JSON.stringify([...seenIds].slice(-200))); } catch {}

  const quoteIds = ranked.filter(p => p.quote_of).map(p => p.quote_of);
  let quotedPosts = {};
  if (quoteIds.length) {
    const { data: qd } = await sb.from('posts').select('id, content, post_type, profiles(username, avatar_url)').in('id', quoteIds);
    if (qd) qd.forEach(q => quotedPosts[q.id] = q);
  }

  list.innerHTML = ranked.map(p => postCardHTML(p, quotedPosts[p.quote_of])).join('');
  bindPostActions(list);
}

function postCardHTML(post, quotedPost = null, opts = {}) {
  const { communityMode = false, communitySlug = '' } = opts;
  const p = post.profiles;
  const likeCount  = (post.reactions || []).filter(r => r.type === 'like').length;
  const reacts     = (post.reactions || []).reduce((acc, r) => { acc[r.type] = (acc[r.type]||0)+1; return acc; }, {});
  const userLiked  = currentUser ? (post.reactions || []).some(r => r.type === 'like' && r.user_id === currentUser.id) : false;
  const repostCount = (post.reposts || []).length;
  const userReposted = currentUser ? (post.reposts || []).some(r => r.user_id === currentUser.id) : false;
  const userBookmarked = currentUser ? (post.bookmarks || []).some(b => b.user_id === currentUser.id) : false;
  const isOwn = currentUser ? post.user_id === currentUser.id : false;

  let mediaHtml = '';
  if (post.post_type === 'image' && post.media_url) {
    mediaHtml = `<img class="post-img" src="${esc(post.media_url)}" alt="Post image" loading="lazy" />`;
  } else if (post.post_type === 'video' && post.media_url) {
    mediaHtml = `<video class="post-video" controls preload="none" src="${esc(post.media_url)}"></video>`;
  }

  let contentHtml = '';
  if (post.post_type === 'markdown') {
    contentHtml = `<div class="post-md">${marked.parse(post.content)}</div>`;
  } else {
    contentHtml = `<div class="post-text">${linkify(post.content)}</div>`;
  }

  const typeBadge = post.post_type !== 'text' ? `<span class="post-type-badge">${esc(post.post_type)}</span>` : '';

  const quoteHtml = quotedPost ? `
    <div class="post-quote-card" data-goto="#/post/${quotedPost.id}">
      <div class="quote-meta">@${esc(quotedPost.profiles?.username)}</div>
      <div class="quote-text">${esc((quotedPost.content||'').slice(0,120))}${quotedPost.content?.length > 120 ? '…' : ''}</div>
    </div>` : '';

  const topReacts = Object.entries(reacts).filter(([,v])=>v>0).slice(0,3).map(([t])=>({like:''})[t]||'').join('');

  const displayName = p.display_name || p.username;
  const canDelete = isOwn || isAdmin();
  const canPin = isAdmin();
  const isPinned = post.is_pinned ? 'pinned' : '';

  const discussionCount = post.discussion_count || 0;
  const viewCount = post.view_count || 0;

  const communityActions = `
    <div class="post-actions">
      <button class="action-btn like-btn ${userLiked ? 'liked' : ''}" data-post-id="${post.id}" title="Like">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="${userLiked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        <span class="lc">${likeCount || ''}</span>
      </button>
      <button class="action-btn bookmark-btn ${userBookmarked ? 'bookmarked' : ''}" data-post-id="${post.id}" title="Bookmark">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="${userBookmarked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
      </button>
      <button class="action-btn share-btn" data-post-id="${post.id}" title="Copy link">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
      </button>
      <div class="post-actions-right">
        ${viewCount ? `<span class="post-views-count">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          ${viewCount}
        </span>` : ''}
        <a class="action-btn discussion-btn" href="#/c/${communitySlug}/post/${post.id}" title="Discussion">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          ${discussionCount ? `<span class="disc-count">${discussionCount}</span>` : ''}
        </a>
      </div>
    </div>`;

  const regularActions = `
    <div class="post-actions">
      <button class="action-btn reply-btn" data-post-id="${post.id}" title="Reply">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      </button>
      <button class="action-btn repost-btn ${userReposted ? 'reposted' : ''}" data-post-id="${post.id}" title="Repost">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
        <span class="rpc">${repostCount || ''}</span>
      </button>
      <button class="action-btn like-btn ${userLiked ? 'liked' : ''}" data-post-id="${post.id}" title="Like">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="${userLiked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        <span class="lc">${likeCount || ''}</span>
        ${topReacts ? `<span style="font-size:.8rem">${topReacts}</span>` : ''}
      </button>
      <button class="action-btn bookmark-btn ${userBookmarked ? 'bookmarked' : ''}" data-post-id="${post.id}" title="Bookmark">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="${userBookmarked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
      </button>
      <button class="action-btn share-btn" data-post-id="${post.id}" title="Copy link">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
      </button>
      <button class="action-btn quote-btn" data-post-id="${post.id}" title="Quote post">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/></svg>
      </button>
      ${currentUser ? `<button class="action-btn report-btn" data-post-id="${post.id}" title="Report post" style="margin-left:auto">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v2m0 4v2m1.71-16.04l8.14 14.88c.04.06.07.14.07.22a2 2 0 0 1-2 2H4.16a2 2 0 0 1-2-2c0-.08.03-.16.07-.22l8.14-14.88a2 2 0 0 1 3.46 0z"/></svg>
      </button>` : ''}
    </div>`;

  return `
    <article class="post-card" data-post-id="${post.id}">
      <div class="post-head">
        <a href="#/profile/${esc(p.username)}">${avatarEl(p, 'size-md')}</a>
        <div class="post-meta">
          <span>
            <a href="#/profile/${esc(p.username)}" class="post-displayname">${esc(displayName)}</a>${badgesFor(p)}
            <span class="post-handle">@${esc(p.username)}</span>
            <span class="post-dot">·</span>
            <span class="post-time">${timeAgo(post.created_at)}</span>
            ${typeBadge}
            ${isPinned ? `<span class="post-type-badge" style="display: inline-flex; align-items: center;">
              <img src="https://img.icons8.com/material-rounded/96/pin.png" 
                  style="height: 14px; width: auto; filter: invert(1); margin-right: 4px;" 
                    alt="pinned" />
            </span>` : ''}
          </span>
        </div>
        <div style="display:flex;gap:4px">
          ${canPin ? `<button class="action-btn pin-btn" data-post-id="${post.id}" title="Pin/Unpin post" style="color:${post.is_pinned ? 'var(--yellow)' : 'var(--muted)'}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4v7H4v2h10v7l5-8-5-8Z"/></svg>
          </button>` : ''}
          ${canDelete ? `<button class="action-btn delete-btn" data-post-id="${post.id}" title="Delete post">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          </button>` : ''}
        </div>
      </div>
      ${contentHtml}
      ${mediaHtml}
      ${quoteHtml}
      ${communityMode ? communityActions : regularActions}
    </article>`;
}

function bindPostActions(ctx) {
  qsa('.like-btn', ctx).forEach(btn => {
    btn.addEventListener('click', () => { if (!requireAuth()) return; toggleLike(btn.dataset.postId, btn); });
  });
  qsa('.repost-btn', ctx).forEach(btn => btn.addEventListener('click', () => { if (!requireAuth()) return; toggleRepost(btn.dataset.postId, btn); }));
  qsa('.bookmark-btn', ctx).forEach(btn => btn.addEventListener('click', () => { if (!requireAuth()) return; toggleBookmark(btn.dataset.postId, btn); }));
  qsa('.share-btn', ctx).forEach(btn => btn.addEventListener('click', () => copyLink(btn.dataset.postId)));
  qsa('.reply-btn', ctx).forEach(btn => btn.addEventListener('click', () => { if (!requireAuth()) return; openReplyModal(btn.dataset.postId); }));
  qsa('.quote-btn', ctx).forEach(btn => btn.addEventListener('click', () => { if (!requireAuth()) return; openQuoteModal(btn.dataset.postId); }));
  qsa('.report-btn', ctx).forEach(btn => btn.addEventListener('click', () => { if (!requireAuth()) return; showReportModal(btn.dataset.postId); }));
  qsa('.pin-btn', ctx).forEach(btn => btn.addEventListener('click', e => { e.stopPropagation(); togglePin(btn.dataset.postId, btn); }));
  qsa('.delete-btn', ctx).forEach(btn => btn.addEventListener('click', e => { e.stopPropagation(); deletePost(btn.dataset.postId, btn); }));
  qsa('[data-goto]', ctx).forEach(el => el.addEventListener('click', () => { location.hash = el.dataset.goto; }));
  qsa('.post-username', ctx).forEach(el => {
    el.addEventListener('click', e => { e.preventDefault(); location.hash = el.href.split('#')[1] || `#/profile/${el.textContent.replace('@','')}` ; });
  });
  qsa('.post-img', ctx).forEach(img => img.addEventListener('click', () => window.open(img.src, '_blank')));
  qsa('.poll-bar-wrap', ctx).forEach(bar => bar.addEventListener('click', () => { if (!requireAuth()) return; votePoll(bar.dataset.optionId, bar.closest('.post-card').dataset.postId); }));
}

async function toggleLike(postId, btn) {
  if (currentProfile?.banned || currentProfile?.is_shadowbanned) {
    showToast('You cannot perform this action at this time.', 'error');
    return;
  }
  const liked = btn.classList.contains('liked');
  const lc = btn.querySelector('.lc');
  btn.classList.toggle('liked', !liked);
  btn.querySelector('svg').setAttribute('fill', liked ? 'none' : 'currentColor');
  lc.textContent = (Math.max(0, parseInt(lc.textContent || '0') + (liked ? -1 : 1))) || '';
  if (liked) await sb.from('reactions').delete().eq('post_id', postId).eq('user_id', currentUser.id).eq('type', 'like');
  else {
    await sb.from('reactions').insert({ post_id: postId, user_id: currentUser.id, type: 'like' });
    sendNotification(postId, 'like');
  }
}

async function toggleRepost(postId, btn) {
  const rp = btn.classList.contains('reposted');
  const rc = btn.querySelector('.rpc');
  btn.classList.toggle('reposted', !rp);
  rc.textContent = (Math.max(0, parseInt(rc.textContent || '0') + (rp ? -1 : 1))) || '';
  if (rp) await sb.from('reposts').delete().eq('post_id', postId).eq('user_id', currentUser.id);
  else {
    await sb.from('reposts').insert({ post_id: postId, user_id: currentUser.id });
    sendNotification(postId, 'repost');
  }
}

async function toggleBookmark(postId, btn) {
  const bm = btn.classList.contains('bookmarked');
  btn.classList.toggle('bookmarked', !bm);
  btn.querySelector('svg').setAttribute('fill', bm ? 'none' : 'currentColor');
  if (bm) await sb.from('bookmarks').delete().eq('post_id', postId).eq('user_id', currentUser.id);
  else {
    await sb.from('bookmarks').insert({ post_id: postId, user_id: currentUser.id });
    showToast('Bookmarked!');
  }
}

function copyLink(postId) {
  const url = `${location.origin}${location.pathname}#/post/${postId}`;
  navigator.clipboard.writeText(url).then(() => showToast('Link copied!'));
}

async function togglePin(postId, btn) {
  const isPinned = btn.style.color === 'var(--yellow)';
  const { error } = await sb.from('posts').update({ is_pinned: !isPinned }).eq('id', postId);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  btn.style.color = isPinned ? 'var(--muted)' : 'var(--yellow)';
  showToast(isPinned ? 'Post unpinned.' : 'Post pinned!');
}

async function deletePost(postId, btn) {
  showConfirmModal({
    title: 'Delete post',
    message: 'Are you sure? This cannot be undone.',
    confirmText: 'Delete',
    confirmClass: 'btn-danger',
    danger: true,
    onConfirm: async () => {
      btn.disabled = true;
      let query = sb.from('posts').delete().eq('id', postId);
      if (!isAdmin()) query = query.eq('user_id', currentUser.id);
      const { error } = await query;
      if (error) {
        showToast('Error deleting post: ' + error.message, 'error');
        btn.disabled = false;
        return;
      }
      btn.closest('.post-card')?.remove();
      showToast('Deleted.');
    }
  });
}

async function sendNotification(postId, type) {
  try {
    const { data: post } = await sb.from('posts').select('user_id').eq('id', postId).single();
    if (post && post.user_id !== currentUser.id) {
      await sb.from('notifications').insert({ user_id: post.user_id, actor_id: currentUser.id, type, post_id: postId });
    }
  } catch (_) {}
}

let _rtViewedUsername = null;
let _rtViewedUserId   = null;
let _rtBannerShown    = false;
let _pollInterval     = null;
let _feedNewestTs     = null;
let _notifNewestTs    = null;
let _postDetailId     = null;
let _postDetailCount  = 0;


async function registerPush() {
  if (!currentUser) return;
  try {
    if (window.median?.onesignal) {
      median.onesignal.externalUserId.set({ externalId: currentUser.id });
    }
  } catch {}
}

function showPushPrompt() {
  return new Promise(resolve => {
    const box = document.createElement('div');
    box.style.cssText = `position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:16px 20px;z-index:9999;box-shadow:0 8px 32px rgba(0,0,0,.4);max-width:320px;width:90%;display:flex;flex-direction:column;gap:12px`;
    box.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px">
        <span style="font-size:1.4rem">🔔</span>
        <div>
          <div style="font-weight:600;font-size:.9rem">Enable notifications</div>
          <div style="font-size:.78rem;color:var(--muted2);margin-top:2px">Get notified about messages and activity</div>
        </div>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button id="push-no" style="padding:7px 14px;border-radius:8px;border:1px solid var(--border);background:transparent;color:var(--text);font-size:.82rem;cursor:pointer">Not now</button>
        <button id="push-yes" style="padding:7px 14px;border-radius:8px;border:none;background:var(--blue);color:#fff;font-size:.82rem;font-weight:600;cursor:pointer">Allow</button>
      </div>`;
    document.body.appendChild(box);

    box.querySelector('#push-yes').addEventListener('click', async () => {
      box.remove();
      const result = await Notification.requestPermission();
      resolve(result === 'granted');
    });
    box.querySelector('#push-no').addEventListener('click', () => {
      box.remove();
      resolve(false);
    });
  });
}



function subscribeRealtime() {
  if (!currentUser || realtimeSub) return;

  if (!qs('#rt-banner-style')) {
    const s = document.createElement('style');
    s.id = 'rt-banner-style';
    s.textContent = `@keyframes rtSlideIn{from{opacity:0;transform:translateX(-50%) translateY(-10px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}`;
    document.head.appendChild(s);
  }

  realtimeSub = sb.channel('rt-global')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, (p) => {
      const h = location.hash.replace(/^#\/?/, '');
      if ((!h || h.startsWith('feed')) && p.new.user_id !== currentUser.id) rtShowBanner();
      if (h.startsWith('profile/') && _rtViewedUserId && p.new.user_id === _rtViewedUserId) rtRefreshProfilePosts();
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'posts' }, (p) => {
      if (!p.old?.id) return;
      qsa(`[data-post-id="${p.old.id}"]`).forEach(el => {
        const card = el.closest?.('.post-card') || el;
        card.style.transition = 'opacity .3s';
        card.style.opacity = '0';
        setTimeout(() => card.remove(), 300);
      });
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reactions' }, (p) => {
      if (p.new.user_id !== currentUser.id) rtDeltaLike(p.new.post_id, +1);
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'reactions' }, (p) => {
      if (p.old?.post_id && p.old.user_id !== currentUser.id) rtDeltaLike(p.old.post_id, -1);
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reposts' }, (p) => {
      if (p.new.user_id !== currentUser.id) rtDeltaRepost(p.new.post_id, +1);
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'reposts' }, (p) => {
      if (p.old?.post_id && p.old.user_id !== currentUser.id) rtDeltaRepost(p.old.post_id, -1);
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, async (p) => {
      if (p.new.user_id !== currentUser.id) return;
      loadNotifCount();
      const h = location.hash.replace(/^#\/?/, '');
      if (h === 'notifications') await rtPrependNotif(p.new);
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'comments' }, async (p) => {
      if (p.new.user_id === currentUser.id) return;
      const h = location.hash.replace(/^#\/?/, '');
      if (h.startsWith('post/') && String(p.new.post_id) === h.replace('post/', '')) await rtAppendComment(p.new);
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversations' }, () => {
      const h = location.hash.replace(/^#\/?/, '');
      if (h === 'chats' || h.startsWith('chats')) loadChatTab('dms');
      rtChatBadge();
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (p) => {
      const h = location.hash.replace(/^#\/?/, '');
      if (h.startsWith('chat/') && String(p.new.conversation_id) === h.replace('chat/', '')) {
        loadChatMessages(h.replace('chat/', ''));
        return;
      }
      if (p.new.sender_id !== currentUser.id) {
        rtChatBadge();
        if (h === 'chats' || h.startsWith('chats')) loadChatTab('dms');
      }
    })
    .subscribe();

  startPolling();
}

function startPolling() {
  if (_pollInterval) clearInterval(_pollInterval);
  _pollInterval = setInterval(pollTick, 7000);
}

async function pollTick() {
  if (!currentUser || document.hidden) return;
  const h = location.hash.replace(/^#\/?/, '');

  if (!h || h.startsWith('feed')) {
    const tab = qs('.feed-tab.active')?.dataset?.tab || 'for-you';
    const { data } = await sb.from('posts').select('created_at').is('reply_to', null).order('created_at', { ascending: false }).limit(1);
    const newest = data?.[0]?.created_at;
    if (!_feedNewestTs) {
      _feedNewestTs = newest;
    } else if (newest && newest > _feedNewestTs) {
      _feedNewestTs = newest;
      const atTop = window.scrollY < 200;
      if (atTop) {
        loadFeedPosts(tab);
      } else {
        rtShowBanner();
      }
    }
    loadNotifCount();
    rtChatBadge();
  }

  if (h === 'notifications') {
    const { data } = await sb.from('notifications').select('created_at').eq('user_id', currentUser.id).order('created_at', { ascending: false }).limit(1);
    const newest = data?.[0]?.created_at;
    if (!_notifNewestTs) { _notifNewestTs = newest; }
    else if (newest && newest > _notifNewestTs) {
      _notifNewestTs = newest;
      renderNotifications();
    }
    loadNotifCount();
  }

  if (h.startsWith('post/')) {
    const postId = h.replace('post/', '');
    const { count } = await sb.from('comments').select('*', { count: 'exact', head: true }).eq('post_id', postId);
    if (_postDetailId !== postId) { _postDetailId = postId; _postDetailCount = count || 0; }
    else if ((count || 0) > _postDetailCount) {
      _postDetailCount = count || 0;
      await pollAppendNewComments(postId);
    }
  }

  if (h === 'chats' || h.startsWith('chats')) {
    loadChatTab('dms');
    rtChatBadge();
  }

  if (h.startsWith('profile/') && _rtViewedUserId) {
    rtRefreshProfilePosts();
  }
}

async function pollAppendNewComments(postId) {
  const existing = new Set(qsa('[data-comment-id]').map(el => el.dataset.commentId));
  const { data } = await sb.from('comments').select('*, profiles(username, avatar_url)').eq('post_id', postId).order('created_at', { ascending: true });
  if (!data) return;
  const list = qs('#replies-list');
  if (!list) return;
  const empty = list.querySelector('.empty-state');
  data.forEach(c => {
    if (existing.has(String(c.id))) return;
    if (empty) empty.remove();
    const div = document.createElement('div');
    div.className = 'reply-card';
    div.dataset.commentId = c.id;
    div.innerHTML = `
      ${avatarEl(c.profiles, 'size-sm')}
      <div class="reply-card-right">
        <div class="reply-meta">
          <a href="#/profile/${esc(c.profiles?.username)}" class="reply-username">@${esc(c.profiles?.username)}</a>
          <span class="reply-time">${timeAgo(c.created_at)}</span>
          ${(currentUser && c.user_id === currentUser.id) ? `<button class="reply-delete" data-cid="${c.id}">Delete</button>` : ''}
        </div>
        <div class="reply-text">${esc(c.content)}</div>
      </div>`;
    div.style.animation = 'rtSlideIn .2s ease both';
    div.querySelector('.reply-delete')?.addEventListener('click', async () => {
      await sb.from('comments').delete().eq('id', c.id).eq('user_id', currentUser.id);
      div.remove();
    });
    list.appendChild(div);
  });
  list.scrollTop = list.scrollHeight;
}

function rtShowBanner() {
  if (_rtBannerShown) return;
  const feed = qs('#view-feed');
  if (!feed || feed.classList.contains('hidden')) return;
  _rtBannerShown = true;
  qs('#rt-banner')?.remove();
  const btn = document.createElement('button');
  btn.id = 'rt-banner';
  btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg> New posts`;
  btn.style.cssText = `position:fixed;top:62px;left:50%;transform:translateX(-50%);background:var(--blue);color:#fff;border:none;border-radius:20px;padding:7px 16px;font-size:.8rem;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:5px;z-index:9999;box-shadow:0 4px 14px rgba(0,0,0,.4);white-space:nowrap;animation:rtSlideIn .25s cubic-bezier(.34,1.56,.64,1) both`;
  document.body.appendChild(btn);
  btn.addEventListener('click', () => {
    btn.remove();
    _rtBannerShown = false;
    _feedNewestTs = null;
    const tab = qs('.feed-tab.active', feed)?.dataset?.tab || 'for-you';
    loadFeedPosts(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

async function rtRefreshProfilePosts() {
  const list = qs('#profile-posts');
  if (!list || !_rtViewedUserId) return;
  const { data: posts } = await sb.from('posts')
    .select('id, content, post_type, media_url, created_at, user_id, profiles(id, username, avatar_url), reactions(id, user_id, type), reposts(id, user_id), bookmarks(id, user_id)')
    .eq('user_id', _rtViewedUserId).is('reply_to', null).order('created_at', { ascending: false }).limit(30);
  if (!posts) return;
  list.innerHTML = posts.length ? posts.map(p => postCardHTML(p)).join('') : emptyState('No posts yet.');
  bindPostActions(list);
}

function rtDeltaLike(postId, delta) {
  qsa(`[data-post-id="${postId}"] .lc`).forEach(el => {
    el.textContent = Math.max(0, (parseInt(el.textContent) || 0) + delta) || '';
    el.closest('.like-btn')?.animate([{ transform: 'scale(1.3)' }, { transform: 'scale(1)' }], { duration: 250 });
  });
}

function rtDeltaRepost(postId, delta) {
  qsa(`[data-post-id="${postId}"] .rpc`).forEach(el => {
    el.textContent = Math.max(0, (parseInt(el.textContent) || 0) + delta) || '';
  });
}

async function rtPrependNotif(notif) {
  const list = qs('#notif-list');
  if (!list) return;
  list.querySelector('.empty-state')?.remove();
  const { data: actor } = await sb.from('profiles').select('username, avatar_url').eq('id', notif.actor_id).single();
  const msgs = { like: 'liked your post', fire: 'reacted to your post', follow: 'followed you', repost: 'reposted your post', comment: 'replied to your post', mention: 'mentioned you' };
  const div = document.createElement('div');
  div.className = 'notif-item unread';
  div.dataset.postId = notif.post_id || '';
  div.style.cssText = 'cursor:pointer;animation:rtSlideIn .2s ease both';
  div.innerHTML = `
    <div class="notif-icon" style="color:var(--blue);flex-shrink:0;width:20px;height:20px">${icons[notif.type] || ''}</div>
    <div style="flex:1;min-width:0">
      <div class="notif-text"><a href="#/profile/${esc(actor?.username)}" class="notif-user" onclick="event.stopPropagation()"><strong>@${esc(actor?.username)}</strong></a> ${msgs[notif.type] || notif.type}</div>
      <div class="notif-time">just now</div>
    </div>`;
  div.addEventListener('click', () => { if (notif.post_id) location.hash = `#/post/${notif.post_id}`; });
  list.prepend(div);
}

async function rtAppendComment(comment) {
  const list = qs('#replies-list');
  if (!list || qsa('[data-comment-id]').some(el => el.dataset.commentId === String(comment.id))) return;
  list.querySelector('.empty-state')?.remove();
  const { data: profile } = await sb.from('profiles').select('username, avatar_url').eq('id', comment.user_id).single();
  const div = document.createElement('div');
  div.className = 'reply-card';
  div.dataset.commentId = comment.id;
  div.style.animation = 'rtSlideIn .2s ease both';
  div.innerHTML = `
    ${avatarEl(profile, 'size-sm')}
    <div class="reply-card-right">
      <div class="reply-meta">
        <a href="#/profile/${esc(profile?.username)}" class="reply-username">@${esc(profile?.username)}</a>
        <span class="reply-time">just now</span>
      </div>
      <div class="reply-text">${esc(comment.content)}</div>
    </div>`;
  list.appendChild(div);
  list.scrollTop = list.scrollHeight;
}

async function rtChatBadge() {
  if (!currentUser) return;
  try {
    const { data: convs } = await sb.from('conversations')
      .select('messages(sender_id, read_by)')
      .or(`user1_id.eq.${currentUser.id},user2_id.eq.${currentUser.id}`);
    let unread = 0;
    (convs || []).forEach(c => (c.messages || []).forEach(m => {
      if (m.sender_id !== currentUser.id && !m.read_by?.includes(currentUser.id)) unread++;
    }));
    let badge = qs('#chat-unread-badge');
    if (!badge) {
      const nav = qs('[data-route="chats"]');
      if (nav) {
        badge = document.createElement('span');
        badge.id = 'chat-unread-badge';
        badge.style.cssText = `position:absolute;top:2px;right:2px;background:var(--blue);color:#fff;border-radius:50%;width:8px;height:8px`;
        nav.style.position = 'relative';
        nav.appendChild(badge);
      }
    }
    if (badge) badge.style.display = unread > 0 ? 'block' : 'none';
  } catch {}
}

async function loadNotifCount() {
  if (!currentUser) return;
  const { count } = await sb.from('notifications').select('*', { count: 'exact', head: true }).eq('user_id', currentUser.id).eq('read', false);
  const badge = qs('#notif-badge');
  const sbadge = qs('#sidebar-notif-badge');
  if (count > 0) {
    badge?.classList.remove('hidden');
    sbadge?.classList.remove('hidden');
    if (sbadge) sbadge.textContent = count > 9 ? '9+' : count;
  } else {
    badge?.classList.add('hidden');
    sbadge?.classList.add('hidden');
  }
}

async function renderExplore(sub, tagParam) {
  const view = qs('#view-explore');
  const initialQuery = tagParam ? decodeURIComponent(tagParam) : (sub ? decodeURIComponent(sub) : '');
  
  view.innerHTML = `
    <div class="view-header">
      <h1 class="view-title">Explore</h1>
      <div class="search-bar">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" id="explore-input" placeholder="Search users or #hashtags…" autocomplete="off" value="${esc(initialQuery)}" />
      </div>
    </div>
    <div id="explore-tabs" class="feed-tabs" style="border-bottom:1px solid var(--border)">
      <button class="feed-tab ${tagParam ? '' : 'active'}" data-etab="users">People</button>
      <button class="feed-tab ${tagParam ? 'active' : ''}" data-etab="posts">Posts</button>
      <button class="feed-tab" data-etab="communities">Communities</button>
    </div>
    <div id="explore-results"></div>`;

  let etab = tagParam ? 'posts' : 'users';
  const search = async () => {
    const q = qs('#explore-input').value.trim();
    const el = qs('#explore-results');
    el.innerHTML = '<div class="full-loader"><div class="spinner"></div></div>';
    if (etab === 'users') await searchUsers(q, el);
    else if (etab === 'posts') await searchPosts(q, el);
    else await searchCommunities(q, el);
  };

  qsa('[data-etab]', view).forEach(t => t.addEventListener('click', () => {
    qsa('[data-etab]', view).forEach(x => x.classList.remove('active'));
    t.classList.add('active'); etab = t.dataset.etab; search();
  }));

  let dt;
  qs('#explore-input').addEventListener('input', () => { clearTimeout(dt); dt = setTimeout(search, 300); });
  qs('#explore-input').focus();
  search();
}

async function searchUsers(q, el) {
  let req = sb.from('profiles').select('id, username, avatar_url, bio, verified').limit(30);
  if (currentUser) req = req.neq('id', currentUser.id);
  if (q) req = req.ilike('username', `%${q}%`);
  else req = req.order('created_at', { ascending: false });

  const { data: users } = await req;
  const fset = new Set();
  if (currentUser) {
    const { data: myFollows } = await sb.from('follows').select('following_id').eq('follower_id', currentUser.id);
    (myFollows||[]).forEach(f => fset.add(f.following_id));
  }

  if (!users?.length) { el.innerHTML = emptyState('No users found.'); return; }

  el.innerHTML = users.map(u => `
    <div class="user-row" data-username="${esc(u.username)}">
      ${avatarEl(u, 'size-md')}
      <div class="user-row-info">
        <div class="user-row-name">@${esc(u.username)} ${u.verified ? '<img class="verified-badge" src="https://img.icons8.com/fluency/96/instagram-verification-badge.png" style="width:14px;height:14px;margin-left:4px" />' : ''}</div>
        ${u.bio ? `<div class="user-row-bio">${esc(u.bio.slice(0,70))}</div>` : ''}
      </div>
      <button class="btn-follow ${fset.has(u.id)?'following':''}" data-uid="${u.id}">${fset.has(u.id)?'Following':'Follow'}</button>
    </div>`).join('');

  qsa('.user-row', el).forEach(r => r.addEventListener('click', e => {
    if (e.target.closest('.btn-follow')) return;
    location.hash = `#/profile/${r.dataset.username}`;
  }));
  qsa('.btn-follow', el).forEach(b => b.addEventListener('click', e => { e.stopPropagation(); if (!requireAuth()) return; toggleFollow(b.dataset.uid, b); }));
}

async function searchPosts(q, el) {
  if (!q) { el.innerHTML = emptyState('Type something to search posts.'); return; }
  const { data } = await sb.from('posts')
    .select('id, content, post_type, media_url, created_at, user_id, profiles(id, username, avatar_url), reactions(id, user_id, type), reposts(id, user_id), bookmarks(id, user_id)')
    .ilike('content', `%${q}%`)
    .is('reply_to', null)
    .order('created_at', { ascending: false })
    .limit(30);

  if (!data?.length) { el.innerHTML = emptyState('No posts found.'); return; }
  el.innerHTML = data.map(p => postCardHTML(p)).join('');
  bindPostActions(el);
}

async function toggleFollow(targetId, btn) {
  const foll = btn.classList.contains('following');
  btn.disabled = true;
  if (foll) {
    btn.classList.remove('following'); btn.textContent = 'Follow';
    await sb.from('follows').delete().eq('follower_id', currentUser.id).eq('following_id', targetId);
  } else {
    btn.classList.add('following'); btn.textContent = 'Following';
    await sb.from('follows').insert({ follower_id: currentUser.id, following_id: targetId });
    await sb.from('notifications').insert({ user_id: targetId, actor_id: currentUser.id, type: 'follow' });
  }
  btn.disabled = false;
}

async function renderNotifications() {
  const view = qs('#view-notifications');
  view.innerHTML = `
    <div class="view-header"><h1 class="view-title">Notifications</h1></div>
    <div class="notif-list" id="notif-list"><div class="full-loader"><div class="spinner"></div></div></div>`;

  try {
    const { data, error } = await sb.from('notifications')
      .select('id, user_id, actor_id, type, post_id, created_at, read, actor:profiles!notifications_actor_id_fkey(username, avatar_url)')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    sb.from('notifications').update({ read: true }).eq('user_id', currentUser.id).eq('read', false).then();
    qs('#notif-badge')?.classList.add('hidden');
    qs('#sidebar-notif-badge')?.classList.add('hidden');

    const list = qs('#notif-list');
    if (!data?.length) { list.innerHTML = emptyState('No notifications yet.'); return; }

    const msgs  = { like: 'liked your post', fire: 'reacted to your post', follow: 'followed you', repost: 'reposted your post', comment: 'replied to your post', mention: 'mentioned you' };

    list.innerHTML = data.map(n => `
      <div class="notif-item ${n.read?'':'unread'}" data-post-id="${n.post_id||''}" style="cursor:pointer">
        <div class="notif-icon" style="color:var(--blue);flex-shrink:0;width:20px;height:20px">${icons[n.type]||'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>'}</div>
        <div style="flex:1;min-width:0">
          <div class="notif-text">
            <a href="#/profile/${esc(n.actor?.username)}" class="notif-user" onclick="event.stopPropagation()"><strong>@${esc(n.actor?.username)}</strong></a>
            ${msgs[n.type]||n.type}
          </div>
          <div class="notif-time">${timeAgo(n.created_at)}</div>
        </div>
      </div>`).join('');

    qsa('.notif-item[data-post-id]', list).forEach(el => {
      el.addEventListener('click', () => { if (el.dataset.postId) location.hash = `#/post/${el.dataset.postId}`; });
    });
    qsa('.notif-item:not([data-post-id])', list).forEach(el => {
      el.addEventListener('click', (e) => {
        if (!e.target.closest('a')) {
          const username = el.querySelector('.notif-user')?.textContent.replace('@','');
          if (username) location.hash = `#/profile/${username}`;
        }
      });
    });
  } catch (err) {
    const list = qs('#notif-list');
    list.innerHTML = emptyState('Unable to load notifications. Please try again.');
  }
}

async function renderBookmarks() {
  const view = qs('#view-bookmarks');
  view.innerHTML = `
    <div class="view-header"><h1 class="view-title">Bookmarks</h1></div>
    <div class="post-list" id="bm-list"><div class="full-loader"><div class="spinner"></div></div></div>`;

  const { data } = await sb.from('bookmarks')
    .select('post_id, posts(id, content, post_type, media_url, created_at, user_id, profiles(id, username, avatar_url), reactions(id, user_id, type), reposts(id, user_id), bookmarks(id, user_id))')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false });

  const list = qs('#bm-list');
  if (!data?.length) { list.innerHTML = emptyState('No bookmarks yet.'); return; }
  const posts = data.map(b => b.posts).filter(Boolean);
  list.innerHTML = posts.map(p => postCardHTML(p)).join('');
  bindPostActions(list);
}

async function renderProfile(username) {
  if (!username) { qs('#view-profile').innerHTML = emptyState('User not found.'); return; }
  const view = qs('#view-profile');
  view.innerHTML = '<div class="full-loader"><div class="spinner"></div></div>';

  const { data: profile, error } = await sb.from('profiles').select('*').eq('username', username).single();
  if (error || !profile) { view.innerHTML = emptyState('User not found.'); return; }
  // Track for realtime live updates
  _rtViewedUsername = profile.username;
  _rtViewedUserId   = profile.id;


  const isOwn = currentUser ? profile.id === currentUser.id : false;

  const [{ count: fc }, { count: fg }, { data: posts }, followCheck] = await Promise.all([
    sb.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', profile.id),
    sb.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', profile.id),
    sb.from('posts').select('id, content, post_type, media_url, created_at, user_id, profiles(id, username, avatar_url), reactions(id, user_id, type), reposts(id, user_id), bookmarks(id, user_id)').eq('user_id', profile.id).is('reply_to', null).order('created_at', { ascending: false }).limit(30),
    (isOwn || !currentUser) ? null : sb.from('follows').select('follower_id').eq('follower_id', currentUser.id).eq('following_id', profile.id).maybeSingle()
  ]);

  const isFollowing = !isOwn && !!followCheck?.data;
  const joinDate = new Date(profile.created_at).toLocaleDateString('en', { month: 'long', year: 'numeric' });

  view.innerHTML = `
    <div class="profile-cover" id="profile-cover-el" style="${profile.cover_url ? `background-image:url('${esc(profile.cover_url)}');background-size:cover;background-position:center` : ''}">
      ${isOwn ? `<div class="profile-cover-actions">
        <label class="btn-sm btn-outline" id="change-cover-btn" style="background:rgba(0,0,0,.5);border-color:rgba(255,255,255,.2);color:#fff;font-size:.75rem;padding:4px 10px;cursor:pointer">
          Edit cover
          <input type="file" id="cover-upload" accept="image/*" hidden />
        </label>
      </div>` : ''}
    </div>
    <div class="profile-hero">
      <div class="profile-top-row">
        <div class="profile-avatar-wrap">
          ${avatarEl(profile, 'size-xl')}
          ${isOwn ? `<label class="avatar-upload-label" title="Change avatar" style="position:absolute;bottom:4px;right:4px;width:26px;height:26px;background:var(--blue);border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;border:2px solid var(--bg)">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
            <input type="file" id="avatar-upload" accept="image/*" hidden />
          </label>` : ''}
        </div>
        <div style="margin-left:auto;display:flex;gap:8px;align-items:flex-start;padding-top:8px">
        ${isOwn
            ? `<button class="btn-sm btn-outline" id="edit-profile-btn">Edit profile</button>`
            : `
              <button class="btn-follow ${isFollowing?'following':''}" id="profile-follow-btn" data-uid="${profile.id}">${isFollowing?'Following':'Follow'}</button>
              ${(currentUser && profile.allow_messages !== false) ? `<button class="btn-sm btn-outline" id="profile-chat-btn" title="Send message" style="padding:6px 10px"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></button>` : ''}
            `}
        ${(!isOwn && isAdmin()) ? `
          <div class="admin-menu-wrap" style="position:relative">
            <button class="btn-sm btn-outline" id="admin-menu-btn" title="Admin actions" style="padding:4px 8px">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
            </button>
            <div class="admin-dropdown hidden" id="admin-dropdown">
              <button class="admin-drop-item" id="adm-rename">Change username</button>
              <button class="admin-drop-item" id="adm-verify">${profile.verified ? 'Remove checkmark' : 'Give checkmark'}</button>
              <button class="admin-drop-item danger" id="adm-ban">Ban account</button>
              <button class="admin-drop-item danger" id="adm-delete">Delete account</button>
            </div>
          </div>` : ''}
        </div>
      </div>
      <div class="profile-info">
        <div class="profile-displayname-row">
          <span class="profile-displayname">${esc(profile.display_name || profile.username)}</span>
          ${badgesFor(profile)}
        </div>
        <div class="profile-username-sub">@${esc(profile.username)}</div>
        ${profile.bio ? `<div class="profile-bio">${esc(profile.bio)}</div>` : ''}
        <div class="profile-meta-row">
          ${profile.location ? `<span class="profile-meta-item"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>${esc(profile.location)}</span>` : ''}
          ${profile.website ? `<span class="profile-meta-item"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg><a href="${esc(profile.website)}" target="_blank" rel="noopener">${esc(profile.website)}</a></span>` : ''}
          <span class="profile-meta-item"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>Joined ${joinDate}</span>
        </div>
      </div>
      <div class="profile-stats">
        <div class="stat-item" id="followers-link" style="cursor:pointer"><span class="stat-num">${fc||0}</span><span class="stat-lbl">Followers</span></div>
        <div class="stat-item" id="following-link" style="cursor:pointer"><span class="stat-num">${fg||0}</span><span class="stat-lbl">Following</span></div>
        <div class="stat-item"><span class="stat-num">${(posts||[]).length}</span><span class="stat-lbl">Posts</span></div>
      </div>
    </div>
    <div id="profile-edit-area"></div>
    <div class="profile-tabs">
      <button class="profile-tab active" data-ptab="posts">Posts</button>
      <button class="profile-tab" data-ptab="replies">Replies</button>
      <button class="profile-tab" data-ptab="media">Media</button>
      ${isOwn ? `<button class="profile-tab" data-ptab="likes">Likes</button>` : ''}
    </div>
    <div id="profile-content-area">
      <div class="post-list" id="profile-posts">
        ${(posts||[]).length ? posts.map(p=>postCardHTML(p)).join('') : emptyState('No posts yet.')}
      </div>
    </div>`;

  bindPostActions(qs('#profile-posts'));

  qs('#followers-link')?.addEventListener('click', async () => {
    const { data: followers } = await sb.from('follows').select('follower:profiles!follows_follower_id_fkey(id, username, avatar_url, verified)').eq('following_id', profile.id);
    showUserListModal('Followers', followers?.map(f => f.follower).filter(Boolean) || []);
  });

  qs('#following-link')?.addEventListener('click', async () => {
    const { data: following } = await sb.from('follows').select('following:profiles!follows_following_id_fkey(id, username, avatar_url, verified)').eq('follower_id', profile.id);
    showUserListModal('Following', following?.map(f => f.following).filter(Boolean) || []);
  });

  qsa('.profile-tab', view).forEach(t => t.addEventListener('click', async () => {
    qsa('.profile-tab', view).forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    await loadProfileTab(t.dataset.ptab, profile.id, isOwn);
  }));

  if (isOwn) {
    qs('#edit-profile-btn').addEventListener('click', () => renderProfileEditForm(profile));
    qs('#avatar-upload')?.addEventListener('change', e => uploadAvatar(e.target.files[0], profile));
    qs('#cover-upload')?.addEventListener('change', e => uploadCover(e.target.files[0], profile));
  } else {
    const fb = qs('#profile-follow-btn');
    if (fb) fb.addEventListener('click', async () => {
      if (!requireAuth()) return;
      await toggleFollow(profile.id, fb);
      const sn = qs('#follower-stat .stat-num');
      if (sn) sn.textContent = parseInt(sn.textContent) + (fb.classList.contains('following') ? 1 : -1);
    });
    qs('#profile-chat-btn')?.addEventListener('click', () => openDM(profile.id));
  }

  if (!isOwn && isAdmin()) {
    const menuBtn = qs('#admin-menu-btn');
    const dropdown = qs('#admin-dropdown');
    menuBtn?.addEventListener('click', e => {
      e.stopPropagation();
      dropdown.classList.toggle('hidden');
    });
    document.addEventListener('click', () => dropdown?.classList.add('hidden'), { once: true });

    qs('#adm-rename')?.addEventListener('click', () => {
      dropdown.classList.add('hidden');
      showInputModal({
        title: 'Change username',
        message: `Enter new username for @${profile.username}:`,
        inputPlaceholder: 'new username',
        inputLabel: 'New username',
        confirmText: 'Change',
        minLength: 3,
        onConfirm: async (newName) => {
          const clean = newName.toLowerCase().replace(/[^a-z0-9_]/g, '');
          if (!clean) {
            showToast('Username can only contain letters, numbers, and underscores', 'error');
            return;
          }
          showConfirmModal({
            title: 'Confirm username change',
            message: `Change @${profile.username} → @${clean}?`,
            confirmText: 'Change',
            onConfirm: async () => {
              const { error } = await sb.from('profiles').update({ username: clean }).eq('id', profile.id);
              if (error) showToast('Error: ' + error.message, 'error');
              else { showToast(`Username changed to @${clean}`); renderProfile(clean); }
            }
          });
        }
      });
    });

    qs('#adm-verify')?.addEventListener('click', async () => {
      dropdown.classList.add('hidden');
      const newVal = !profile.verified;
      const { error } = await sb.from('profiles').update({ verified: newVal }).eq('id', profile.id);
      if (error) showToast('Error: ' + error.message, 'error');
      else { showToast(newVal ? 'Checkmark granted ✓' : 'Checkmark removed'); renderProfile(profile.username); }
    });

    qs('#adm-ban')?.addEventListener('click', () => {
      dropdown.classList.add('hidden');
      showConfirmModal({
        title: 'Ban account',
        message: `Ban @${profile.username}? They will be signed out and unable to use the platform.`,
        confirmText: 'Ban',
        confirmClass: 'btn-danger',
        danger: true,
        requireType: 'BAN',
        onConfirm: async () => {
          const { error } = await sb.from('profiles').update({ banned: true }).eq('id', profile.id);
          if (error) showToast('Error: ' + error.message, 'error');
          else { showToast(`@${profile.username} has been banned.`); location.hash = '#/feed'; }
        }
      });
    });

    qs('#adm-delete')?.addEventListener('click', () => {
      dropdown.classList.add('hidden');
      showConfirmModal({
        title: 'Delete account',
        message: `Permanently delete @${profile.username} and all their data?`,
        confirmText: 'Delete account',
        confirmClass: 'btn-danger',
        danger: true,
        requireType: 'DELETE',
        onConfirm: async () => {
          await sb.from('profiles').delete().eq('id', profile.id);
          showToast(`Account deleted.`);
          location.hash = '#/feed';
        }
      });
    });
  }
}

async function loadProfileTab(tab, userId, isOwn) {
  const area = qs('#profile-content-area');
  area.innerHTML = '<div class="full-loader"><div class="spinner"></div></div>';

  if (tab === 'posts') {
    const { data } = await sb.from('posts').select('id, content, post_type, media_url, created_at, user_id, profiles(id, username, avatar_url), reactions(id, user_id, type), reposts(id, user_id), bookmarks(id, user_id)').eq('user_id', userId).is('reply_to', null).order('created_at', { ascending: false }).limit(30);
    area.innerHTML = `<div class="post-list">${data?.length ? data.map(p=>postCardHTML(p)).join('') : emptyState('No posts.')}</div>`;
    bindPostActions(area);
  } else if (tab === 'replies') {
    const { data } = await sb.from('comments').select('*, profiles(username, avatar_url)').eq('user_id', userId).order('created_at', { ascending: false }).limit(30);
    area.innerHTML = `<div class="post-list">${data?.length ? data.map(c=>`
      <div class="reply-card" style="padding:12px 16px;border-bottom:1px solid var(--border)">
        ${avatarEl(c.profiles,'size-sm')}
        <div class="reply-card-right">
          <div class="reply-meta"><span class="reply-username">@${esc(c.profiles?.username)}</span><span class="reply-time">${timeAgo(c.created_at)}</span></div>
          <div class="reply-text">${esc(c.content)}</div>
        </div>
      </div>`).join('') : emptyState('No replies yet.')}</div>`;
  } else if (tab === 'media') {
    const { data } = await sb.from('posts').select('id, media_url, post_type').eq('user_id', userId).not('media_url', 'is', null).order('created_at', { ascending: false }).limit(30);
    area.innerHTML = `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:2px;padding:2px">${data?.length ? data.map(p=>`
      <div style="aspect-ratio:1;overflow:hidden;cursor:pointer" onclick="location.hash='#/post/${p.id}'">
        ${p.post_type==='video' ? `<video src="${esc(p.media_url)}" style="width:100%;height:100%;object-fit:cover"></video>` : `<img src="${esc(p.media_url)}" style="width:100%;height:100%;object-fit:cover" loading="lazy" />`}
      </div>`).join('') : '<p style="padding:24px;color:var(--muted2);font-size:.88rem">No media posts.</p>'}</div>`;
  } else if (tab === 'likes' && isOwn) {
    const { data } = await sb.from('reactions').select('post_id, posts(id, content, post_type, media_url, created_at, user_id, profiles(id, username, avatar_url), reactions(id, user_id, type), reposts(id, user_id), bookmarks(id, user_id))').eq('user_id', userId).eq('type', 'like').order('created_at', { ascending: false }).limit(30);
    const posts = data?.map(r=>r.posts).filter(Boolean)||[];
    area.innerHTML = `<div class="post-list">${posts.length ? posts.map(p=>postCardHTML(p)).join('') : emptyState('No liked posts.')}</div>`;
    bindPostActions(area);
  }
}

function renderProfileEditForm(profile) {
  const area = qs('#profile-edit-area');
  area.innerHTML = `
    <div class="inline-edit-form" style="margin:16px">
      <div class="field-group">
        <label class="field-label">Display name</label>
        <input class="field-input" id="ep-displayname" type="text" value="${esc(profile.display_name || profile.username)}" maxlength="50" placeholder="Your name" />
      </div>
      <div class="field-group">
        <label class="field-label">Bio</label>
        <textarea class="field-input" id="ep-bio" rows="3" maxlength="160" placeholder="Tell your story…">${esc(profile.bio||'')}</textarea>
      </div>
      <div class="field-group">
        <label class="field-label">Location</label>
        <input class="field-input" id="ep-location" type="text" value="${esc(profile.location||'')}" placeholder="City, Country" maxlength="60" />
      </div>
      <div class="field-group">
        <label class="field-label">Website</label>
        <input class="field-input" id="ep-website" type="url" value="${esc(profile.website||'')}" placeholder="https://…" />
      </div>
      <div id="ep-error" class="form-msg error"></div>
      <div class="inline-edit-actions">
        <button class="btn-cancel-sm" id="ep-cancel">Cancel</button>
        <button class="btn-save-sm" id="ep-save">Save changes</button>
      </div>
    </div>`;

  qs('#ep-cancel').addEventListener('click', () => { area.innerHTML = ''; });
  qs('#ep-save').addEventListener('click', () => saveProfileEdit(profile));
}

async function saveProfileEdit(oldProfile) {
  const displayName = qs('#ep-displayname').value.trim();
  const bio         = qs('#ep-bio').value.trim();
  const loc         = qs('#ep-location').value.trim();
  const website     = qs('#ep-website').value.trim();
  const errEl       = qs('#ep-error');
  const btn         = qs('#ep-save');
  errEl.textContent = '';

  if (!displayName) { errEl.textContent = 'Display name is required.'; return; }

  btn.disabled = true; btn.textContent = 'Saving…';
  const { error } = await sb.from('profiles').update({
    display_name: displayName,
    bio: bio||null,
    location: loc||null,
    website: website||null,
    updated_at: new Date().toISOString()
  }).eq('id', currentUser.id);
  btn.disabled = false; btn.textContent = 'Save changes';
  if (error) { errEl.textContent = error.message; return; }

  currentProfile = { ...currentProfile, display_name: displayName, bio: bio||null, location: loc||null, website: website||null };
  showToast('Profile updated!');
  qs('#profile-edit-area').innerHTML = '';
  renderProfile(oldProfile.username);
}

async function uploadAvatar(file, profile) {
  if (!file) return;
  showToast('Uploading…');
  const ext  = file.name.split('.').pop().toLowerCase();
  const path = `${currentUser.id}/avatar.${ext}`;
  const { error: upErr } = await sb.storage.from('avatars').upload(path, file, { cacheControl: '3600', upsert: true });
  if (upErr) { showToast('Upload failed: ' + upErr.message, 'error'); return; }
  const { data: { publicUrl } } = sb.storage.from('avatars').getPublicUrl(path);
  await sb.from('profiles').update({ avatar_url: publicUrl }).eq('id', currentUser.id);
  currentProfile.avatar_url = publicUrl;
  setComposeAvatar();
  showToast('Avatar updated!');
  renderProfile(profile.username);
}

async function uploadCover(file, profile) {
  if (!file) return;
  showToast('Uploading cover…');
  const ext  = file.name.split('.').pop().toLowerCase();
  const path = `${currentUser.id}/cover.${ext}`;
  const { error: upErr } = await sb.storage.from('avatars').upload(path, file, { cacheControl: '3600', upsert: true });
  if (upErr) { showToast('Cover upload failed: ' + upErr.message, 'error'); return; }
  const { data: { publicUrl } } = sb.storage.from('avatars').getPublicUrl(path);
  await sb.from('profiles').update({ cover_url: publicUrl }).eq('id', currentUser.id);
  currentProfile.cover_url = publicUrl;
  showToast('Cover updated!');
  renderProfile(profile.username);
}

async function renderPostDetail(postId) {
  const view = qs('#view-post');
  view.innerHTML = `<div class="view-header"><h1 class="view-title">Post</h1></div><div class="full-loader"><div class="spinner"></div></div>`;
  if (!postId) { view.innerHTML += emptyState('Post not found.'); return; }

  const { data: post } = await sb.from('posts').select('id, content, post_type, media_url, created_at, user_id, profiles(id, username, avatar_url), reactions(id, user_id, type), reposts(id, user_id), bookmarks(id, user_id)').eq('id', postId).single();
  if (!post) { view.innerHTML = emptyState('Post not found.'); return; }

  const { data: replies } = await sb.from('comments').select('*, profiles(username, avatar_url)').eq('post_id', postId).order('created_at', { ascending: true });

  view.innerHTML = `
    <div class="view-header"><h1 class="view-title">Post</h1></div>
    <div class="post-list">${postCardHTML(post)}</div>
    <div class="replies-list" id="replies-list">
      ${(replies||[]).map(r => `
        <div class="reply-card" data-comment-id="${r.id}">
          ${avatarEl(r.profiles,'size-sm')}
          <div class="reply-card-right">
            <div class="reply-meta">
              <a href="#/profile/${esc(r.profiles?.username)}" class="reply-username">@${esc(r.profiles?.username)}</a>
              <span class="reply-time">${timeAgo(r.created_at)}</span>
              ${(currentUser && r.user_id === currentUser.id) ? `<button class="reply-delete" data-cid="${r.id}">Delete</button>` : ''}
            </div>
            <div class="reply-text">${esc(r.content)}</div>
          </div>
        </div>`).join('')}
      ${!(replies||[]).length ? emptyState('No replies yet. Start the conversation!') : ''}
    </div>
    <div style="padding:12px 16px;border-top:1px solid var(--border);display:flex;gap:10px;align-items:flex-end">
      ${avatarEl(currentProfile,'size-sm')}
      <form id="inline-reply-form" style="flex:1;display:flex;gap:8px;align-items:flex-end">
        <textarea id="inline-reply-text" class="field-input" rows="1" placeholder="${currentUser ? 'Reply…' : 'Sign in to reply…'}" maxlength="500" style="resize:none;flex:1;padding:8px 10px" ${!currentUser ? 'readonly' : ''}></textarea>
        <button type="submit" class="btn-post" style="flex-shrink:0">Reply</button>
      </form>
    </div>`;

  bindPostActions(view);
  qsa('.reply-delete', view).forEach(b => b.addEventListener('click', async () => {
    await sb.from('comments').delete().eq('id', b.dataset.cid).eq('user_id', currentUser.id);
    b.closest('.reply-card')?.remove();
  }));

  qs('#inline-reply-form').addEventListener('submit', async e => {
    e.preventDefault();
    if (!requireAuth()) return;
    const text = qs('#inline-reply-text').value.trim();
    if (!text) return;
    const btn = e.target.querySelector('button');
    setBtn(btn, true, 'Reply');
    await sb.from('comments').insert({ post_id: postId, user_id: currentUser.id, content: text });
    sendNotification(postId, 'comment');
    setBtn(btn, false, 'Reply');
    qs('#inline-reply-text').value = '';
    renderPostDetail(postId);
  });
}

async function renderSettings() {
  if (!requireAuth()) return;
  const view = qs('#view-settings');
  if (!currentProfile) await ensureProfile();

  const canChangeUsername = !currentProfile.username_changed_at ||
    (Date.now() - new Date(currentProfile.username_changed_at)) > 7 * 24 * 3600 * 1000;
  const nextChange = currentProfile.username_changed_at
    ? new Date(new Date(currentProfile.username_changed_at).getTime() + 7 * 24 * 3600 * 1000).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  view.innerHTML = `
    <div class="view-header"><h1 class="view-title">Settings</h1></div>

    <div class="settings-section">
      <h2 class="settings-title">Account</h2>
      <div class="settings-row">
        <div class="settings-row-info">
          <div class="settings-row-label">Username</div>
          <div class="settings-row-desc">@${esc(currentProfile.username)}</div>
          ${!canChangeUsername ? `<div class="cooldown-note">⚠ Next change available: ${nextChange}</div>` : ''}
        </div>
        ${canChangeUsername ? `<button class="btn-sm btn-outline" id="change-username-btn">Change</button>` : `<span class="settings-row-val" style="font-size:.75rem;color:var(--yellow)">Locked</span>`}
      </div>
      <div id="change-username-area"></div>
      <div class="settings-row">
        <div class="settings-row-info">
          <div class="settings-row-label">Password</div>
          <div class="settings-row-desc">Change your password</div>
        </div>
        <button class="btn-sm btn-outline" id="change-pass-btn">Change</button>
      </div>
      <div id="change-pass-area"></div>
    </div>

    <div class="settings-section">
      <h2 class="settings-title">Privacy</h2>
      <div class="settings-row">
        <div class="settings-row-info">
          <div class="settings-row-label">Profile visibility</div>
          <div class="settings-row-desc">Anyone can view your profile</div>
        </div>
        <span class="settings-row-val">Public</span>
      </div>
      <div class="settings-row">
        <div class="settings-row-info">
          <div class="settings-row-label">Show in Explore</div>
          <div class="settings-row-desc">Let others find you in search</div>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" checked id="toggle-explore" />
          <span class="toggle-track"></span>
        </label>
      </div>
      <div class="settings-row">
        <div class="settings-row-info">
          <div class="settings-row-label">Allow messages</div>
          <div class="settings-row-desc">Let others send you direct messages</div>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" ${currentProfile.allow_messages !== false ? 'checked' : ''} id="toggle-messages" />
          <span class="toggle-track"></span>
        </label>
      </div>
    </div>

    <div class="settings-section">
      <h2 class="settings-title">Notifications</h2>
      <div class="settings-row">
        <div class="settings-row-info">
          <div class="settings-row-label">New followers</div>
        </div>
        <label class="toggle-switch"><input type="checkbox" checked /><span class="toggle-track"></span></label>
      </div>
      <div class="settings-row">
        <div class="settings-row-info"><div class="settings-row-label">Likes on posts</div></div>
        <label class="toggle-switch"><input type="checkbox" checked /><span class="toggle-track"></span></label>
      </div>
      <div class="settings-row">
        <div class="settings-row-info"><div class="settings-row-label">Replies</div></div>
        <label class="toggle-switch"><input type="checkbox" checked /><span class="toggle-track"></span></label>
      </div>
    </div>

    <div class="settings-section danger-zone">
      <h2 class="settings-title">Danger Zone</h2>
      <div class="settings-row">
        <div class="settings-row-info">
          <div class="settings-row-label">Sign out</div>
          <div class="settings-row-desc">Sign out of your account</div>
        </div>
        <button class="btn-danger" id="settings-logout-btn">Sign out</button>
      </div>
      <div class="settings-row">
        <div class="settings-row-info">
          <div class="settings-row-label" style="color:var(--red)">Delete account</div>
          <div class="settings-row-desc">Permanently delete all your data</div>
        </div>
        <button class="btn-danger" id="delete-account-btn">Delete</button>
      </div>
    </div>`;

  qs('#toggle-messages')?.addEventListener('change', async function() {
    await sb.from('profiles').update({ allow_messages: this.checked }).eq('id', currentUser.id);
    if (currentProfile) currentProfile.allow_messages = this.checked;
  });

  qs('#settings-logout-btn').addEventListener('click', () => {
    showConfirmModal({
      title: 'Sign out',
      message: 'Are you sure you want to sign out of your account?',
      confirmText: 'Sign out',
      confirmClass: 'btn-danger',
      onConfirm: () => sb.auth.signOut()
    });
  });

  qs('#change-username-btn')?.addEventListener('click', () => {
    const area = qs('#change-username-area');
    if (area.innerHTML) { area.innerHTML = ''; return; }
    area.innerHTML = `
      <div class="inline-edit-form" style="margin:12px 0">
        <div class="field-group">
          <label class="field-label">New username</label>
          <div class="input-prefix-wrap">
            <span class="input-prefix">@</span>
            <input class="field-input prefixed" id="new-username-input" type="text" placeholder="newhandle" maxlength="24" autocorrect="off" autocapitalize="none" />
          </div>
          <span class="field-hint" id="new-uname-hint">You can only change username once every 7 days.</span>
        </div>
        <div id="new-uname-err" class="form-msg error"></div>
        <div class="inline-edit-actions">
          <button class="btn-cancel-sm" id="nu-cancel">Cancel</button>
          <button class="btn-save-sm" id="nu-save">Save</button>
        </div>
      </div>`;
    qs('#nu-cancel').addEventListener('click', () => { area.innerHTML = ''; });
    qs('#nu-save').addEventListener('click', () => saveNewUsername());
  });

  qs('#change-pass-btn').addEventListener('click', () => {
    const area = qs('#change-pass-area');
    if (area.innerHTML) { area.innerHTML = ''; return; }
    area.innerHTML = `
      <div class="inline-edit-form" style="margin:12px 0">
        <div class="field-group">
          <label class="field-label">New password</label>
          <input class="field-input" id="new-pass-input" type="password" placeholder="Min 8 characters" />
        </div>
        <div id="pass-err" class="form-msg error"></div>
        <div class="inline-edit-actions">
          <button class="btn-cancel-sm" id="np-cancel">Cancel</button>
          <button class="btn-save-sm" id="np-save">Update password</button>
        </div>
      </div>`;
    qs('#np-cancel').addEventListener('click', () => { area.innerHTML = ''; });
    qs('#np-save').addEventListener('click', async () => {
      const pass = qs('#new-pass-input').value;
      const err  = qs('#pass-err');
      const btn  = qs('#np-save');
      if (pass.length < 8) { err.textContent = 'Min 8 characters.'; return; }
      setBtn(btn, true, 'Update password');
      const { error } = await sb.auth.updateUser({ password: pass });
      setBtn(btn, false, 'Update password');
      if (error) err.textContent = error.message;
      else { qs('#change-pass-area').innerHTML = ''; showToast('Password updated!'); }
    });
  });

  qs('#delete-account-btn').addEventListener('click', () => {
    showConfirmModal({
      title: 'Delete account',
      message: 'This will <strong style="color:var(--red)">permanently delete</strong> your account, all posts, followers and data. This action <strong>cannot be undone</strong>.',
      confirmText: 'Delete my account',
      confirmClass: 'btn-danger',
      danger: true,
      requireType: 'DELETE',
      onConfirm: async () => {
        showToast('Deleting account…');
        try {
          await sb.from('profiles').delete().eq('id', currentUser.id);
          await sb.from('posts').delete().eq('user_id', currentUser.id);
          await sb.from('follows').delete().eq('follower_id', currentUser.id);
          await sb.from('follows').delete().eq('following_id', currentUser.id);
          await sb.from('bookmarks').delete().eq('user_id', currentUser.id);
          await sb.auth.signOut();
          showToast('Account deleted.');
        } catch (err) {
          showToast('Error: ' + err.message, 'error');
        }
      }
    });
  });
}

async function saveNewUsername() {
  const val  = qs('#new-username-input').value.trim().toLowerCase().replace(/[^a-z0-9_]/g,'');
  const err  = qs('#new-uname-err');
  const btn  = qs('#nu-save');
  err.textContent = '';
  if (!val || val.length < 3) { err.textContent = 'Min 3 characters.'; return; }
  if (val === currentProfile.username) { err.textContent = 'Same as current username.'; return; }

  const { data: ex } = await sb.from('profiles').select('id').eq('username', val).maybeSingle();
  if (ex) { err.textContent = 'Already taken.'; return; }

  setBtn(btn, true, 'Save');
  const { error } = await sb.from('profiles').update({ username: val, username_changed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', currentUser.id);
  setBtn(btn, false, 'Save');
  if (error) { err.textContent = error.message; return; }
  const oldUsername = currentProfile.username;
  currentProfile.username = val;
  currentProfile.username_changed_at = new Date().toISOString();
  showToast(`Username changed to @${val}!`);
  renderSettings();
}

function setupCompose() {
  const modal = qs('#compose-modal');
  let activeType = 'text';

  const openModal = () => { if (!requireAuth()) return; modal.classList.add('open'); setComposeAvatar(); };
  const closeModal = () => { modal.classList.remove('open'); resetCompose(); };

  qs('#bnav-compose-btn')?.addEventListener('click', openModal);
  qs('#modal-scrim').addEventListener('click', closeModal);
  qs('#modal-close-btn').addEventListener('click', closeModal);

  qsa('.ctype-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      qsa('.ctype-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeType = btn.dataset.type;
      updateComposeType(activeType);
    });
  });

  qs('#compose-text').addEventListener('input', function() {
    qs('#compose-count').textContent = this.value.length;
  });

  qs('#compose-img-input').addEventListener('change', function() {
    const file = this.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      qs('#compose-img-el').src = e.target.result;
      qs('#compose-img-preview').classList.remove('hidden');
      qs('#image-upload-zone').classList.add('hidden');
    };
    reader.readAsDataURL(file);
  });

  qs('#img-remove-btn').addEventListener('click', () => {
    qs('#compose-img-input').value = '';
    qs('#compose-img-el').src = '';
    qs('#compose-img-preview').classList.add('hidden');
    qs('#image-upload-zone').classList.remove('hidden');
  });

  qs('#compose-video-input').addEventListener('change', function() {
    const file = this.files[0]; if (!file) return;
    const url = URL.createObjectURL(file);
    qs('#compose-video-el').src = url;
    qs('#compose-video-preview').classList.remove('hidden');
    qs('#video-upload-zone').classList.add('hidden');
  });

  qs('#video-remove-btn').addEventListener('click', () => {
    qs('#compose-video-input').value = '';
    qs('#compose-video-el').src = '';
    qs('#compose-video-preview').classList.add('hidden');
    qs('#video-upload-zone').classList.remove('hidden');
  });

  qs('#md-preview-toggle')?.addEventListener('click', () => {
    const preview = qs('#md-preview-area');
    const text = qs('#compose-text').value;
    if (preview.classList.contains('hidden')) {
      preview.innerHTML = marked.parse(text || '_Nothing to preview_');
      preview.classList.remove('hidden');
      qs('#md-preview-toggle').textContent = 'Edit';
    } else {
      preview.classList.add('hidden');
      qs('#md-preview-toggle').textContent = 'Preview';
    }
  });

  qsa('.md-tool').forEach(btn => {
    btn.addEventListener('click', () => {
      const ta = qs('#compose-text');
      const md = btn.dataset.md;
      const start = ta.selectionStart, end = ta.selectionEnd;
      const sel = ta.value.slice(start, end);
      const replacement = md.includes('**') ? `**${sel || 'bold'}**`
        : md.includes('*') ? `*${sel || 'italic'}*`
        : md.includes('`') ? `\`${sel || 'code'}\``
        : md + (sel || '');
      ta.value = ta.value.slice(0, start) + replacement + ta.value.slice(end);
      ta.focus();
      qs('#compose-count').textContent = ta.value.length;
    });
  });

  qs('#add-poll-option-btn')?.addEventListener('click', () => {
    const list = qs('#poll-options-list');
    const count = qsa('.poll-option-input', list).length;
    if (count >= 4) { showToast('Max 4 options.'); return; }
    const inp = document.createElement('input');
    inp.className = 'field-input poll-option-input';
    inp.type = 'text';
    inp.placeholder = `Option ${count + 1}`;
    inp.maxLength = 80;
    list.appendChild(inp);
  });

  qs('#compose-form').addEventListener('submit', async e => {
    e.preventDefault();
    if (currentProfile?.banned || currentProfile?.is_shadowbanned) {
      showToast('You cannot create posts at this time.', 'error');
      return;
    }
    const content = qs('#compose-text').value.trim();
    const errEl   = qs('#compose-error');
    const btn     = qs('#compose-submit');
    errEl.textContent = '';
    if (!content && activeType !== 'poll') { errEl.textContent = 'Write something first.'; return; }

    setBtn(btn, true, 'Post');
    let media_url = null;

    try {
      if (activeType === 'image') {
        const file = qs('#compose-img-input').files[0];
        if (file) media_url = await uploadFile(file, 'post-images', 'posts');
      } else if (activeType === 'video') {
        const file = qs('#compose-video-input').files[0];
        if (file) media_url = await uploadFile(file, 'post-images', 'posts');
      }

      const { data: post, error } = await sb.from('posts').insert({
        user_id: currentUser.id,
        content: content || '📊 Poll',
        post_type: activeType,
        media_url
      }).select().single();

      if (error) throw error;

      if (activeType === 'poll' && post) {
        const opts = qsa('.poll-option-input').map(i => i.value.trim()).filter(Boolean);
        if (opts.length >= 2) {
          await sb.from('poll_options').insert(opts.map(label => ({ post_id: post.id, label })));
        }
      }

      closeModal();
      showToast('Posted!');
      const view = qs('#view-feed');
      if (view) { /* feed reloads on every visit */ }
      location.hash = '#/feed';
      renderFeed();
    } catch (err) {
      errEl.textContent = err.message || 'Failed to post.';
    }
    setBtn(btn, false, 'Post');
  });
}

async function uploadFile(file, bucket, folder) {
  const ext  = file.name.split('.').pop().toLowerCase();
  const path = `${folder}/${currentUser.id}/${Date.now()}.${ext}`;
  const { error } = await sb.storage.from(bucket).upload(path, file, { cacheControl: '3600' });
  if (error) throw error;
  const { data: { publicUrl } } = sb.storage.from(bucket).getPublicUrl(path);
  return publicUrl;
}

function updateComposeType(type) {
  qsa('[id^="compose-"][id$="-area"]').forEach(el => el.classList.add('hidden'));
  qs('#compose-md-toolbar').classList.add('hidden');
  qs('#compose-poll-area').classList.add('hidden');
  qs('#md-preview-area').classList.add('hidden');

  const hints = { text: 'Plain text', image: 'Image post', video: 'Video post', markdown: 'Markdown formatting', poll: 'Poll — add options below' };
  qs('#compose-hint').textContent = hints[type] || '';
  qs('#compose-text').placeholder = type === 'poll' ? 'Ask a question…' : "What's flowing through your mind?";

  if (type === 'image') qs('#compose-image-area').classList.remove('hidden');
  else if (type === 'video') qs('#compose-video-area').classList.remove('hidden');
  else if (type === 'markdown') qs('#compose-md-toolbar').classList.remove('hidden');
  else if (type === 'poll') qs('#compose-poll-area').classList.remove('hidden');
}

function resetCompose() {
  qs('#compose-form').reset();
  qs('#compose-count').textContent = '0';
  qs('#compose-img-el').src = '';
  qs('#compose-img-preview').classList.add('hidden');
  qs('#image-upload-zone').classList.remove('hidden');
  qs('#compose-video-el').src = '';
  qs('#compose-video-preview').classList.add('hidden');
  qs('#video-upload-zone').classList.remove('hidden');
  qs('#md-preview-area').classList.add('hidden');
  qs('#compose-error').textContent = '';
  qs('#compose-hint').textContent = 'Plain text';
  qsa('.ctype-btn').forEach(b => b.classList.toggle('active', b.dataset.type === 'text'));
  updateComposeType('text');
  const pl = qs('#poll-options-list');
  if (pl) { pl.innerHTML = '<input class="field-input poll-option-input" type="text" placeholder="Option 1" maxlength="80" /><input class="field-input poll-option-input" type="text" placeholder="Option 2" maxlength="80" />'; }
}

function setComposeAvatar() {
  const els = qsa('#compose-avatar, #reply-avatar, #quote-avatar');
  els.forEach(el => {
    if (!el) return;
    if (currentProfile?.avatar_url) {
      el.innerHTML = `<img src="${esc(currentProfile.avatar_url)}" alt="" />`;
    } else {
      el.textContent = (currentProfile?.username || '?')[0].toUpperCase();
      el.style.background = strToColor(currentProfile?.username || '?');
    }
  });
}

function setupReplyModal() {
  const modal = qs('#reply-modal');
  qs('#reply-scrim').addEventListener('click', () => modal.classList.remove('open'));
  qs('#reply-close-btn').addEventListener('click', () => modal.classList.remove('open'));
  qs('#reply-form').addEventListener('submit', async e => {
    e.preventDefault();
    const text = qs('#reply-text').value.trim();
    if (!text || !replyTargetPostId) return;
    const btn = qs('#reply-submit');
    setBtn(btn, true, 'Reply');
    await sb.from('comments').insert({ post_id: replyTargetPostId, user_id: currentUser.id, content: text });
    sendNotification(replyTargetPostId, 'comment');
    setBtn(btn, false, 'Reply');
    qs('#reply-text').value = '';
    modal.classList.remove('open');
    replyTargetPostId = null;
    showToast('Replied!');
  });
}

async function openReplyModal(postId) {
  const { data: post } = await sb.from('posts').select('user_id, content, profiles(username)').eq('id', postId).single();
  if (post?.profiles?.username === 'noreply') {
    showToast('You cannot reply to this account.', 'error');
    return;
  }
  replyTargetPostId = postId;
  if (post) {
    qs('#reply-parent-preview').innerHTML = `<strong>@${esc(post.profiles?.username)}</strong>: ${esc(post.content.slice(0, 100))}${post.content.length > 100 ? '…' : ''}`;
  }
  setComposeAvatar();
  qs('#reply-modal').classList.add('open');
  qs('#reply-text').focus();
}

function setupQuoteModal() {
  const modal = qs('#quote-modal');
  qs('#quote-scrim').addEventListener('click', () => modal.classList.remove('open'));
  qs('#quote-close-btn').addEventListener('click', () => modal.classList.remove('open'));
  qs('#quote-form').addEventListener('submit', async e => {
    e.preventDefault();
    const text = qs('#quote-text').value.trim();
    if (!text || !quoteTargetPost) return;
    const btn = qs('#quote-submit');
    setBtn(btn, true, 'Post');
    const { error } = await sb.from('posts').insert({ user_id: currentUser.id, content: text, post_type: 'text', quote_of: quoteTargetPost.id });
    setBtn(btn, false, 'Post');
    if (error) { qs('#quote-error').textContent = error.message; return; }
    modal.classList.remove('open');
    qs('#quote-text').value = '';
    quoteTargetPost = null;
    showToast('Quoted!');
    const view = qs('#view-feed');
    if (view) { renderFeed(); }
  });
}

async function openQuoteModal(postId) {
  const { data: post } = await sb.from('posts').select('id, content, profiles(username)').eq('id', postId).single();
  if (!post) return;
  if (post.profiles?.username === 'noreply') {
    showToast('You cannot quote posts from this account.', 'error');
    return;
  }
  quoteTargetPost = post;
  qs('#quote-preview-card').innerHTML = `<div class="quote-meta">@${esc(post.profiles?.username)}</div><div class="quote-text">${esc(post.content.slice(0,120))}</div>`;
  setComposeAvatar();
  qs('#quote-modal').classList.add('open');
  qs('#quote-text').focus();
}

function closeAllModals() {
  qsa('.modal').forEach(m => m.classList.remove('open'));
}

async function votePoll(optionId, postId) {
  if (!optionId) return;
  const { error } = await sb.from('poll_votes').insert({ option_id: optionId, user_id: currentUser.id });
  if (error) { showToast('Already voted!'); return; }
  await sb.rpc('increment_view_count', { post_id: postId });
  showToast('Voted!');
  const card = document.querySelector(`[data-post-id="${postId}"]`);
  if (card) {
    const { data: opts } = await sb.from('poll_options').select('*, poll_votes(id)').eq('post_id', postId);
    if (opts) {
      const total = opts.reduce((a,o)=>(a + (o.poll_votes||[]).length), 0);
      qsa('.poll-bar-wrap', card).forEach(bar => {
        const opt = opts.find(o => o.id === bar.dataset.optionId);
        if (opt) {
          const pct = total ? Math.round(((opt.poll_votes||[]).length / total) * 100) : 0;
          bar.querySelector('.poll-bar-fill').style.width = `${pct}%`;
          bar.querySelector('.poll-bar-pct').textContent = `${pct}%`;
          bar.classList.add('voted');
        }
      });
    }
  }
}

async function loadRightPanel() {
  loadTrending();
  loadSuggestions();
}

async function loadTrending() {
  const el = qs('#trending-list');
  if (!el) return;
  const { data } = await sb.from('posts').select('content').order('created_at', { ascending: false }).limit(100);
  const words = {};
  (data||[]).forEach(p => {
    const tags = p.content.match(/#\w+/g)||[];
    tags.forEach(t => { words[t] = (words[t]||0)+1; });
  });
  const sorted = Object.entries(words).sort((a,b)=>b[1]-a[1]).slice(0,6);
  if (!sorted.length) { el.textContent = 'Nothing trending yet.'; return; }
  el.innerHTML = sorted.map(([tag, count]) => `
    <div class="trend-item" onclick="location.hash='#/explore?tag=${encodeURIComponent(tag.slice(1))}'">
      <div class="trend-tag">${esc(tag)}</div>
      <div class="trend-count">${count} post${count!==1?'s':''}</div>
    </div>`).join('');
}

async function loadSuggestions() {
  const el = qs('#suggest-list');
  if (!el) return;
  if (!currentUser) { el.innerHTML = '<p style="font-size:.8rem;color:var(--muted2)">Sign in to see suggestions.</p>'; return; }
  const { data: follows } = await sb.from('follows').select('following_id').eq('follower_id', currentUser.id);
  const fids = new Set((follows||[]).map(f=>f.following_id));
  fids.add(currentUser.id);

  const { data: users } = await sb.from('profiles').select('id, username, avatar_url').limit(20);
  const candidates = (users||[]).filter(u=>!fids.has(u.id)).slice(0,4);

  if (!candidates.length) { el.innerHTML = '<p style="font-size:.8rem;color:var(--muted2)">You follow everyone!</p>'; return; }
  el.innerHTML = candidates.map(u => `
    <div class="suggest-item">
      ${avatarEl(u,'size-sm')}
      <div class="suggest-info">
        <div class="suggest-name">@${esc(u.username)}</div>
      </div>
      <button class="btn-follow" data-uid="${u.id}" style="font-size:.75rem;padding:4px 10px" onclick="this.classList.add('following');this.textContent='Following';sb.from('follows').insert({follower_id:'${currentUser.id}',following_id:'${u.id}'})">Follow</button>
    </div>`).join('');
}

function emptyState(msg) {
  return `<div class="empty-state">
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
    <p>${esc(msg)}</p>
  </div>`;
}

function hideLoader() {
    const loader = document.getElementById('app-loader');
    if (loader) {
        loader.style.opacity = '0';
        loader.style.pointerEvents = 'none';
        setTimeout(() => { if (loader.parentNode) loader.remove(); }, 500);
    }
}

function setupNotifications() {
    if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission();
    }
}

async function initApp() {
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (session) {
      currentUser = session.user;
      await ensureProfile();
    }
  } catch (e) {
    currentUser = null;
  }

  updateAuthUI();
  
  if (!currentUser) {
    qs('#page-auth').classList.add('hidden');
    qs('#page-app').classList.remove('hidden');
    location.hash = '#/login';
    route();
    hideLoader();
  } else {
    setComposeAvatar();
    qs('#page-auth').classList.add('hidden');
    qs('#page-app').classList.remove('hidden');
    if (!location.hash || location.hash === '#' || location.hash === '#/' || location.hash === '#/login') location.hash = '#/feed';
    route();
    hideLoader();
    loadNotifCount();
    loadRightPanel();
    subscribeRealtime();
    setTimeout(registerPush, 3000);
  }

  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN') {
      if (currentUser?.id === session?.user?.id) return;
      currentUser = session.user;
      await ensureProfile();
      updateAuthUI();
      setComposeAvatar();
      qs('#page-auth').classList.add('hidden');
      qs('#page-app').classList.remove('hidden');
      if (!location.hash || location.hash === '#' || location.hash === '#/' || location.hash === '#/login') location.hash = '#/feed';
      route();
      loadNotifCount();
      loadRightPanel();
      subscribeRealtime();
      registerPush();
    } else if (event === 'TOKEN_REFRESHED') {
      if (session) currentUser = session.user;
    } else if (event === 'SIGNED_OUT') {
      currentUser = null;
      currentProfile = null;
      if (realtimeSub) { realtimeSub.unsubscribe(); realtimeSub = null; } if (_pollInterval) { clearInterval(_pollInterval); _pollInterval = null; } _feedNewestTs = null; _notifNewestTs = null;
      updateAuthUI();
      setComposeAvatar();
      location.hash = '#/feed';
      route();
    }
  });
}
async function ensureProfile() {
  if (!currentUser) return;
  try {
    const deviceId = getOrCreateDeviceId();
    let { data, error } = await sb.from('profiles').select('*').eq('id', currentUser.id).maybeSingle();
    if (error) throw error;
    if (!data) {
      let base = (currentUser.user_metadata?.username || currentUser.email.split('@')[0]).toLowerCase().replace(/[^a-z0-9_]/g,'');
      let uname = base;
      let tries = 0;
      while (tries < 10) {
        const { data: ex } = await sb.from('profiles').select('id').eq('username', uname).maybeSingle();
        if (!ex) break;
        tries++;
        uname = base + tries;
      }
      await sb.from('profiles').upsert({ id: currentUser.id, username: uname, display_name: uname, user_email: currentUser.email, device_id: deviceId });
      const { data: fresh } = await sb.from('profiles').select('*').eq('id', currentUser.id).single();
      data = fresh;
    } else if (!data.user_email) {
      await sb.from('profiles').update({ user_email: currentUser.email, device_id: deviceId }).eq('id', currentUser.id);
      data.user_email = currentUser.email;
      data.device_id = deviceId;
    } else if (!data.device_id) {
      await sb.from('profiles').update({ device_id: deviceId }).eq('id', currentUser.id);
      data.device_id = deviceId;
    }
    currentProfile = data;
  } catch (e) {
    console.error(e);
  }
}

function enterApp() {
  qs('#page-auth').classList.add('hidden');
  qs('#page-app').classList.remove('hidden');
  if (!location.hash || location.hash === '#' || location.hash === '#/') location.hash = '#/feed';
}

function requireAuth() {
  if (!currentUser) {
    location.hash = '#/login';
    return false;
  }
  return true;
}

function updateAuthUI() {
  const container = qs('#nav-auth-container');
  if (!container) return;
  if (!currentUser) {
    container.innerHTML = `
      <div class="guest-card">
        <h3>New to Flow?</h3>
        <p>Sign up now to get your own personalized timeline!</p>
        <button class="btn-primary" onclick="showAuthPage()">Sign In / Sign Up</button>
      </div>`;
  } else {
    container.innerHTML = '';
  }
  const logoutBtn = qs('#logout-btn');
  if (logoutBtn) logoutBtn.style.display = 'none';
}


function showConfirmModal({ title, message, confirmText = 'Confirm', confirmClass = 'btn-danger', onConfirm, danger = false, requireType = null }) {
  const existing = qs('#custom-confirm-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'custom-confirm-modal';
  modal.innerHTML = `
    <div class="custom-modal-scrim"></div>
    <div class="custom-modal-box">
      <div class="custom-modal-icon ${danger ? 'danger' : ''}">
        ${danger
          ? `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`
          : `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
        }
      </div>
      <h3 class="custom-modal-title">${esc(title)}</h3>
      <p class="custom-modal-msg">${message}</p>
      ${requireType ? `
        <p class="custom-modal-type-hint">Type <strong>${esc(requireType)}</strong> to confirm:</p>
        <input class="field-input custom-modal-type-input" id="confirm-type-input" type="text" placeholder="${esc(requireType)}" autocomplete="off" />
      ` : ''}
      <div class="custom-modal-actions">
        <button class="btn-sm btn-outline" id="confirm-cancel-btn">Cancel</button>
        <button class="btn-sm ${confirmClass}" id="confirm-ok-btn" ${requireType ? 'disabled' : ''}>${esc(confirmText)}</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  requestAnimationFrame(() => modal.classList.add('open'));

  const close = () => { modal.classList.remove('open'); setTimeout(() => modal.remove(), 200); };

  qs('#confirm-cancel-btn', modal).addEventListener('click', close);
  qs('.custom-modal-scrim', modal).addEventListener('click', close);

  if (requireType) {
    const input = qs('#confirm-type-input', modal);
    const okBtn = qs('#confirm-ok-btn', modal);
    input.addEventListener('input', () => {
      okBtn.disabled = input.value !== requireType;
    });
    input.focus();
  }

  qs('#confirm-ok-btn', modal).addEventListener('click', () => {
    close();
    onConfirm();
  });
}

function showInputModal({ title, message, inputPlaceholder = '', inputLabel = '', confirmText = 'Confirm', onConfirm, minLength = 1 }) {
  const existing = qs('#custom-input-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'custom-input-modal';
  modal.innerHTML = `
    <div class="custom-modal-scrim"></div>
    <div class="custom-modal-box">
      <h3 class="custom-modal-title">${esc(title)}</h3>
      <p class="custom-modal-msg">${message}</p>
      ${inputLabel ? `<label class="custom-modal-label">${esc(inputLabel)}</label>` : ''}
      <input class="field-input custom-modal-input" id="input-field" type="text" placeholder="${esc(inputPlaceholder)}" autocomplete="off" />
      <div class="custom-modal-actions">
        <button class="btn-sm btn-outline" id="input-cancel-btn">Cancel</button>
        <button class="btn-sm btn-primary" id="input-ok-btn" disabled>${esc(confirmText)}</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  requestAnimationFrame(() => modal.classList.add('open'));

  const close = () => { modal.classList.remove('open'); setTimeout(() => modal.remove(), 200); };

  qs('#input-cancel-btn', modal).addEventListener('click', close);
  qs('.custom-modal-scrim', modal).addEventListener('click', close);

  const input = qs('#input-field', modal);
  const okBtn = qs('#input-ok-btn', modal);

  input.addEventListener('input', () => {
    okBtn.disabled = input.value.length < minLength;
  });

  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !okBtn.disabled) {
      okBtn.click();
    }
  });

  okBtn.addEventListener('click', () => {
    const value = input.value.trim();
    if (value.length >= minLength) {
      close();
      onConfirm(value);
    }
  });

  input.focus();
}

function showUserListModal(title, users) {
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:flex-end;z-index:100';
  modal.innerHTML = `
    <div class="modal-sheet" style="width:100%;max-width:600px;max-height:80vh;border-radius:16px 16px 0 0;background:var(--bg);padding:16px;display:flex;flex-direction:column;box-shadow:0 -4px 12px rgba(0,0,0,.2)">
      <div class="modal-head">
        <h3 class="modal-title">${esc(title)}</h3>
        <button class="icon-btn" onclick="this.closest('.modal').remove()">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div style="flex:1;overflow-y:auto;margin-top:12px">
        ${users.length ? users.map(u => `
          <div class="user-row" onclick="location.hash='#/profile/${esc(u.username)}'">
            ${avatarEl(u, 'size-md')}
            <div class="user-row-info">
              <div class="user-row-name">@${esc(u.username)} ${u.verified ? '<img class="verified-badge" src="https://img.icons8.com/fluency/96/instagram-verification-badge.png" style="width:14px;height:14px;margin-left:4px" />' : ''}</div>
            </div>
          </div>
        `).join('') : '<p style="text-align:center;color:var(--muted2);padding:24px;font-size:.88rem">No one yet</p>'}
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  requestAnimationFrame(() => modal.classList.add('open'));
  modal.addEventListener('click', e => {
    if (e.target === modal) modal.remove();
  });
}

function showReportModal(postId) {
  showInputModal({
    title: 'Report post',
    message: 'Why are you reporting this post?',
    inputPlaceholder: 'Spam, harassment, inappropriate content, etc.',
    inputLabel: 'Reason',
    confirmText: 'Report',
    minLength: 10,
    onConfirm: async (reason) => {
      const { error } = await sb.from('reports').insert({
        post_id: postId,
        reported_by: currentUser.id,
        reason: reason,
        created_at: new Date().toISOString()
      });
      if (error) showToast('Error reporting post: ' + error.message, 'error');
      else showToast('Report submitted. Thank you for helping keep Flow safe.');
    }
  });
}

init();
let activeChatSub = null;

async function compressImage(file, maxPx = 480) {
  return new Promise(res => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      canvas.toBlob(blob => res(new File([blob], file.name, { type: 'image/jpeg' })), 'image/jpeg', 0.82);
    };
    img.src = url;
  });
}

async function openDM(otherUserId) {
  if (!requireAuth()) return;
  const uid = currentUser.id;
  const [a, b] = [uid, otherUserId].sort();
  let { data: conv } = await sb.from('conversations')
    .select('id').eq('user1_id', a).eq('user2_id', b).maybeSingle();
  if (!conv) {
    const { data: newConv } = await sb.from('conversations')
      .insert({ user1_id: a, user2_id: b }).select('id').single();
    conv = newConv;
  }
  location.hash = `#/chat/${conv.id}`;
}

async function renderChats() {
  if (!requireAuth()) return;
  const view = qs('#view-chats');
  view.innerHTML = `
    <div class="view-header">
      <h1 class="view-title">Messages</h1>
    </div>
    <div id="chat-list-content"><div class="full-loader"><div class="spinner"></div></div></div>`;

  await loadChatTab('dms');
}

async function loadChatTab(tab) {
  const el = qs('#chat-list-content');
  el.innerHTML = '<div class="full-loader"><div class="spinner"></div></div>';

  const { data: convs } = await sb.from('conversations')
    .select('id, user1_id, user2_id, streak_count, streak_active, last_message_at, is_pinned, messages(content, created_at, sender_id, message_type, read_by)')
    .or(`user1_id.eq.${currentUser.id},user2_id.eq.${currentUser.id}`)
    .order('last_message_at', { ascending: false });

  if (!convs?.length) { el.innerHTML = '<p style="padding:24px;color:var(--muted2);text-align:center;font-size:.88rem">No conversations yet.<br>Visit someone\'s profile to start chatting.</p>'; return; }

  const sorted = convs.sort((a, b) => {
    if (a.is_pinned && !b.is_pinned) return -1;
    if (!a.is_pinned && b.is_pinned) return 1;
    return new Date(b.last_message_at) - new Date(a.last_message_at);
  });

  const otherIds = sorted.map(c => c.user1_id === currentUser.id ? c.user2_id : c.user1_id);
  const { data: profiles } = await sb.from('profiles').select('id, username, display_name, avatar_url, verified').in('id', otherIds);
  const pmap = Object.fromEntries((profiles||[]).map(p => [p.id, p]));

  el.innerHTML = sorted.map(c => {
    const otherId = c.user1_id === currentUser.id ? c.user2_id : c.user1_id;
    const other = pmap[otherId] || { username: 'Unknown' };
    const lastMsg = c.messages?.sort((a,b) => new Date(b.created_at)-new Date(a.created_at))[0];
    const unread = lastMsg && lastMsg.sender_id !== currentUser.id && !lastMsg.read_by?.includes(currentUser.id);
    const lastText = lastMsg ? (lastMsg.message_type === 'image' ? '📷 Photo' : lastMsg.content?.slice(0,40)) : 'No messages yet';
    const streak = c.streak_active && c.streak_count > 0 
      ? `<span class="streak-badge" style="display: inline-flex; align-items: center; gap: 4px;">
          <img src="https://img.icons8.com/emoji/96/fire.png" style="height: 24px; width: auto;" alt="streak" /> 
          ${c.streak_count}
        </span>` 
      : '';
    return `
      <div class="chat-row ${c.is_pinned ? 'pinned' : ''} ${unread ? 'unread' : ''}" data-conv-id="${c.id}" style="${unread ? 'font-weight:600' : ''}">
        ${avatarEl(other, 'size-md')}
        <div class="chat-row-info">
          <div class="chat-row-top">
            <span class="chat-row-name">
              ${esc(other.display_name || other.username)}
              ${c.is_pinned ? `<img src="https://img.icons8.com/material-rounded/96/pin.png" style="height: 12px; width: auto; filter: invert(1); margin-left: 4px; vertical-align: middle;" alt="pinned" />` : ''}
          </span>${badgesFor(other)}${streak}
            <span class="chat-row-time">${lastMsg ? timeAgo(lastMsg.created_at) : ''}</span>
          </div>
          <div class="chat-row-preview">${unread ? '● ' : ''}${esc(lastText||'')}</div>
        </div>
        <div class="chat-row-actions" onclick="event.stopPropagation()" style="display:flex;gap:4px">
              <button class="icon-btn pin-chat-btn" data-conv-id="${c.id}" 
            style="padding:4px; width:30px; height:30px; display: inline-flex; align-items: center; justify-content: center;" 
            title="${c.is_pinned ? 'Unpin' : 'Pin'} chat">
        <img src="https://img.icons8.com/material-rounded/96/pin.png" 
            style="width: 16px; height: 16px; filter: invert(1); ${c.is_pinned ? 'opacity: 1;' : 'opacity: 0.5;'}" 
            alt="pin" />
            </button>
          <button class="icon-btn mute-chat-btn" data-conv-id="${c.id}" 
            style="padding:4px; width:30px; height:30px; display: inline-flex; align-items: center; justify-content: center;" 
            title="Mute notifications">
        <img src="https://img.icons8.com/material-rounded/96/notification-off.png" 
            style="width: 16px; height: 16px; filter: invert(1); opacity: 0.8;" 
            alt="mute" />
    </button>
        </div>
      </div>`;
  }).join('');

  qsa('.chat-row', el).forEach(r => r.addEventListener('click', () => location.hash = `#/chat/${r.dataset.convId}`));
  qsa('.pin-chat-btn', el).forEach(b => b.addEventListener('click', async () => {
    const convId = b.dataset.convId;
    const { data: conv } = await sb.from('conversations').select('is_pinned').eq('id', convId).single();
    await sb.from('conversations').update({ is_pinned: !conv.is_pinned }).eq('id', convId);
    loadChatTab(tab);
  }));
  qsa('.mute-chat-btn', el).forEach(b => b.addEventListener('click', async () => {
    const convId = b.dataset.convId;
    showToast('Chat notifications muted.');
  }));
}

async function renderChat(convId) {
  if (!requireAuth()) return;
  const view = qs('#view-chat');

  const { data: conv } = await sb.from('conversations')
    .select('id, user1_id, user2_id, streak_count, streak_active, streak_invited_by, streak_accepted')
    .eq('id', convId).single();
  if (!conv) { view.innerHTML = '<p style="padding:24px">Conversation not found.</p>'; return; }

  const otherId = conv.user1_id === currentUser.id ? conv.user2_id : conv.user1_id;
  const { data: other } = await sb.from('profiles').select('id, username, display_name, avatar_url, verified').eq('id', otherId).single();

  const streakHtml = conv.streak_active && conv.streak_count > 0
    ? `<span class="streak-badge large" style="display: inline-flex; align-items: center; gap: 6px;">
        <img src="https://img.icons8.com/emoji/96/fire.png" style="height: 18px; width: auto;" alt="fire" /> 
        ${conv.streak_count} day streak
      </span>`
    : conv.streak_invited_by && conv.streak_invited_by !== currentUser.id && !conv.streak_accepted
      ? `<button class="btn-sm btn-streak" id="accept-streak-btn" style="display: inline-flex; align-items: center; gap: 5px;">
          <img src="https://img.icons8.com/emoji/96/fire.png" style="height: 18px; width: auto;" /> Accept streak invite
        </button>`
      : conv.streak_invited_by === currentUser.id && !conv.streak_accepted
        ? `<span style="font-size:.75rem; color:var(--muted2); display: inline-flex; align-items: center; gap: 5px;">
            <img src="https://img.icons8.com/emoji/96/fire.png" style="height: 18px; width: auto; opacity: 1;" /> Streak invite sent…
          </span>`
        : currentUser
          ? `<button class="btn-sm btn-streak-invite" id="invite-streak-btn" style="display: inline-flex; align-items: center; gap: 5px;">
              <img src="https://img.icons8.com/emoji/96/fire.png" style="height: 18px; width: auto;" /> Start streak
            </button>`
          : '';

  view.innerHTML = `
    <div class="chat-header">
      <a href="#/profile/${esc(other?.username)}" class="chat-header-user">
        ${avatarEl(other, 'size-sm')}
        <span class="chat-header-name">${esc(other?.display_name || other?.username)}</span>${badgesFor(other)}
      </a>
      <div class="chat-header-actions" id="chat-header-status">${streakHtml}</div>
    </div>
    <div class="chat-messages" id="chat-messages"><div class="full-loader"><div class="spinner"></div></div></div>
    <div id="typing-indicator" style="padding:8px 16px;font-size:.75rem;color:var(--muted2);min-height:20px;display:none">Someone is typing...</div>
    <div class="chat-composer">
      <label class="chat-img-btn" title="Send photo">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
        <input type="file" id="chat-img-input" accept="image/*" hidden />
      </label>
      <input type="text" id="chat-input" class="chat-input" placeholder="Message…" maxlength="1000" autocomplete="off" />
      <button class="chat-send-btn" id="chat-send-btn">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
      </button>
    </div>`;

  await loadChatMessages(convId);

  qs('#accept-streak-btn')?.addEventListener('click', async () => {
    await sb.from('conversations').update({ streak_accepted: true, streak_active: true, streak_count: 1 }).eq('id', convId);
    renderChat(convId);
  });
  qs('#invite-streak-btn')?.addEventListener('click', async () => {
    await sb.from('conversations').update({ streak_invited_by: currentUser.id, streak_accepted: false }).eq('id', convId);
    renderChat(convId);
  });

  const sendMsg = async (content, type = 'text', mediaUrl = null) => {
    if (!content && !mediaUrl) return;
    const input = qs('#chat-input');
    input.value = '';
    await sb.from('messages').insert({
      conversation_id: convId,
      sender_id: currentUser.id,
      content: content || null,
      media_url: mediaUrl,
      message_type: type
    });
    await sb.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', convId);

    if (conv.streak_active) {
      const today = new Date().toDateString();
      const key = `streak_${convId}`;
      if (localStorage.getItem(key) !== today) {
        localStorage.setItem(key, today);
        await sb.from('conversations').update({ streak_count: (conv.streak_count||0) + 1 }).eq('id', convId);
      }
    }
  };

  qs('#chat-send-btn').addEventListener('click', async () => {
    const text = qs('#chat-input').value.trim();
    if (text) await sendMsg(text);
  });
  
  let typingTimeout;
  qs('#chat-input').addEventListener('input', async () => {
    clearTimeout(typingTimeout);
    await sb.from('conversations').update({ typing_user: currentUser.id }).eq('id', convId);
    typingTimeout = setTimeout(() => {
      sb.from('conversations').update({ typing_user: null }).eq('id', convId);
    }, 1500);
  });
  
  qs('#chat-input').addEventListener('keydown', async e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); const text = qs('#chat-input').value.trim(); if (text) await sendMsg(text); }
  });
  qs('#chat-img-input').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    showToast('Uploading photo…');
    const compressed = await compressImage(file, 480);
    const path = `chat/${currentUser.id}/${Date.now()}.jpg`;
    const { error } = await sb.storage.from('post-images').upload(path, compressed, { contentType: 'image/jpeg', upsert: true });
    if (error) { showToast('Upload failed', 'error'); return; }
    const { data: { publicUrl } } = sb.storage.from('post-images').getPublicUrl(path);
    await sendMsg(null, 'image', publicUrl);
    e.target.value = '';
  });

  if (activeChatSub) { activeChatSub.unsubscribe(); activeChatSub = null; }
  activeChatSub = sb.channel(`chat-${convId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${convId}` },
      () => loadChatMessages(convId))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversations', filter: `id=eq.${convId}` }, (payload) => {
      const indicator = qs('#typing-indicator');
      if (payload.new.typing_user && payload.new.typing_user !== currentUser.id) {
        if (indicator) {
          indicator.style.display = 'block';
          clearTimeout(indicator._timeout);
          indicator._timeout = setTimeout(() => { if (indicator) indicator.style.display = 'none'; }, 2000);
        }
      } else {
        if (indicator) indicator.style.display = 'none';
      }
    })
    .subscribe();
}

async function deleteMessage(messageId, convId) {
  await sb.from('messages').delete().eq('id', messageId);
  await loadChatMessages(convId);
}

async function loadChatMessages(convId) {
  const el = qs('#chat-messages');
  if (!el) return;
  const { data: msgs } = await sb.from('messages')
    .select('id, content, media_url, message_type, sender_id, created_at, read_by')
    .eq('conversation_id', convId)
    .order('created_at', { ascending: true })
    .limit(100);

  if (!msgs?.length) { el.innerHTML = '<p style="text-align:center;padding:24px;color:var(--muted2);font-size:.82rem">Say hello 👋</p>'; return; }

  const unreadMsgs = msgs.filter(m => m.sender_id !== currentUser.id && !m.read_by?.includes(currentUser.id));
  if (unreadMsgs.length > 0) {
    const msgIds = unreadMsgs.map(m => m.id);
    await sb.from('messages').update({
      read_by: unreadMsgs[0].read_by ? [...unreadMsgs[0].read_by, currentUser.id] : [currentUser.id]
    }).in('id', msgIds);
  }

  el.innerHTML = msgs.map(m => {
    const mine = m.sender_id === currentUser.id;

    const iconStyle = 'height: 14px; width: auto; vertical-align: middle; margin-left: 4px; filter: invert(1);';

    const singleTick = `<img src="https://img.icons8.com/ios-glyphs/30/checkmark--v1.png" style="${iconStyle}" alt="sent" />`;
    const doubleTick = `<img src="https://img.icons8.com/ios-glyphs/30/double-tick--v1.png" style="${iconStyle}" alt="read" />`;

    const readStatus = mine && m.read_by?.length > 0 ? doubleTick : mine ? singleTick : '';
    
    const content = m.message_type === 'image'
      ? `<img src="${esc(m.media_url)}" class="chat-img-msg" loading="lazy" />`
      : `<span>${esc(m.content)}</span>`;
      
  const deleteBtn = mine ? `<button class="chat-msg-delete" data-msg-id="${m.id}" data-conv-id="${convId}" title="Delete" style="display:inline-flex;align-items:center;justify-content:center;background:none;border:none;padding:2px"><img src="https://img.icons8.com/material-rounded/96/trash.png" style="width:14px;height:14px;filter:invert(1);opacity:1" alt="delete"></button>` : '';
    
    return `<div class="chat-bubble-wrap ${mine?'mine':'theirs'}">
      <div class="chat-bubble ${mine?'mine':'theirs'}">${content}</div>
      <div class="chat-bubble-meta">
        <span class="bubble-time">${timeAgo(m.created_at)} ${readStatus}</span>
        ${deleteBtn}
      </div>
    </div>`;
}).join('');

  qsa('.chat-msg-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      const msgId = btn.dataset.msgId;
      const cId = btn.dataset.convId;
      await deleteMessage(msgId, cId);
    });
  });

  el.scrollTop = el.scrollHeight;
}

async function renderGroupChat(groupId) {
  if (!requireAuth()) return;
  const view = qs('#view-group');

  const { data: group } = await sb.from('group_chats').select('id, name, created_by').eq('id', groupId).single();
  if (!group) { view.innerHTML = '<p style="padding:24px">Group not found.</p>'; return; }

  const { data: membership } = await sb.from('group_members').select('id').eq('group_id', groupId).eq('user_id', currentUser.id).maybeSingle();
  const isMember = !!membership;

  view.innerHTML = `
    <div class="chat-header">
      <div class="chat-header-user">
        <div class="avatar size-sm" style="background:var(--blue);display:flex;align-items:center;justify-content:center;color:#fff">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        </div>
        <span class="chat-header-name">${esc(group.name)}</span>
      </div>
      <div style="display:flex;gap:6px">
        ${!isMember ? `<button class="btn-sm btn-outline" id="join-group-btn">Join</button>` : ''}
        ${group.created_by === currentUser.id ? `<button class="btn-sm btn-outline" id="group-settings-btn" style="padding:4px 8px" title="Group settings"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></button>` : ''}
      </div>
    </div>
    <div class="chat-messages" id="group-messages"><div class="full-loader"><div class="spinner"></div></div></div>
    ${isMember ? `<div class="chat-composer">
      <input type="text" id="group-input" class="chat-input" placeholder="Message ${esc(group.name)}…" maxlength="1000" autocomplete="off" />
      <button class="chat-send-btn" id="group-send-btn">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
      </button>
    </div>` : `<div style="padding:12px;text-align:center;color:var(--muted2);font-size:.82rem">Join the group to send messages.</div>`}`;

  await loadGroupMessages(groupId);

  qs('#join-group-btn')?.addEventListener('click', async () => {
    const { data: count } = await sb.from('group_members').select('id', { count: 'exact', head: true }).eq('group_id', groupId);
    if ((count||0) >= 200) { showToast('Group is full (200 max)', 'error'); return; }
    await sb.from('group_members').insert({ group_id: groupId, user_id: currentUser.id });
    renderGroupChat(groupId);
  });

  const sendGroup = async () => {
    const text = qs('#group-input')?.value.trim();
    if (!text) return;
    qs('#group-input').value = '';
    await sb.from('group_messages').insert({ group_id: groupId, sender_id: currentUser.id, content: text });
  };
  qs('#group-send-btn')?.addEventListener('click', sendGroup);
  qs('#group-input')?.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendGroup(); } });

  if (activeChatSub) { activeChatSub.unsubscribe(); activeChatSub = null; }
  activeChatSub = sb.channel(`group-${groupId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'group_messages', filter: `group_id=eq.${groupId}` },
      () => loadGroupMessages(groupId))
    .subscribe();
}

async function loadGroupMessages(groupId) {
  const el = qs('#group-messages');
  if (!el) return;
  const { data: msgs } = await sb.from('group_messages')
    .select('id, content, sender_id, created_at, profiles(username, display_name, avatar_url)')
    .eq('group_id', groupId)
    .order('created_at', { ascending: true })
    .limit(100);

  if (!msgs?.length) { el.innerHTML = '<p style="text-align:center;padding:24px;color:var(--muted2);font-size:.82rem">No messages yet. Start the conversation!</p>'; return; }

  el.innerHTML = msgs.map(m => {
    const mine = m.sender_id === currentUser.id;
    const name = mine ? '' : `<span class="bubble-sender">${esc(m.profiles?.display_name || m.profiles?.username)}</span>`;
    return `<div class="chat-bubble-wrap ${mine?'mine':'theirs'}">
      ${name}
      <div class="chat-bubble ${mine?'mine':'theirs'}">${esc(m.content)}</div>
      <span class="bubble-time">${timeAgo(m.created_at)}</span>
    </div>`;
  }).join('');
  el.scrollTop = el.scrollHeight;
}

async function showCreateGroupModal() {
  const modal = document.createElement('div');
  modal.id = 'create-group-modal';
  modal.innerHTML = `
    <div class="custom-modal-scrim"></div>
    <div class="custom-modal-box">
      <h3 class="custom-modal-title">Create group</h3>
      <div class="field-group" style="margin-bottom:12px">
        <label class="field-label">Group name</label>
        <input class="field-input" id="new-group-name" type="text" placeholder="My group…" maxlength="60" />
      </div>
      <div id="create-group-err" class="form-msg error"></div>
      <div class="custom-modal-actions">
        <button class="btn-sm btn-outline" id="cgm-cancel">Cancel</button>
        <button class="btn-sm btn-primary" id="cgm-create">Create</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  requestAnimationFrame(() => modal.classList.add('open'));

  const close = () => { modal.classList.remove('open'); setTimeout(() => modal.remove(), 200); };
  qs('#cgm-cancel', modal).addEventListener('click', close);
  qs('.custom-modal-scrim', modal).addEventListener('click', close);
  qs('#new-group-name', modal).focus();

  qs('#cgm-create', modal).addEventListener('click', async () => {
    const name = qs('#new-group-name', modal).value.trim();
    if (!name) { qs('#create-group-err', modal).textContent = 'Enter a group name.'; return; }
    const { data: group, error } = await sb.from('group_chats').insert({ name, created_by: currentUser.id }).select('id').single();
    if (error) { qs('#create-group-err', modal).textContent = error.message; return; }
    await sb.from('group_members').insert({ group_id: group.id, user_id: currentUser.id, role: 'admin' });
    close();
    location.hash = `#/group/${group.id}`;
  });
}

async function searchGroups(q, el) {
  let req = sb.from('group_chats').select('id, name, created_by, created_at, group_members(count)');
  if (q) req = req.ilike('name', `%${q}%`);
  else req = req.order('created_at', { ascending: false });
  req = req.limit(30);

  const { data: groups } = await req;
  if (!groups?.length) { el.innerHTML = emptyState('No groups found.'); return; }

  const myMemberships = new Set();
  if (currentUser) {
    const { data: mine } = await sb.from('group_members').select('group_id').eq('user_id', currentUser.id);
    (mine||[]).forEach(m => myMemberships.add(m.group_id));
  }

  el.innerHTML = groups.map(g => {
    const memberCount = g.group_members?.[0]?.count || 0;
    const isMember = myMemberships.has(g.id);
    return `
      <div class="group-row" data-group-id="${g.id}" style="cursor:pointer">
        <div class="avatar size-md" style="background:var(--blue);display:flex;align-items:center;justify-content:center;color:#fff;flex-shrink:0">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        </div>
        <div class="user-row-info">
          <div class="user-row-name">${esc(g.name)}</div>
          <div class="user-row-bio">${memberCount} member${memberCount!==1?'s':''}</div>
        </div>
        ${currentUser ? `<button class="btn-follow ${isMember?'following':''}" data-gid="${g.id}">${isMember?'Joined':'Join'}</button>` : ''}
      </div>`;
  }).join('');

  qsa('.group-row', el).forEach(r => r.addEventListener('click', e => {
    if (e.target.closest('.btn-follow')) return;
    location.hash = `#/group/${r.dataset.groupId}`;
  }));
  qsa('.btn-follow[data-gid]', el).forEach(b => b.addEventListener('click', async e => {
    e.stopPropagation();
    if (!requireAuth()) return;
    const gid = b.dataset.gid;
    if (b.classList.contains('following')) {
      await sb.from('group_members').delete().eq('group_id', gid).eq('user_id', currentUser.id);
      b.classList.remove('following'); b.textContent = 'Join';
    } else {
      const { data: cnt } = await sb.from('group_members').select('id', { count: 'exact', head: true }).eq('group_id', gid);
      if ((cnt||0) >= 200) { showToast('Group is full (200 max)', 'error'); return; }
      await sb.from('group_members').insert({ group_id: gid, user_id: currentUser.id });
      b.classList.add('following'); b.textContent = 'Joined';
    }
  }));
}

async function searchCommunities(q, el) {
  let req = sb.from('communities')
    .select('id, name, slug, description, avatar_url, avatar_color, is_private, is_verified, created_at, community_members(count)');
  if (q) req = req.ilike('name', `%${q}%`).eq('is_private', false);
  else req = req.eq('is_private', false).order('created_at', { ascending: false });
  req = req.limit(30);

  const { data: communities } = await req;
  if (!communities?.length) { el.innerHTML = emptyState('No communities found.'); return; }

  const mySet = new Set();
  if (currentUser) {
    const { data: mine } = await sb.from('community_members').select('community_id').eq('user_id', currentUser.id);
    (mine||[]).forEach(m => mySet.add(m.community_id));
  }

  el.innerHTML = communities.map(c => {
    const count = c.community_members?.[0]?.count || 0;
    const isMember = mySet.has(c.id);
    return `
      <div class="community-row" data-slug="${esc(c.slug)}" style="cursor:pointer">
        <div class="community-row-avatar" style="background:${c.avatar_color || strToColor(c.name)}">
          ${c.avatar_url ? `<img src="${esc(c.avatar_url)}" alt="" />` : esc(c.name[0].toUpperCase())}
        </div>
        <div class="user-row-info">
          <div class="user-row-name">${esc(c.name)}${c.is_verified ? ' <span class="comm-verified-badge"><img src="https://img.icons8.com/color/96/instagram-verification-badge.png" style="height: 1em; vertical-align: middle;"></span>' : ''}</div>
          <div class="user-row-bio">${count} member${count!==1?'s':''} ${c.description ? '· ' + esc(c.description.slice(0,50)) : ''}</div>
        </div>
        ${currentUser ? `<button class="btn-follow ${isMember?'following':''}" data-cid="${c.id}">${isMember?'Joined':'Join'}</button>` : ''}
      </div>`;
  }).join('');

  qsa('.community-row', el).forEach(r => r.addEventListener('click', e => {
    if (e.target.closest('.btn-follow')) return;
    location.hash = `#/c/${r.dataset.slug}`;
  }));

  qsa('.btn-follow[data-cid]', el).forEach(b => b.addEventListener('click', async e => {
    e.stopPropagation();
    if (!requireAuth()) return;
    const cid = b.dataset.cid;
    if (b.classList.contains('following')) {
      await sb.from('community_members').delete().eq('community_id', cid).eq('user_id', currentUser.id);
      b.classList.remove('following'); b.textContent = 'Join';
    } else {
      await sb.from('community_members').insert({ community_id: cid, user_id: currentUser.id, role: 'member' });
      b.classList.add('following'); b.textContent = 'Joined';
    }
  }));
}

async function renderCommunities() {
  const view = qs('#view-communities');
  view.innerHTML = `
    <div class="view-header">
      <h1 class="view-title">Communities</h1>
      <button class="btn-sm btn-primary" id="create-community-btn">+ Create</button>
    </div>
    <div id="my-communities-list"><div class="full-loader"><div class="spinner"></div></div></div>`;

  qs('#create-community-btn').addEventListener('click', () => showCreateCommunityModal());

  const { data: memberships } = await sb.from('community_members')
    .select('role, communities(id, name, slug, description, avatar_url, avatar_color, is_private, community_members(count))')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false });

  const el = qs('#my-communities-list');
  if (!memberships?.length) {
    el.innerHTML = `${emptyState('You haven\'t joined any communities yet.')}
      <div style="text-align:center;margin-top:8px">
        <a href="#/explore" style="color:var(--blue);font-size:.88rem">Explore communities</a>
      </div>`;
    return;
  }

  el.innerHTML = memberships.map(m => {
    const c = m.communities;
    if (!c) return '';
    const count = c.community_members?.[0]?.count || 0;
    const roleLabel = m.role === 'owner' ? '<span class="comm-role-badge owner">Owner</span>'
      : m.role === 'admin' ? '<span class="comm-role-badge admin">Admin</span>' : '';
    return `
      <div class="community-card" onclick="location.hash='#/c/${esc(c.slug)}'">
        <div class="community-card-avatar" style="background:${c.avatar_color || strToColor(c.name)}">
          ${c.avatar_url ? `<img src="${esc(c.avatar_url)}" alt="" />` : esc(c.name[0].toUpperCase())}
        </div>
        <div class="community-card-info">
          <div class="community-card-name">${esc(c.name)} ${c.is_private ? '<span class="comm-private-badge">Private</span>' : ''} ${roleLabel}</div>
          <div class="community-card-meta">${count} member${count!==1?'s':''} ${c.description ? '· ' + esc(c.description.slice(0,60)) : ''}</div>
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      </div>`;
  }).join('');
}

async function renderCommunity(slug, activeTab = 'posts') {
  const view = qs('#view-community');
  view.innerHTML = '<div class="full-loader"><div class="spinner"></div></div>';
  if (!slug) { view.innerHTML = emptyState('Community not found.'); return; }

  const { data: community, error } = await sb.from('communities')
    .select('*, community_members(count)')
    .eq('slug', slug)
    .single();

  if (error || !community) { view.innerHTML = emptyState('Community not found.'); return; }

  let myRole = null;
  if (currentUser) {
    const { data: mem } = await sb.from('community_members')
      .select('role').eq('community_id', community.id).eq('user_id', currentUser.id).maybeSingle();
    myRole = mem?.role || null;
  }

  const { data: boostData } = await sb.from('community_boost_funds')
    .select('total_points, level').eq('community_id', community.id).maybeSingle();
  const boostTotal = boostData?.total_points || 0;
  const boostLevel = BOOST_LEVELS.reduce((cur, lvl) => boostTotal >= lvl.threshold ? lvl : cur, BOOST_LEVELS[0]);
  const nextBoostLevel = BOOST_LEVELS[boostLevel.level + 1] || null;
  const boostBarPct = nextBoostLevel
    ? Math.min(100, Math.round((boostTotal - boostLevel.threshold) / (nextBoostLevel.threshold - boostLevel.threshold) * 100))
    : 100;

  const isMember = !!myRole;
  const isOwner = myRole === 'owner';
  const isAdmin = myRole === 'admin' || isOwner;
  const memberCount = community.community_members?.[0]?.count || 0;

  const canPost = isOwner || isAdmin;

  view.innerHTML = `
    <div class="community-scroll-area">
      ${!isMember ? `<div class="comm-guest-banner">You're in preview mode. Join this community to become a member!</div>` : ''}
      <div class="community-hero">
        <div class="community-cover" id="comm-cover-el" style="${community.cover_url ? `background-image:url('${esc(community.cover_url)}');background-size:cover;background-position:center` : `background:${community.cover_color || strToColor(community.name)}`}">
          ${isOwner ? `<button class="comm-edit-btn" id="comm-cover-edit-btn" title="Edit banner" style="position:absolute;bottom:10px;right:12px">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
          </button>` : ''}
        </div>
        <div class="community-hero-body">
          <div class="community-avatar-wrap">
            <div class="community-avatar" id="comm-avatar-el" style="background:${community.avatar_color || strToColor(community.name)}">
              ${community.avatar_url ? `<img src="${esc(community.avatar_url)}" alt="" id="comm-avatar-img" />` : `<span id="comm-avatar-letter">${esc(community.name[0].toUpperCase())}</span>`}
            </div>
            ${isOwner ? `<label class="comm-edit-btn comm-avatar-edit-btn" title="Change avatar image">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
              <input type="file" id="community-avatar-upload" accept="image/jpeg,image/png,image/webp" hidden />
            </label>` : ''}
          </div>
          <div class="community-hero-info">
            <div class="community-hero-name">
              ${esc(community.name)}
              ${community.is_private ? '<span class="comm-private-badge">Private</span>' : ''}
              ${community.is_verified ? '<span class="comm-verified-badge" title="Verified community"><img src="https://img.icons8.com/color/96/instagram-verification-badge.png" style="height: 1em; vertical-align: middle;"></span>' : ''}
              ${boostLevel.level > 0 ? `<span class="comm-boost-badge" style="color:${boostLevel.color}" title="Boost ${boostLevel.label}">⚡ ${boostLevel.label}</span>` : ''}
            </div>
            <div class="community-hero-slug">c/${esc(community.slug)}</div>
            ${community.description ? `<div class="community-hero-desc">${esc(community.description)}</div>` : ''}
            <div class="community-hero-stats">
              <span id="comm-member-count">${memberCount}</span> member${memberCount!==1?'s':''}
            </div>
            ${(nextBoostLevel || boostLevel.level > 0) ? `
            <div class="comm-boost-bar-wrap">
              <div class="comm-boost-bar-labels">
                <span style="color:${boostLevel.level > 0 ? boostLevel.color : 'var(--muted2)'}">${boostLevel.level > 0 ? '⚡ ' + boostLevel.label : 'No boost'}</span>
                ${nextBoostLevel ? `<span style="color:${nextBoostLevel.color}">${nextBoostLevel.label}</span>` : '<span style="color:#f59e0b">Max level! ✨</span>'}
              </div>
              <div class="comm-boost-bar-track">
                <div class="comm-boost-bar-fill" style="width:${boostBarPct}%;background:linear-gradient(to right,#6b7280,#4ade80,#60a5fa,#a78bfa,#f59e0b)"></div>
              </div>
              <div class="comm-boost-bar-total">${boostTotal.toLocaleString()} ${nextBoostLevel ? '/ ' + nextBoostLevel.threshold.toLocaleString() + ' pts' : 'pts · Max level reached!'}</div>
            </div>` : ''}
          </div>
          <div class="community-hero-actions">
            ${currentUser ? (isMember
              ? `${isOwner ? `<button class="btn-sm btn-outline" id="comm-settings-btn">Settings</button>` : ''}
                 <button class="btn-sm btn-outline comm-boost-btn" id="comm-boost-btn" title="Boost community">⚡ Boost</button>
                 <button class="btn-sm btn-outline" id="comm-leave-btn">Leave</button>`
              : `<button class="btn-sm comm-join-btn" id="comm-join-btn">Join</button>`
            ) : ''}
            ${currentProfile?.username === 'artur' ? `<button class="icon-btn" id="comm-artur-btn" title="Moderator options" style="margin-left:4px"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="19" r="1" fill="currentColor"/></svg></button>` : ''}
          </div>
        </div>
      </div>
      <div class="community-tabs">
        <a href="#/c/${esc(community.slug)}/posts" class="community-tab ${activeTab === 'posts' ? 'active' : ''}">Posts</a>
        <a href="#/c/${esc(community.slug)}/members" class="community-tab ${activeTab === 'members' ? 'active' : ''}">Members</a>
      </div>
      <div id="community-content">
        <div class="post-list" id="community-posts"><div class="full-loader"><div class="spinner"></div></div></div>
      </div>
    </div>
    ${canPost ? `
    <div id="community-compose-bar">
      ${avatarEl(currentProfile,'size-sm')}
      <button id="open-comm-compose">What's on your mind?</button>
    </div>` : ''}`;

  if (activeTab === 'members') await loadCommunityMembers(community.id, isAdmin);
  else await loadCommunityPosts(community.id, community.slug);

  qsa('.community-tab', view).forEach(t => t.addEventListener('click', e => e.stopPropagation()));

  qs('#comm-join-btn')?.addEventListener('click', async () => {
    await sb.from('community_members').insert({ community_id: community.id, user_id: currentUser.id, role: 'member' });
    showToast('Joined!');
    renderCommunity(slug, activeTab);
  });

  qs('#comm-leave-btn')?.addEventListener('click', () => {
    showConfirmModal({
      title: 'Leave community',
      message: `Leave <strong>${esc(community.name)}</strong>?`,
      confirmText: 'Leave',
      onConfirm: async () => {
        await sb.from('community_members').delete().eq('community_id', community.id).eq('user_id', currentUser.id);
        showToast('Left community.');
        renderCommunity(slug, activeTab);
      }
    });
  });

  qs('#comm-settings-btn')?.addEventListener('click', () => showCommunitySettings(community, slug));
  qs('#open-comm-compose')?.addEventListener('click', () => showCommunityComposeModal(community));

  qs('#comm-boost-btn')?.addEventListener('click', () => showBoostModal(community, boostTotal, boostLevel));

  qs('#comm-artur-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const existing = qs('#artur-comm-menu');
    if (existing) { existing.remove(); return; }
    const menu = document.createElement('div');
    menu.id = 'artur-comm-menu';
    menu.style.cssText = 'position:fixed;z-index:9999;background:var(--surface2);border:1px solid var(--border2);border-radius:10px;padding:4px;min-width:180px;box-shadow:0 8px 24px rgba(0,0,0,.4)';
    const isVerified = community.is_verified;
    menu.innerHTML = `<button class="dctx-item" id="artur-verify-btn">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
      ${isVerified ? 'Remove verification' : 'Verify community'}
    </button>`;
    document.body.appendChild(menu);
    const btn = qs('#comm-artur-btn');
    const rect = btn.getBoundingClientRect();
    menu.style.top = `${rect.bottom + 6}px`;
    menu.style.right = `${window.innerWidth - rect.right}px`;
    const close = () => { menu.remove(); document.removeEventListener('click', close); };
    setTimeout(() => document.addEventListener('click', close), 50);
    qs('#artur-verify-btn', menu).addEventListener('click', async () => {
      close();
      const newVal = !isVerified;
      const { error } = await sb.from('communities').update({ is_verified: newVal }).eq('id', community.id);
      if (error) { showToast('Error updating community', 'error'); return; }
      showToast(newVal ? 'Community verified! ✓' : 'Verification removed.');
      renderCommunity(slug, activeTab);
    });
  });

  qs('#comm-cover-edit-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    showColorImagePopup({
      anchor: qs('#comm-cover-edit-btn'),
      currentColor: community.cover_color || strToColor(community.name),
      onColor: async (color) => {
        await sb.from('communities').update({ cover_color: color, cover_url: null }).eq('id', community.id);
        community.cover_color = color; community.cover_url = null;
        const coverEl = qs('#comm-cover-el');
        if (coverEl) { coverEl.style.backgroundImage = ''; coverEl.style.background = color; }
        if (!community.avatar_url) {
          await sb.from('communities').update({ avatar_color: color }).eq('id', community.id);
          community.avatar_color = color;
          const avatarEl = qs('#comm-avatar-el');
          if (avatarEl) avatarEl.style.background = color;
        }
      },
      onImage: async (file) => {
        showToast('Uploading…');
        const url = await uploadFile(file, 'avatars', 'community-covers');
        await sb.from('communities').update({ cover_url: url }).eq('id', community.id);
        community.cover_url = url;
        const coverEl = qs('#comm-cover-el');
        if (coverEl) { coverEl.style.backgroundImage = `url('${url}')`; coverEl.style.backgroundSize = 'cover'; coverEl.style.backgroundPosition = 'center'; }
        showToast('Banner updated!');
      }
    });
  });

  qs('#community-avatar-upload')?.addEventListener('change', async function() {
    const file = this.files[0]; if (!file) return;
    showToast('Uploading…');
    const url = await uploadFile(file, 'avatars', 'communities');
    await sb.from('communities').update({ avatar_url: url }).eq('id', community.id);
    community.avatar_url = url;
    const el = qs('#comm-avatar-el');
    if (el) el.innerHTML = `<img src="${url}" alt="" style="width:100%;height:100%;object-fit:cover" />`;
    showToast('Avatar updated!');
  });
}

async function loadCommunityPosts(communityId, communitySlug = '') {
  const el = qs('#community-posts');
  if (!el) return;
  el.innerHTML = '<div class="full-loader"><div class="spinner"></div></div>';

  const { data, error } = await sb.from('posts')
    .select('id, content, post_type, media_url, media_type, created_at, user_id, view_count, quote_of, profiles(id, username, avatar_url, display_name, verified), reactions(id, user_id, type), reposts(id, user_id), bookmarks(id, user_id)')
    .eq('community_id', communityId)
    .is('reply_to', null)
    .order('created_at', { ascending: false })
    .limit(40);

  if (error) { el.innerHTML = emptyState('Error loading posts.'); return; }
  if (!data?.length) { el.innerHTML = emptyState('No posts yet. Be the first!'); return; }

  const postIds = data.map(p => p.id);
  let discCounts = {};
  const { data: dc } = await sb.from('post_discussions')
    .select('post_id')
    .in('post_id', postIds);
  if (dc) dc.forEach(r => { discCounts[r.post_id] = (discCounts[r.post_id] || 0) + 1; });
  data.forEach(p => { p.discussion_count = discCounts[p.id] || 0; });

  const quoteIds = data.filter(p => p.quote_of).map(p => p.quote_of);
  let quotedPosts = {};
  if (quoteIds.length) {
    const { data: qd } = await sb.from('posts').select('id, content, post_type, profiles(username, avatar_url)').in('id', quoteIds);
    if (qd) qd.forEach(q => quotedPosts[q.id] = q);
  }

  el.innerHTML = data.map(p => postCardHTML(p, quotedPosts[p.quote_of], { communityMode: true, communitySlug })).join('');
  bindPostActions(el);
}

async function loadCommunityMembers(communityId, isAdmin) {
  const el = qs('#community-content');
  el.innerHTML = '<div class="full-loader"><div class="spinner"></div></div>';

  const { data } = await sb.from('community_members')
    .select('role, user_id, created_at, profiles(id, username, avatar_url, display_name, verified)')
    .eq('community_id', communityId)
    .order('created_at', { ascending: true });

  if (!data?.length) { el.innerHTML = emptyState('No members yet.'); return; }

  const roleOrder = { owner: 0, admin: 1, member: 2 };
  data.sort((a, b) => {
    const ro = (roleOrder[a.role] ?? 2) - (roleOrder[b.role] ?? 2);
    if (ro !== 0) return ro;
    return new Date(a.created_at) - new Date(b.created_at);
  });

  el.innerHTML = `<div class="post-list">` + data.map(m => {
    const p = m.profiles;
    if (!p) return '';
    const roleLabel = m.role === 'owner'
      ? '<span class="comm-role-badge owner">Owner</span>'
      : m.role === 'admin' ? '<span class="comm-role-badge admin">Admin</span>' : '';
    const canManage = isAdmin && m.role !== 'owner' && p.id !== currentUser?.id;
    return `
      <div class="user-row" style="cursor:pointer" onclick="location.hash='#/profile/${esc(p.username)}'">
        ${avatarEl(p, 'size-md')}
        <div class="user-row-info">
          <div class="user-row-name">@${esc(p.username)} ${badgesFor(p)} ${roleLabel}</div>
          ${p.display_name ? `<div class="user-row-bio">${esc(p.display_name)}</div>` : ''}
        </div>
        ${canManage ? `<button class="btn-sm btn-outline comm-manage-btn" data-uid="${p.id}" data-role="${m.role}" onclick="event.stopPropagation();openMemberManageMenu(this,'${communityId}','${p.username}')">Manage</button>` : ''}
      </div>`;
  }).join('') + '</div>';
}

async function openMemberManageMenu(btn, communityId, username) {
  const existing = qs('#member-manage-menu');
  if (existing) { existing.remove(); return; }

  const { data: mem } = await sb.from('community_members')
    .select('role, user_id').eq('community_id', communityId).eq('user_id', btn.dataset.uid).single();
  if (!mem) return;

  const targetRole = mem.role;
  const menu = document.createElement('div');
  menu.id = 'member-manage-menu';
  menu.style.cssText = `position:absolute;right:16px;background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:4px;z-index:200;min-width:160px;box-shadow:0 8px 24px rgba(0,0,0,.3)`;

  const actions = [];
  if (targetRole !== 'admin') {
    actions.push({ label: 'Make admin', fn: async () => {
      const { error } = await sb.from('community_members').update({ role: 'admin' }).eq('community_id', communityId).eq('user_id', mem.user_id);
      if (error) { showToast('Error: ' + error.message); return; }
      showToast(`@${username} is now an admin.`); menu.remove(); loadCommunityMembers(communityId, true);
    }});
  } else {
    actions.push({ label: 'Remove admin', fn: async () => {
      const { error } = await sb.from('community_members').update({ role: 'member' }).eq('community_id', communityId).eq('user_id', mem.user_id);
      if (error) { showToast('Error: ' + error.message); return; }
      showToast(`@${username} is now a member.`); menu.remove(); loadCommunityMembers(communityId, true);
    }});
  }
  actions.push({ label: 'Remove from community', danger: true, fn: () => {
    showConfirmModal({
      title: 'Remove member',
      message: `Remove <strong>@${esc(username)}</strong> from this community?`,
      confirmText: 'Remove',
      confirmClass: 'btn-danger',
      danger: true,
      onConfirm: async () => {
        const { error } = await sb.from('community_members').delete().eq('community_id', communityId).eq('user_id', mem.user_id);
        if (error) { showToast('Error: ' + error.message); return; }
        showToast(`@${username} removed.`); menu.remove(); loadCommunityMembers(communityId, true);
      }
    });
  }});

  menu.innerHTML = actions.map((a, i) => `<button class="admin-drop-item ${a.danger?'danger':''}" data-idx="${i}">${esc(a.label)}</button>`).join('');
  document.body.appendChild(menu);
  const rect = btn.getBoundingClientRect();
  menu.style.top = `${rect.bottom + window.scrollY + 4}px`;
  menu.style.right = `${window.innerWidth - rect.right}px`;
  menu.style.position = 'fixed';
  menu.style.top = `${rect.bottom + 4}px`;

  qsa('[data-idx]', menu).forEach(b => b.addEventListener('click', () => actions[+b.dataset.idx].fn()));
  setTimeout(() => document.addEventListener('click', () => menu.remove(), { once: true }), 50);
}

function showCommunitySettings(community, slug) {
  const modal = document.createElement('div');
  modal.id = 'community-settings-modal';
  modal.innerHTML = `
    <div class="custom-modal-scrim"></div>
    <div class="custom-modal-box" style="max-width:440px">
      <h3 class="custom-modal-title">Community Settings</h3>
      <div class="field-group">
        <label class="field-label">Name</label>
        <input class="field-input" id="cs-name" type="text" value="${esc(community.name)}" maxlength="60" />
      </div>
      <div class="field-group">
        <label class="field-label">Description</label>
        <textarea class="field-input" id="cs-desc" rows="2" maxlength="200" placeholder="Describe your community…">${esc(community.description||'')}</textarea>
      </div>
      <div class="settings-row" style="padding:8px 0">
        <div class="settings-row-info">
          <div class="settings-row-label">Private community</div>
          <div class="settings-row-desc">Won't appear in search</div>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" id="cs-private" ${community.is_private ? 'checked' : ''} />
          <span class="toggle-track"></span>
        </label>
      </div>
      <div id="cs-err" class="form-msg error"></div>
      <div class="custom-modal-actions">
        <button class="btn-sm btn-outline btn-danger" id="cs-delete">Delete community</button>
        <div style="display:flex;gap:8px">
          <button class="btn-sm btn-outline" id="cs-cancel">Cancel</button>
          <button class="btn-sm btn-primary" id="cs-save">Save</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(modal);
  requestAnimationFrame(() => modal.classList.add('open'));

  const close = () => { modal.classList.remove('open'); setTimeout(() => modal.remove(), 200); };
  qs('#cs-cancel', modal).addEventListener('click', close);
  qs('.custom-modal-scrim', modal).addEventListener('click', close);

  qs('#cs-save', modal).addEventListener('click', async () => {
    const name = qs('#cs-name', modal).value.trim();
    const desc = qs('#cs-desc', modal).value.trim();
    const isPrivate = qs('#cs-private', modal).checked;
    const err = qs('#cs-err', modal);
    if (!name) { err.textContent = 'Name is required.'; return; }
    const { error } = await sb.from('communities').update({ name, description: desc||null, is_private: isPrivate }).eq('id', community.id);
    if (error) { err.textContent = error.message; return; }
    showToast('Settings saved!');
    close();
    renderCommunity(slug, activeTab);
  });

  qs('#cs-delete', modal).addEventListener('click', () => {
    close();
    showConfirmModal({
      title: 'Delete community',
      message: `Permanently delete <strong>${esc(community.name)}</strong>? All posts will be removed.`,
      confirmText: 'Delete',
      confirmClass: 'btn-danger',
      danger: true,
      requireType: 'DELETE',
      onConfirm: async () => {
        await sb.from('communities').delete().eq('id', community.id);
        showToast('Community deleted.');
        location.hash = '#/communities';
      }
    });
  });
}

function showCommunityComposeModal(community) {
  const modal = document.createElement('div');
  modal.id = 'community-compose-modal';
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-scrim" id="cc-scrim"></div>
    <div class="modal-sheet compose-sheet">
      <div class="modal-handle"></div>
      <div class="modal-head">
        <h2 class="modal-title">Post in ${esc(community.name)}</h2>
        <button class="icon-btn" id="cc-close">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="compose-types" id="cc-types">
        <button class="ctype-btn active" data-type="text">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="17" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="17" y1="18" x2="3" y2="18"/></svg>
          Text
        </button>
        <button class="ctype-btn" data-type="image">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
          Image
        </button>
        <button class="ctype-btn" data-type="video">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
          Video
        </button>
        <button class="ctype-btn" data-type="markdown">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>
          Markdown
        </button>
      </div>
      <form id="cc-form" novalidate>
        <div class="compose-body">
          ${avatarEl(currentProfile, 'size-md')}
          <div class="compose-right">
            <textarea id="cc-text" placeholder="What's on your mind?" maxlength="2000" rows="4"></textarea>
            <div class="compose-counter"><span id="cc-count">0</span>/2000</div>
            <div id="cc-image-area" class="compose-media-area hidden">
              <label class="media-upload-zone" id="cc-image-zone">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                <span>Click or drag to add image</span>
                <input type="file" id="cc-img-input" accept="image/jpeg,image/png,image/gif,image/webp" hidden />
              </label>
              <div id="cc-img-preview" class="compose-media-preview hidden">
                <img id="cc-img-el" src="" alt="" />
                <button type="button" class="media-remove-btn" id="cc-img-remove">×</button>
              </div>
            </div>
            <div id="cc-video-area" class="compose-media-area hidden">
              <label class="media-upload-zone" id="cc-video-zone">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
                <span>Click to upload video (max 50MB)</span>
                <input type="file" id="cc-video-input" accept="video/mp4,video/webm,video/mov" hidden />
              </label>
              <div id="cc-video-preview" class="compose-media-preview hidden">
                <video id="cc-video-el" controls></video>
                <button type="button" class="media-remove-btn" id="cc-video-remove">×</button>
              </div>
            </div>
            <div id="cc-md-toolbar" class="md-toolbar hidden">
              <button type="button" class="md-tool" data-md="**bold**"><b>B</b></button>
              <button type="button" class="md-tool" data-md="*italic*"><i>I</i></button>
              <button type="button" class="md-tool" data-md="\`code\`"><code>&lt;/&gt;</code></button>
              <button type="button" class="md-tool" data-md="# ">H</button>
              <button type="button" class="md-tool" data-md="- ">—</button>
              <button type="button" class="md-tool" data-md="> ">"</button>
              <div class="md-sep"></div>
              <button type="button" class="md-preview-toggle" id="cc-md-preview-toggle">Preview</button>
            </div>
            <div id="cc-md-preview" class="md-preview hidden"></div>
          </div>
        </div>
        <div class="compose-toolbar">
          <div id="cc-error" class="compose-err"></div>
          <button type="submit" class="btn-post" id="cc-submit">Post</button>
        </div>
      </form>
    </div>`;
  document.body.appendChild(modal);
  requestAnimationFrame(() => modal.classList.add('open'));

  let currentType = 'text';
  let imageFile = null;
  let videoFile = null;

  const close = () => { modal.classList.remove('open'); setTimeout(() => modal.remove(), 200); };
  qs('#cc-scrim', modal).addEventListener('click', close);
  qs('#cc-close', modal).addEventListener('click', close);
  qs('#cc-text', modal).addEventListener('input', function() { qs('#cc-count', modal).textContent = this.value.length; });

  qsa('.ctype-btn', modal).forEach(btn => btn.addEventListener('click', () => {
    currentType = btn.dataset.type;
    qsa('.ctype-btn', modal).forEach(b => b.classList.toggle('active', b === btn));
    qs('#cc-image-area', modal).classList.toggle('hidden', currentType !== 'image');
    qs('#cc-video-area', modal).classList.toggle('hidden', currentType !== 'video');
    qs('#cc-md-toolbar', modal).classList.toggle('hidden', currentType !== 'markdown');
    qs('#cc-md-preview', modal).classList.add('hidden');
    qs('#cc-text', modal).classList.remove('hidden');
    qs('#cc-md-preview-toggle', modal).textContent = 'Preview';
    qs('#cc-text', modal).placeholder = currentType === 'markdown' ? 'Write markdown…' : 'What\'s on your mind?';
  }));

  qs('#cc-img-input', modal).addEventListener('change', function() {
    const file = this.files[0]; if (!file) return;
    imageFile = file;
    const url = URL.createObjectURL(file);
    qs('#cc-img-el', modal).src = url;
    qs('#cc-img-preview', modal).classList.remove('hidden');
    qs('#cc-image-zone', modal).classList.add('hidden');
  });
  qs('#cc-img-remove', modal).addEventListener('click', () => {
    imageFile = null;
    qs('#cc-img-el', modal).src = '';
    qs('#cc-img-preview', modal).classList.add('hidden');
    qs('#cc-image-zone', modal).classList.remove('hidden');
  });

  qs('#cc-video-input', modal).addEventListener('change', function() {
    const file = this.files[0]; if (!file) return;
    if (file.size > 50 * 1024 * 1024) { showToast('Video must be under 50MB', 'error'); return; }
    videoFile = file;
    const url = URL.createObjectURL(file);
    qs('#cc-video-el', modal).src = url;
    qs('#cc-video-preview', modal).classList.remove('hidden');
    qs('#cc-video-zone', modal).classList.add('hidden');
  });
  qs('#cc-video-remove', modal).addEventListener('click', () => {
    videoFile = null;
    qs('#cc-video-el', modal).src = '';
    qs('#cc-video-preview', modal).classList.add('hidden');
    qs('#cc-video-zone', modal).classList.remove('hidden');
  });

  qsa('.md-tool', modal).forEach(btn => btn.addEventListener('click', () => {
    const ta = qs('#cc-text', modal);
    const ins = btn.dataset.md;
    const start = ta.selectionStart, end = ta.selectionEnd;
    ta.value = ta.value.slice(0, start) + ins + ta.value.slice(end);
    ta.focus();
    ta.selectionStart = ta.selectionEnd = start + ins.length;
    qs('#cc-count', modal).textContent = ta.value.length;
  }));

  qs('#cc-md-preview-toggle', modal).addEventListener('click', () => {
    const prev = qs('#cc-md-preview', modal);
    const ta = qs('#cc-text', modal);
    const showing = !prev.classList.contains('hidden');
    prev.classList.toggle('hidden', showing);
    ta.classList.toggle('hidden', !showing);
    if (!showing) prev.innerHTML = marked.parse(ta.value || '_Nothing to preview_');
    qs('#cc-md-preview-toggle', modal).textContent = showing ? 'Preview' : 'Edit';
  });

  qs('#cc-form', modal).addEventListener('submit', async e => {
    e.preventDefault();
    const content = qs('#cc-text', modal).value.trim();
    const errEl = qs('#cc-error', modal);
    const btn = qs('#cc-submit', modal);
    errEl.textContent = '';
    if (currentType === 'image' && !imageFile && !content) { errEl.textContent = 'Add an image or write something.'; return; }
    if (currentType === 'video' && !videoFile) { errEl.textContent = 'Select a video first.'; return; }
    if (currentType !== 'image' && currentType !== 'video' && !content) { errEl.textContent = 'Write something first.'; return; }
    setBtn(btn, true, 'Posting…');
    let media_url = null;
    if (currentType === 'image' && imageFile) {
      media_url = await uploadFile(imageFile, 'post-media', 'community-images');
      if (!media_url) { errEl.textContent = 'Image upload failed.'; setBtn(btn, false, 'Post'); return; }
    }
    if (currentType === 'video' && videoFile) {
      media_url = await uploadFile(videoFile, 'post-media', 'community-videos');
      if (!media_url) { errEl.textContent = 'Video upload failed.'; setBtn(btn, false, 'Post'); return; }
    }
    const { error } = await sb.from('posts').insert({
      user_id: currentUser.id,
      content: content || '',
      post_type: currentType,
      media_url,
      community_id: community.id
    });
    setBtn(btn, false, 'Post');
    if (error) { errEl.textContent = error.message; return; }
    close();
    showToast('Posted!');
    loadCommunityPosts(community.id, community.slug);
  });
}

async function showCreateCommunityModal() {
  const { data: owned } = await sb.from('communities').select('id').eq('created_by', currentUser.id);
  const maxCommunities = currentProfile?.verified ? 10 : 3;
  if ((owned||[]).length >= maxCommunities) {
    showToast(`You can only create up to ${maxCommunities} communities.`, 'error');
    return;
  }

  const modal = document.createElement('div');
  modal.id = 'create-community-modal';
  modal.innerHTML = `
    <div class="custom-modal-scrim"></div>
    <div class="custom-modal-box" style="max-width:440px">
      <h3 class="custom-modal-title">Create community</h3>
      <div class="field-group">
        <label class="field-label">Name</label>
        <input class="field-input" id="nc-name" type="text" placeholder="My community" maxlength="60" />
      </div>
      <div class="field-group">
        <label class="field-label">Slug (URL)</label>
        <div class="input-prefix-wrap">
          <span class="input-prefix" style="font-size:.8rem">c/</span>
          <input class="field-input prefixed" id="nc-slug" type="text" placeholder="my-community" maxlength="40" autocorrect="off" autocapitalize="none" />
        </div>
        <span class="field-hint" id="nc-slug-hint"></span>
      </div>
      <div class="field-group">
        <label class="field-label">Description <span style="color:var(--muted2);font-weight:400">(optional)</span></label>
        <textarea class="field-input" id="nc-desc" rows="2" maxlength="200" placeholder="What is this community about?"></textarea>
      </div>
      <div class="settings-row" style="padding:8px 0">
        <div class="settings-row-info">
          <div class="settings-row-label">Private</div>
          <div class="settings-row-desc">Won't appear in search</div>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" id="nc-private" />
          <span class="toggle-track"></span>
        </label>
      </div>
      <div id="nc-err" class="form-msg error"></div>
      <div class="custom-modal-actions">
        <button class="btn-sm btn-outline" id="nc-cancel">Cancel</button>
        <button class="btn-sm btn-primary" id="nc-create">Create</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  requestAnimationFrame(() => modal.classList.add('open'));

  const close = () => { modal.classList.remove('open'); setTimeout(() => modal.remove(), 200); };
  qs('#nc-cancel', modal).addEventListener('click', close);
  qs('.custom-modal-scrim', modal).addEventListener('click', close);

  qs('#nc-name', modal).addEventListener('input', function() {
    const slugInput = qs('#nc-slug', modal);
    if (!slugInput._touched) {
      slugInput.value = this.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
    }
  });

  let slugDebounce;
  qs('#nc-slug', modal).addEventListener('input', function() {
    this._touched = true;
    this.value = this.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
    const hint = qs('#nc-slug-hint', modal);
    clearTimeout(slugDebounce);
    if (!this.value) { hint.textContent = ''; return; }
    hint.textContent = 'Checking…'; hint.style.color = 'var(--muted2)';
    slugDebounce = setTimeout(async () => {
      const { data } = await sb.from('communities').select('id').eq('slug', this.value).maybeSingle();
      hint.textContent = data ? 'Already taken' : 'Available ✓';
      hint.style.color = data ? 'var(--red)' : 'var(--green)';
    }, 400);
  });

  qs('#nc-create', modal).addEventListener('click', async () => {
    const name = qs('#nc-name', modal).value.trim();
    const slug = qs('#nc-slug', modal).value.trim();
    const desc = qs('#nc-desc', modal).value.trim();
    const isPrivate = qs('#nc-private', modal).checked;
    const err = qs('#nc-err', modal);
    err.textContent = '';
    if (!name) { err.textContent = 'Name is required.'; return; }
    if (!slug || slug.length < 2) { err.textContent = 'Slug must be at least 2 characters.'; return; }

    const { data: existing } = await sb.from('communities').select('id').eq('slug', slug).maybeSingle();
    if (existing) { err.textContent = 'This slug is already taken.'; return; }

    const { data: community, error } = await sb.from('communities').insert({
      name, slug, description: desc||null, is_private: isPrivate, created_by: currentUser.id
    }).select('id').single();

    if (error) { err.textContent = error.message; return; }
    await sb.from('community_members').insert({ community_id: community.id, user_id: currentUser.id, role: 'owner' });
    close();
    showToast('Community created!');
    location.hash = `#/c/${slug}`;
  });
}
function showColorImagePopup({ anchor, currentColor, onColor, onImage }) {
  qs('#color-image-popup')?.remove();

  const PRESETS = [
    '#e63946','#ff4d6d','#ff6b35','#ff9f1c',
    '#ffca3a','#8ac926','#2dc653','#06d6a0',
    '#0096c7','#4361ee','#7209b7','#b5179e',
    '#f72585','#3a86ff','#00b4d8','#80ffdb',
  ];

  const popup = document.createElement('div');
  popup.id = 'color-image-popup';
  popup.innerHTML = `
    <div class="cip-grid">
      ${PRESETS.map(c => `<button class="cip-swatch ${c === currentColor ? 'active' : ''}" data-color="${c}" style="background:${c}" title="${c}"></button>`).join('')}
    </div>
    <div class="cip-divider"></div>
    <div class="cip-actions">
      <label class="cip-action-btn" title="Upload image">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
        <input type="file" accept="image/jpeg,image/png,image/webp" hidden id="cip-file-input" />
      </label>
      <label class="cip-action-btn" title="Custom color">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>
        <input type="color" id="cip-color-input" value="${currentColor.startsWith('#') ? currentColor : '#1a1a2e'}" hidden />
      </label>
    </div>`;

  document.body.appendChild(popup);

  const rect = anchor.getBoundingClientRect();
  popup.style.position = 'fixed';
  popup.style.zIndex = '9999';
  const pw = 196;
  let left = rect.right - pw;
  if (left < 8) left = 8;
  popup.style.left = `${left}px`;
  popup.style.top = `${rect.bottom + 6}px`;

  const close = () => { popup.remove(); document.removeEventListener('click', outsideClick); };
  const outsideClick = (e) => { if (!popup.contains(e.target) && e.target !== anchor) close(); };
  setTimeout(() => document.addEventListener('click', outsideClick), 50);

  qsa('.cip-swatch', popup).forEach(sw => sw.addEventListener('click', () => {
    onColor(sw.dataset.color);
    close();
  }));

  qs('#cip-color-input', popup).addEventListener('input', function() {
    onColor(this.value);
  });
  qs('#cip-color-input', popup).addEventListener('change', function() {
    onColor(this.value);
    close();
  });
  qs('label[title="Custom color"]', popup).addEventListener('click', (e) => {
    e.stopPropagation();
    qs('#cip-color-input', popup).click();
  });

  qs('#cip-file-input', popup).addEventListener('change', function() {
    const file = this.files[0];
    if (!file) return;
    onImage(file);
    close();
  });
  qs('label[title="Upload image"]', popup).addEventListener('click', e => e.stopPropagation());
}

async function renderDiscussion(communitySlug, postId) {
  const view = qs('#view-discussion');
  view.innerHTML = '<div class="full-loader"><div class="spinner"></div></div>';

  const [{ data: post }, { data: community }] = await Promise.all([
    sb.from('posts')
      .select('id, content, post_type, media_url, created_at, user_id, view_count, profiles(id, username, avatar_url, display_name, verified), reactions(id, user_id, type), reposts(id, user_id), bookmarks(id, user_id)')
      .eq('id', postId).single(),
    sb.from('communities').select('id, name, slug, avatar_url, avatar_color, cover_color').eq('slug', communitySlug).single()
  ]);

  if (!post || !community) { view.innerHTML = emptyState('Post not found.'); return; }

  const { data: msgs } = await sb.from('post_discussions')
    .select('id, content, created_at, user_id, reply_to_id, profiles(id, username, avatar_url, display_name, verified, equipped_badge), reply:reply_to_id(id, content, user_id, profiles(username, display_name))')
    .eq('post_id', postId)
    .order('created_at', { ascending: true });

  const myRole = currentUser ? (await sb.from('community_members').select('role').eq('community_id', community.id).eq('user_id', currentUser.id).single()).data?.role : null;
  const isMember = !!myRole;

  const isAdmin = myRole === 'admin' || myRole === 'owner';

  view.innerHTML = `
    <div class="disc-header">
      <a href="#/c/${esc(communitySlug)}/posts" class="disc-back">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
      </a>
      <div class="disc-header-info">
        <div class="disc-header-avatar" style="background:${community.avatar_color || strToColor(community.name)}">
          ${community.avatar_url ? `<img src="${esc(community.avatar_url)}" alt="" />` : esc(community.name[0].toUpperCase())}
        </div>
        <span class="disc-header-name">${esc(community.name)}</span>
      </div>
    </div>
    <div class="disc-scroll-area">
      <div class="disc-post-preview">
        ${postCardHTML(post, null, { communityMode: true, communitySlug })}
      </div>
      <div class="disc-divider">
        <span>Discussion · ${(msgs||[]).length} message${(msgs||[]).length !== 1 ? 's' : ''}</span>
      </div>
      <div class="disc-messages" id="disc-messages">
        ${(msgs||[]).length ? (msgs||[]).map(m => discMsgHTML(m, isAdmin)).join('') : `<div class="disc-empty">No messages yet. Start the discussion!</div>`}
      </div>
    </div>
    ${isMember ? `
    <div class="disc-reply-bar" id="disc-reply-bar" style="display:none">
      <div class="disc-reply-preview">
        <div class="disc-reply-name" id="disc-reply-name"></div>
        <div class="disc-reply-text" id="disc-reply-text"></div>
      </div>
      <button class="disc-reply-cancel" id="disc-reply-cancel">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div class="disc-composer" id="disc-composer">
      ${avatarEl(currentProfile, 'size-sm')}
      <input class="disc-input" id="disc-input" placeholder="Write a message…" autocomplete="off" maxlength="1000" />
      <button class="disc-send-btn" id="disc-send-btn">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
      </button>
    </div>` : ''}`;

  bindPostActions(qs('.disc-post-preview', view));

  const scrollEl = qs('.disc-scroll-area', view);
  scrollEl.scrollTop = scrollEl.scrollHeight;

  const msgsEl = qs('#disc-messages', view);
  let replyTo = null;

  const showDiscCtxMenu = (e, msgEl) => {
    e.preventDefault();
    qs('#disc-ctx-menu')?.remove();

    const msgId = msgEl.dataset.msgId;
    const msgUserId = msgEl.dataset.userId;
    const isMine = currentUser?.id === msgUserId;
    const canDelete = isMine || isAdmin;
    const canEdit = isMine;

    if (!canDelete && !canEdit) return;

    const menu = document.createElement('div');
    menu.id = 'disc-ctx-menu';
    menu.innerHTML = `
      <button class="dctx-item" data-action="reply">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
        Reply
      </button>
      ${canEdit ? `<button class="dctx-item" data-action="edit">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
        Edit
      </button>` : ''}
      ${canDelete ? `<button class="dctx-item danger" data-action="delete">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        Delete
      </button>` : ''}`;

    document.body.appendChild(menu);

    const x = e.clientX ?? (e.touches?.[0]?.clientX ?? 0);
    const y = e.clientY ?? (e.touches?.[0]?.clientY ?? 0);
    const mw = 160, mh = menu.offsetHeight || 120;
    menu.style.left = `${Math.min(x, window.innerWidth - mw - 8)}px`;
    menu.style.top  = `${Math.min(y, window.innerHeight - mh - 8)}px`;

    const close = () => { menu.remove(); document.removeEventListener('click', close); document.removeEventListener('touchstart', close); };
    setTimeout(() => { document.addEventListener('click', close); document.addEventListener('touchstart', close); }, 50);

    menu.addEventListener('click', async ev => {
      const action = ev.target.closest('[data-action]')?.dataset.action;
      if (!action) return;
      close();

      if (action === 'reply') {
        replyTo = {
          id: msgId,
          username: msgEl.dataset.username,
          displayName: msgEl.querySelector('.disc-msg-name')?.textContent?.trim() || msgEl.dataset.username,
          text: msgEl.querySelector('.disc-bubble')?.textContent?.trim() || ''
        };
        const bar = qs('#disc-reply-bar', view);
        if (bar) {
          qs('#disc-reply-name', view).textContent = replyTo.displayName;
          qs('#disc-reply-text', view).textContent = replyTo.text.slice(0, 80) + (replyTo.text.length > 80 ? '…' : '');
          bar.style.display = 'flex';
        }
        qs('#disc-input', view)?.focus();
      }

      if (action === 'edit') {
        const bubble = msgEl.querySelector('.disc-bubble');
        if (!bubble) return;
        const oldText = bubble.textContent.trim();
        const inp = document.createElement('input');
        inp.className = 'disc-input disc-edit-input';
        inp.value = oldText;
        bubble.style.display = 'none';
        bubble.after(inp);
        inp.focus();
        inp.select();
        let committed = false;
        const commit = async () => {
          if (committed) return;
          committed = true;
          const newText = inp.value.trim();
          inp.remove();
          bubble.style.display = '';
          if (!newText || newText === oldText) return;
          const { error } = await sb.from('post_discussions').update({ content: newText }).eq('id', msgId);
          if (error) { showToast('Error editing'); return; }
          bubble.textContent = newText;
        };
        inp.addEventListener('blur', commit);
        inp.addEventListener('keydown', ke => {
          if (ke.key === 'Enter') { ke.preventDefault(); inp.blur(); }
          if (ke.key === 'Escape') { committed = true; inp.remove(); bubble.style.display = ''; }
        });
      }

      if (action === 'delete') {
        const { error } = await sb.from('post_discussions').delete().eq('id', msgId);
        if (error) { showToast('Error deleting message'); return; }
        msgEl.remove();
      }
    });
  };

  let touchTimer;
  msgsEl.addEventListener('contextmenu', e => {
    const msgEl = e.target.closest('.disc-msg');
    if (!msgEl) return;
    showDiscCtxMenu(e, msgEl);
  });
  msgsEl.addEventListener('touchstart', e => {
    const msgEl = e.target.closest('.disc-msg');
    if (!msgEl) return;
    touchTimer = setTimeout(() => showDiscCtxMenu(e, msgEl), 500);
  }, { passive: true });
  msgsEl.addEventListener('touchend', () => clearTimeout(touchTimer));
  msgsEl.addEventListener('touchmove', () => clearTimeout(touchTimer));

  const sendBtn = qs('#disc-send-btn', view);
  const input = qs('#disc-input', view);

  qs('#disc-reply-cancel', view)?.addEventListener('click', () => {
    replyTo = null;
    const bar = qs('#disc-reply-bar', view);
    if (bar) bar.style.display = 'none';
    input?.focus();
  });

  if (sendBtn && input) {
    const send = async () => {
      const text = input.value.trim(); if (!text) return;

      const now = Date.now();
      if (_discLastSend[postId] && now - _discLastSend[postId] < SLOWMODE_MS) {
        const remaining = Math.ceil((SLOWMODE_MS - (now - _discLastSend[postId])) / 1000);
        showToast(`Slow down! Wait ${remaining}s`, 'error');
        return;
      }
      _discLastSend[postId] = now;

      input.value = '';
      sendBtn.disabled = true;
      const payload = { post_id: postId, user_id: currentUser.id, content: text };
      if (replyTo) payload.reply_to_id = replyTo.id;
      const replySnapshot = replyTo;
      replyTo = null;
      const bar = qs('#disc-reply-bar', view);
      if (bar) bar.style.display = 'none';
      const { data: newMsg, error } = await sb.from('post_discussions')
        .insert(payload)
        .select('id, content, created_at, user_id, reply_to_id, profiles(id, username, avatar_url, display_name, verified, equipped_badge)')
        .single();
      sendBtn.disabled = false;
      if (error) { showToast('Error sending message'); return; }
      if (replySnapshot) newMsg._replySnapshot = replySnapshot;
      const msgsEl = qs('#disc-messages', view);
      const empty = msgsEl.querySelector('.disc-empty');
      if (empty) empty.remove();
      msgsEl.insertAdjacentHTML('beforeend', discMsgHTML(newMsg, isAdmin));
      scrollEl.scrollTop = scrollEl.scrollHeight;

      if (text.length >= MIN_MSG_CHARS) awardDiscussionPoints(community.id);
    };
    sendBtn.addEventListener('click', send);
    input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
  }
}

function discMsgHTML(m, canModerate = false) {
  const p = m.profiles;
  const isMine = currentUser?.id === m.user_id;
  const reply = m.reply || m._replySnapshot;
  let replyHtml = '';
  if (reply) {
    const rName = reply.displayName || reply.profiles?.display_name || reply.profiles?.username || reply.username || '';
    const rText = (reply.text || reply.content || '').slice(0, 60);
    replyHtml = `<div class="disc-reply-quote">
      <span class="disc-reply-quote-name">${esc(rName)}</span>
      <span class="disc-reply-quote-text">${esc(rText)}${(reply.text || reply.content || '').length > 60 ? '…' : ''}</span>
    </div>`;
  }
  return `
    <div class="disc-msg ${isMine ? 'mine' : ''}" data-msg-id="${m.id}" data-user-id="${m.user_id}" data-username="${esc(p.username)}">
      ${!isMine ? `<a href="#/profile/${esc(p.username)}">${avatarEl(p, 'size-sm')}</a>` : ''}
      <div class="disc-msg-body">
        ${!isMine ? `<div class="disc-msg-name">${esc(p.display_name || p.username)}${badgesFor(p)}</div>` : ''}
        <div class="disc-bubble">${replyHtml}${esc(m.content)}</div>
        <div class="disc-msg-time">${timeAgo(m.created_at)}</div>
      </div>
    </div>`;
}
async function awardDiscussionPoints(communityId) {
  if (!currentUser) return;
  const { data: comm } = await sb.from('communities').select('is_verified').eq('id', communityId).maybeSingle();
  if (!comm?.is_verified) return;

  const today = new Date().toISOString().split('T')[0];
  let { data: pts } = await sb.from('user_points').select('*').eq('user_id', currentUser.id).maybeSingle();

  if (!pts) {
    await sb.from('user_points').insert({ user_id: currentUser.id, balance: POINTS_PER_MSG, daily_earned: POINTS_PER_MSG, last_earned_date: today });
    showToast(`+${POINTS_PER_MSG} pts ⭐`);
    return;
  }

  const isNewDay = pts.last_earned_date !== today;
  const daily = isNewDay ? 0 : (pts.daily_earned || 0);
  if (daily >= DAILY_POINTS_LIMIT) return;

  const newBalance = (pts.balance || 0) + POINTS_PER_MSG;
  const newDaily = daily + POINTS_PER_MSG;
  await sb.from('user_points').update({ balance: newBalance, daily_earned: newDaily, last_earned_date: today }).eq('user_id', currentUser.id);
  showToast(`+${POINTS_PER_MSG} pts ⭐`);
}

async function renderMarketplace() {
  const view = qs('#view-marketplace');
  view.innerHTML = '<div class="full-loader"><div class="spinner"></div></div>';
  if (!currentUser) { view.innerHTML = emptyState('Sign in to use the marketplace.'); return; }

  const today = new Date().toISOString().split('T')[0];
  const [{ data: pts }, { data: owned }] = await Promise.all([
    sb.from('user_points').select('balance, daily_earned, last_earned_date').eq('user_id', currentUser.id).maybeSingle(),
    sb.from('user_badges').select('badge_id').eq('user_id', currentUser.id)
  ]);

  const balance = pts?.balance || 0;
  const dailyEarned = (pts?.last_earned_date === today ? pts?.daily_earned : 0) || 0;
  const ownedSet = new Set((owned || []).map(b => b.badge_id));
  const equipped = currentProfile?.equipped_badge || null;

  view.innerHTML = `
    <div class="view-header"><h1 class="view-title">Marketplace</h1></div>
    <div class="market-balance-card">
      <div class="market-balance-label">Your balance</div>
      <div class="market-balance-amount">${balance.toLocaleString()} <span class="market-pts-unit">pts</span></div>
      <div class="market-balance-sub">Today: ${dailyEarned} / ${DAILY_POINTS_LIMIT} pts earned</div>
      <div class="market-balance-hint">Earn ${POINTS_PER_MSG} pts per message (${MIN_MSG_CHARS}+ chars) in verified communities ✓</div>
    </div>
    <div class="market-section-title">Badge Shop</div>
    <div class="market-grid" id="market-grid">
      ${BADGE_CATALOG.map(badge => {
        const isOwned = ownedSet.has(badge.id);
        const isEquipped = equipped === badge.id;
        const canAfford = balance >= badge.price;
        return `<div class="market-badge-card ${isOwned ? 'owned' : ''}">
          <div class="market-badge-symbol ${badge.color === 'blue' ? 'badge-blue' : 'badge-white'}">${badge.symbol}</div>
          <div class="market-badge-name">${esc(badge.label)}</div>
          ${isOwned
            ? `<button class="btn-sm ${isEquipped ? 'btn-primary' : 'btn-outline'} market-action-btn" data-action="${isEquipped ? 'unequip' : 'equip'}" data-id="${badge.id}">${isEquipped ? 'Equipped ✓' : 'Equip'}</button>`
            : `<div class="market-badge-price">${badge.price.toLocaleString()} pts</div>
               <button class="btn-sm btn-primary market-action-btn" data-action="buy" data-id="${badge.id}" ${!canAfford ? 'disabled' : ''}>${canAfford ? 'Buy' : 'Need more'}</button>`
          }
        </div>`;
      }).join('')}
    </div>`;

  qsa('.market-action-btn', view).forEach(btn => {
    btn.addEventListener('click', async () => {
      const action = btn.dataset.action;
      const badgeId = btn.dataset.id;
      const badge = BADGE_CATALOG.find(b => b.id === badgeId);
      if (!badge) return;

      if (action === 'buy') {
        const { data: freshPts } = await sb.from('user_points').select('balance').eq('user_id', currentUser.id).maybeSingle();
        const freshBalance = freshPts?.balance || 0;
        if (freshBalance < badge.price) { showToast('Not enough points!', 'error'); return; }
        btn.disabled = true;
        const { error } = await sb.from('user_badges').insert({ user_id: currentUser.id, badge_id: badgeId });
        if (error) { showToast('Error purchasing', 'error'); btn.disabled = false; return; }
        await sb.from('user_points').update({ balance: freshBalance - badge.price }).eq('user_id', currentUser.id);
        showToast(`${badge.label} badge purchased!`);
        renderMarketplace();
      } else if (action === 'equip') {
        await sb.from('profiles').update({ equipped_badge: badgeId }).eq('id', currentUser.id);
        if (currentProfile) currentProfile.equipped_badge = badgeId;
        showToast(`${badge.label} equipped!`);
        renderMarketplace();
      } else if (action === 'unequip') {
        await sb.from('profiles').update({ equipped_badge: null }).eq('id', currentUser.id);
        if (currentProfile) currentProfile.equipped_badge = null;
        showToast('Badge removed.');
        renderMarketplace();
      }
    });
  });
}

async function showBoostModal(community, currentTotal, currentLevel) {
  const nextLevel = BOOST_LEVELS[currentLevel.level + 1] || null;
  const barPct = nextLevel
    ? Math.min(100, Math.round((currentTotal - currentLevel.threshold) / (nextLevel.threshold - currentLevel.threshold) * 100))
    : 100;

  const modal = document.createElement('div');
  modal.id = 'boost-modal';
  modal.innerHTML = `
    <div class="custom-modal-scrim"></div>
    <div class="custom-modal-box" style="max-width:400px">
      <h3 class="custom-modal-title">⚡ Boost Community</h3>
      <div class="boost-levelup-msg" style="color:${currentLevel.level > 0 ? currentLevel.color : 'var(--muted2)'}">
        ${currentLevel.level > 0 ? `${currentLevel.label} active` : 'No boost yet'}
        ${nextLevel ? ` · Next: <span style="color:${nextLevel.color}">${nextLevel.label}</span>` : ' · <span style="color:#f59e0b">Max level reached! ✨</span>'}
      </div>
      <div class="boost-progress-labels">
        <span>${currentTotal.toLocaleString()} pts</span>
        <span>${nextLevel ? nextLevel.threshold.toLocaleString() + ' pts' : 'Max'}</span>
      </div>
      <div class="boost-progress-track">
        <div class="boost-progress-fill boost-progress-animated" style="width:${barPct}%;background:linear-gradient(to right,#6b7280,#4ade80,#60a5fa,#a78bfa,#f59e0b)"></div>
      </div>
      <div class="boost-progress-sub">${nextLevel ? `${(nextLevel.threshold - currentTotal).toLocaleString()} pts to ${nextLevel.label}` : 'Community fully boosted!'}</div>
      <div class="boost-fund-info" style="margin-top:12px">
        Community fund: <strong>${currentTotal.toLocaleString()} pts</strong>
        ${currentLevel.level > 0 ? `· <span style="color:${currentLevel.color}">${currentLevel.label} active</span>` : ''}
      </div>
      <div class="field-group" style="margin-top:16px">
        <label class="field-label">Donate points</label>
        <input class="field-input" type="number" id="boost-amount" min="1" placeholder="e.g. 50" />
      </div>
      <div id="boost-err" class="form-msg error"></div>
      <div class="custom-modal-actions">
        <button class="btn-sm btn-outline" id="boost-cancel">Cancel</button>
        <button class="btn-sm btn-primary" id="boost-confirm">⚡ Boost</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  requestAnimationFrame(() => modal.classList.add('open'));

  const close = () => { modal.classList.remove('open'); setTimeout(() => modal.remove(), 200); };
  qs('.custom-modal-scrim', modal).addEventListener('click', close);
  qs('#boost-cancel', modal).addEventListener('click', close);

  qs('#boost-confirm', modal).addEventListener('click', async () => {
    const amount = parseInt(qs('#boost-amount', modal).value, 10);
    const errEl = qs('#boost-err', modal);
    errEl.textContent = '';
    if (!amount || amount < 1) { errEl.textContent = 'Enter a valid amount.'; return; }

    const { data: pts } = await sb.from('user_points').select('balance').eq('user_id', currentUser.id).maybeSingle();
    const balance = pts?.balance || 0;
    if (balance < amount) { errEl.textContent = `Not enough points. You have ${balance} pts.`; return; }

    const newBalance = balance - amount;
    const { data: existing } = await sb.from('community_boost_funds').select('total_points').eq('community_id', community.id).maybeSingle();
    const newTotal = (existing?.total_points || 0) + amount;
    const newLevelObj = BOOST_LEVELS.reduce((cur, lvl) => newTotal >= lvl.threshold ? lvl : cur, BOOST_LEVELS[0]);

    await Promise.all([
      sb.from('user_points').update({ balance: newBalance }).eq('user_id', currentUser.id),
      sb.from('community_boost_funds').upsert({ community_id: community.id, total_points: newTotal, level: newLevelObj.level })
    ]);

    close();
    const lvlMsg = newLevelObj.level > currentLevel.level ? ` Community reached ${newLevelObj.label}! 🎉` : '';
    showToast(`Donated ${amount} pts to ${community.name}!${lvlMsg}`);
    renderCommunity(community.slug);
  });
}