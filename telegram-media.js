import 'dotenv/config';
import sharp from 'sharp';
import FormData from 'form-data';
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';
import express from 'express';
import multer from 'multer';

const BOT_TOKEN   = process.env.TG_BOT_TOKEN;
const CHANNEL_ID  = process.env.TG_CHANNEL_ID;
const TG_API      = `https://api.telegram.org/bot${BOT_TOKEN}`;
const TG_FILE_API = `https://api.telegram.org/file/bot${BOT_TOKEN}`;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const RESIZE_PRESETS = {
  avatar: { width: 400,  height: 400,  fit: 'cover',  quality: 90 },
  banner: { width: 1200, height: 400,  fit: 'cover',  quality: 90 },
  post:   { width: 1200, height: null, fit: 'inside', quality: 88 },
};

async function processImage(inputBuffer, preset = 'post') {
  const { width, height, fit, quality } = RESIZE_PRESETS[preset];

  return sharp(inputBuffer)
    .rotate()
    .resize({ width, height: height ?? undefined, fit, withoutEnlargement: true })
    .webp({ quality, effort: 4, smartSubsample: true })
    .toBuffer();
}

async function sendToTelegram(fileBuffer, filename, caption = '') {
  const form = new FormData();
  form.append('chat_id', CHANNEL_ID);
  form.append('document', fileBuffer, { filename, contentType: 'image/webp' });
  if (caption) form.append('caption', caption);
  form.append('disable_notification', 'true');

  const res  = await fetch(`${TG_API}/sendDocument`, {
    method: 'POST',
    body: form,
    headers: form.getHeaders(),
  });
  const json = await res.json();

  if (!json.ok) throw new Error(`Telegram sendDocument error: ${json.description}`);

  return {
    file_id:    json.result.document.file_id,
    message_id: json.result.message_id,
  };
}

