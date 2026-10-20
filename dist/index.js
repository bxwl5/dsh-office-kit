import { execFile } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { BUNDLED_SKILL_RANK } from "@deepseek-ai/dsh-skill";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
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
/** Resolve per-OS config/data directories and bundled resources. */
function officePaths() {
	const packageRoot = fileURLToPath(new URL("..", import.meta.url));
	const home = homedir();
	const configDir = process.platform === "win32" ? join(process.env.APPDATA ?? join(home, "AppData", "Roaming"), "dsh-office-kit") : process.platform === "darwin" ? join(home, "Library", "Application Support", "dsh-office-kit") : join(process.env.XDG_CONFIG_HOME ?? join(home, ".config"), "dsh-office-kit");
	const dataDir = process.platform === "win32" ? join(process.env.LOCALAPPDATA ?? join(home, "AppData", "Local"), "dsh-office-kit") : process.platform === "darwin" ? join(home, "Library", "Application Support", "dsh-office-kit") : join(process.env.XDG_DATA_HOME ?? join(home, ".local", "share"), "dsh-office-kit");
	return {
		configFile: join(configDir, "config.json"),
		dataDir,
		cli: join(packageRoot, "python", "office_cli.py"),
		skillsDir: join(packageRoot, "assets", "skills")
	};
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
const VERSION_SCRIPT = "import json,sys;print(json.dumps({\"version\":sys.version.split()[0],\"executable\":sys.executable}))";
/** Inspect an absolute interpreter without trusting its path alone. */
async function inspectPython(path) {
	try {
		const raw = await run(path, ["-c", VERSION_SCRIPT]);
		const parsed = JSON.parse(raw);
		if (typeof parsed.version !== "string" || typeof parsed.executable !== "string") throw new Error("unexpected interpreter response");
		const [majorText, minorText] = parsed.version.split(".");
		const major = Number(majorText);
		const minor = Number(minorText);
		const compatible = major === 3 && minor >= 10 && minor < 14;
		return {
			path: parsed.executable,
			version: parsed.version,
			major,
			minor,
			compatible
		};
	} catch (error) {
		return {
			path,
			version: "",
			major: 0,
			minor: 0,
			compatible: false,
			error: error instanceof Error ? error.message : String(error)
		};
	}
}
/** Read the interpreter path postinstall recorded; malformed files are ignored. */
function savedPython(configFile) {
	if (!isFile(configFile)) return void 0;
	try {
		const parsed = JSON.parse(readFileSync(configFile, "utf8"));
		return typeof parsed.python === "string" && parsed.python.length > 0 ? parsed.python : void 0;
	} catch {
		return;
	}
}
/** PATH-independent candidate list, most specific first. */
function candidates(configFile) {
	const found = [];
	const env = process.env.DSH_OFFICE_PYTHON;
	if (env != null && env.length > 0) found.push(env);
	const saved = savedPython(configFile);
	if (saved != null) found.push(saved);
	const marker = join(fileURLToPath(new URL("..", import.meta.url)), ".python-path");
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
/** Find the first runnable, compatible interpreter; return the best attempt otherwise. */
async function resolvePython(configFile = officePaths().configFile) {
	let last;
	for (const candidate of [...candidates(configFile), ...await launcherInterpreters()]) for (const expanded of await expandLauncher(candidate)) {
		if (expanded !== candidate && !isFile(expanded)) continue;
		const inspection = await inspectPython(expanded);
		if (inspection.compatible) return inspection;
		last = inspection;
	}
	return last;
}
/** Whether the helper CLI file shipped with this package. */
function cliExists() {
	return isFile(officePaths().cli);
}
//#endregion
//#region src/index.ts
const execFileAsync = promisify(execFile);
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
function findFile(candidates) {
	for (const path of candidates) if (existsSync(path)) return path;
	return null;
}
function rendererFacts() {
	const libreoffice = findFile([
		process.env.SOFFICE ?? "",
		"C:\\Program Files\\LibreOffice\\program\\soffice.exe",
		"C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe",
		"/Applications/LibreOffice.app/Contents/MacOS/soffice",
		"/usr/bin/soffice",
		"/usr/local/bin/soffice"
	].filter(Boolean));
	const officeRoots = ["C:\\Program Files\\Microsoft Office\\root\\Office16", "C:\\Program Files (x86)\\Microsoft Office\\root\\Office16"];
	return {
		libreoffice,
		microsoftOffice: {
			word: officeRoots.some((root) => existsSync(join(root, "WINWORD.EXE"))),
			powerpoint: officeRoots.some((root) => existsSync(join(root, "POWERPNT.EXE"))),
			excel: officeRoots.some((root) => existsSync(join(root, "EXCEL.EXE")))
		}
	};
}
const PACKAGE_PROBE = `
import importlib, json, sys
targets = ${JSON.stringify(PYTHON_PACKAGES)}
out = {}
for item in targets:
    try:
        module = importlib.import_module(item["importName"])
        out[item["package"]] = {"installed": True, "version": str(getattr(module, "__version__", ""))}
    except Exception as exc:
        out[item["package"]] = {"installed": False, "error": f"{type(exc).__name__}: {exc}"}
print(json.dumps({"python": sys.executable, "version": sys.version.split()[0], "packages": out}))
`.trim();
async function probePackages(python) {
	try {
		const { stdout } = await execFileAsync(python, ["-c", PACKAGE_PROBE], {
			timeout: 3e4,
			windowsHide: true,
			maxBuffer: 2 * 1024 * 1024,
			env: {
				...process.env,
				PYTHONIOENCODING: "utf-8"
			}
		});
		return JSON.parse(String(stdout).trim());
	} catch (error) {
		return { error: error instanceof Error ? error.message : String(error) };
	}
}
/** Register the four skills and a status tool, and expose the runtime paths in skill bodies. */
function apply(ctx) {
	const paths = officePaths();
	const candidates = [];
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
			const python = await resolvePython(paths.configFile);
			const pythonLine = python?.compatible === true ? `\n\n## Office runtime\n\nUse these verified absolute paths for every helper command. Quote paths that contain spaces.\n\n\`\`\`json\n${JSON.stringify({
				python: python.path,
				cli: paths.cli,
				version: python.version
			}, null, 2)}\n\`\`\`` : "\n\n## Office runtime\n\nNo compatible Python was found. Ask the user to run `pnpm rebuild dsh-office-kit` (or `npm rebuild dsh-office-kit`) and check the install output before attempting file work.";
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
		description: "Report the Office runtime state: compatible Python, installed Python packages, helper CLI path, and document renderers (LibreOffice or Microsoft Office). Call this before Office file work.",
		parameters: {},
		output: {
			schema: { type: "string" },
			render: (_args, value) => [{
				type: "text",
				text: value
			}]
		},
		timeoutMs: 45e3,
		async execute() {
			const python = await resolvePython(paths.configFile);
			const seen = await (python?.compatible === true ? probePackages(python.path) : Promise.resolve(null));
			const report = {
				plugin: {
					name,
					version: "0.1.0"
				},
				python: python == null ? { found: false } : {
					found: true,
					path: python.path,
					version: python.version,
					compatible: python.compatible,
					...python.error == null ? {} : { error: python.error }
				},
				cli: {
					path: paths.cli,
					exists: cliExists()
				},
				packages: seen,
				renderers: rendererFacts(),
				skills: candidates.map((candidate) => candidate.name)
			};
			return JSON.stringify(report, null, 2);
		}
	})), "office-suite: status tool");
}
//#endregion
export { apply, inject, name };
