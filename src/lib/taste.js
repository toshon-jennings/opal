// Taste-skill mode — design-taste directives injected into the system prompt
// for Perci's direct-API surfaces. Based on github.com/leonxlnx/taste-skill.
// When active, instructs the model to follow design-taste rules when generating
// frontend code (landing pages, portfolios, UIs).

/**
 * Build the system-prompt directive from taste config.
 * Config: { variance, motion, density, designRead? }
 * Returns '' if no config (no injection).
 */
export function tasteDirective(config) {
    if (!config || typeof config.variance !== 'number') return '';

    const { variance, motion, density, designRead } = config;

    const designReadLine = designRead
        ? `\nDesign read: "${designRead}"`
        : `\nInferred read: variance=${variance}, motion=${motion}, density=${density}. Adjust output accordingly.`;

    return `

TASTE-SKILL MODE — design-taste directives for frontend/UI generation.
Apply these rules when generating HTML, CSS, React, or any frontend/landing-page code.

Active dials:
- DESIGN_VARIANCE: ${variance} (1=symmetrical, 10=artsy chaos)
- MOTION_INTENSITY: ${motion} (1=static, 10=cinematic)
- VISUAL_DENSITY: ${density} (1=airy, 10=cockpit)
${designReadLine}

Core rules (always apply):
1. Typography: Display headlines text-4xl md:text-6xl tracking-tighter leading-none. Body text-base text-gray-600 leading-relaxed max-w-[65ch]. Default to Geist/Outfit/Satoshi — do NOT default to Inter. No Fraunces or Instrument_Serif.
2. Color: Max 1 accent color, saturation < 80%. NO automatic AI-purple glows. No warm-beige + brass + oxblood for premium-consumer briefs (rotate alternatives: forest, cobalt + cream, terracotta + slate). One palette per project, locked.
3. Layout: Anti-center bias when variance >= 5. Hero must fit in initial viewport — headline max 2 lines, subtext max 20 words. No em-dashes. Navigation on single line at desktop.
4. Motion: Use motion/react (not framer-motion). Spring physics. Motion must be motivated (hierarchy/storytelling/feedback/state-change) — never "just cool". Max 1 marquee per page.
5. Responsive: Use h-[100dvh] for full-height, never h-screen. Mobile collapse explicit per section.
6. Accessibility: Button contrast WCAG AA. Form labels above inputs. No placeholder-as-label. Color consistency lock across sections.

Serif discipline (highly discouraged as default):
- Only when brand brief literally names a serif, OR genuinely editorial/luxury/manuscript with specific reasoning.
- Never inject random serif word into sans headline (or vice versa). Use italic/bold of same font for emphasis.

Em-dash ban: No em-dashes anywhere in generated code or output. Use commas, periods, or parentheses.

Hero discipline (max 4 text elements):
1. Eyebrow OR brand strip (pick zero or one)
2. Headline (max 2 lines)
3. Subtext (max 20 words, max 4 lines)
4. CTAs (1 primary + max 1 secondary)
Banned in hero: tagline below CTAs, trust micro-strip, pricing teaser, feature list, social-proof avatar row.

Layout diversity:
- Anti-center bias at variance >= 5
- One eyebrow per 3 sections max
- No split-header pattern as default
- Zigzag alternation cap: max 2 consecutive image+text splits before breaking pattern
- Bento must have rhythm — alternate full-width, asymmetric, vertical

Visual assets:
- No text-only pages — use picsum.photos/seed/... for photography
- Real product screenshots or generated images, never fake-screenshot divs
- Real SVG logos from simple-icons for social proof, never plain-text wordmarks

State/UI polish:
- Loading: skeletal loaders, no generic spinners
- Empty states: beautifully composed with how-to-populate hints
- Tactile feedback: translate-y-[1px] or scale-[0.98] on :active
- Button contrast must pass WCAG AA (4.5:1 body, 3:1 large text)
- CTA label max 1 line, max 3 words preferred

Shape consistency:
- ONE corner-radius scale per page. No mixed rounded/squared unless documented.
- Buttons pill? Cards rounded-2xl? Inputs rounded-md? Lock it.

Theme:
- Pages are ONE theme. No light/dark section flipping.
- Section tints within same family OK (zinc-950 + zinc-900). Theme switches across pages is broken.

When generating frontend:
- Brief inference first: output design read before any code
- Pick real design system when brief matches (Fluent UI, Material 3, Carbon, Polaris, Primer, GOV.UK, shadcn/ui, Tailwind)
- One system per project, no mixing
- Verify all dependencies exist in package.json before importing
- No hand-rolled SVG icons — use @phosphor-icons/react, hugeicons-react, @radix-ui/react-icons, @tabler/icons-react
- Lucide acceptable only when explicitly requested
`;
}
