# 游戏导航 Cloudflare 免费版（不使用 R2）

## 架构
- Cloudflare Workers：网站/API
- Workers Static Assets：前台网页
- D1：网站设置、游戏列表
- 不使用 R2：背景和游戏图标使用“图片直链”保存
- 管理后台：密码保护

## 1. 安装 Node.js
建议使用 Node.js 20+。

## 2. 安装 Wrangler
```bash
npm install -g wrangler
```

## 3. 登录 Cloudflare
```bash
npx wrangler login
```

## 4. 创建 D1
如果已经在 Cloudflare 后台创建了 `game-nav-db`，不用重复创建。
把该数据库的 Database ID 填入 `wrangler.jsonc`。

## 5. 设置管理员密码
不要把密码写进代码：
```bash
npx wrangler secret put ADMIN_PASSWORD
```
输入你自己的后台密码。

## 6. 初始化数据库
```bash
npx wrangler d1 migrations apply game-nav-db --remote
```

## 7. 部署
```bash
npx wrangler deploy
```

部署完成后 Cloudflare 会显示网站地址。

## 图片怎么改？
为了保持完全不绑定 R2/付款方式，后台采用“图片直链”：
- 网站背景：粘贴图片 URL
- 游戏图标：粘贴图片 URL
- 游戏链接、名称、简介、分类都能在线修改

以后如果愿意开通 R2，可以再升级为真正的后台图片上传。
