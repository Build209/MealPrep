# Design skills in this folder

Added 2026-10-10 by the design session at the owner's request.

| Folder | What | Source | Licence |
|---|---|---|---|
| `impeccable/` | Impeccable design skill 4.5.2: `SKILL.md` and `reference/`, copied unchanged | github.com/pbakaus/impeccable at d631a88 (2026-10-08) | Apache 2.0, see `impeccable/LICENSE` and `NOTICE.md` |
| `design-second-opinion/` | Our own short skill plus Taste Skill's redesign checklist, copied unchanged, as `reference/taste-redesign-audit.md` | github.com/Leonxlnx/taste-skill at 717446e (2026-10-09) | MIT, see `design-second-opinion/reference/LICENSE` |

Left out on purpose:

- Impeccable's `scripts/` folder (the launcher that downloads and runs its checker program, and the live browser helper) and its hooks. Nothing in this folder runs code. Where the skill asks for `scripts/impeccable`, it will not be found; the skill's own "Launcher unavailable" path applies: read `PRODUCT.md` and `DESIGN.md` directly and carry on.
- The other twelve Taste Skill files (style presets, image generation, the default skill). They would pull against the approved look.

To turn on Impeccable's automatic checker later, the owner runs `npx impeccable install` on his own computer in this repo and reviews what it adds. That is a separate decision.

Order of authority for any design change: the compliance doc's rules, then `PRODUCT.md` and `DESIGN.md`, then Impeccable, then the second-opinion checklist.
