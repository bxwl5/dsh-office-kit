#!/usr/bin/env python
"""Add a diagonal text watermark to the page background.

The watermark is a VML text shape in the default header, which is how Word has
stored them since the 2007 file format: it survives conversion, prints on every
page, and can be removed again by deleting the header shape.

Exit codes: 0 success, 2 bad input.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import docx_kit as kit


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Add a VML text watermark to the document header.")
    parser.add_argument("input_docx", help="Input .docx")
    parser.add_argument("--out", required=True, help="Output .docx")
    parser.add_argument("--text", required=True, help="Watermark text, e.g. CONFIDENTIAL")
    parser.add_argument("--color", default="#C0C0C0", help="Shape fill colour (hex)")
    args = parser.parse_args(argv)

    try:
        doc = kit.Docx(args.input_docx)
    except (OSError, KeyError) as exc:
        print("error: %s" % exc, file=sys.stderr)
        return 2

    if kit.watermark_texts(doc):
        print("error: this document already has a watermark; remove it first", file=sys.stderr)
        return 2

    part = doc.ensure_header_footer("header")
    root = doc.xml(part)
    root.append(kit.watermark_paragraph(args.text, doc.next_id(), args.color))
    doc.save(args.out)
    kit.emit({"ok": True, "output": str(Path(args.out)), "text": args.text, "part": part})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
