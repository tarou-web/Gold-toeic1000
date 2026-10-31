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
    if (req.method === "GET") return json({ ok: true, message: "フレーズ1000 AI サーバーは動いています" });
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

    const model = env.MODEL || "gemini-flash-latest";
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: msgs,
        generationConfig: { maxOutputTokens: 800, temperature: 0.6 },
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return json({ error: (j.error && j.error.message) || "Gemini からエラーが返りました" }, r.status);
    const text = ((j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [])
      .map((p) => p.text || "").join("");
    return json({ text: text || "（答えが空でした。もう一度聞いてみてください）" });
  },
};
