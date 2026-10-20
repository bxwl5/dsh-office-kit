"""Shared OOXML plumbing for the office-documents scripts.

Every other script in this directory imports this module after adding its own
folder to ``sys.path``.  It packages the small set of zip + lxml operations the
WordprocessingML helpers need (part access, relationship and content-type
bookkeeping, run/paragraph utilities, field scanning) so each script stays a
thin, single-purpose CLI.

Also usable on its own:

    python docx_kit.py parts input.docx
    python docx_kit.py text input.docx
    python docx_kit.py xml input.docx word/document.xml

Exit codes: 0 success, 1 not found / unreadable, 2 usage error.
"""

from __future__ import annotations

import argparse
import json
import os
import posixpath
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

from lxml import etree

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
A = "http://schemas.openxmlformats.org/drawingml/2006/main"
WP = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
V = "urn:schemas-microsoft-com:vml"
W15 = "http://schemas.microsoft.com/office/word/2012/wordml"
XML = "http://www.w3.org/XML/1998/namespace"

CT_RELS = "application/vnd.openxmlformats-package.relationships+xml"
REL_HEADER = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/header"
REL_FOOTER = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer"
REL_COMMENTS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments"
REL_FOOTNOTES = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes"
REL_ENDNOTES = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/endnotes"
REL_STYLES = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles"
REL_NUMBERING = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering"
REL_SETTINGS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings"

CT_BY_REL = {
    REL_COMMENTS: "application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml",
    REL_FOOTNOTES: "application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml",
    REL_ENDNOTES: "application/vnd.openxmlformats-officedocument.wordprocessingml.endnotes+xml",
    REL_HEADER: "application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml",
    REL_FOOTER: "application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml",
}

# Sections of a document whose text and revisions the scripts touch.
TEXT_PARTS = (
    "word/document.xml",
    "word/footnotes.xml",
    "word/endnotes.xml",
    "word/comments.xml",
)


def q(tag: str, ns: str = W) -> str:
    return "{%s}%s" % (ns, tag)


def rels_name(part: str) -> str:
    folder, base = posixpath.split(part)
    return posixpath.join(folder, "_rels", base + ".rels")


def resolve_target(part: str, target: str) -> str:
    if target.startswith("/"):
        return target.lstrip("/")
    return posixpath.normpath(posixpath.join(posixpath.dirname(part), target))


def text_of(element) -> str:
    """Concatenated w:t text below an element (deleted text included)."""
    chunks = []
    for node in element.iter():
        if node.tag in (q("t"), q("delText")):
            chunks.append(node.text or "")
    return "".join(chunks)


def paragraph_text(paragraph) -> str:
    return text_of(paragraph)


