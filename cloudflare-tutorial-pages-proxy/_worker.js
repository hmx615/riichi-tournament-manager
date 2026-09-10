const tutorialHome = "/tutorials/one-shanten/initial";
const sessionCookieName = "xrc_tutorial_session";
const reviewers = {
  hmx: "何明轩",
  phq: "彭虹清",
  ezy: "鄂子懿",
  wdj: "吴东杰",
};
const reviewerAliases = {
  hmx: "hmx", "何明轩": "hmx", "何 明轩": "hmx",
  phq: "phq", "彭虹清": "phq", "彭 虹清": "phq",
  ezy: "ezy", "鄂子懿": "ezy", "鄂 子懿": "ezy",
  wdj: "wdj", "吴东杰": "wdj", "吴 东杰": "wdj",
};
const transitions = {
  initial_pass: ["pending_initial", "pending_secondary"],
  initial_reject: ["pending_initial", "rejected_initial"],
  secondary_pass: ["pending_secondary", "final"],
  secondary_reject: ["pending_secondary", "rejected_secondary"],
  return_initial: ["pending_secondary", "pending_initial"],
  restore_initial: ["rejected_initial", "pending_initial"],
  restore_secondary: ["rejected_secondary", "pending_secondary"],
  return_secondary: ["final", "pending_secondary"],
};

function redirectToTutorialHome(publicUrl) {
  return Response.redirect(new URL(tutorialHome, publicUrl.origin), 302);
}

function jsonResponse(body, status = 200) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

function decodeBase64Url(value) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(normalized);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function encodeBase64Url(value) {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function safeEqual(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

async function hmac(secret, payload) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
}

function cookieValue(request, name) {
  const cookie = request.headers.get("cookie") || "";
  for (const item of cookie.split(";")) {
    const [key, ...value] = item.trim().split("=");
    if (key === name) return value.join("=");
  }
  return null;
}

async function reviewerFromRequest(request, secret) {
  const token = cookieValue(request, sessionCookieName);
  if (!token || !secret) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return null;
  try {
    if (!safeEqual(decodeBase64Url(signature), await hmac(secret, payload))) return null;
    const data = JSON.parse(new TextDecoder().decode(decodeBase64Url(payload)));
    if (data.version !== 1 || data.role !== "tutorial-reviewer"
        || typeof data.reviewerId !== "string" || data.expiresAt <= Date.now()) return null;
    return reviewers[data.reviewerId] ? { id: data.reviewerId, name: reviewers[data.reviewerId] } : null;
  } catch {
    return null;
  }
}

async function verifyPassword(password, encoded, secret) {
  const [algorithm, salt, expected, extra] = (encoded || "").split("$");
  if (algorithm !== "hmac-sha256" || !salt || !expected || extra) return false;
  try {
    return safeEqual(decodeBase64Url(expected), await hmac(secret, `${salt}\u0000${password}`));
  } catch {
    return false;
  }
}

async function createSessionToken(secret, reviewerId) {
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const payload = encodeBase64Url(new TextEncoder().encode(JSON.stringify({
    version: 1, role: "tutorial-reviewer", reviewerId, expiresAt,
  })));
  return `${payload}.${encodeBase64Url(await hmac(secret, payload))}`;
}

function reviewerHash(env, reviewerId) {
  return {
    hmx: env.TUTORIAL_HMX_PASSWORD_HASH,
    phq: env.TUTORIAL_PHQ_PASSWORD_HASH,
    ezy: env.TUTORIAL_EZY_PASSWORD_HASH,
    wdj: env.TUTORIAL_WDJ_PASSWORD_HASH,
  }[reviewerId];
}

async function handleLogin(request, env) {
  let input;
  try { input = await request.json(); } catch { return jsonResponse({ error: "请输入账号和密码" }, 400); }
  if (typeof input.username !== "string" || typeof input.password !== "string") {
    return jsonResponse({ error: "请输入账号和密码" }, 400);
  }
  const normalized = input.username.trim().toLowerCase().replaceAll(" ", "");
  const reviewerId = Object.entries(reviewerAliases)
    .find(([alias]) => alias.toLowerCase().replaceAll(" ", "") === normalized)?.[1];
  if (!reviewerId || !await verifyPassword(input.password, reviewerHash(env, reviewerId), env.AUTH_SECRET)) {
    return jsonResponse({ error: "账号或密码错误" }, 401);
  }
  const token = await createSessionToken(env.AUTH_SECRET, reviewerId);
  return new Response(JSON.stringify({ reviewer: { id: reviewerId, displayName: reviewers[reviewerId] } }), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "set-cookie": `${sessionCookieName}=${token}; Path=/; Max-Age=604800; HttpOnly; Secure; SameSite=Lax`,
    },
  });
}

async function handleBootstrap(request, env) {
  const reviewer = await reviewerFromRequest(request, env.AUTH_SECRET);
  if (!reviewer) return jsonResponse({ error: "登录已失效，请重新登录" }, 401);
  const result = await env.TOURNAMENT_DB.prepare(
    "SELECT document, version FROM tutorial_case_states ORDER BY id",
  ).all();
  return jsonResponse({
    reviewer: { id: reviewer.id, displayName: reviewer.name },
    states: result.results.map((row) => ({ ...JSON.parse(row.document), version: row.version })),
  });
}

