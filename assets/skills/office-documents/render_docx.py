#!/usr/bin/env python
"""Render a .docx to page images through the helper CLI's render verb.

Rendering is the only honest check that a document looks right: XML can be valid
and still overlap, clip or reflow badly.  This script keeps the plumbing in one
place so tasks can say "render it, look at the images" and mean a single command.

The render verb needs a real Word engine (Microsoft Word, WPS Writer, or
LibreOffice).  When none is installed the script reports exactly that and exits 3,
because a placeholder image would be worse than no image.

Exit codes: 0 rendered, 1 render failed, 3 no renderer installed, 2 bad input.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "scripts"))
import docx_kit as kit


def resize(path: Path, width: int | None, height: int | None) -> None:
    try:
        from PIL import Image
    except ImportError:
        return
    if not (width or height):
        return
    with Image.open(path) as image:
        size = (width or image.width, height or image.height)
        image.resize(size).save(path)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Render a .docx to PNG page images (and optionally keep the PDF).")
    parser.add_argument("input_docx", help="Input .docx")
    parser.add_argument("--output_dir", default=None, help="Directory for page images (default: next to the input)")
    parser.add_argument("--dpi", type=int, default=150)
    parser.add_argument("--width", type=int, default=None, help="Resize page images to this width")
    parser.add_argument("--height", type=int, default=None, help="Resize page images to this height")
    parser.add_argument("--emit_pdf", action="store_true", help="Keep the intermediate PDF and report its path")
    parser.add_argument("--verbose", action="store_true", help="Include the CLI's raw output")
    args = parser.parse_args(argv)

    source = Path(args.input_docx).expanduser().resolve()
    if not source.is_file():
        print("error: %s not found" % source, file=sys.stderr)
        return 2
    out_dir = Path(args.output_dir).expanduser().resolve() if args.output_dir else source.parent / (source.stem + "-render")
    out_dir.mkdir(parents=True, exist_ok=True)

    command = ["docx", "render", "--input", str(source), "--out-dir", str(out_dir)]
    if args.dpi:
        command += ["--dpi", str(args.dpi)]
    code, stdout, stderr = kit.run_office_cli(command)
    payload = kit.cli_json(stdout) or kit.cli_json(stderr) or {}
    pages = payload.get("pages") or []

    if code != 0 or not pages:
        detail = payload.get("error") or payload.get("reason") or ""
        if not detail:
            lines = [line for line in (stderr or stdout or "").splitlines() if line.strip() not in ("", "{", "}")]
            detail = lines[-1].strip() if lines else "render failed"
        if "renderer" in detail.lower() or "libreoffice" in detail.lower():
            kit.emit({"ok": False, "reason": "no_renderer", "detail": detail, "remedy": "Install Microsoft Office, WPS Office, or LibreOffice, then re-run this command."})
            return 3
        kit.emit({"ok": False, "reason": "render_failed", "detail": detail})
        return 1

    for page in pages:
        resize(Path(page), args.width, args.height)

    result = {
        "ok": True,
        "input": str(source),
        "pages": pages,
        "page_count": len(pages),
        "renderer": payload.get("renderer"),
    }
    if args.emit_pdf and payload.get("pdf"):
        result["pdf"] = payload["pdf"]
    if args.verbose:
        result["stdout"] = stdout.strip()
    kit.emit(result)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
