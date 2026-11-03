#!/usr/bin/env node
/**
 * Real-browser check for dsh-theme-whalegirl.
 *
 * The smoke test proves the plugin's logic against a mocked DOM; this one
 * proves the *look* against the engine. Every regression this theme has ever
 * shipped was invisible to the mock: two paper layers stacking to ~99% white,
 * the web sidebar painting a solid wash the desktop never showed, a cold start
 * where a later presenter overwrote the palette. Those are computed-style and
 * race questions, so they are measured here in Chromium on a real DSH web boot.
 *
 * Usage:
 *   dsh --profile <name> --no-open --port 5190     # or DSH_WEB_URL=…
 *   node scripts/browser-check.mjs --url "http://127.0.0.1:5190/?token=…"
 *
 * Options:
 *   --url <url>       DSH web URL to open (required unless DSH_WEB_URL is set;
 *                     include the ?token=… the launcher prints)
 *   --keep            leave the browser open on failure for manual inspection
 *   --shot <path>     write a screenshot (default: browser-check.png in cwd)
 *   --exit-code-only  quiet: only report pass/fail
 *
 * Playwright is not a dependency of this package (the plugin ships dependency-
 * free), so it is resolved from wherever it already exists: a local install,
 * `npm root -g`, or the npx cache. Install it if none is found.
 */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);

function flag(name) {
	const at = args.indexOf(name);
	return at === -1 ? null : args[at + 1];
}

const url = flag("--url") ?? process.env.DSH_WEB_URL ?? null;
if (url === null) {
	console.error(
		"browser-check: no URL. Boot a profile and pass its printed address:\n" +
		"  dsh --profile <name> --no-open --port 5190\n" +
		"  node scripts/browser-check.mjs --url \"http://127.0.0.1:5190/?token=…\""
	);
	process.exit(2);
}
const quiet = args.includes("--exit-code-only");
const shotPath = flag("--shot") ?? "browser-check.png";

/* ------------------------------------------------------------------ *
 * Resolve Playwright without making it a package dependency
 * ------------------------------------------------------------------ */

async function loadChromium() {
	try {
		const mod = await import("playwright");
		return mod.chromium;
	} catch {
		/* fall through to the search below */
	}
	const roots = [process.cwd(), join(homedir(), ".npm", "_npx")];
	const candidates = [];
	try {
		const globalRoot = execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim();
		roots.push(globalRoot);
	} catch {
		/* npm not on PATH */
	}
	for (const root of roots) {
		if (!existsSync(root)) continue;
		if (root.includes("_npx")) {
			for (const entry of readdirSync(root)) {
				candidates.push(join(root, entry, "node_modules", "playwright"));
			}
		} else {
			candidates.push(join(root, "playwright"));
		}
	}
	for (const candidate of candidates) {
		if (!existsSync(candidate)) continue;
		try {
			const require = createRequire(join(candidate, "noop.js"));
			const mod = require(candidate);
			if (mod?.chromium) return mod.chromium;
		} catch {
			/* try the next copy */
		}
	}
	console.error(
		"browser-check: playwright not resolvable. Install it once, e.g.\n" +
		"  npm i -D playwright && npx playwright install chromium"
	);
	process.exit(2);
	return null;
}

/* ------------------------------------------------------------------ *
 * Checks
 * ------------------------------------------------------------------ */

/** Selectors the stylesheet has to hit; the theme reports the same list. */
const REQUIRED_HOOKS = ['[class*="_centerCol"]', '[class*="_sidebarCol"]', '[class$="_frame"]'];

const results = [];

function check(name, pass, detail = "") {
	results.push({ name, pass, detail });
	if (!quiet) {
		const mark = pass ? "ok  " : "FAIL";
		console.log(`${mark} ${name}${detail === "" ? "" : ` — ${detail}`}`);
	}
}

/** #rrggbb → "rgb(r, g, b)"; 8-digit hex → the rgba() Chromium reports. */
function cssColor(hex) {
	const v = hex.replace("#", "");
	if (v.length === 6) {
		return `rgb(${parseInt(v.slice(0, 2), 16)}, ${parseInt(v.slice(2, 4), 16)}, ${parseInt(v.slice(4, 6), 16)})`;
	}
	return `rgba(${parseInt(v.slice(0, 2), 16)}, ${parseInt(v.slice(2, 4), 16)}, ${parseInt(v.slice(4, 6), 16)}, ${(parseInt(v.slice(6, 8), 16) / 255).toFixed(3)})`;
}

