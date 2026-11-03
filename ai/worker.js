// フレーズ1000「AIに聞く」中継サーバー（Cloudflare Workers 用）
// アプリから質問を受け取り、AI に渡して答えを返します。
// 1. Gemini → 2. Groq → 3. Cloudflare Workers AI の順に聞き、答えが返ってきたところで止めます。
// 鍵はこのコードには書きません。Cloudflare の設定に保存します：
//   シークレット GEMINI_API_KEY（Gemini） / シークレット GROQ_API_KEY（Groq） / バインディング AI（Workers AI）
//   （なくても動く）KV バインディング KV … 答えの保存と、1日の回数の上限に使います

const ORIGIN = "https://tarou-web.github.io"; // このアプリ以外からは使えないようにする
// 1日に使える回数（同じネットにつながっている人ごと）。保存した答えを返したときは数えない
const LIMIT_ASK = 30;
const LIMIT_PHOTO = 10;
const ANSWER_DAYS = 60; // 保存した答えを使う日数

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

    const ip = req.headers.get("CF-Connecting-IP") || "?";

    // 写真から単語帳のカードを読み取る
    if (body.type === "photo") {
      if (await overLimit(env, "photo", ip, LIMIT_PHOTO)) return json({ error: `写真の読み取りは1日${LIMIT_PHOTO}回までです。明日また使ってね`, limit: true }, 429);
      const image = String(body.image || "");
      if (!image || image.length > 6_000_000) return json({ error: "写真が大きすぎるか、ありません" }, 400);
      const mime = /^image\/(jpeg|png|webp)$/.test(body.mime) ? body.mime : "image/jpeg";
      const r = await photoCards(env, image, mime, Date.now() + 45000);
      if (r.ok) await countUse(env, "photo", ip);
      return r.ok ? json({ cards: r.cards, provider: r.provider, model: r.model }) : json({ error: r.error }, r.status || 500);
    }

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

    // 最初の質問（会話の続きでないもの）は、前にだれかが同じカードで聞いた答えを返す
    const single = msgs.length === 1;
    const aKey = single ? "ans:" + (await sha(`${card.en || ""}\n${card.jp || ""}\n${msgs[0].text.trim()}`)) : null;
    if (aKey && env.KV) {
      const hit = await env.KV.get(aKey, "json").catch(() => null);
      if (hit && hit.text) return json({ ...hit, cached: true, tried: [] });
    }
    if (await overLimit(env, "ask", ip, LIMIT_ASK)) return json({ error: `AIに聞けるのは1日${LIMIT_ASK}回までです。明日また聞いてね`, limit: true }, 429);
    const done = async (out) => {
      await countUse(env, "ask", ip);
      if (aKey && env.KV) await env.KV.put(aKey, JSON.stringify({ text: out.text, provider: out.provider, model: out.model }), { expirationTtl: ANSWER_DAYS * 86400 }).catch(() => {});
      return json(out);
    };

    // 全体で 30 秒以内に答えを返す
    const deadline = Date.now() + 30000;
    const tried = [];
    const note = (name, r) => { if (!r.skip) tried.push(`${name}: ${r.status || "?"}`); return r; };
    const ok = (r) => r && r.ok && r.text;

    // Gemini を先に聞き、5秒たっても返事がなければ Groq にも同時に聞いて、先に答えたほうを使う
    const pG = gemini(env, system, msgs, deadline).then((r) => ({ name: "gemini", r }));
    let first = await Promise.race([pG, sleep(5000).then(() => null)]);
    if (first && ok(first.r)) return done({ text: first.r.text, provider: "gemini", model: first.r.model, tried });
    if (first) note("gemini", first.r);

    const pQ = groq(env, system, msgs, deadline).then((r) => ({ name: "groq", r }));
    const pending = first ? [pQ] : [pG, pQ];
    while (pending.length) {
      const fin = await Promise.race(pending.map((p, i) => p.then((v) => ({ v, i }))));
      pending.splice(fin.i, 1);
      if (ok(fin.v.r)) return done({ text: fin.v.r.text, provider: fin.v.name, model: fin.v.r.model, tried });
      note(fin.v.name, fin.v.r);
    }

    // どちらもだめなら Workers AI
    const w = await workersAI(env, system, msgs, deadline);
    if (ok(w)) return done({ text: w.text, provider: "workersAI", model: w.model, tried });
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

