/**
 * Smoke test: evaluate the built client bundle in a mocked DOM and drive
 * apply() through register → guard → settings card → dispose.
 * Run: node scripts/smoke.mjs
 *
 * The harness mocks the ModuleLoader factory, localStorage and just enough DOM
 * to run the plugin. It is deliberately strict about the two stylesheet layers,
 * because which tag carries the wallpaper bytes is the difference between a
 * slider that feels instant and one that re-parses 0.4 MB per input event.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = readFileSync(join(root, "lib/client.js"), "utf8");

const BASE_ID = "dsh-whalegirl-base";
const SKIN_ID = "dsh-whalegirl-skin";
const SETTINGS_SLOT = "plugins.bundle.config";
const CREDITS_SLOT = "plugins.detail.section";
const FALLBACK_SLOT = "plugins.item";

function makeElement() {
	const el = {
		id: "",
		dataset: {},
		textContent: "",
		isConnected: false,
		parentNode: null,
		childNodes: [],
		attrs: {},
		classList: { add() {}, remove() {} },
		appendChild(child) {
			child.parentNode = el;
			child.isConnected = true;
			el.childNodes.push(child);
		},
		insertBefore(child, before) {
			child.parentNode = el;
			child.isConnected = true;
			const at = el.childNodes.indexOf(before);
			if (at < 0) el.childNodes.push(child);
			else el.childNodes.splice(at, 0, child);
		},
		append(child) { el.appendChild(child); },
		remove() {
			el.isConnected = false;
			if (el.parentNode !== null) {
				const at = el.parentNode.childNodes.indexOf(el);
				if (at >= 0) el.parentNode.childNodes.splice(at, 1);
				el.parentNode = null;
			}
		},
		setAttribute(name, value) { el.attrs[name] = value; },
		hasAttribute(name) { return name in el.attrs; },
		getAttribute(name) { return el.attrs[name] ?? null; },
		removeAttribute(name) { delete el.attrs[name]; },
		addEventListener() {},
		removeEventListener() {}
	};
	return el;
}

/**
 * A host document. `hooks` is the set of plugin selector probes the mocked shell
 * actually renders, so the compatibility report can be driven both ways.
 */
function makeDocument(hooks = null) {
	const head = makeElement();
	const body = makeElement();
	const rendered = hooks === null ? null : new Set(hooks);
	head.childNodes = [];
	return {
		head,
		body,
		createElement: () => makeElement(),
		// Styles are the only elements this plugin looks up by id, and they all
		// live in <head>, so the childNodes list is the single source of truth —
		// a removed tag is really gone, which is what the dispose test needs.
		getElementById: (id) => head.childNodes.find((tag) => tag.id === id) ?? null,
		querySelector: (selector) => (rendered !== null && rendered.has(selector) ? body : null)
	};
}

function makeStorage() {
	const data = new Map();
	return {
		data,
		getItem: (k) => (data.has(k) ? data.get(k) : null),
		setItem: (k, v) => data.set(k, String(v)),
		removeItem: (k) => data.delete(k)
	};
}

const reactStub = {
	createElement: (type, props, ...children) => ({ type, props, children }),
	useRef: (value) => ({ current: value }),
	useState: (value) => [value, () => {}]
};

/**
 * Boot the bundle in an isolated context.
 * `options.language` sets navigator.language; `options.hooks` lists the host
 * selectors the shell renders; `options.console` captures warnings.
 */
function boot(options = {}) {
	const documentMock = makeDocument(options.hooks ?? null);
	const storage = makeStorage();
	const noop = () => {};
	const contextConsole = options.console ?? { log: noop, warn: noop, error: noop };
	let loadedModule = null;
	const windowMock = {
		__ModuleLoader__: {
			load({ factory }) {
				// The real factory receives the ModuleLoader's synchronous require;
				// react is one of its platform seeds.
				const requireFn = (id) => (id === "react" ? reactStub : {});
				loadedModule = factory(requireFn);
			}
		},
		localStorage: storage,
		console: contextConsole
	};
	const context = vm.createContext({
		window: windowMock,
		document: documentMock,
		localStorage: storage,
		console: contextConsole,
		navigator: options.language === undefined ? undefined : { language: options.language },
		Promise,
		JSON,
		Map,
		Set,
		Array,
		Object,
		Error,
		TypeError,
		String,
		Number,
		Boolean,
		Math,
		Date,
		parseInt,
		isNaN
	});
	vm.runInContext(source, context, { filename: "lib/client.js" });
	if (loadedModule === null) throw new Error("module was never loaded");
	return { module: loadedModule, documentMock, storage, console: contextConsole };
}

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

