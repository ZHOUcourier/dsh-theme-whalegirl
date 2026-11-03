# Changelog

Changes to `dsh-theme-whalegirl`. Release notes on [GitHub Releases](https://github.com/ZHOUcourier/dsh-theme-whalegirl/releases) mirror this file.

## 0.4.0

### Added

- 壁纸焦点上下 and 壁纸缩放 sliders, so a narrow window whose `cover` crop cuts the subject off can bring it back.
- The settings card is bilingual. Copy follows the **host's** UI language (`<html lang>`), with the browser language only as a fallback — the desktop shell renders Chinese while its Electron renderer reports `navigator.language: "en"`, which put an English card in a Chinese app until it was fixed. The card can pin 中文 / English, and the choice persists with the other preferences.
- A host-compatibility report on the settings card (`宿主适配 3/3 · 实测 DSH 0.2.1-rc.5`). The paper model depends on CSS-module class names the host can rename, so the plugin now probes them, names the misses on the card, and warns in the console — a future breakage becomes a quotable line instead of "the wallpaper disappeared".
- `npm run test:browser` (`scripts/browser-check.mjs`): drives a real DSH web boot in Chromium and asserts computed styles — the palette lands, the wallpaper paints, the transcript column carries exactly one translucent paper layer, preferences survive a reload and really change the rendered alpha, and nothing throws. Falls back to the system Chrome when Playwright's Chromium is not installed.
- The card states how to leave the theme (disable the plugin), which is the only path that works.

### Changed

- The stylesheet is split in two layers. The static layer holds the token palette and the wallpaper data URI (~0.44 MB) and is written once per mount; the dynamic layer holds only the prefs-derived declarations (~4 KB) and is the only tag a slider rewrites. Adjusting glass used to re-serialise and re-parse the wallpaper on every input event.
- `恢复默认` also resets the new wallpaper focus/zoom and language choice.
- Disposing the plugin removes both layers by lookup, so a layer re-created by a pin after a sibling teardown cannot survive the plugin being switched off. The static layer is also rewritten when it carries a different build id, which is what a hot reload leaves behind.

## 0.3.1

- Keep the theme pinned on a cold desktop start: the re-assert leaves the current `theme/change` dispatch, and the full palette is emitted as `!important` body variables, so a missed pin costs the wallpaper rather than the contrast.

## 0.3.0

- Settings moved to the installed package's own page (`plugins.bundle.config`), off the built-in configuration list; hosts without that slot keep the previous card.
- 对话纸面透明度: a paper opacity scoped to the conversation column only.
- A `plugins.detail.section` credits block, so the 溟月 → ZipZipPipe → DreamSkin chain and the license split stay visible outside the settings form.

## 0.2.2

- One paper layer per column on every shell: the columns own the surface, the conversation root and dock tab host stay transparent, which also fixed the browser sidebar rendering solid where the desktop showed the wallpaper.
- Frame blur default 1px, surface default 25%; preferences moved to the `dsh-whalegirl.prefs.v2` key so stale v1 values cannot override the new defaults.

## 0.2.1

- Fixed a white web boot on DSH 0.1.6+: strict Cordis throws when an undeclared service is read off the context, so `slots` is now declared and every service probe falls back to `ctx.get()` instead of aborting `apply()`.

## 0.2.0

- Adjustable glass and wallpaper: frame blur, surface and bubble translucency, wallpaper veil, visibility, blur, composer focus glow, plus the 清爽玻璃 / DreamSkin 原味 / 纯净实底 presets. Defaults dropped the frost from 18px to 4px.

## 0.1.x

- Initial port of the DreamSkin **DeepSeek-鲸鱼娘** package: a full `--dsw-*` token remap registered as a native light theme, the artwork as an ambient wallpaper behind a light paper layer, and a `theme/change` guard that keeps the theme pinned.
