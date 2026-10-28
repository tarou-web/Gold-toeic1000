// フレーズ1000 連続記録ウィジェット（Scriptable用）
// ウィジェットを長押し →「ウィジェットを編集」→ Parameter に、アプリの「あなたの合言葉」を貼り付けてください。

const KEY = (args.widgetParameter || "").trim();
const DB = "https://phrase1000-default-rtdb.asia-southeast1.firebasedatabase.app".replace(/\/+$/, "");
const BASE = "https://tarou-web.github.io/Gold-toeic1000/widget/";
const APP = "https://tarou-web.github.io/Gold-toeic1000/";

const fm = FileManager.local();
const cacheDir = fm.joinPath(fm.cacheDirectory(), "phrase1000");
if (!fm.fileExists(cacheDir)) fm.createDirectory(cacheDir, true);

function dkey(d) { return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; }

async function loadProgress() {
  const cache = fm.joinPath(cacheDir, `progress-${KEY}.json`);
  try {
    const data = await new Request(`${DB}/progress/${KEY}.json`).loadJSON();
    if (data) fm.writeString(cache, JSON.stringify(data));
    return data;
  } catch (e) {
    // offline: use the last copy we saw
    return fm.fileExists(cache) ? JSON.parse(fm.readString(cache)) : null;
  }
}

async function loadArt(name) {
  const path = fm.joinPath(cacheDir, `${name}-v1.png`);
  if (fm.fileExists(path)) return fm.readImage(path);
  try {
    const img = await new Request(`${BASE}${name}.png`).loadImage();
    fm.writeImage(path, img);
    return img;
  } catch (e) { return null; }
}

function pick(list, seed) { return list[seed % list.length]; }

async function build() {
  const w = new ListWidget();
  w.url = APP;
  w.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);
  w.setPadding(12, 14, 12, 14);

  if (!KEY) {
    w.backgroundColor = new Color("#9aa3ad");
    const t = w.addText("合言葉を設定してください");
    t.font = Font.boldRoundedSystemFont(14); t.textColor = Color.white();
    w.addSpacer(4);
    const s = w.addText("長押し →「ウィジェットを編集」→ Parameter に貼り付け");
    s.font = Font.systemFont(10); s.textColor = Color.white();
    return w;
  }

  const data = await loadProgress();
  const now = new Date();
  const today = dkey(now);
  const y = new Date(now); y.setDate(now.getDate() - 1);
  const yesterday = dkey(y);

  const last = data ? data.last : "";
  const alive = last === today || last === yesterday;
  const streak = alive ? (data.streak || 0) : 0;
  const doneToday = last === today;

  // background changes every 3 days while the streak is going; state art otherwise
  const dayNum = Math.floor((now.getTime() - now.getTimezoneOffset() * 60000) / 86400000);
  let art, msg, flameOn;
  if (!data) { art = "pending"; msg = "記録を読み込めません"; flameOn = false; }
  else if (streak === 0) { art = "zero"; msg = "また始めよう"; flameOn = false; }
  else if (doneToday) {
    art = `good-${(Math.floor(dayNum / 3) % 5) + 1}`;
    msg = pick(["その調子！", "今日もクリア！", "いいペース！", "すごい！", "継続は力なり"], dayNum);
    flameOn = true;
  } else if (now.getHours() >= 20) { art = "late"; msg = "今日が終わっちゃう！"; flameOn = false; }
  else { art = "pending"; msg = "今日の分はまだだよ"; flameOn = false; }

  const img = await loadArt(art);
  if (img) w.backgroundImage = img; else w.backgroundColor = new Color("#9aa3ad");

  const top = w.addStack();
  top.centerAlignContent();
  const flame = SFSymbol.named("flame.fill");
  flame.applyFont(Font.heavySystemFont(26));
  const fi = top.addImage(flame.image);
  fi.imageSize = new Size(26, 26);
  fi.tintColor = flameOn ? new Color("#ffb21e") : new Color("#ffffff", 0.85);
  top.addSpacer(4);
  const num = top.addText(String(streak));
  num.font = Font.heavyRoundedSystemFont(32);
  num.textColor = flameOn ? new Color("#ffd21f") : Color.white();
  num.shadowColor = new Color("#000000", 0.35); num.shadowRadius = 3; num.shadowOffset = new Point(0, 1);

  if (config.widgetFamily === "medium" && data) {
    top.addSpacer();
    const side = top.addStack(); side.layoutVertically();
    const a = side.addText(`${data.xp || 0} XP`);
    a.font = Font.boldRoundedSystemFont(14); a.textColor = Color.white(); a.rightAlignText();
    const b = side.addText(`覚えた ${data.knownCount || 0}/${data.total || 1351}`);
    b.font = Font.boldRoundedSystemFont(12); b.textColor = Color.white();
  }

  w.addSpacer(2);
  const m = w.addText(msg);
  m.font = Font.boldRoundedSystemFont(13);
  m.textColor = Color.white();
  m.shadowColor = new Color("#000000", 0.35); m.shadowRadius = 3; m.shadowOffset = new Point(0, 1);
  w.addSpacer();
  return w;
}

const widget = await build();
if (config.runsInWidget) Script.setWidget(widget);
else await widget.presentSmall();
Script.complete();
