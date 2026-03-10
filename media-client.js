const MEDIA_API_BASE = (() => {
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    return '/api/media';
  }
  return 'https://YOUR-BACKEND.railway.app/api/media';
})();

const URL_CACHE     = new Map();
const URL_CACHE_TTL = 50 * 60 * 1000;

function cacheGet(fileId) {
  const entry = URL_CACHE.get(fileId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { URL_CACHE.delete(fileId); return null; }
  return entry.url;
}

function cacheSet(fileId, url) {
  URL_CACHE.set(fileId, { url, expiresAt: Date.now() + URL_CACHE_TTL });
}

async function getAuthHeader() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session?.access_token) return null;
  return { 'Authorization': `Bearer ${session.access_token}` };
}

async function uploadAvatar(fileOrBlob) {
  const authHeader = await getAuthHeader();
  if (!authHeader) throw new Error('Not authenticated');
  const formData = new FormData();
  formData.append('file', fileOrBlob, 'avatar.webp');

  const res  = await fetch(`${MEDIA_API_BASE}/avatar`, {
    method: 'POST',
    headers: authHeader,
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Avatar upload failed');
  return data;
}

async function uploadBanner(fileOrBlob) {
  const authHeader = await getAuthHeader();
  if (!authHeader) throw new Error('Not authenticated');
  const formData = new FormData();
  formData.append('file', fileOrBlob, 'banner.webp');

  const res  = await fetch(`${MEDIA_API_BASE}/banner`, {
    method: 'POST',
    headers: authHeader,
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Banner upload failed');
  return data;
}

async function uploadPostImage(fileOrBlob, postId) {
  const authHeader = await getAuthHeader();
  if (!authHeader) throw new Error('Not authenticated');
  const formData = new FormData();
  formData.append('file', fileOrBlob, 'post-image.webp');
  formData.append('post_id', postId);

  const res  = await fetch(`${MEDIA_API_BASE}/post-image`, {
    method: 'POST',
    headers: authHeader,
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Post image upload failed');
  return data;
}

async function deletePost(postId) {
  const authHeader = await getAuthHeader();
  if (!authHeader) throw new Error('Not authenticated');
  const res = await fetch(`${MEDIA_API_BASE}/post/${postId}`, {
    method: 'DELETE',
    headers: authHeader,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Delete failed');
}

async function getMediaUrl(fileId) {
  if (!fileId) return null;

  const cached = cacheGet(fileId);
  if (cached) return cached;

  const authHeader = await getAuthHeader();
  if (!authHeader) return null;

  const res = await fetch(`${MEDIA_API_BASE}/url?file_id=${encodeURIComponent(fileId)}`, {
    headers: authHeader,
  });

  if (!res.ok) return null;

  const { url } = await res.json();
  if (url) cacheSet(fileId, url);
  return url ?? null;
}

async function hydrateMediaUrls(records, fileIdKeys, urlKeys) {
  const toFetch    = [];
  const localCache = {};

  for (const record of records) {
    for (const key of fileIdKeys) {
      const id = record[key];
      if (!id) continue;
      const cached = cacheGet(id);
      if (cached) {
        localCache[id] = cached;
      } else if (!toFetch.includes(id)) {
        toFetch.push(id);
      }
    }
  }

  let fetched = {};
  if (toFetch.length > 0) {
    try {
      const authHeader = await getAuthHeader();
      if (authHeader) {
        const res = await fetch(`${MEDIA_API_BASE}/batch-urls`, {
          method: 'POST',
          headers: { ...authHeader, 'Content-Type': 'application/json' },
          body: JSON.stringify({ file_ids: toFetch }),
        });
        if (res.ok) {
          const { urls } = await res.json();
          fetched = urls;
          Object.entries(fetched).forEach(([id, url]) => cacheSet(id, url));
        }
      }
    } catch (err) {
      console.warn('[TgMedia] batch-urls failed:', err.message);
    }
  }

  const allUrls = { ...localCache, ...fetched };

  return records.map(record => {
    const hydrated = { ...record };
    fileIdKeys.forEach((key, i) => {
      const id = record[key];
      if (id && allUrls[id]) hydrated[urlKeys[i]] = allUrls[id];
    });
    return hydrated;
  });
}

window.TgMedia = {
  uploadAvatar,
  uploadBanner,
  uploadPostImage,
  deletePost,
  getMediaUrl,
  hydrateMediaUrls,
};