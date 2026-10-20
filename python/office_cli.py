#!/usr/bin/env python3
"""DSH Office Suite helper CLI.

Creates, reads, edits, recalculates, renders, and verifies DOCX, PDF, PPTX,
and XLSX files. Every command prints one JSON object on stdout. Failures print
one JSON object on stderr and exit non-zero.

The CLI is deliberately a thin, deterministic layer over well-known Python
libraries. It never calls an external model and never fetches remote services.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any, Iterable

VERSION = "0.1.0"

# Windows consoles default to a legacy code page; every payload is UTF-8 JSON.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass


def emit(value: Any, out: str | None = None) -> None:
    text = json.dumps(value, ensure_ascii=False, indent=2, default=str)
    if out:
        Path(out).parent.mkdir(parents=True, exist_ok=True)
        Path(out).write_text(text + "\n", encoding="utf-8")
    print(text)


def fail(message: str, *, code: int = 1, detail: Any = None) -> "NoReturn":
    payload: dict[str, Any] = {"ok": False, "error": message}
    if detail is not None:
        payload["detail"] = detail
    print(json.dumps(payload, ensure_ascii=False, indent=2, default=str), file=sys.stderr)
    raise SystemExit(code)


def load_json(path: str) -> dict[str, Any]:
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8-sig"))
    except FileNotFoundError:
        fail(f"specification not found: {path}")
    except json.JSONDecodeError as exc:
        fail(f"invalid JSON specification: {exc}")
    if not isinstance(data, dict):
        fail("specification must be a JSON object")
    return data


def require_file(path: str, what: str = "file") -> Path:
    resolved = Path(path).expanduser()
    if not resolved.is_file():
        fail(f"{what} not found: {path}")
    return resolved


def ensure_parent(path: str) -> Path:
    resolved = Path(path).expanduser()
    resolved.parent.mkdir(parents=True, exist_ok=True)
    return resolved


# ---------------------------------------------------------------------------
# Shared rendering helpers
# ---------------------------------------------------------------------------


def find_soffice() -> str | None:
    candidates = [
        os.environ.get("SOFFICE"),
        r"C:\Program Files\LibreOffice\program\soffice.exe",
        r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
        "/Applications/LibreOffice.app/Contents/MacOS/soffice",
        "/usr/bin/soffice",
        "/usr/local/bin/soffice",
    ]
    for candidate in candidates:
        if candidate and Path(candidate).is_file():
            return candidate
    found = shutil.which("soffice")
    return found


#: Automation entry points per suite and format: (executable, COM ProgID).
RENDER_ENGINES: dict[str, dict[str, tuple[str, str]]] = {
    "microsoft": {
        "docx": ("WINWORD.EXE", "Word.Application"),
        "pptx": ("POWERPNT.EXE", "PowerPoint.Application"),
        "xlsx": ("EXCEL.EXE", "Excel.Application"),
    },
    "kingsoft": {
        "docx": ("wps.exe", "KWps.Application"),
        "pptx": ("wpp.exe", "KWpp.Application"),
        "xlsx": ("et.exe", "Ket.Application"),
    },
}


def _kingsoft_dirs() -> list[Path]:
    """WPS Office hides its binaries under a per-version directory."""
    bases = [
        os.environ.get("WPS_OFFICE_HOME"),
        os.path.join(os.environ.get("ProgramFiles", r"C:\Program Files"), "Kingsoft", "WPS Office"),
        os.path.join(os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)"), "Kingsoft", "WPS Office"),
        os.path.join(os.environ.get("LOCALAPPDATA", ""), "Kingsoft", "WPS Office"),
    ]
    found: list[Path] = []
    for base in bases:
        if not base:
            continue
        root = Path(base)
        if (root / "office6").is_dir():
            found.append(root / "office6")
            continue
        if not root.is_dir():
            continue
        versions = [child for child in root.iterdir() if (child / "office6").is_dir()]
        versions.sort(key=lambda child: [int(part) if part.isdigit() else part for part in child.name.replace("-", ".").split(".")], reverse=True)
        for child in versions:
            found.append(child / "office6")
    return found


def office_engine(kind: str, family: str | None = None) -> tuple[str, str] | None:
    """Return (suite, executable) for an installed Office-compatible application."""
    if sys.platform != "win32":
        return None
    families = [family] if family else ["microsoft", "kingsoft"]
    for name in families:
        executable = RENDER_ENGINES[name][kind][0]
        if name == "microsoft":
            roots = [
                r"C:\Program Files\Microsoft Office\root\Office16",
                r"C:\Program Files (x86)\Microsoft Office\root\Office16",
                r"C:\Program Files\Microsoft Office\Office16",
                r"C:\Program Files (x86)\Microsoft Office\Office16",
            ]
            for root in roots:
                candidate = Path(root) / executable
                if candidate.is_file():
                    return name, str(candidate)
            continue
        for directory in _kingsoft_dirs():
            candidate = directory / executable
            if candidate.is_file():
                return name, str(candidate)
    return None


def office_binary(kind: str) -> str | None:
    engine = office_engine(kind)
    return engine[1] if engine else None


def _engine_path(kind: str, family: str) -> str | None:
    engine = office_engine(kind, family)
    return engine[1] if engine else None


def _powershell() -> str | None:
    return shutil.which("powershell") or shutil.which("pwsh")


def _office_script(kind: str, family: str) -> str:
    progid = RENDER_ENGINES[family][kind][1]
    if kind == "docx":
        if family == "kingsoft":
            return rf"""
$ErrorActionPreference = 'Stop'
$app = New-Object -ComObject {progid}
$app.Visible = $false
$app.DisplayAlerts = 0
$doc = $app.Documents.Open($env:DSH_INPUT, $false, $true)
try {{ $doc.SaveAs([ref]$env:DSH_PDF, [ref]17) }} finally {{ $doc.Close(0); $app.Quit() }}
"""
        return rf"""