function containsAll(haystack, needles, label) {
	for (const needle of needles) {
		assert(haystack.includes(needle), `${label} missing ${needle}`);
	}
}

function renderText(node) {
	if (node === null || node === undefined || node === false) return "";
	if (Array.isArray(node)) return node.map(renderText).join("");
	if (typeof node === "string" || typeof node === "number") return String(node);
	if (typeof node === "object" && typeof node.type === "function") {
		return renderText(node.type({ ...(node.props ?? {}), children: node.children }));
	}
	if (typeof node === "object") return renderText(node.children);
	return "";
}

/** Fake theme/slots host that registers whatever the plugin injects. */
function makeHost(themeService, slotsService) {
	const registered = [];
	const disposed = [];
	const listeners = new Map();
	const slots = {
		inject(slot, factory) {
			return factory();
		},
		register(opts, component) {
			const entry = { opts, component, isDisposed: false };
			registered.push(entry);
			return () => { entry.isDisposed = true; disposed.push(opts.name); };
		}
	};
	const ctx = {
		effects: [],
		theme: themeService,
		slots: slotsService === undefined ? slots : slotsService,
		effect(fn, label) {
			ctx.effects.push(label);
			const dispose = fn();
			return () => { if (typeof dispose === "function") dispose(); };
		},
		on(event, cb) {
			if (!listeners.has(event)) listeners.set(event, []);
			listeners.get(event).push(cb);
			return () => listeners.delete(event);
		},
		get(service) {
			if (service === "theme") return themeService;
			if (service === "slots") return ctx.slots;
			return undefined;
		}
	};
	return { ctx, registered, disposed, listeners, slots };
}

/** Walk a rendered element tree looking for a DOM id. */
function findNode(node, id) {
	if (node === null || node === undefined || typeof node !== "object") return null;
	if (Array.isArray(node)) {
		for (const child of node) {
			const hit = findNode(child, id);
			if (hit !== null) return hit;
		}
		return null;
	}
	if (node.props !== undefined && node.props.id === id) return node;
	return findNode(node.children, id);
}

/** Drive a rendered control the way a user drag or click does. */
function setRange(node, id, value) {
	const input = findNode(node, id);
	assert(input !== null, `control #${id} was not rendered`);
	if (input.props.type === "checkbox") input.props.onChange({ target: { checked: value === "on" } });
	else input.props.onChange({ target: { value } });
}

function makeThemeService() {
	const state = { registered: null, preference: null, setThemeCalls: [] };
	return {
		state,
		register(def) {
			state.registered = def;
			return () => { state.registered = null; };
		},
		getTheme() {
			return {
				preference: state.preference,
				themes: state.registered === null ? [] : [state.registered]
			};
		},
		setTheme(id) {
			state.preference = id;
			state.setThemeCalls.push(id);
		}
	};
}

/* =================================================================== *
 * 1. Module contract
 * =================================================================== */

const first = boot({ hooks: [] });
const mod = first.module;

assert(mod.isPlugin === true, "isPlugin flag missing");
assert(Array.isArray(mod.inject) && mod.inject.includes("theme"), "inject must include 'theme'");
// Strict Cordis throws when an undeclared service is read off the context
// proxy, so slots must be declared before the settings card touches it.
assert(mod.inject.includes("slots"), "inject must include 'slots'");
assert(typeof mod.apply === "function", "apply missing");

// Markers replaced by scripts/build.mjs.
assert(!source.includes("__WHALEGIRL_BUILD_ID__"), "build id placeholder left in bundle");
assert(source.includes("data:image/jpeg;base64,"), "background data URI missing");

/* =================================================================== *
 * 2. Register → guard → dispose on a host that renders every hook
 * =================================================================== */

