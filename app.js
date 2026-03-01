const SUPABASE_URL = 'https://cdvxlzjroubzzfxzrhmp.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_FcDPxHEqaBJ1jLi_rB8o0A_upxm2XZv';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let currentProfile = null;
let realtimeSub = null;
let pickerTarget = null;
let replyTargetPostId = null;
let quoteTargetPost = null;

const qs  = (s, ctx = document) => ctx.querySelector(s);
const qsa = (s, ctx = document) => Array.from(ctx.querySelectorAll(s));

function esc(str) {
  if (str == null) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;');
}

function linkify(text) {
  return esc(text)
    .replace(/#(\w+)/g, '<a href="#/explore?tag=$1">#$1</a>')
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

async function init() {
  setupAuth();
  setupCompose();
  setupReplyModal();
  setupQuoteModal();
  setupReactionPicker();
  document.addEventListener('click', closePickerOnOutside);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeAllModals(); closeReactionPicker(); }
  });
  window.addEventListener('hashchange', () => { if (currentUser) route(); });

  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    currentUser = session.user;
    await ensureProfile();
    enterApp();
  } else {
    showAuthPage();
  }

  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN') {
      currentUser = session.user;
      await ensureProfile();
      enterApp();
    } else if (event === 'SIGNED_OUT') {
      currentUser = null; currentProfile = null;
      if (realtimeSub) { realtimeSub.unsubscribe(); realtimeSub = null; }
      showAuthPage();
    }
  });
}

async function ensureProfile() {
  let { data } = await sb.from('profiles').select('*').eq('id', currentUser.id).single();
  if (!data) {
    const base = (currentUser.user_metadata?.username || currentUser.email.split('@')[0])
      .toLowerCase().replace(/[^a-z0-9_]/g,'').slice(0, 20) || 'user';
    let uname = base;
    let tries = 0;
    while (true) {
      const { data: ex } = await sb.from('profiles').select('id').eq('username', uname).maybeSingle();
      if (!ex) break;
      tries++;
      uname = base + tries;
    }
    await sb.from('profiles').upsert({ id: currentUser.id, username: uname }, { onConflict: 'id' });
    ({ data } = await sb.from('profiles').select('*').eq('id', currentUser.id).single());
  }
  currentProfile = data;
}

function showAuthPage() {
  qs('#page-auth').classList.remove('hidden');
  qs('#page-app').classList.add('hidden');
}

function enterApp() {
  qs('#page-auth').classList.add('hidden');
  qs('#page-app').classList.remove('hidden');
  setComposeAvatar();
  if (!location.hash || location.hash === '#' || location.hash === '#/') location.hash = '#/feed';
  route();
  loadNotifCount();
  loadRightPanel();
  subscribeRealtime();
}

