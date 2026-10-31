// フレーズ1000「AIに聞く」中継サーバー（Cloudflare Workers 用）
// アプリから質問を受け取り、AI に渡して答えを返します。
// 1. Gemini → 2. Groq → 3. Cloudflare Workers AI の順に聞き、答えが返ってきたところで止めます。
// 鍵はこのコードには書きません。Cloudflare の設定に保存します：
//   シークレット GEMINI_API_KEY（Gemini） / シークレット GROQ_API_KEY（Groq） / バインディング AI（Workers AI）

const ORIGIN = "https://tarou-web.github.io"; // このアプリ以外からは使えないようにする

export default {
  async fetch(req, env) {
    const cors = {
      "Access-Control-Allow-Origin": ORIGIN,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    const json = (obj, status = 200) =>
      new Response(JSON.stringify(obj, null, 1), { status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8" } });

    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    if (req.method === "GET") {
      // ブラウザで「…workers.dev/?test」を開くと、3つの AI それぞれに実際に聞いてみた結果を表示します
      if (new URL(req.url).searchParams.has("test")) {
        const sys = "あなたは親切なアシスタントです。";
        const msgs = [{ role: "user", text: "「こんにちは」を英語で一言だけ" }];
        const out = {};
        for (const [name, fn] of Object.entries(PROVIDERS)) {
          const t0 = Date.now();
          const r = await fn(env, sys, msgs, Date.now() + 20000);
          out[name] = { ...r, ms: Date.now() - t0 };
        }
        return json(out);
      }
      return json({ ok: true, message: "フレーズ1000 AI サーバーは動いています" });
    }
    if (req.method !== "POST" || req.headers.get("Origin") !== ORIGIN) return json({ error: "forbidden" }, 403);

    let body;
    try { body = await req.json(); } catch { return json({ error: "bad request" }, 400); }

    const msgs = (Array.isArray(body.messages) ? body.messages : []).slice(-12).map((m) => ({
      role: m.role === "model" ? "model" : "user",
      text: String(m.text || "").slice(0, 1500),
    }));
    if (!msgs.length) return json({ error: "質問がありません" }, 400);

    const card = body.card || {};
    const clip = (s) => String(s || "").slice(0, 300);
    const system =
      "あなたは英語学習アプリ「フレーズ1000」に住んでいるヨウム（灰色のオウム）のキャラクターです。" +
      "TOEICを勉強している日本人に、英語の単語やフレーズについて、日本語でやさしく、短く、正確に答えます。" +
      "例文を出すときは英語と日本語訳をセットにします。わからないことは推測で断定しません。" +
      "スマホの小さな吹き出しに表示するので、表（|で区切る形）やHTMLタグは使わず、短い見出しと「- 」の箇条書きで書きます。絵文字は使いすぎません。" +
      `今学習しているカード → 英語：「${clip(card.en)}」 日本語：「${clip(card.jp)}」 単語メモ：「${clip(card.g)}」`;

    // 全体で 30 秒以内に答えを返す
    const deadline = Date.now() + 30000;
    const tried = [];
    const note = (name, r) => { if (!r.skip) tried.push(`${name}: ${r.status || "?"}`); return r; };
    const ok = (r) => r && r.ok && r.text;

    // Gemini を先に聞き、5秒たっても返事がなければ Groq にも同時に聞いて、先に答えたほうを使う
    const pG = gemini(env, system, msgs, deadline).then((r) => ({ name: "gemini", r }));
    let first = await Promise.race([pG, sleep(5000).then(() => null)]);
    if (first && ok(first.r)) return json({ text: first.r.text, provider: "gemini", model: first.r.model, tried });
    if (first) note("gemini", first.r);

    const pQ = groq(env, system, msgs, deadline).then((r) => ({ name: "groq", r }));
    const pending = first ? [pQ] : [pG, pQ];
    while (pending.length) {
      const done = await Promise.race(pending.map((p, i) => p.then((v) => ({ v, i }))));
      pending.splice(done.i, 1);
      if (ok(done.v.r)) return json({ text: done.v.r.text, provider: done.v.name, model: done.v.r.model, tried });
      note(done.v.name, done.v.r);
    }

    // どちらもだめなら Workers AI
    const w = await workersAI(env, system, msgs, deadline);
    if (ok(w)) return json({ text: w.text, provider: "workersAI", model: w.model, tried });
    note("workersAI", w);
    const last = w.skip ? { error: "答えられる AI がありませんでした", status: 503 } : w;
    return json({ error: last.error, tried }, last.status || 500);
  },
};

// ---------- 3 つの AI ----------
// 回数制限（429）や混雑（503）が返ったら、しばらくそのモデルを飛ばして、待ち時間を減らす
const COOL = new Map();
const cooling = (key) => (COOL.get(key) || 0) > Date.now();
const cool = (key, r) => { if (r && (r.status === 429 || r.status === 503 || r.status === 504)) COOL.set(key, Date.now() + (r.status === 429 ? 10 * 60000 : 60000)); };
const PROVIDERS = { gemini, groq, workersAI };

// 1. Gemini（Google）
async function gemini(env, system, msgs, deadline) {
  if (!env.GEMINI_API_KEY) return { skip: true, error: "GEMINI_API_KEY がありません" };
  const contents = msgs.map((m) => ({ role: m.role, parts: [{ text: m.text }] }));
  let last;
  // Flash Lite は1日500回。ほかの Gemini は1日20回しかないので使わない
  for (const model of ["gemini-flash-lite-latest"]) {
    if (cooling(model)) { last = { error: "しばらく休み中", status: 429, model }; continue; }
    for (const thinking of [{ thinkingLevel: "low" }, null]) {
      const generationConfig = { maxOutputTokens: 4000 };
      if (thinking) generationConfig.thinkingConfig = thinking;
      last = await post(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        { "x-goog-api-key": env.GEMINI_API_KEY },
        { systemInstruction: { parts: [{ text: system }] }, contents, generationConfig },
        timeLeft(deadline, 20000),
      );
      last.model = model;
      cool(model, last);
      if (last.ok) {
        const parts = (last.data.candidates && last.data.candidates[0] && last.data.candidates[0].content && last.data.candidates[0].content.parts) || [];
        return { ok: true, text: parts.map((p) => p.text || "").join(""), model };
      }
      if (last.status === 400 && /thinking/i.test(last.error)) continue; // この設定が使えない → 設定なしで
      break;
    }
    if (last.status === 401 || last.status === 403) break; // キーの問題はモデルを変えても同じ
    if (Date.now() > deadline - 20000) break;               // Groq と Workers AI の時間を残す
  }
  return last;
}

// 2. Groq（OpenAI と同じ形の API）
async function groq(env, system, msgs, deadline) {
  if (!env.GROQ_API_KEY) return { skip: true, error: "GROQ_API_KEY がありません" };
  const messages = toChat(system, msgs);
  let last;
  for (const model of ["openai/gpt-oss-120b", "qwen/qwen3.8-27b", "llama-3.3-70b-versatile"]) {
    if (cooling(model)) { last = { error: "しばらく休み中", status: 429, model }; continue; }
    const body = { model, messages, max_tokens: 2000, temperature: 0.6 };
    if (model.startsWith("openai/")) body.reasoning_effort = "low";
    last = await post("https://api.groq.com/openai/v1/chat/completions", { Authorization: `Bearer ${env.GROQ_API_KEY}` }, body, timeLeft(deadline, 10000));
    last.model = model;
    cool(model, last);
    if (last.ok) return { ok: true, text: chatText(last.data), model };
    if (last.status === 401 || last.status === 403) break;
    if (Date.now() > deadline - 8000) break; // Workers AI の時間を残す
  }
  return last;
}

// 3. Cloudflare Workers AI（キー不要。バインディング「AI」が必要）
async function workersAI(env, system, msgs, deadline) {
  if (!env.AI) return { skip: true, error: "バインディング AI がありません" };
  const messages = toChat(system, msgs);
  let last = { error: "Workers AI から答えがありませんでした", status: 500 };
  for (const model of ["@cf/qwen/qwen3.8-27b", "@cf/openai/gpt-oss-20b"]) {
    if (Date.now() > deadline - 1500) break;
    try {
      const r = await Promise.race([
        env.AI.run(model, { messages, max_tokens: 2000 }),
        new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), timeLeft(deadline, 12000))),
      ]);
      const text = (r && (r.response || chatText(r) || (r.result && r.result.response))) || "";
      if (text) return { ok: true, text: String(text), model };
      last = { error: "Workers AI の答えが空でした", status: 502, model };
    } catch (e) {
      last = { error: String(e.message || e), status: 502, model };
    }
  }
  return last;
}

// ---------- 共通の部品 ----------
function toChat(system, msgs) {
  return [{ role: "system", content: system }, ...msgs.map((m) => ({ role: m.role === "model" ? "assistant" : "user", content: m.text }))];
}
function chatText(d) {
  return (d && d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || "";
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function timeLeft(deadline, max) {
  return Math.max(1000, Math.min(max, deadline - Date.now()));
}
async function post(url, headers, body, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { method: "POST", signal: ctrl.signal, headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return { error: (data.error && (data.error.message || data.error)) || `エラー ${r.status}`, status: r.status };
    return { ok: true, data };
  } catch (e) {
    return { error: e.name === "AbortError" ? "返事が遅いので中止しました" : String(e), status: 504 };
  } finally {
    clearTimeout(timer);
  }
}