const pageEval = () => {
	const body = document.body;
	const cs = getComputedStyle(body);
	const before = getComputedStyle(body, "::before");
	const column = document.querySelector('[class*="_centerCol"]');
	const layer = (id) => {
		const tag = document.getElementById(id);
		return tag === null ? null : {
			build: tag.dataset.build ?? "",
			len: tag.textContent.length,
			hasWallpaper: tag.textContent.includes("data:image/jpeg;base64,")
		};
	};
	const parseAlpha = (color) => {
		const m = /rgba?\([^)]*,\s*([\d.]+)\)/.exec(color);
		return m === null ? 1 : Number(m[1]);
	};
	return {
		armed: body.hasAttribute("data-dsh-whalegirl"),
		color: cs.color,
		backgroundColor: cs.backgroundColor,
		wallpaperImage: before.backgroundImage.slice(0, 30),
		wallpaperDisplay: before.display,
		base: layer("dsh-whalegirl-base"),
		skin: layer("dsh-whalegirl-skin"),
		hooks: {
			needed: ['[class*="_centerCol"]', '[class*="_sidebarCol"]', '[class$="_frame"]',
				'[class*="_rightbarCol"]', '[data-slot="conversation.header"]',
				'[class*="_tabHost"]', '[class*="_root"][data-phase]', '[role="tree"]']
				.filter((selector) => document.querySelector(selector) !== null)
		},
		column: column === null ? null : {
			backgroundColor: getComputedStyle(column).backgroundColor,
			alpha: parseAlpha(getComputedStyle(column).backgroundColor)
		},
		build: (document.getElementById("dsh-whalegirl-skin")?.dataset.build) ?? ""
	};
};

const chromium = await loadChromium();

/**
 * Prefer the Chromium Playwright manages, but fall back to the system Chrome:
 * a checkout that has never run `playwright install` should still be able to
 * answer "does the theme render?", which is the whole point of this script.
 */
