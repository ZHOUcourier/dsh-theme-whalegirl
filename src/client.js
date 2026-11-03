/**
 * DeepSeek-鲸鱼娘 (Whale Girl) theme for the DeepSeek Harness web GUI —
 * browser half. Ported from the DreamSkin skin package
 * (dreamskin.cc/themes/ver_cb557ececaa5de3f3dbe, "DeepSeek-鲸鱼娘").
 *
 * What it does:
 *  - Registers one light theme ("deepseek-whalegirl") into the official
 *    ThemeRuntime with a full --dsw-* token dictionary derived from the
 *    DreamSkin palette (text #352970, highlight #455b78, accent #7a4e29,
 *    accentAlt #ceb683, secondary #85c1cc, panel #abb4cf/#c3cee4, background
 *    #bd9999). The runtime presenter applies the tokens as body inline
 *    variables, so every alias/specific token in the UI follows the palette.
 *  - Layers the whale-girl artwork as an ambient fixed wallpaper behind the
 *    UI. Since 0.2.0 the frosted-glass strength is drastically reduced by
 *    default (frame blur 18px → 4px, sharper surfaces) and every
 *    frost-related parameter is user-adjustable at runtime: frame blur,
 *    surface/bubble translucency, wallpaper veil, wallpaper visibility and
 *    blur, composer focus glow — plus three presets (清爽玻璃 / DreamSkin
 *    原味 / 纯净实底). Since 0.3.0 the form is contributed as the bundle's own
 *    configuration (plugins.bundle.config), so it sits on the installed
 *    package's page rather than the built-in configuration list, and a
 *    conversation-only paper opacity is scoped to the transcript column.
 *  - Two stylesheets, so a slider drag stays cheap. `dsh-whalegirl-base`
 *    carries everything that never changes while the plugin is mounted — the
 *    full token palette and the wallpaper's data URI (≈0.4 MB) — and is written
 *    once. `dsh-whalegirl-skin` carries only the prefs-derived declarations and
 *    is the only tag rewritten on every adjustment.
 *  - A compatibility probe checks the host selectors the paper model depends on
 *    and reports misses in the settings card and the console, because those are
 *    CSS-module derived names: when a host refactor renames one, the theme keeps
 *    working but a surface silently loses its paper.
 *  - The DSH 0.2 shell paints --dsw-alias-bg-base twice over the chat area
 *    (center column + its dock tab host). buildSkinCss() clears the inner
 *    layer so the paper stays a single surface; otherwise the two stacked
 *    alphas composite to ~99% white and the wallpaper disappears behind the
 *    transcript while the sidebar keeps its own wash and still shows it.
 *  - Adjustable surface colors are re-emitted as !important custom-property
 *    overrides on the body attribute, which beat the presenter's inline
 *    tokens without re-registering the theme.
 *  - Gated on the body attribute `data-dsh-whalegirl` so nothing leaks when
 *    the plugin is off.
 *  - Startup-safe on the desktop shell. The durable ui-theme section loads
 *    after plugins and its adoption reverts the preference to the built-in
 *    scheme; on a cold desktop start ui-layout's presenter subscribes after
 *    this plugin, so a synchronous re-assert inside the guard is replayed and
 *    then overwritten by the foreign snapshot of the same dispatch (white
 *    labels over this light paper). The guard therefore re-asserts on a
 *    microtask, with a few delayed pins for a late adoption, and the full
 *    token palette is also emitted as !important body variables — a missed
 *    pin then costs the wallpaper, never the contrast.
 *
 * Selection semantics follow the skin model: activating the plugin pins the
 * theme via theme.setTheme(), and a `theme/change` guard re-asserts it
 * whenever anything else (the built-in Appearance scope, other plugins) writes
 * another preference — including an explicit light/dark pick, because the
 * desktop shell writes exactly that when it adopts its durable ui-theme section
 * after plugins mount. Switching appearance is therefore toggling the plugin in
 * the market Themes tab, and the settings card says so where a user looking for
 * another switch would actually see it.
 */

const THEME_ID = "deepseek-whalegirl";
const BODY_ATTR = "data-dsh-whalegirl";
/** Static layer: token palette + wallpaper bytes. Written once per mount. */
const STYLE_BASE_ID = "dsh-whalegirl-base";
/** Dynamic layer: only the declarations derived from prefs. Rewritten live. */
const STYLE_TAG_ID = "dsh-whalegirl-skin";

/**
 * Ambient whale-girl artwork, injected by scripts/build.mjs from
 * assets/background.jpg as a data URI so the theme works from any install
 * source (npm tarball, GitHub release, git) without asset-serving support.
 */
const BACKGROUND_DATA_URI = "__WHALEGIRL_BACKGROUND_DATA_URI__";

/**
 * Build marker replaced by scripts/build.mjs. The host caches plugin bundles
 * per revision and an already-open tab keeps the module graph it booted with,
 * so "is this tab running the build I just produced?" is otherwise unanswerable
 * from the UI — the settings card prints it and the style tag carries it as
 * data-build.
 */
const BUILD_ID = "__WHALEGIRL_BUILD_ID__";

/* ------------------------------------------------------------------ *
 * User-adjustable appearance preferences (per browser, localStorage)
 * ------------------------------------------------------------------ */

/**
 * v2: 0.2.2 changed the defaults (frame blur 1px, surface opacity 25%) and the
 * paper model. Values written by the v1 key — including the 0% some browsers
 * kept after trying the 纯净实底 preset, which makes every surface solid and
 * hides the wallpaper entirely — would otherwise keep overriding the new
 * defaults on exactly one browser, which reads as "app fine, web broken".
 */
const PREFS_KEY = "dsh-whalegirl.prefs.v2";

/**
 * Defaults ARE the new look: much less frost than the original port.
 *  - frameBlur: app-frame backdrop blur radius in px (hard-coded 18 before 0.2.0).
 *  - surfaceOpacity: 0 = fully opaque surfaces … 100 = most translucent.
 *    Default 25 keeps the paper calm under long transcripts; applies to the
 *    shell, home, menus and other surfaces.
 *  - conversationOpacity: same scale, scoped to the conversation column only.
 *    Default 25 mirrors the current look; raise it to let the wallpaper read
 *    through a long transcript without making every popover translucent.
 *  - bubbleOpacity: same scale for the dusty-rose user bubbles.
 *  - veilStrength: paper veil over the wallpaper (0–100% of the original).
 *  - wallpaperOn / wallpaperBlur: show-hide and blur the artwork itself.
 *  - wallpaperY / wallpaperZoom: vertical focal point and scale of the artwork,
 *    for windows whose aspect ratio crops the subject out of the default crop.
 *  - focusGlow: coffee-accent composer focus ring on/off.
 *  - uiLocale: "auto" follows the browser language; "zh"/"en" force the card.
 */
const DEFAULT_PREFS = Object.freeze({
	frameBlur: 1,
	surfaceOpacity: 25,
	conversationOpacity: 25,
	bubbleOpacity: 60,
	veilStrength: 55,
	wallpaperOn: true,
	wallpaperBlur: 0,
	wallpaperY: 50,
	wallpaperZoom: 100,
	focusGlow: true,
	uiLocale: "auto"
});

const LOCALES = ["auto", "zh", "en"];

function clamp01(n) {
	return Math.max(0, Math.min(1, n));
}

function normalizePrefs(raw) {
	const p = raw !== null && typeof raw === "object" ? raw : {};
	const num = (v, min, max, fallback) => {
		const n = typeof v === "number" ? v : Number(v);
		return Number.isFinite(n)
			? Math.max(min, Math.min(max, Math.round(n)))
			: fallback;
	};
	return {
		frameBlur: num(p.frameBlur, 0, 24, DEFAULT_PREFS.frameBlur),
		surfaceOpacity: num(p.surfaceOpacity, 0, 100, DEFAULT_PREFS.surfaceOpacity),
		conversationOpacity: num(p.conversationOpacity, 0, 100, DEFAULT_PREFS.conversationOpacity),
		bubbleOpacity: num(p.bubbleOpacity, 0, 100, DEFAULT_PREFS.bubbleOpacity),
		veilStrength: num(p.veilStrength, 0, 100, DEFAULT_PREFS.veilStrength),
		wallpaperOn: p.wallpaperOn === false ? false : true,
		wallpaperBlur: num(p.wallpaperBlur, 0, 16, DEFAULT_PREFS.wallpaperBlur),
		wallpaperY: num(p.wallpaperY, 0, 100, DEFAULT_PREFS.wallpaperY),
		wallpaperZoom: num(p.wallpaperZoom, 100, 200, DEFAULT_PREFS.wallpaperZoom),
		focusGlow: p.focusGlow === false ? false : true,
		uiLocale: LOCALES.includes(p.uiLocale) ? p.uiLocale : DEFAULT_PREFS.uiLocale
	};
}

function loadPrefs() {
	try {
		const raw = localStorage.getItem(PREFS_KEY);
		return normalizePrefs(raw === null ? null : JSON.parse(raw));
	} catch {
		return { ...DEFAULT_PREFS };
	}
}

