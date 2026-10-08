const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' }
});

function auth(req, env) {
  return req.headers.get('authorization') === `Bearer ${env.ADMIN_PASSWORD}`;
}

async function getSite(env, isAdmin = false) {
  const settings = await env.DB.prepare('SELECT * FROM settings WHERE id=1').first();
  const sql = isAdmin
    ? `SELECT g.*,
         COALESCE((SELECT COUNT(*) FROM game_launches l WHERE l.game_id=g.id),0) AS total_launches,
         COALESCE((SELECT COUNT(*) FROM game_launches l WHERE l.game_id=g.id
           AND date(l.created_at,'localtime')=date('now','localtime')),0) AS today_launches
       FROM games g ORDER BY g.sort_order,g.id`
    : `SELECT id,name,description,icon_url,game_url,category,sort_order,enabled
       FROM games WHERE enabled=1 ORDER BY sort_order,id`;
  const { results } = await env.DB.prepare(sql).all();
  return { settings: settings || {}, games: results || [] };
}

const adminPage = String.raw`<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Yukecil 导航后台</title>
<style>
*{box-sizing:border-box}
body{margin:0;background:#08051b;color:#f7f3ff;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif}
main{max-width:960px;margin:auto;padding:22px 14px 70px}
h1{font-size:24px;margin:8px 0 18px}.sub{color:#aaa1ce;font-size:13px}
.box{background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.12);border-radius:18px;padding:18px;margin:14px 0;box-shadow:0 10px 35px rgba(0,0,0,.18)}
h2{font-size:18px;margin:0 0 14px}
label{display:block;color:#cfc7ef;font-size:13px;margin:10px 0 5px}
input,textarea,select{width:100%;padding:11px 12px;border-radius:10px;border:1px solid #42366c;background:#120d33;color:#fff;outline:none}
textarea{min-height:80px;resize:vertical}
.row{display:grid;grid-template-columns:1fr 1fr;gap:12px}.actions{display:flex;flex-wrap:wrap;gap:7px;margin-top:10px}
button{border:0;border-radius:10px;padding:10px 14px;background:#7658ee;color:#fff;font-weight:700;cursor:pointer}.secondary{background:#393052}.danger{background:#b94362}.green{background:#328e70}
.game{border-top:1px solid #30274e;padding:15px 0}.game:first-child{border-top:0}.game-title{display:flex;justify-content:space-between;gap:10px;align-items:center}.game-title b{font-size:16px}.muted{color:#aaa1ce;font-size:12px}.stats{color:#bfb5e9;font-size:12px;margin:8px 0}.status{font-size:12px;margin-left:6px}.on{color:#72d9aa}.off{color:#ff9aae}
.preview{max-width:100%;max-height:150px;border-radius:12px;margin-top:7px;display:none;border:1px solid rgba(255,255,255,.12)}
#login{max-width:430px;margin:70px auto}.hidden{display:none!important}.toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#1c1735;border:1px solid #4a3d78;border-radius:12px;padding:10px 16px;display:none;z-index:20}
@media(max-width:650px){.row{grid-template-columns:1fr}main{padding:16px 12px 50px}}
</style>
</head>
<body>
<main>
  <section id="login" class="box">
    <h1>Yukecil 导航后台</h1>
    <div class="sub">请输入后台密码登录</div>
    <label>管理员密码</label>
    <input id="password" type="password" autocomplete="current-password" placeholder="请输入 ADMIN_PASSWORD">
    <div class="actions"><button id="loginBtn">登录后台</button></div>
  </section>

  <section id="panel" class="hidden">
    <h1>Yukecil 导航后台</h1>
    <div class="sub">这里的设置不会显示后台入口；下架游戏只会从前台隐藏，后台仍然可以编辑。</div>

    <div class="box">
      <h2>网站设置</h2>
      <div class="row">
        <div><label>网站名称</label><input id="site_name"></div>
        <div><label>飞机联系方式</label><input id="telegram_contact" placeholder="例如 @Yukecil1"></div>
        <div><label>飞机交流群</label><input id="telegram_group" placeholder="例如 @yuk88888"></div>
      </div>
      <label>页面背景图直链</label><input id="background_url" placeholder="https://..."><img id="backgroundPreview" class="preview">
      <label>公告图直链</label><input id="announcement_image_url" placeholder="https://..."><img id="announcementPreview" class="preview">
      <label>公告图下面的文字</label><input id="announcement_text" placeholder="例如：Yukecil导航 · 精选设计、开发、AI、素材、学习与效率工具">
      <div class="row">
        <div><label>双向机器人</label><input id="telegram_bot" placeholder="例如 @Sx1108_bot"></div>
        <div><label>客服邮箱</label><input id="email" type="email" placeholder="例如 service@example.com"></div>
      </div>
      <label>客服服务时间</label><input id="service_time" placeholder="例如：每天 10:00 - 22:00">
      <div class="actions"><button id="saveSettings">保存网站设置</button><button id="logout" class="secondary">退出登录</button></div>
    </div>

    <div class="box">
      <h2>添加游戏</h2>
      <div class="row">
        <div><label>游戏名称</label><input id="new_name"></div>
        <div><label>分类</label><input id="new_category" placeholder="例如：游戏 / AI / 工具"></div>
      </div>
      <label>游戏描述</label><input id="new_description">
      <label>图标直链</label><input id="new_icon_url" placeholder="https://..."><img id="newIconPreview" class="preview">
      <label>游戏启动链接</label><input id="new_game_url" placeholder="https://..."><div class="row"><div><label>排序</label><input id="new_sort_order" type="number" value="0"></div><div><label>状态</label><select id="new_enabled"><option value="1">上架</option><option value="0">下架</option></select></div></div>
      <div class="actions"><button id="addGame">添加游戏</button></div>
    </div>

    <div class="box">
      <h2>游戏管理</h2>
      <div id="games"></div>
    </div>
  </section>
</main>
<div id="toast" class="toast"></div>
<script>
let token=sessionStorage.getItem('gameNavToken')||'';
let state={settings:{},games:[]};
const $=id=>document.getElementById(id);
function toast(msg){const el=$('toast');el.textContent=msg;el.style.display='block';clearTimeout(window.__toast);window.__toast=setTimeout(()=>el.style.display='none',1800)}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function headers(){return {'content-type':'application/json','authorization':'Bearer '+token}}
async function api(url,opt={}){opt.headers={...headers(),...(opt.headers||{})};const r=await fetch(url,opt);const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'请求失败');return d}
function showLogin(){ $('login').classList.remove('hidden'); $('panel').classList.add('hidden') }
function showPanel(){ $('login').classList.add('hidden'); $('panel').classList.remove('hidden') }
async function load(){
  try{state=await api('/api/site');showPanel();fillSettings();renderGames()}
  catch(e){sessionStorage.removeItem('gameNavToken');token='';showLogin();}
}
function preview(inputId,imgId){const v=$(inputId).value.trim();const img=$(imgId);if(v){img.src=v;img.style.display='block';img.onerror=()=>img.style.display='none'}else img.style.display='none'}
function fillSettings(){const s=state.settings||{};['site_name','background_url','announcement_image_url','announcement_text','service_time','telegram_contact','telegram_group','telegram_bot','email','contact_url'].forEach(k=>{if($(k))$(k).value=s[k]||''});preview('background_url','backgroundPreview');preview('announcement_image_url','announcementPreview')}
function renderGames(){
  const box=$('games');
  if(!state.games.length){box.innerHTML='<div class="muted">暂无游戏</div>';return}
  box.innerHTML=state.games.map(g=>
  '<div class="game" data-id="'+g.id+'">'+
    '<div class="game-title"><b>'+esc(g.name)+'</b><span class="status '+(g.enabled?'on':'off')+'">'+(g.enabled?'● 上架':'● 下架')+'</span></div>'+
    '<div class="stats">🚀 总启动 '+Number(g.total_launches||0)+'　 📅 今日启动 '+Number(g.today_launches||0)+'</div>'+
    '<div class="row"><div><label>名称</label><input data-k="name" value="'+esc(g.name)+'"></div><div><label>分类</label><input data-k="category" value="'+esc(g.category||'')+'"></div></div>'+
    '<label>描述</label><input data-k="description" value="'+esc(g.description||'')+'">'+
    '<label>图标直链</label><input data-k="icon_url" value="'+esc(g.icon_url||'')+'">'+
    '<label>游戏启动链接</label><input data-k="game_url" value="'+esc(g.game_url||'')+'">'+
    '<div class="row"><div><label>排序</label><input data-k="sort_order" type="number" value="'+Number(g.sort_order||0)+'"></div><div><label>状态</label><select data-k="enabled"><option value="1" '+(g.enabled?'selected':'')+'>上架</option><option value="0" '+(!g.enabled?'selected':'')+'>下架</option></select></div></div>'+
    '<div class="actions"><button onclick="saveGame('+g.id+',this)">保存修改</button><button class="danger" onclick="deleteGame('+g.id+')">删除游戏</button></div>'+
  '</div>').join('')
}
async function saveSettings(){
  const b={};['site_name','background_url','announcement_image_url','announcement_text','service_time','telegram_contact','telegram_group','telegram_bot','email','contact_url'].forEach(k=>b[k]=$(k).value.trim());
  try{await api('/api/site',{method:'PUT',body:JSON.stringify(b)});toast('网站设置已保存');await load()}catch(e){alert(e.message)}
}
async function addGame(){
  const b={name:$('new_name').value.trim(),description:$('new_description').value.trim(),icon_url:$('new_icon_url').value.trim(),game_url:$('new_game_url').value.trim(),category:$('new_category').value.trim(),sort_order:Number($('new_sort_order').value||0),enabled:$('new_enabled').value==='1'};
  if(!b.name||!b.game_url){alert('至少填写游戏名称和游戏启动链接');return}
  try{await api('/api/games',{method:'POST',body:JSON.stringify(b)});['new_name','new_description','new_icon_url','new_game_url','new_category'].forEach(id=>$(id).value='');toast('游戏已添加');await load()}catch(e){alert(e.message)}
}
async function saveGame(id,btn){
  const box=btn.closest('.game');const b={};box.querySelectorAll('[data-k]').forEach(el=>{b[el.dataset.k]=el.dataset.k==='enabled'?el.value==='1':el.dataset.k==='sort_order'?Number(el.value||0):el.value});
  try{await api('/api/games/'+id,{method:'PUT',body:JSON.stringify(b)});toast('已保存');await load()}catch(e){alert(e.message)}
}
async function deleteGame(id){if(!confirm('确定删除这个游戏吗？该游戏历史启动统计也会一起删除。'))return;try{await api('/api/games/'+id,{method:'DELETE'});toast('已删除');await load()}catch(e){alert(e.message)}}
$('loginBtn').onclick=async()=>{const p=$('password').value;if(!p)return;try{const r=await fetch('/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:p})});if(!r.ok)throw new Error('密码错误');token=p;sessionStorage.setItem('gameNavToken',token);await load()}catch(e){alert(e.message)}};
$('password').addEventListener('keydown',e=>{if(e.key==='Enter')$('loginBtn').click()});
$('saveSettings').onclick=saveSettings;$('addGame').onclick=addGame;$('logout').onclick=()=>{sessionStorage.removeItem('gameNavToken');token='';showLogin()};
$('background_url').oninput=()=>preview('background_url','backgroundPreview');$('announcement_image_url').oninput=()=>preview('announcement_image_url','announcementPreview');$('new_icon_url').oninput=()=>preview('new_icon_url','newIconPreview');
if(token)load();
</script>
</body></html>`;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    try {
      if (url.pathname === '/admin' || url.pathname === '/admin/') {
        return new Response(adminPage, { headers: { 'content-type': 'text/html; charset=utf-8' } });
      }

      if (url.pathname === '/api/login' && req.method === 'POST') {
        const body = await req.json().catch(() => ({}));
        if (body.password === env.ADMIN_PASSWORD) return json({ ok: true });
        return json({ error: '密码错误' }, 401);
      }

      if (url.pathname === '/api/site' && req.method === 'GET') {
        return json(await getSite(env, auth(req, env)));
      }

      if (url.pathname === '/api/site' && req.method === 'PUT') {
        if (!auth(req, env)) return json({ error: '未授权' }, 401);
        const body = await req.json().catch(() => ({}));
        const allowed = ['site_name','background_url','announcement_image_url','announcement_text','service_time','telegram_contact','telegram_group','telegram_bot','email','contact_url'];
        for (const key of allowed) {
          if (Object.prototype.hasOwnProperty.call(body, key)) {
            await env.DB.prepare(`UPDATE settings SET ${key}=? WHERE id=1`).bind(String(body[key] ?? '')).run();
          }
        }
        return json({ ok: true });
      }

      if (url.pathname === '/api/games' && req.method === 'POST') {
        if (!auth(req, env)) return json({ error: '未授权' }, 401);
        const b = await req.json().catch(() => ({}));
        await env.DB.prepare(`INSERT INTO games(name,description,icon_url,game_url,category,sort_order,enabled) VALUES(?,?,?,?,?,?,?)`)
          .bind(b.name||'',b.description||'',b.icon_url||'',b.game_url||'',b.category||'',Number(b.sort_order)||0,b.enabled?1:0).run();
        return json({ ok: true });
      }

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
          await env.DB.prepare(`UPDATE games SET name=?,description=?,icon_url=?,game_url=?,category=?,sort_order=?,enabled=? WHERE id=?`)
            .bind(b.name||'',b.description||'',b.icon_url||'',b.game_url||'',b.category||'',Number(b.sort_order)||0,b.enabled?1:0,id).run();
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
