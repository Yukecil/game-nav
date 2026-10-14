const json = (data, status = 200, extraHeaders = {}) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...extraHeaders
  }
});

function auth(req, env) {
  const secret = env.ADMIN_PASSWORD;
  return Boolean(secret) && req.headers.get('authorization') === `Bearer ${secret}`;
}

async function getSite(env, isAdmin = false) {
  const settings = await env.DB.prepare('SELECT * FROM settings WHERE id=1').first();

  const sql = isAdmin
    ? `SELECT g.*,
         COALESCE((SELECT COUNT(*) FROM game_launches l WHERE l.game_id=g.id),0) AS total_launches,
         COALESCE((SELECT COUNT(*) FROM game_launches l
           WHERE l.game_id=g.id
           AND date(l.created_at,'localtime')=date('now','localtime')),0) AS today_launches
       FROM games g ORDER BY g.sort_order,g.id`
    : `SELECT id,name,description,icon_url,game_url,category,sort_order,enabled
       FROM games WHERE enabled=1 ORDER BY sort_order,id`;

  const { results } = await env.DB.prepare(sql).all();
  return { settings: settings || {}, games: results || [] };
}

const MAX_IMAGE_BYTES = 900 * 1024;
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

function sniffImage(bytes) {
  if (bytes.length >= 8 &&
      bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e &&
      bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a &&
      bytes[6] === 0x1a && bytes[7] === 0x0a) return 'image/png';

  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }

  if (bytes.length >= 6) {
    const head = String.fromCharCode(...bytes.slice(0, 6));
    if (head === 'GIF87a' || head === 'GIF89a') return 'image/gif';
  }

  if (bytes.length >= 12) {
    const riff = String.fromCharCode(...bytes.slice(0, 4));
    const webp = String.fromCharCode(...bytes.slice(8, 12));
    if (riff === 'RIFF' && webp === 'WEBP') return 'image/webp';
  }

  return '';
}