function savePrefs(prefs) {
	try {
		localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
	} catch {
		/* storage unavailable — adjustments stay session-only */
	}
}

/** Live-applier installed by apply(); the settings card pushes through here. */
let applyPrefsHook = null;

function pushPrefs(patch) {
	const next = normalizePrefs({ ...loadPrefs(), ...patch });
	savePrefs(next);
	if (applyPrefsHook !== null) applyPrefsHook(next);
	return next;
}

/**
 * Effective alpha for a design-time translucent surface under opacity t:
 * t=1 → the original design alpha, t=0 → fully opaque.
 */
function surfaceAlpha(designAlpha, t) {
	return 1 - (1 - clamp01(designAlpha)) * clamp01(t);
}

/* ------------------------------------------------------------------ *
 * Color helpers (no dependencies — runs inside the ModuleLoader bundle)
 * ------------------------------------------------------------------ */

function hexToRgb(hex) {
	const v = hex.replace("#", "");
	if (v.length === 3) {
		return [
			parseInt(v[0] + v[0], 16),
			parseInt(v[1] + v[1], 16),
			parseInt(v[2] + v[2], 16)
		];
	}
	return [
		parseInt(v.slice(0, 2), 16),
		parseInt(v.slice(2, 4), 16),
		parseInt(v.slice(4, 6), 16)
	];
}

function clamp255(n) {
	return Math.max(0, Math.min(255, Math.round(n)));
}

function toHex(rgb) {
	return (
		"#" +
		rgb.map((n) => clamp255(n).toString(16).padStart(2, "0")).join("")
	);
}

/** Mix color a into b; t = 0 → a, t = 1 → b. */
function mix(a, b, t) {
	const ca = hexToRgb(a);
	const cb = hexToRgb(b);
	return toHex([
		ca[0] + (cb[0] - ca[0]) * t,
		ca[1] + (cb[1] - ca[1]) * t,
		ca[2] + (cb[2] - ca[2]) * t
	]);
}

/** Hex (#rrggbb) → 8-digit hex (#rrggbbaa) with alpha 0..1. */
function alpha(hex, a) {
	const v = Math.round(Math.max(0, Math.min(1, a)) * 255)
		.toString(16)
		.padStart(2, "0");
	return toHex(hexToRgb(hex)) + v;
}

/* ------------------------------------------------------------------ *
 * Palette — anchors straight from the DreamSkin package's theme.json
 * ------------------------------------------------------------------ */

const INK = "#352970"; // text — deep violet-indigo
const MUTED_INK = "#241d4f"; // text family dark end (from muted #030303 pulled toward ink hue)
const HIGHLIGHT = "#455b78"; // highlight slate blue — brand primary
const ACCENT = "#7a4e29"; // accent coffee brown
const SAND = "#ceb683"; // accentAlt sand — soft warm highlights
const TEAL = "#85c1cc"; // secondary soft teal — info/blue ladder anchor
const ROSE = "#bd9999"; // background key tone — bubbles & washes
const PANEL = "#abb4cf"; // panel periwinkle — sidebar glass
const PANEL_ALT = "#c3cee4"; // panelAlt lighter periwinkle
const LINE = "#d3d3d4"; // hairline gray

/** Near-white paper carrying the rose tint of the wallpaper (#bd9999 lifted). */
const PAPER = mix("#ffffff", ROSE, 0.09);

/**
 * Alpha of --dsw-alias-bg-base at surfaceOpacity 100%. The main column owns
 * this single paper layer (buildSkinCss() clears the dock tab host's copy), so
 * at the default 25% the main surface lands near 0.86 and the wallpaper reads
 * at ~14% — visible, but still under the reading-contrast floor. Menus and
 * dialogs keep their own denser layer tokens.
 */
const BASE_ALPHA = 0.45;

/* ------------------------------------------------------------------ *
 * Token ladders
 * ------------------------------------------------------------------ */

/**
 * Neutral-bluish ramp: PAPER → INK. Percentages calibrate each step against
 * the luminance ordering of the stock light ladder so every consumer of the
 * ladder (labels, surfaces, borders, toasts…) lands at a sensible tone.
 */
const BLUISH_STEPS = [
	["00", 0],
	["50", 0.04],
	["60", 0.06],
	["75", 0.1],
	["100", 0.15],
	["150", 0.21],
	["200", 0.28],
	["250", 0.33],
	["300", 0.4],
	["400", 0.51],
	["500", 0.61],
	["550", 0.66],
	["600", 0.71],
	["700", 0.77],
	["750", 0.81],
	["800", 0.85],
	["850", 0.89],
	["875", 0.92],
	["900", 0.94],
	["950", 0.97],
	["1000", 1]
];

/** Pure-neutral ramp for scrollbars/multi-select: white → muted ink. */
const NEUTRAL_STEPS = [
	["00", 0],
	["50", 0.03],
	["100", 0.08],
	["150", 0.13],
	["200", 0.19],
	["250", 0.23],
	["300", 0.29],
	["400", 0.39],
	["500", 0.49],
	["550", 0.54],
	["600", 0.59],
	["700", 0.66],
	["800", 0.74],
	["850", 0.79],
	["900", 0.84],
	["1000", 1]
];

/** Multi-stop ramp sampler: positions[] in [0,1] across stops [t, color][]. */
function sampleRamp(stops, position) {
	for (let i = 1; i < stops.length; i++) {
		const [t1, c1] = stops[i];
		const [t0, c0] = stops[i - 1];
		if (position <= t1) {
			const span = t1 - t0 || 1;
			return mix(c0, c1, (position - t0) / span);
		}
	}
	return stops[stops.length - 1][1];
}

/** Blue/deepseek family: white → pale teal → TEAL → deep slate-teal → navy. */
const BLUE_STOPS = [
	[0, "#ffffff"],
	[0.22, mix("#ffffff", TEAL, 0.55)],
	[0.45, TEAL],
	[0.62, "#5593a8"],
	[0.78, "#33606f"],
	[1, "#203c47"]
];

/** Warm sand/amber family built from SAND → ACCENT. */
const AMBER_STOPS = [
	[0, "#ffffff"],
	[0.45, SAND],
	[0.62, mix(SAND, ACCENT, 0.45)],
	[1, mix(ACCENT, "#241505", 0.35)]
];

/** Soft sage green family (success states), desaturated for the pastel mood. */
const GREEN_STOPS = [
	[0, "#ffffff"],
	[0.5, "#8fc7a6"],
	[0.68, "#57a37b"],
	[1, "#1f3a2b"]
];

/** Dusty rose-red family (error states), keyed to ROSE instead of pure red. */
const RED_STOPS = [
	[0, "#ffffff"],
	[0.38, "#eecdd3"],
	[0.58, "#cf8492"],
	[0.75, "#b0556a"],
	[1, "#41141f"]
];

