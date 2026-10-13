# Caddr Technical Feasibility Audit

**Assessment date:** 2026-10-13  
**Repository:** https://github.com/bahlisalwaysbold/caddr  
**Baseline branch:** master  
**Purpose:** Establish a low-risk next step without discarding existing work or duplicating mature engineering software.

> This is a source-level audit and integration recommendation, not a claim that candidate libraries have been integrated or benchmarked. No engineering-solver result is certified by this document.

## 1. Executive decision

**Do not rewrite the existing 2D CAD foundation. Do not integrate several large engineering packages at once.**

The current repository is a dependency-free, static browser application. Its 2D drawing canvas is SVG, with a custom document/core module. It already has significant drafting and editing behaviour plus basic DXF import/export. The new dark in-project interface is not yet represented by a 3D workspace in the current repository.

The low-risk first implementation should be a separate, additive project-workspace slice:

1. Establish a versioned project data model separate from viewport/rendering state.
2. Add an in-project workspace shell that can later be entered from the dashboard.
3. Use **Three.js as a candidate for the initial 3D viewport only**—not as a CAD geometry kernel or structural-analysis engine.
4. Create a minimal parametric building-frame representation (grids, storeys, nodes, columns and beams), with stable IDs, units, selection and basic editing.
5. Save and reopen this first version through a small repository interface. A local browser implementation is acceptable for the prototype, but must be explicitly treated as local-only; cloud persistence is a later adapter, not an assumed capability.
6. Preserve the current 2D editor and .bahl documents. Do not claim the model is structurally analysed or design-code compliant.
7. Before a solver is connected, define a tiny benchmark frame and compare candidate solver outputs to independently calculated reference values.

This gets a real project and interactive model on screen without pretending we have already built BIM, a geometric kernel, or a structural design suite.

## 2. Current repository findings

Root files observed include index.html, styles.css, app.js, core.js, ARCHITECTURE.md, ROADMAP.md, README.md, and tests/core.test.js. There is no root package.json in the observed listing and no backend service or project database was visible in the repository root.

### What already exists

- A browser-based 2D SVG drafting workspace.
- A core module for document normalization, versioned serialization, command registration, history/transactions, coordinate parsing, snaps and DXF parsing.
- Drawing/editing tools and layer/selection workflows documented in the README.
- .bahl document save as a downloadable JSON document and local-file open/import workflows.
- Basic DXF export from the application and ASCII DXF import for a defined subset.
- Built-in Node test files using node:test.

### Important gaps

- No 3D model viewport or typed 3D building model is visible in the current source.
- No project list/store was found; downloading a drawing is not the same as persisting a project that reopens by project ID.
- No backend or multi-device persistence was found.
- The current DXF parser and exporter have different entity scopes. The README describes DXF import for LINE, CIRCLE, ARC, LWPOLYLINE, POINT, TEXT and MTEXT, while the current application exporter emits LINE, CIRCLE, LWPOLYLINE and TEXT. This is a useful target for explicit round-trip tests.
- The current application is described as “Bahl CAD” in places. Product naming can be cleaned up later; do not make renaming a prerequisite for the first working slice.
- The application architecture already states that structural semantics should be separate from SVG presentation. Preserve that boundary and evolve it instead of coupling engineering meaning to rendered shapes.

