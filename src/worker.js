const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8'
  }
});

function auth(req, env) {
  return req.headers.get('authorization') === `Bearer ${env.ADMIN_PASSWORD}`;
}

async function getSite(env, isAdmin = false) {
  const settings = await env.DB
    .prepare('SELECT * FROM settings WHERE id=1')
    .first();

  const sql = isAdmin
    ? `SELECT g.*,
         COALESCE(
           (SELECT COUNT(*)
            FROM game_launches l
            WHERE l.game_id=g.id),
           0
         ) AS total_launches,

         COALESCE(
           (SELECT COUNT(*)
            FROM game_launches l
            WHERE l.game_id=g.id
            AND date(l.created_at,'localtime')=date('now','localtime')),
           0
         ) AS today_launches

       FROM games g
       ORDER BY g.sort_order,g.id`

    : `SELECT
         id,
         name,
         description,
         icon_url,
         game_url,
         category,
         sort_order,
         enabled
       FROM games
       WHERE enabled=1
       ORDER BY sort_order,id`;

  const { results } = await env.DB.prepare(sql).all();

  return {
    settings: settings || {},
    games: results || []
  };
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    try {

      /*
       * =========================
       * 后台页面
       * =========================
       *
       * 不再使用 Worker 内嵌的旧 adminPage。
       * 现在直接读取：
       *
       * /public/admin.html
       *
       */

      if (url.pathname === '/admin' || url.pathname === '/admin/') {
  const adminUrl = new URL(req.url);
  adminUrl.pathname = '/admin.html';

  return env.ASSETS.fetch(
    new Request(adminUrl, {
      method: 'GET',
      headers: req.headers
    })
  );
}


      /*
       * =========================
       * 管理员登录
       * =========================
       */

      if (
        url.pathname === '/api/login' &&
        req.method === 'POST'
      ) {
        const body = await req.json().catch(() => ({}));

        if (body.password === env.ADMIN_PASSWORD) {
          return json({
            ok: true
          });
        }

        return json({
          error: '密码错误'
        }, 401);
      }


      /*
       * =========================
       * 网站信息
       * =========================
       */

      if (
        url.pathname === '/api/site' &&
        req.method === 'GET'
      ) {
        return json(
          await getSite(
            env,
            auth(req, env)
          )
        );
      }


      /*
       * =========================
       * 保存网站设置
       * =========================
       */

      if (
        url.pathname === '/api/site' &&
        req.method === 'PUT'
      ) {

        if (!auth(req, env)) {
          return json({
            error: '未授权'
          }, 401);
        }

        const body = await req
          .json()
          .catch(() => ({}));

        const allowed = [
          'site_name',
          'background_url',
          'announcement_image_url',
          'announcement_text',
          'service_time',
          'telegram_contact',
          'telegram_group',
          'telegram_bot',
          'email',
          'contact_url'
        ];

        for (const key of allowed) {

          if (
            Object.prototype.hasOwnProperty.call(
              body,
              key
            )
          ) {

            await env.DB
              .prepare(
                `UPDATE settings
                 SET ${key}=?
                 WHERE id=1`
              )
              .bind(
                String(body[key] ?? '')
              )
              .run();
          }
        }

        return json({
          ok: true
        });
      }


      /*
       * =========================
       * 添加游戏
       * =========================
       */

      if (
        url.pathname === '/api/games' &&
        req.method === 'POST'
      ) {

        if (!auth(req, env)) {
          return json({
            error: '未授权'
          }, 401);
        }

        const b = await req
          .json()
          .catch(() => ({}));

        await env.DB
          .prepare(
            `INSERT INTO games
            (
              name,
              description,
              icon_url,
              game_url,
              category,
              sort_order,
              enabled
            )
            VALUES(?,?,?,?,?,?,?)`
          )
          .bind(
            b.name || '',
            b.description || '',
            b.icon_url || '',
            b.game_url || '',
            b.category || '',
            Number(b.sort_order) || 0,
            b.enabled ? 1 : 0
          )
          .run();

        return json({
          ok: true
        });
      }


      /*
       * =========================
       * 游戏 API
       * =========================
       *
       * /api/games/123
       *
       * /api/games/123/launch
       */

      const match = url.pathname.match(
        /^\/api\/games\/(\d+)(?:\/(launch))?$/
      );

      if (match) {

        const id = Number(match[1]);


        /*
         * 游戏启动统计
         */

        if (
          match[2] === 'launch' &&
          req.method === 'POST'
        ) {

          const g = await env.DB
            .prepare(
              `SELECT id,enabled
               FROM games
               WHERE id=?`
            )
            .bind(id)
            .first();

          if (!g || !g.enabled) {
            return json({
              error: '游戏不可用'
            }, 404);
          }

          await env.DB
            .prepare(
              `INSERT INTO game_launches(game_id)
               VALUES(?)`
            )
            .bind(id)
            .run();

          return json({
            ok: true
          });
        }


        /*
         * 后台管理权限
         */

        if (!auth(req, env)) {
          return json({
            error: '未授权'
          }, 401);
        }


        /*
         * 修改游戏
         */

        if (req.method === 'PUT') {

          const b = await req
            .json()
            .catch(() => ({}));

          await env.DB
            .prepare(
              `UPDATE games
               SET
                 name=?,
                 description=?,
                 icon_url=?,
                 game_url=?,
                 category=?,
                 sort_order=?,
                 enabled=?
               WHERE id=?`
            )
            .bind(
              b.name || '',
              b.description || '',
              b.icon_url || '',
              b.game_url || '',
              b.category || '',
              Number(b.sort_order) || 0,
              b.enabled ? 1 : 0,
              id
            )
            .run();

          return json({
            ok: true
          });
        }


        /*
         * 删除游戏
         */

        if (req.method === 'DELETE') {

          await env.DB.batch([

            env.DB
              .prepare(
                `DELETE FROM game_launches
                 WHERE game_id=?`
              )
              .bind(id),

            env.DB
              .prepare(
                `DELETE FROM games
                 WHERE id=?`
              )
              .bind(id)

          ]);

          return json({
            ok: true
          });
        }
      }


      /*
       * =========================
       * 其他请求
       * =========================
       *
       * 交给 public 目录。
       *
       * /
       * /index.html
       * /favicon.ico
       * 图片
       * CSS
       * JS
       * 等
       */

      return env.ASSETS.fetch(req);

    } catch (e) {

      return json({
        error: e?.message || '服务器错误'
      }, 500);
    }
  }
};