function handleLogout() {
  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "set-cookie": `${sessionCookieName}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
    },
  });
}

function initialState(id) {
  return { id, status: "pending_initial", version: 0, note: "", updatedAt: null, history: [] };
}

function isReplay(state, expectedVersion, action, reviewerId) {
  if (state.version !== expectedVersion + 1) return false;
  const last = state.history.at(-1);
  return last?.action === action && last?.reviewerId === reviewerId;
}

async function handleTutorialReview(request, env, caseId) {
  const reviewer = await reviewerFromRequest(request, env.AUTH_SECRET);
  if (!reviewer) return jsonResponse({ error: "登录已失效，请重新登录" }, 401);
  if (!/^SRC-\d+-[ES]\d+-[ESWN]-T\d+$/.test(caseId)) return jsonResponse({ error: "牌例不存在" }, 404);

  let input;
  try {
    input = await request.json();
  } catch {
    return jsonResponse({ error: "请求数据格式无效" }, 400);
  }
  const transition = transitions[input.action];
  if (!transition || !Number.isInteger(input.expectedVersion) || input.expectedVersion < 0
      || typeof input.note !== "string" || input.note.length > 500) {
    return jsonResponse({ error: "请求数据格式无效" }, 400);
  }

  const row = await env.TOURNAMENT_DB.prepare(
    "SELECT document, version FROM tutorial_case_states WHERE id = ?",
  ).bind(caseId).first();
  const current = row
    ? { ...JSON.parse(row.document), version: row.version }
    : initialState(caseId);
  if (current.version !== input.expectedVersion) {
    return isReplay(current, input.expectedVersion, input.action, reviewer.id)
      ? jsonResponse({ state: current, replayed: true })
      : jsonResponse({ error: "牌例状态已被其他人更新" }, 409);
  }
  if (current.status !== transition[0]) return jsonResponse({ error: "牌例状态已变化，请刷新后重试" }, 409);

  if (input.action === "secondary_pass" || input.action === "secondary_reject") {
    const initialReviewer = [...current.history].reverse()
      .find((event) => event.action === "initial_pass")?.reviewerId;
    if (!initialReviewer) return jsonResponse({ error: "找不到该牌例的初筛通过记录" }, 400);
    if (initialReviewer === reviewer.id) return jsonResponse({ error: "复筛必须由另一位管理员完成" }, 400);
  }

  const now = new Date().toISOString();
  const note = input.note.trim().slice(0, 500);
  const next = {
    ...current,
    status: transition[1],
    version: input.expectedVersion + 1,
    note,
    updatedAt: now,
    history: [...current.history, {
      id: crypto.randomUUID(), reviewerId: reviewer.id, reviewerName: reviewer.name,
      action: input.action, fromStatus: current.status, toStatus: transition[1], note, createdAt: now,
    }],
  };
  const serialized = JSON.stringify(next);
  const result = input.expectedVersion === 0
    ? await env.TOURNAMENT_DB.prepare(
      "INSERT INTO tutorial_case_states (id, document, version, created_at, updated_at) VALUES (?, ?, 1, ?, ?) ON CONFLICT(id) DO NOTHING",
    ).bind(caseId, serialized, now, now).run()
    : await env.TOURNAMENT_DB.prepare(
      "UPDATE tutorial_case_states SET document = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?",
    ).bind(serialized, now, caseId, input.expectedVersion).run();
  if (!result.success || result.meta.changes !== 1) {
    const latestRow = await env.TOURNAMENT_DB.prepare(
      "SELECT document, version FROM tutorial_case_states WHERE id = ?",
    ).bind(caseId).first();
    const latest = latestRow ? { ...JSON.parse(latestRow.document), version: latestRow.version } : null;
    return latest && isReplay(latest, input.expectedVersion, input.action, reviewer.id)
      ? jsonResponse({ state: latest, replayed: true })
      : jsonResponse({ error: "牌例状态已被其他人更新" }, 409);
  }
  return jsonResponse({ state: next });
}

export default {
  async fetch(request, env) {
    const publicUrl = new URL(request.url);
    if (publicUrl.pathname === "/") return redirectToTutorialHome(publicUrl);
    if (request.method === "POST" && publicUrl.pathname === "/tutorial-api/login") return handleLogin(request, env);
    if (request.method === "POST" && publicUrl.pathname === "/tutorial-api/logout") return handleLogout();
    if (request.method === "GET" && publicUrl.pathname === "/tutorial-api/bootstrap") return handleBootstrap(request, env);
    if (request.method === "POST" && publicUrl.pathname.startsWith("/api/tutorial-reviews/")) {
      const caseId = decodeURIComponent(publicUrl.pathname.slice("/api/tutorial-reviews/".length));
      return handleTutorialReview(request, env, caseId);
    }
    if (request.method === "GET" || request.method === "HEAD") {
      if (publicUrl.pathname.startsWith("/assets/") || publicUrl.pathname.startsWith("/mahjong-tiles/")
          || publicUrl.pathname.startsWith("/tutorial/")) return env.ASSETS.fetch(request);
      if (publicUrl.pathname === "/tutorials" || publicUrl.pathname.startsWith("/tutorials/")) {
        const indexUrl = new URL("/", publicUrl.origin);
        return env.ASSETS.fetch(new Request(indexUrl, request));
      }
    }
    return redirectToTutorialHome(publicUrl);
  },
};