{
	const ALL_HOOKS = [
		'[class*="_centerCol"]', '[class*="_sidebarCol"]', '[class$="_frame"]',
		'[class*="_rightbarCol"]', '[data-slot="conversation.header"]',
		'[class*="_tabHost"]', '[class*="_root"][data-phase]', '[role="tree"]'
	];
	const run = boot({ hooks: ALL_HOOKS });
	const theme = makeThemeService();
	const host = makeHost(theme);

	run.module.apply(host.ctx);

	assert(theme.state.registered !== null, "theme.register was not called");
	assert(theme.state.registered.id === "deepseek-whalegirl", `bad id: ${theme.state.registered.id}`);
	assert(theme.state.registered.colorScheme === "light", "colorScheme must be light");
	assert(theme.state.preference === "deepseek-whalegirl", "setTheme not pinned");
	assert(host.ctx.effects.includes("dsh-theme-whalegirl: register"), "effect label missing");
	assert(run.documentMock.body.hasAttribute("data-dsh-whalegirl"), "body attribute not set");

	const tokenNames = Object.keys(theme.state.registered.tokens);
	for (const name of [
		"--dsw-static-neutral-bluish-1000",
		"--dsw-static-neutral-bluish-50",
		"--dsw-alias-bg-base",
		"--dsw-alias-brand-primary",
		"--dsw-alias-button-primary-fill",
		"--dsw-alias-label-primary",
		"--dsw-specific-sidebar-fill",
		"--dsw-specific-bubble",
		"--dsw-shadow-lv3",
		"--dsw-linear-gradient-think"
	]) {
		assert(name in theme.state.registered.tokens, `missing token ${name}`);
		assert(theme.state.registered.tokens[name] !== "", `empty token ${name}`);
	}
	console.log(`tokens registered: ${tokenNames.length}`);

	const base = run.documentMock.getElementById(BASE_ID);
	const skin = run.documentMock.getElementById(SKIN_ID);
	assert(base !== null && skin !== null, "both stylesheet layers must be written");
	assert(run.documentMock.head.childNodes[0] === base, "base layer must come before the skin layer");
	assert(base.dataset.build !== undefined && skin.dataset.build !== undefined, "style tags must carry data-build");
	assert(base.dataset.build === skin.dataset.build, "both layers must carry the same build id");

	const baseCss = base.textContent;
	const skinCss = skin.textContent;

	// The split that keeps sliders cheap: bytes live in the static layer only.
	assert(baseCss.includes("data:image/jpeg;base64,"), "base layer must carry the wallpaper");
	assert(!skinCss.includes("data:image/jpeg;base64,"), "skin layer must NOT re-serialise the wallpaper bytes");
	assert(skinCss.length < 12000, `skin layer should stay small, is ${skinCss.length} bytes`);
	containsAll(baseCss, [
		"color-scheme: light !important",
		"--dsw-alias-label-primary: #352970 !important;",
		"--dsw-specific-sidebar-nav-item-active-accent",
		'@media (prefers-reduced-motion: reduce)',
		'body[data-dsh-whalegirl] [role="tree"]'
	], "base layer");

	// Defaults ARE the look: reduced frost, no legacy 18px blur.
	assert(skinCss.includes("backdrop-filter: blur(1px)"), "default frame blur should be 1px");
	assert(!/blur\(18px\)/.test(skinCss), "legacy 18px blur must be gone by default");
	assert(skinCss.includes("--dsw-alias-bg-base: ") && skinCss.includes("!important"), "adjustable surface overrides missing");
	// Wallpaper geometry follows prefs and must therefore be in the skin layer.
	containsAll(skinCss, ["background-position: 50% 50%;", "inset: 0;"], "wallpaper geometry");

	// Paper model: one layer per column, nested page surfaces transparent.
	containsAll(skinCss, [
		'[class*="_centerCol"]',
		'[class*="_rightbarCol"]',
		'[class*="_tabHost"]',
		'[class*="_root"][data-phase]',
		'data-slot="conversation.header"'
	], "paper-layer rules");
	assert(/\[class\*="_sidebarCol"\] \{[^}]*--dsw-specific-sidebar-fill: transparent;[^}]*background: #abb4cf/.test(skinCss),
		"sidebar column must own the wash and blank the inner fill");
	assert(skinCss.includes('[class*="_tabHost"] {\n  background: transparent;'), "dock tab host must stay transparent");

	/* Guard: a foreign preference write re-asserts our theme, deferred out of
	   the dispatch so a presenter subscribed after this plugin cannot overwrite
	   it with the foreign snapshot. `fire` plays the host's whole side of that:
	   store the foreign preference, then publish the change. */
	const fire = (preference) => {
		theme.state.preference = preference;
		theme.state.setThemeCalls = [];
		for (const cb of host.listeners.get("theme/change") ?? []) cb({ preference });
	};

	fire("system");
	await Promise.resolve();
	await Promise.resolve();
	assert(theme.state.setThemeCalls.at(-1) === "deepseek-whalegirl", "guard did not re-assert on system");
	assert(theme.state.preference === "deepseek-whalegirl", "theme must be pinned after a system reset");

	// An explicit light/dark pick is reclaimed too — the desktop shell writes
	// exactly that when it adopts its durable section, so the theme owns the
	// appearance until the plugin itself is toggled off.
	fire("dark");
	await Promise.resolve();
	await Promise.resolve();
	assert(theme.state.setThemeCalls.at(-1) === "deepseek-whalegirl", "guard did not re-assert on an explicit dark pick");

	// …and its own change event must not loop.
	fire("deepseek-whalegirl");
	await Promise.resolve();
	await Promise.resolve();
	assert(theme.state.setThemeCalls.length === 0, "guard must ignore its own theme");

	/* The card's own onChange IS the slider path: it must rewrite the skin layer
	   only, and never touch the static layer that carries the wallpaper bytes. */
	const settingsEntry = host.registered.find((item) => item.opts.name === SETTINGS_SLOT);
	assert(settingsEntry !== undefined, "settings card must mount when slots exist");
	const page = settingsEntry.component({ view: "page" });
	const baseBytes = baseCss.length;
	const baseText = base.textContent;
	const skinBefore = skin.textContent;
	setRange(page, "whalegirl-surfaceOpacity", "95");
	setRange(page, "whalegirl-wallpaperY", "20");
	setRange(page, "whalegirl-wallpaperZoom", "160");
	assert(skin.textContent !== skinBefore, "an adjustment must rewrite the skin layer");
	assert(skin.textContent.includes("background-position: 50% 20%;"), "wallpaper focus not applied");
	assert(skin.textContent.includes("transform: scale(1.60);"), "wallpaper zoom not applied");
	assert(base.textContent === baseText, "static layer must stay byte-identical through an adjustment");
	assert(base.textContent.length === baseBytes, "adjusting prefs must not rewrite the static layer");

	/* A sibling instance's teardown can strip a layer; the next pin puts it back
	   in the right order, and dispose then removes whatever is actually there. */
	base.remove();
	fire("system");
	await Promise.resolve();
	await Promise.resolve();
	const restored = run.documentMock.getElementById(BASE_ID);
	assert(restored !== null, "a pin must restore a stripped base layer");
	assert(run.documentMock.head.childNodes[0] === restored, "a restored base layer must stay ahead of the skin layer");
}