class Docx:
    """In-memory copy of a .docx package with parse/serialize helpers."""

    def __init__(self, path: str | Path):
        self.path = Path(path)
        if not self.path.is_file():
            raise FileNotFoundError(str(self.path))
        with zipfile.ZipFile(self.path) as zf:
            self.order = zf.namelist()
            self.parts = {name: zf.read(name) for name in self.order}
        self._cache: dict[str, etree._Element] = {}

    # -- parts -------------------------------------------------------------
    def exists(self, part: str) -> bool:
        return part in self.parts

    def names(self, prefix: str = "") -> list[str]:
        return [name for name in self.parts if name.startswith(prefix)]

    def xml(self, part: str) -> etree._Element:
        if part not in self.parts:
            raise KeyError(part)
        if part not in self._cache:
            parser = etree.XMLParser(remove_blank_text=False, huge_tree=True)
            self._cache[part] = etree.fromstring(self.parts[part], parser)
        return self._cache[part]

    def set_xml(self, part: str, root) -> None:
        self._cache[part] = root
        if part not in self.parts:
            self.parts[part] = b""
            self.order.append(part)

    def drop(self, part: str) -> None:
        self.parts.pop(part, None)
        self._cache.pop(part, None)
        if part in self.order:
            self.order.remove(part)

    # -- relationships and content types -----------------------------------
    def rels(self, part: str) -> etree._Element:
        name = rels_name(part)
        if name not in self.parts:
            root = etree.Element("{http://schemas.openxmlformats.org/package/2006/relationships}Relationships", nsmap={None: "http://schemas.openxmlformats.org/package/2006/relationships"})
            self.parts[name] = b"<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"/>"
            self.order.append(name)
            self._cache.pop(name, None)
            return self.xml(name)
        return self.xml(name)

    def relationships(self, part: str) -> list[dict]:
        if rels_name(part) not in self.parts:
            return []
        ns = "{http://schemas.openxmlformats.org/package/2006/relationships}"
        out = []
        for node in self.xml(rels_name(part)).findall(ns + "Relationship"):
            out.append(
                {
                    "id": node.get("Id"),
                    "type": node.get("Type"),
                    "target": node.get("Target"),
                    "mode": node.get("TargetMode"),
                    "resolved": resolve_target(part, node.get("Target") or ""),
                }
            )
        return out

    def ensure_rel(self, part: str, rel_type: str, target: str, external: bool = False) -> str:
        """Return the rId for target, adding the relationship when absent."""
        for rel in self.relationships(part):
            if rel["type"] != rel_type:
                continue
            if external and rel["mode"] == "External" and rel["target"] == target:
                return rel["id"]
            if not external and rel["resolved"] == resolve_target(part, target):
                return rel["id"]
        root = self.rels(part)
        ns = "{http://schemas.openxmlformats.org/package/2006/relationships}"
        ids = [int(n.get("Id")[3:]) for n in root.findall(ns + "Relationship") if (n.get("Id") or "").startswith("rId") and (n.get("Id") or "")[3:].isdigit()]
        rid = "rId%d" % (max(ids, default=0) + 1)
        node = etree.SubElement(root, ns + "Relationship")
        node.set("Id", rid)
        node.set("Type", rel_type)
        node.set("Target", target)
        if external:
            node.set("TargetMode", "External")
        return rid

    def drop_rel_target(self, part: str, resolved: str) -> None:
        if rels_name(part) not in self.parts:
            return
        root = self.rels(part)
        ns = "{http://schemas.openxmlformats.org/package/2006/relationships}"
        for node in list(root.findall(ns + "Relationship")):
            if resolve_target(part, node.get("Target") or "") == resolved:
                root.remove(node)

    def content_types(self) -> etree._Element:
        return self.xml("[Content_Types].xml")

    def ensure_override(self, part: str, content_type: str) -> None:
        root = self.content_types()
        ct = "{http://schemas.openxmlformats.org/package/2006/content-types}"
        part_name = "/" + part
        for node in root.findall(ct + "Override"):
            if node.get("PartName") == part_name:
                node.set("ContentType", content_type)
                return
        node = etree.SubElement(root, ct + "Override")
        node.set("PartName", part_name)
        node.set("ContentType", content_type)

    def drop_override(self, part: str) -> None:
        root = self.content_types()
        ct = "{http://schemas.openxmlformats.org/package/2006/content-types}"
        for node in list(root.findall(ct + "Override")):
            if node.get("PartName") == "/" + part:
                root.remove(node)

    # -- document structure ------------------------------------------------
    def body(self):
        return self.xml("word/document.xml").find(q("body"))

    def paragraphs(self, part: str = "word/document.xml"):
        return list(self.xml(part).iter(q("p")))

    def text_parts(self) -> list[str]:
        return [name for name in TEXT_PARTS if self.exists(name)]

    def sections(self):
        return [node for node in self.xml("word/document.xml").iter(q("sectPr"))]

    def ensure_header_footer(self, kind: str) -> str:
        """Return the part name for this section's header/footer, creating it."""
        body = self.body()
        sect = body.find(q("sectPr")) if body is not None else None
        if sect is None:
            sect = etree.SubElement(body, q("sectPr"))
        tag = q("headerReference") if kind == "header" else q("footerReference")
        rel_type = REL_HEADER if kind == "header" else REL_FOOTER
        refs = sect.findall(tag)
        for ref in refs:
            rid = ref.get(q("id", R))
            for rel in self.relationships("word/document.xml"):
                if rel["id"] == rid and rel["resolved"]:
                    if self.exists(rel["resolved"]):
                        return rel["resolved"]
        index = 1
        while self.exists("word/%s%d.xml" % (kind, index)):
            index += 1
        part = "word/%s%d.xml" % (kind, index)
        root = etree.Element(q(kind), nsmap={"w": W, "r": R, "wp": WP, "v": V})
        etree.SubElement(etree.SubElement(root, q("p")), q("r"))
        self.set_xml(part, root)
        self.ensure_override(part, CT_BY_REL[rel_type])
        rid = self.ensure_rel("word/document.xml", rel_type, posixpath.basename(part))
        ref = etree.Element(tag)
        ref.set(q("type"), "default")
        ref.set(q("id", R), rid)
        if kind == "header":
            sect.insert(0, ref)
        else:
            position = 0
            for child in sect:
                if child.tag in (q("headerReference"), q("footerReference")):
                    position += 1
                else:
                    break
            sect.insert(position, ref)
        return part

    # -- ids ---------------------------------------------------------------
    def next_id(self) -> int:
        best = 0
        for name in self.text_parts() + ["word/document.xml"]:
            for node in self.xml(name).iter():
                for key, value in node.attrib.items():
                    if key.endswith("}id") and value.isdigit():
                        best = max(best, int(value))
        return best + 1

    # -- save --------------------------------------------------------------
    def save(self, out: str | Path) -> Path:
        out = Path(out)
        out.parent.mkdir(parents=True, exist_ok=True)
        for name, root in list(self._cache.items()):
            self.parts[name] = etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=True)
        ordered = [name for name in self.order if name in self.parts]
        ordered = ["[Content_Types].xml"] + [n for n in ordered if n != "[Content_Types].xml"]
        with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
            for name in ordered:
                zf.writestr(name, self.parts[name])
        return out