async function uploadImage(req, env) {
  if (!auth(req, env)) return json({ error: '未授权，请重新登录' }, 401);

  const declaredLength = Number(req.headers.get('content-length') || 0);
  if (declaredLength && declaredLength > MAX_IMAGE_BYTES + 64 * 1024) {
    return json({ error: '图片太大，请压缩到 900 KB 以内' }, 413);
  }

  let form;
  try {
    form = await req.formData();
  } catch {
    return json({ error: '上传格式不正确，请重新选择图片' }, 400);
  }

  const file = form.get('file');
  const purpose = String(form.get('purpose') || 'icon');
  if (!file || typeof file.arrayBuffer !== 'function') {
    return json({ error: '没有收到图片文件' }, 400);
  }
  if (!['icon', 'background', 'announcement'].includes(purpose)) {
    return json({ error: '图片用途无效' }, 400);
  }
  if (file.size < 1 || file.size > MAX_IMAGE_BYTES) {
    return json({ error: '单张图片必须大于 0 且不超过 900 KB' }, 413);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffImage(bytes);
  if (!mime || !IMAGE_TYPES.has(mime)) {
    return json({ error: '只支持有效的 PNG、JPG、WEBP 或 GIF 图片' }, 415);
  }

  const id = crypto.randomUUID().replaceAll('-', '');
  try {
    await env.DB.prepare(
      `INSERT INTO uploads (id, purpose, mime_type, data, size_bytes)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(id, purpose, mime, bytes, bytes.byteLength).run();
  } catch (e) {
    return json({
      error: '图片保存失败。请确认已执行 uploads.sql，且 D1 容量充足。',
      detail: e?.message || ''
    }, 500);
  }

  return json({ ok: true, id, url: `/media/${id}`, size: bytes.byteLength, type: mime });
}

async function serveImage(id, env, method = 'GET') {
  const row = await env.DB.prepare(
    'SELECT mime_type, data, size_bytes FROM uploads WHERE id=?'
  ).bind(id).first();

  if (!row || !row.data) {
    return new Response('Image not found', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }
    });
  }

  const headers = {
    'content-type': row.mime_type || 'application/octet-stream',
    'content-length': String(row.size_bytes || row.data.byteLength || 0),
    'cache-control': 'public, max-age=31536000, immutable',
    'x-content-type-options': 'nosniff',
    'cross-origin-resource-policy': 'same-origin'
  };

  return new Response(method === 'HEAD' ? null : row.data, { status: 200, headers });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    try {
      // 上传后的图片使用本站域名访问，ID 每次唯一，适合长期缓存。
      const mediaMatch = url.pathname.match(/^\/media\/([a-f0-9]{32})$/i);
      if (mediaMatch && (req.method === 'GET' || req.method === 'HEAD')) {
        return await serveImage(mediaMatch[1], env, req.method);
      }

      // 后台页面由 public/admin.html 提供。
      if (url.pathname === '/admin' || url.pathname === '/admin/') {
        const adminUrl = new URL(req.url);
        adminUrl.pathname = '/admin.html';
        return env.ASSETS.fetch(new Request(adminUrl, { method: 'GET', headers: req.headers }));
      }

      // 管理员登录。
      if (url.pathname === '/api/login' && req.method === 'POST') {
        const body = await req.json().catch(() => ({}));
        if (env.ADMIN_PASSWORD && body.password === env.ADMIN_PASSWORD) return json({ ok: true });
        return json({ error: '密码错误' }, 401);
      }

      // 后台图片上传。
      if (url.pathname === '/api/uploads' && req.method === 'POST') {
        return await uploadImage(req, env);
      }

      // 网站信息。
      if (url.pathname === '/api/site' && req.method === 'GET') {
        return json(await getSite(env, auth(req, env)));
      }

      // 保存网站设置。
      if (url.pathname === '/api/site' && req.method === 'PUT') {
        if (!auth(req, env)) return json({ error: '未授权' }, 401);

        const body = await req.json().catch(() => ({}));
        const allowed = [
          'site_name', 'background_url',
          'announcement_image_url', 'announcement_text', 'service_time',
          'telegram_contact', 'telegram_group', 'telegram_bot',
          'email', 'contact_url'
        ];

        for (const key of allowed) {
          if (Object.prototype.hasOwnProperty.call(body, key)) {
            await env.DB.prepare(`UPDATE settings SET ${key}=? WHERE id=1`)
              .bind(String(body[key] ?? '')).run();
          }
        }
        return json({ ok: true });
      }

      // 添加游戏。
      if (url.pathname === '/api/games' && req.method === 'POST') {
        if (!auth(req, env)) return json({ error: '未授权' }, 401);
        const b = await req.json().catch(() => ({}));

        await env.DB.prepare(
          `INSERT INTO games (name,description,icon_url,game_url,category,sort_order,enabled)
           VALUES(?,?,?,?,?,?,?)`
        ).bind(
          b.name || '', b.description || '', b.icon_url || '', b.game_url || '',
          b.category || '', Number(b.sort_order) || 0,
          b.enabled === false || b.enabled === 0 ? 0 : 1
        ).run();

        return json({ ok: true });
      }

      // 游戏管理与启动统计。
      const match = url.pathname.match(/^\/api\/games\/(\d+)(?:\/(launch))?$/);
      if (match) {
        const id = Number(match[1]);

        if (match[2] === 'launch' && req.method === 'POST') {
          const g = await env.DB.prepare('SELECT id,enabled FROM games WHERE id=?').bind(id).first();
          if (!g || !g.enabled) return json({ error: '游戏不可用' }, 404);
          await env.DB.prepare('INSERT INTO game_launches(game_id) VALUES(?)').bind(id).run();
          return json({ ok: true });
        }

        if (!auth(req, env)) return json({ error: '未授权' }, 401);

        if (req.method === 'PUT') {
          const b = await req.json().catch(() => ({}));
          await env.DB.prepare(
            `UPDATE games SET name=?,description=?,icon_url=?,game_url=?,category=?,sort_order=?,enabled=?
             WHERE id=?`
          ).bind(
            b.name || '', b.description || '', b.icon_url || '', b.game_url || '',
            b.category || '', Number(b.sort_order) || 0,
            b.enabled ? 1 : 0, id
          ).run();
          return json({ ok: true });
        }

        if (req.method === 'DELETE') {
          await env.DB.batch([
            env.DB.prepare('DELETE FROM game_launches WHERE game_id=?').bind(id),
            env.DB.prepare('DELETE FROM games WHERE id=?').bind(id)
          ]);
          return json({ ok: true });
        }
      }

      return env.ASSETS.fetch(req);
    } catch (e) {
      return json({ error: e?.message || '服务器错误' }, 500);
    }
  }
};
