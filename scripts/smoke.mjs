/**
 * Smoke test: evaluate the built client bundle in a mocked DOM and drive
 * apply() through register → guard → dispose.
 * Run: node scripts/smoke.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = readFileSync(join(root, "lib/client.js"), "utf8");

let registered = null;
let setThemeCalls = [];
const listeners = new Map();

class MockClassList {
	constructor() { this.set = new Set(); }
	add(...names) { for (const n of names) this.set.add(n); }
	remove(...names) { for (const n of names) this.set.delete(n); }
}

function makeElement() {
	return {
		id: "",
		dataset: {},
		textContent: "",
		isConnected: false,
		childNodes: [],
		classList: new MockClassList(),
		appendChild(child) {
			child.isConnected = true;
			this.childNodes.push(child);
		},
		append(child) { child.isConnected = true; },
		remove() { this.isConnected = false; },
		setAttribute(name, value) { this.attrs = this.attrs || {}; this.attrs[name] = value; },
		getAttribute(name) { return (this.attrs || {})[name] ?? null; },
		removeAttribute(name) { delete (this.attrs || {})[name]; },
		addEventListener() {},
		removeEventListener() {}
	};
}

const documentMock = {
	head: makeElement(),
	body: makeElement(),
	createElement: () => makeElement(),
	getElementById: () => null
};

const storage = new Map();
const localStorageMock = {
	getItem: (k) => (storage.has(k) ? storage.get(k) : null),
	setItem: (k, v) => storage.set(k, String(v)),
	removeItem: (k) => storage.delete(k)
};

let loadedModule = null;
const reactStub = {
	createElement: (type, props, ...children) => ({ type, props, children }),
	useRef: (value) => ({ current: value }),
	useState: (value) => [value, () => {}]
};
const windowMock = {
	__ModuleLoader__: {
		load({ factory }) {
			// The real factory receives the ModuleLoader's synchronous require;
			// react is one of its platform seeds.
			const requireFn = (id) => (id === "react" ? reactStub : {});
			loadedModule = factory(requireFn);
		}
	},
	localStorage: localStorageMock,
	console
};

const context = vm.createContext({
	window: windowMock,
	document: documentMock,
	localStorage: localStorageMock
});
vm.runInContext(source, context, { filename: "lib/client.js" });

if (loadedModule === null) throw new Error("module was never loaded");
if (loadedModule.isPlugin !== true) throw new Error("isPlugin flag missing");
if (!Array.isArray(loadedModule.inject) || !loadedModule.inject.includes("theme")) {
	throw new Error("inject must include 'theme'");
}
// Strict Cordis throws when an undeclared service is read off the context
// proxy, so slots must be declared before registerAppearanceCard touches it.
if (!loadedModule.inject.includes("slots")) {
	throw new Error("inject must include 'slots'");
}
if (typeof loadedModule.apply !== "function") throw new Error("apply missing");

const effects = [];
const themeService = {
	register(def) {
		registered = def;
		let disposed = false;
		return () => { disposed = true; };
	},
	setTheme(id) { setThemeCalls.push(id); }
};
const ctx = {
	effect(fn, label) { effects.push(label); fn(); return () => {}; },
	on(event, cb) {
		if (!listeners.has(event)) listeners.set(event, []);
		listeners.get(event).push(cb);
		return () => listeners.delete(event);
	},
	get(service) { return service === "theme" ? themeService : undefined; },
	theme: undefined // force the ctx.get path
};

loadedModule.apply(ctx);

// Assertions -----------------------------------------------------------------
if (registered === null) throw new Error("theme.register was not called");
if (registered.id !== "deepseek-whalegirl") throw new Error(`bad id: ${registered.id}`);
if (registered.colorScheme !== "light") throw new Error("colorScheme must be light");

const tokenNames = Object.keys(registered.tokens);
const required = [
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
];
for (const name of required) {
	if (!(name in registered.tokens)) throw new Error(`missing token ${name}`);
	if (registered.tokens[name] === "") throw new Error(`empty token ${name}`);
}
console.log(`tokens registered: ${tokenNames.length}`);

const css = documentMock.head.childNodes?.at?.(-1)?.textContent ?? "";
const styleTag = [...(documentMock.head.childNodes ?? [])];
void styleTag;
if (!documentMock.body.attrs || documentMock.body.attrs["data-dsh-whalegirl"] !== "") {
	throw new Error("body attribute not set");
}
if (setThemeCalls.at(-1) !== "deepseek-whalegirl") throw new Error("setTheme not pinned");
if (!effects.includes("dsh-theme-whalegirl: register")) throw new Error("effect label missing");

// Guard behavior: any foreign preference write re-asserts our theme…
setThemeCalls = [];
for (const cb of listeners.get("theme/change") ?? []) cb({ preference: "system" });
if (setThemeCalls.at(-1) !== "deepseek-whalegirl") throw new Error("guard did not re-assert on system");
setThemeCalls = [];
for (const cb of listeners.get("theme/change") ?? []) cb({ preference: "dark" });
if (setThemeCalls.at(-1) !== "deepseek-whalegirl") throw new Error("guard did not re-assert on explicit pick");

// …and its own change event does not loop.
setThemeCalls = [];
for (const cb of listeners.get("theme/change") ?? []) cb({ preference: "deepseek-whalegirl" });
if (setThemeCalls.length !== 0) throw new Error("guard must ignore its own theme");

// Strict-Cordis host: reading an undeclared service throws on the proxy,
// while ctx.get() stays probeable. The optional settings card must degrade
// instead of aborting apply() (the 0.1.6 white-screen regression).
const strictGetCalls = [];
const strictCtx = new Proxy(
	{
		effect(fn, label) { effects.push(label); fn(); return () => {}; },
		on() { return () => {}; },
		get(service) {
			strictGetCalls.push(service);
			if (service === "theme") return themeService;
			if (service === "slots") return { inject() {}, register() {} };
			return undefined;
		},
		theme: themeService
	},
	{
		get(target, prop) {
			if (Reflect.has(target, prop)) return Reflect.get(target, prop);
			throw new Error(`cannot get property "${String(prop)}" without inject`);
		}
	}
);
setThemeCalls = [];
let strictThrew = null;
try {
	loadedModule.apply(strictCtx);
} catch (error) {
	strictThrew = error;
}
if (strictThrew !== null) {
	throw new Error(`apply must survive strict ctx.slots: ${strictThrew.message}`);
}
if (setThemeCalls.at(-1) !== "deepseek-whalegirl") {
	throw new Error("theme must still apply when ctx.slots is undeclared");
}
if (!strictGetCalls.includes("slots")) {
	throw new Error("slots fallback must use the inject-free ctx.get() probe");
}

// Build marker resolved by scripts/build.mjs (the settings card prints it so a
// stale tab can be told apart from a stale server).
if (source.includes("__WHALEGIRL_BUILD_ID__")) throw new Error("build id placeholder left in bundle");
const buildTag = documentMock.head.childNodes?.at?.(-1);
if (buildTag?.dataset?.build === undefined) throw new Error("style tag must carry data-build");

// Wallpaper data URI embedded?
if (!source.includes("data:image/jpeg;base64,")) throw new Error("background data URI missing");

// Reduced-frost defaults + adjustable surfaces live in the emitted stylesheet.
const skinCss = css;
if (!skinCss.includes("backdrop-filter: blur(1px)")) throw new Error("default frame blur should be 1px");
if (/blur\(18px\)/.test(skinCss)) throw new Error("legacy 18px blur must be gone by default");
if (!skinCss.includes("--dsw-alias-bg-base: ") || !skinCss.includes("!important")) {
	throw new Error("adjustable surface overrides missing");
}

// The settings form is the bundle's own configuration on the installed
// package page; the credits also get a dedicated detail section.
if (!source.includes('"plugins.bundle.config"')) throw new Error("bundle-config slot missing");
if (!source.includes('"plugins.detail.section"')) throw new Error("detail-section slot missing");
if (source.includes("settings.plugin.item")) throw new Error("stale settings.plugin.item slot name");

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

const registeredItems = [];
const disposedItems = [];
const slotsService = {
	inject(slot, factory) {
		if (slot !== "plugins.bundle.config" && slot !== "plugins.detail.section") {
			throw new Error(`unexpected slot: ${slot}`);
		}
		return factory();
	},
	register(options, component) {
		registeredItems.push({ options, component });
		return () => { disposedItems.push(options.name); };
	}
};
const cardCtx = {
	effect(fn, label) { effects.push(label); fn(); return () => {}; },
	on() { return () => {}; },
	get(service) {
		if (service === "theme") return themeService;
		if (service === "slots") return slotsService;
		return undefined;
	},
	theme: themeService
};
loadedModule.apply(cardCtx);

const settingsEntry = registeredItems.find((item) => item.options.name === "plugins.bundle.config");
if (settingsEntry === undefined) throw new Error("plugins.bundle.config entry was not registered");
if (settingsEntry.options.key !== "dsh-theme-whalegirl") throw new Error(`bad bundle key: ${settingsEntry.options.key}`);
const page = settingsEntry.component({ view: "page" });
if (page === null || page === undefined) throw new Error("page view rendered nothing");
const pageText = renderText(page);
for (const needle of ["对话纸面透明度", "出处与授权", "CC BY-NC-SA 4.0", "溟月", "powerdog996"]) {
	if (!pageText.includes(needle)) throw new Error(`settings page missing ${needle}`);
}

const creditsEntry = registeredItems.find((item) => item.options.name === "plugins.detail.section");
if (creditsEntry === undefined) throw new Error("plugins.detail.section entry was not registered");
const creditsForUs = creditsEntry.component({ subject: { kind: "bundle", pkg: { name: "dsh-theme-whalegirl" } } });
const creditsText = renderText(creditsForUs);
if (!creditsText.includes("视觉定型") || !creditsText.includes("ZipZipPipe") || !creditsText.includes("CC BY-NC-SA 4.0")) {
	throw new Error("credits section missing the visual chain");
}
const creditsForOther = creditsEntry.component({ subject: { kind: "bundle", pkg: { name: "another-plugin" } } });
if (creditsForOther !== null) throw new Error("credits section must only render for this package");

// Hosts without plugins.bundle.config still get the old built-in card.
const fallbackItems = [];
const fallbackSlots = {
	inject(slot, factory) {
		if (slot !== "plugins.item") throw new Error(`unexpected fallback slot: ${slot}`);
		return factory();
	},
	register(options, component) {
		fallbackItems.push({ options, component });
		return () => {};
	}
};
const fallbackCtx = {
	effect(fn, label) { effects.push(label); fn(); return () => {}; },
	on() { return () => {}; },
	get(service) {
		if (service === "theme") return themeService;
		if (service === "slots") return fallbackSlots;
		return undefined;
	},
	theme: themeService
};
loadedModule.apply(fallbackCtx);
const fallbackEntry = fallbackItems.find((item) => item.options.name === "plugins.item");
if (fallbackEntry === undefined) throw new Error("plugins.item fallback was not registered");
if (fallbackEntry.options.id !== "whalegirl-appearance") throw new Error(`bad fallback id: ${fallbackEntry.options.id}`);
const fallbackSummary = fallbackEntry.component({ view: "summary" });
if (typeof fallbackSummary !== "string" || fallbackSummary.length === 0) {
	throw new Error("fallback summary must render a one-liner string");
}
const fallbackPage = fallbackEntry.component({ view: "page" });
if (fallbackPage === null || fallbackPage === undefined) throw new Error("fallback page rendered nothing");
if (!renderText(fallbackPage).includes("对话纸面透明度")) throw new Error("fallback page missing conversation control");

if (!skinCss.includes('data-slot="conversation.header"')) {
	throw new Error("conversation-only paper rule missing");
}

// One paper layer: the columns own it on every platform, nested page surfaces
// (conversation root, dock tab host) stay transparent.
for (const rule of ['[class*="_centerCol"]', '[class*="_rightbarCol"]', '[class*="_tabHost"]', '[class*="_root"][data-phase]']) {
	if (!skinCss.includes(rule)) throw new Error(`missing paper-layer rule ${rule}`);
}
if (!/\[class\*="_sidebarCol"\] \{[^}]*--dsw-specific-sidebar-fill: transparent;[^}]*background: #abb4cf/.test(skinCss)) {
	throw new Error("sidebar column must own the wash and blank the inner fill");
}
if (!skinCss.includes('[class*="_tabHost"] {\n  background: transparent;')) {
	throw new Error("dock tab host must stay transparent");
}

console.log("smoke test passed ✓");
