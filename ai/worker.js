// フレーズ1000「AIに聞く」中継サーバー（Cloudflare Workers 用）
// アプリから質問を受け取り、Gemini API に渡して答えを返します。
// Gemini の APIキーはこのコードには書きません。Cloudflare の「シークレット」GEMINI_API_KEY に保存します。

const ORIGIN = "https://tarou-web.github.io"; // このアプリ以外からは使えないようにする

export default {
  async fetch(req, env) {
    const cors = {
      "Access-Control-Allow-Origin": ORIGIN,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    const json = (obj, status = 200) =>
      new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });

    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    if (req.method === "GET") {
      // ブラウザで「…workers.dev/?test」を開くと、Gemini に実際に聞いてみた結果を表示します
      if (new URL(req.url).searchParams.has("test")) {
        if (!env.GEMINI_API_KEY) return json({ ok: false, error: "GEMINI_API_KEY が設定されていません" });
        const t0 = Date.now();
        const r = await askGemini(env, "あなたは親切なアシスタントです。", [{ role: "user", parts: [{ text: "「こんにちは」を英語で一言だけ" }] }]);
        return json({ ...r, ms: Date.now() - t0 });
      }
      return json({ ok: true, message: "フレーズ1000 AI サーバーは動いています" });
    }
    if (req.method !== "POST" || req.headers.get("Origin") !== ORIGIN) return json({ error: "forbidden" }, 403);
    if (!env.GEMINI_API_KEY) return json({ error: "GEMINI_API_KEY が設定されていません" }, 500);

    let body;
    try { body = await req.json(); } catch { return json({ error: "bad request" }, 400); }

    const msgs = (Array.isArray(body.messages) ? body.messages : []).slice(-12).map((m) => ({
      role: m.role === "model" ? "model" : "user",
      parts: [{ text: String(m.text || "").slice(0, 1500) }],
    }));
    if (!msgs.length) return json({ error: "質問がありません" }, 400);

    const card = body.card || {};
    const clip = (s) => String(s || "").slice(0, 300);
    const system =
      "あなたは英語学習アプリ「フレーズ1000」に住んでいるヨウム（灰色のオウム）のキャラクターです。" +
      "TOEICを勉強している日本人に、英語の単語やフレーズについて、日本語でやさしく、短く、正確に答えます。" +
      "例文を出すときは英語と日本語訳をセットにします。わからないことは推測で断定しません。" +
      `今学習しているカード → 英語：「${clip(card.en)}」 日本語：「${clip(card.jp)}」 単語メモ：「${clip(card.g)}」`;

    const r = await askGemini(env, system, msgs);
    if (r.error) return json({ error: r.error }, r.status || 500);
    const text = r.text;
    return json({ text: text || "（答えが空でした。もう一度聞いてみてください）" });
  },
};

async function askGemini(env, system, contents) {
  // 混んでいたり使えなかったりしたら、次のモデルで聞き直す
  const models = [env.MODEL || "gemini-3.8-flash", "gemini-flash-lite-latest", "gemini-flash-latest"];
  const t0 = Date.now();
  let last;
  for (const model of models) {
    for (const thinking of [{ thinkingLevel: "low" }, null]) {
      if (Date.now() - t0 > 24000) return last;
      last = await callGemini(env, model, system, contents, thinking);
      if (last.ok) return last;
      if (last.status === 400 && /thinking/i.test(last.error)) continue; // この設定が使えない → 設定なしで
      break; // 混雑・見つからない など → 次のモデルへ
    }
    if (last.status === 401 || last.status === 403) return last; // キーの問題はモデルを変えても同じ
  }
  return last;
}

async function callGemini(env, model, system, contents, thinking) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const generationConfig = { maxOutputTokens: 4000 };
    if (thinking) generationConfig.thinkingConfig = thinking;
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents, generationConfig }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { error: (j.error && j.error.message) || `Gemini エラー ${r.status}`, status: r.status, model };
    const text = ((j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [])
      .map((p) => p.text || "").join("");
    return { ok: true, text, model, thinking: thinking ? thinking.thinkingLevel : "default" };
  } catch (e) {
    return { error: e.name === "AbortError" ? "Gemini の返事が15秒以上なかったので中止しました" : String(e), status: 504, model };
  } finally {
    clearTimeout(timer);
  }
}