/* =================================================================== *
 * 2b. Dispose leaves nothing behind
 * =================================================================== */

{
	const ALL_HOOKS = [
		'[class*="_centerCol"]', '[class*="_sidebarCol"]', '[class$="_frame"]'
	];
	const run = boot({ hooks: ALL_HOOKS });
	const theme = makeThemeService();
	let dispose = null;
	// Capture the effect's own return value, which is the real teardown closure.
	run.module.apply({
		...makeHost(theme, null).ctx,
		effect(fn) { dispose = fn(); return () => {}; }
	});
	assert(typeof dispose === "function", "the effect must return a disposer");
	const base = run.documentMock.getElementById(BASE_ID);
	const skin = run.documentMock.getElementById(SKIN_ID);
	assert(base !== null && skin !== null, "both layers exist before dispose");
	dispose();
	assert(run.documentMock.getElementById(BASE_ID) === null, "dispose must remove the base layer");
	assert(run.documentMock.getElementById(SKIN_ID) === null, "dispose must remove the skin layer");
	assert(base.isConnected === false && skin.isConnected === false, "disposed tags must be detached");
	assert(!run.documentMock.body.hasAttribute("data-dsh-whalegirl"), "dispose must drop the body attribute");
	assert(theme.state.registered === null, "dispose must unregister the theme it owns");
}

/* =================================================================== *
 * 3. Strict Cordis host: undeclared service reads throw
 * =================================================================== */

