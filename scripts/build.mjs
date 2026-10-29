#!/usr/bin/env node
/**
 * Build script for dsh-theme-whalegirl.
 *
 * Dependency-free: wraps src/client.js into the DeepSeek Harness client
 * ModuleLoader bundle format (lib/client.js), embedding assets/background.jpg
 * as a data URI, and copies src/index.js to lib/index.js.
 *
 * Usage:
 *   node scripts/build.mjs          # build lib/
 *   node scripts/build.mjs --check  # verify lib/ is up to date (CI)
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const srcClient = readFileSync(join(root, "src/client.js"), "utf8");
const srcHost = readFileSync(join(root, "src/index.js"), "utf8");

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const background = readFileSync(join(root, "assets/background.jpg"));

/** Short id of everything that feeds the bundle — printed by the settings card. */
const buildId = createHash("sha256")
	.update(srcClient)
	.update(background)
	.update(String(pkg.version))
	.digest("hex")
	.slice(0, 8);

function embedBackground(source) {
	const dataUri = `data:image/jpeg;base64,${background.toString("base64")}`;
	if (!source.includes("__WHALEGIRL_BACKGROUND_DATA_URI__")) {
		throw new Error("placeholder __WHALEGIRL_BACKGROUND_DATA_URI__ missing in src/client.js");
	}
	if (!source.includes("__WHALEGIRL_BUILD_ID__")) {
		throw new Error("placeholder __WHALEGIRL_BUILD_ID__ missing in src/client.js");
	}
	return source
		.replaceAll("__WHALEGIRL_BACKGROUND_DATA_URI__", dataUri)
		.replaceAll("__WHALEGIRL_BUILD_ID__", buildId);
}

function wrapClientModule(innerSource) {
	return `window.__ModuleLoader__.load({
	id: ${JSON.stringify(pkg.name)},
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
${innerSource.trimEnd()}
		return module.exports;
	}
});
`;
}

function build() {
	const client = wrapClientModule(embedBackground(srcClient));
	const host = `${srcHost.trimEnd()}\n`;
	mkdirSync(join(root, "lib"), { recursive: true });
	writeFileSync(join(root, "lib/client.js"), client);
	writeFileSync(join(root, "lib/index.js"), host);
	const hash = (data) => createHash("sha256").update(data).digest("hex").slice(0, 12);
	console.log(`built lib/client.js ${hash(client)} (${client.length} bytes, build ${buildId})`);
	console.log(`built lib/index.js  ${hash(host)} (${host.length} bytes)`);
}

function check() {
	const expected = wrapClientModule(embedBackground(srcClient));
	const actual = readFileSync(join(root, "lib/client.js"), "utf8");
	if (actual !== expected) {
		console.error("lib/client.js is stale — run: npm run build");
		process.exitCode = 1;
		return;
	}
	console.log("lib/ is up to date");
}

if (process.argv.includes("--check")) check();
else build();