function buildTokens() {
	const t = {};

	for (const [step, pos] of BLUISH_STEPS) {
		t[`--dsw-static-neutral-bluish-${step}`] = mix(PAPER, INK, pos);
	}
	for (const [step, pos] of NEUTRAL_STEPS) {
		t[`--dsw-static-neutral-${step}`] = mix("#ffffff", MUTED_INK, pos);
	}
	const blueSteps = [
		["50", 0.07],
		["50p", 0.1],
		["75", 0.14],
		["100", 0.18],
		["300", 0.32],
		["400", 0.48],
		["450", 0.56],
		["500", 0.63],
		["600", 0.72],
		["800", 0.85],
		["900", 0.92],
		["950", 0.97]
	];
	for (const [step, pos] of blueSteps) {
		t[`--dsw-static-blue-${step}`] = sampleRamp(BLUE_STOPS, pos);
		t[`--dsw-static-deepseek-${step}`] = sampleRamp(BLUE_STOPS, Math.max(0.05, pos - 0.03));
	}
	t["--dsw-static-deepseek-200"] = mix(PANEL_ALT, "#ffffff", 0.25);
	t["--dsw-static-deepseek-700-delete"] = sampleRamp(BLUE_STOPS, 0.76);

	const amberSteps = [["100", 0.12], ["400", 0.42], ["500", 0.52], ["600", 0.64], ["900", 0.95]];
	for (const [step, pos] of amberSteps) t[`--dsw-static-amber-${step}`] = sampleRamp(AMBER_STOPS, pos);
	const greenSteps = [["100", 0.12], ["400", 0.42], ["500", 0.56], ["900", 0.95]];
	for (const [step, pos] of greenSteps) t[`--dsw-static-green-${step}`] = sampleRamp(GREEN_STOPS, pos);
	const redSteps = [["50", 0.05], ["100", 0.1], ["400", 0.44], ["500", 0.58], ["600", 0.68], ["900", 0.95]];
	for (const [step, pos] of redSteps) t[`--dsw-static-red-${step}`] = sampleRamp(RED_STOPS, pos);

	/*
	 * Aliases. Registered with the DEFAULT (much-less-frosted) alphas; when
	 * the user adjusts transparency these same keys are re-emitted live as
	 * !important body-level overrides by buildSkinCss() below.
	 */
	const st = DEFAULT_PREFS.surfaceOpacity / 100;
	const bt = DEFAULT_PREFS.bubbleOpacity / 100;
	const sa = (designAlpha) => surfaceAlpha(designAlpha, st);
	const sb = (designAlpha) => surfaceAlpha(designAlpha, bt);

	const bgBase = alpha(PAPER, sa(BASE_ALPHA));
	const layer1 = alpha(mix(PAPER, "#ffffff", 0.35), sa(0.86));
	const layer2 = alpha(mix(PAPER, "#ffffff", 0.5), sa(0.91));
	const layer3 = alpha(mix(PAPER, "#ffffff", 0.62), sa(0.95));
	const overlay = alpha(mix(PAPER, "#ffffff", 0.72), sa(0.96));

	t["--dsw-alias-bg-base"] = bgBase;
	t["--dsw-alias-bg-layer-1"] = layer1;
	t["--dsw-alias-bg-layer-2"] = layer2;
	t["--dsw-alias-bg-layer-3"] = layer3;
	t["--dsw-alias-bg-overlay"] = overlay;
	t["--dsw-alias-bg-module-platform"] = alpha(mix(PANEL, "#ffffff", 0.45), sa(0.82));
	t["--dsw-alias-bg-multi-select"] = alpha(mix(PANEL, "#ffffff", 0.5), sa(0.85));
	t["--dsw-alias-bg-skeleton"] = alpha(INK, 0.06);
	t["--dsw-alias-bg-mask-1"] = alpha(INK, 0.42);
	t["--dsw-alias-bg-mask-2"] = alpha(INK, 0.24);
	t["--dsw-alias-bg-mask-3"] = alpha(INK, 0.55);
	t["--dsw-alias-bg-mask-photo"] = alpha("#171129", 0.88);
	t["--dsw-alias-bg-mask-drop"] = alpha(PAPER, 0.72);

	t["--dsw-alias-border-inverted"] = alpha("#ffffff", 0.14);
	t["--dsw-alias-border-inverted2"] = alpha("#ffffff", 0.08);
	t["--dsw-alias-border-l1"] = alpha(LINE, 0.55);
	t["--dsw-alias-border-l2"] = alpha(LINE, 0.9);
	t["--dsw-alias-border-l2-darkmode-thin"] = alpha(LINE, 0.45);
	t["--dsw-alias-border-l3"] = alpha(mix(LINE, PANEL, 0.5), 1);
	t["--dsw-alias-border-l4"] = alpha(mix(LINE, PANEL, 0.75), 1);

	t["--dsw-alias-brand-primary"] = HIGHLIGHT;
	t["--dsw-alias-brand-primary-invert"] = mix("#ffffff", PAPER, 0.4);
	t["--dsw-alias-brand-primary-new-colorprimary-new-color"] = mix(HIGHLIGHT, TEAL, 0.45);
	t["--dsw-alias-brand-text"] = mix(INK, HIGHLIGHT, 0.35);

	t["--dsw-alias-button-primary-fill"] = HIGHLIGHT;
	t["--dsw-alias-button-primary-hover"] = mix(HIGHLIGHT, "#ffffff", 0.14);
	t["--dsw-alias-button-primary-dimmed"] = alpha(HIGHLIGHT, 0.14);
	t["--dsw-alias-button-contrast-fill"] = mix(INK, HIGHLIGHT, 0.5);
	t["--dsw-alias-button-elevated-fill"] = alpha(mix("#ffffff", PAPER, 0.5), sa(0.94));
	t["--dsw-alias-button-floating-fill"] = alpha(mix("#ffffff", PAPER, 0.35), sa(0.94));
	t["--dsw-alias-button-floating-hover"] = alpha(mix("#ffffff", PAPER, 0.2), sa(0.97));
	t["--dsw-alias-button-ghost-active-border"] = alpha(PANEL, 1);
	t["--dsw-alias-button-ghost-active-fill"] = alpha(mix(PANEL, "#ffffff", 0.55), sa(0.6));
	t["--dsw-alias-button-ghost-active-hover"] = alpha(mix(PANEL, "#ffffff", 0.4), sa(0.7));
	t["--dsw-alias-button-info-fill"] = t["--dsw-static-blue-500"];
	t["--dsw-alias-button-info-hover"] = t["--dsw-static-blue-400"];
	t["--dsw-alias-button-tool-bar-fill"] = alpha(mix(PANEL, "#545557", 0.35), 0.55);
	t["--dsw-alias-button-tool-bar-fill-invisible"] = alpha(INK, 0.3);
	t["--dsw-alias-button-tool-bar-hover"] = alpha(mix(PANEL, "#545557", 0.35), 0.65);

	t["--dsw-alias-interactive-bg-hover"] = alpha(HIGHLIGHT, 0.07);
	t["--dsw-alias-interactive-bg-hover-accent"] = alpha(ACCENT, 0.13);
	t["--dsw-alias-interactive-bg-hover-danger"] = alpha(t["--dsw-static-red-400"], 0.12);
	t["--dsw-alias-interactive-bg-hover-solid"] = alpha(mix(PANEL, "#ffffff", 0.35), sa(0.9));
	t["--dsw-alias-interactive-bg-active"] = alpha(HIGHLIGHT, 0.13);

	t["--dsw-alias-label-primary"] = INK;
	t["--dsw-alias-label-primary-bluish"] = sampleRamp(BLUE_STOPS, 0.93);
	t["--dsw-alias-label-primary-dimmed"] = mix(INK, PAPER, 0.3);
	t["--dsw-alias-label-primary-foreground"] = mix("#ffffff", PAPER, 0.4);
	t["--dsw-alias-label-primary-inverted"] = mix("#ffffff", PAPER, 0.4);
	t["--dsw-alias-label-secondary"] = t["--dsw-static-neutral-bluish-700"];
	t["--dsw-alias-label-tertiary"] = t["--dsw-static-neutral-bluish-600"];
	t["--dsw-alias-label-caption"] = t["--dsw-static-neutral-bluish-500"];
	t["--dsw-alias-label-dimmed"] = t["--dsw-static-neutral-bluish-300"];

	t["--dsw-alias-markdown-citation"] = alpha(PANEL, 0.35);
	t["--dsw-alias-markdown-code-block"] = alpha(mix(PANEL_ALT, "#ffffff", 0.55), sa(0.9));
	t["--dsw-alias-markdown-code-block-banner"] = alpha(mix(PANEL_ALT, "#ffffff", 0.4), sa(0.92));
	t["--dsw-alias-markdown-code-segment-selected"] = alpha("#ffffff", 0.85);
	t["--dsw-alias-markdown-code-segment-unselected"] = alpha(mix(PANEL_ALT, "#ffffff", 0.3), sa(0.75));
	t["--dsw-alias-markdown-inline-code"] = alpha(TEAL, 0.2);
	t["--dsw-alias-markdown-placeholder"] = t["--dsw-static-neutral-bluish-300"];
	t["--dsw-alias-markdown-tag"] = alpha(SAND, 0.4);

	t["--dsw-alias-scrollbar-bg-l1"] = t["--dsw-static-neutral-200"];
	t["--dsw-alias-scrollbar-bg-l2"] = t["--dsw-static-neutral-200"];
	t["--dsw-alias-scrollbar-hover-l1"] = t["--dsw-static-neutral-300"];
	t["--dsw-alias-scrollbar-hover-l2"] = t["--dsw-static-neutral-300"];

	t["--dsw-alias-state-business-primary"] = t["--dsw-static-deepseek-450"];
	t["--dsw-alias-state-business-tertiary"] = alpha(PANEL_ALT, 0.55);
	t["--dsw-alias-state-error-primary"] = t["--dsw-static-red-600"];
	t["--dsw-alias-state-error-secondary"] = t["--dsw-static-red-400"];
	t["--dsw-alias-state-success-primary"] = t["--dsw-static-green-500"];
	t["--dsw-alias-state-success-secondary"] = t["--dsw-static-green-400"];
	t["--dsw-alias-state-success-tertiary"] = t["--dsw-static-green-100"];
	t["--dsw-alias-state-warn-label"] = t["--dsw-static-amber-600"];
	t["--dsw-alias-state-warn-primary"] = t["--dsw-static-amber-500"];
	t["--dsw-alias-state-warn-secondary"] = t["--dsw-static-amber-400"];
	t["--dsw-alias-state-warn-tertiary"] = t["--dsw-static-amber-100"];

	t["--dsw-alias-toast-bg"] = alpha(t["--dsw-static-neutral-bluish-850"], 0.96);
	t["--dsw-alias-tooltip-bg"] = alpha(t["--dsw-static-neutral-bluish-800"], 0.96);

	/* Specifics — the signature Whale Girl touches. */
	t["--dsw-specific-sidebar-fill"] = alpha(PANEL, sa(0.34)); // periwinkle glass over wallpaper
	t["--dsw-specific-sidebar-nav-item-active"] = alpha(mix("#ffffff", PANEL, 0.25), sa(0.66));
	t["--dsw-specific-sidebar-nav-item-active-accent"] = SAND;
	t["--dsw-specific-sidebar-nav-item-hover"] = alpha(mix("#ffffff", PANEL, 0.15), sa(0.5));
	t["--dsw-specific-bubble"] = alpha(ROSE, sb(0.34)); // dusty-rose user bubbles
	t["--dsw-specific-bubble-highlight"] = alpha(mix(ROSE, SAND, 0.35), sb(0.45));
	t["--dsw-specific-input-major"] = alpha(mix("#ffffff", PAPER, 0.3), sa(0.78));
	t["--dsw-specific-login-input"] = alpha(mix("#ffffff", PAPER, 0.5), sa(0.9));
	t["--dsw-specific-menu"] = alpha(mix("#ffffff", PANEL_ALT, 0.35), sa(0.97));
	t["--dsw-specific-selector"] = alpha(mix("#ffffff", PANEL_ALT, 0.45), sa(0.94));
	t["--dsw-specific-tip"] = alpha(mix("#ffffff", PANEL_ALT, 0.4), sa(0.92));

	/* Shadows & gradients, violet-keyed instead of pure black. */
	t["--dsw-shadow-lv1"] = `0 2px 4px 0 ${alpha(INK, 0.06)}`;
	t["--dsw-shadow-lv1-blur"] = `0 4px 12px 0 ${alpha(INK, 0.05)}`;
	t["--dsw-shadow-lv2"] = `0 4px 12px 0 ${alpha(INK, 0.05)}, 0 2px 8px 0 ${alpha(INK, 0.06)}`;
	t["--dsw-shadow-lv3"] = `0 2px 4px 0 ${alpha(INK, 0.04)}, 0 0 4px 0 ${alpha(INK, 0.03)}, 0 12px 32px 0 ${alpha(INK, 0.13)}`;
	t["--dsw-linear-gradient-think"] = `linear-gradient(180deg, ${mix("#ffffff", PAPER, 0.5)} 20.19%, ${alpha(PAPER, 0)} 100%)`;
	t["--dsw-linear-think-select"] = `linear-gradient(180deg, ${mix("#ffffff", PANEL_ALT, 0.35)} 20.19%, ${alpha(PANEL_ALT, 0)} 100%)`;
	t["--dsw-mask-blur"] = "blur(2px)";

	return t;
}