// ---------- 写真の読み取り ----------
const PHOTO_PROMPT =
  "この写真は英語の単語帳・教科書・プリント・メモなどです。写っている英単語や英語のフレーズと、その日本語の意味を組にして読み取ってください。" +
  "写真に日本語の意味が書いてあればそれを使い、書いていなければ TOEIC でよく使う意味を短く補ってください。" +
  "英語は写真のとおりに書き、番号・記号・発音記号・品詞の記号は入れません。例文だけの行や、ページ番号・見出しは入れません。" +
  "最大100組まで。英語が見つからなければ空の配列にします。" +
  '答えは JSON だけで、形は {"cards":[{"en":"英語","jp":"日本語"}]} です。';

async function photoCards(env, image, mime, deadline) {
  const tidy = (list) => {
    const seen = new Set(), out = [];
    for (const c of Array.isArray(list) ? list : []) {
      const en = String((c && c.en) || "").trim().slice(0, 200), jp = String((c && c.jp) || "").trim().slice(0, 200);
      const k = en.toLowerCase();
      if (!en || !jp || seen.has(k)) continue;
      seen.add(k); out.push({ en, jp });
      if (out.length >= 100) break;
    }
    return out;
  };
  const parse = (t) => {
    t = String(t || "").replace(/^```(json)?|```$/gm, "").trim();
    const i = t.indexOf("{"), j = t.lastIndexOf("}");
    try { const d = JSON.parse(i >= 0 ? t.slice(i, j + 1) : t); return tidy(d.cards || d); } catch { return null; }
  };
  let last = { error: "写真を読み取れる AI がありませんでした", status: 503 };

  // 1. Gemini（写真が得意）
  if (env.GEMINI_API_KEY) {
    for (const model of ["gemini-flash-lite-latest", "gemini-flash-latest"]) {
      if (cooling(model)) continue;
      const r = await post(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        { "x-goog-api-key": env.GEMINI_API_KEY },
        {
          contents: [{ role: "user", parts: [{ inline_data: { mime_type: mime, data: image } }, { text: PHOTO_PROMPT }] }],
          generationConfig: { maxOutputTokens: 8000, responseMimeType: "application/json", thinkingConfig: { thinkingLevel: "low" } },
        },
        timeLeft(deadline, 30000),
      );
      cool(model, r);
      if (r.ok) {
        const parts = (r.data.candidates && r.data.candidates[0] && r.data.candidates[0].content && r.data.candidates[0].content.parts) || [];
        const cards = parse(parts.map((p) => p.text || "").join(""));
        if (cards) return { ok: true, cards, provider: "gemini", model };
        last = { error: "読み取った結果の形がおかしかったです", status: 502 };
      } else last = r;
      if (r.status === 401 || r.status === 403) break;
      if (Date.now() > deadline - 15000) break;
    }
  }
  // 2. Groq（写真も読めるモデル）
  if (env.GROQ_API_KEY && Date.now() < deadline - 5000) {
    const model = "meta-llama/llama-4-scout-17b-16e-instruct";
    if (!cooling(model)) {
      const r = await post(
        "https://api.groq.com/openai/v1/chat/completions",
        { Authorization: `Bearer ${env.GROQ_API_KEY}` },
        {
          model, max_tokens: 4000, temperature: 0.2, response_format: { type: "json_object" },
          messages: [{ role: "user", content: [{ type: "text", text: PHOTO_PROMPT }, { type: "image_url", image_url: { url: `data:${mime};base64,${image}` } }] }],
        },
        timeLeft(deadline, 25000),
      );
      cool(model, r);
      if (r.ok) {
        const cards = parse(chatText(r.data));
        if (cards) return { ok: true, cards, provider: "groq", model };
      } else last = r;
    }
  }
  return last;
}

// ---------- 1日の回数（KV があるときだけ） ----------
// 日本時間の日付で数え、2日たったら自動で消える
const dayJST = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
async function useKey(kind, ip) { return `use:${dayJST()}:${kind}:${(await sha(ip)).slice(0, 16)}`; }
async function overLimit(env, kind, ip, max) {
  if (!env.KV) return false;
  const n = +(await env.KV.get(await useKey(kind, ip)).catch(() => 0)) || 0;
  return n >= max;
}
async function countUse(env, kind, ip) {
  if (!env.KV) return;
  try {
    const k = await useKey(kind, ip);
    const n = +(await env.KV.get(k)) || 0;
    await env.KV.put(k, String(n + 1), { expirationTtl: 2 * 86400 });
  } catch {}
}
async function sha(t) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
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
