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
 *    default (frame blur 18px → 4px, far more opaque surfaces) and every
 *    frost-related parameter is user-adjustable at runtime: frame blur,
 *    surface/bubble translucency, wallpaper veil, wallpaper visibility and
 *    blur, composer focus glow — plus three presets (清爽玻璃 / DreamSkin
 *    原味 / 纯净实底). Adjustments are made from the plugin's card on the
 *    settings page (settings.plugin.item slot) and persisted per browser in
 *    localStorage; they apply instantly by rewriting this plugin's style tag.
 *  - Adjustable surface colors are re-emitted as !important custom-property
 *    overrides on the body attribute, which beat the presenter's inline
 *    tokens without re-registering the theme.
 *  - Gated on the body attribute `data-dsh-whalegirl` so nothing leaks when
 *    the plugin is off.
 *
 * Selection semantics follow the skin model: activating the plugin pins the
 * theme via theme.setTheme(), and a `theme/change` guard re-asserts it
 * whenever anything else (the built-in Appearance scope, other plugins)
 * writes another preference. Switching appearance = toggling the plugin in
 * the market Themes tab.
 */

const THEME_ID = "deepseek-whalegirl";
const BODY_ATTR = "data-dsh-whalegirl";
const STYLE_TAG_ID = "dsh-whalegirl-skin";

/**
 * Ambient whale-girl artwork, injected by scripts/build.mjs from
 * assets/background.jpg as a data URI so the theme works from any install
 * source (npm tarball, GitHub release, git) without asset-serving support.
 */
const BACKGROUND_DATA_URI = "__WHALEGIRL_BACKGROUND_DATA_URI__";

/* ------------------------------------------------------------------ *
 * User-adjustable appearance preferences (per browser, localStorage)
 * ------------------------------------------------------------------ */

const PREFS_KEY = "dsh-whalegirl.prefs.v1";

/**
 * Defaults ARE the new look: much less frost than the original port.
 *  - frameBlur: app-frame backdrop blur radius in px (was hard-coded 18).
 *  - surfaceOpacity: 0 = fully opaque surfaces … 100 = original translucent
 *    design values. Default 45 keeps just a hint of the wallpaper.
 *  - bubbleOpacity: same scale for the dusty-rose user bubbles.
 *  - veilStrength: paper veil over the wallpaper (0–100% of the original).
 *  - wallpaperOn / wallpaperBlur: show-hide and blur the artwork itself.
 *  - focusGlow: coffee-accent composer focus ring on/off.
 */
const DEFAULT_PREFS = Object.freeze({
	frameBlur: 4,
	surfaceOpacity: 45,
	bubbleOpacity: 60,
	veilStrength: 55,
	wallpaperOn: true,
	wallpaperBlur: 0,
	focusGlow: true
});

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
		bubbleOpacity: num(p.bubbleOpacity, 0, 100, DEFAULT_PREFS.bubbleOpacity),
		veilStrength: num(p.veilStrength, 0, 100, DEFAULT_PREFS.veilStrength),
		wallpaperOn: p.wallpaperOn === false ? false : true,
		wallpaperBlur: num(p.wallpaperBlur, 0, 16, DEFAULT_PREFS.wallpaperBlur),
		focusGlow: p.focusGlow === false ? false : true
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

	const bgBase = alpha(PAPER, sa(0.8));
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
 * Skin stylesheet — generated from current prefs; everything gated on
 * the body attribute. Surface overrides use !important so they beat the
 * theme presenter's inline body variables without re-registering.
 * ------------------------------------------------------------------ */

