/**
 * dsh-plugin-session-emoji — host half.
 *
 * Persists a per-session emoji map as one readable JSON file under
 * `$DSH_HOME/storages/session-emoji.json` (same user-data area the workspace
 * controller uses) and exposes it to the browser over one exact Fetch route
 * on the shared authenticated `/api` channel:
 *
 *   GET  /api/session-emoji  → { emojis: { [sessionId]: emoji } }
 *   POST /api/session-emoji  → body { sessionId, emoji: string | null }
 *
 * POST bodies with `emoji: null` clear the mapping. Every mutation replies
 * with the whole map so the client can stay consistent without a second read.
 * Requests reach this route only after the connection package's trust fence
 * (Host/Origin checks) and browser-cookie authentication, which wrap every
 * `/api` dispatch; the route itself adds input validation.
 *
 * The browser roster half (`dsh.client` in package.json) renders the emoji and
 * owns the context-menu interaction; nothing here touches sessions, agents, or
 * model-facing surfaces.
 */

import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/** Loader-visible plugin name. */
const name = "session-emoji";

/** Services this plugin needs resolved before `apply` runs. */
const inject = ["connection"];

/** Exact Fetch route path under the shared authenticated /api channel. */
export const SESSION_EMOJI_PATH = "/api/session-emoji";

/** Upper bound for the stored map; a hard safety valve, not a quota system. */
const MAX_ENTRIES = 5000;

/** Upper bound for one emoji string (emoji with ZWJ sequences stay small). */
const MAX_EMOJI_LENGTH = 64;

/** Upper bound for one session id string. */
const MAX_SESSION_ID_LENGTH = 200;

/**
 * Resolve the dsh home directory the same way the harness does:
 * explicit `$DSH_HOME` wins, else `~/.dsh`. Blank env values are ignored.
 * @returns absolute home directory path.
 */
function resolveDshHome() {
	const env = process.env.DSH_HOME;
	if (env !== undefined && env.trim() !== "") return env.trim();
	return join(homedir(), ".dsh");
}

/** Absolute path of the emoji map file. */
function storeFilePath() {
	return join(resolveDshHome(), "storages", "session-emoji.json");
}

/**
 * Read the emoji map from disk. A missing file is an empty map; a malformed
 * file is reported as an error rather than silently reset, so a user can
 * inspect and repair the JSON instead of losing it.
 * @returns the parsed `{ [sessionId]: emoji }` map.
 */
async function loadMap() {
	const path = storeFilePath();
	let text;
	try {
		text = await fs.readFile(path, "utf8");
	} catch (error) {
		if (error !== null && typeof error === "object" && error.code === "ENOENT") return {};
		throw error;
	}
	const parsed = JSON.parse(text);
	if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
		throw new Error(`session-emoji: store at ${path} is not a JSON object`);
	}
	const map = {};
	for (const [key, value] of Object.entries(parsed)) {
		if (typeof key === "string" && typeof value === "string") map[key] = value;
	}
	return map;
}

/**
 * Persist the emoji map atomically: write a temp file in the same directory,
 * then rename over the target. The directory is created 0o700 on demand.
 * @param map - the complete `{ [sessionId]: emoji }` map.
 */
async function saveMap(map) {
	const path = storeFilePath();
	await fs.mkdir(dirname(path), { recursive: true, mode: 0o700 });
	const temp = `${path}.tmp-${process.pid}-${Date.now()}`;
	await fs.writeFile(temp, `${JSON.stringify(map, null, "\t")}\n`, { encoding: "utf8", mode: 0o600 });
	await fs.rename(temp, path);
}

/**
 * Validate one string field.
 * @returns an error message, or undefined when the value is acceptable.
 */
function validateField(value, label, maxLength) {
	if (typeof value !== "string" || value.length === 0) return `${label} must be a non-empty string`;
	if (value.length > maxLength) return `${label} exceeds ${maxLength} characters`;
	return undefined;
}

/**
 * Validate one emoji value: either null (clear) or a short printable string.
 * @returns an error message, or undefined when the value is acceptable.
 */
function validateEmoji(value) {
	if (value === null) return undefined;
	if (typeof value !== "string" || value.length === 0) return "emoji must be a non-empty string or null";
	if (value.length > MAX_EMOJI_LENGTH) return `emoji exceeds ${MAX_EMOJI_LENGTH} characters`;
	// Reject control characters; everything printable (emoji, keycaps, flags) passes.
	if (/[\u0000-\u001f\u007f]/.test(value)) return "emoji contains control characters";
	return undefined;
}

/** JSON response helper with no-store caching. */
function jsonResponse(body, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
	});
}

/**
 * Mutation queue: serializes POST read-modify-write cycles so concurrent
 * browser requests cannot drop each other's changes. Node is single-threaded,
 * but the async fs calls inside one POST would otherwise interleave with the
 * next POST's read.
 */
let mutationTail = Promise.resolve();

/**
 * Enqueue one mutation body and propagate both its value and rejection.
 * @param operation - the serialized mutation to run.
 * @returns whatever the operation resolves to.
 */
function enqueueMutation(operation) {
	const result = mutationTail.then(operation);
	mutationTail = result.then(() => undefined, () => undefined);
	return result;
}

/**
 * Host plugin body: register the exact Fetch route on the shared authenticated
 * /api channel. Exact routes are keyed by path, so GET/HEAD/POST dispatch on
 * one registration.
 * @param ctx - host cordis context carrying the connection service.
 * @returns disposer (route registration owns its own cleanup).
 */
export async function apply(ctx) {
	const connection = ctx.connection;
	if (connection === undefined || connection === null) {
		throw new Error("session-emoji: the connection service is required but was not resolved");
	}

	connection.fetch.register({
		path: SESSION_EMOJI_PATH,
		methods: ["GET", "HEAD", "POST"],
		requestBody: "buffered",
		fetch: async (request) => {
			if (request.method === "HEAD") return new Response(null, { status: 200, headers: { "cache-control": "no-store" } });
			if (request.method === "GET") return jsonResponse({ emojis: await loadMap() });

			let body;
			try {
				body = await request.json();
			} catch {
				return jsonResponse({ error: "body must be JSON" }, 400);
			}
			const sessionIdError = validateField(body?.sessionId, "sessionId", MAX_SESSION_ID_LENGTH);
			if (sessionIdError !== undefined) return jsonResponse({ error: sessionIdError }, 400);
			const emojiError = validateEmoji(body?.emoji);
			if (emojiError !== undefined) return jsonResponse({ error: emojiError }, 400);

			return enqueueMutation(async () => {
				const map = await loadMap();
				if (body.emoji === null) delete map[body.sessionId];
				else map[body.sessionId] = body.emoji;
				if (Object.keys(map).length > MAX_ENTRIES) return jsonResponse({ error: `store exceeds ${MAX_ENTRIES} entries` }, 507);
				await saveMap(map);
				return jsonResponse({ ok: true, emojis: map });
			});
		}
	});
}

export { inject, name };
