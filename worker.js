const json = (data, status=200) => new Response(JSON.stringify(data), {
  status,
  headers: {"content-type":"application/json;charset=UTF-8","cache-control":"no-store"}
});

function isAdmin(request, env) {
  const auth = request.headers.get("authorization") || "";
  return !!env.ADMIN_PASSWORD && auth === `Bearer ${env.ADMIN_PASSWORD}`;
}

async function api(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === "GET" && path === "/api/site") {
    const settings = await env.DB.prepare("SELECT * FROM settings WHERE id=1").first();
    const games = await env.DB.prepare(
      "SELECT id,name,description,icon_url,game_url,category,sort_order,enabled FROM games WHERE enabled=1 ORDER BY sort_order,id"
    ).all();
    return json({ settings, games: games.results || [] });
  }

  if (request.method === "POST" && path === "/api/login") {
    const body = await request.json().catch(() => ({}));
    if (!env.ADMIN_PASSWORD || !body.password || body.password !== env.ADMIN_PASSWORD) {
      return json({ error: "密码错误" }, 401);
    }
    return json({ ok: true });
  }

  if (!isAdmin(request, env)) return json({ error: "未授权" }, 401);

  if (request.method === "PUT" && path === "/api/site") {
    const body = await request.json().catch(() => ({}));
    await env.DB.prepare(
      "UPDATE settings SET site_name=?,accent=?,background_url=?,logo_url=?,contact_url=? WHERE id=1"
    ).bind(
      body.site_name || "游戏导航",
      body.accent || "#3488ff",
      body.background_url || "",
      body.logo_url || "",
      body.contact_url || ""
    ).run();
    return json({ ok: true });
  }

  if (request.method === "POST" && path === "/api/games") {
    const b = await request.json().catch(() => ({}));
    const r = await env.DB.prepare(
      "INSERT INTO games(name,description,icon_url,game_url,category,sort_order,enabled) VALUES(?,?,?,?,?,?,1)"
    ).bind(
      b.name || "新游戏",
      b.description || "填写游戏简介",
      b.icon_url || "",
      b.game_url || "#",
      b.category || "全部",
      Number(b.sort_order || 0)
    ).run();
    return json({ ok: true, id: r.meta.last_row_id });
  }

  const match = path.match(/^\/api\/games\/(\d+)$/);
  if (match) {
    const id = Number(match[1]);
    if (request.method === "PUT") {
      const b = await request.json().catch(() => ({}));
      await env.DB.prepare(
        "UPDATE games SET name=?,description=?,icon_url=?,game_url=?,category=?,sort_order=?,enabled=? WHERE id=?"
      ).bind(
        b.name || "新游戏",
        b.description || "",
        b.icon_url || "",
        b.game_url || "#",
        b.category || "全部",
        Number(b.sort_order || 0),
        b.enabled === false ? 0 : 1,
        id
      ).run();
      return json({ ok: true });
    }
    if (request.method === "DELETE") {
      await env.DB.prepare("DELETE FROM games WHERE id=?").bind(id).run();
      return json({ ok: true });
    }
  }

  return json({ error: "Not found" }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) return api(request, env);

    // Hidden admin route. /#/admin is intentionally not used.
    if (url.pathname === "/admin" || url.pathname === "/admin/") {
      return env.ASSETS.fetch(new Request(new URL("/admin.html", request.url), request));
    }

    return env.ASSETS.fetch(request);
  }
};
