(() => {
  "use strict";
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const initialMembers = [
    {id:"C01",type:"Column",storey:"Ground → L01",section:"300 × 300 mm",material:"C30/37",status:"Needs review"},
    {id:"C02",type:"Column",storey:"Ground → L01",section:"300 × 300 mm",material:"C30/37",status:"Needs review"},
    {id:"C03",type:"Column",storey:"L01 → L02",section:"300 × 300 mm",material:"C30/37",status:"Needs review"},
    {id:"C04",type:"Column",storey:"L02 → Roof",section:"300 × 300 mm",material:"C30/37",status:"Needs review"},
    {id:"C05",type:"Column",storey:"Ground → L01",section:"300 × 300 mm",material:"C30/37",status:"Modelled"},
    {id:"C06",type:"Column",storey:"L01 → L02",section:"300 × 300 mm",material:"C30/37",status:"Modelled"},
    {id:"C07",type:"Column",storey:"L02 → Roof",section:"300 × 300 mm",material:"C30/37",status:"Modelled"},
    {id:"C08",type:"Column",storey:"Ground → Roof",section:"400 × 300 mm",material:"C30/37",status:"Needs review"},
    {id:"B01",type:"Beam",storey:"Level 01",section:"250 × 450 mm",material:"C30/37",status:"Modelled"},
    {id:"B02",type:"Beam",storey:"Level 01",section:"250 × 450 mm",material:"C30/37",status:"Modelled"},
    {id:"B03",type:"Beam",storey:"Level 02",section:"250 × 450 mm",material:"C30/37",status:"Modelled"},
    {id:"B04",type:"Beam",storey:"Level 02",section:"250 × 450 mm",material:"C30/37",status:"Modelled"},
    {id:"B05",type:"Beam",storey:"Roof",section:"250 × 400 mm",material:"C30/37",status:"Needs review"},
    {id:"B06",type:"Beam",storey:"Roof",section:"250 × 400 mm",material:"C30/37",status:"Modelled"},
    {id:"S01",type:"Slab",storey:"Level 01",section:"150 mm thick",material:"C30/37",status:"Needs review"},
    {id:"S02",type:"Slab",storey:"Level 02",section:"150 mm thick",material:"C30/37",status:"Modelled"},
    {id:"S03",type:"Slab",storey:"Roof",section:"150 mm thick",material:"C30/37",status:"Modelled"},
    {id:"F01",type:"Foundation",storey:"Foundation",section:"1,800 × 1,800 mm",material:"C25/30",status:"Input missing"}
  ];

  const initialLevels = [
    {mark:"RF",name:"Roof",elevation:"+9.600 m",note:"Level 03"},
    {mark:"03",name:"Level 02",elevation:"+6.400 m",note:"Typical floor"},
    {mark:"02",name:"Level 01",elevation:"+3.200 m",note:"Typical floor"},
    {mark:"01",name:"Ground",elevation:"±0.000 m",note:"Base level"}
  ];

  const state = {
    members: initialMembers.map(item => ({...item})),
    levels: initialLevels.map(item => ({...item})),
    selectedMember: "C01",
    memberFilter: "all",
    loadCases: 3,
    combinations: 3,
    code: "Eurocode",
    notes: {},
    analysisPreviewed: false,
    designPreviewed: false,
    aiMessages: null,
    savedPreferences: false
  };

  const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[char]));

  function toast(message) {
    const box = $("#structuralToast");
    if (!box) return;
    box.textContent = message;
    box.classList.add("visible");
    window.clearTimeout(toast.timer);
    toast.timer = window.setTimeout(() => box.classList.remove("visible"), 3600);
    const status = $("#structuralStatusMessage");
    if (status) status.textContent = message;
  }

  function activeView() {
    const active = $(".module-tab.active");
    return active ? active.dataset.viewButton : "overview";
  }

  function switchView(name) {
    if (name === "geotech") {
      name = "design";
      window.setTimeout(() => $("#geotechPanel")?.scrollIntoView({behavior:"smooth",block:"center"}), 80);
    }
    const target = $('[data-view="' + name + '"]');
    if (!target) return;
    $$(".module-tab").forEach(tab => tab.classList.toggle("active", tab.dataset.viewButton === name));
    $$(".module-view").forEach(view => {
      const selected = view.dataset.view === name;
      view.hidden = !selected;
      view.classList.toggle("active", selected);
    });
    const names = {
      overview:"Structural overview",model:"Structural model",loads:"Loads & combinations",
      analysis:"Structural analysis",design:"Member design checks",detailing:"Detailing studio",
      quantities:"Quantities & costs",reports:"Reports & review"
    };
    $("#aiContextLabel").textContent = names[name] || "Structural project";
    $("#structuralStatusMessage").textContent = names[name] + " · Sample data";
    const main = $(".structural-main");
    if (main) main.scrollTop = 0;
  }

  function selectedMember() {
    return state.members.find(item => item.id === state.selectedMember) || state.members[0];
  }

  function renderMemberRows() {
    const body = $("#structuralElementRows");
    if (!body) return;
    const shown = state.members.filter(item => state.memberFilter === "all" || item.type === state.memberFilter);
    body.innerHTML = shown.map(item => {
      const isSelected = item.id === state.selectedMember;
      const label = item.status === "Modelled" ? "reviewed" : "";
      return '<tr tabindex="0" role="button" aria-label="Select ' + escapeHtml(item.type + " " + item.id) + '" data-member-row="' + escapeHtml(item.id) + '" class="' + (isSelected ? "selected-row" : "") + '">' +
        '<td><strong>' + escapeHtml(item.id) + '</strong></td><td>' + escapeHtml(item.type) + '</td><td>' + escapeHtml(item.storey) + '</td>' +
        '<td>' + escapeHtml(item.section) + '</td><td>' + escapeHtml(item.material) + '</td><td><span class="element-state ' + label + '">' + escapeHtml(item.status) + '</span></td></tr>';
    }).join("");
    $("#elementCount").textContent = String(state.members.length);
    $("#modelMemberTotal").textContent = state.members.length + " objects";
    renderSelectedMember();
  }

  function renderSelectedMember() {
    const item = selectedMember();
    if (!item) return;
    $("#selectedElementTitle").textContent = item.type + " " + item.id;
    $("#selectedElementDescription").textContent = item.storey + " · " + item.type.toLowerCase();
    $("#selectedSection").textContent = item.section;
    $("#selectedMaterial").textContent = item.material + (item.type === "Column" || item.type === "Beam" || item.type === "Slab" ? " concrete" : "");
    $("#selectedStatus").textContent = item.status;
    $("#memberNote").value = state.notes[item.id] || "";
    $$("[data-member-row]").forEach(row => {
      row.classList.toggle("selected-row", row.dataset.memberRow === item.id);
      row.setAttribute("aria-pressed", String(row.dataset.memberRow === item.id));
    });
  }

  function selectMember(id) {
    const member = state.members.find(item => item.id === id);
    if (!member) return;
    state.selectedMember = id;
    renderMemberRows();
    toast("Selected " + member.type.toLowerCase() + " " + member.id + " · properties shown in the inspector.");
  }

  function renderLevels() {
    $("#modelCanvasMemberCount").textContent = String(state.members.length);
    $("#modelCanvasStoreyCount").textContent = String(state.levels.length);
    const host = $("#storeyStack");
    if (!host) return;
    host.innerHTML = state.levels.map(level =>
      '<div class="storey-row"><span>' + escapeHtml(level.mark) + '</span><strong>' + escapeHtml(level.name) + '</strong><span>' + escapeHtml(level.elevation) + '</span><small>' + escapeHtml(level.note) + '</small></div>'
    ).join("");
  }

  function addMember() {
    const beams = state.members.filter(item => item.type === "Beam").length;
    const id = "B" + String(beams + 1).padStart(2, "0");
    if (state.members.some(item => item.id === id)) {
      toast("The next beam mark already exists. Select an element to continue.");
      return;
    }
    state.members.push({id:id,type:"Beam",storey:"Level 01",section:"250 × 450 mm",material:"C30/37",status:"Needs review"});
    state.selectedMember = id;
    state.memberFilter = "all";
    $("#memberFilter").value = "all";
    renderMemberRows();
    toast("Added sample member " + id + ". This updates the UI prototype only; no analysis model was changed.");
  }

  function addStorey() {
    const existing = state.levels.length;
    const levelNum = existing;
    state.levels.unshift({mark:String(levelNum + 1).padStart(2, "0"),name:"New Level " + (levelNum),elevation:"Elevation required",note:"Needs engineer input"});
    renderLevels();
    toast("Added a placeholder storey. Enter and validate its elevation before using a real analysis model.");
  }

  function addLoadCase() {
    state.loadCases += 1;
    const id = "LC" + String(state.loadCases).padStart(2, "0");
    const row = document.createElement("tr");
    row.innerHTML = '<td><strong>' + id + '</strong></td><td>New project action</td><td><span class="type-pill live">User input</span></td><td><select class="table-input" aria-label="Direction for ' + id + '"><option>Global −Z</option><option>Global +X</option><option>Global −X</option><option>Global +Y</option><option>Global −Y</option></select></td><td><input class="table-input load-value" aria-label="Representative value for ' + id + '" type="number" min="0" step="0.1" placeholder="Enter value"></td><td>Engineer to define</td>';
    $("#loadCaseRows").appendChild(row);
    $("#loadCaseCount").textContent = state.loadCases + " load cases";
    toast("Added " + id + ". Define the action, unit and source before a real analysis.");
  }

  function addCombination() {
    state.combinations += 1;
    const id = "COMB-" + String(state.combinations).padStart(2, "0");
    const row = document.createElement("div");
    row.className = "combination-row";
    row.innerHTML = '<div><strong>' + id + '</strong><span>Engineer-defined · incomplete</span></div><code>Factors required</code><span class="status-dot amber"></span>';
    $("#combinationList").appendChild(row);
    toast("Added an incomplete combination placeholder. Factors must come from the selected design standard.");
  }

  function formatNaira(value) {
    const num = Number.isFinite(value) ? Math.round(value) : 0;
    return "₦" + num.toLocaleString("en-NG", {maximumFractionDigits:0});
  }

  function updateQuantities() {
    const rows = $$("#quantityRows tr");
    let total = 0;
    rows.forEach(row => {
      const qty = Number(row.querySelector("[data-qty]")?.dataset.qty || 0);
      const rate = Number(row.querySelector(".rate-input")?.value || 0);
      const amount = qty * Math.max(0, rate);
      total += amount;
      const output = row.querySelector(".line-amount");
      if (output) output.textContent = formatNaira(amount);
    });
    $("#quantityGrandTotal").textContent = formatNaira(total);
    $("#quantityFooterTotal").textContent = formatNaira(total);
    return total;
  }

  function quantitiesCsv() {
    const lines = [["Material","Quantity","Unit","Source","Rate NGN","Amount NGN"]];
    $$("#quantityRows tr").forEach(row => {
      const material = row.dataset.material || "";
      const cells = row.querySelectorAll("td");
      const qty = Number(cells[1]?.dataset.qty || 0);
      const unit = cells[2]?.textContent.trim() || "";
      const source = cells[3]?.textContent.trim() || "";
      const rate = Number(row.querySelector(".rate-input")?.value || 0);
      lines.push([material,qty,unit,source,rate,qty*rate]);
    });
    lines.push(["DISCLAIMER","Sample quantities and prices only","","","",""]);
    return lines.map(row => row.map(value => '"' + String(value).replace(/"/g,'""') + '"').join(",")).join("\r\n");
  }

  function downloadFile(filename, content, mimeType) {
    const blob = new Blob([content], {type:mimeType || "text/plain;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 800);
  }

  function selectedReportSections() {
    return $$("[data-report-section]").filter(input => input.checked).map(input => input.dataset.reportSection);
  }

  function buildReport() {
    const sections = selectedReportSections();
    const lines = [
      "CADDR STRUCTURAL SUMMARY",
      "Project: Riverside Medical Centre (CDR-024)",
      "Created: " + new Date().toLocaleString(),
      "",
      "IMPORTANT: UI PROTOTYPE ONLY — NOT FOR CONSTRUCTION OR PROFESSIONAL SUBMISSION.",
      "No validated structural solver or design engine is connected. Any example values are illustrative.",
      ""
    ];
    if (sections.includes("project")) lines.push("PROJECT", "Type: 3-storey reinforced-concrete frame", "Design basis selected: " + state.code, "Units: mm / kN", "");
    if (sections.includes("model")) lines.push("MODEL SUMMARY", "Illustrative member records: " + state.members.length, "Storey placeholders: " + state.levels.length, "Member model is schematic and not suitable for structural analysis.", "");
    if (sections.includes("loads")) lines.push("LOADS & COMBINATIONS", "Sample load case count: " + state.loadCases, "Sample combination count: " + state.combinations, "All actions and combination factors require engineer confirmation.", "");
    if (sections.includes("analysis")) lines.push("ANALYSIS", "Solver status: NOT CONNECTED", "No structural analysis has been performed.", "");
    if (sections.includes("design")) lines.push("DESIGN & DETAILING", "Design engine status: NOT CONNECTED", "Reinforcement details are illustrative only.", "Current preferences: main bars " + $("#mainBar").value + ", links " + $("#linkBar").value + ", cover " + $("#nominalCover").value + " mm.", "");
    if (sections.includes("quantities")) lines.push("QUANTITIES & COSTS", "Illustrative subtotal: " + formatNaira(updateQuantities()), "Quantities and rates are placeholders, not measured quantities or current quotations.", "");
    if (sections.includes("review")) lines.push("PROFESSIONAL REVIEW", "Review status: OUTSTANDING", "No professional approval is recorded.", "");
    lines.push("END OF PROTOTYPE SUMMARY");
    return lines.join("\n");
  }

  function previewAnalysis() {
    state.analysisPreviewed = true;
    $("#analysisStatusMetric").textContent = "Preview only";
    $("#analysisRunTime").textContent = "Sample view loaded · no solver";
    $("#validationMetric").innerHTML = "3 <small>items</small>";
    $("#resultOverlay").innerHTML = '<span class="overlay-icon">⌁</span><strong>Illustrative result view</strong><p>The selected visualisation is a placeholder. Connect and validate a solver before displaying numerical results.</p>';
    toast("Sample analysis view loaded. No calculations were run and no design result has been produced.");
  }

  function previewDesignChecks() {
    state.designPreviewed = true;
    $$(".design-result-card .status-tag").forEach(tag => {
      if (!tag.classList.contains("warning")) {
        tag.className = "status-tag info";
        tag.textContent = "Preview only";
      }
    });
    toast("Design workflow preview updated. No code check was executed; a validated design engine is still required.");
  }

  const categoryCards = {
    concrete: [
      ["B","Beam design","Flexure, shear, torsion where applicable, serviceability and reinforcement requirements.","06","Solver required"],
      ["C","Column design","Axial force and biaxial bending, slenderness, confinement and longitudinal reinforcement.","08","Solver required"],
      ["S","Slabs & walls","Flexure, shear, serviceability and relevant wall stability requirements.","04","Solver required"],
      ["D","Deflection & crack control","Long-term behaviour and serviceability checks as required by the selected standard.","—","Inputs required"]
    ],
    steel: [
      ["B","Steel member checks","Section resistance, lateral stability, buckling and serviceability.","—","Solver required"],
      ["C","Member stability","Effective lengths, restraints and relevant buckling cases.","—","Inputs required"],
      ["J","Connections","Connection forces and design checks with a supported connection module.","—","Module required"],
      ["P","Base plates","Base plate, anchorage and supporting concrete checks.","—","Module required"]
    ],
    foundation: [
      ["F","Pad footings","Bearing pressure, flexure, one-way shear, punching and reinforcement.","01","Soil inputs required"],
      ["R","Raft / mat","Soil support model, contact pressure, settlement inputs and reinforcement.","—","Solver required"],
      ["P","Pile caps","Pile reactions, geometry and relevant member checks.","—","Module required"],
      ["G","Ground parameters","Bearing resistance, groundwater, soil profile and settlement parameters.","—","Report required"]
    ]
  };

  function renderDesignCategory(category) {
    const cards = categoryCards[category] || categoryCards.concrete;
    $("#designResultsGrid").innerHTML = cards.map(item =>
      '<article class="surface-card design-result-card"><div class="result-card-top"><span class="member-type-icon">' + escapeHtml(item[0]) + '</span><span class="status-tag ' + (item[4].includes("required") ? "warning" : "muted") + '">' + escapeHtml(item[4]) + '</span></div><h3>' + escapeHtml(item[1]) + '</h3><p>' + escapeHtml(item[2]) + '</p><div class="design-card-footer"><span>Demo model count</span><strong>' + escapeHtml(item[3]) + '</strong></div><button class="text-link" type="button" data-jump-view="' + (category === "foundation" ? "geotech" : "detailing") + '">' + (category === "foundation" ? "Review site inputs →" : "Open detailing →") + '</button></article>'
    ).join("");
    state.designPreviewed = false;
  }

  function aiResponse(prompt) {
    const text = prompt.toLowerCase();
    if (text.includes("bearing") || text.includes("soil") || text.includes("geotech") || text.includes("foundation")) {
      return "For foundation work, Caddr should capture the source report, allowable or characteristic ground parameters as defined by the engineer, soil profile, groundwater and settlement information where relevant. This prototype has no verified geotechnical report attached. Do not infer bearing capacity from location; add a report-backed value in Design checks and have it reviewed.";
    }
    if (text.includes("rebar") || text.includes("reinforcement") || text.includes("bar") || text.includes("detail")) {
      return "The intended workflow is to collect the engineer's preferences first: bar diameter and grade, concrete grade, cover, detailing convention and project constraints. Caddr should then use a validated design result to propose reinforcement, verify spacing, anchorage, laps and code requirements, and present an editable detail for confirmation. The drawing here is only a schematic preview.";
    }
    if (text.includes("analysis") || text.includes("load") || text.includes("combination")) {
      return "Before analysis, confirm the model geometry, supports, storey levels, material properties, mass and loading assumptions, relevant wind or seismic actions, load combinations and the applicable design standard. The current load cases are placeholders. This demo does not contain a structural solver, so it cannot calculate forces or displacements.";
    }
    if (text.includes("beam") || text.includes("column") || text.includes("model") || text.includes("drawing")) {
      const item = selectedMember();
      return "The selected element is " + (item ? item.type + " " + item.id + " (" + item.section + ")" : "not set") + ". The intended Caddr workflow is to show where its geometry came from, what the engineer confirmed, which inputs and checks apply, and how changes flow to detailing and quantities. This prototype stores illustrative properties only; it does not create a validated analytical element.";
    }
    if (text.includes("cost") || text.includes("quantity") || text.includes("material")) {
      return "The quantity workspace shows the intended traceable take-off: material, quantity, unit, source, rate and amount. Current values are demo allowances. In a real build, each quantity needs to be tied to an approved model or drawing revision, with its formula, exclusions and pricing source visible.";
    }
    return "I can help frame the next step in the intended Caddr workflow: confirm what the drawing contains, identify the missing project inputs, prepare a supported model, run validated calculations, review the results, then produce detailing and quantities. This assistant is a UI prototype, not a live AI model. Which project item should we inspect first?";
  }

  function appendAiMessage(text, role) {
    const host = $("#aiMessages");
    const item = document.createElement("div");
    item.className = "ai-message " + (role === "user" ? "user-message" : "assistant-message");
    if (role === "assistant") {
      const avatar = document.createElement("span");
      avatar.className = "message-avatar";
      avatar.textContent = "✳";
      item.appendChild(avatar);
    }
    const body = document.createElement("div");
    const paragraph = document.createElement("p");
    paragraph.textContent = text;
    body.appendChild(paragraph);
    if (role !== "user") {
      const note = document.createElement("small");
      note.textContent = "Example response · not a calculation";
      body.appendChild(note);
    }
    item.appendChild(body);
    host.appendChild(item);
    host.scrollTop = host.scrollHeight;
  }

  function sendAiPrompt(value) {
    const prompt = String(value || "").trim();
    if (!prompt) return;
    appendAiMessage(prompt, "user");
    appendAiMessage(aiResponse(prompt), "assistant");
    $("#aiPromptInput").value = "";
  }

  function updateDetailPreview() {
    $("#detailMainBarLabel").textContent = $("#mainBar").value;
    $("#detailLinkBarLabel").textContent = $("#linkBar").value;
    $("#detailCoverLabel").textContent = $("#nominalCover").value || "—";
    const schedule = $("#barScheduleRows");
    if (schedule) {
      schedule.innerHTML =
        '<tr><td>B01-01</td><td>Beam B01</td><td>' + escapeHtml($("#mainBar").value) + '</td><td>Straight</td><td>Not designed</td><td>Not calculated</td><td><span class="status-tag muted">Placeholder</span></td></tr>' +
        '<tr><td>B01-02</td><td>Beam B01</td><td>' + escapeHtml($("#linkBar").value) + '</td><td>Link</td><td>Not designed</td><td>Not calculated</td><td><span class="status-tag muted">Placeholder</span></td></tr>';
    }
  }

  function savePreferences() {
    state.savedPreferences = true;
    updateDetailPreview();
    toast("Preferences saved in this demo session. They do not verify or calculate reinforcement.");
  }

  function saveGeotechnicalInputs() {
    const value = Number($("#bearingPressure").value);
    const source = $("#bearingSource").value;
    if ($("#bearingPressure").value.trim() && (!Number.isFinite(value) || value <= 0)) {
      toast("Enter a positive bearing pressure from an appropriate source, or leave the field blank.");
      return;
    }
    if ($("#bearingPressure").value.trim() && !source) {
      toast("Select the evidence source for the entered site parameter.");
      return;
    }
    const badge = $("#geotechPanel .status-tag");
    if ($("#bearingPressure").value.trim() && source) {
      badge.className = "status-tag info";
      badge.textContent = "Input entered · unverified";
      toast("Site input saved in the prototype. It is not verified and has not been used in a foundation calculation.");
    } else {
      toast("No bearing value saved. Attach a suitable geotechnical report before foundation design.");
    }
  }

  function updateReportCount() {
    const count = selectedReportSections().length;
    $("#reportSelectionCount").textContent = count + " selected";
  }

  function resetPrototype() {
    if (!window.confirm("Reset the Structural Studio demo to its original sample state?")) return;
    window.location.reload();
  }

  // Shared workflow navigation.
  $$(".module-tab").forEach(tab => tab.addEventListener("click", () => switchView(tab.dataset.viewButton)));
  document.addEventListener("click", event => {
    const jump = event.target.closest("[data-jump-view]");
    if (jump) switchView(jump.dataset.jumpView);
    const memberRow = event.target.closest("[data-member-row]");
    if (memberRow) selectMember(memberRow.dataset.memberRow);
    const memberShape = event.target.closest("[data-member]");
    if (memberShape && memberShape.dataset.member) selectMember(memberShape.dataset.member);
  });

  $("#memberFilter").addEventListener("change", event => {
    state.memberFilter = event.target.value;
    const exists = state.members.some(item => item.id === state.selectedMember && (state.memberFilter === "all" || item.type === state.memberFilter));
    if (!exists) {
      const next = state.members.find(item => state.memberFilter === "all" || item.type === state.memberFilter);
      if (next) state.selectedMember = next.id;
    }
    renderMemberRows();
  });
  $("#addStructuralMember").addEventListener("click", addMember);
  $("#addStoreyButton").addEventListener("click", addStorey);
  $("#addLoadCase").addEventListener("click", addLoadCase);
  $("#addCombination").addEventListener("click", addCombination);
  $("#saveMemberNote").addEventListener("click", () => {
    state.notes[state.selectedMember] = $("#memberNote").value.trim();
    toast("Review note saved for " + state.selectedMember + " in this browser session.");
  });
  $("#previewAnalysis").addEventListener("click", previewAnalysis);
  $("#previewDesignChecks").addEventListener("click", previewDesignChecks);
  $("#resultDisplaySelect").addEventListener("change", event => {
    $("#resultOverlay").innerHTML = '<span class="overlay-icon">⌁</span><strong>' + escapeHtml(event.target.value) + '</strong><p>Selected as a visualisation placeholder. Numerical results will appear only when a validated solver is connected.</p>';
    toast("Visualisation changed. There are no calculated result values in this prototype.");
  });
  $$(".design-category").forEach(button => button.addEventListener("click", () => {
    $$(".design-category").forEach(item => item.classList.toggle("active", item === button));
    renderDesignCategory(button.dataset.designCategory);
  }));
  $("#designCodeSelect").addEventListener("change", event => {
    state.code = event.target.options[event.target.selectedIndex].text;
    $("#activeCodeSummary").textContent = event.target.value === "Eurocode" ? "Eurocode · EC2 / EC3" : event.target.value === "BS8110" ? "British Standards · BS 8110" : event.target.value === "ACI" ? "ACI 318 / ASCE 7" : "Engineer-defined basis";
    $("#designCodeLabel").textContent = state.code;
    toast("Design basis label updated. This does not load or apply any code clauses.");
  });
  $("#saveGeotech").addEventListener("click", saveGeotechnicalInputs);
  ["mainBar","linkBar","nominalCover"].forEach(id => $("#" + id).addEventListener("change", updateDetailPreview));
  $("#saveDetailPrefs").addEventListener("click", savePreferences);
  $("#previewDetail").addEventListener("click", () => {
    updateDetailPreview();
    toast("Schematic detail preview refreshed. Reinforcement spacing, anchorage, laps and bar lengths are not calculated.");
    $("#detailDrawing").scrollIntoView({behavior:"smooth",block:"center"});
  });
  $("#downloadQuantities").addEventListener("click", () => {
    updateQuantities();
    downloadFile("caddr-illustrative-quantities.csv", quantitiesCsv(), "text/csv;charset=utf-8");
    toast("Downloaded the illustrative quantity schedule. Replace all sample quantities and rates before use.");
  });
  $("#resetRates").addEventListener("click", () => {
    const defaults = [145000,1350000,1100,8500];
    $$("#quantityRows .rate-input").forEach((input,index) => { input.value = defaults[index]; });
    updateQuantities();
    toast("Sample rates restored.");
  });
  $$("#quantityRows .rate-input").forEach(input => input.addEventListener("input", updateQuantities));
  $$("[data-report-section]").forEach(input => input.addEventListener("change", updateReportCount));
  $("#downloadStructuralReport").addEventListener("click", () => {
    downloadFile("caddr-structural-prototype-summary.txt", buildReport(), "text/plain;charset=utf-8");
    toast("Downloaded the prototype summary with the selected report sections.");
  });
  $("#exportStructuralReport").addEventListener("click", () => {
    downloadFile("caddr-structural-prototype-summary.txt", buildReport(), "text/plain;charset=utf-8");
    toast("Exported the illustrative structural summary.");
  });
  $("#printReport").addEventListener("click", () => {
    switchView("reports");
    window.setTimeout(() => window.print(), 150);
  });
  $("#dismissPrototypeWarning").addEventListener("click", () => $(".prototype-warning").remove());
  $("#resetPrototype").addEventListener("click", resetPrototype);
  $("#aiPromptForm").addEventListener("submit", event => {
    event.preventDefault();
    sendAiPrompt($("#aiPromptInput").value);
  });
  $("#aiPromptInput").addEventListener("keydown", event => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      sendAiPrompt($("#aiPromptInput").value);
    }
  });
  $$(".suggestion-chip").forEach(button => button.addEventListener("click", () => sendAiPrompt(button.dataset.prompt)));
  $("#clearAiConversation").addEventListener("click", () => {
    $("#aiMessages").innerHTML = "";
    appendAiMessage("Conversation cleared. Ask about the current project's model, loads, site inputs or detailing workflow.", "assistant");
  });

  $("#modelViewMode").addEventListener("change", event => {
    const elevation = event.target.value.startsWith("Elevation");
    $("#planViewGroup").hidden = elevation;
    $("#elevationViewGroup").hidden = !elevation;
    $("#modelCanvasLabel").textContent = elevation ? "STRUCTURAL ELEVATION · GRID A" : "STRUCTURAL PLAN · LEVEL 01";
    $("#structuralPlanPreview").setAttribute("aria-label", elevation ? "Schematic structural elevation with beams and columns" : "Schematic structural framing plan with beams and columns");
    toast("Switched to " + event.target.value + ". Dimensions and member geometry remain schematic.");
  });
  $("#bearingPressure").addEventListener("keydown", event => {
    if (event.key === "Enter") saveGeotechnicalInputs();
  });

  renderMemberRows();
  renderLevels();
  updateQuantities();
  updateDetailPreview();
  updateReportCount();
})();