const TOKENS = buildTokens();

/* ------------------------------------------------------------------ *
 * Stylesheets — every rule is gated on the body attribute, so nothing
 * leaks when the plugin is off. Surface overrides use !important so they
 * beat the theme presenter's inline body variables without re-registering.
 *
 * Two tags, because the wallpaper rides along: buildBaseCss() is
 * prefs-independent and written once per mount, buildSkinCss(prefs) holds
 * only what the sliders move. Re-serialising the 0.4 MB data URI on every
 * input event is what made the sliders stutter. The skin tag is appended
 * after the base tag, so equal-specificity !important declarations still
 * resolve in the skin tag's favour.
 * ------------------------------------------------------------------ */

/**
 * Static layer: the palette, the wallpaper bytes and the prefs-independent
 * touches.
 *
 * The palette is pinned here, not only in the theme runtime. On desktop the
 * shell can present its built-in scheme after this plugin's theme was selected
 * (boot settings adoption, a presenter that mounts later), and its near-white
 * labels then sit on this plugin's light paper. These declarations beat both
 * the built-in palette sheets and the presenter's inline variables for as long
 * as the plugin owns the body attribute, so a missed re-assert can cost the
 * wallpaper, never the contrast.
 */
function buildBaseCss() {
	const tokenDecls = Object.entries(TOKENS)
		.map(([name, value]) => `  ${name}: ${value} !important;`)
		.join("\n");

	return `
html:has(body[${BODY_ATTR}]) {
  color-scheme: light !important;
}
body[${BODY_ATTR}] {
  color: ${INK};
  background-color: ${PAPER};
${tokenDecls}
}
/* Ambient wallpaper layer. Focus point, zoom and blur are sliders and live
   in the skin tag; these defaults keep the layer sane if it is ever missing. */
body[${BODY_ATTR}]::before {
  content: "";
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background-image: url("${BACKGROUND_DATA_URI}");
  background-size: cover;
  background-position: 50% 50%;
  background-repeat: no-repeat;
}
body[${BODY_ATTR}] [id="root"] {
  background: transparent;
}
/* Frosted sidebar surface (intent of the DreamSkin safe-css block). */
body[${BODY_ATTR}] [role="tree"] {
  border-radius: 14px;
}
body[${BODY_ATTR}] [role="treeitem"] {
  border-radius: 12px;
  transition: background-color 0.14s ease, box-shadow 0.14s ease;
}
body[${BODY_ATTR}] [role="treeitem"][aria-selected="true"] {
  box-shadow: inset 3px 0 0 var(--dsw-specific-sidebar-nav-item-active-accent);
}
body[${BODY_ATTR}] ::selection {
  background: ${alpha(SAND, 0.55)};
  color: ${INK};
}
@media (prefers-reduced-motion: reduce) {
  body[${BODY_ATTR}] [role="treeitem"] { transition: none; }
}
@media print {
  body[${BODY_ATTR}]::before,
  body[${BODY_ATTR}]::after { display: none; }
}`;
}

