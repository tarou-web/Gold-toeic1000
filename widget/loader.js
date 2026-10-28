// フレーズ1000 ウィジェット（Scriptable用）
// このコードは一度貼り付ければOKです。ウィジェットの中身は毎回インターネットから最新版を読み込みます。
// ウィジェットを長押し →「ウィジェットを編集」→ Parameter に、アプリの「あなたの合言葉」を貼り付けてください。

const SRC = "https://tarou-web.github.io/Gold-toeic1000/widget/phrase1000-widget.js";
const fm = FileManager.local();
const saved = fm.joinPath(fm.documentsDirectory(), "phrase1000-widget-main.js");

let code = null;
try {
  const req = new Request(`${SRC}?t=${Math.floor(Date.now() / 600000)}`);
  const text = await req.loadString();
  if (req.response && req.response.statusCode === 200 && text.includes("PHRASE1000_WIDGET")) {
    code = text;
    fm.writeString(saved, text);
  }
} catch (e) {}
if (!code && fm.fileExists(saved)) code = fm.readString(saved);   // 電波がないときは前回の版

if (code) {
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  await new AsyncFunction(code)();
} else {
  const w = new ListWidget();
  w.backgroundColor = new Color("#9aa3ad");
  const t = w.addText("読み込めませんでした。電波のある場所で開いてください");
  t.font = Font.boldRoundedSystemFont(12); t.textColor = Color.white();
  if (config.runsInWidget) Script.setWidget(w); else await w.presentSmall();
  Script.complete();
}
