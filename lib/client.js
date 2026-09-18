window.__ModuleLoader__.load({
	id: "dsh-plugin-session-emoji",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		/**
		 * dsh-plugin-session-emoji — browser half.
		 *
		 * Renders an externally attached emoji in front of every session title in
		 * the sidebar workspace browser, and adds a row context menu ("Set
		 * emoji…") backed by the host route /api/session-emoji.
		 *
		 * Rendering strategy: the emoji is never inserted into React-managed
		 * children. Each session row title span receives a data attribute holding
		 * the emoji, and one injected stylesheet draws it with
		 * `::before { content: attr(...) }`. Rows are located structurally
		 * (`[role="treeitem"]`) and resolved to their session id by walking the
		 * React fiber for the row component props (`node.id` on SessionNodeItem).
		 * Everything is self-contained: no imports, no externals.
		 */

		const STYLE_ID = "dsh-plugin-session-emoji-style";
		const EMOJI_ATTR = "data-dsh-session-emoji";
		const HOST_PATH = "/api/session-emoji";
		const FIBER_HOPS = 25;

		const CSS = [
			`span[${EMOJI_ATTR}]::before {`,
			"  content: attr(data-dsh-session-emoji);",
			"  display: inline-block;",
			"  margin-right: 4px;",
			"  font-size: 13px;",
			"  line-height: 1;",
			"}",
			`.dshse-popup {`,
			"  position: fixed;",
			"  z-index: 2147483000;",
			"  box-sizing: border-box;",
			"  color: var(--dsw-alias-label-primary, inherit);",
			"  background: var(--dsw-alias-button-elevated-fill, var(--dshse-fallback-bg, #ffffff));",
			"  border: 0.5px solid var(--dsw-alias-border-l4, rgba(127, 127, 127, 0.4));",
			"  border-radius: 10px;",
			"  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.22);",
			"  font-size: 13px;",
			"  line-height: 20px;",
			"  padding: 6px;",
			"  user-select: none;",
			"}",
			`.dshse-menu .dshse-item {`,
			"  display: flex;",
			"  align-items: center;",
			"  gap: 8px;",
			"  width: 160px;",
			"  padding: 6px 10px;",
			"  border: none;",
			"  border-radius: 6px;",
			"  background: transparent;",
			"  color: inherit;",
			"  font: inherit;",
			"  text-align: left;",
			"  cursor: pointer;",
			"}",
			`.dshse-menu .dshse-item:hover, .dshse-menu .dshse-item:focus-visible {`,
			"  background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, 0.15));",
			"  outline: none;",
			"}",
			`.dshse-picker {`,
			"  width: 300px;",
			"  max-height: 320px;",
			"  display: flex;",
			"  flex-direction: column;",
			"  gap: 6px;",
			"}",
			`.dshse-picker .dshse-header {`,
			"  display: flex;",
			"  align-items: center;",
			"  justify-content: space-between;",
			"  padding: 2px 6px 0;",
			"  color: var(--dsw-alias-label-tertiary, inherit);",
			"  flex: none;",
			"}",
			`.dshse-picker .dshse-clear {`,
			"  border: none;",
			"  background: transparent;",
			"  color: var(--dsw-alias-label-secondary, inherit);",
			"  font: inherit;",
			"  padding: 2px 6px;",
			"  border-radius: 6px;",
			"  cursor: pointer;",
			"}",
			`.dshse-picker .dshse-clear:hover {`,
			"  background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, 0.15));",
			"}",
			`.dshse-picker .dshse-grid {`,
			"  overflow-y: auto;",
			"  display: grid;",
			"  grid-template-columns: repeat(8, 1fr);",
			"  gap: 2px;",
			"  padding: 2px;",
			"}",
			`.dshse-picker .dshse-cell {`,
			"  aspect-ratio: 1 / 1;",
			"  display: flex;",
			"  align-items: center;",
			"  justify-content: center;",
			"  font-size: 18px;",
			"  border: none;",
			"  border-radius: 6px;",
			"  background: transparent;",
			"  cursor: pointer;",
			"  padding: 0;",
			"}",
			`.dshse-picker .dshse-cell:hover {`,
			"  background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, 0.15));",
			"}"
		].join("\n");

		/** Curated picker palette: common everyday emoji, roughly grouped. */
		const EMOJIS = [
			"📌", "🎯", "🚀", "💡", "🔥", "⭐", "✨", "💎",
			"🐛", "🔧", "🛠️", "⚙️", "🧪", "🔬", "🔍", "🧭",
			"📚", "📖", "📝", "✏️", "📎", "✂️", "📊", "📈",
			"💾", "📦", "🗂️", "📁", "🗄️", "🗃️", "🧮", "🗒️",
			"💻", "🖥️", "⌨️", "🖱️", "📱", "☁️", "🌐", "🛰️",
			"🔒", "🔑", "🛡️", "⚡", "🔋", "🔌", "🧲", "🧿",
			"🤖", "👾", "🎮", "🕹️", "🎲", "♟️", "🧩", "🎨",
			"🌈", "🌤️", "⛅", "🌧️", "⛈️", "❄️", "☀️", "🌙",
			"🪐", "🌍", "🌋", "🏔️", "🌊", "🏝️", "🍀", "🌵",
			"🌲", "🌸", "🌹", "🌻", "🍁", "🍄", "🐾", "🐚",
			"🍎", "🍋", "🍉", "🍇", "🥑", "🍅", "🥕", "🌽",
			"🍞", "🧀", "🍕", "🍔", "🍜", "🍣", "🍪", "🎂",
			"🍭", "☕", "🍵", "🥤", "🍺", "🍷", "🍿", "🧁",
			"🐶", "🐱", "🐭", "🐰", "🦊", "🐻", "🐼", "🐨",
			"🐯", "🦁", "🐮", "🐷", "🐸", "🐵", "🐔", "🐧",
			"🦆", "🦅", "🦉", "🐺", "🐴", "🦄", "🐝", "🦋",
			"🐢", "🐍", "🐙", "🦀", "🐬", "🐳", "🦈", "🐊",
			"⚽", "🏀", "🏈", "⚾", "🎾", "🏓", "🏸", "🏋️",
			"🎸", "🎹", "🎤", "🎧", "🎬", "📷", "🎥", "🎪",
			"💬", "💭", "🗨️", "📍", "🏠", "🏢", "🏰", "🗺️",
			"🗼", "🗻", "🎡", "🏖️", "🚗", "✈️", "🚲", "🛸",
			"✅", "❌", "⚠️", "❓", "❗", "💤", "💢", "💥",
			"💯", "🎉", "🎊", "🏆", "🥇", "🎁", "🙏", "👍",
			"❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍"
		];

		const zh = (typeof navigator !== "undefined" && String(navigator.language || "").toLowerCase().startsWith("zh"));
		const LABELS = zh
			? { setEmoji: "设置 emoji…", removeEmoji: "清除 emoji", pickTitle: "选择 emoji", remove: "清除" }
			: { setEmoji: "Set emoji…", removeEmoji: "Remove emoji", pickTitle: "Choose an emoji", remove: "Remove" };

		/** The live emoji map: sessionId → emoji string. */
		let emojiMap = {};
		let disposed = false;

		// ── host API ────────────────────────────────────────────────────────────

		/** Fetch the whole emoji map from the host; null on failure (keeps current). */
		async function fetchMap() {
			try {
				const response = await fetch(HOST_PATH, { headers: { accept: "application/json" } });
				if (!response.ok) throw new Error(`HTTP ${response.status}`);
				const data = await response.json();
				if (data && typeof data.emojis === "object" && data.emojis !== null) {
					emojiMap = data.emojis;
					scheduleDecoration();
					return true;
				}
			} catch (error) {
				console.warn("[session-emoji] fetch failed:", error);
			}
			return false;
		}

		/** Persist one emoji (null clears) and adopt the returned authoritative map. */
		async function saveEmoji(sessionId, emoji) {
			try {
				const response = await fetch(HOST_PATH, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ sessionId, emoji })
				});
				if (!response.ok) throw new Error(`HTTP ${response.status}`);
				const data = await response.json();
				if (data && typeof data.emojis === "object" && data.emojis !== null) emojiMap = data.emojis;
				scheduleDecoration();
				return true;
			} catch (error) {
				console.warn("[session-emoji] save failed:", error);
				return false;
			}
		}

		// ── row → session id resolution ─────────────────────────────────────────

		/**
		 * Read the React fiber handle from a DOM element.
		 * @returns the fiber object, or undefined outside a React tree.
		 */
		function fiberOf(element) {
			for (const key of Object.keys(element)) {
				if (key.startsWith("__reactFiber$")) return element[key];
			}
			return undefined;
		}

		/**
		 * Walk the fiber return chain looking for the row component's props.
		 * Session rows (SessionNodeItem) carry `node: SessionNode`; workspace
		 * headers carry `group: GroupNode` (no `id`), and search rows carry
		 * `result: SearchResultNode`, which this plugin deliberately ignores
		 * (sidebar list scope only).
		 * @returns the session id, or undefined when the row is not a session row.
		 */
		function sessionIdOfRow(rowElement) {
			let fiber = fiberOf(rowElement);
			for (let hop = 0; fiber !== undefined && fiber !== null && hop < FIBER_HOPS; hop += 1) {
				const props = fiber.memoizedProps;
				if (props !== undefined && props !== null) {
					const node = props.node;
					if (
						node !== undefined && node !== null
						&& typeof node.id === "string" && node.id !== ""
						&& typeof node.title === "string"
						&& typeof node.updatedAt === "number"
					) return node.id;
				}
				fiber = fiber.return;
			}
			return undefined;
		}

		/**
		 * Locate the title span inside one session row. CSS-module class names
		 * keep the local name (`<hash>_title`), so a substring match is stable
		 * across builds; the structural shape is the fallback.
		 * @returns the title span element, or undefined.
		 */
		function titleSpanOf(rowElement) {
			for (const child of rowElement.children) {
				if (child.tagName !== "SPAN") continue;
				if (typeof child.className === "string" && child.className.includes("title")) return child;
			}
			for (const child of rowElement.children) {
				if (child.tagName === "SPAN") return child;
			}
			return undefined;
		}

		/** Apply (or clear) the emoji attribute on one row's title span. */
		function decorateRow(rowElement) {
			if (disposed || rowElement.getAttribute("role") !== "treeitem") return;
			const sessionId = sessionIdOfRow(rowElement);
			if (sessionId === undefined) return;
			const titleSpan = titleSpanOf(rowElement);
			if (titleSpan === undefined) return;
			const emoji = emojiMap[sessionId];
			if (emoji !== undefined) {
				if (titleSpan.getAttribute(EMOJI_ATTR) !== emoji) titleSpan.setAttribute(EMOJI_ATTR, emoji);
			} else if (titleSpan.hasAttribute(EMOJI_ATTR)) {
				titleSpan.removeAttribute(EMOJI_ATTR);
			}
		}

		/** Scan the whole document once (initial mount and periodic refreshes). */
		function decorateAll() {
			const rows = document.querySelectorAll('[role="treeitem"]');
			for (const row of rows) decorateRow(row);
		}

		// rAF-batched decoration driven by DOM mutations.
		let decorationScheduled = false;
		function scheduleDecoration() {
			if (decorationScheduled || disposed) return;
			decorationScheduled = true;
			requestAnimationFrame(() => {
				decorationScheduled = false;
				decorateAll();
			});
		}

		/** MutationObserver callback: batch-queue rows added anywhere in the body. */
		function onMutations(mutations) {
			let sawElement = false;
			for (const mutation of mutations) {
				for (const node of mutation.addedNodes) {
					if (node.nodeType !== Node.ELEMENT_NODE) continue;
					sawElement = true;
					break;
				}
				if (sawElement) break;
			}
			if (sawElement) scheduleDecoration();
		}

		// ── popups (context menu + picker), plain DOM ───────────────────────────

		let openPopup = null;

		/** Close and dispose the current popup, if any. */
		function closePopup() {
			if (openPopup === null) return;
			const popup = openPopup;
			openPopup = null;
			popup.remove();
			document.removeEventListener("pointerdown", onPopupOutside, true);
			window.removeEventListener("resize", closePopup);
			window.removeEventListener("blur", closePopup);
		}

		/** Outside-pointerdown closer (capture so row handlers never win). */
		function onPopupOutside(event) {
			if (openPopup === null) return;
			if (event.target instanceof Node && openPopup.contains(event.target)) return;
			closePopup();
		}

		/**
		 * Mount one popup at the cursor, clamped into the viewport.
		 * @returns the popup element.
		 */
		function mountPopup(element, clientX, clientY) {
			closePopup();
			openPopup = element;
			element.classList.add("dshse-popup");
			document.body.append(element);
			const rect = element.getBoundingClientRect();
			const left = Math.max(4, Math.min(clientX, window.innerWidth - rect.width - 4));
			const top = Math.max(4, Math.min(clientY, window.innerHeight - rect.height - 4));
			element.style.left = `${left}px`;
			element.style.top = `${top}px`;
			document.addEventListener("pointerdown", onPopupOutside, true);
			window.addEventListener("resize", closePopup);
			window.addEventListener("blur", closePopup);
			return element;
		}

		/**
		 * Open the emoji picker for one session at the cursor position.
		 * @param sessionId - the session whose emoji is being chosen.
		 * @param clientX - cursor x.
		 * @param clientY - cursor y.
		 */
		function openPicker(sessionId, clientX, clientY) {
			const popup = document.createElement("div");
			popup.className = "dshse-picker";
			popup.setAttribute("role", "dialog");
			popup.setAttribute("aria-label", LABELS.pickTitle);

			const header = document.createElement("div");
			header.className = "dshse-header";
			const title = document.createElement("span");
			title.textContent = LABELS.pickTitle;
			const clearButton = document.createElement("button");
			clearButton.type = "button";
			clearButton.className = "dshse-clear";
			clearButton.textContent = LABELS.remove;
			clearButton.addEventListener("click", () => {
				closePopup();
				void saveEmoji(sessionId, null);
			});
			header.append(title, clearButton);

			const grid = document.createElement("div");
			grid.className = "dshse-grid";
			for (const emoji of EMOJIS) {
				const cell = document.createElement("button");
				cell.type = "button";
				cell.className = "dshse-cell";
				cell.textContent = emoji;
				cell.title = emoji;
				cell.addEventListener("click", () => {
					closePopup();
					void saveEmoji(sessionId, emoji);
				});
				grid.append(cell);
			}

			popup.append(header, grid);
			mountPopup(popup, clientX, clientY);
		}

		/**
		 * Context-menu listener: resolve the right-clicked row to a session and
		 * open the emoji menu; other targets keep the default browser menu.
		 */
		function onContextMenu(event) {
			if (disposed) return;
			const target = event.target;
			if (!(target instanceof Element)) return;
			const row = target.closest('[role="treeitem"]');
			if (row === null) return;
			const sessionId = sessionIdOfRow(row);
			if (sessionId === undefined) return;

			event.preventDefault();
			const cursorX = event.clientX;
			const cursorY = event.clientY;
			const menu = document.createElement("div");
			menu.className = "dshse-menu";
			menu.setAttribute("role", "menu");

			const setItem = document.createElement("button");
			setItem.type = "button";
			setItem.className = "dshse-item";
			setItem.setAttribute("role", "menuitem");
			setItem.textContent = LABELS.setEmoji;
			setItem.addEventListener("click", () => {
				closePopup();
				openPicker(sessionId, cursorX, cursorY);
			});
			menu.append(setItem);

			if (typeof emojiMap[sessionId] === "string") {
				const removeItem = document.createElement("button");
				removeItem.type = "button";
				removeItem.className = "dshse-item";
				removeItem.setAttribute("role", "menuitem");
				removeItem.textContent = LABELS.removeEmoji;
				removeItem.addEventListener("click", () => {
					closePopup();
					void saveEmoji(sessionId, null);
				});
				menu.append(removeItem);
			}

			mountPopup(menu, event.clientX, event.clientY);
		}

		// ── plugin body ─────────────────────────────────────────────────────────

		/**
		 * Client plugin body: inject the stylesheet, load the emoji map, then
		 * observe the DOM. Returns the full cleanup disposer.
		 * @returns disposer releasing every listener and observer.
		 */
		async function apply() {
			if (typeof document === "undefined") return undefined;

			const style = document.createElement("style");
			style.id = STYLE_ID;
			style.dataset.plugin = "dsh-plugin-session-emoji";
			style.textContent = CSS;
			document.head.append(style);

			const observer = new MutationObserver(onMutations);
			observer.observe(document.body, { childList: true, subtree: true });

			const onWindowFocus = () => { void fetchMap(); };
			const onVisibilityChange = () => {
				if (document.visibilityState === "visible") void fetchMap();
			};

			document.addEventListener("contextmenu", onContextMenu, true);
			window.addEventListener("focus", onWindowFocus);
			document.addEventListener("visibilitychange", onVisibilityChange);

			decorateAll();
			void fetchMap();

			return async () => {
				disposed = true;
				observer.disconnect();
				document.removeEventListener("contextmenu", onContextMenu, true);
				window.removeEventListener("focus", onWindowFocus);
				document.removeEventListener("visibilitychange", onVisibilityChange);
				closePopup();
				document.getElementById(STYLE_ID)?.remove();
			};
		}

		exports.inject = [];
		exports.apply = apply;
		return module.exports;
	}
});