function buildSkinCss(prefs) {
	const st = prefs.surfaceOpacity / 100;
	const ct = prefs.conversationOpacity / 100;
	const bt = prefs.bubbleOpacity / 100;
	const vs = prefs.veilStrength / 100;
	const sa = (designAlpha) => surfaceAlpha(designAlpha, st);
	const sc = (designAlpha) => surfaceAlpha(designAlpha, ct);
	const sb = (designAlpha) => surfaceAlpha(designAlpha, bt);
	const wallBlur = prefs.wallpaperBlur;
	const wallInset = wallBlur > 0 ? `${-(wallBlur * 2)}px` : "0";

	const parts = [];

	/* Live-adjustable surfaces — beat the identical base-palette values. */
	parts.push(`body[${BODY_ATTR}] {
  --dsw-alias-bg-base: ${alpha(PAPER, sa(BASE_ALPHA))} !important;
  --dsw-alias-bg-layer-1: ${alpha(mix(PAPER, "#ffffff", 0.35), sa(0.86))} !important;
  --dsw-alias-bg-layer-2: ${alpha(mix(PAPER, "#ffffff", 0.5), sa(0.91))} !important;
  --dsw-alias-bg-layer-3: ${alpha(mix(PAPER, "#ffffff", 0.62), sa(0.95))} !important;
  --dsw-alias-bg-overlay: ${alpha(mix(PAPER, "#ffffff", 0.72), sa(0.96))} !important;
  --dsw-alias-bg-module-platform: ${alpha(mix(PANEL, "#ffffff", 0.45), sa(0.82))} !important;
  --dsw-alias-bg-multi-select: ${alpha(mix(PANEL, "#ffffff", 0.5), sa(0.85))} !important;
  --dsw-alias-button-elevated-fill: ${alpha(mix("#ffffff", PAPER, 0.5), sa(0.94))} !important;
  --dsw-alias-button-floating-fill: ${alpha(mix("#ffffff", PAPER, 0.35), sa(0.94))} !important;
  --dsw-alias-button-floating-hover: ${alpha(mix("#ffffff", PAPER, 0.2), sa(0.97))} !important;
  --dsw-alias-button-ghost-active-fill: ${alpha(mix(PANEL, "#ffffff", 0.55), sa(0.6))} !important;
  --dsw-alias-button-ghost-active-hover: ${alpha(mix(PANEL, "#ffffff", 0.4), sa(0.7))} !important;
  --dsw-alias-interactive-bg-hover-solid: ${alpha(mix(PANEL, "#ffffff", 0.35), sa(0.9))} !important;
  --dsw-alias-markdown-code-block: ${alpha(mix(PANEL_ALT, "#ffffff", 0.55), sa(0.9))} !important;
  --dsw-alias-markdown-code-block-banner: ${alpha(mix(PANEL_ALT, "#ffffff", 0.4), sa(0.92))} !important;
  --dsw-alias-markdown-code-segment-unselected: ${alpha(mix(PANEL_ALT, "#ffffff", 0.3), sa(0.75))} !important;
  --dsw-specific-sidebar-fill: ${alpha(PANEL, sa(0.34))} !important;
  --dsw-specific-sidebar-nav-item-active: ${alpha(mix("#ffffff", PANEL, 0.25), sa(0.66))} !important;
  --dsw-specific-sidebar-nav-item-hover: ${alpha(mix("#ffffff", PANEL, 0.15), sa(0.5))} !important;
  --dsw-specific-input-major: ${alpha(mix("#ffffff", PAPER, 0.3), sa(0.78))} !important;
  --dsw-specific-login-input: ${alpha(mix("#ffffff", PAPER, 0.5), sa(0.9))} !important;
  --dsw-specific-menu: ${alpha(mix("#ffffff", PANEL_ALT, 0.35), sa(0.97))} !important;
  --dsw-specific-selector: ${alpha(mix("#ffffff", PANEL_ALT, 0.45), sa(0.94))} !important;
  --dsw-specific-tip: ${alpha(mix("#ffffff", PANEL_ALT, 0.4), sa(0.92))} !important;
  --dsw-specific-bubble: ${alpha(ROSE, sb(0.34))} !important;
  --dsw-specific-bubble-highlight: ${alpha(mix(ROSE, SAND, 0.35), sb(0.45))} !important;
}`);

	if (prefs.wallpaperOn) {
		parts.push(`body[${BODY_ATTR}]::before {
  inset: ${wallInset};
  background-position: 50% ${prefs.wallpaperY}%;${wallBlur > 0 ? `\n  filter: blur(${wallBlur}px);` : ""}${prefs.wallpaperZoom !== 100 ? `\n  transform: scale(${(prefs.wallpaperZoom / 100).toFixed(2)});` : ""}
}`);
		parts.push(`/* Soft paper veil so text keeps contrast over busy areas of the artwork. */
body[${BODY_ATTR}]::after {
  content: "";
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background:
    linear-gradient(180deg, ${alpha(PAPER, 0.34 * vs)} 0%, ${alpha(PAPER, 0.1 * vs)} 45%, ${alpha(PAPER, 0.22 * vs)} 100%);
}`);
	} else {
		parts.push(`body[${BODY_ATTR}]::before,
body[${BODY_ATTR}]::after { display: none; }`);
	}

	/*
	 * One paper layer per column. The shell paints --dsw-alias-bg-base on the
	 * columns only under the macOS titlebar layout, and each page inside (the
	 * conversation root, a docked tab host) paints that same token again. On
	 * macOS the two layers compose to ~94% white; in the browser build the
	 * column has no background at all, so clearing the inner layer left the
	 * transcript sitting on bare artwork. Normalize instead: every column owns
	 * the paper, nested page surfaces stay transparent — the paper then measures
	 * the same on the desktop app and in a browser.
	 */
	parts.push(`body[${BODY_ATTR}] [class*="_centerCol"],
body[${BODY_ATTR}] [class*="_rightbarCol"] {
  background-color: var(--dsw-alias-bg-base);
}
/* Conversation-only paper. The transcript column is the only surface that
   hosts a conversation header; scoping the token here lets the dedicated
   slider change long-transcript paper without touching home, menus or the
   plugin pages, which keep the global surface setting. */
body[${BODY_ATTR}] [class*="_centerCol"]:has([data-slot="conversation.header"]) {
  --dsw-alias-bg-base: ${alpha(PAPER, sc(BASE_ALPHA))} !important;
}
body[${BODY_ATTR}] [class*="_tabHost"] {
  background: transparent;
}
/* The conversation root carries its own paper layer; the column already has one. */
body[${BODY_ATTR}] [class*="_root"][data-phase] {
  background-color: transparent;
}
body[${BODY_ATTR}] :has(> [data-slot="conversation.header"]) {
  background-color: transparent;
}
/* Sidebar wash. Two elements paint --dsw-specific-sidebar-fill here: the layout
   column and the sidebar's own root (dsh-client-ui-sidebar), and the shell only
   blanks that root under [data-platform=darwin] — so in a browser the root
   covers the column with the raw token at full strength, which is why the web
   sidebar looked solid while the app showed the wallpaper. Zero the token inside
   the column and paint the wash once, from the column, as a plain colour (no
   color-mix, so any engine resolves it). */
body[${BODY_ATTR}] [class*="_sidebarCol"] {
  --dsw-specific-sidebar-fill: transparent;
  background: ${alpha(PANEL, sa(0.34) * 0.4)};
}`);

	if (prefs.frameBlur > 0) {
		parts.push(`/* The three-column app frame carries a CSS-module class ending in _frame. */
body[${BODY_ATTR}] [class$="_frame"] {
  background-color: transparent;
  backdrop-filter: blur(${prefs.frameBlur}px) saturate(1.05);
  -webkit-backdrop-filter: blur(${prefs.frameBlur}px) saturate(1.05);
}`);
	} else {
		parts.push(`body[${BODY_ATTR}] [class$="_frame"] {
  background-color: transparent;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}`);
	}

	if (prefs.focusGlow) {
		parts.push(`/* Coffee-accent composer focus ring (DreamSkin composer:focus-visible). */
body[${BODY_ATTR}] :is(textarea, [contenteditable="true"], input:not([type])):focus-visible {
  border-color: ${ACCENT};
  outline: none;
  box-shadow: 0 0 0 3px ${alpha(ACCENT, 0.18)};
}`);
	}

	return parts.join("\n");
}

/* ------------------------------------------------------------------ *
 * Appearance settings entry — the bundle's own configuration page
 * (plugins.bundle.config, keyed by the package name), so the form appears on
 * the installed package's page rather than the built-in configuration list.
 * Hosts without that slot keep the older plugins.item card as a fallback. The
 * credits also register a plugins.detail.section so the source and license
 * chain survive even when the settings form is not open. Everything is
 * hand-built React reached through the ModuleLoader's synchronous require;
 * any failure stays local so the theme still applies without the entry.
 * ------------------------------------------------------------------ */

const PKG_NAME = "dsh-theme-whalegirl";
const SETTINGS_SLOT = "plugins.bundle.config";
const CREDITS_SLOT = "plugins.detail.section";
const FALLBACK_SLOT = "plugins.item";
const CARD_KEY = "whalegirl-appearance";
const CREDITS_KEY = "whalegirl-credits";

/** Latest DSH release the paper model and settings slots were verified on. */
const TESTED_DSH = "0.2.1-rc.5";

/**
 * Host selectors the stylesheet has to hit for the paper model to work. They
 * are CSS-module derived names, so a host refactor can rename one without this
 * plugin ever throwing — a surface just silently loses its paper. Probing them
 * turns that into a line the user can read and quote in an issue.
 *
 * `optional` marks hooks that legitimately may not exist on the page currently
 * open (a docked tab, a conversation header), so they never count as a failure.
 */
const HOOK_PROBES = [
	{ selector: '[class*="_centerCol"]' },
	{ selector: '[class*="_sidebarCol"]' },
	{ selector: '[class$="_frame"]' },
	{ selector: '[class*="_rightbarCol"]', optional: true },
	{ selector: '[data-slot="conversation.header"]', optional: true },
	{ selector: '[class*="_tabHost"]', optional: true },
	{ selector: '[class*="_root"][data-phase]', optional: true },
	{ selector: '[role="tree"]', optional: true }
];

const REQUIRED_HOOKS = HOOK_PROBES.filter((probe) => !probe.optional).length;

function runHookCheck() {
	const missing = [];
	for (const probe of HOOK_PROBES) {
		let found = false;
		try {
			found = typeof document.querySelector === "function" &&
				document.querySelector(probe.selector) !== null;
		} catch {
			found = false;
		}
		if (!found && !probe.optional) missing.push(probe.selector);
	}
	return { hit: REQUIRED_HOOKS - missing.length, total: REQUIRED_HOOKS, missing };
}

let hooksWarned = false;

function reportHooks() {
	const report = runHookCheck();
	if (report.missing.length > 0 && !hooksWarned) {
		hooksWarned = true;
		console.warn(
			`dsh-theme-whalegirl: ${report.missing.length} host hook(s) not present —` +
			` ${report.missing.join(", ")}. A surface may keep the stock background.` +
			` If the host is newer than ${TESTED_DSH}, please open an issue.`
		);
	}
	return report;
}

const CARD_PRESETS = [
	["fresh", DEFAULT_PREFS],
	["dreamskin", { frameBlur: 18, surfaceOpacity: 100, conversationOpacity: 100, bubbleOpacity: 100, veilStrength: 100, wallpaperOn: true, wallpaperBlur: 0, focusGlow: true }],
	["solid", { frameBlur: 0, surfaceOpacity: 0, conversationOpacity: 0, bubbleOpacity: 30, veilStrength: 40, wallpaperOn: true, wallpaperBlur: 0, focusGlow: true }]
];

/* ------------------------------------------------------------------ *
 * Card copy — the plugin ships bilingual docs, so the form follows the
 * browser language unless the user pins one.
 * ------------------------------------------------------------------ */

