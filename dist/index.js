import { createRequire } from "node:module";
import { execFile } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { BUNDLED_SKILL_RANK } from "@deepseek-ai/dsh-skill";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
//#region src/features.ts
/** The four entries, in menu order. */
const OFFICE_FEATURES = [
	{
		id: "documents",
		label: "Documents",
		description: "Create, edit, render, and verify Word documents (.docx).",
		hint: "DOCX",
		skill: "office-documents",
		command: "documents",
		extensions: [".docx"]
	},
	{
		id: "pdf",
		label: "PDF",
		description: "Create, read, edit, render, and verify PDF files.",
		hint: "PDF",
		skill: "office-pdf",
		command: "pdf",
		extensions: [".pdf"]
	},
	{
		id: "presentations",
		label: "Presentations",
		description: "Create, edit, render, and verify slide decks (.pptx).",
		hint: "PPTX",
		skill: "office-presentations",
		command: "presentations",
		extensions: [".pptx"]
	},
	{
		id: "spreadsheets",
		label: "Spreadsheets",
		description: "Create, edit, recalculate, render, and verify workbooks (.xlsx).",
		hint: "XLSX",
		skill: "office-spreadsheets",
		command: "spreadsheets",
		extensions: [".xlsx"]
	}
];
//#endregion
//#region src/kit.ts
/** Package root of the installed plugin (dist/ during a build, src/ in a checkout). */
const PACKAGE_ROOT$1 = fileURLToPath(new URL("..", import.meta.url));
const KIT_CLI = "@deepseek-ai/libreoffice-kit/cli";
/**
* Locate the LibreOffice kit CLI that DeepSeek Harness ships.
*
* DSH installs third-party plugins into a profile (`~/.dsh/profiles/<name>/node_modules`)
* while the kit lives in the harness dependency tree, so resolving relative to this
* package cannot find it. Resolving from the harness entry point (`process.argv[1]`,
* e.g. `<dsh>/node_modules/@deepseek-ai/dsh/lib/bin.js`) walks the tree the harness
* itself loaded from, and resolving from this package covers a checkout or a
* plugin-local install. `DSH_LIBREOFFICE_KIT_CLI` overrides both.
*/
function resolveKitCli(entry = process.argv[1]) {
	const override = process.env.DSH_LIBREOFFICE_KIT_CLI;
	if (override != null && existsSync(override)) return override;
	for (const anchor of [entry, join(PACKAGE_ROOT$1, "package.json")]) {
		if (anchor == null) continue;
		try {
			const cli = createRequire(anchor).resolve(KIT_CLI);
			if (existsSync(cli)) return cli;
		} catch {}
	}
	return null;
}
/** Python packages the helper CLI needs. */
const PYTHON_PACKAGES = [
	{
		importName: "docx",
		package: "python-docx"
	},
	{
		importName: "openpyxl",
		package: "openpyxl"
	},
	{
		importName: "pptx",
		package: "python-pptx"
	},
	{
		importName: "pypdf",
		package: "pypdf"
	},
	{
		importName: "reportlab",
		package: "reportlab"
	},
	{
		importName: "pdfplumber",
		package: "pdfplumber"
	},
	{
		importName: "pymupdf",
		package: "pymupdf"
	},
	{
		importName: "PIL",
		package: "pillow"
	},
	{
		importName: "latex2mathml",
		package: "latex2mathml"
	},
	{
		importName: "mathml2omml",
		package: "mathml2omml"
	}
];
const PACKAGE_ROOT = fileURLToPath(new URL("..", import.meta.url));
const POSTINSTALL_SCRIPT = join(PACKAGE_ROOT, "postinstall.mjs");
/** Upper bound for one self-heal run; the remedy command remains available afterwards. */
const POSTINSTALL_TIMEOUT = 540 * 1e3;
/** Failed probes are retried after this delay instead of re-running pip on every status call. */
const FAILURE_RETRY_DELAY = 300 * 1e3;
function configDir() {
	const home = homedir();
	return process.platform === "win32" ? join(process.env.APPDATA ?? join(home, "AppData", "Roaming"), "dsh-office-kit") : process.platform === "darwin" ? join(home, "Library", "Application Support", "dsh-office-kit") : join(process.env.XDG_CONFIG_HOME ?? join(home, ".config"), "dsh-office-kit");
}
function legacyDataDir() {
	const home = homedir();
	return process.platform === "win32" ? join(process.env.LOCALAPPDATA ?? join(home, "AppData", "Local"), "dsh-office-kit") : process.platform === "darwin" ? join(home, "Library", "Application Support", "dsh-office-kit") : join(process.env.XDG_DATA_HOME ?? join(home, ".local", "share"), "dsh-office-kit");
}
/** Config location written by versions that ignored the platform branch. */
function legacyConfigFile() {
	return process.platform === "win32" ? join(configDir(), "config.json") : join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "dsh-office-kit", "config.json");
}
/** Resolve per-OS config/data directories and bundled resources. */
function officePaths() {
	const runtimeDir = join(homedir(), ".dsh", "office", "runtime");
	return {
		configFile: join(configDir(), "config.json"),
		legacyConfigFile: legacyConfigFile(),
		venv: join(runtimeDir, "venv"),
		legacyVenv: join(legacyDataDir(), "venv"),
		cli: join(PACKAGE_ROOT, "python", "office_cli.py"),
		skillsDir: join(PACKAGE_ROOT, "assets", "skills")
	};
}
/** One-liner the user can run to repair the runtime without pnpm. */
function runtimeRemedy() {
	return `node "${POSTINSTALL_SCRIPT}"`;
}
function isFile(path) {
	try {
		return statSync(path).isFile();
	} catch {
		return false;
	}
}
function run(file, args, timeout = 15e3) {
	return new Promise((resolve, reject) => {
		execFile(file, args, {
			timeout,
			windowsHide: true,
			maxBuffer: 4 * 1024 * 1024,
			env: {
				...process.env,
				PYTHONIOENCODING: "utf-8"
			}
		}, (error, stdout) => {
			if (error != null) {
				reject(error);
				return;
			}
			resolve(String(stdout).trim());
		}).stdin?.end();
	});
}
const RUNTIME_SCRIPT = `
import importlib, json, sys
targets = ${JSON.stringify(PYTHON_PACKAGES)}
packages = {}
for item in targets:
    try:
        module = importlib.import_module(item["importName"])
        packages[item["package"]] = {"installed": True, "version": str(getattr(module, "__version__", ""))}
    except Exception as exc:
        packages[item["package"]] = {"installed": False, "error": f"{type(exc).__name__}: {exc}"}
print(json.dumps({"python": sys.executable, "version": sys.version.split()[0], "packages": packages}))
`.trim();
/** Inspect an absolute interpreter: version plus every required import. */
function inspectPython(path) {
	return run(path, ["-c", RUNTIME_SCRIPT], 6e4).then((raw) => {
		try {
			const parsed = JSON.parse(raw);
			if (typeof parsed.version !== "string" || typeof parsed.python !== "string") throw new Error("unexpected interpreter response");
			const [majorText, minorText] = parsed.version.split(".");
			const major = Number(majorText);
			const minor = Number(minorText);
			const incompatible = major !== 3 || minor < 10 || minor >= 14;
			const packages = PYTHON_PACKAGES.map(({ importName, package: name }) => {
				const entry = parsed.packages?.[name];
				return {
					package: name,
					importName,
					installed: entry?.installed === true,
					...typeof entry?.version === "string" && entry.version.length > 0 ? { version: entry.version } : {},
					...typeof entry?.error === "string" && entry.error.length > 0 ? { error: entry.error } : {}
				};
			});
			const missing = packages.filter((entry) => !entry.installed);
			const inspection = {
				path: parsed.python,
				version: parsed.version,
				major,
				minor,
				compatible: !incompatible,
				packages,
				missing: incompatible ? [] : missing
			};
			return incompatible ? {
				...inspection,
				error: `unsupported Python ${parsed.version}`
			} : inspection;
		} catch (error) {
			return failedInspection(path, error);
		}
	}, (error) => failedInspection(path, error));
}
function failedInspection(path, error) {
	return {
		path,
		version: "",
		major: 0,
		minor: 0,
		compatible: false,
		packages: [],
		missing: [],
		error: error instanceof Error ? error.message : String(error)
	};
}
/**
* Read the interpreter path postinstall recorded; malformed files are ignored.
* The legacy location is read second so an upgrade does not orphan a ready venv.
*/
function savedPython(configFile, legacyConfigFile) {
	const files = legacyConfigFile == null ? [configFile] : [configFile, legacyConfigFile];
	for (const file of files) {
		if (!isFile(file)) continue;
		try {
			const parsed = JSON.parse(readFileSync(file, "utf8"));
			if (typeof parsed.python === "string" && parsed.python.length > 0) return parsed.python;
		} catch {}
	}
}
/** The interpreter inside a virtual environment, which differs per platform. */
function venvPython(venv) {
	return join(venv, process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
}
/** PATH-independent candidate list, plugin-owned interpreters first. */
function candidates(configFile) {
	const paths = officePaths();
	const found = [];
	const env = process.env.DSH_OFFICE_PYTHON;
	if (env != null && env.length > 0) found.push(env);
	const saved = savedPython(configFile, paths.legacyConfigFile);
	if (saved != null) found.push(saved);
	found.push(venvPython(paths.venv), venvPython(paths.legacyVenv));
	const marker = join(PACKAGE_ROOT, ".python-path");
	if (isFile(marker)) {
		const text = readFileSync(marker, "utf8").trim();
		if (text.length > 0) found.push(text);
	}
	for (const name of ["python3", "python"]) found.push(name);
	if (process.platform === "win32") {
		for (const version of [
			"3.13",
			"3.12",
			"3.11",
			"3.10"
		]) found.push(`py -${version}`);
		found.push("py -3");
	}
	return [...new Set(found)];
}
/** Resolve the launcher (`py -3.12`) into the absolute interpreter it runs. */
async function expandLauncher(candidate) {
	if (!candidate.startsWith("py ")) return [candidate];
	const args = candidate.split(" ").slice(1);
	try {
		const raw = await run("py", [
			...args,
			"-c",
			"import sys;print(sys.executable)"
		]);
		return raw.length > 0 ? [raw] : [];
	} catch {
		return [];
	}
}
/** Interpreters the Windows `py` launcher reports, including tagged (non-numeric) installs. */
async function launcherInterpreters() {
	if (process.platform !== "win32") return [];
	try {
		return (await run("py", ["-0p"])).split(/\r?\n/u).flatMap((line) => {
			const match = /^\s*-V:\S+\s+([A-Z]:\\[^\r\n]*python\.exe)\s*$/iu.exec(line);
			return match?.[1] != null ? [match[1]] : [];
		});
	} catch {
		return [];
	}
}
function statusOf(python) {
	return {
		state: python.compatible && python.missing.length === 0 ? "ok" : "missing-dependencies",
		python,
		packages: python.packages,
		missing: python.missing,
		remedy: runtimeRemedy()
	};
}
/** Pick the best interpreter: all dependencies first, then compatible-only, else none. */
function selectRuntime(inspections) {
	const ready = inspections.find((inspection) => inspection.compatible && inspection.missing.length === 0);
	if (ready != null) return statusOf(ready);
	const compatible = inspections.find((inspection) => inspection.compatible);
	if (compatible != null) return statusOf(compatible);
	const last = inspections[inspections.length - 1];
	return {
		state: "no-interpreter",
		packages: [],
		missing: [],
		remedy: runtimeRemedy(),
		...last?.error == null ? {} : { error: last.error }
	};
}
/** Inspect candidates in priority order; the first fully-provisioned interpreter wins. */
async function inspectRuntime(configFile = officePaths().configFile) {
	const seen = [];
	for (const candidate of [...candidates(configFile), ...await launcherInterpreters()]) for (const expanded of await expandLauncher(candidate)) {
		if (expanded !== candidate && !isFile(expanded)) continue;
		const inspection = await inspectPython(expanded);
		seen.push(inspection);
		if (inspection.compatible && inspection.missing.length === 0) return selectRuntime(seen);
	}
	return selectRuntime(seen);
}
/** Run postinstall.mjs as a child process; resolve with an error summary or undefined. */
function runPostinstall() {
	return new Promise((resolve) => {
		execFile(process.execPath, [POSTINSTALL_SCRIPT], {
			timeout: POSTINSTALL_TIMEOUT,
			windowsHide: true,
			maxBuffer: 8 * 1024 * 1024,
			env: {
				...process.env,
				ELECTRON_RUN_AS_NODE: "1",
				DSH_OFFICE_POSTINSTALL: "1"
			}
		}, (error, stdout, stderr) => {
			if (error == null) {
				resolve(void 0);
				return;
			}
			const detail = String(stderr || stdout || error.message).trim().split(/\r?\n/u).slice(-6).join("\n");
			resolve(detail.length > 0 ? detail : error.message);
		});
	});
}
let cache;
let healing;
/** A cached `ok` is only worth reusing while its interpreter still exists on disk. */
function runtimeAlive(status) {
	return status.state !== "ok" || status.python != null && isFile(status.python.path);
}
/**
* Resolve a runtime that is proven to work, self-healing via postinstall.mjs when it
* is missing or incomplete. Never returns a bare interpreter without dependencies.
* Pass `force` for an explicit status check that must not trust the process cache.
*/
function ensureRuntime(configFile = officePaths().configFile, force = false) {
	if (!force && cache != null) {
		if (cache.status.state === "ok" ? runtimeAlive(cache.status) : Date.now() - cache.at < FAILURE_RETRY_DELAY) return Promise.resolve(cache.status);
	}
	healing ??= (async () => {
		const probed = await inspectRuntime(configFile);
		if (probed.state === "ok") {
			cache = {
				status: probed,
				at: Date.now()
			};
			return probed;
		}
		const healError = await runPostinstall();
		const status = {
			...await inspectRuntime(configFile),
			heal: {
				attempted: true,
				...healError == null ? {} : { error: healError }
			}
		};
		cache = {
			status,
			at: Date.now()
		};
		return status;
	})().finally(() => {
		healing = void 0;
	});
	return healing;
}
/** Whether the helper CLI file shipped with this package. */
function cliExists() {
	return isFile(officePaths().cli);
}
//#endregion
//#region src/index.ts
/** Services required by this host half. */
const inject = ["skills", "tools"];
/** Cordis plugin identity used in loader diagnostics. */
const name = "dsh-office-kit";
const PROVIDER_NAME = "dsh-office-kit";
function parseSkill(raw, path) {
	const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(raw);
	if (match?.[1] == null) throw new Error(`dsh-office-kit: ${path} has no YAML frontmatter`);
	const description = /^description:(.*)$/mu.exec(match[1])?.[1]?.trim();
	if (description == null || description.length === 0) throw new Error(`dsh-office-kit: ${path} has no description`);
	return {
		description: description.replace(/^["']|["']$/gu, ""),
		content: raw.slice(match[0].length).trim()
	};
}
const KIT_MISSING = "the DSH LibreOffice kit (@deepseek-ai/libreoffice-kit) was not found: DeepSeek Harness normally injects DSH_LIBREOFFICE_KIT_CLI, so point that variable at <kit>/lib/cli.js if this plugin runs outside the harness";
const runKit = promisify(execFile);
async function kitFacts() {
	const cli = resolveKitCli();
	if (cli == null) return {
		available: false,
		node: null,
		cli: null,
		version: null,
		backend: null,
		remedy: KIT_MISSING
	};
	const node = process.env.DSH_NODE ?? process.execPath;
	try {
		const { stdout } = await runKit(node, [
			cli,
			"capabilities",
			"--json"
		], {
			timeout: 12e4,
			maxBuffer: 8 * 1024 * 1024
		});
		const parsed = JSON.parse(stdout);
		return {
			available: true,
			node,
			cli,
			version: typeof parsed.runtime?.version === "string" ? parsed.runtime.version : null,
			backend: typeof parsed.runtime?.backend === "string" ? parsed.runtime.backend : null
		};
	} catch (error) {
		return {
			available: true,
			node,
			cli,
			version: null,
			backend: null,
			error: error instanceof Error ? error.message.split("\n")[0] ?? error.message : String(error)
		};
	}
}
function pluginVersion() {
	try {
		const parsed = JSON.parse(readFileSync(join(PACKAGE_ROOT$1, "package.json"), "utf8"));
		return typeof parsed.version === "string" ? parsed.version : "unknown";
	} catch {
		return "unknown";
	}
}
/** Human-readable reason for a runtime that failed verification. */
function runtimeReason(runtime) {
	if (runtime.state === "missing-dependencies") {
		const names = runtime.missing.map((entry) => entry.package).join(", ");
		return `Python ${runtime.python?.version ?? ""} is installed but missing packages: ${names}`.replace("  ", " ");
	}
	return "no compatible Python 3.10–3.13 interpreter was found";
}
/** Register the four skills and a status tool, and expose the runtime paths in skill bodies. */
function apply(ctx) {
	const paths = officePaths();
	const candidates = [];
	const kitCli = resolveKitCli();
	if (kitCli != null) {
		process.env.DSH_LIBREOFFICE_KIT_CLI ??= kitCli;
		process.env.DSH_NODE ??= process.execPath;
	}
	for (const feature of OFFICE_FEATURES) {
		const directory = join(paths.skillsDir, feature.skill);
		const path = join(directory, "SKILL.md");
		if (!existsSync(path)) {
			console.warn(`[dsh-office-kit] missing skill file: ${path}`);
			continue;
		}
		const candidate = {
			name: feature.skill,
			description: feature.description,
			invocation: {
				modelInvocable: true,
				userInvocable: true
			},
			provider: PROVIDER_NAME,
			source: "bundled",
			rank: BUNDLED_SKILL_RANK,
			resourceBase: {
				kind: "directory",
				path: directory.split("\\").join("/")
			},
			locator: path,
			path
		};
		candidates.push(candidate);
	}
	const provider = {
		name: PROVIDER_NAME,
		list: () => Promise.resolve(candidates),
		async get(candidate, options) {
			if (!candidates.includes(candidate)) return void 0;
			const path = String(candidate.locator);
			let raw;
			try {
				raw = await readFile(path, {
					encoding: "utf8",
					signal: options.signal
				});
			} catch {
				return;
			}
			const parsed = parseSkill(raw, path);
			const runtime = await ensureRuntime(paths.configFile);
			const pythonLine = runtime.state === "ok" && runtime.python != null ? `\n\n## Office runtime\n\nUse these verified absolute paths for every helper command. Quote paths that contain spaces. \`skill\` is this skill's own directory: every script it names lives at \`<skill>/scripts/...\`; \`shared\` holds the cross-format workflow notes.\n\n\`\`\`json\n${JSON.stringify({
				python: runtime.python.path,
				cli: paths.cli,
				skill: dirname(path).split("\\").join("/"),
				shared: join(paths.skillsDir, "shared").split("\\").join("/"),
				version: runtime.python.version
			}, null, 2)}\n\`\`\`` : `\n\n## Office runtime\n\nNo working Python runtime is available: ${runtimeReason(runtime)}. Do not run helper commands or claim success. Tell the user to run \`${runtime.remedy}\`, then call \`office_status\` again.`;
			const { rank: _rank, locator: _locator, ...summary } = candidate;
			return {
				...summary,
				description: parsed.description,
				content: parsed.content + pythonLine
			};
		}
	};
	ctx.effect(() => ctx.skills.registerProvider(() => provider), "office-suite: skills");
	ctx.effect(() => ctx.tools.register(defineTool({
		name: "office_status",
		description: "Report the Office runtime state: compatible Python, installed Python packages, helper CLI path, and document renderers (the DSH LibreOffice kit). Call this before Office file work.",
		parameters: {},
		output: {
			schema: { type: "string" },
			render: (_args, value) => [{
				type: "text",
				text: value
			}]
		},
		timeoutMs: 6e5,
		async execute() {
			const runtime = await ensureRuntime(paths.configFile, true);
			const report = {
				plugin: {
					name,
					version: pluginVersion()
				},
				runtime: {
					state: runtime.state,
					venv: paths.venv,
					...runtime.state === "ok" ? {} : {
						reason: runtimeReason(runtime),
						remedy: runtime.remedy
					},
					...runtime.error == null ? {} : { error: runtime.error },
					...runtime.heal == null ? {} : { heal: runtime.heal }
				},
				python: runtime.python == null ? { found: false } : {
					found: true,
					path: runtime.python.path,
					version: runtime.python.version,
					compatible: runtime.python.compatible,
					...runtime.python.error == null ? {} : { error: runtime.python.error }
				},
				cli: {
					path: paths.cli,
					exists: cliExists()
				},
				packages: runtime.packages,
				renderers: await kitFacts(),
				skills: candidates.map((candidate) => candidate.name)
			};
			return JSON.stringify(report, null, 2);
		}
	})), "office-suite: status tool");
}
//#endregion
export { apply, inject, name };