# -- run / paragraph helpers ------------------------------------------------

def make_run(text: str, rpr=None, tag: str = "t"):
    run = etree.Element(q("r"))
    if rpr is not None:
        run.append(rpr)
    node = etree.SubElement(run, q(tag))
    node.text = text
    node.set(q("space", XML), "preserve")
    return run


def first_rpr(paragraph):
    for run in paragraph.iter(q("r")):
        rpr = run.find(q("rPr"))
        if rpr is not None:
            return rpr
    return None


def clear_paragraph_content(paragraph, keep=("pPr", "bookmarkStart", "bookmarkEnd")) -> None:
    for child in list(paragraph):
        if child.tag in {q(k) for k in keep}:
            continue
        paragraph.remove(child)


def set_paragraph_text(paragraph, text: str) -> None:
    rpr = first_rpr(paragraph)
    clear_paragraph_content(paragraph)
    paragraph.append(make_run(text, rpr))


def paragraph_style(paragraph) -> str:
    ppr = paragraph.find(q("pPr"))
    if ppr is None:
        return ""
    style = ppr.find(q("pStyle"))
    return style.get(q("val")) if style is not None else ""


def heading_level(paragraph) -> int:
    style = paragraph_style(paragraph).lower()
    if style == "title":
        return 0
    for prefix in ("heading", "heading"):
        if style.startswith(prefix):
            tail = style[len(prefix):].strip()
            if tail.isdigit():
                return int(tail)
    ppr = paragraph.find(q("pPr"))
    if ppr is not None:
        outline = ppr.find(q("outlineLvl"))
        if outline is not None and (outline.get(q("val")) or "").isdigit():
            return int(outline.get(q("val"))) + 1
    return 0


# -- fields -----------------------------------------------------------------

def _field_type(instr: str) -> str:
    token = (instr or "").strip().split(" ")[0] if (instr or "").strip() else ""
    return token.upper()


def paragraph_fields(paragraph) -> list[dict]:
    """Return fields in a paragraph as {kind, instr, result, span}."""
    out: list[dict] = []
    start = None
    buffer_instr: list[str] = []
    buffer_result: list[str] = []
    span: list = []
    for child in paragraph:
        if child.tag == q("fldSimple"):
            instr = (child.get(q("instr")) or "").strip()
            out.append({"kind": "simple", "instr": instr, "type": _field_type(instr), "result": text_of(child), "span": [child]})
            continue
        if child.tag != q("r"):
            if start is not None:
                span.append(child)
                buffer_result.append(text_of(child))
            continue
        fld = child.find(q("fldChar"))
        if fld is not None:
            kind = fld.get(q("fldCharType"))
            if kind == "begin":
                start = child
                span = [child]
                buffer_instr = []
                buffer_result = []
                continue
            if kind == "separate":
                if start is not None:
                    span.append(child)
                continue
            if kind == "end" and start is not None:
                span.append(child)
                instr = " ".join(part.strip() for part in buffer_instr if part.strip())
                out.append({"kind": "complex", "instr": instr, "type": _field_type(instr), "result": "".join(buffer_result), "span": list(span)})
                start = None
                continue
        if start is not None:
            span.append(child)
            for node in child.findall(q("instrText")):
                buffer_instr.append(node.text or "")
            buffer_result.append(text_of(child))
    return out