function route() {
  const hash = location.hash.replace(/^#\/?/, '') || 'feed';
  const parts = hash.split('/').filter(Boolean);
  const page = parts[0] || 'feed';
  const sub  = parts[1] || '';

  const navRoutes = ['feed','explore','notifications','bookmarks','settings'];
  const isTopLevel = navRoutes.includes(page) || (page === 'profile' && !sub);
  qs('#back-btn').classList.toggle('hidden', isTopLevel);

  qsa('[data-route]').forEach(el => {
    const r = el.dataset.route;
    el.classList.toggle('active',
      r === page ||
      (r === 'profile' && page === 'profile' && !sub)
    );
  });

  qsa('.route-view').forEach(v => v.classList.add('hidden'));

  if (page === 'feed') { qs('#view-feed').classList.remove('hidden'); renderFeed(); }
  else if (page === 'explore') { qs('#view-explore').classList.remove('hidden'); renderExplore(sub); }
  else if (page === 'notifications') { qs('#view-notifications').classList.remove('hidden'); renderNotifications(); }
  else if (page === 'bookmarks') { qs('#view-bookmarks').classList.remove('hidden'); renderBookmarks(); }
  else if (page === 'profile') {
    qs('#view-profile').classList.remove('hidden');
    renderProfile(sub || currentProfile?.username);
  }
  else if (page === 'post') { qs('#view-post').classList.remove('hidden'); renderPostDetail(sub); }
  else if (page === 'settings') { qs('#view-settings').classList.remove('hidden'); renderSettings(); }
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
    const val = this.value.toLowerCase().replace(/[^a-z0-9_]/g, '');
    this.value = val;
    const hint = qs('#username-hint');
    clearTimeout(usernameDebounce);
    if (val.length < 3) { hint.textContent = val.length ? 'Too short (min 3 chars)' : ''; hint.style.color = 'var(--red)'; return; }
    hint.textContent = 'Checking…'; hint.style.color = 'var(--muted2)';
    usernameDebounce = setTimeout(async () => {
      const { data } = await sb.from('profiles').select('id').eq('username', val).maybeSingle();
      if (data) { hint.textContent = 'Already taken'; hint.style.color = 'var(--red)'; }
      else { hint.textContent = 'Available ✓'; hint.style.color = 'var(--green)'; }
    }, 450);
  });

  qs('#login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const email = qs('#login-email').value.trim();
    const pass  = qs('#login-password').value;
    const errEl = qs('#login-error');
    const btn   = qs('#login-submit');
    errEl.textContent = ''; errEl.className = 'form-msg';
    setBtn(btn, true, 'Sign in');
    const { error } = await sb.auth.signInWithPassword({ email, password: pass });
    setBtn(btn, false, 'Sign in');
    if (error) { errEl.textContent = error.message; errEl.className = 'form-msg error'; }
  });

  qs('#register-form').addEventListener('submit', async e => {
    e.preventDefault();
    const username = qs('#reg-username').value.trim();
    const email    = qs('#reg-email').value.trim();
    const pass     = qs('#reg-password').value;
    const errEl    = qs('#reg-error');
    const btn      = qs('#reg-submit');
    errEl.textContent = ''; errEl.className = 'form-msg';

    if (!username || username.length < 3) { errEl.textContent = 'Username must be 3+ characters.'; errEl.className = 'form-msg error'; return; }
    if (pass.length < 8) { errEl.textContent = 'Password must be 8+ characters.'; errEl.className = 'form-msg error'; return; }

    const { data: ex } = await sb.from('profiles').select('id').eq('username', username).maybeSingle();
    if (ex) { errEl.textContent = 'Username already taken.'; errEl.className = 'form-msg error'; return; }

    setBtn(btn, true, 'Create account');
    const { error } = await sb.auth.signUp({ email, password: pass, options: { data: { username } } });
    setBtn(btn, false, 'Create account');
    if (error) { errEl.textContent = error.message; errEl.className = 'form-msg error'; }
    else { errEl.textContent = 'Check your email to confirm, then sign in!'; errEl.className = 'form-msg success'; }
  });

  qs('#logout-btn').addEventListener('click', () => sb.auth.signOut());
  qs('#back-btn').addEventListener('click', () => history.back());
  qs('#notif-btn').addEventListener('click', () => { location.hash = '#/notifications'; });
}

async function renderFeed() {
  const view = qs('#view-feed');
  if (view.dataset.loaded === 'true') return;

  view.innerHTML = `
    <div class="view-header">
      <h1 class="view-title">Feed</h1>
      <div class="feed-tabs">
        <button class="feed-tab active" data-tab="for-you">For you</button>
        <button class="feed-tab" data-tab="following">Following</button>
      </div>
    </div>
    <div class="post-list" id="feed-posts"><div class="full-loader"><div class="spinner"></div></div></div>`;

  qsa('.feed-tab', view).forEach(t => {
    t.addEventListener('click', () => {
      qsa('.feed-tab', view).forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      loadFeedPosts(t.dataset.tab);
    });
  });

  await loadFeedPosts('for-you');
  view.dataset.loaded = 'true';
}

