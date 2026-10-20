#!/usr/bin/env python3
"""Inspect and fill AcroForm fields in a PDF, then re-check what was written.

A widget annotation can paint one value while the canonical field tree holds a
different one, so this tool treats the file as two views of the same data and
compares them after saving. `inspect` reports both views, plus orphaned widgets
and name collisions. `fill` repairs orphans, writes values, can flatten, then
reopens the result and fails loudly when a value or an appearance is missing.

Exit codes: 0 success, 1 bad arguments, 2 unreadable input or write failure,
3 refused (missing fields, ambiguous widgets, unsafe overwrite),
4 written file failed verification.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

try:
    from pypdf.generic import IndirectObject, NameObject
except ImportError:  # pragma: no cover - pypdf is a required dependency
    IndirectObject = None  # type: ignore[assignment]
    NameObject = None  # type: ignore[assignment]


def emit(value, out=None):
    text = json.dumps(value, ensure_ascii=False, indent=2, default=str)
    if out:
        target = Path(out).expanduser()
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text + "\n", encoding="utf-8")
    print(text)


def fail(message, code=1, detail=None):
    payload = {"ok": False, "error": message}
    if detail is not None:
        payload["detail"] = detail
    print(json.dumps(payload, ensure_ascii=False, indent=2, default=str), file=sys.stderr)
    raise SystemExit(code)


def ref_id(node):
    if isinstance(node, IndirectObject):
        return node.idnum
    return None


def load_values(spec):
    if spec == "-":
        raw = sys.stdin.read()
    elif spec.strip().startswith(("{", "[")):
        raw = spec
    else:
        path = Path(spec).expanduser()
        if not path.is_file():
            fail(f"values file not found: {path}", code=2)
        raw = path.read_text(encoding="utf-8-sig")
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        fail(f"invalid values JSON: {exc}")
    if isinstance(data, dict) and isinstance(data.get("fields"), dict):
        data = data["fields"]
    if not isinstance(data, dict):
        fail('values must be a JSON object of {field name: value}')
    return data


def field_tree(reader):
    """Walk /AcroForm/Fields and return terminal fields with their references."""
    entries = []
    try:
        root = reader.trailer["/Root"]
        acroform = root.get("/AcroForm")
    except Exception:
        acroform = None
    if acroform is None:
        return entries
    fields = acroform.get_object().get("/Fields") or []
    for node in fields:
        walk_field(node, "", entries, 0)
    return entries


def walk_field(node, prefix, entries, depth):
    if depth > 12 or node is None:
        return
    obj = node.get_object()
    tag = obj.get("/T")
    name = prefix
    if tag is not None:
        name = f"{prefix}.{tag}" if prefix else str(tag)
    raw_kids = list(obj.get("/Kids") or [])
    kids = [kid.get_object() for kid in raw_kids]
    child_fields = [kid for kid in kids if kid.get("/T") is not None]
    if obj.get("/FT") is not None and not child_fields:
        widgets = [ref_id(kid) for kid, kid_obj in zip(raw_kids, kids) if kid_obj.get("/Subtype") == "/Widget"]
        if not widgets and obj.get("/Subtype") == "/Widget":
            widgets = [ref_id(node)]
        entries.append(
            {
                "name": name,
                "ref": ref_id(node),
                "type": str(obj.get("/FT")) if obj.get("/FT") is not None else None,
                "value": scalar(obj.get("/V")),
                "default": scalar(obj.get("/DV")),
                "flags": scalar(obj.get("/Ff")),
                "options": [str(option) for option in (obj.get("/Opt") or [])],
                "widget_refs": widgets,
                "node": obj,
            }
        )
    for kid_node, kid in zip(raw_kids, kids):
        if kid.get("/T") is not None:
            walk_field(kid_node, name, entries, depth + 1)


def scalar(value):
    if value is None:
        return None
    try:
        resolved = value.get_object()
    except AttributeError:
        resolved = value
    if isinstance(resolved, (list, tuple)):
        return [scalar(item) for item in resolved]
    if hasattr(resolved, "get_data"):
        return str(resolved)
    text = str(resolved)
    return text


def widget_name(widget):
    node = widget
    for _ in range(8):
        tag = node.get("/T")
        if tag is not None:
            return str(tag)
        parent = node.get("/Parent")
        if parent is None:
            return None
        node = parent.get_object()
    return None


def inherited(widget, key):
    node = widget
    for _ in range(8):
        value = node.get(key)
        if value is not None:
            return value
        parent = node.get("/Parent")
        if parent is None:
            return None
        node = parent.get_object()
    return None


def appearance(widget):
    ap = widget.get("/AP")
    if ap is None:
        return "missing", []
    normal = ap.get_object().get("/N")
    if normal is None:
        return "missing", []
    normal = normal.get_object()
    if hasattr(normal, "get_data"):
        return ("stream" if normal.get_data() else "empty_stream"), []
    if hasattr(normal, "keys"):
        states = [str(key) for key in normal.keys()]
        current = str(widget.get("/AS") or inherited(widget, "/V") or "")
        entry = normal.get(current) if current else None
        if entry is None:
            return "states_without_current", states
        entry = entry.get_object()
        length = len(entry.get_data()) if hasattr(entry, "get_data") else 0
        return ("states" if length else "states_empty_stream"), states
    return "unknown", []


def inspect_document(reader):
    entries = field_tree(reader)
    names = [entry["name"] for entry in entries]
    canonical = {entry["ref"]: entry for entry in entries if entry["ref"] is not None}

    widgets = []
    for page_number, page in enumerate(reader.pages, start=1):
        for annotation in page.get("/Annots") or []:
            obj = annotation.get_object()
            if obj.get("/Subtype") != "/Widget":
                continue
            state, states = appearance(obj)
            widgets.append(
                {
                    "page": page_number,
                    "ref": ref_id(annotation),
                    "name": widget_name(obj),
                    "parent_ref": ref_id(obj.get("/Parent")) if obj.get("/Parent") is not None else None,
                    "rect": [round(float(value), 2) for value in (obj.get("/Rect") or [])],
                    "value": scalar(obj.get("/AS")) if obj.get("/AS") is not None else scalar(inherited(obj, "/V")),
                    "field_type": str(inherited(obj, "/FT")) if inherited(obj, "/FT") is not None else None,
                    "state": scalar(obj.get("/AS")),
                    "appearance": state,
                    "appearance_states": states,
                    "_obj": obj,
                }
            )

    orphans = []
    ambiguous = []
    seen_widget_refs = {}
    for widget in widgets:
        name = widget["name"]
        has_parent = widget["parent_ref"] is not None
        if name is None:
            orphans.append({"page": widget["page"], "ref": widget["ref"], "reason": "widget has no /T and no /Parent that names it"})
            continue
        if not has_parent and (widget["ref"] not in canonical):
            orphans.append(
                {
                    "page": widget["page"],
                    "ref": widget["ref"],
                    "name": name,
                    "reason": "widget is not reachable from /AcroForm/Fields",
                }
            )
        if not has_parent and name in names:
            field = next((entry for entry in entries if entry["name"] == name), None)
            if field is not None and field["ref"] != widget["ref"]:
                ambiguous.append(
                    {
                        "name": name,
                        "widget_ref": widget["ref"],
                        "field_ref": field["ref"],
                        "detail": "widget and canonical field share a name but are separate objects without a /Parent link",
                    }
                )
        seen_widget_refs.setdefault(widget["ref"], name)

    duplicates = sorted({name for name in names if names.count(name) > 1})
    for name in duplicates:
        ambiguous.append({"name": name, "detail": "more than one top-level field carries this name"})

    need_appearances = False
    try:
        acroform = reader.trailer["/Root"].get("/AcroForm")
        if acroform is not None:
            need_appearances = bool(acroform.get_object().get("/NeedAppearances", False))
    except Exception:
        need_appearances = False

    return {
        "field_count": len(entries),
        "widget_count": len(widgets),
        "fields": [{key: value for key, value in entry.items() if key != "node"} for entry in entries],
        "widgets": [{key: value for key, value in widget.items() if key != "_obj"} for widget in widgets],
        "orphans": orphans,
        "ambiguous": ambiguous,
        "need_appearances": need_appearances,
    }


def normalise(value):
    if isinstance(value, bool):
        return "Yes" if value else "Off"
    text = "" if value is None else str(value)
    return text[1:] if text.startswith("/") else text


def values_for_field(field, value):
    if isinstance(value, bool):
        return "/Yes" if value else "/Off"
    if isinstance(value, (list, tuple)):
        return [str(item) for item in value]
    return str(value)


def write_fill(args, values):
    from pypdf import PdfReader, PdfWriter

    reader = PdfReader(str(args.input))
    report = inspect_document(reader)
    if report["ambiguous"] and not (args.allow_ambiguous or args.flatten):
        report.update(
            {
                "ok": False,
                "error": "refusing to fill: the widget and field views disagree",
                "hint": "inspect the report, then rerun with --flatten for a static result or --allow-ambiguous if you are certain",
            }
        )
        emit(report, args.json_out)
        raise SystemExit(3)

    writer = PdfWriter()
    writer.clone_document_from_reader(reader)

    reattached = 0
    if not args.no_reattach:
        reattached = len(writer.reattach_fields() or [])

    fields = writer.get_fields() or {}
    expected = {name: values_for_field(fields[name], value) for name, value in values.items() if name in fields}
    missing = sorted(set(values) - set(fields))
    if missing:
        result = {
            "ok": False,
            "error": "fields named in the values file do not exist in this PDF",
            "missing": missing,
            "available": sorted(fields),
            "input": str(args.input),
        }
        emit(result, args.json_out)
        raise SystemExit(3)

    payload = dict(values)
    if args.flatten:
        current = {
            name: field.get("/V", "/Off" if field.get("/FT") == "/Btn" else "")
            for name, field in fields.items()
        }
        current.update(payload)
        payload = current
    payload = {name: values_for_field(fields[name], value) for name, value in payload.items()}

    writer.update_page_form_field_values(None, payload, auto_regenerate=False, flatten=args.flatten)
    sync_button_states(writer)
    if args.flatten:
        writer.remove_annotations(subtypes="/Widget")
        writer.root_object.pop(NameObject("/AcroForm"), None)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    with open(args.out, "wb") as handle:
        writer.write(handle)

    checks = verify(args.out, expected, flatten=args.flatten)
    rendered = render(args.out, args.render_dir, args.dpi)

    result = {
        "ok": all(check["ok"] for check in checks),
        "input": str(args.input),
        "output": str(args.out),
        "flatten": args.flatten,
        "reattached_fields": reattached,
        "written": expected,
        "checks": checks,
        "rendered_pages": rendered,
        "before": {
            "field_count": report["field_count"],
            "widget_count": report["widget_count"],
            "orphans": report["orphans"],
            "ambiguous": report["ambiguous"],
        },
    }
    emit(result, args.json_out)
    if not result["ok"]:
        raise SystemExit(4)


def sync_button_states(writer):
    """Point each button widget's /AS at the field /V, clearing stale kid values."""
    for page in writer.pages:
        for annotation in page.get("/Annots") or []:
            widget = annotation.get_object()
            if widget.get("/Subtype") != "/Widget" or inherited(widget, "/FT") != "/Btn":
                continue
            parent = widget.get("/Parent")
            source = parent.get_object() if parent is not None else widget
            value = source.get("/V") if source.get("/FT") == "/Btn" else None
            normal = widget.get("/AP")
            if normal is not None:
                normal = normal.get_object().get("/N")
            if normal is None or hasattr(normal, "get_data"):
                continue
            normal = normal.get_object()
            raw = str(value) if value is not None else None
            candidates = [] if raw is None else [raw, raw if raw.startswith("/") else f"/{raw}"]
            chosen = "/Off"
            for candidate in candidates:
                if normal.get(candidate) is not None:
                    chosen = candidate if candidate.startswith("/") else f"/{candidate}"
                    break
            widget[NameObject("/AS")] = NameObject(chosen)
            if "/V" in widget and parent is not None:
                del widget["/V"]