def iter_fields(doc: Docx):
    for part in doc.text_parts():
        for paragraph in doc.paragraphs(part):
            for field in paragraph_fields(paragraph):
                yield part, paragraph, field


def field_runs(instr: str, result: str = "", rpr=None) -> list:
    begin = etree.Element(q("r"))
    if rpr is not None:
        begin.append(_copy(rpr))
    fld = etree.SubElement(begin, q("fldChar"))
    fld.set(q("fldCharType"), "begin")
    instr_run = etree.Element(q("r"))
    if rpr is not None:
        instr_run.append(_copy(rpr))
    node = etree.SubElement(instr_run, q("instrText"))
    node.text = " %s " % instr
    node.set(q("space", XML), "preserve")
    sep = etree.Element(q("r"))
    if rpr is not None:
        sep.append(_copy(rpr))
    etree.SubElement(sep, q("fldChar")).set(q("fldCharType"), "separate")
    out = [begin, instr_run, sep]
    if result:
        out.append(make_run(result, _copy(rpr) if rpr is not None else None))
    end = etree.Element(q("r"))
    if rpr is not None:
        end.append(_copy(rpr))
    etree.SubElement(end, q("fldChar")).set(q("fldCharType"), "end")
    out.append(end)
    return out


def _copy(node):
    return etree.fromstring(etree.tostring(node))


def field_simple(instr: str, result: str = "") -> etree._Element:
    node = etree.Element(q("fldSimple"))
    node.set(q("instr"), " %s " % instr)
    if result:
        node.append(make_run(result))
    return node


def add_bookmark(parent, name: str, ident: int) -> None:
    start = etree.SubElement(parent, q("bookmarkStart"))
    start.set(q("id"), str(ident))
    start.set(q("name"), name)
    end = etree.SubElement(parent, q("bookmarkEnd"))
    end.set(q("id"), str(ident))


# -- watermarks -------------------------------------------------------------

_WATERMARK_SHAPETYPE = """<v:shapetype xmlns:v="urn:schemas-microsoft-com:vml" id="_x0000_t136" coordsize="21600,21600" adj="10800" path="m@7,l@8,m@5,21600l@11,21600e"><v:formulas><v:f eqn="sum #0 0 10800"/><v:f eqn="prod #0 2 1"/><v:f eqn="sum 21600 0 @1"/><v:f eqn="sum 0 0 @2"/><v:f eqn="sum 21600 0 @3"/><v:f eqn="if @0 @3 0"/><v:f eqn="if @0 21600 @1"/><v:f eqn="if @0 0 @2"/><v:f eqn="if @0 @4 21600"/><v:f eqn="mid @5 @6"/><v:f eqn="mid @8 @5"/><v:f eqn="mid @7 @8"/><v:f eqn="mid @6 @7"/><v:f eqn="sum @6 0 @5"/></v:formulas><v:path textpathok="t"/><v:textpath on="t" fitshape="t"/><v:handles><v:h position="#0,bottomRight" xrange="6629,14971"/></v:handles></v:shapetype>"""

_WATERMARK_STYLE = (
    "position:absolute;margin-left:0;margin-top:0;width:468pt;height:117pt;"
    "rotation:-45;z-index:-251658752;mso-position-horizontal:center;"
    "mso-position-horizontal-relative:margin;mso-position-vertical:center;"
    "mso-position-vertical-relative:margin"
)