Sources in the repository:
- [README.md](https://github.com/bahlisalwaysbold/caddr/blob/master/README.md)
- [ARCHITECTURE.md](https://github.com/bahlisalwaysbold/caddr/blob/master/ARCHITECTURE.md)
- [ROADMAP.md](https://github.com/bahlisalwaysbold/caddr/blob/master/ROADMAP.md)
- [core.js](https://github.com/bahlisalwaysbold/caddr/blob/master/core.js)
- [app.js](https://github.com/bahlisalwaysbold/caddr/blob/master/app.js)
- [tests/core.test.js](https://github.com/bahlisalwaysbold/caddr/blob/master/tests/core.test.js)

## 3. Build-versus-integrate decision matrix

| Candidate | What it can contribute | Main integration cost / limitation | Decision for Caddr |
|---|---|---|---|
| Existing SVG CAD + core.js | Working 2D drafting baseline, document schema, transactions/history, existing file workflows | Existing app is still one UI module; basic DXF scope is limited | **Keep and extend.** Do not replace it just to start the 3D workspace. |
| [Three.js](https://github.com/mrdoob/three.js) | Browser-side 3D scenes, camera, mesh rendering, materials, lighting and picking/interaction building blocks | Rendering only; no structural solver, no design codes, no complete parametric CAD kernel | **First 3D-viewer candidate.** Prove a small frame with camera navigation and element selection before adding more. MIT license; retain notices. |
| [ezdxf](https://ezdxf.readthedocs.io/en/stable/) | Mature Python library for creating, reading, modifying and writing DXF; broad entity support and DXF version handling | Python library, not a drop-in browser JavaScript dependency; requires a Python service/runtime or separate conversion utility | **Evaluate later for interoperability.** First add representative import/export regression fixtures to our current implementation. MIT license. |
| [PyNiteFEA](https://github.com/JWock82/Pynite) | Python-based elastic 3D frame/plate analysis, load cases/combinations, reactions, member actions, displacement results and P-Delta capabilities (verify exact version/features before adoption) | Python runtime; mapping between the Caddr model and solver input/output; no complete reinforced-concrete building design, detailing, costing or code-compliance workflow by itself | **Candidate for the first solver proof of concept**, after defining the model schema and benchmark frame. MIT license according to its public repository. |
| [OpenSees / OpenSeesPy](https://opensees.github.io/OpenSeesDocumentation/) | More advanced structural simulation capabilities and broad element/material options | Higher learning and modelling/integration cost; still requires a trustworthy Caddr workflow, validation and interface | **Defer** unless a defined analysis requirement exceeds the simpler candidate. |
| [IfcOpenShell](https://docs.ifcopenshell.org/) | IFC model reading/writing, geometry and properties, authoring APIs, validation, quantity and cost-schedule data | Broader BIM/IFC architecture and C++/Python integration; LGPL-3.0-or-later obligations need review | **Defer** until an IFC/BIM exchange requirement is specified. Do not add it just to render an early frame. |
| [Open CASCADE Technology (OCCT)](https://github.com/Open-Cascade-SAS/OCCT) | 3D geometry kernel, solid modelling/topology and CAD data exchange including formats such as STEP/IGES | Large C++ library and a significant integration/deployment task for the current static JavaScript app; LGPL-2.1 with additional exception and notices | **Do not start here.** Reconsider when Caddr has concrete solid-modelling or precision-kernel requirements that the simpler model cannot meet. |
| [FreeCAD](https://github.com/FreeCAD/FreeCAD) | Mature desktop parametric CAD application and an ecosystem built around OCCT | Integrating the complete desktop application would impose a different application/runtime/UI architecture; it is not a light browser widget | **Study and selectively reuse ideas/components only after compatibility and licence review.** Do not embed the whole desktop app as the shortcut. |

### Why these are not interchangeable

- A 3D renderer displays geometry; it does not establish that the geometry is a valid structural model.
- A CAD kernel provides geometry/topology operations; it does not automatically provide engineering semantics or structural calculations.
- A structural solver calculates model response within its assumptions; it does not automatically design reinforcement, generate compliant details, or validate every building-code requirement.
- A DXF library is for file exchange; it does not replace Caddr's editor, project model or engineering capability system.
- An IFC toolkit is useful for BIM exchange and model information; adopting IFC should follow a defined need for interoperability rather than precede the first working building model.

## 4. Proposed first project model

Keep the **engineering model independent from the rendering layer**. The first version should be small and versioned:

- **Project:** stable ID, name/type, timestamps, units, model/document references and schema version.
- **BuildingModel:** stable ID and references to storeys, grids, nodes and elements.
- **Storey:** stable ID, name, elevation and height.
- **Grid:** stable ID, axis labels and coordinates.
- **Node:** stable ID and coordinates with explicit length units.
- **Member:** stable ID, member type (initially column or beam), end-node references, section/material references and visibility/metadata.
- **Section and Material:** IDs plus explicit dimensions/properties and units.
- **ViewState:** camera, visible layers/categories and current selection; stored separately from structural meaning.

Do not treat a rendered Three.js mesh or an SVG path as the source of engineering truth. The viewport should be generated from model data. If the renderer changes later, the model and engineering history should survive.

For the prototype, a versioned browser-local repository can support create/list/load/save. Put that behind an interface so it can later be implemented by a server/database adapter. Explicitly label local-only behaviour and provide file export/backup. Do not imply cloud sync or multi-user collaboration.

## 5. First proof of concept and acceptance gates

### POC A — Project workspace and viewport

**Scope**
- Open a project into the dark in-project workspace.
- Render a regular grid and a simple configurable frame (for example, two bays by two bays with a ground and first floor).
- Orbit, pan and zoom.
- Select a column or beam from either the viewport or explorer and highlight the same stable element ID in both.
- Edit one or two safe geometric properties (e.g., bay spacing/storey height) and regenerate the viewport.
- Save, leave, reopen and verify that the project model and IDs survive.

**Pass criteria**
- No engineering result is displayed as if a solver ran.
- Geometry is generated from typed model data, not hand-positioned UI-only mesh objects.
- IDs, units and dimensions survive save/reopen.
- Automated tests cover schema normalization, invalid references, save/load and deterministic model generation.
- Current 2D drawing workflows and .bahl legacy documents still work.

### POC B — DXF reliability

Create fixture drawings covering every currently supported imported/exported entity, layers and units; export and re-import them; compare supported geometry/properties; then open representative outputs in AutoCAD as a manual interoperability check. Track unsupported entities and report them rather than silently claiming compatibility.

### POC C — Structural solver benchmark

Only after model inputs and units are explicit:
- Choose a simple frame with known boundary conditions and documented loads.
- Compute independent reference reactions and displacement/member-force values.
- Map the same geometry and load cases to PyNiteFEA (or another documented candidate).
- Compare results within a declared tolerance and inspect stability/warnings.
- Record the solver version, units, assumptions, reference calculation and pass/fail evidence.

Do not expose general building-analysis actions until the solver's supported domain and error cases are defined.

## 6. Capability interface for the AI layer

The AI must call deterministic, typed operations; it must not generate calculation answers from prose alone. Every registered capability should publish:

- ID/version and purpose.
- Input/output schema, unit conventions and required prerequisites.
- Preconditions and unsupported cases.
- Execution result, warnings and structured failure states.
- Engineering standard/version when applicable.
- Validation tests and status.
- Audit metadata: inputs, chosen tool/version, outputs and any human review.

Initial capabilities can be ordinary deterministic application functions; a language model is not required to make project creation, model generation, saving, selection or validation work. Add AI orchestration only after there are useful, testable tools to orchestrate.

## 7. Recommended sequence

1. **Document and test the existing baseline.** Preserve current 2D CAD and DXF behaviour.
2. **Introduce a minimal project/model schema and repository interface.**
3. **Add the dark workspace shell and a Three.js viewport as an isolated module.**
4. **Make one generated frame selectable/editable and persistable.**
5. **Run the DXF regression fixtures.**
6. **Benchmark one structural solver on a tiny, independently checked frame.**
7. **Add code-specific design/detailing capabilities only as verified, scoped slices.**
8. **Connect the AI to the capability registry after the operations are real.**

## 8. Items that still need verification

- Run the existing Node tests in a real checkout/CI environment. This audit did not run them.
- Confirm the chosen Three.js release and integration strategy when creating the viewport.
- Inspect the exact PyNiteFEA version, API, test suite, known limitations and licence before adopting it.
- Decide supported design standards and the first validated structural element/design workflow with qualified engineering review.
- Review all third-party notices and licences before distributing a product build.
- Decide when cloud persistence/authentication is needed; do not block the first local prototype on multi-user backend features, but do not disguise local storage as production persistence.

## 9. External references checked

- Three.js project and MIT license: https://github.com/mrdoob/three.js/ and https://threejs.org/license/
- Three.js browser 3D fundamentals: https://threejs.org/manual/pages/fundamentals.html
- ezdxf quick info, version support and MIT license: https://ezdxf.readthedocs.io/en/stable/
- PyNite features and project: https://github.com/JWock82/Pynite and https://pynite.readthedocs.io/en/latest/
- IfcOpenShell current docs and LGPL-3.0-or-later license: https://docs.ifcopenshell.org/ifcopenshell.html
- OCCT scope and LGPL-2.1-plus-exception license: https://github.com/Open-Cascade-SAS/OCCT
- FreeCAD scope and underlying technology: https://github.com/FreeCAD/FreeCAD

**Bottom line:** the easiest credible route is not to adopt an entire open-source CAD package. Keep the working 2D editor, add a separate and versioned structural project model, use a lightweight browser 3D viewer for the first viewport, and benchmark a solver only once the model data is well-defined.