async function launchBrowser() {
	try {
		return await chromium.launch({ headless: !args.includes("--keep") });
	} catch (error) {
		if (!/Executable doesn't exist|browserType.launch/.test(String(error?.message))) throw error;
		return chromium.launch({ headless: !args.includes("--keep"), channel: "chrome" });
	}
}

const browser = await launchBrowser();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

const errors = [];
page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
page.on("console", (message) => {
	if (message.type() === "error") errors.push(`console: ${message.text()}`);
});

let exitCode = 0;

try {
	await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
	// The theme pins itself after boot settings are adopted, so give the
	// microtask re-assert and the delayed pins time to land.
	await page.waitForFunction(
		() => document.body.hasAttribute("data-dsh-whalegirl") &&
			document.getElementById("dsh-whalegirl-skin") !== null,
		{ timeout: 15000 }
	).catch(() => {});
	await page.waitForTimeout(3500);

	/* 1. Cold start on a clean browser: the plugin must own the appearance. */
	let state = await page.evaluate(pageEval);
	check("theme mounts on a cold start", state.armed, `build ${state.build}`);
	check("label colour is the palette ink", state.color === cssColor("#352970"), state.color);
	check("paper colour is the rose-tinted base", state.backgroundColor === cssColor("#f9f6f6"), state.backgroundColor);

	/* 2. The two-layer split must hold in the engine, not just in the mock. */
	check("static layer exists", state.base !== null, state.base === null ? "" : `${state.base.len} bytes`);
	check("dynamic layer exists", state.skin !== null, state.skin === null ? "" : `${state.skin.len} bytes`);
	if (state.base !== null && state.skin !== null) {
		check("wallpaper bytes live in the static layer", state.base.hasWallpaper && !state.skin.hasWallpaper,
			`base ${state.base.len} / skin ${state.skin.len} bytes`);
		check("static and dynamic layers carry the same build", state.base.build === state.skin.build && state.base.build !== "", state.base.build);
		check("dynamic layer stays small enough to rewrite per input", state.skin.len < 12000, `${state.skin.len} bytes`);
	}

	/* 3. The wallpaper must actually paint behind the UI. */
	check("wallpaper layer painted behind the UI",
		state.wallpaperImage.startsWith('url("data:image/jpeg;base64') && state.wallpaperDisplay !== "none",
		state.wallpaperImage);

	/* 4. Host hooks: the paper model depends on these class names surviving. */
	const hit = REQUIRED_HOOKS.filter((selector) => state.hooks.needed.includes(selector));
	check("host hooks present", hit.length === REQUIRED_HOOKS.length,
		`${hit.length}/${REQUIRED_HOOKS.length} required · present: ${state.hooks.needed.length}/8`);

	/* 5. One paper layer, translucent enough that the artwork reads through. */
	if (state.column === null) {
		check("conversation column renders", false, "no [class*=\"_centerCol\"] on this page");
	} else {
		check("column carries a single translucent paper layer",
			state.column.alpha > 0.5 && state.column.alpha < 1,
			`alpha ${state.column.alpha.toFixed(3)} (${state.column.backgroundColor})`);
	}

	/* 6. Prefs round-trip: persist, reload, and the engine must follow. */
	const defaultAlpha = state.column?.alpha ?? null;
	await page.evaluate(() => {
		localStorage.setItem("dsh-whalegirl.prefs.v2", JSON.stringify({
			surfaceOpacity: 95,
			conversationOpacity: 95,
			bubbleOpacity: 95,
			veilStrength: 0,
			wallpaperBlur: 6,
			wallpaperY: 20,
			wallpaperZoom: 140
		}));
	});
	await page.reload({ waitUntil: "domcontentloaded" });
	await page.waitForFunction(
		() => document.getElementById("dsh-whalegirl-skin")?.textContent.includes("background-position: 50% 20%"),
		{ timeout: 15000 }
	).catch(() => {});
	await page.waitForTimeout(1500);
	const tuned = await page.evaluate(pageEval);
	check("prefs survive a reload", tuned.armed && tuned.skin !== null);
	check("wallpaper focus applies", await page.evaluate(
		() => document.getElementById("dsh-whalegirl-skin").textContent.includes("background-position: 50% 20%;")
	));
	check("wallpaper zoom applies", await page.evaluate(
		() => document.getElementById("dsh-whalegirl-skin").textContent.includes("transform: scale(1.40);")
	));
	if (defaultAlpha !== null && tuned.column !== null) {
		check("more opacity really means more see-through",
			tuned.column.alpha < defaultAlpha,
			`default ${defaultAlpha.toFixed(3)} → 95% ${tuned.column.alpha.toFixed(3)}`);
	}

	/* 7. Defaults must be reachable again from the card's own reset path. */
	await page.evaluate(() => localStorage.removeItem("dsh-whalegirl.prefs.v2"));
	await page.reload({ waitUntil: "domcontentloaded" });
	await page.waitForTimeout(3000);
	const restored = await page.evaluate(pageEval);
	check("clearing prefs returns the default paper",
		restored.column === null ? false : Math.abs(restored.column.alpha - defaultAlpha) < 0.02,
		restored.column === null ? "column gone" : `alpha ${restored.column.alpha.toFixed(3)} vs ${defaultAlpha?.toFixed(3)}`);

	/* 8. Nothing may throw: a plugin error used to abort the whole web boot. */
	check("no page or console errors", errors.length === 0, errors.slice(0, 3).join(" | "));

	await page.screenshot({ path: shotPath, fullPage: false });
	if (!quiet) console.log(`screenshot: ${shotPath}`);
} catch (error) {
	check("browser check completed", false, error.message);
} finally {
	if (!args.includes("--keep")) await browser.close();
}

const failed = results.filter((entry) => !entry.pass);
if (failed.length > 0) {
	console.error(`browser-check: ${failed.length} of ${results.length} checks failed`);
	exitCode = 1;
} else if (!quiet) {
	console.log(`browser-check: ${results.length} checks passed ✓`);
}

process.exit(exitCode);