def watermark_paragraph(text: str, ident: int = 1, color: str = "#C0C0C0"):
    """A header paragraph holding one VML text watermark."""
    paragraph = etree.Element(q("p"))
    run = etree.SubElement(paragraph, q("r"))
    run_props = etree.SubElement(run, q("rPr"))
    etree.SubElement(run_props, q("noProof"))
    pict = etree.SubElement(run, q("pict"))
    pict.append(etree.fromstring(_WATERMARK_SHAPETYPE))
    shape = etree.SubElement(pict, q("shape", V))
    shape.set("id", "WaterMarkObject%d" % ident)
    shape.set("type", "#_x0000_t136")
    shape.set("style", _WATERMARK_STYLE)
    shape.set("fillcolor", color)
    shape.set("stroked", "f")
    textpath = etree.SubElement(shape, q("textpath", V))
    textpath.set("style", 'font-family:"Calibri";font-size:1pt')
    textpath.set("string", text)
    return paragraph


def watermark_texts(doc: Docx) -> list[dict]:
    """Every VML text watermark in the headers, with the paragraph that holds it."""
    found = []
    for part in doc.names("word/header"):
        for textpath in doc.xml(part).iter(q("textpath", V)):
            paragraph = textpath
            while paragraph is not None and paragraph.tag != q("p"):
                paragraph = paragraph.getparent()
            found.append({"part": part, "text": textpath.get("string"), "paragraph": paragraph})
    return found


# -- helper CLI -------------------------------------------------------------

def office_cli_path() -> Path | None:
    """Locate python/office_cli.py: DSH_OFFICE_CLI, then the repo around this skill."""
    override = os.environ.get("DSH_OFFICE_CLI")
    candidates = [Path(override)] if override else []
    here = Path(__file__).resolve()
    for depth in range(1, 7):
        try:
            candidates.append(here.parents[depth] / "python" / "office_cli.py")
        except IndexError:
            break
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    return None


def run_office_cli(argv: list[str], timeout: int = 600) -> tuple[int, str, str]:
    """Run the helper CLI and return (returncode, stdout, stderr)."""
    cli = office_cli_path()
    if cli is None:
        return 127, "", "helper CLI not found; set DSH_OFFICE_CLI to python/office_cli.py"
    try:
        finished = subprocess.run([sys.executable, str(cli), *argv], capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return 124, "", "helper CLI timed out after %ds" % timeout
    return finished.returncode, finished.stdout, finished.stderr


def cli_json(text: str) -> dict | None:
    """Parse the last JSON object printed by the helper CLI (pretty-printed or one line)."""
    if not text:
        return None
    position = text.find("{")
    while position != -1:
        try:
            return json.loads(text[position:])
        except json.JSONDecodeError:
            position = text.find("{", position + 1)
    return None


def emit(payload, out: str | None = None) -> None:
    text = json.dumps(payload, indent=2, ensure_ascii=False)
    if out:
        Path(out).write_text(text + "\n", encoding="utf-8")
    else:
        print(text)


# -- CLI --------------------------------------------------------------------

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Inspect or dump parts of a .docx package.")
    sub = parser.add_subparsers(dest="command", required=True)
    parts = sub.add_parser("parts", help="list package parts with sizes")
    parts.add_argument("docx")
    text = sub.add_parser("text", help="dump paragraph text with style and index")
    text.add_argument("docx")
    text.add_argument("--part", default="word/document.xml")
    xml = sub.add_parser("xml", help="print one part as XML")
    xml.add_argument("docx")
    xml.add_argument("part")
    args = parser.parse_args(argv)

    try:
        doc = Docx(args.docx)
    except (OSError, zipfile.BadZipFile) as exc:
        print("error: %s" % exc, file=sys.stderr)
        return 1
    if args.command == "parts":
        emit({"ok": True, "parts": [{"name": name, "bytes": len(doc.parts[name])} for name in doc.order]})
    elif args.command == "text":
        if not doc.exists(args.part):
            print("error: no part %s" % args.part, file=sys.stderr)
            return 1
        rows = []
        for index, paragraph in enumerate(doc.paragraphs(args.part)):
            rows.append({"index": index, "style": paragraph_style(paragraph), "level": heading_level(paragraph), "text": paragraph_text(paragraph)})
        emit({"ok": True, "part": args.part, "paragraphs": rows})
    else:
        if not doc.exists(args.part):
            print("error: no part %s" % args.part, file=sys.stderr)
            return 1
        print(etree.tostring(doc.xml(args.part), pretty_print=True, encoding="unicode"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