{
	const theme = makeThemeService();
	const getCalls = [];
	const strictCtx = new Proxy(
		{
			effect(fn, label) { fn(); return () => {}; },
			on() { return () => {}; },
			get(service) {
				getCalls.push(service);
				if (service === "theme") return theme;
				if (service === "slots") return { inject() {}, register() {} };
				return undefined;
			},
			theme
		},
		{
			get(target, prop) {
				if (Reflect.has(target, prop)) return Reflect.get(target, prop);
				throw new Error(`cannot get property "${String(prop)}" without inject`);
			}
		}
	);
	const run = boot();
	let threw = null;
	try {
		run.module.apply(strictCtx);
	} catch (error) {
		threw = error;
	}
	assert(threw === null, `apply must survive strict ctx.slots: ${threw && threw.message}`);
	assert(theme.state.preference === "deepseek-whalegirl", "theme must still apply when ctx.slots is undeclared");
	assert(getCalls.includes("slots"), "slots fallback must use the inject-free ctx.get() probe");
}

/* =================================================================== *
 * 4. Settings card: slots, bilingual copy, compatibility report
 * =================================================================== */

function mountCard(options) {
	const run = boot(options);
	const theme = makeThemeService();
	const registered = [];
	const slots = {
		injected: [],
		inject(slot, factory) {
			assert(slot === SETTINGS_SLOT || slot === CREDITS_SLOT || slot === FALLBACK_SLOT, `unexpected slot: ${slot}`);
			return factory();
		},
		register(opts, component) {
			registered.push({ opts, component });
			return () => {};
		}
	};
	const ctx = {
		effect(fn) { fn(); return () => {}; },
		on() { return () => {}; },
		get(service) {
			if (service === "theme") return theme;
			if (service === "slots") return slots;
			return undefined;
		},
		theme
	};
	run.module.apply(ctx);
	return { run, theme, registered };
}

function cardText(registered, view = "page") {
	const entry = registered.find((item) => item.opts.name === SETTINGS_SLOT);
	assert(entry !== undefined, "plugins.bundle.config entry was not registered");
	assert(entry.opts.key === "dsh-theme-whalegirl", `bad bundle key: ${entry.opts.key}`);
	const page = entry.component({ view });
	assert(page !== null && page !== undefined, `${view} view rendered nothing`);
	return { entry, page, text: typeof page === "string" ? page : renderText(page) };
}

{
	// No navigator in this context → the Chinese copy is the fallback.
	const zh = mountCard({ hooks: ['[class*="_centerCol"]', '[class*="_sidebarCol"]', '[class$="_frame"]'] });
	const summary = cardText(zh.registered, "summary");
	assert(typeof summary.page === "string" && summary.page.length > 0, "summary view must return a one-liner string");
	containsAll(summary.text, ["鲸鱼娘"], "zh summary");

	const { text } = cardText(zh.registered);
	containsAll(text, [
		"对话纸面透明度",
		"壁纸焦点上下",
		"壁纸缩放",
		"出处与授权",
		"CC BY-NC-SA 4.0",
		"溟月",
		"powerdog996",
		"清爽玻璃（默认）",
		"DreamSkin 原味",
		"纯净实底"
	], "zh settings page");
	// The escape hatch the README points at, shown where the user looks for it.
	assert(text.includes("停用 dsh-theme-whalegirl"), "settings page must say how to leave the theme");
	// Every hook present on this page → a clean report, and the tested version.
	assert(text.includes("宿主适配 3/3"), `compat report missing: ${text.slice(0, 400)}`);
	assert(/实测 DSH \d+\.\d+\.\d+/.test(text), "compat report must name the tested DSH version");
	assert(text.includes("构建"), "status line must print the build id");
	assert(zh.run.documentMock.getElementById("x") === null, "sanity: getElementById misses unknown ids");
}

{
	// English browser, and a shell where two required hooks are gone: the
	// report has to name them so a future breakage is quotable in an issue.
	const warnConsole = { log() {}, error() {}, warnings: [], warn(msg) { this.warnings.push(msg); } };
	const en = mountCard({
		language: "en-US",
		hooks: ['[class*="_centerCol"]'],
		console: warnConsole
	});
	const { text } = cardText(en.registered);
	containsAll(text, [
		"Whale Girl · Glass & Wallpaper",
		"Conversation paper",
		"Wallpaper focus (vertical)",
		"Source & license",
		"CC BY-NC-SA 4.0",
		"Fresh glass (default)",
		"Restore defaults"
	], "en settings page");
	assert(!text.includes("对话纸面透明度"), "English copy must not leak Chinese labels");
	assert(text.includes("disable dsh-theme-whalegirl"), "en settings page must say how to leave the theme");
	assert(text.includes("Host hooks 1/3"), `en compat report wrong: ${text.match(/Host hooks[^\n]*/)?.[0]}`);
	assert(text.includes('[class*="_sidebarCol"]'), "en compat report must name the missing hook");
	assert(warnConsole.warnings.some((w) => String(w).includes("host hook(s) not present")),
		"a missing hook must also be logged for maintainers");
}

