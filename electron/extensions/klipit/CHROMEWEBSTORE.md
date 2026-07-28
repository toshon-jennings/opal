# Chrome Web Store Listing — Klipit

> Last Updated: 2026-06-21

## Store Listing

**Extension Name** [REQUIRED]
Klipit

**Short Description** [REQUIRED]
One-click link memory with context. Save links, jot notes, and connect related ideas — no friction, no backend.

**Detailed Description** [REQUIRED]
Klipit is a minimal, local-first tool for thought that serves as your digital commonplace book.
Quickly save web pages or text selections, jot down why you saved them, and connect related ideas together. All data stays entirely on your device with no accounts, syncing, or backend servers involved. Klippit embraces a friction-free philosophy for intentional collecting.

**Category** [REQUIRED]
Productivity

**Single Purpose** [REQUIRED]
Highlights and saves web pages and text selections to a local graph of connected notes.

**Primary Language** [REQUIRED]
English

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Store Icon [REQUIRED] | 128×128 PNG | ✅ Ready | `icons/icon-128.png` |
| Screenshot 1 [REQUIRED] | 1280×800 or 640×400 | ⬜ Not created | |
| Screenshot 2 [RECOMMENDED] | 1280×800 or 640×400 | ⬜ Not created | |
| Screenshot 3 [RECOMMENDED] | 1280×800 or 640×400 | ⬜ Not created | |
| Screenshot 4 | 1280×800 or 640×400 | ⬜ Not created | |
| Screenshot 5 | 1280×800 or 640×400 | ⬜ Not created | |
| Small Promo Tile [RECOMMENDED] | 440×280 | ⬜ Not created | |
| Marquee Promo Tile | 1400×560 | ⬜ Not created | |

### Screenshot Notes
- Main list view showing saved items and tags.
- Note creation / quick capture view showing the context input fields.
- Graph view showing connections between saved ideas.

## Permissions Justification

| Permission | Type | Justification |
|------------|------|---------------|
| `storage` | permissions | Required to save links, notes, and connections locally on the user's device. |
| `tabs` | permissions | Required to retrieve the URL, title, and favicon of the active tab when the user clicks "Save the current page". |
| `activeTab` | permissions | Temporarily grants access to the current tab when the user triggers the capture command via keyboard shortcut or extension icon click. |
| `sidePanel` | permissions | Required to display the Klippit interface alongside the user's current browsing session. |
| `contextMenus` | permissions | Required to add a "Save selection to Klipit" option to the right-click menu, allowing users to save selected text as standalone notes. |

## Privacy & Data Use

### Data Collection

**Does the extension collect user data?** No

### Data Use Certification
- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

## Privacy Policy

**Privacy Policy URL** [RECOMMENDED]
[Insert GitHub URL to PRIVACY.md]

## Distribution

**Visibility**: Public
**Regions**: All regions
**Pricing**: Free

## Developer Info

**Publisher Name** [REQUIRED]
Toshon Jennings

**Contact Email** [REQUIRED]
[To be filled by publisher]

**Support URL / Email** [RECOMMENDED]
[Insert GitHub Issues URL]

**Homepage URL** [RECOMMENDED]
[Insert Project URL]

## Version History

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 0.4.3 | 2026-06-21 | Added visual polish, design refinements, and updated to Klipit. Replaced promise chains with async/await. | Draft |

## Review Notes

### Known Issues / Limitations
None at this time.

### Rejection History
N/A
