# The Elect — Design System (Aged Paper)

The canonical component library for The Elect, mirrored to a
claude.ai/design **design-system project** via the `DesignSync` tool /
`/design-sync` skill. New persona pages and roster additions start from
these components instead of a hand-integration pass each time.

## Palette: Aged Paper

Warm vellum, sepia ink, rubric red, gold-leaf. A light reissue of the
original "Terminal Grimoire" dark theme — same structural bones, same
monospace, same content; the surface goes from near-black CRT to a
printed-tract register. Tokens are the single source of truth in
[`styles/tokens.css`](styles/tokens.css); the live site
(`../styles.css`) mirrors them.

## Cards (each is a `@dsCard` preview)

**Foundations**
- `foundations/colors.html` — the full color token set, swatched by role.
- `foundations/type.html` — the type scale (single mono family; weight +
  letter-spacing carry the hierarchy).

**Components**
- `components/roster-card-public.html` — a public persona tile (badge,
  ASCII portrait, name + register, description, primary/secondary links).
- `components/roster-card-withheld.html` — the withheld variant (neutral
  status, dashed disabled "no weights" link).
- `components/page-shell.html` — header + footer chrome a persona page
  starts from (sigils, letterpress title, rule, footer links).
- `components/controls.html` — status badges (public / withheld /
  training) and link buttons (primary / secondary / disabled).
- `components/section-heading.html` — roster + withheld section headings.

## Conventions

- Each preview is **self-contained**: the Aged Paper tokens are inlined so
  the Design System pane renders the card standalone.
- The first line of every preview is `<!-- @dsCard group="..." -->` — the
  pane builds its card index from that marker.
- Portrait inks are re-tinted per persona to hold contrast on cream while
  keeping each figure's hue identity (deep red, spectral green, ink-blue,
  bronze, etc.).
- No glows, no CRT scanlines — paper foxing + a faint sheet-lift shadow
  replace the terminal texture.
