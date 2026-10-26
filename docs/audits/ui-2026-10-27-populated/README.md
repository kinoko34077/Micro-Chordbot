# Imported-library first-viewport UI audit — 2026-10-27

## Scope and methodology

The test input was the user-supplied `library.mcbl.json` (app `muChordbot`, specVersion 1.2.0, library payload containing **14 pitch presets and 79 chord presets**). The file was copied into an isolated browser automation machine's temporary directory; via the application's **existing** `#importFileInput` file chooser the file was selected before taking screenshots. Import status showed **pitch +0 / chord +0** because the corresponding identifiers were already represented in the application's current seeded library; this is an import/deduplication observation, not proof that 93 records were newly added. The displayed library tables were populated. The submitted file contains **neither current active-note arrangement nor an authored progression**; the app's existing example progression remains visible.

**Crucial difference from earlier audit:** The screenshots below capture only the actual **initial viewport at scrollY=0**, NOT artificially extended full-document screenshots. All screenshots come from Selenium/headless Chrome with DevTools viewport emulation (not physical Safari or iPad). PWA prompt was closed if visible. Two selectable views were tested independently, but at 800px and above the existing application deliberately uses a 3-pane combined workspace, so changing selected tabs does not remove those panes.

## Evidence — no-scroll visible viewport

| Environment | Pitch selected | Progression selected |
|---|---|---|
| Phone 320×700 | first automated capture errored; not verified | [320×700](./progression_320x700.webp) |
| Phone 390×844 | [390×844](./pitch_390x844.webp) | [390×844](./progression_390x844.webp) |
| Phone 430×932 | capture was successful locally but not archived in this selection | capture was successful locally but not archived |
| Landscape phone 667×375 | [667×375](./pitch_667x375.webp) | [667×375](./progression_667x375.webp) |
| Tablet 768×1024 | [768×1024](./pitch_768x1024.webp) | [768×1024](./progression_768x1024.webp) |
| Tablet 834×1194 | [834×1194](./pitch_834x1194.webp) | [834×1194](./progression_834x1194.webp) |
| Small desktop 1024×768 | [1024×768](./pitch_1024x768.webp) | [1024×768](./progression_1024x768.webp) |
| Desktop 1440×900 | [1440×900](./pitch_1440x900.webp) | [1440×900](./progression_1440x900.webp) |

## Measured findings (initial viewport, after import)

| ID | Condition | Observed geometry / visible result | Priority |
|---|---|---|---|
| A1 | Phone 390×844, pitch | Shared topbar **248px** and pitch toolbar **323px**; pitch line starts around **y=587px**; only ~257px remains below that threshold. High-frequency pitch controls are stacked in multiple rows before the manipulable pitch line. | P1 |
| A2 | Phone 390×844, progression | Header **248px**; progression grid begins **y=343px**; editor begins **y=428px**; editor detail begins **y=541px**. Initial screen ends within Bass/inversion area; chord-type selection and library remain below fold. | P1 |
| A3 | Phone 320×700, progression | Progression editor alone ~**3225px**; full document ~**5072px**. Selected chord editing and detailed library have extremely high scroll cost; further 320px pitch-specific verification needed due transient stale-element error. | P1 |
| A4 | Phone 430×932, progression | Editor ~**3024px**, chord library ~**3672px**. Full document ~**7148px**. Increased height compared to 390px does not overcome vertically expanded option/library layout. | P1 |
| A5 | Phone 430×932, pitch | Pitch toolbar **323px**, while CSS computed `pitch-options` client height is only **124px** versus scrollHeight **150px**: contents exceed own computed size, evidence of an internal overflow/fit problem. Non-active progression view also appears below the pitch view in this viewport. | **P0 for unintended view** / P1 overflow |
| A6 | Tablet 768×1024 | Single-page scrolling layout spans >**2846px** when progression selected, library ~**800px** in page. Unlike the narrow phone, there is more width available, but the document is still long. | P1 |
| A7 | Tablet 834×1194 | Three-pane layout is activated. Center editor has **1120px** height while right library **752px**, with narrow grids, independently scrolling vertical regions and controls wrapped/cropped. Pixel screenshot is necessary; lack of horizontal document overflow does not imply layout usability. | P1 |
| A8 | Desktop 1024×768 / 1440×900 | Three-pane width shares and internally scrollable editor/libraries limit immediate visibility of controls. In contrast to mobile, task operation is constrained primarily by independent scroll panes and distribution among the columns. | P1 |

## Findings and boundaries

1. Both empty and imported-data screens are required for the UI acceptance tests: library population changes content length, row count, available space and effects of independent scrolling.
2. **First viewport / fold must be tested explicitly:** a control existing anywhere in document/DOM is insufficient. Measure top/bottom against `innerHeight`, tab/menu state and visibility/overlap; do not regard long screenshot success as acceptance.
3. Separate confirmed behavior from causes: no CSS changes performed in this audit. Later CSS diagnosis should use observable overflow and precise ownership before rewriting.
4. The library file did **not** supply a new authored chord progression or active notes. Additional user-like active editing scenarios still need construction as separate fixtures; do not claim this library import verifies both.
5. The import displays +0/+0 due merge/deduplication of matching existing library entries. That is not an import failure by itself, but whether data definitions matched exactly should be checked separately before treating it as an equivalence proof.
6. No physical iOS/Android touch, keyboard, or Apple Safari tested. WebP compression is evidence transport only; raw PNG remains in test machine's temporary folder.

## Next diagnosis (separate user-requested phase)

Next task is to inspect CSS and layout ownership for: (a) overly tall mobile shared header and pitch controls, (b) stacked progression editor leading to an inaccessible chord selection at no-scroll start, (c) unintended non-selected view on mobile, (d) tablet 800px desktop activation with narrowed overlapping controls and independent scrollbars, (e) scroll height and content architecture under loaded libraries, while maintaining all existing features and user-selected 1–12 progression columns.