const UI = {
	zh: {
		label: "鲸鱼娘 · 玻璃与壁纸",
		summary: "鲸鱼娘主题：环境壁纸、玻璃强度、对话纸面与输入框聚焦光晕。代码 MIT，插画 CC BY-NC-SA 4.0。",
		pinNote: "本主题会持续取回自己：在内置外观里选亮/暗也会被取回。想换回内置外观，请在插件列表里停用 dsh-theme-whalegirl。",
		preset: ["预设", "一键切换整体风格，之后仍可逐项微调。"],
		restore: "恢复默认",
		language: ["界面语言", "默认跟随宿主界面语言（不是浏览器语言），点这里可固定为中/英。"],
		compat: (hit, total, missing) => `宿主适配 ${hit}/${total}${missing.length > 0 ? ` · 未命中：${missing.join("、")}` : " · 全部命中"} · 实测 DSH ${TESTED_DSH}`,
		status: (p, build) => `当前：模糊 ${p.frameBlur}px · 表面 ${p.surfaceOpacity}% · 对话 ${p.conversationOpacity}% · 气泡 ${p.bubbleOpacity}% · 壁纸${p.wallpaperOn ? "开" : "关"} · 构建 ${build}`,
		presetNames: { fresh: "清爽玻璃（默认）", dreamskin: "DreamSkin 原味", solid: "纯净实底" },
		fields: {
			frameBlur: ["主框背景模糊", (v) => `应用主框毛玻璃的模糊半径，当前 ${v}px；0 为关闭。`, 24, 1],
			surfaceOpacity: ["表面透明度", (v) => `全局纸面的透出程度，当前 ${v}%；0 为实底，100 最通透。`, 100, 5],
			conversationOpacity: ["对话纸面透明度", (v) => `仅影响对话消息区的纸面，当前 ${v}%；0 为实底，100 最通透。首页、插件页仍用上面的全局设置。`, 100, 5],
			bubbleOpacity: ["用户气泡透明度", (v) => `玫瑰色气泡的透出程度，当前 ${v}%。`, 100, 5],
			veilStrength: ["壁纸遮罩浓度", (v) => `壁纸上方的纸色薄纱强度，当前 ${v}%；0 为无遮罩。`, 100, 5],
			wallpaperY: ["壁纸焦点上下", (v) => `壁纸在可视区域内的垂直位置，当前 ${v}%；主体被裁掉时用它找回来。`, 100, 5],
			wallpaperZoom: ["壁纸缩放", (v) => `壁纸放大比例，当前 ${v}%；只在窗口很窄、画被 cover 裁切时用到。`, 200, 10, 100],
			wallpaperBlur: ["壁纸模糊", (v) => `柔化插画细节，当前 ${v}px。`, 16, 1],
			wallpaperOn: ["显示环境壁纸", "关闭后回到纯净纸色背景。"],
			focusGlow: ["输入框咖啡色聚焦光晕", "DreamSkin 原版的输入框聚焦描边与光圈。"]
		},
		credits: {
			title: "出处与授权",
			// Segments render in order: a bare string is copy, { link } is an
			// anchor into CREDITS_LINKS keyed by the label in `names`.
			visual: ["视觉定型：B站UP主“", { link: "shangshan" }, "”生成了原创角色“", { link: "mingyue" }, "”，后由UP主", { link: "zip" }, "融入 DeepSeek 元素换上女仆装。"],
			license: ["遵守 ", { link: "cc" }, " 协议（署名、非商用、相同方式共享）。"],
			dreamskin: ["DreamSkin 皮肤包：", { link: "dreamskin" }, "（作者 powerdog996）。本插件代码 MIT；随包插画/视觉 CC BY-NC-SA 4.0。完整出处见本页底部。"],
			dreamskinFull: ["DreamSkin 皮肤包：", { link: "dreamskin" }, "（作者 powerdog996，包 ver_cb557ececaa5de3f3dbe；页面标注 MIT）。本插件只移植其配色与视觉意图，插画/角色视觉仍按 CC BY-NC-SA 4.0 处理。"],
			code: "本插件代码 MIT；随包插画/视觉 CC BY-NC-SA 4.0。",
			names: { shangshan: "上善无形", mingyue: "溟月", zip: "ZipZipPipe", cc: "CC BY-NC-SA 4.0", dreamskin: "DeepSeek-鲸鱼娘" }
		}
	},
	en: {
		label: "Whale Girl · Glass & Wallpaper",
		summary: "Whale Girl theme: ambient wallpaper, glass strength, conversation paper and composer focus glow. Code MIT, artwork CC BY-NC-SA 4.0.",
		pinNote: "This theme keeps re-asserting itself: an explicit light/dark pick in the built-in Appearance gets reclaimed too. To go back to the built-in appearance, disable dsh-theme-whalegirl in the plugin list.",
		preset: ["Preset", "One click for the whole look; every control stays adjustable."],
		restore: "Restore defaults",
		language: ["Language", "Follows the host UI language (not the browser one); click to pin English or Chinese."],
		compat: (hit, total, missing) => `Host hooks ${hit}/${total}${missing.length > 0 ? ` · missing: ${missing.join(", ")}` : " · all present"} · tested on DSH ${TESTED_DSH}`,
		status: (p, build) => `Now: blur ${p.frameBlur}px · surface ${p.surfaceOpacity}% · conversation ${p.conversationOpacity}% · bubble ${p.bubbleOpacity}% · wallpaper ${p.wallpaperOn ? "on" : "off"} · build ${build}`,
		presetNames: { fresh: "Fresh glass (default)", dreamskin: "DreamSkin original", solid: "Solid paper" },
		fields: {
			frameBlur: ["App-frame blur", (v) => `Backdrop blur radius of the app frame, now ${v}px; 0 turns it off.`, 24, 1],
			surfaceOpacity: ["Surface opacity", (v) => `How much the global paper shows through, now ${v}%; 0 is solid, 100 is most open.`, 100, 5],
			conversationOpacity: ["Conversation paper", (v) => `Scoped to the transcript column only, now ${v}%; home, menus and plugin pages keep the global setting above.`, 100, 5],
			bubbleOpacity: ["User bubble opacity", (v) => `How translucent the dusty-rose bubbles are, now ${v}%.`, 100, 5],
			veilStrength: ["Wallpaper veil", (v) => `Strength of the paper veil over the artwork, now ${v}%; 0 is no veil.`, 100, 5],
			wallpaperY: ["Wallpaper focus (vertical)", (v) => `Vertical position of the artwork in the viewport, now ${v}%; use it when the default crop cuts the subject off.`, 100, 5],
			wallpaperZoom: ["Wallpaper zoom", (v) => `Scale of the artwork, now ${v}%; mainly useful in narrow windows where cover crops hard.`, 200, 10, 100],
			wallpaperBlur: ["Wallpaper blur", (v) => `Softens the artwork itself, now ${v}px.`, 16, 1],
			wallpaperOn: ["Show ambient wallpaper", "Off leaves a plain paper background."],
			focusGlow: ["Coffee composer focus glow", "The DreamSkin composer focus ring and halo."]
		},
		credits: {
			title: "Source & license",
			visual: ["Visual identity: the original character ", { link: "mingyue" }, " (Mingyue) was created by Bilibili creator ", { link: "shangshan" }, "; Bilibili creator ", { link: "zip" }, " later combined her with DeepSeek elements and the maid outfit."],
			license: ["Licensed under ", { link: "cc" }, " (attribution, non-commercial, share-alike)."],
			dreamskin: ["DreamSkin package: ", { link: "dreamskin" }, " by powerdog996. Plugin code MIT; bundled artwork and visual CC BY-NC-SA 4.0. Full credits at the bottom of this page."],
			dreamskinFull: ["DreamSkin package: ", { link: "dreamskin" }, " by powerdog996 (build ver_cb557ececaa5de3f3dbe, listed there as MIT). This plugin ports its palette and visual intent; the character and artwork stay under the original CC BY-NC-SA 4.0 terms."],
			code: "Plugin code MIT; bundled artwork and visual identity CC BY-NC-SA 4.0.",
			names: { shangshan: "上善无形", mingyue: "溟月", zip: "ZipZipPipe", cc: "CC BY-NC-SA 4.0", dreamskin: "DeepSeek-鲸鱼娘" }
		}
	}
};

/**
 * Card language. The host's own UI language is the signal that matters: the
 * desktop shell renders Chinese while its Electron renderer reports
 * `navigator.language: "en"`, so trusting the navigator alone would put an
 * English card in the middle of a Chinese app. `<html lang>` is set by the host
 * for its own localization, so it comes first and the navigator is only a
 * fallback for hosts that never set it.
 */
function resolveLocale(prefs) {
	if (prefs !== null && (prefs.uiLocale === "zh" || prefs.uiLocale === "en")) return prefs.uiLocale;
	const tags = [];
	try {
		const hostLang = String(document.documentElement.lang || "");
		if (hostLang !== "") tags.push(hostLang);
	} catch {
		/* no document (tests) */
	}
	try {
		if (typeof navigator !== "undefined") {
			for (const tag of [navigator.language, ...(navigator.languages || [])]) {
				if (typeof tag === "string" && tag !== "") tags.push(tag);
			}
		}
	} catch {
		/* no navigator */
	}
	const first = tags.find((tag) => /^(zh|en)/i.test(tag));
	if (first === undefined) return "zh";
	return /^zh/i.test(first) ? "zh" : "en";
}

const CREDITS_LINKS = {
	shangshan: "https://www.bilibili.com/opus/1231977657712771073",
	zip: "https://space.bilibili.com/4168597/",
	dreamskin: "https://dreamskin.cc/themes/ver_cb557ececaa5de3f3dbe",
	cc: "https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh-hans"
};

/**
 * React comes from the host's module table: the bundle runs inside the
 * ModuleLoader factory, whose synchronous require resolves the platform
 * seeds (react is one). A native import("react") has no import map to
 * satisfy the bare specifier and always rejects in the browser.
 */
