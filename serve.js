// КАРАВАН — точка входа Deno Deploy
// 1) Сайт: index.html на "/", embed.html на "/embed.html"
// 2) Реле: "/relay.php" — точный контракт relay.php v2 (чтобы index.html v35 работал без патчей):
//    ?ping -> {ok:true} | ?u=<firebase url>&m=<method>, тело —payload
//    whitelist https://*.firebaseio.com, GET-кэш 3с, X-Relay-Cache: HIT/MISS
import indexHtml from "./index.html" with { type: "text" };
import embedHtml from "./embed.html" with { type: "text" };

var CACHE_TTL = 3000;
var cache = new Map(); // u -> {t, body} (in-memory, на изоляту)

var CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, If-Match",
  "Cache-Control": "no-store",
};

function json(obj, status, extra) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: Object.assign({ "Content-Type": "application/json" }, CORS, extra || {}),
  });
}

function raw(body, status, extra) {
  return new Response(body, {
    status: status || 200,
    headers: Object.assign({ "Content-Type": "application/json" }, CORS, extra || {}),
  });
}

function html(body, status) {
  return new Response(body, {
    status: status || 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

async function relay(req) {
  var url = new URL(req.url);
  if (url.searchParams.has("ping")) {
    return json({ ok: true, relay: "deno-v2", deno: Deno.version.deno });
  }
  var u = url.searchParams.get("u") || "";
  if (u.indexOf("https://") !== 0 || u.indexOf("firebaseio.com") === -1) {
    return json({ error: "bad url" }, 400);
  }
  var method = "GET";
  if (req.method === "POST") method = url.searchParams.get("m") || "PUT";
  if (["GET", "PUT", "POST", "DELETE", "PATCH"].indexOf(method) === -1) method = "GET";

  if (method === "GET") {
    var c = cache.get(u);
    if (c && Date.now() - c.t < CACHE_TTL) {
      return raw(c.body, 200, { "X-Relay-Cache": "HIT" });
    }
  }

  var body = null;
  if (method !== "GET") {
    body = await req.text();
  }

  try {
    var r = await fetch(u, {
      method: method,
      headers: { "Content-Type": "application/json" },
      body: body && body.length > 0 ? body : undefined,
      signal: AbortSignal.timeout(8000),
      redirect: "follow",
    });
    var text = await r.text();
    if (method === "GET" && r.status === 200) {
      cache.set(u, { t: Date.now(), body: text });
      if (cache.size > 500) {
        var now = Date.now();
        for (var k of cache.keys()) {
          var e = cache.get(k);
          if (!e || now - e.t > 60000) cache.delete(k);
        }
      }
    }
    return raw(text, r.status || 200, { "X-Relay-Cache": "MISS" });
  } catch (e) {
    return json({ error: "relay fail", detail: String(e && e.message || e) }, 502);
  }
}

Deno.serve(function (req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  var p = new URL(req.url).pathname;
  if (p === "/" || p === "/index.html") return html(indexHtml);
  if (p === "/embed.html" || p === "/embed") return html(embedHtml);
  if (p === "/relay.php") return relay(req);
  if (p === "/ping") return json({ ok: true, site: "karavan", deno: Deno.version.deno });
  return json({ error: "not found" }, 404);
});