$ErrorActionPreference = 'Stop'
$app = New-Object -ComObject {progid}
$app.Visible = $false
$app.DisplayAlerts = 0
$doc = $app.Documents.Open($env:DSH_INPUT, $false, $true)
try {{ $doc.ExportAsFixedFormat($env:DSH_PDF, 17) }} finally {{ $doc.Close(0); $app.Quit() }}
"""
    if kind == "pptx":
        return rf"""
$ErrorActionPreference = 'Stop'
$app = New-Object -ComObject {progid}
$app.DisplayAlerts = 1
$pres = $app.Presentations.Open($env:DSH_INPUT, $true, $false, $false)
try {{ $pres.SaveAs($env:DSH_PDF, 32) }} finally {{ $pres.Close(); $app.Quit() }}
"""
    return rf"""
$ErrorActionPreference = 'Stop'
$app = New-Object -ComObject {progid}
$app.Visible = $false
$app.DisplayAlerts = $false
$wb = $app.Workbooks.Open($env:DSH_INPUT)
try {{ $wb.ExportAsFixedFormat(0, $env:DSH_PDF) }} finally {{ $wb.Close($false); $app.Quit() }}
"""


def export_pdf(input_path: Path, kind: str, out_dir: Path) -> tuple[str, str]:
    """Export an Office file to PDF. Returns (renderer, pdf path)."""
    out_dir.mkdir(parents=True, exist_ok=True)
    pdf = out_dir / (input_path.stem + ".pdf")
    if pdf.exists():
        pdf.unlink()

    power_shell = _powershell()
    failures: list[str] = []
    if power_shell:
        for family, renderer in (("microsoft", "microsoft-office"), ("kingsoft", "kingsoft-wps")):
            engine = office_engine(kind, family)
            if engine is None:
                continue
            script = Path(tempfile.gettempdir()) / f"dsh-office-{kind}-{os.getpid()}.ps1"
            script.write_text(_office_script(kind, family), encoding="utf-8")
            env = dict(os.environ)
            env["DSH_INPUT"] = str(input_path.resolve())
            env["DSH_PDF"] = str(pdf.resolve())
            try:
                completed = subprocess.run(
                    [power_shell, "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", str(script)],
                    capture_output=True,
                    text=True,
                    timeout=240,
                    env=env,
                )
            except subprocess.TimeoutExpired:
                failures.append(f"{family}: timed out")
                continue
            finally:
                script.unlink(missing_ok=True)
            if completed.returncode == 0 and pdf.is_file():
                return renderer, str(pdf)
            failures.append(f"{family}: " + ((completed.stderr or completed.stdout).strip() or "no PDF produced"))

    soffice = find_soffice()
    if soffice:
        completed = subprocess.run(
            [soffice, "--headless", "--norestore", "--convert-to", "pdf", "--outdir", str(out_dir), str(input_path)],
            capture_output=True,
            text=True,
            timeout=240,
        )
        if completed.returncode != 0 or not pdf.is_file():
            detail = (completed.stderr or completed.stdout).strip()
            fail(f"LibreOffice export failed for {input_path.name}", detail=detail or None)
        return "libreoffice", str(pdf)

    fail(
        "no document renderer found: install LibreOffice, Microsoft Office, or WPS Office",
        detail="; ".join(failures) or None,
    )


def rasterize_pdf(pdf: str, out_dir: Path, dpi: int = 110) -> list[str]:
    try:
        import pymupdf
    except ImportError:
        try:
            import fitz as pymupdf  # type: ignore[no-redef]
        except ImportError:
            fail("PyMuPDF is not installed; run the plugin postinstall again")
    out_dir.mkdir(parents=True, exist_ok=True)
    pages: list[str] = []
    document = pymupdf.open(pdf)
    try:
        for index, page in enumerate(document, start=1):
            zoom = dpi / 72.0
            pixmap = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), alpha=False)
            target = out_dir / f"page-{index}.png"
            pixmap.save(str(target))
            pages.append(str(target))
    finally:
        document.close()
    return pages


def render_office(input_path: Path, kind: str, out_dir: Path, dpi: int) -> dict[str, Any]:
    renderer, pdf = export_pdf(input_path, kind, out_dir)
    pages = rasterize_pdf(pdf, out_dir, dpi)
    return {
        "ok": True,
        "kind": kind,
        "input": str(input_path),
        "renderer": renderer,
        "pdf": pdf,
        "page_count": len(pages),
        "pages": pages,
    }


# ---------------------------------------------------------------------------
# DOCX
# ---------------------------------------------------------------------------


def _docx_align(name: str | None):
    from docx.enum.text import WD_ALIGN_PARAGRAPH

    return {
        "left": WD_ALIGN_PARAGRAPH.LEFT,
        "center": WD_ALIGN_PARAGRAPH.CENTER,
        "right": WD_ALIGN_PARAGRAPH.RIGHT,
        "justify": WD_ALIGN_PARAGRAPH.JUSTIFY,
    }.get((name or "").lower(), WD_ALIGN_PARAGRAPH.LEFT)


def _docx_add_equation(paragraph, latex: str) -> bool:
    try:
        from latex2mathml.converter import convert as latex_to_mathml
        from lxml import etree
        from mathml2omml import convert as mathml_to_omml

        omml = mathml_to_omml(latex_to_mathml(latex))
        if "xmlns:m=" not in omml:
            omml = omml.replace(
                "<m:oMath",
                '<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"',
                1,
            )
        element = etree.fromstring(omml.encode("utf-8"))
        paragraph._p.append(element)
        return True
    except Exception:
        return False


def _docx_add_block(document, block: dict[str, Any], counters: dict[str, int]) -> None:
    from docx.shared import Inches, Pt

    block_type = str(block.get("type", "paragraph")).lower()
    if block_type == "heading":
        level = int(block.get("level", 1))
        document.add_heading(str(block.get("text", "")), level=max(0, min(level, 9)))
        counters["headings"] += 1
    elif block_type == "paragraph":
        paragraph = document.add_paragraph()
        run = paragraph.add_run(str(block.get("text", "")))
        run.bold = bool(block.get("bold", False))
        run.italic = bool(block.get("italic", False))
        if "size" in block:
            run.font.size = Pt(float(block["size"]))
        if block.get("color"):
            from docx.shared import RGBColor

            raw = str(block["color"]).lstrip("#")
            if len(raw) == 6:
                run.font.color.rgb = RGBColor.from_string(raw.upper())
        paragraph.alignment = _docx_align(block.get("align"))
        if block.get("style"):
            paragraph.style = str(block["style"])
        counters["paragraphs"] += 1
    elif block_type in {"bullets", "numbered"}:
        style = "List Bullet" if block_type == "bullets" else "List Number"
        for item in block.get("items", []):
            paragraph = document.add_paragraph(str(item), style=style)
            if block.get("size"):
                for run in paragraph.runs:
                    run.font.size = Pt(float(block["size"]))
            counters["list_items"] += 1
    elif block_type == "table":
        headers = [str(value) for value in block.get("headers", [])]
        rows = block.get("rows", [])
        columns = max([len(headers), *[len(row) for row in rows]]) if (headers or rows) else 0
        if columns == 0:
            return
        table = document.add_table(rows=0, cols=columns)
        style = str(block.get("style", "Table Grid"))
        try:
            table.style = style
        except Exception:
            table.style = "Table Grid"
        if headers:
            cells = table.add_row().cells
            for index, value in enumerate(headers):
                cells[index].text = value
                for paragraph in cells[index].paragraphs:
                    for run in paragraph.runs:
                        run.bold = True
        for row in rows:
            cells = table.add_row().cells
            for index, value in enumerate(row):
                if index < len(cells):
                    cells[index].text = "" if value is None else str(value)
        counters["tables"] += 1
    elif block_type == "image":
        path = require_file(str(block.get("path", "")), "image")
        width = block.get("width")
        if width is None:
            document.add_picture(str(path))
        else:
            document.add_picture(str(path), width=Inches(float(width)))
        counters["images"] += 1
    elif block_type == "equation":
        paragraph = document.add_paragraph()
        if not _docx_add_equation(paragraph, str(block.get("latex", ""))):
            paragraph.add_run(str(block.get("latex", ""))).italic = True
            counters["equation_fallbacks"] += 1
        else:
            counters["equations"] += 1
    elif block_type == "quote":
        document.add_paragraph(str(block.get("text", "")), style="Intense Quote")
        counters["paragraphs"] += 1
    elif block_type == "page_break":
        from docx.enum.text import WD_BREAK

        document.add_paragraph().add_run().add_break(WD_BREAK.PAGE)
    elif block_type == "spacer":
        document.add_paragraph("")
    else:
        document.add_paragraph(str(block.get("text", "")))


def _docx_add_blocks(document, blocks: Iterable[dict[str, Any]], counters: dict[str, int]) -> None:
    for block in blocks:
        if isinstance(block, dict):
            _docx_add_block(document, block, counters)


def docx_create(spec: dict[str, Any], out: Path) -> dict[str, Any]:
    from docx import Document
    from docx.shared import Pt

    document = Document()
    style = document.styles["Normal"]
    style.font.name = "Calibri"
    style.font.size = Pt(11)
    section = document.sections[0]
    page_size = str(spec.get("page_size", "Letter")).lower()
    if page_size == "a4":
        section.page_width = int(8.27 * 914400)
        section.page_height = int(11.69 * 914400)
    if str(spec.get("orientation", "portrait")).lower() == "landscape":
        width, height = section.page_width, section.page_height
        section.page_width, section.page_height = height, width
    for side in ("top_margin", "bottom_margin", "left_margin", "right_margin"):
        if side in spec:
            setattr(section, side, int(float(spec[side]) * 914400))

    if spec.get("title"):
        document.add_heading(str(spec["title"]), 0)
    if spec.get("subtitle"):
        paragraph = document.add_paragraph(str(spec["subtitle"]))
        paragraph.alignment = _docx_align("center")
    if spec.get("author") or spec.get("title"):
        document.core_properties.title = str(spec.get("title", ""))
        document.core_properties.author = str(spec.get("author", ""))
    if spec.get("header"):
        document.sections[0].header.paragraphs[0].text = str(spec["header"])
    if spec.get("footer"):
        document.sections[0].footer.paragraphs[0].text = str(spec["footer"])

    counters = {key: 0 for key in ("headings", "paragraphs", "list_items", "tables", "images", "equations", "equation_fallbacks")}
    _docx_add_blocks(document, spec.get("blocks", spec.get("sections", [])), counters)
    ensure_parent(str(out))
    document.save(str(out))
    return {"ok": True, "kind": "docx", "command": "create", "output": str(out), "counts": counters}


def _docx_iter_paragraphs(document):
    for paragraph in document.paragraphs:
        yield paragraph
    for table in document.tables:
        for row in table.rows:
            for cell in row.cells:
                for paragraph in cell.paragraphs:
                    yield paragraph
    for section in document.sections:
        for part in (section.header, section.footer):
            for paragraph in part.paragraphs:
                yield paragraph


def _replace_in_paragraph(paragraph, find: str, replacement: str) -> int:
    count = 0
    for run in paragraph.runs:
        if find in run.text:
            run.text = run.text.replace(find, replacement)
            count += 1
    if count == 0 and find in paragraph.text:
        text = paragraph.text.replace(find, replacement)
        for run in list(paragraph.runs):
            run._element.getparent().remove(run._element)
        paragraph.add_run(text)
        count = 1
    return count


def _docx_has_equation(paragraph) -> bool:
    tag = "{http://schemas.openxmlformats.org/officeDocument/2006/math}oMath"
    return bool(paragraph._p.findall(f".//{tag}"))


def docx_read(input_path: Path) -> dict[str, Any]:
    from docx import Document

    document = Document(str(input_path))
    paragraphs = []
    headings = []
    equations = 0
    for paragraph in document.paragraphs:
        text = paragraph.text.strip()
        if not text and not _docx_has_equation(paragraph):
            continue
        item = {"text": text, "style": paragraph.style.name if paragraph.style is not None else None}
        if _docx_has_equation(paragraph):
            equations += 1
            item["equation"] = True
        if paragraph.style is not None and paragraph.style.name.lower().startswith("heading"):
            headings.append(text)
        if text:
            paragraphs.append(item)
    tables = []
    for table in document.tables:
        tables.append({"rows": [[cell.text for cell in row.cells] for row in table.rows]})
    section = document.sections[0]
    return {
        "ok": True,
        "kind": "docx",
        "command": "read",
        "input": str(input_path),
        "title": document.core_properties.title or None,
        "author": document.core_properties.author or None,
        "paragraphs": paragraphs,
        "headings": headings,
        "tables": tables,
        "images": len(document.inline_shapes),
        "equations": equations,
        "counts": {
            "paragraphs": len(paragraphs),
            "headings": len(headings),
            "tables": len(tables),
            "images": len(document.inline_shapes),
        },
        "page": {
            "width_inches": round(section.page_width.inches, 2),
            "height_inches": round(section.page_height.inches, 2),
        },
    }


# ---------------------------------------------------------------------------
# PDF
# ---------------------------------------------------------------------------


def _pdf_font() -> str:
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont

    candidates = [
        r"C:\Windows\Fonts\msyh.ttc",
        r"C:\Windows\Fonts\msyh.ttf",
        r"C:\Windows\Fonts\simsun.ttc",
        "/System/Library/Fonts/PingFang.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for candidate in candidates:
        if Path(candidate).is_file():
            try:
                pdfmetrics.registerFont(TTFont("OfficeCJK", candidate))
                return "OfficeCJK"
            except Exception:
                continue
    return "Helvetica"


def _pdf_flowables(blocks: Iterable[dict[str, Any]], font: str, counters: dict[str, int]):
    from reportlab.lib import colors
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import inch
    from reportlab.platypus import Image, PageBreak, Paragraph, Spacer, Table, TableStyle
    from xml.sax.saxutils import escape

    styles = getSampleStyleSheet()
    body = ParagraphStyle("OfficeBody", parent=styles["BodyText"], fontName=font, fontSize=10.5, leading=15)
    heading1 = ParagraphStyle("OfficeH1", parent=styles["Heading1"], fontName=font, fontSize=18, leading=24)
    heading2 = ParagraphStyle("OfficeH2", parent=styles["Heading2"], fontName=font, fontSize=14, leading=20)
    title = ParagraphStyle("OfficeTitle", parent=styles["Title"], fontName=font, fontSize=22, leading=28)
    flowables = []
    for block in blocks:
        if not isinstance(block, dict):
            continue
        block_type = str(block.get("type", "paragraph")).lower()
        if block_type == "title":
            flowables.append(Paragraph(escape(str(block.get("text", ""))), title))
            flowables.append(Spacer(1, 0.2 * inch))
        elif block_type == "heading":
            style = heading1 if int(block.get("level", 1)) <= 1 else heading2
            flowables.append(Paragraph(escape(str(block.get("text", ""))), style))
            counters["headings"] += 1
        elif block_type in {"paragraph", "quote"}:
            flowables.append(Paragraph(escape(str(block.get("text", ""))), body))
            counters["paragraphs"] += 1
        elif block_type in {"bullets", "numbered"}:
            for item in block.get("items", []):
                prefix = "• " if block_type == "bullets" else "1. "
                flowables.append(Paragraph(prefix + escape(str(item)), body))
                counters["list_items"] += 1
        elif block_type == "table":
            headers = [str(value) for value in block.get("headers", [])]
            rows = [[str(value) for value in row] for row in block.get("rows", [])]
            data = ([headers] if headers else []) + rows
            if data:
                table = Table(data, repeatRows=1 if headers else 0)
                table.setStyle(TableStyle([
                    ("FONTNAME", (0, 0), (-1, -1), font),
                    ("FONTSIZE", (0, 0), (-1, -1), 9),
                    ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E8EEF7")),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ]))
                flowables.append(table)
                flowables.append(Spacer(1, 0.15 * inch))
                counters["tables"] += 1
        elif block_type == "image":
            path = require_file(str(block.get("path", "")), "image")
            width = float(block.get("width", 4.5)) * inch
            flowables.append(Image(str(path), width=width, height=width * 0.66))
            counters["images"] += 1
        elif block_type == "page_break":
            flowables.append(PageBreak())
        elif block_type == "spacer":
            flowables.append(Spacer(1, float(block.get("height", 0.2)) * inch))
    return flowables


def pdf_create(spec: dict[str, Any], out: Path) -> dict[str, Any]:
    from reportlab.lib.pagesizes import A4, letter
    from reportlab.lib.units import inch
    from reportlab.platypus import SimpleDocTemplate

    font = _pdf_font()
    size = A4 if str(spec.get("page_size", "Letter")).lower() == "a4" else letter
    ensure_parent(str(out))
    document = SimpleDocTemplate(
        str(out),
        pagesize=size,
        leftMargin=0.85 * inch,
        rightMargin=0.85 * inch,
        topMargin=0.8 * inch,
        bottomMargin=0.8 * inch,
        title=str(spec.get("title", "")),
        author=str(spec.get("author", "")),
    )
    counters = {key: 0 for key in ("headings", "paragraphs", "list_items", "tables", "images")}
    blocks: list[dict[str, Any]] = []
    if spec.get("title"):
        blocks.append({"type": "title", "text": spec["title"]})
    if spec.get("subtitle"):
        blocks.append({"type": "paragraph", "text": spec["subtitle"]})
    for page in spec.get("pages", []):
        if isinstance(page, dict):
            blocks.extend(page.get("blocks", []))
            if page.get("break", True):
                blocks.append({"type": "page_break"})
    blocks.extend(spec.get("blocks", []))
    document.build(_pdf_flowables(blocks, font, counters))
    return {"ok": True, "kind": "pdf", "command": "create", "output": str(out), "font": font, "counts": counters}


def pdf_read(input_path: Path) -> dict[str, Any]:
    from pypdf import PdfReader

    reader = PdfReader(str(input_path))
    pages = []
    total_words = 0
    for index, page in enumerate(reader.pages, start=1):
        text = page.extract_text() or ""
        total_words += len(text.split())
        pages.append({"page": index, "text": text, "characters": len(text)})
    metadata = {}
    try:
        metadata = {key: str(value) for key, value in (reader.metadata or {}).items() if value is not None}
    except Exception:
        metadata = {}
    fields = []
    try:
        root = reader.trailer["/Root"]
        if "/AcroForm" in root:
            fields = sorted((root["/AcroForm"].get("/Fields") or []))
            fields = [str(getattr(field, "idnum", None) or field) for field in fields]
    except Exception:
        fields = []
    return {
        "ok": True,
        "kind": "pdf",
        "command": "read",
        "input": str(input_path),
        "page_count": len(reader.pages),
        "word_count": total_words,
        "metadata": metadata,
        "pages": pages,
        "form_fields": fields,
        "ocr": {"available": False, "reason": "OCR is not bundled; use a dedicated OCR tool."},
    }


def pdf_render(input_path: Path, out_dir: Path, dpi: int) -> dict[str, Any]:
    pages = rasterize_pdf(str(input_path), out_dir, dpi)
    return {"ok": True, "kind": "pdf", "command": "render", "input": str(input_path), "page_count": len(pages), "pages": pages}


# ---------------------------------------------------------------------------
# PPTX
# ---------------------------------------------------------------------------


def _pptx_layout(prs, name: str):
    mapping = {
        "title": 0,
        "bullets": 1,
        "section": 2,
        "title_only": 5,
        "blank": 6,
    }
    index = mapping.get(name, 5)
    return prs.slide_layouts[min(index, len(prs.slide_layouts) - 1)]


def _pptx_add_chart(slide, spec: dict[str, Any]):
    from pptx.chart.data import CategoryChartData
    from pptx.enum.chart import XL_CHART_TYPE
    from pptx.util import Inches

    chart_type = {
        "bar": XL_CHART_TYPE.COLUMN_CLUSTERED,
        "column": XL_CHART_TYPE.COLUMN_CLUSTERED,
        "line": XL_CHART_TYPE.LINE_MARKERS,
        "pie": XL_CHART_TYPE.PIE,
    }.get(str(spec.get("type", "bar")).lower(), XL_CHART_TYPE.COLUMN_CLUSTERED)
    data = CategoryChartData()
    data.categories = [str(value) for value in spec.get("categories", [])]
    for series in spec.get("series", []):
        data.add_series(str(series.get("name", "Series")), [float(value) for value in series.get("values", [])])
    frame = slide.shapes.add_chart(
        chart_type,
        Inches(float(spec.get("left", 0.8))),
        Inches(float(spec.get("top", 1.6))),
        Inches(float(spec.get("width", 8.4))),
        Inches(float(spec.get("height", 4.6))),
        data,
    )
    if spec.get("title"):
        frame.chart.has_title = True
        frame.chart.chart_title.text_frame.text = str(spec["title"])
    return frame.chart


def _pptx_add_slide(prs, spec: dict[str, Any], counters: dict[str, int]):
    from pptx.util import Inches, Pt

    kind = str(spec.get("layout", "bullets")).lower()
    slide = prs.slides.add_slide(_pptx_layout(prs, kind))
    title_shape = slide.shapes.title
    if title_shape is not None and spec.get("title") is not None:
        title_shape.text = str(spec["title"])
    elif spec.get("title") is not None:
        title_box = slide.shapes.add_textbox(Inches(0.6), Inches(0.35), Inches(12.1), Inches(0.9))
        title_frame = title_box.text_frame
        title_frame.word_wrap = True
        title_frame.text = str(spec["title"])
        title_frame.paragraphs[0].font.size = Pt(32)
        title_frame.paragraphs[0].font.bold = True
    if kind == "title":
        if len(slide.placeholders) > 1 and spec.get("subtitle") is not None:
            slide.placeholders[1].text = str(spec["subtitle"])
    elif kind == "bullets":
        body = None
        for placeholder in slide.placeholders:
            if placeholder.placeholder_format.idx == 1:
                body = placeholder.text_frame
                break
        if body is not None:
            body.clear()
            items = spec.get("bullets", [])
            for index, item in enumerate(items):
                text = str(item.get("text", "")) if isinstance(item, dict) else str(item)
                paragraph = body.paragraphs[0] if index == 0 else body.add_paragraph()
                paragraph.text = text
                paragraph.level = int(item.get("level", 0)) if isinstance(item, dict) else 0
        counters["bullets"] += len(spec.get("bullets", []))
    else:
        top = 1.5
        if spec.get("bullets"):
            box = slide.shapes.add_textbox(Inches(0.8), Inches(top), Inches(11.6), Inches(0.9))
            frame = box.text_frame
            frame.word_wrap = True
            for index, item in enumerate(spec["bullets"]):
                paragraph = frame.paragraphs[0] if index == 0 else frame.add_paragraph()
                paragraph.text = "• " + str(item)
                paragraph.font.size = Pt(18)
            top += 1.0
        if isinstance(spec.get("table"), dict):
            table_spec = spec["table"]
            rows = 1 + len(table_spec.get("rows", []))
            columns = len(table_spec.get("headers", [])) or (len(table_spec["rows"][0]) if table_spec.get("rows") else 0)
            if rows > 0 and columns > 0:
                shape = slide.shapes.add_table(rows, columns, Inches(0.8), Inches(top), Inches(11.6), Inches(0.5 * rows))
                table = shape.table
                for index, value in enumerate(table_spec.get("headers", [])):
                    table.cell(0, index).text = str(value)
                for row_index, row in enumerate(table_spec.get("rows", []), start=1):
                    for column_index, value in enumerate(row):
                        table.cell(row_index, column_index).text = "" if value is None else str(value)
                counters["tables"] += 1
                top += 0.5 * rows + 0.3
        if isinstance(spec.get("chart"), dict):
            chart_spec = dict(spec["chart"])
            chart_spec.setdefault("top", round(top, 2))
            chart_spec.setdefault("height", round(min(4.2, max(1.5, 7.1 - top)), 2))
            _pptx_add_chart(slide, chart_spec)
            counters["charts"] += 1
            top += float(chart_spec["height"]) + 0.2
        if isinstance(spec.get("image"), dict):
            image = spec["image"]
            path = require_file(str(image.get("path", "")), "image")
            slide.shapes.add_picture(
                str(path),
                Inches(float(image.get("left", 0.8))),
                Inches(float(image.get("top", top))),
                width=Inches(float(image.get("width", 3.0))),
            )
            counters["images"] += 1
    counters["slides"] += 1
    return slide


def pptx_create(spec: dict[str, Any], out: Path) -> dict[str, Any]:
    from pptx import Presentation

    prs = Presentation()
    prs.slide_width = int(13.333 * 914400)
    prs.slide_height = int(7.5 * 914400)
    prs.core_properties.title = str(spec.get("title", ""))
    prs.core_properties.author = str(spec.get("author", "DSH Office Suite"))
    counters = {key: 0 for key in ("slides", "bullets", "tables", "charts", "images")}
    for slide_spec in spec.get("slides", []):
        if isinstance(slide_spec, dict):
            _pptx_add_slide(prs, slide_spec, counters)
    ensure_parent(str(out))
    prs.save(str(out))
    return {"ok": True, "kind": "pptx", "command": "create", "output": str(out), "counts": counters}


def _pptx_iter_text(slide, out: list[str]) -> None:
    for shape in slide.shapes:
        if shape.has_text_frame:
            for paragraph in shape.text_frame.paragraphs:
                text = "".join(run.text for run in paragraph.runs).strip()
                if text:
                    out.append(text)


def pptx_read(input_path: Path) -> dict[str, Any]:
    from pptx import Presentation

    prs = Presentation(str(input_path))
    slides = []
    for index, slide in enumerate(prs.slides, start=1):
        texts: list[str] = []
        _pptx_iter_text(slide, texts)
        tables = []
        charts = []
        images = 0
        for shape in slide.shapes:
            if shape.has_table:
                table = shape.table
                tables.append({"rows": [[cell.text for cell in row.cells] for row in table.rows]})
            if shape.has_chart:
                chart = shape.chart
                categories = list(chart.plots[0].categories) if chart.plots else []
                series = []
                try:
                    for item in chart.series:
                        series.append({"name": item.name, "values": list(item.values)})
                except Exception:
                    series = []
                charts.append({
                    "type": str(chart.chart_type),
                    "title": chart.chart_title.text_frame.text if chart.has_title else None,
                    "categories": [str(value) for value in categories],
                    "series": series,
                })
            if shape.shape_type is not None and "PICTURE" in str(shape.shape_type):
                images += 1
        title = slide.shapes.title.text if slide.shapes.title is not None else None
        slides.append({"slide": index, "title": title, "texts": texts, "tables": tables, "charts": charts, "images": images})
    return {
        "ok": True,
        "kind": "pptx",
        "command": "read",
        "input": str(input_path),
        "slide_count": len(prs.slides),
        "title": prs.core_properties.title or None,
        "slides": slides,
        "counts": {
            "slides": len(prs.slides),
            "tables": sum(len(item["tables"]) for item in slides),
            "charts": sum(len(item["charts"]) for item in slides),
        },
    }


# ---------------------------------------------------------------------------
# XLSX
# ---------------------------------------------------------------------------


def _xlsx_value(value: Any):
    if isinstance(value, str) and value.startswith("="):
        return value
    return value


def _xlsx_cells(worksheet, address: str):
    """Yield every cell in a single address or an A1:B2 range."""
    from openpyxl.utils import range_boundaries

    if ":" not in address:
        yield worksheet[address]
        return
    min_col, min_row, max_col, max_row = range_boundaries(address)
    for row in worksheet.iter_rows(min_col=min_col, min_row=min_row, max_col=max_col, max_row=max_row):
        for cell in row:
            yield cell


def _xlsx_apply_style(cell, style: dict[str, Any]) -> None:
    from openpyxl.styles import Alignment, Font, PatternFill

    font = {}
    if style.get("bold"):
        font["bold"] = True
    if style.get("italic"):
        font["italic"] = True
    if style.get("size"):
        font["size"] = float(style["size"])
    if style.get("color"):
        font["color"] = str(style["color"]).lstrip("#").upper()
    if font:
        cell.font = Font(**font)
    if style.get("fill"):
        cell.fill = PatternFill("solid", fgColor=str(style["fill"]).lstrip("#").upper())
    if style.get("number_format"):
        cell.number_format = str(style["number_format"])
    if style.get("align"):
        cell.alignment = Alignment(horizontal=str(style["align"]), vertical="center")


def _xlsx_add_chart(worksheet, spec: dict[str, Any]) -> None:
    from openpyxl.chart import BarChart, LineChart, PieChart, Reference

    chart_type = str(spec.get("type", "bar")).lower()
    chart = {"bar": BarChart, "column": BarChart, "line": LineChart, "pie": PieChart}.get(chart_type, BarChart)()
    chart.title = str(spec.get("title", ""))
    chart.height = float(spec.get("height", 8))
    chart.width = float(spec.get("width", 14))
    data = spec.get("data")
    if isinstance(data, dict):
        min_col = int(data.get("min_col", 2))
        min_row = int(data.get("min_row", 1))
        max_col = int(data.get("max_col", min_col))
        max_row = int(data.get("max_row", worksheet.max_row))
        values = Reference(worksheet, min_col=min_col, min_row=min_row, max_col=max_col, max_row=max_row)
        chart.add_data(values, titles_from_data=bool(data.get("titles_from_data", True)))
        categories = data.get("categories")
        if isinstance(categories, dict):
            chart.set_categories(Reference(
                worksheet,
                min_col=int(categories.get("min_col", 1)),
                min_row=int(categories.get("min_row", 2)),
                max_row=int(categories.get("max_row", max_row)),
            ))
    worksheet.add_chart(chart, str(spec.get("anchor", "E2")))


def xlsx_create(spec: dict[str, Any], out: Path) -> dict[str, Any]:
    from openpyxl import Workbook
    from openpyxl.utils import get_column_letter
    from openpyxl.drawing.image import Image as XLImage

    workbook = Workbook()
    workbook.remove(workbook.active)
    counters = {"sheets": 0, "charts": 0, "images": 0}
    for sheet_spec in spec.get("sheets", []):
        if not isinstance(sheet_spec, dict):
            continue
        title = str(sheet_spec.get("name", f"Sheet{counters['sheets'] + 1}"))[:31]
        worksheet = workbook.create_sheet(title)
        counters["sheets"] += 1
        for row_index, row in enumerate(sheet_spec.get("rows", []), start=1):
            for column_index, value in enumerate(row, start=1):
                worksheet.cell(row=row_index, column=column_index, value=_xlsx_value(value))
        for address, formula in (sheet_spec.get("formulas") or {}).items():
            worksheet[str(address)] = str(formula)
        for address, style in (sheet_spec.get("styles") or {}).items():
            if isinstance(style, dict):
                for cell in _xlsx_cells(worksheet, str(address)):
                    _xlsx_apply_style(cell, style)
        for column, width in (sheet_spec.get("widths") or {}).items():
            worksheet.column_dimensions[str(column)].width = float(width)
        for row, height in (sheet_spec.get("row_heights") or {}).items():
            worksheet.row_dimensions[int(row)].height = float(height)
        if sheet_spec.get("freeze"):
            worksheet.freeze_panes = str(sheet_spec["freeze"])
        for merged in sheet_spec.get("merged", []):
            worksheet.merge_cells(str(merged))
        for chart_spec in sheet_spec.get("charts", []):
            if isinstance(chart_spec, dict):
                _xlsx_add_chart(worksheet, chart_spec)
                counters["charts"] += 1
        for image_spec in sheet_spec.get("images", []):
            if isinstance(image_spec, dict):
                path = require_file(str(image_spec.get("path", "")), "image")
                image = XLImage(str(path))
                if image_spec.get("width"):
                    image.width = int(image_spec["width"])
                if image_spec.get("height"):
                    image.height = int(image_spec["height"])
                worksheet.add_image(image, str(image_spec.get("anchor", "A1")))
                counters["images"] += 1
        worksheet.sheet_view.showGridLines = bool(sheet_spec.get("gridlines", True))
    if not workbook.sheetnames:
        workbook.create_sheet("Sheet1")
    ensure_parent(str(out))
    workbook.save(str(out))
    return {"ok": True, "kind": "xlsx", "command": "create", "output": str(out), "counts": counters}


def xlsx_read(input_path: Path, data_only: bool = False) -> dict[str, Any]:
    from openpyxl import load_workbook

    workbook = load_workbook(str(input_path), data_only=data_only)
    sheets = []
    for worksheet in workbook.worksheets:
        rows = []
        for row in worksheet.iter_rows():
            values = [cell.value for cell in row]
            while values and values[-1] is None:
                values.pop()
            if values:
                rows.append(values)
        formulas = []
        for row in worksheet.iter_rows():
            for cell in row:
                if isinstance(cell.value, str) and cell.value.startswith("="):
                    formulas.append({"cell": cell.coordinate, "formula": cell.value, "cached": None})
        sheets.append({
            "name": worksheet.title,
            "dimensions": worksheet.dimensions,
            "rows": rows,
            "formulas": formulas,
            "merged": [str(item) for item in worksheet.merged_cells.ranges],
            "charts": len(worksheet._charts),
            "images": len(worksheet._images),
        })
    workbook.close()
    return {
        "ok": True,
        "kind": "xlsx",
        "command": "read",
        "input": str(input_path),
        "data_only": data_only,
        "sheets": sheets,
        "counts": {
            "sheets": len(sheets),
            "formulas": sum(len(sheet["formulas"]) for sheet in sheets),
            "charts": sum(sheet["charts"] for sheet in sheets),
        },
    }


def xlsx_recalc(input_path: Path, out: Path) -> dict[str, Any]:
    """Force a spreadsheet application to recalculate and store cached formula values."""
    engine = office_engine("xlsx") if sys.platform == "win32" else None
    if engine is None or _powershell() is None:
        fail("formula recalculation requires Microsoft Excel or WPS Spreadsheets on Windows; openpyxl cannot evaluate formulas")
    family, executable = engine
    progid = RENDER_ENGINES[family]["xlsx"][1]
    ensure_parent(str(out))
    if out.resolve() != input_path.resolve():
        shutil.copyfile(input_path, out)
    script = Path(tempfile.gettempdir()) / f"dsh-office-recalc-{os.getpid()}.ps1"
    script.write_text(rf"""
