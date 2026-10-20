# When a PDF job is beyond this pack

Every entry names the missing capability, what you can still deliver, and how the user resolves it. Never answer with a bare "unsupported": say what is missing, what the floor is, and give the next step.

## Scanned pages with no text layer

The words exist only as pixels; extraction and search cannot see them. `render_pages.py` reports `chars: 0` for such a page, and the render shows the text as an image.

- Still possible: render, crop with `read_image`, and transcribe the visible text; redact the image pixels with `--images pixels`; rebuild the page as a created PDF from the transcription.
- Resolution: the user supplies a text-based copy of the file, or runs OCR where they have it (this runtime has no OCR engine, so do not promise the words will be extracted here).

## Encrypted or password-protected files

pypdf and PyMuPDF can open with a password only if it is provided; every script here exits with "encrypted" and does no work.

- Resolution: ask the user to decrypt the file first, then re-run. Never write a password into a command line that will be logged.

## Signing and certificates

Creating a digital signature needs a certificate, a signer, and a signature field; the runtime has none of them. Editing a signed document invalidates its signature.

- Still possible: fill unsigned fields, rebuild the content, deliver an unsigned file — and say clearly that the signature is gone.
- Resolution: signing must happen in a tool with a certificate; the user applies it after the content is final.

## Paragraph-level re-editing

PDF has no paragraph model: the content stream is positioned glyphs and paths. "Rewrite this paragraph" becomes a block-level operation — redact the old block, stamp the new text, and check the reflow yourself. Truly reflowing a page means rebuilding it from extracted content.

- Still possible: replace a line or a block in place (see `tasks/annotations.md`), remove a block, stamp a note.
- Resolution for reflow: rebuild the document from a spec with the corrected text, and say that it was rebuilt rather than patched.

## Lexical repair of broken files

A file with a damaged cross-reference table may still render (viewers rebuild the xref) while strict parsers refuse it. If PyMuPDF or pypdf cannot open the file, do not silently produce an empty document.

- Still possible: report the parse error, ask the user to open and re-save the file in a reader (which repairs it), then re-run.
- Resolution: whichever tool originally produced the file should be told about the corruption.

## Tagged PDF and accessibility remediation

Reading order, alternative text, and tags live in a structure tree that the libraries here can read but not author reliably. A visual edit does not add tags.

- Still possible: keep the visual result correct and say the file is untagged.
- Resolution: accessibility remediation needs an authoring tool that writes the structure tree.

## PDF/A and archival conformance

Conformance requires font embedding rules, metadata schemas, and colour profiles that these libraries do not validate.

- Still possible: many PDF/A inputs will survive a page-level edit and remain close, but claiming conformance would be a guess.
- Resolution: validate with a dedicated PDF/A checker before delivery.

## Creating or restructuring form fields

pypdf can fill existing fields; creating a new interactive field with a correct `/AP` state map is much more than a fill. reportlab can draw a form-like appearance, but without a widget tree it is not a form.

- Still possible: stamp labels and values at coordinates so the printed result looks filled.
- Resolution: an authoring tool for interactive forms, or accept a non-interactive output and say so.
