# AcroForm inspection and filling

A form PDF carries `/AcroForm` in the catalog. Its `/Fields` array holds field dictionaries: `/T` the partial name, `/FT` the type (`Tx` text, `Btn` button, `Ch` choice, `Sig` signature), `/V` the value, `/Ff` flags, `/DA` the default appearance, and `/AP` appearance streams. A widget is the field's visual rectangle (`/Rect`, `/P` parent page, `/AS` its currently selected state name). A field can own several widgets (radio groups), and a widget can be a separate object from its field, reached through `/Parent`. Text in a filled field is usually not in the page content stream — it lives in the widget's `/AP /N` appearance, which is why "the value is in `/V`" and "the page shows the value" are two different facts to check.

## Inspect first

```bash
"<python>" "<skill>/scripts/forms.py" inspect --input "<file.pdf>"
```

Reports, per field: id/name, type, value, read-only/required, widget count, page numbers, current states for buttons, and whether each widget has an `/AP` stream. Read the whole report before touching values: duplicate names, missing appearance streams, and read-only flags are the usual reason a fill "does nothing".

## Fill

```bash
"<python>" "<skill>/scripts/forms.py" fill --input "<file.pdf>" --out "<file-filled.pdf>" --values "<values.json>"
```

```json
{ "full_name": "Ada Lovelace", "email": "ada@example.org", "agree": true, "plan": "/basic" }
```

Text fields take strings, checkboxes take booleans or the state name, radio groups take the state you want selected, choice fields take a string or list. The dictionary is keyed by field name (`/T`, nested names joined with dots). The script fails with a non-zero exit when a name does not exist instead of silently skipping it, when a value is not one of the allowed states, and when the saved file fails the verification below. Pass `--flatten` to bake the values into the page and drop the form.

## The discipline that makes a fill real

pypdf writes `/V` and rebuilds the widget appearance. Both must be re-checked after saving, because a writer can update one and not the other:

1. Reopen the saved file.
2. For every field you set, read `/V` from the field dictionary and compare it with the requested value.
3. For every widget, confirm `/AP /N` exists and is a non-empty stream with a `/BBox`; for radio and checkbox groups, confirm `/AS` names a state that exists in `/AP /N`.
4. Render the page and look at the field.

Steps 1–3 catch a stale or missing appearance; step 4 catches a `/V` that is right while the page still shows the old text. The script does 1–3 itself and prints `applied`/`not_applied`; treat `not_applied` as a failure to fix, never as a warning.

When you build the check by hand:

```bash
"<python>" - <<'PY'
from pypdf import PdfReader
reader = PdfReader("filled.pdf")
fields = reader.get_fields() or {}
root = reader.trailer["/Root"].get("/AcroForm")
for name, field in fields.items():
    widgets = field.get("/Kids") or []
    for widget in widgets:
        states = list((widget.get("/AP", {}).get("/N", {}) or {}).keys())
        print(name, field.get("/V"), widget.get("/AS"), states, "bbox" in str(widget.get("/AP")))
PY
```

Radio groups are the common failure: pypdf updates the group `/V`, but the widget-level `/AS` for the previously selected button can stay behind, so two buttons look selected. The script resynchronises every widget's `/AS` from the group value; if you fill by hand, do the same.

## Flatten

Flattening is for files that must no longer be editable. Update with `flatten=True` (the value is painted into the page content), then remove every widget annotation (`subtypes="/Widget"`) and drop `/AcroForm` from the catalog. Verify afterwards: no `/Widget` annotations remain and the catalog has no `/AcroForm`. If widgets remain, the file still looks editable in readers even though the content carries the value.

## What cannot be filled, and the fix

- **A field with no appearance stream and a broken `/DA`**: the reader may refuse to show a new value. Render after filling; if the value is invisible, rebuild that widget's appearance with reportlab and merge it over the page.
- **A signature field (`/FT /Sig`)**: signing requires a certificate and a signer implementation that this runtime does not ship. Adding text to a signed field invalidates the signature. Tell the user the signature cannot be created here and what would (a certificate plus a signing tool).
- **A form where the values are drawn as static text, not widgets**: the file is not a form. Inspect with `page.get_text()` — if the labels and lines are plain content and `reader.get_fields()` is empty, treat it as an edit job, not a fill job.
- **A flat, scanned form**: no field tree exists; filling means drawing text at coordinates (a stamp overlay) and the render decides whether it lines up.

## Verify

Always: reopen, check `/V`, check `/AP`, then `"<python>" "<cli>" pdf render --input "<file-filled.pdf>" --out-dir "render"` and `read_image` the page. The filled value must be visible inside its widget box, without clipping or overlapping the box border.