async function loadFeedPosts(tab) {
  const list = qs('#feed-posts');
  if (!list) return;
  list.innerHTML = '<div class="full-loader"><div class="spinner"></div></div>';

  let query = sb.from('posts')
    .select('id, content, post_type, media_url, media_type, created_at, user_id, view_count, quote_of, profiles(id, username, avatar_url), reactions(id, user_id, type), reposts(id, user_id), bookmarks(id, user_id)')
    .is('reply_to', null)
    .order('created_at', { ascending: false })
    .limit(40);

  if (tab === 'following') {
    const { data: follows } = await sb.from('follows').select('following_id').eq('follower_id', currentUser.id);
    const ids = (follows || []).map(f => f.following_id);
    if (!ids.length) { list.innerHTML = emptyState('Follow people to see their posts here.'); return; }
    query = query.in('user_id', ids);
  }

  const { data, error } = await query;
  if (error) { list.innerHTML = emptyState('Error loading feed.'); return; }
  if (!data.length) { list.innerHTML = emptyState(tab === 'following' ? 'Nothing here yet.' : 'Be the first to Flow!'); return; }

  const quoteIds = data.filter(p => p.quote_of).map(p => p.quote_of);
  let quotedPosts = {};
  if (quoteIds.length) {
    const { data: qd } = await sb.from('posts').select('id, content, post_type, profiles(username, avatar_url)').in('id', quoteIds);
    if (qd) qd.forEach(q => quotedPosts[q.id] = q);
  }

  list.innerHTML = data.map(p => postCardHTML(p, quotedPosts[p.quote_of])).join('');
  bindPostActions(list);
}

function postCardHTML(post, quotedPost = null) {
  const p = post.profiles;
  const likeCount  = (post.reactions || []).filter(r => r.type === 'like').length;
  const reacts     = (post.reactions || []).reduce((acc, r) => { acc[r.type] = (acc[r.type]||0)+1; return acc; }, {});
  const userLiked  = (post.reactions || []).some(r => r.type === 'like' && r.user_id === currentUser.id);
  const repostCount = (post.reposts || []).length;
  const userReposted = (post.reposts || []).some(r => r.user_id === currentUser.id);
  const userBookmarked = (post.bookmarks || []).some(b => b.user_id === currentUser.id);
  const isOwn = post.user_id === currentUser.id;

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

  const topReacts = Object.entries(reacts).filter(([,v])=>v>0).slice(0,3).map(([t])=>({like:'❤️',fire:'🔥',clap:'👏',laugh:'😂',wow:'😮'})[t]||'').join('');

  return `
    <article class="post-card" data-post-id="${post.id}">
      <div class="post-head">
        <a href="#/profile/${esc(p.username)}">${avatarEl(p, 'size-md')}</a>
        <div class="post-meta">
          <span>
            <a href="#/profile/${esc(p.username)}" class="post-username">@${esc(p.username)}</a>
            <span class="post-dot">·</span>
            <span class="post-time">${timeAgo(post.created_at)}</span>
            ${typeBadge}
          </span>
        </div>
        ${isOwn ? `<button class="delete-btn" data-post-id="${post.id}" title="Delete post">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        </button>` : ''}
      </div>
      ${contentHtml}
      ${mediaHtml}
      ${quoteHtml}
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
        <button class="action-btn quote-btn" data-post-id="${post.id}" title="Quote post" style="margin-left:auto">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/></svg>
        </button>
      </div>
    </article>`;
}