async function deleteFromTelegram(messageId) {
  if (!messageId) return;

  const res  = await fetch(`${TG_API}/deleteMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHANNEL_ID, message_id: Number(messageId) }),
  });
  const json = await res.json();

  if (!json.ok && json.description !== 'Bad Request: message to delete not found') {
    console.warn(`[TG] deleteMessage warning: ${json.description}`);
  }
}

async function getTelegramFileUrl(fileId) {
  const res  = await fetch(`${TG_API}/getFile?file_id=${encodeURIComponent(fileId)}`);
  const json = await res.json();

  if (!json.ok) throw new Error(`Telegram getFile error: ${json.description}`);

  return `${TG_FILE_API}/${json.result.file_path}`;
}

export async function uploadAvatar(fileBuffer, userId, oldMsgId = null) {
  const webpBuffer = await processImage(fileBuffer, 'avatar');
  const { file_id, message_id } = await sendToTelegram(
    webpBuffer,
    `avatar_${userId}_${Date.now()}.webp`,
    `[avatar] user:${userId}`
  );

  if (oldMsgId) await deleteFromTelegram(oldMsgId);

  const cdnUrl = await getTelegramFileUrl(file_id);

  const updateData = { avatar_url: cdnUrl };

  const { data: migCheck } = await supabase
    .from('profiles').select('tg_avatar_file_id').eq('id', userId).single();
  if (migCheck && 'tg_avatar_file_id' in migCheck) {
    updateData.tg_avatar_file_id    = file_id;
    updateData.tg_avatar_message_id = message_id;
    updateData.avatar_url           = null;
  }

  const { error } = await supabase.from('profiles').update(updateData).eq('id', userId);
  if (error) throw new Error(`Supabase profiles update error: ${error.message}`);

  return { tg_file_id: file_id, tg_message_id: message_id, url: cdnUrl };
}

export async function uploadBanner(fileBuffer, userId, oldMsgId = null) {
  const webpBuffer = await processImage(fileBuffer, 'banner');
  const { file_id, message_id } = await sendToTelegram(
    webpBuffer,
    `banner_${userId}_${Date.now()}.webp`,
    `[banner] user:${userId}`
  );

  if (oldMsgId) await deleteFromTelegram(oldMsgId);

  const cdnUrl = await getTelegramFileUrl(file_id);

  const updateData = { cover_url: cdnUrl };

  const { data: migCheck } = await supabase
    .from('profiles').select('tg_banner_file_id').eq('id', userId).single();
  if (migCheck && 'tg_banner_file_id' in migCheck) {
    updateData.tg_banner_file_id    = file_id;
    updateData.tg_banner_message_id = message_id;
    updateData.cover_url            = null;
  }

  const { error } = await supabase.from('profiles').update(updateData).eq('id', userId);
  if (error) throw new Error(`Supabase profiles update error: ${error.message}`);

  return { tg_file_id: file_id, tg_message_id: message_id, url: cdnUrl };
}

export async function uploadPostImage(fileBuffer, postId, userId) {
  const webpBuffer = await processImage(fileBuffer, 'post');
  const { file_id, message_id } = await sendToTelegram(
    webpBuffer,
    `post_${postId}_${Date.now()}.webp`,
    `[post] id:${postId} user:${userId}`
  );

  const cdnUrl = await getTelegramFileUrl(file_id);

  const updateData = { media_url: cdnUrl };

  const { data: migCheck } = await supabase
    .from('posts').select('tg_media_file_id').eq('id', postId).single();
  if (migCheck && 'tg_media_file_id' in migCheck) {
    updateData.tg_media_file_id    = file_id;
    updateData.tg_media_message_id = message_id;
    updateData.media_url           = null;
  }

  const { error } = await supabase.from('posts').update(updateData).eq('id', postId);
  if (error) throw new Error(`Supabase posts update error: ${error.message}`);

  return { tg_file_id: file_id, tg_message_id: message_id, url: cdnUrl };
}

export async function deletePost(postId, userId, isAdmin = false) {
  const { data: post, error: fetchErr } = await supabase
    .from('posts').select('*').eq('id', postId).single();

  if (fetchErr) throw new Error(`Cannot fetch post: ${fetchErr.message}`);
  if (!isAdmin && post.user_id !== userId) throw new Error('Permission denied');

  if (post.tg_media_message_id) await deleteFromTelegram(post.tg_media_message_id);

  let query = supabase.from('posts').delete().eq('id', postId);
  if (!isAdmin) query = query.eq('user_id', userId);

  const { error: delErr } = await query;
  if (delErr) throw new Error(`Cannot delete post: ${delErr.message}`);
}

export async function getMediaUrl(fileId) {
  if (!fileId) return null;
  try {
    return await getTelegramFileUrl(fileId);
  } catch (err) {
    console.error(`[TG] getMediaUrl failed for ${fileId}:`, err.message);
    return null;
  }
}

export async function batchGetMediaUrls(fileIds) {
  const unique  = [...new Set(fileIds.filter(Boolean))];
  const entries = await Promise.all(
    unique.map(async id => [id, await getMediaUrl(id)])
  );
  return Object.fromEntries(entries.filter(([, url]) => url !== null));
}

export async function hydrateMediaUrls(records, fileIdFields, urlFields) {
  const allFileIds = records.flatMap(r => fileIdFields.map(f => r[f]).filter(Boolean));
  const urlMap     = await batchGetMediaUrls(allFileIds);

  return records.map(record => {
    const hydrated = { ...record };
    fileIdFields.forEach((field, i) => {
      const id = record[field];
      if (id && urlMap[id]) hydrated[urlFields[i]] = urlMap[id];
    });
    return hydrated;
  });
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic'];
    cb(null, allowed.includes(file.mimetype));
  },
});

export const mediaRouter = express.Router();

async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    if (!payload.sub) return res.status(401).json({ error: 'Invalid token' });
    if (payload.exp && payload.exp < Date.now() / 1000) return res.status(401).json({ error: 'Token expired' });
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

mediaRouter.post('/avatar', requireAuth, upload.single('file'), async (req, res) => {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('tg_avatar_message_id')
      .eq('id', req.user.id)
      .single();

    const result = await uploadAvatar(req.file.buffer, req.user.id, profile?.tg_avatar_message_id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

mediaRouter.post('/banner', requireAuth, upload.single('file'), async (req, res) => {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('tg_banner_message_id')
      .eq('id', req.user.id)
      .single();

    const result = await uploadBanner(req.file.buffer, req.user.id, profile?.tg_banner_message_id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

mediaRouter.post('/post-image', requireAuth, upload.single('file'), async (req, res) => {
  const { post_id } = req.body;
  if (!post_id) return res.status(400).json({ error: 'post_id required' });

  try {
    const result = await uploadPostImage(req.file.buffer, post_id, req.user.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

mediaRouter.delete('/post/:postId', requireAuth, async (req, res) => {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_moderator')
      .eq('id', req.user.id)
      .single();

    await deletePost(req.params.postId, req.user.id, !!profile?.is_moderator);
    res.json({ success: true });
  } catch (err) {
    const status = err.message.includes('Permission') ? 403 : 500;
    res.status(status).json({ error: err.message });
  }
});

mediaRouter.get('/url', requireAuth, async (req, res) => {
  const { file_id } = req.query;
  if (!file_id) return res.status(400).json({ error: 'file_id required' });

  try {
    const url = await getMediaUrl(file_id);
    if (!url) return res.status(404).json({ error: 'File not found' });
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

mediaRouter.post('/batch-urls', requireAuth, express.json(), async (req, res) => {
  const { file_ids } = req.body;
  if (!Array.isArray(file_ids)) return res.status(400).json({ error: 'file_ids must be array' });

  try {
    const urls = await batchGetMediaUrls(file_ids);
    res.json({ urls });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});