$ErrorActionPreference = 'Stop'
$app = New-Object -ComObject {progid}
$app.Visible = $false
$app.DisplayAlerts = $false
$wb = $app.Workbooks.Open($env:DSH_OUT)
try {{ $app.CalculateFull(); $wb.Save() }} finally {{ $wb.Close($true); $app.Quit() }}
""", encoding="utf-8")
    env = dict(os.environ)
    env["DSH_OUT"] = str(out.resolve())
    try:
        completed = subprocess.run(
            [_powershell(), "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", str(script)],
            capture_output=True,
            text=True,
            timeout=180,
            env=env,
        )
    finally:
        script.unlink(missing_ok=True)
    if completed.returncode != 0 or not out.is_file():
        fail("formula recalculation failed", detail=(completed.stderr or completed.stdout).strip() or None)
    cached = 0
    try:
        import openpyxl

        workbook = openpyxl.load_workbook(str(out), data_only=True)
        for sheet in workbook.worksheets:
            for row in sheet.iter_rows():
                cached += sum(1 for cell in row if cell.value is not None)
        workbook.close()
    except Exception:
        cached = 0
    return {
        "ok": True,
        "kind": "xlsx",
        "command": "recalc",
        "input": str(input_path),
        "output": str(out),
        "renderer": f"{family}-office" if family == "microsoft" else "kingsoft-wps",
        "executable": executable,
        "cached_values": cached,
    }


# ---------------------------------------------------------------------------
# Status and dispatch
# ---------------------------------------------------------------------------


def status() -> dict[str, Any]:
    import importlib
    import platform

    packages = []
    for name, module_name in [
        ("python-docx", "docx"),
        ("openpyxl", "openpyxl"),
        ("python-pptx", "pptx"),
        ("pypdf", "pypdf"),
        ("reportlab", "reportlab"),
        ("pdfplumber", "pdfplumber"),
        ("pymupdf", "pymupdf"),
        ("pillow", "PIL"),
        ("latex2mathml", "latex2mathml"),
        ("mathml2omml", "mathml2omml"),
    ]:
        try:
            module = importlib.import_module(module_name)
            packages.append({"package": name, "installed": True, "version": str(getattr(module, "__version__", ""))})
        except Exception as exc:
            packages.append({"package": name, "installed": False, "error": f"{type(exc).__name__}: {exc}"})
    return {
        "ok": True,
        "command": "status",
        "plugin_version": VERSION,
        "python": {"executable": sys.executable, "version": platform.python_version()},
        "platform": platform.platform(),
        "packages": packages,
        "renderers": {
            "libreoffice": find_soffice(),
            "microsoft_office": {
                "word": _engine_path("docx", "microsoft"),
                "powerpoint": _engine_path("pptx", "microsoft"),
                "excel": _engine_path("xlsx", "microsoft"),
            },
            "kingsoft_wps": {
                "writer": _engine_path("docx", "kingsoft"),
                "presentation": _engine_path("pptx", "kingsoft"),
                "spreadsheet": _engine_path("xlsx", "kingsoft"),
            },
            "can_render": {
                "docx": bool(office_engine("docx") or find_soffice()),
                "pptx": bool(office_engine("pptx") or find_soffice()),
                "xlsx": bool(office_engine("xlsx") or find_soffice()),
                "pdf": True,
            },
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="DSH Office Suite helper CLI")
    subparsers = parser.add_subparsers(dest="format", required=True)

    for kind in ("docx", "pdf", "pptx", "xlsx"):
        kind_parser = subparsers.add_parser(kind)
        commands = kind_parser.add_subparsers(dest="command", required=True)

        create = commands.add_parser("create")
        create.add_argument("--spec", required=True)
        create.add_argument("--out", required=True)
        if kind in {"docx", "pptx", "xlsx"}:
            create.add_argument("--json-out")

        read = commands.add_parser("read")
        read.add_argument("--input", required=True)
        read.add_argument("--json-out")
        if kind == "xlsx":
            read.add_argument("--data-only", action="store_true")

        render = commands.add_parser("render")
        render.add_argument("--input", required=True)
        render.add_argument("--out-dir", required=True)
        render.add_argument("--dpi", type=int, default=110)
        render.add_argument("--json-out")

        if kind == "xlsx":
            recalc = commands.add_parser("recalc")
            recalc.add_argument("--input", required=True)
            recalc.add_argument("--out", required=True)
            recalc.add_argument("--json-out")

    status_parser = subparsers.add_parser("status")

    args = parser.parse_args()
    try:
        if args.format == "status":
            emit(status())
            return
        if args.command == "create":
            spec = load_json(args.spec)
            out = Path(args.out)
            if args.format == "docx":
                result = docx_create(spec, out)
            elif args.format == "pdf":
                result = pdf_create(spec, out)
            elif args.format == "pptx":
                result = pptx_create(spec, out)
            else:
                result = xlsx_create(spec, out)
        elif args.command == "read":
            input_path = require_file(args.input)
            if args.format == "docx":
                result = docx_read(input_path)
            elif args.format == "pdf":
                result = pdf_read(input_path)
            elif args.format == "pptx":
                result = pptx_read(input_path)
            else:
                result = xlsx_read(input_path, data_only=bool(getattr(args, "data_only", False)))
        elif args.command == "render":
            input_path = require_file(args.input)
            out_dir = Path(args.out_dir)
            if args.format == "pdf":
                result = pdf_render(input_path, out_dir, args.dpi)
            else:
                result = render_office(input_path, args.format, out_dir, args.dpi)
        elif args.command == "recalc":
            result = xlsx_recalc(require_file(args.input), Path(args.out))
        else:
            fail(f"unsupported command: {args.command}")
        emit(result, getattr(args, "json_out", None))
    except SystemExit:
        raise
    except Exception as exc:
        fail(f"{type(exc).__name__}: {exc}")


if __name__ == "__main__":
    main()