function bindPostActions(ctx) {
  qsa('.like-btn', ctx).forEach(btn => {
    btn.addEventListener('contextmenu', e => { e.preventDefault(); showReactionPicker(btn, btn.dataset.postId); });
    btn.addEventListener('click', () => toggleLike(btn.dataset.postId, btn));
  });
  qsa('.repost-btn', ctx).forEach(btn => btn.addEventListener('click', () => toggleRepost(btn.dataset.postId, btn)));
  qsa('.bookmark-btn', ctx).forEach(btn => btn.addEventListener('click', () => toggleBookmark(btn.dataset.postId, btn)));
  qsa('.share-btn', ctx).forEach(btn => btn.addEventListener('click', () => copyLink(btn.dataset.postId)));
  qsa('.reply-btn', ctx).forEach(btn => btn.addEventListener('click', () => openReplyModal(btn.dataset.postId)));
  qsa('.quote-btn', ctx).forEach(btn => btn.addEventListener('click', () => openQuoteModal(btn.dataset.postId)));
  qsa('.delete-btn', ctx).forEach(btn => btn.addEventListener('click', e => { e.stopPropagation(); deletePost(btn.dataset.postId, btn); }));
  qsa('[data-goto]', ctx).forEach(el => el.addEventListener('click', () => { location.hash = el.dataset.goto; }));
  qsa('.post-username', ctx).forEach(el => {
    el.addEventListener('click', e => { e.preventDefault(); location.hash = el.href.split('#')[1] || `#/profile/${el.textContent.replace('@','')}` ; });
  });
  qsa('.post-img', ctx).forEach(img => img.addEventListener('click', () => window.open(img.src, '_blank')));
  qsa('.poll-bar-wrap', ctx).forEach(bar => bar.addEventListener('click', () => votePoll(bar.dataset.optionId, bar.closest('.post-card').dataset.postId)));
}