def verify(path, expected, flatten):
    from pypdf import PdfReader

    reader = PdfReader(str(path))
    checks = []
    if not flatten:
        fields = reader.get_fields() or {}
        for name, wanted in expected.items():
            found = fields.get(name)
            if found is None:
                checks.append({"check": f"field {name} present", "ok": False, "expected": wanted, "actual": None})
                continue
            actual = scalar(found.get("/V"))
            checks.append(
                {
                    "check": f"field {name} /V",
                    "ok": normalise(actual) == normalise(wanted),
                    "expected": normalise(wanted),
                    "actual": normalise(actual),
                }
            )

    view = inspect_document(reader)
    widgets = view["widgets"]
    if flatten:
        checks.append({"check": "no widgets remain", "ok": len(widgets) == 0, "actual": len(widgets)})
        checks.append(
            {
                "check": "no form fields remain",
                "ok": not (reader.get_fields() or {}),
                "actual": sorted(reader.get_fields() or {}),
            }
        )
        checks.append(
            {
                "check": "/AcroForm removed",
                "ok": "/AcroForm" not in reader.trailer["/Root"],
                "actual": "/AcroForm" in reader.trailer["/Root"],
            }
        )
    else:
        grouped = {}
        for widget in widgets:
            grouped.setdefault(widget["name"], []).append(widget)
        for name, members in grouped.items():
            if name not in expected:
                continue
            wanted = normalise(expected[name])
            for widget in members:
                checks.append(
                    {
                        "check": f"widget {name} has an appearance stream",
                        "ok": widget["appearance"] in {"stream", "states"},
                        "page": widget["page"],
                        "appearance": widget["appearance"],
                        "states": widget["appearance_states"],
                    }
                )
            if members[0]["field_type"] == "/Btn":
                painted = [normalise(widget["value"]) for widget in members]
                if wanted == "Off":
                    ok = all(state == "Off" for state in painted)
                else:
                    ok = wanted in painted
                checks.append(
                    {
                        "check": f"button group {name} paints {wanted}",
                        "ok": ok,
                        "actual": painted,
                    }
                )
            else:
                for widget in members:
                    effective = normalise(widget["value"])
                    checks.append(
                        {
                            "check": f"widget {name} agrees with field /V",
                            "ok": effective == wanted,
                            "page": widget["page"],
                            "actual": effective,
                        }
                    )
    return checks


