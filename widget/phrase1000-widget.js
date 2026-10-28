// PHRASE1000_WIDGET
// フレーズ1000 連続記録ウィジェット（Scriptable用）の本体です。
// iPhoneのScriptableには loader.js を貼り付けます。ローダーが毎回このファイルを読み込むので、
// ここを更新すればウィジェットも自動で新しくなります。

const KEY = (args.widgetParameter || "").trim();
const DB = "https://phrase1000-default-rtdb.asia-southeast1.firebasedatabase.app";
const BASE = "https://tarou-web.github.io/Gold-toeic1000/widget/art/";
const APP = "https://tarou-web.github.io/Gold-toeic1000/";
const ART_VERSION = 2;

// 悲しいとき（今日まだ勉強していない）と、嬉しいとき（今日の勉強が済んだ）の絵
const SAD = {
  zero:    [1, 2, 3],     // 連続記録が途切れた
  pending: [5, 7],        // 昼間、まだ今日の分をしていない
  late:    [4, 6, 8],     // 夜8時を過ぎてもまだ
};
const HAPPY_COUNT = 12;
const CHANGE_EVERY_DAYS = 2;  // 絵が入れ替わる間隔

const MSG = {
  zero:    ["また始めよう", "今日から再スタート！", "フレーズが待ってるよ"],
  pending: ["今日の分はまだだよ", "そろそろ勉強の時間！", "1枚だけでもやろう"],
  late:    ["今日が終わっちゃう！", "連続記録がピンチ！", "急いで〜！"],
  happy:   ["その調子！", "今日もクリア！", "いいペース！", "すごい！", "継続は力なり", "また明日ね！"],
  error:   ["記録を読み込めません"],
};

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
    return fm.fileExists(cache) ? JSON.parse(fm.readString(cache)) : null;
  }
}

async function loadArt(name) {
  const path = fm.joinPath(cacheDir, `${name}-v${ART_VERSION}.jpg`);
  if (fm.fileExists(path)) return fm.readImage(path);
  try {
    const img = await new Request(`${BASE}${name}.jpg`).loadImage();
    fm.writeImage(path, img);
    return img;
  } catch (e) { return null; }
}

function shadow(t) {
  t.shadowColor = new Color("#000000", 0.4);
  t.shadowRadius = 4;
  t.shadowOffset = new Point(0, 1);
}

async function build() {
  const w = new ListWidget();
  w.url = APP;
  w.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);
  w.setPadding(14, 10, 10, 10);

  if (!KEY) {
    w.backgroundColor = new Color("#9aa3ad");
    const t = w.addText("合言葉を設定してください");
    t.font = Font.boldRoundedSystemFont(14); t.textColor = Color.white(); t.centerAlignText();
    w.addSpacer(4);
    const s = w.addText("長押し →「ウィジェットを編集」→ Parameter に貼り付け");
    s.font = Font.systemFont(10); s.textColor = Color.white(); s.centerAlignText();
    return w;
  }

  const data = await loadProgress();
  const now = new Date();
  const y = new Date(now); y.setDate(now.getDate() - 1);
  const last = data ? data.last : "";
  const alive = last === dkey(now) || last === dkey(y);
  const streak = alive ? (data.streak || 0) : 0;
  const doneToday = last === dkey(now);

  const dayNum = Math.floor((now.getTime() - now.getTimezoneOffset() * 60000) / 86400000);
  const slot = Math.floor(dayNum / CHANGE_EVERY_DAYS);

  let mood, art;
  if (!data) { mood = "error"; art = `sad-${SAD.pending[slot % SAD.pending.length]}`; }
  else if (doneToday) { mood = "happy"; art = `happy-${(slot % HAPPY_COUNT) + 1}`; }
  else if (streak === 0) { mood = "zero"; art = `sad-${SAD.zero[slot % SAD.zero.length]}`; }
  else if (now.getHours() >= 20) { mood = "late"; art = `sad-${SAD.late[slot % SAD.late.length]}`; }
  else { mood = "pending"; art = `sad-${SAD.pending[slot % SAD.pending.length]}`; }
  const msgs = MSG[mood];
  const msg = msgs[dayNum % msgs.length];
  const lit = mood === "happy";

  const img = await loadArt(art);
  if (img) w.backgroundImage = img; else w.backgroundColor = new Color("#9aa3ad");

  // 炎 ＋ 連続日数（中央）
  const row = w.addStack();
  row.layoutHorizontally();
  row.addSpacer();
  const fl = SFSymbol.named("flame.fill");
  fl.applyFont(Font.heavySystemFont(28));
  const fi = row.addImage(fl.image);
  fi.imageSize = new Size(28, 28);
  fi.tintColor = lit ? new Color("#ff9600") : new Color("#e6e6ee");
  if (!lit) {
    // 今日まだのときは、炎に赤い「!」をつける
    const ex = SFSymbol.named("exclamationmark.circle.fill");
    ex.applyFont(Font.heavySystemFont(12));
    const ei = row.addImage(ex.image);
    ei.imageSize = new Size(12, 12);
    ei.tintColor = new Color("#ff4b4b");
  }
  row.addSpacer(4);
  const num = row.addText(String(streak));
  num.font = Font.heavyRoundedSystemFont(32);
  num.textColor = lit ? new Color("#ff9600") : new Color("#f2f2f7");
  num.minimumScaleFactor = 0.6;
  shadow(num);
  row.addSpacer();

  // ひとこと（中央）
  w.addSpacer(2);
  const mr = w.addStack();
  mr.addSpacer();
  const m = mr.addText(msg);
  m.font = Font.boldRoundedSystemFont(14);
  m.textColor = Color.white();
  m.lineLimit = 1;
  m.minimumScaleFactor = 0.7;
  shadow(m);
  mr.addSpacer();

  if (config.widgetFamily === "medium" && data) {
    w.addSpacer(2);
    const sr = w.addStack();
    sr.addSpacer();
    const s = sr.addText(`${data.xp || 0} XP ・ 覚えた ${data.knownCount || 0}/${data.total || 1351}`);
    s.font = Font.boldRoundedSystemFont(11);
    s.textColor = new Color("#ffffff", 0.9);
    shadow(s);
    sr.addSpacer();
  }

  w.addSpacer();
  return w;
}

const widget = await build();
if (config.runsInWidget) Script.setWidget(widget);
else await widget.presentSmall();
Script.complete();