async function toggleLike(postId, btn) {
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

async function deletePost(postId, btn) {
  if (!confirm('Delete this post?')) return;
  btn.disabled = true;
  await sb.from('posts').delete().eq('id', postId).eq('user_id', currentUser.id);
  btn.closest('.post-card')?.remove();
  showToast('Deleted.');
}

async function sendNotification(postId, type) {
  try {
    const { data: post } = await sb.from('posts').select('user_id').eq('id', postId).single();
    if (post && post.user_id !== currentUser.id) {
      await sb.from('notifications').insert({ user_id: post.user_id, actor_id: currentUser.id, type, post_id: postId });
    }
  } catch (_) {}
}

function subscribeRealtime() {
  if (realtimeSub) return;
  realtimeSub = sb.channel('rt-posts')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, () => {
      const h = location.hash.replace(/^#\/?/,'');
      if (!h || h === 'feed' || h.startsWith('feed')) {
        const view = qs('#view-feed');
        if (view) { view.dataset.loaded = ''; loadFeedPosts('for-you'); }
      }
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (payload) => {
      if (payload.new.user_id === currentUser.id) loadNotifCount();
    })
    .subscribe();
}

async function loadNotifCount() {
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

async function renderExplore(sub) {
  const view = qs('#view-explore');
  view.innerHTML = `
    <div class="view-header">
      <h1 class="view-title">Explore</h1>
      <div class="search-bar">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" id="explore-input" placeholder="Search users or #hashtags…" autocomplete="off" value="${esc(sub ? decodeURIComponent(sub) : '')}" />
      </div>
    </div>
    <div id="explore-tabs" class="feed-tabs" style="border-bottom:1px solid var(--border)">
      <button class="feed-tab active" data-etab="users">People</button>
      <button class="feed-tab" data-etab="posts">Posts</button>
    </div>
    <div id="explore-results"></div>`;

  let etab = 'users';
  const search = async () => {
    const q = qs('#explore-input').value.trim();
    const el = qs('#explore-results');
    el.innerHTML = '<div class="full-loader"><div class="spinner"></div></div>';
    if (etab === 'users') await searchUsers(q, el);
    else await searchPosts(q, el);
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
  let req = sb.from('profiles').select('id, username, avatar_url, bio').neq('id', currentUser.id).limit(30);
  if (q) req = req.ilike('username', `%${q}%`);
  else req = req.order('created_at', { ascending: false });

  const { data: users } = await req;
  const { data: myFollows } = await sb.from('follows').select('following_id').eq('follower_id', currentUser.id);
  const fset = new Set((myFollows||[]).map(f=>f.following_id));

  if (!users?.length) { el.innerHTML = emptyState('No users found.'); return; }

  el.innerHTML = users.map(u => `
    <div class="user-row" data-username="${esc(u.username)}">
      ${avatarEl(u, 'size-md')}
      <div class="user-row-info">
        <div class="user-row-name">@${esc(u.username)}</div>
        ${u.bio ? `<div class="user-row-bio">${esc(u.bio.slice(0,70))}</div>` : ''}
      </div>
      <button class="btn-follow ${fset.has(u.id)?'following':''}" data-uid="${u.id}">${fset.has(u.id)?'Following':'Follow'}</button>
    </div>`).join('');

  qsa('.user-row', el).forEach(r => r.addEventListener('click', e => {
    if (e.target.closest('.btn-follow')) return;
    location.hash = `#/profile/${r.dataset.username}`;
  }));
  qsa('.btn-follow', el).forEach(b => b.addEventListener('click', e => { e.stopPropagation(); toggleFollow(b.dataset.uid, b); }));
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

  const { data } = await sb.from('notifications')
    .select('*, actor:profiles!notifications_actor_id_fkey(username, avatar_url)')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false })
    .limit(40);

  await sb.from('notifications').update({ read: true }).eq('user_id', currentUser.id).eq('read', false);
  qs('#notif-badge')?.classList.add('hidden');
  qs('#sidebar-notif-badge')?.classList.add('hidden');

  const list = qs('#notif-list');
  if (!data?.length) { list.innerHTML = emptyState('No notifications yet.'); return; }

  const icons = { like: '❤️', fire: '🔥', follow: '👋', repost: '🔁', comment: '💬', mention: '@' };
  const msgs  = { like: 'liked your post', fire: 'reacted to your post', follow: 'followed you', repost: 'reposted your post', comment: 'replied to your post', mention: 'mentioned you' };

  list.innerHTML = data.map(n => `
    <div class="notif-item ${n.read?'':'unread'}" data-post-id="${n.post_id||''}">
      <div class="notif-icon">${icons[n.type]||'🔔'}</div>
      <div style="flex:1;min-width:0">
        <div class="notif-text">
          <a href="#/profile/${esc(n.actor?.username)}" class="notif-user"><strong>@${esc(n.actor?.username)}</strong></a>
          ${msgs[n.type]||n.type}
        </div>
        <div class="notif-time">${timeAgo(n.created_at)}</div>
      </div>
    </div>`).join('');

  qsa('.notif-item[data-post-id]', list).forEach(el => {
    el.addEventListener('click', () => { if (el.dataset.postId) location.hash = `#/post/${el.dataset.postId}`; });
  });
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

  const isOwn = profile.id === currentUser.id;

  const [{ count: fc }, { count: fg }, { data: posts }, followCheck] = await Promise.all([
    sb.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', profile.id),
    sb.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', profile.id),
    sb.from('posts').select('id, content, post_type, media_url, created_at, user_id, profiles(id, username, avatar_url), reactions(id, user_id, type), reposts(id, user_id), bookmarks(id, user_id)').eq('user_id', profile.id).is('reply_to', null).order('created_at', { ascending: false }).limit(30),
    isOwn ? null : sb.from('follows').select('follower_id').eq('follower_id', currentUser.id).eq('following_id', profile.id).maybeSingle()
  ]);

  const isFollowing = !isOwn && !!followCheck?.data;
  const joinDate = new Date(profile.created_at).toLocaleDateString('en', { month: 'long', year: 'numeric' });

  view.innerHTML = `
    <div class="profile-cover">
      ${isOwn ? `<div class="profile-cover-actions">
        <button class="btn-sm btn-outline" id="change-cover-btn" style="background:rgba(0,0,0,.5);border-color:rgba(255,255,255,.2);color:#fff;font-size:.75rem;padding:4px 10px">Edit cover</button>
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
            : `<button class="btn-follow ${isFollowing?'following':''}" id="profile-follow-btn" data-uid="${profile.id}">${isFollowing?'Following':'Follow'}</button>`}
        </div>
      </div>
      <div class="profile-info">
        <div class="profile-username">@${esc(profile.username)}</div>
        ${profile.bio ? `<div class="profile-bio">${esc(profile.bio)}</div>` : ''}
        <div class="profile-meta-row">
          ${profile.location ? `<span class="profile-meta-item"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>${esc(profile.location)}</span>` : ''}
          ${profile.website ? `<span class="profile-meta-item"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg><a href="${esc(profile.website)}" target="_blank" rel="noopener">${esc(profile.website)}</a></span>` : ''}
          <span class="profile-meta-item"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>Joined ${joinDate}</span>
        </div>
      </div>
      <div class="profile-stats">
        <div class="stat-item"><span class="stat-num">${(posts||[]).length}</span><span class="stat-lbl">Posts</span></div>
        <div class="stat-item" id="follower-stat" style="cursor:pointer"><span class="stat-num">${fc||0}</span><span class="stat-lbl">Followers</span></div>
        <div class="stat-item"><span class="stat-num">${fg||0}</span><span class="stat-lbl">Following</span></div>
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

  qsa('.profile-tab', view).forEach(t => t.addEventListener('click', async () => {
    qsa('.profile-tab', view).forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    await loadProfileTab(t.dataset.ptab, profile.id, isOwn);
  }));

  if (isOwn) {
    qs('#edit-profile-btn').addEventListener('click', () => renderProfileEditForm(profile));
    qs('#avatar-upload')?.addEventListener('change', e => uploadAvatar(e.target.files[0], profile));
  } else {
    const fb = qs('#profile-follow-btn');
    if (fb) fb.addEventListener('click', async () => {
      await toggleFollow(profile.id, fb);
      const sn = qs('#follower-stat .stat-num');
      if (sn) sn.textContent = parseInt(sn.textContent) + (fb.classList.contains('following') ? 1 : -1);
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
        <label class="field-label">Username</label>
        <div class="input-prefix-wrap">
          <span class="input-prefix">@</span>
          <input class="field-input prefixed" id="ep-username" type="text" value="${esc(profile.username)}" maxlength="24" autocorrect="off" autocapitalize="none" spellcheck="false" />
        </div>
        <span class="field-hint" id="ep-username-hint"></span>
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
  const username = qs('#ep-username').value.trim().toLowerCase().replace(/[^a-z0-9_]/g,'');
  const bio      = qs('#ep-bio').value.trim();
  const location = qs('#ep-location').value.trim();
  const website  = qs('#ep-website').value.trim();
  const errEl    = qs('#ep-error');
  const btn      = qs('#ep-save');
  errEl.textContent = '';

  if (!username || username.length < 3) { errEl.textContent = 'Username must be 3+ chars.'; return; }

  if (username !== oldProfile.username) {
    const { data: ex } = await sb.from('profiles').select('id').eq('username', username).neq('id', currentUser.id).maybeSingle();
    if (ex) { errEl.textContent = 'Username already taken.'; return; }
  }

  btn.disabled = true; btn.textContent = 'Saving…';
  const { error } = await sb.from('profiles').update({ username, bio: bio||null, location: location||null, website: website||null, updated_at: new Date().toISOString() }).eq('id', currentUser.id);
  btn.disabled = false; btn.textContent = 'Save changes';
  if (error) { errEl.textContent = error.message; return; }

  currentProfile = { ...currentProfile, username, bio: bio||null, location: location||null, website: website||null };
  showToast('Profile updated!');
  if (username !== oldProfile.username) location.hash = `#/profile/${username}`;
  else { qs('#profile-edit-area').innerHTML = ''; renderProfile(username); }
}

async function uploadAvatar(file, profile) {
  if (!file) return;
  showToast('Uploading…');
  const ext  = file.name.split('.').pop().toLowerCase();
  const path = `avatars/${currentUser.id}/avatar.${ext}`;
  const { error: upErr } = await sb.storage.from('post-images').upload(path, file, { cacheControl: '3600', upsert: true });
  if (upErr) { showToast('Upload failed: ' + upErr.message, 'error'); return; }
  const { data: { publicUrl } } = sb.storage.from('post-images').getPublicUrl(path);
  await sb.from('profiles').update({ avatar_url: publicUrl }).eq('id', currentUser.id);
  currentProfile.avatar_url = publicUrl;
  setComposeAvatar();
  showToast('Avatar updated!');
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
              ${r.user_id === currentUser.id ? `<button class="reply-delete" data-cid="${r.id}">Delete</button>` : ''}
            </div>
            <div class="reply-text">${esc(r.content)}</div>
          </div>
        </div>`).join('')}
      ${!(replies||[]).length ? emptyState('No replies yet. Start the conversation!') : ''}
    </div>
    <div style="padding:12px 16px;border-top:1px solid var(--border);display:flex;gap:10px;align-items:flex-end">
      ${avatarEl(currentProfile,'size-sm')}
      <form id="inline-reply-form" style="flex:1;display:flex;gap:8px;align-items:flex-end">
        <textarea id="inline-reply-text" class="field-input" rows="1" placeholder="Reply…" maxlength="500" style="resize:none;flex:1;padding:8px 10px"></textarea>
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
          <div class="settings-row-label">Email</div>
          <div class="settings-row-desc">${esc(currentUser.email)}</div>
        </div>
        <span class="settings-row-val">Verified</span>
      </div>
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

  qs('#settings-logout-btn').addEventListener('click', () => sb.auth.signOut());

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

  qs('#delete-account-btn').addEventListener('click', async () => {
    if (!confirm('Are you sure? This cannot be undone.')) return;
    if (!confirm('Delete ALL posts, follows, and account data?')) return;
    await sb.from('profiles').delete().eq('id', currentUser.id);
    await sb.auth.signOut();
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

  const openModal = () => { modal.classList.add('open'); setComposeAvatar(); };
  const closeModal = () => { modal.classList.remove('open'); resetCompose(); };

  qs('#new-post-btn').addEventListener('click', openModal);
  qs('#bnav-compose-btn').addEventListener('click', openModal);
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
      if (view) { view.dataset.loaded = ''; }
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
  replyTargetPostId = postId;
  const { data: post } = await sb.from('posts').select('content, profiles(username)').eq('id', postId).single();
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
    if (view) { view.dataset.loaded = ''; renderFeed(); }
  });
}

async function openQuoteModal(postId) {
  const { data: post } = await sb.from('posts').select('id, content, profiles(username)').eq('id', postId).single();
  if (!post) return;
  quoteTargetPost = post;
  qs('#quote-preview-card').innerHTML = `<div class="quote-meta">@${esc(post.profiles?.username)}</div><div class="quote-text">${esc(post.content.slice(0,120))}</div>`;
  setComposeAvatar();
  qs('#quote-modal').classList.add('open');
  qs('#quote-text').focus();
}

function setupReactionPicker() {
  qsa('.rpick-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!pickerTarget) return;
      const { postId, btn: likeBtn } = pickerTarget;
      await sb.from('reactions').upsert({ post_id: postId, user_id: currentUser.id, type: btn.dataset.type }, { onConflict: 'post_id,user_id,type' });
      if (btn.dataset.type === 'like') {
        likeBtn.classList.add('liked');
        likeBtn.querySelector('svg').setAttribute('fill', 'currentColor');
      }
      showToast(`Reacted with ${btn.textContent}`);
      closeReactionPicker();
    });
  });
}

function showReactionPicker(likeBtn, postId) {
  const picker = qs('#reaction-picker');
  const rect = likeBtn.getBoundingClientRect();
  picker.style.bottom = `${window.innerHeight - rect.top + 8}px`;
  picker.style.left = `${rect.left}px`;
  picker.classList.remove('hidden');
  pickerTarget = { postId, btn: likeBtn };
}

function closeReactionPicker() {
  qs('#reaction-picker').classList.add('hidden');
  pickerTarget = null;
}

function closePickerOnOutside(e) {
  if (!e.target.closest('#reaction-picker') && !e.target.closest('.like-btn')) closeReactionPicker();
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

init();