function loadReact() {
	try {
		if (typeof require === "function") return require("react");
	} catch {
		/* source imported directly (tests) — no module table */
	}
	return null;
}

function createAppearanceCardModule(React) {
	const h = React.createElement;

	const pageStyle = { display: "grid", gap: 16, maxWidth: 560 };
	const rowStyle = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20 };
	const labelStyle = { display: "block", fontWeight: 600, fontSize: 13, lineHeight: "20px" };
	const hintStyle = { display: "block", opacity: 0.65, fontSize: 12, lineHeight: "18px", marginTop: 2 };
	const rangeStyle = {
		width: 200,
		// Keeps the native control on the theme's own accent instead of the
		// browser default blue, which is the main tell that a card is not host UI.
		accentColor: "var(--dsw-alias-brand-primary)"
	};
	const checkboxStyle = { width: 16, height: 16, cursor: "pointer", accentColor: "var(--dsw-alias-brand-primary)" };
	const buttonStyle = {
		cursor: "pointer",
		borderRadius: 8,
		padding: "4px 10px",
		font: "inherit",
		fontSize: 13,
		color: "inherit",
		border: "1px solid var(--dsw-alias-border-l2)",
		background: "var(--dsw-alias-button-elevated-fill)"
	};
	const metaStyle = {
		margin: 0,
		fontSize: 11,
		lineHeight: "17px",
		color: "var(--dsw-alias-label-tertiary)"
	};
	const noteStyle = {
		margin: 0,
		padding: "8px 10px",
		borderRadius: 8,
		fontSize: 12,
		lineHeight: "18px",
		background: "var(--dsw-alias-bg-layer-1)",
		color: "var(--dsw-alias-label-secondary)"
	};

	function Field({ label, hint, children }) {
		return h("label", { style: rowStyle },
			h("span", { style: { minWidth: 0 } },
				h("span", { style: labelStyle }, label),
				h("small", { style: hintStyle }, hint)),
			children);
	}

	const linkStyle = {
		color: "var(--dsw-alias-brand-primary)",
		textDecoration: "underline",
		textUnderlineOffset: "2px"
	};
	const creditStyle = {
		display: "grid",
		gap: 5,
		fontSize: 12,
		lineHeight: "19px",
		color: "var(--dsw-alias-label-secondary)"
	};
	const creditTitleStyle = {
		margin: 0,
		fontSize: 13,
		fontWeight: 650,
		color: "var(--dsw-alias-label-primary)"
	};
	const creditLineStyle = { margin: 0 };

	function CreditLink({ href, children }) {
		return h("a", {
			href,
			target: "_blank",
			rel: "noreferrer",
			style: linkStyle
		}, children);
	}

	/** Render a locale segment list: strings as copy, { link } as an anchor. */
	function renderSegments(t, segments) {
		return segments.map((segment, index) => {
			if (typeof segment === "string") return segment;
			const key = segment.link;
			return h(CreditLink, { key, href: CREDITS_LINKS[key] }, t.credits.names[key]);
		});
	}

	// Credits is also mounted on the plugin detail page on its own, so it reads
	// the locale straight from prefs rather than taking it from a parent.
	function Credits({ compact = false }) {
		const t = UI[resolveLocale(loadPrefs())];
		const c = t.credits;
		return h("section", {
			style: creditStyle,
			"data-testid": "whalegirl-credits"
		},
			h("h3", { style: creditTitleStyle }, c.title),
			h("p", { style: creditLineStyle }, renderSegments(t, c.visual)),
			h("p", { style: creditLineStyle }, renderSegments(t, c.license)),
			compact
				? h("p", { style: creditLineStyle }, renderSegments(t, c.dreamskin))
				: [
						h("p", { key: "dream", style: creditLineStyle }, renderSegments(t, c.dreamskinFull)),
						h("p", { key: "code", style: creditLineStyle }, c.code)
					]);
	}

	function AppearanceCard(props) {
		// Hooks stay unconditional: the host renders this component for both the
		// list card's one-liner (view:"summary") and the detail page (view:"page").
		const prefsRef = React.useRef(loadPrefs());
		const [prefs, setPrefs] = React.useState(prefsRef.current);
		const t = UI[resolveLocale(prefs)];
		if (props.view === "summary") return t.summary;

		const update = (patch) => {
			prefsRef.current = pushPrefs({ ...prefsRef.current, ...patch });
			setPrefs(prefsRef.current);
		};

		const field = (key) => {
			const spec = t.fields[key];
			if (spec === undefined) return null;
			const [label, hint, max, step, min] = spec;
			const id = `whalegirl-${key}`;
			if (typeof hint === "function") {
				return h(Field, { key, label, hint: hint(prefs[key]) },
					h("input", {
						id,
						name: key,
						type: "range",
						min: min ?? 0,
						max,
						step,
						style: rangeStyle,
						value: prefs[key],
						onChange: (event) => update({ [key]: Number(event.target.value) })
					}));
			}
			return h(Field, { key, label, hint },
				h("input", {
					id,
					name: key,
					type: "checkbox",
					style: checkboxStyle,
					checked: Boolean(prefs[key]),
					onChange: (event) => update({ [key]: event.target.checked })
				}));
		};

		const hooks = reportHooks();
		const nextLocale = prefs.uiLocale === "en" ? "zh" : prefs.uiLocale === "zh" ? "auto" : "en";

		return h("div", { style: pageStyle, "data-testid": "whalegirl-appearance-settings" },
			h("h2", { style: { margin: 0, fontSize: 18, lineHeight: "26px", fontWeight: 650 } }, t.label),
			h("p", { style: metaStyle }, t.status(prefs, BUILD_ID)),
			h("p", { style: metaStyle }, t.compat(hooks.hit, hooks.total, hooks.missing)),
			h(Field, { label: t.preset[0], hint: t.preset[1] },
				h("span", { style: { display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "flex-end" } },
					CARD_PRESETS.map(([key, values]) =>
						h("button", {
							key,
							type: "button",
							style: buttonStyle,
							onClick: () => update(values)
						}, t.presetNames[key] ?? key)))),
			field("frameBlur"),
			field("surfaceOpacity"),
			field("conversationOpacity"),
			field("bubbleOpacity"),
			field("veilStrength"),
			prefs.wallpaperOn ? field("wallpaperY") : null,
			prefs.wallpaperOn ? field("wallpaperZoom") : null,
			prefs.wallpaperOn ? field("wallpaperBlur") : null,
			field("wallpaperOn"),
			field("focusGlow"),
			h("div", { style: { ...rowStyle, justifyContent: "flex-end" } },
				h("button", {
					type: "button",
					style: buttonStyle,
					onClick: () => update(DEFAULT_PREFS)
				}, t.restore)),
			h("p", { style: noteStyle }, t.pinNote),
			h("div", { style: { ...rowStyle, justifyContent: "flex-end" } },
				h("button", {
					type: "button",
					style: buttonStyle,
					onClick: () => update({ uiLocale: nextLocale })
				}, `${t.language[0]}: ${prefs.uiLocale} → ${nextLocale}`)),
			h("small", { style: metaStyle }, t.language[1]),
			h("div", {
				style: {
					borderTop: "1px solid var(--dsw-alias-border-l1)",
					paddingTop: 12
				}
			}, h(Credits, { compact: true })));
	}

	return { AppearanceCard, Credits };
}

/**
 * Resolve a service without tripping strict Cordis. Reading an undeclared
 * service straight off the context proxy throws
 * (`cannot get property "slots" without inject`), whereas ctx.get() is the
 * documented inject-free probe. `slots` is declared in exports.inject, but
 * the fallback keeps hosts that don't provide it from aborting the whole
 * web boot through this optional settings card.
 */
function resolveService(ctx, name) {
	try {
		const value = ctx[name];
		if (value !== undefined && value !== null) return value;
	} catch {
		/* strict Cordis proxy — try the inject-free path */
	}
	if (typeof ctx.get === "function") {
		try {
			const value = ctx.get(name);
			if (value !== undefined && value !== null) return value;
		} catch {
			/* service not provided by this host */
		}
	}
	return null;
}

function registerSettings(ctx, React) {
	if (ctx === null || typeof ctx !== "object") return null;
	const slots = resolveService(ctx, "slots");
	if (slots === null || typeof slots !== "object" ||
		typeof slots.inject !== "function" || typeof slots.register !== "function") {
		return null;
	}
	if (React === null || typeof React !== "object" || typeof React.createElement !== "function") {
		return null; // no module table in this runtime — the theme still applies
	}
	const { AppearanceCard, Credits } = createAppearanceCardModule(React);
	try {
		// 0.3.0: own the bundle's configuration page, the same surface an
		// installed package opens from the Plugins list.
		const dispose = slots.inject(SETTINGS_SLOT, () => slots.register({
			name: SETTINGS_SLOT,
			key: PKG_NAME
		}, AppearanceCard));
		return { dispose, Credits };
	} catch (error) {
		// Hosts without the bundle-config slot keep the old built-in card.
		try {
			const dispose = slots.inject(FALLBACK_SLOT, () => slots.register({
				name: FALLBACK_SLOT,
				id: CARD_KEY,
				order: 50,
				label: () => UI[resolveLocale(loadPrefs())].label
			}, AppearanceCard));
			return { dispose, Credits };
		} catch {
			return { dispose: null, Credits };
		}
	}
}

