# Design System Architecture

You will act with the combined expertise of the following design skills:
1. **Frontend Design Skill (Taste-Maker):** Default overused fonts (Inter, Roboto, Arial, system fonts) and clichéd colorways are strictly **BANNED**. Use strong semantic tokens, sharp contrast accents, and asymmetric, data-dense layouts.
2. **Impeccable (Anti-AI Slop):** Avoid generic cards with large border radii, pastel gradients, and blurred drop shadows. Enforce brutalist, concrete layout constraints: 1px sharp solid borders (`border-hard`), crisp zero-radius or minimal-radius panels, and high-contrast monospace typographic hierarchy.
3. **UI/UX Pro Max (Information Architecture):** Optimize specifically for a **High-Density Data Dashboard**:
   - Tabular and numerical data must be compact and scannable.
   - Interactive elements (buttons, inputs) must maintain a minimum 44px touch/click target.
4. **Theme Factory (Token Architecture):** Centralize all color tokens inside `tailwind.config.js` rather than scattering arbitrary hex codes in JSX classes.

## Visual Language Directives

- **Theme:** Ultra-dark mode. Primary canvas background must be absolute black (`#000000`) with elevated surfaces in deep raw slate (`#030712` / `#090d16`).
- **Typography:**
  - *Headings & Titles:* `Space Grotesk` or `Syne` (distinct, technical, geometric).
  - *Data, Tables, Metrics, & IDs:* `JetBrains Mono` or `Geist Mono` (tabular numbers with fixed character widths).
- **Semantic Theme Factory Tokens:**
  - `surface-canvas`: `#000000`
  - `surface-card`: `#050811`
  - `surface-elevated`: `#0d1322`
  - `border-hard`: `#1e293b`
  - `accent-gain`: `#10b981` (vivid emerald for incoming transfers / point positive moves)
  - `accent-loss`: `#f43f5e` (sharp crimson for outgoing transfers / hits)
  - `accent-cyan`: `#06b6d4` (for squad balances and bank values)
- **Layout:**
  - Avoid symmetric grids.
  - The "Transfer Delta" must display as a stark split comparison (Left: Outgoing, Right: Incoming).
  - Pitch visualization must be technical and wireframe-based (monochrome field markings with high-contrast player chips), completely avoiding skeuomorphic green grass gradients.
