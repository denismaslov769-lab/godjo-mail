import PostalMime from "postal-mime";

// ---------- helpers ----------
const esc = (s = "") =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function unauthorized() {
  return new Response("Требуется авторизация", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Godjo Mail", charset="UTF-8"' },
  });
}

function checkAuth(request, env) {
  const h = request.headers.get("Authorization") || "";
  if (!h.startsWith("Basic ")) return false;
  const [user, pass] = atob(h.slice(6)).split(":");
  return user === (env.ADMIN_USER || "admin") && pass === env.ADMIN_PASSWORD;
}

async function save(env, m) {
  await env.DB.prepare(
    "INSERT INTO messages (kind, sender, recipient, subject, body, html, received_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  )
    .bind(m.kind, m.sender || "", m.recipient || "", m.subject || "", m.body || "", m.html || "", new Date().toISOString())
    .run();
}

// ---------- UI ----------
const layout = (title, inner) => `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>
body{font-family:system-ui,Arial,sans-serif;max-width:900px;margin:0 auto;padding:16px;background:#0f1115;color:#e6e6e6}
a{color:#7aa2ff;text-decoration:none} h1{font-size:22px}
.tabs a{margin-right:12px;padding:6px 10px;border-radius:6px;background:#1b1f27}
.item{display:block;padding:12px;border-bottom:1px solid #2a2f3a;color:inherit}
.item:hover{background:#1b1f27}.meta{color:#9aa3b2;font-size:13px}
.badge{font-size:11px;padding:2px 6px;border-radius:4px;background:#2d3a5a;margin-right:6px}
.sms{background:#3a5a2d} pre{white-space:pre-wrap;word-break:break-word}
iframe{width:100%;min-height:500px;border:0;background:#fff;border-radius:6px}
</style></head><body><h1>📮 Godjo Mail</h1>${inner}</body></html>`;

async function listPage(env, kind) {
  const q = kind
    ? env.DB.prepare("SELECT id, kind, sender, recipient, subject, substr(body,1,140) AS preview, received_at FROM messages WHERE kind = ? ORDER BY id DESC LIMIT 200").bind(kind)
    : env.DB.prepare("SELECT id, kind, sender, recipient, subject, substr(body,1,140) AS preview, received_at FROM messages ORDER BY id DESC LIMIT 200");
  const { results } = await q.all();
  const rows = results
    .map(
      (r) => `<a class="item" href="/m/${r.id}">
<div><span class="badge ${r.kind === "sms" ? "sms" : ""}">${r.kind === "sms" ? "SMS" : "EMAIL"}</span><b>${esc(r.sender)}</b> → ${esc(r.recipient)}</div>
<div>${esc(r.subject || "(без темы)")}</div>
<div class="meta">${esc(r.preview)} · ${esc(r.received_at)}</div></a>`
    )
    .join("");
  return layout(
    "Входящие",
    `<div class="tabs"><a href="/">Все</a><a href="/?kind=email">Почта</a><a href="/?kind=sms">SMS</a></div>
${rows || '<p class="meta">Пока пусто.</p>'}`
  );
}

async function messagePage(env, id) {
  const r = await env.DB.prepare("SELECT * FROM messages WHERE id = ?").bind(id).first();
  if (!r) return null;
  const body = r.html
    ? `<iframe sandbox="" srcdoc="${esc(r.html)}"></iframe>`
    : `<pre>${esc(r.body)}</pre>`;
  return layout(
    r.subject || "Сообщение",
    `<p><a href="/">← Назад</a></p>
<p><b>От:</b> ${esc(r.sender)}<br><b>Кому:</b> ${esc(r.recipient)}<br><b>Тема:</b> ${esc(r.subject)}<br>
<span class="meta">${esc(r.received_at)}</span></p>${body}
<form method="post" action="/m/${r.id}/delete"><button>Удалить</button></form>`
  );
}

const html = (s, status = 200) => new Response(s, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });

// ---------- worker ----------
export default {
  // Входящая почта (Cloudflare Email Routing → этот Worker)
  async email(message, env) {
    const parsed = await new PostalMime().parse(message.raw);
    await save(env, {
      kind: "email",
      sender: parsed.from?.address || message.from,
      recipient: message.to,
      subject: parsed.subject,
      body: parsed.text || "",
      html: parsed.html || "",
    });
    // Необязательно: копия на ваш личный ящик (адрес должен быть подтверждён в Email Routing)
    if (env.FORWARD_TO) await message.forward(env.FORWARD_TO);
  },

  async fetch(request, env) {
    const url = new URL(request.url);

    // Вебхук для SMS (с Android-телефона через приложение-пересыльщик)
    if (url.pathname === "/api/sms" && request.method === "POST") {
      const token = url.searchParams.get("token") || request.headers.get("X-Token");
      if (!env.SMS_TOKEN || token !== env.SMS_TOKEN) return new Response("forbidden", { status: 403 });
      let data = {};
      const ct = request.headers.get("Content-Type") || "";
      if (ct.includes("json")) data = await request.json();
      else data = Object.fromEntries(await request.formData());
      const from = data.from || data.sender || data.phone || "unknown";
      const text = data.text || data.message || data.body || data.msg || "";
      await save(env, { kind: "sms", sender: from, recipient: data.to || data.sim || "phone", subject: "SMS", body: text });
      return Response.json({ ok: true });
    }

    if (!checkAuth(request, env)) return unauthorized();

    if (url.pathname === "/") return html(await listPage(env, url.searchParams.get("kind")));

    if (url.pathname === "/api/messages") {
      const { results } = await env.DB.prepare("SELECT * FROM messages ORDER BY id DESC LIMIT 100").all();
      return Response.json(results);
    }

    const m = url.pathname.match(/^\/m\/(\d+)(\/delete)?$/);
    if (m) {
      if (m[2] && request.method === "POST") {
        await env.DB.prepare("DELETE FROM messages WHERE id = ?").bind(m[1]).run();
        return Response.redirect(url.origin + "/", 303);
      }
      const page = await messagePage(env, m[1]);
      return page ? html(page) : html("Не найдено", 404);
    }

    return new Response("Not found", { status: 404 });
  },
};
