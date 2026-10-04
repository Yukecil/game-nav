CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  site_name TEXT NOT NULL DEFAULT '游戏导航',
  accent TEXT NOT NULL DEFAULT '#3488ff',
  background_url TEXT NOT NULL DEFAULT '',
  logo_url TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  icon_url TEXT NOT NULL DEFAULT '',
  game_url TEXT NOT NULL DEFAULT '#',
  category TEXT NOT NULL DEFAULT '全部',
  sort_order INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO settings(id,site_name,accent,background_url,logo_url)
VALUES(1,'游戏导航','#3488ff','','');

INSERT INTO games(name,description,icon_url,game_url,category,sort_order)
SELECT '原神','开放世界冒险 RPG，探索提瓦特大陆','','#','角色扮演',1
WHERE NOT EXISTS (SELECT 1 FROM games);
INSERT INTO games(name,description,icon_url,game_url,category,sort_order)
SELECT '王者荣耀','5V5 公平竞技，国民 MOBA 手游','','#','热门游戏',2
WHERE (SELECT COUNT(*) FROM games)=1;
INSERT INTO games(name,description,icon_url,game_url,category,sort_order)
SELECT '和平精英','百人竞技，真实战场体验','','#','热门游戏',3
WHERE (SELECT COUNT(*) FROM games)=2;
INSERT INTO games(name,description,icon_url,game_url,category,sort_order)
SELECT '崩坏：星穹铁道','米哈游全新作品，开启星际之旅','','#','角色扮演',4
WHERE (SELECT COUNT(*) FROM games)=3;
