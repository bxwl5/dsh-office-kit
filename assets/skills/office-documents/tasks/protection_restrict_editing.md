# Restrict editing

**Goal.** Stop a reviewer from changing the body while still letting them comment or track changes — the "send for review" state, not encryption.

Editing restrictions live in `w:documentProtection` inside `word/settings.xml`. The modes are `readOnly`, `comments`, `trackedChanges`, `forms`, plus `enforcement` to switch the restriction on. This is a guardrail against accidental edits; it does not encrypt content and a determined reader can remove it.

## Set a mode

```bash
"<python>" "<skill>/scripts/set_protection.py" "<file.docx>" --mode comments --out "<file-review.docx>"
"<python>" "<skill>/scripts/set_protection.py" "<file.docx>" --mode readOnly --no_enforce --out "<file-open.docx>"
```

Modes and aliases: `off`/`none`, `readOnly`/`read_only`, `comments`/`comment`, `trackedChanges`/`tracked_changes`, `forms`/`form`. `--no_enforce` writes the setting without switching it on, which is useful when the opening dialog should be avoided.

`--hash` also writes a password hash (SHA-512, 100000 spins; `--salt`, `--spin_count` to change it). Be honest with the user: the hash deters casual edits, it is not encryption, and losing the password means the restriction has to be stripped from the XML.

## Which mode to pick

| Intent | Mode |
|---|---|
| Review comments only, no text edits | `comments` |
| All edits should be tracked | `trackedChanges` |
| Fill a form, nothing else | `forms` |
| View only | `readOnly` |

## Remove

```bash
"<python>" "<skill>/scripts/set_protection.py" "<file-protected.docx>" --mode off --out "<file-open.docx>"
```

## Verify

`docx_kit.py xml '<file.docx>' word/settings.xml | grep documentProtection` shows the element and its enforcement attribute. Then open behaviour matters, not the page — render will not show a restriction. Say which mode you applied, and that removing it needs the same script or Word's Review pane.

## Pitfalls

- Protected documents that also contain tracked changes and comments often prompt on open; apply the restriction last.
- `forms` mode without form fields leaves a document nobody can edit usefully.
- Protection marked with a hash cannot be turned off in Word without the password, but `--mode off` still clears it — that is why it is a guardrail, not security.