{
	// Pinned language wins over the browser, and survives a reload.
	const pinned = boot({ language: "en-US", hooks: [] });
	pinned.storage.setItem("dsh-whalegirl.prefs.v2", JSON.stringify({ uiLocale: "zh" }));
	const theme = makeThemeService();
	const registered = [];
	const slots = {
		inject(slot, factory) { return factory(); },
		register(opts, component) { registered.push({ opts, component }); return () => {}; }
	};
	pinned.module.apply({
		effect(fn) { fn(); return () => {}; },
		on() { return () => {}; },
		get(service) { return service === "theme" ? theme : service === "slots" ? slots : undefined; },
		theme
	});
	containsAll(cardText(registered).text, ["对话纸面透明度"], "pinned uiLocale=zh");
}

{
	// Credits also mount standalone on the package detail page, for this bundle
	// only, and follow the same language.
	const mount = mountCard({ hooks: [] });
	const creditsEntry = mount.registered.find((item) => item.opts.name === CREDITS_SLOT);
	assert(creditsEntry !== undefined, "plugins.detail.section entry was not registered");
	const ours = renderText(creditsEntry.component({ subject: { kind: "bundle", pkg: { name: "dsh-theme-whalegirl" } } }));
	containsAll(ours, ["视觉定型", "ZipZipPipe", "CC BY-NC-SA 4.0", "powerdog996"], "credits section (zh)");
	const other = creditsEntry.component({ subject: { kind: "bundle", pkg: { name: "another-plugin" } } });
	assert(other === null, "credits section must only render for this package");
	const itemSubject = creditsEntry.component({ subject: { kind: "item", id: "whalegirl-appearance" } });
	assert(renderText(itemSubject).includes("视觉定型"), "credits section must also match the fallback card");
}

/* =================================================================== *
 * 5. Hosts without plugins.bundle.config keep the built-in card
 * =================================================================== */

{
	const run = boot({ hooks: [] });
	const theme = makeThemeService();
	const fallback = [];
	const slots = {
		inject(slot, factory) {
			// A host that has not shipped plugins.bundle.config yet: the plugin
			// must fall back to the built-in card instead of losing the form.
			if (slot === SETTINGS_SLOT) throw new Error("host has no bundle-config slot");
			if (slot !== CREDITS_SLOT && slot !== FALLBACK_SLOT) throw new Error(`slot ${slot} not provided`);
			return factory();
		},
		register(opts, component) {
			fallback.push({ opts, component });
			return () => {};
		}
	};
	run.module.apply({
		effect(fn) { fn(); return () => {}; },
		on() { return () => {}; },
		get(service) { return service === "theme" ? theme : service === "slots" ? slots : undefined; },
		theme
	});
	const entry = fallback.find((item) => item.opts.name === FALLBACK_SLOT);
	assert(entry !== undefined, "plugins.item fallback was not registered");
	assert(entry.opts.id === "whalegirl-appearance", `bad fallback id: ${entry.opts.id}`);
	assert(typeof entry.opts.label === "function" && entry.opts.label().length > 0, "fallback card needs a label");
	const summary = entry.component({ view: "summary" });
	assert(typeof summary === "string" && summary.length > 0, "fallback summary must render a one-liner string");
	const page = entry.component({ view: "page" });
	assert(page !== null && page !== undefined, "fallback page rendered nothing");
	assert(renderText(page).includes("对话纸面透明度"), "fallback page missing conversation control");
}

/* =================================================================== *
 * 6. A host with no slots service at all still gets the theme
 * =================================================================== */

{
	const run = boot({ hooks: [] });
	const theme = makeThemeService();
	run.module.apply({
		effect(fn) { fn(); return () => {}; },
		on() { return () => {}; },
		get(service) { return service === "theme" ? theme : undefined; }
	});
	assert(theme.state.preference === "deepseek-whalegirl", "theme applies without any slots service");
	assert(run.documentMock.getElementById(BASE_ID) !== null, "both layers exist without slots");
	assert(run.documentMock.getElementById(SKIN_ID) !== null, "both layers exist without slots");
}

console.log("smoke test passed ✓");