function buildSkinCss(prefs) {
	const st = prefs.surfaceOpacity / 100;
	const bt = prefs.bubbleOpacity / 100;
	const vs = prefs.veilStrength / 100;
	const sa = (designAlpha) => surfaceAlpha(designAlpha, st);
	const sb = (designAlpha) => surfaceAlpha(designAlpha, bt);
	const wallBlur = prefs.wallpaperBlur;
	const wallInset = wallBlur > 0 ? `${-(wallBlur * 2)}px` : "0";

	const parts = [];

	parts.push(`
body[${BODY_ATTR}] {
  background-color: ${PAPER};
  /* Live-adjustable surfaces — !important beats the presenter's inline vars. */
  --dsw-alias-bg-base: ${alpha(PAPER, sa(0.8))} !important;
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
  content: "";
  position: fixed;
  inset: ${wallInset};
  z-index: -1;
  pointer-events: none;
  background-image: url("${BACKGROUND_DATA_URI}");
  background-size: cover;
  background-position: 50% 50%;
  background-repeat: no-repeat;${wallBlur > 0 ? `\n  filter: blur(${wallBlur}px);` : ""}
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

	parts.push(`body[${BODY_ATTR}] [id="root"] {
  background: transparent;
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

	parts.push(`/* Frosted sidebar surface (intent of the DreamSkin safe-css block). */
body[${BODY_ATTR}] [role="tree"] {
  border-radius: 14px;
}
body[${BODY_ATTR}] [role="treeitem"] {
  border-radius: 12px;
  transition: background-color 0.14s ease, box-shadow 0.14s ease;
}
body[${BODY_ATTR}] [role="treeitem"][aria-selected="true"] {
  box-shadow: inset 3px 0 0 var(--dsw-specific-sidebar-nav-item-active-accent);
}`);

	if (prefs.focusGlow) {
		parts.push(`/* Coffee-accent composer focus ring (DreamSkin composer:focus-visible). */
body[${BODY_ATTR}] :is(textarea, [contenteditable="true"], input:not([type])):focus-visible {
  border-color: ${ACCENT};
  outline: none;
  box-shadow: 0 0 0 3px ${alpha(ACCENT, 0.18)};
}`);
	}

	parts.push(`body[${BODY_ATTR}] ::selection {
  background: ${alpha(SAND, 0.55)};
  color: ${INK};
}
@media print {
  body[${BODY_ATTR}]::before,
  body[${BODY_ATTR}]::after { display: none; }
}`);

	return parts.join("\n");
}

/* ------------------------------------------------------------------ *
 * Appearance settings card — the plugin's own row on the settings page
 * ("settings.plugin.item" slot), following the maid-whale/market model:
 * hand-built React via dynamic import, all failures stay local so the
 * theme works even if react or slots are unavailable.
 * ------------------------------------------------------------------ */

const CARD_SLOT = "settings.plugin.item";
const CARD_KEY = "whalegirl-appearance";

const CARD_PRESETS = [
	["清爽玻璃（默认）", DEFAULT_PREFS],
	["DreamSkin 原味", { frameBlur: 18, surfaceOpacity: 100, bubbleOpacity: 100, veilStrength: 100, wallpaperOn: true, wallpaperBlur: 0, focusGlow: true }],
	["纯净实底", { frameBlur: 0, surfaceOpacity: 0, bubbleOpacity: 30, veilStrength: 40, wallpaperOn: true, wallpaperBlur: 0, focusGlow: true }]
];

function createAppearanceCardModule(React) {
	const h = React.createElement;

	const cardStyle = {
		listStyle: "none",
		border: "1px solid var(--border-color, #d8d8d8)",
		borderRadius: 12,
		padding: 16,
		background: "var(--surface-color, transparent)",
		display: "grid",
		gap: 14
	};
	const rowStyle = {
		display: "flex",
		justifyContent: "space-between",
		alignItems: "center",
		gap: 20
	};
	const rangeStyle = { width: 180 };

	function Field({ label, hint, children }) {
		return h("label", { style: rowStyle },
			h("span", null,
				h("span", { style: { display: "block", fontWeight: 600 } }, label),
				h("small", { style: { display: "block", opacity: 0.65, marginTop: 3 } }, hint)),
			children);
	}

	function AppearanceCard() {
		const prefsRef = React.useRef(loadPrefs());
		const [prefs, setPrefs] = React.useState(prefsRef.current);

		const update = (patch) => {
			prefsRef.current = pushPrefs({ ...prefsRef.current, ...patch });
			setPrefs(prefsRef.current);
		};

		return h("li", { style: cardStyle, "data-testid": "whalegirl-appearance-settings" },
			h("div", null,
				h("strong", { style: { fontSize: 16 } }, "鲸鱼娘 · 玻璃与壁纸"),
				h("p", { style: { margin: "5px 0 0", opacity: 0.72 } },
					"磨砂强度、表面透明度与壁纸即时生效，仅保存在当前浏览器。")),
			h(Field, {
				label: "预设",
				hint: "一键切换整体风格。"
			}, h("span", { style: { display: "flex", gap: 8 } },
				CARD_PRESETS.map(([name, values]) =>
					h("button", {
						key: name,
						type: "button",
						style: { cursor: "pointer", borderRadius: 8, padding: "5px 10px" },
						onClick: () => update(values)
					}, name)))),
			h(Field, {
				label: "主框背景模糊",
				hint: `应用主框毛玻璃的模糊半径，当前 ${prefs.frameBlur}px；0 为关闭。`
			}, h("input", {
				type: "range", min: 0, max: 24, step: 1, style: rangeStyle,
				value: prefs.frameBlur,
				onChange: (event) => update({ frameBlur: Number(event.target.value) })
			})),
			h(Field, {
				label: "表面透明度",
				hint: `数值越低表面越实、壁纸越难透出，当前 ${prefs.surfaceOpacity}%。`
			}, h("input", {
				type: "range", min: 0, max: 100, step: 5, style: rangeStyle,
				value: prefs.surfaceOpacity,
				onChange: (event) => update({ surfaceOpacity: Number(event.target.value) })
			})),
			h(Field, {
				label: "用户气泡透明度",
				hint: `玫瑰色气泡的透出程度，当前 ${prefs.bubbleOpacity}%。`
			}, h("input", {
				type: "range", min: 0, max: 100, step: 5, style: rangeStyle,
				value: prefs.bubbleOpacity,
				onChange: (event) => update({ bubbleOpacity: Number(event.target.value) })
			})),
			h(Field, {
				label: "壁纸遮罩浓度",
				hint: `壁纸上方的纸色薄纱强度，当前 ${prefs.veilStrength}%；0 为无遮罩。`
			}, h("input", {
				type: "range", min: 0, max: 100, step: 5, style: rangeStyle,
				value: prefs.veilStrength,
				onChange: (event) => update({ veilStrength: Number(event.target.value) })
			})),
			h(Field, {
				label: "显示环境壁纸",
				hint: "关闭后回到纯净纸色背景。"
			}, h("input", {
				type: "checkbox",
				checked: prefs.wallpaperOn,
				onChange: (event) => update({ wallpaperOn: event.target.checked })
			})),
			prefs.wallpaperOn ? h(Field, {
				label: "壁纸模糊",
				hint: `柔化插画细节，当前 ${prefs.wallpaperBlur}px。`
			}, h("input", {
				type: "range", min: 0, max: 16, step: 1, style: rangeStyle,
				value: prefs.wallpaperBlur,
				onChange: (event) => update({ wallpaperBlur: Number(event.target.value) })
			})) : null,
			h(Field, {
				label: "输入框咖啡色聚焦光晕",
				hint: "DreamSkin 原版的输入框聚焦描边与光圈。"
			}, h("input", {
				type: "checkbox",
				checked: prefs.focusGlow,
				onChange: (event) => update({ focusGlow: event.target.checked })
			})),
			h("div", { style: { ...rowStyle, justifyContent: "flex-end" } },
				h("button", {
					type: "button",
					style: { cursor: "pointer", borderRadius: 8, padding: "5px 10px" },
					onClick: () => update(DEFAULT_PREFS)
				}, "恢复默认")));
	}

	return { AppearanceCard };
}

function registerAppearanceCard(ctx) {
	if (ctx === null || typeof ctx !== "object") return;
	const slots = ctx.slots;
	if (slots === null || typeof slots !== "object" ||
		typeof slots.inject !== "function" || typeof slots.register !== "function") {
		return;
	}
	let reactPromise;
	try {
		reactPromise = Promise.resolve(import("react"));
	} catch {
		return; // no dynamic import in this runtime — theme still applies
	}
	reactPromise
		.then((React) => {
			const { AppearanceCard } = createAppearanceCardModule(React);
			slots.inject(CARD_SLOT, () => slots.register({
				name: CARD_SLOT,
				key: CARD_KEY,
				id: CARD_KEY,
				order: 30,
				inject: () => ({})
			}, AppearanceCard));
		})
		.catch(() => {
			/* react unavailable — card skipped, theme unaffected */
		});
}

/* ------------------------------------------------------------------ *
 * Skin stylesheet injection
 * ------------------------------------------------------------------ */

function injectStyle(cssText) {
	let tag = document.getElementById(STYLE_TAG_ID);
	if (tag === null) {
		tag = document.createElement("style");
		tag.id = STYLE_TAG_ID;
		tag.dataset.plugin = "dsh-theme-whalegirl";
		document.head.appendChild(tag);
	}
	tag.textContent = cssText;
	return tag;
}

function resolveTheme(ctx) {
	if (ctx.theme !== undefined && ctx.theme !== null) return ctx.theme;
	if (typeof ctx.get === "function") {
		const service = ctx.get("theme");
		if (service !== undefined && service !== null) return service;
	}
	throw new Error("dsh-theme-whalegirl: theme service not found");
}

/* ------------------------------------------------------------------ *
 * Plugin entry
 * ------------------------------------------------------------------ */

function apply(ctx) {
	ctx.effect(() => {
		document.body.setAttribute(BODY_ATTR, "");

		let prefs = loadPrefs();
		const styleTag = injectStyle(buildSkinCss(prefs));
		const applyPrefs = (next) => {
			prefs = next;
			injectStyle(buildSkinCss(next));
		};
		applyPrefsHook = applyPrefs;

		const theme = resolveTheme(ctx);
		const disposeRegister = theme.register({
			id: THEME_ID,
			colorScheme: "light",
			tokens: TOKENS
		});
		try {
			theme.setTheme(THEME_ID);
		} catch (error) {
			console.error("dsh-theme-whalegirl: setTheme failed", error);
		}

		registerAppearanceCard(ctx);

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
						try {
							theme.setTheme(THEME_ID);
						} catch {
							/* not registered yet — the next change event retries */
						}
					})
				: null;

		return () => {
			if (applyPrefsHook === applyPrefs) applyPrefsHook = null;
			if (offChange !== null) offChange();
			disposeRegister();
			styleTag.remove();
			document.body.removeAttribute(BODY_ATTR);
		};
	}, "dsh-theme-whalegirl: register");
}

exports.isPlugin = true;
exports.inject = ["theme", "slots"];
exports.apply = apply;