function createCreditsSection(React, Credits) {
	const h = React.createElement;
	return function CreditsSection({ subject }) {
		const ours = subject !== null && typeof subject === "object" && (
			(subject.kind === "bundle" && subject.pkg !== undefined && subject.pkg.name === PKG_NAME) ||
			(subject.kind === "item" && subject.id === CARD_KEY)
		);
		if (!ours) return null;
		return h("div", { style: { maxWidth: 760, paddingTop: 4 } }, h(Credits));
	};
}

function registerCredits(ctx, React, Credits) {
	if (ctx === null || typeof ctx !== "object" || Credits === null) return null;
	const slots = resolveService(ctx, "slots");
	if (slots === null || typeof slots !== "object" ||
		typeof slots.inject !== "function" || typeof slots.register !== "function") {
		return null;
	}
	if (React === null || typeof React !== "object" || typeof React.createElement !== "function") {
		return null;
	}
	try {
		return slots.inject(CREDITS_SLOT, () => slots.register({
			name: CREDITS_SLOT,
			id: CREDITS_KEY,
			order: 80
		}, createCreditsSection(React, Credits)));
	} catch {
		return null;
	}
}

/* ------------------------------------------------------------------ *
 * Skin stylesheet injection
 * ------------------------------------------------------------------ */

/**
 * Static layer, written once per mount: the palette plus the wallpaper bytes.
 * Kept separate from the skin layer so dragging a slider never re-serialises
 * (and never re-parses) the 0.4 MB data URI.
 */
function ensureBaseStyle() {
	let tag = document.getElementById(STYLE_BASE_ID);
	if (tag === null) {
		tag = document.createElement("style");
		tag.id = STYLE_BASE_ID;
		tag.dataset.plugin = PKG_NAME;
		tag.dataset.layer = "base";
		// Insert before the skin tag when it somehow exists already, so the
		// equal-specificity !important surfaces in the skin layer keep winning.
		const skin = document.getElementById(STYLE_TAG_ID);
		if (skin !== null && skin.parentNode !== null) skin.parentNode.insertBefore(tag, skin);
		else document.head.appendChild(tag);
	}
	if (tag.textContent.length === 0 || tag.dataset.build !== BUILD_ID) {
		// A dev reload can leave the previous build's tag mounted while a fresh
		// module boots beside it; rewriting on a build mismatch keeps the palette
		// and the artwork from the same revision as the skin layer.
		tag.textContent = buildBaseCss();
	}
	tag.dataset.build = BUILD_ID;
	return tag;
}

/** Dynamic layer: only the declarations the prefs move. */
function injectStyle(cssText) {
	ensureBaseStyle();
	let tag = document.getElementById(STYLE_TAG_ID);
	if (tag === null) {
		tag = document.createElement("style");
		tag.id = STYLE_TAG_ID;
		tag.dataset.plugin = PKG_NAME;
		tag.dataset.layer = "skin";
		document.head.appendChild(tag);
	}
	tag.textContent = cssText;
	tag.dataset.build = BUILD_ID;
	return tag;
}

function resolveTheme(ctx) {
	const theme = resolveService(ctx, "theme");
	if (theme !== null) return theme;
	throw new Error("dsh-theme-whalegirl: theme service not found");
}

/* ------------------------------------------------------------------ *
 * Plugin entry
 * ------------------------------------------------------------------ */

/** Microtask deferral that also works in the vm-based smoke harness. */
const defer = (fn) => {
	if (typeof queueMicrotask === "function") queueMicrotask(fn);
	else Promise.resolve().then(fn);
};

function apply(ctx) {
	ctx.effect(() => {
		document.body.setAttribute(BODY_ATTR, "");

		let prefs = loadPrefs();
		const baseTag = ensureBaseStyle();
		const styleTag = injectStyle(buildSkinCss(prefs));
		const applyPrefs = (next) => {
			prefs = next;
			injectStyle(buildSkinCss(next));
		};
		applyPrefsHook = applyPrefs;

		const theme = resolveTheme(ctx);
		const definition = { id: THEME_ID, colorScheme: "light", tokens: TOKENS };
		let disposeRegister = null;
		let ownsRegistration = false;
		let disposed = false;

		const ensureRegistered = () => {
			try {
				const snapshot = typeof theme.getTheme === "function" ? theme.getTheme() : null;
				const themes = snapshot && snapshot.themes;
				if (Array.isArray(themes) && themes.some((entry) => entry.id === THEME_ID)) return;
			} catch {
				/* no snapshot to inspect — try the registration itself */
			}
			try {
				const dispose = theme.register(definition);
				if (typeof dispose === "function") {
					disposeRegister = dispose;
					ownsRegistration = true;
				}
			} catch (error) {
				// A sibling instance of this bundle (dev reload, double mount) may
				// already own the id; that registration is still the look we want,
				// so keep going instead of leaving the plugin half-applied.
				console.error("dsh-theme-whalegirl: register failed", error);
			}
		};

		const pinTheme = () => {
			if (disposed) return;
			// A sibling instance's teardown can strip the shared DOM before this
			// one settles; restore it rather than staying half-applied.
			if (!document.body.hasAttribute(BODY_ATTR)) document.body.setAttribute(BODY_ATTR, "");
			if (document.getElementById(STYLE_BASE_ID) === null) ensureBaseStyle();
			if (document.getElementById(STYLE_TAG_ID) === null) injectStyle(buildSkinCss(prefs));
			try {
				if (theme.getTheme().preference === THEME_ID) return;
			} catch {
				/* no snapshot — let setTheme report a missing registration */
			}
			ensureRegistered();
			try {
				theme.setTheme(THEME_ID);
			} catch (error) {
				console.error("dsh-theme-whalegirl: setTheme failed", error);
			}
		};

		/*
		 * The re-assert MUST leave the current theme/change dispatch. On a cold
		 * desktop start this plugin is applied before ui-layout mounts its
		 * presenter, so when the durable ui-theme section finishes loading and
		 * publishes the built-in preference, the presenter is last in the
		 * listener list: a synchronous setTheme() inside the guard is replayed
		 * first and then overwritten by the foreign snapshot of that same
		 * dispatch — white labels on the light paper. Deferring makes the
		 * re-assert a fresh publish that every presenter applies last.
		 */
		const pinSoon = () => {
			if (disposed) return;
			defer(pinTheme);
		};

		ensureRegistered();
		pinTheme();
		// The settings document can land after the plugin starts (desktop loads
		// it over the transport), possibly before the guard below exists.
		const later = typeof setTimeout === "function" ? setTimeout : null;
		const pinTimers =
			later === null ? [] : [200, 1000, 3000].map((ms) => later(pinTheme, ms));
		// The shell paints its columns after plugins mount, so the hook probe runs
		// again once the layout exists — a miss measured at boot means nothing.
		const checkTimers =
			later === null ? [] : [1200, 4000].map((ms) => later(reportHooks, ms));

		const React = loadReact();
		const settings = registerSettings(ctx, React);
		const disposeCard = settings === null ? null : settings.dispose;
		const disposeCredits = settings === null ? null : registerCredits(ctx, React, settings.Credits);

		// Guard: the built-in Appearance scope re-applies its stored preference —
		// explicit light/dark or the "system" default — on settings reloads, and
		// any such write would silently drop this theme's tokens. While the
		// plugin is enabled the whale-girl look IS the appearance, so re-assert
		// unconditionally; switching to another theme means disabling the plugin
		// in the market Themes tab (which also restores the built-in behavior).
		const offChange =
			typeof ctx.on === "function"
				? ctx.on("theme/change", (snapshot) => {
						const preference = snapshot && snapshot.preference;
						if (typeof preference !== "string" || preference === THEME_ID) return;
						pinSoon();
					})
				: null;

		return () => {
			disposed = true;
			for (const timer of [...pinTimers, ...checkTimers]) clearTimeout(timer);
			if (applyPrefsHook === applyPrefs) applyPrefsHook = null;
			if (typeof disposeCard === "function") disposeCard();
			if (typeof disposeCredits === "function") disposeCredits();
			if (offChange !== null) offChange();
			if (ownsRegistration && typeof disposeRegister === "function") disposeRegister();
			// Look the tags up again: a pin may have re-created one after a
			// sibling teardown, and removing only the captured reference would
			// leave that node behind with the plugin switched off.
			for (const [id, fallback] of [[STYLE_TAG_ID, styleTag], [STYLE_BASE_ID, baseTag]]) {
				const node = document.getElementById(id);
				(node !== null ? node : fallback).remove();
			}
			document.body.removeAttribute(BODY_ATTR);
		};
	}, "dsh-theme-whalegirl: register");
}

exports.isPlugin = true;
exports.inject = ["theme", "slots"];
exports.apply = apply;
