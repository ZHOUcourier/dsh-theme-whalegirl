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
const windowMock = {
	__ModuleLoader__: {
		load({ factory }) {
			const requireFn = () => ({});
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

// Wallpaper data URI embedded?
if (!source.includes("data:image/jpeg;base64,")) throw new Error("background data URI missing");

// Reduced-frost defaults + adjustable surfaces live in the emitted stylesheet.
const skinCss = css;
if (!skinCss.includes("backdrop-filter: blur(4px)")) throw new Error("default frame blur should be 4px");
if (/blur\(18px\)/.test(skinCss)) throw new Error("legacy 18px blur must be gone by default");
if (!skinCss.includes("--dsw-alias-bg-base: ") || !skinCss.includes("!important")) {
	throw new Error("adjustable surface overrides missing");
}

// Appearance settings card is wired to the plugin settings slot.
if (!source.includes('"settings.plugin.item"')) throw new Error("settings card slot missing");

console.log("smoke test passed ✓");
