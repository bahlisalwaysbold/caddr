# Structural workspace UI map

## Existing workflows and ownership boundaries

| User workflow | Existing owner / UI | Required layout change | Preservation rule |
|---|---|---|---|
| Frame model and member editing | `structural.html#model`, `structural.js`, `#structuralDiagram`, member inspector fields | Place the existing model section in the Model tab and give the diagram most of the centre column | Keep the same SVG renderer, member IDs, inspector controls, edit/apply handlers and result invalidation |
| Loads and combinations | `structural.html#loads`, `#beamLoadList`, `structural.js` | Move the existing section into the Loads tab | Reuse the existing beam load list and member load inputs; do not create a duplicate model |
| Analysis and results | `structural.html#analysis`, `#runDemoAnalysis`, `/api/structural/health`, `/api/structural/analyze` | Move the existing analysis/result section into the Analysis tab | Keep the current solver payload, API routes, validation and output tables; the conversation can trigger the existing action |
| Member design / quantities / budgeting | `#design`, `#quantities`, `#budgeting` | Group the existing sections in the Design tab | Keep planned/unimplemented capabilities labelled honestly; do not imply code checks or take-off exist |
| Reinforcement and drawing handoff | `#detailing` and the separate `cad.html` editor | Put detailing status and CAD handoff in Drawings | Keep CAD a separate working editor using `core.js` and `app.js`; do not fake model-to-drawing synchronisation |
| Project Explorer | Current member model and `#storeyCount` model-level control | Build the tree from actual frame members and supported level count | Selecting an element calls the existing SVG member selection; future categories are marked as not modelled |
| Project conversation | New contextual panel | Read selected member, active view, level count and latest analysis from the live page; propose member edits for approval | No automatic model mutations: only call existing Apply / Run Analysis controls after an explicit user action |
| Panel visibility / full-screen | New workspace shell around the existing sections | Independently collapse the explorer and conversation; use browser full-screen for the model workspace | Hiding and restoring panels must not rebuild the model, clear selection, alter the SVG viewBox or clear chat history |

## Implementation sequence

1. Add the workspace shell and the five top-level tabs.
2. Relocate existing section elements into tab slots at runtime rather than cloning or rewriting them.
3. Add independent panel controls and a full-screen mode; keep the SVG viewBox as the model camera state.
4. Add wheel zoom, background drag pan and fit-view using SVG viewBox coordinates, leaving member hit targets and selection intact.
5. Build Explorer rows from the live SVG member targets and model-level setting.
6. Store conversation history locally; expose supported questions, actual view switches and approval-gated proposals for the existing member width/depth/line-load fields.
7. Validate JavaScript syntax and the existing structural solver workflow, then inspect the Vercel preview before production rollout.

## Explicit limits

The current structural model is an idealised editable 2D portal frame. The new Explorer must not suggest that slabs, foundations, generated drawings or a full 3D building model are already present. The conversation panel is contextual UI, not a substitute for verified design calculations.