def render(path, out_dir, dpi):
    if not out_dir:
        return []
    try:
        import pymupdf
    except ImportError:  # pragma: no cover
        import fitz as pymupdf  # type: ignore[no-redef]
    out_dir.mkdir(parents=True, exist_ok=True)
    zoom = dpi / 72.0
    pages = []
    with pymupdf.open(str(path)) as document:
        for index, page in enumerate(document, start=1):
            target = out_dir / f"page-{index}.png"
            page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), alpha=False).save(str(target))
            pages.append(str(target))
    return pages


def main():
    parser = argparse.ArgumentParser(
        description="Inspect or fill AcroForm fields, then verify the written values and appearances.",
        epilog="Example: forms.py fill --input form.pdf --out form-filled.pdf --values values.json",
    )
    commands = parser.add_subparsers(dest="command", required=True)

    inspect_parser = commands.add_parser("inspect", help="Report fields, widgets, orphans, and collisions")
    inspect_parser.add_argument("--input", required=True, help="PDF file to inspect")
    inspect_parser.add_argument("--json-out", help="Also write the JSON report to this path")

    fill_parser = commands.add_parser("fill", help="Write values, optionally flatten, then verify")
    fill_parser.add_argument("--input", required=True, help="Source PDF; it is never modified")
    fill_parser.add_argument("--out", required=True, help="Destination PDF")
    fill_parser.add_argument(
        "--values",
        required=True,
        help='JSON object of {field: value}; accepts a file path, inline JSON, or "-" for stdin',
    )
    fill_parser.add_argument("--flatten", action="store_true", help="Paint values and remove every widget")
    fill_parser.add_argument("--no-reattach", action="store_true", help="Do not repair widgets missing from /AcroForm/Fields")
    fill_parser.add_argument("--allow-ambiguous", action="store_true", help="Fill even when widget and field views disagree")
    fill_parser.add_argument("--render-dir", help="Rasterise the result here for a visual check")
    fill_parser.add_argument("--dpi", type=int, default=110, help="Render resolution (default: 110)")
    fill_parser.add_argument("--json-out", help="Also write the JSON report to this path")

    args = parser.parse_args()
    if args.command == "inspect":
        from pypdf import PdfReader

        source = Path(args.input).expanduser()
        if not source.is_file():
            fail(f"input not found: {source}", code=2)
        try:
            reader = PdfReader(str(source))
        except Exception as exc:
            fail(f"cannot open PDF: {exc}", code=2)
        report = inspect_document(reader)
        report.update({"ok": True, "input": str(source), "page_count": len(reader.pages)})
        emit(report, args.json_out)
        return

    source = Path(args.input).expanduser()
    if not source.is_file():
        fail(f"input not found: {source}", code=2)
    args.input = source
    args.out = Path(args.out).expanduser()
    if args.out.resolve() == source.resolve():
        fail("refusing to overwrite the source PDF; choose a different --out", code=3)
    if args.dpi < 24 or args.dpi > 600:
        fail("--dpi must be between 24 and 600")
    args.render_dir = Path(args.render_dir).expanduser() if args.render_dir else None
    write_fill(args, load_values(args.values))


if __name__ == "__main__":
    main()
