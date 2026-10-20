# Form field mechanics

## Field tree

`/AcroForm` in the catalog holds `/Fields`, the root field array. A field dictionary has:

- `/T` — partial name; the full name is the partial names of ancestors joined with dots.
- `/FT` — field type, inherited: `Tx` text, `Btn` button, `Ch` choice, `Sig` signature.
- `/V` — current value. Text fields store a string; buttons store the selected state name (`/Yes`, `/Off`, `/basic`); choice fields store a string or an array of strings; signature fields store a dictionary.
- `/Ff` — flags bitmask, inherited. Bit 1 (`1`) read-only, bit 2 (`2`) required, bit 13 (`4096`) multiselect for choices, bits 15–17 (`65536`/`131072`/`262144`) button behaviour (no-toggle, radio, pushbutton).
- `/DA` — default appearance string; controls the font and colour an appearance generator uses.
- `/Kids` — child fields or widgets.
- `/AP` — appearance dictionary: `/N` normal, `/R` rollover, `/D` down. For a button, `/N` maps each state name to a form XObject; for text and choice fields, `/N` is one stream.
- `/Rect`, `/P`, `/AS` — widget geometry, owning page, and the button state a widget currently shows.
- `/NeedAppearances` in `/AcroForm` — documented flag that asks viewers to regenerate appearances; many viewers ignore it, which is why a file can hold a correct `/V` and show nothing.

## What a fill must satisfy

1. Field `/V` equals the requested value, in the field's expected representation (boolean → state name, radio → that button's on-state, choice → string or list).
2. The widget's `/AP /N` exists and is a stream or state map with a `/BBox` and `/Resources`; the stream's content paints the value.
3. The widget's `/AS` names a state present in `/AP /N`; for a radio group every widget's `/AS` must be the group's chosen state or `/Off`.
4. The value is visible on the page: rendered inside `/Rect`, not clipped, not hidden behind the page content.

Updating `/V` alone satisfies 1 and fails 2–4. That is the "filled but blank" failure. Rebuilding the appearance and forgetting to remove a stale `/AS` satisfies 1–3 and shows two selected radio buttons. Reopening and checking 1–3 after save, then rendering for 4, is the whole discipline.

pypdf's `update_page_form_field_values(writer, page, values, flags, auto_regenerate, flatten)` handles 1–3 for common field types when the writer cloned the document properly (and `writer.reattach_fields(page)` was called where needed). Button groups need the extra `/AS` synchronisation described in `tasks/forms.md`.

## Flattening

Two meanings, both destructive in different ways:

- `flatten=True` in `update_page_form_field_values` paints each widget's current appearance into the page content and removes the interactive field.
- Post-process: remove `/Widget` annotations with `writer.remove_annotations(subtypes="/Widget")` and pop `/AcroForm` from the catalog. This alone leaves the widget's appearance in place, so the page looks unchanged while the fields stop responding.

Do both when the user wants a non-editable form. Verify: zero `/Widget` annotations remain, no `/AcroForm` in the catalog, and the rendered page still shows the values.

## Appearance streams

An appearance stream is a form XObject.

```
/Type /XObject
/Subtype /Form
/BBox [0 0 200 14]
/Resources << /Font << /Helv 5 0 R >> >>
```

`/BBox` is the drawing area in the widget's own coordinates; the widget's `/Rect` maps that area onto the page. A generated stream usually sets the font from `/DA`, positions text at a small inset, and clips to `/BBox`. When a field must look right and its own appearance is missing, drawing a replacement with reportlab at `/Rect` coordinates and merging it into the page produces the same visual result without lying about the field value.

## Signature fields

`/FT /Sig` requires a certificate and a signing implementation. Filling text into a signature field, or editing any page of an already-signed document, breaks the signature. Say that plainly and offer the unsigned rebuild; do not present an edited document as signed.

## Choice fields

`/Opt` lists the allowed options; `/V` is the chosen value or values. A single-select choice takes a string; multi-select takes an array. If the value is not in `/Opt`, viewers show blank — validate against `/Opt` before writing, and report the allowed options when the requested value is missing.
