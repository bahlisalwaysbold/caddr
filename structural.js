(() => {
  const $ = (selector) => document.querySelector(selector);
  const toast = $("#toast");
  const runButton = $("#runDemoAnalysis");
  const errorBox = $("#analysisError");
  const resultsBox = $("#analysisResults");
  let toastTimer;

  const showToast = (message) => {
    toast.textContent = message;
    toast.classList.add("visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 3300);
  };
  const setEngineState = (state, message) => {
    const statusText = $("#solverStatusText");
    const statusDetail = $("#solverStatusDetail");
    const connection = $("#solverConnection");
    const connectionText = $("#solverConnectionText");
    const badge = $("#engineBadge");
    const card = $("#solverSummaryCard");
    connection.className = "solver-connection " + state;
    connectionText.textContent = message;
    if (state === "ready") {
      statusText.textContent = "Connected";
      statusDetail.textContent = "PyNiteFEA API responding";
      badge.textContent = "Engine connected";
      badge.className = "area-status status-connected";
      card.classList.remove("summary-card-muted");
      runButton.disabled = false;
    } else if (state === "failed") {
      statusText.textContent = "Unavailable";
      statusDetail.textContent = "Check the Vercel preview deployment";
      badge.textContent = "Engine unavailable";
      badge.className = "area-status status-disconnected";
      runButton.disabled = true;
    } else {
      statusText.textContent = "Checking…";
      statusDetail.textContent = "Checking the analysis service";
      badge.textContent = "Checking engine";
      badge.className = "area-status status-preview";
      runButton.disabled = true;
    }
  };

  const checkEngine = async () => {
    setEngineState("pending", "Checking the live analysis service…");
    try {
      const response = await fetch("/api/structural/health", { headers: { "Accept": "application/json" }, cache: "no-store" });
      const data = await response.json();
      if (!response.ok || data.status !== "ok" || data.engine !== "PyNiteFEA") {
        throw new Error(data.error || "The structural analysis service did not report ready.");
      }
      setEngineState("ready", data.engine + " " + data.version + " is responding.");
      $("#statusButton").title = "Analysis engine: " + data.engine + " " + data.version;
    } catch (error) {
      setEngineState("failed", "Could not reach the structural analysis API.");
      $("#analysisError").textContent = "Solver health check failed: " + error.message + " If this branch was just deployed, refresh the preview and check the Vercel build logs.";
      $("#analysisError").hidden = false;
    }
  };

  const numberOrNull = (value) => {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return null;
    return Number(value);
  };
  const formatNumber = (value, decimals = 2) => {
    const number = numberOrNull(value);
    return number === null ? "—" : number.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  };
  const peakAbs = (a, b) => {
    const first = numberOrNull(a);
    const second = numberOrNull(b);
    if (first === null && second === null) return null;
    return Math.max(first === null ? 0 : Math.abs(first), second === null ? 0 : Math.abs(second));
  };
  const metricCard = (label, value, unit, decimals = 2) => {
    const card = document.createElement("div");
    card.className = "analysis-metric";
    const caption = document.createElement("span");
    caption.textContent = label;
    const valueRow = document.createElement("div");
    valueRow.className = "analysis-metric-value";
    const strong = document.createElement("strong");
    strong.textContent = formatNumber(value, decimals);
    const unitEl = document.createElement("small");
    unitEl.textContent = unit;
    valueRow.append(strong, unitEl);
    card.append(caption, valueRow);
    return card;
  };
  const makeTable = (title, headers, rows) => {
    const wrapper = document.createElement("section");
    wrapper.className = "result-table-section";
    const heading = document.createElement("h4");
    heading.textContent = title;
    const scroll = document.createElement("div");
    scroll.className = "table-scroll";
    const table = document.createElement("table");
    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    headers.forEach(label => {
      const th = document.createElement("th");
      th.textContent = label;
      headRow.append(th);
    });
    thead.append(headRow);
    const tbody = document.createElement("tbody");
    rows.forEach(row => {
      const tr = document.createElement("tr");
      row.forEach(value => {
        const td = document.createElement("td");
        td.textContent = value === null || value === undefined ? "—" : String(value);
        tr.append(td);
      });
      tbody.append(tr);
    });
    table.append(thead, tbody);
    scroll.append(table);
    wrapper.append(heading, scroll);
    return wrapper;
  };

  const renderResults = (data) => {
    const combo = Array.isArray(data.combinations) ? data.combinations[0] : null;
    if (!combo) throw new Error("The solver returned no load-combination results.");
    const members = Array.isArray(combo.members) ? combo.members : [];
    const nodes = Array.isArray(combo.nodes) ? combo.nodes : [];
    if (!members.length) throw new Error("The solver returned no member results.");
    const member = members[0];
    const peakMoment = peakAbs(member.maxMomentZ, member.minMomentZ);
    const peakShear = peakAbs(member.maxShearY, member.minShearY);
    const peakDeflection = peakAbs(member.maxDeflectionY, member.minDeflectionY);
    $("#analysisSummary").replaceChildren(
      metricCard("PEAK BENDING MOMENT", peakMoment, "kN·m"),
      metricCard("PEAK SHEAR", peakShear, "kN"),
      metricCard("MAX DEFLECTION", peakDeflection === null ? null : peakDeflection * 1000, "mm", 3),
      metricCard("SOLVER", data.version, "PyNiteFEA", 0)
    );
    $("#analysisResultMeta").textContent = (data.modelName || "Sample beam") + " · " + combo.name + " · linear-elastic analysis";
    const nodeRows = nodes.map(node => [
      node.nodeId,
      formatNumber(node.reactions && node.reactions.FY, 2),
      formatNumber(node.reactions && node.reactions.FX, 2),
      numberOrNull(node.displacements && node.displacements.DY) === null ? "—" : formatNumber(node.displacements.DY * 1000, 3)
    ]);
    const memberRows = members.map(item => [
      item.memberId,
      formatNumber(item.length, 3),
      formatNumber(peakAbs(item.maxShearY, item.minShearY), 2),
      formatNumber(peakAbs(item.maxMomentZ, item.minMomentZ), 2),
      numberOrNull(peakAbs(item.maxDeflectionY, item.minDeflectionY)) === null ? "—" : formatNumber(peakAbs(item.maxDeflectionY, item.minDeflectionY) * 1000, 3)
    ]);
    const tableContainer = $("#analysisTable");
    tableContainer.replaceChildren(
      makeTable("Node results", ["Node", "Vertical reaction FY (kN)", "Horizontal reaction FX (kN)", "Vertical displacement DY (mm)"], nodeRows),
      makeTable("Member force summary", ["Member", "Length (m)", "Peak |Vᵧ| (kN)", "Peak |M𝓏| (kN·m)", "Peak |δᵧ| (mm)"], memberRows)
    );
    resultsBox.hidden = false;
    errorBox.hidden = true;
    resultsBox.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest" });
  };

  const demoBeam = {
    name: "Caddr sample simply supported beam",
    units: "kN-m",
    nodes: [
      { id: "N1", x: 0, y: 0, z: 0, supports: { DX: true, DY: true, DZ: true } },
      { id: "N2", x: 6, y: 0, z: 0, supports: { DX: true, DY: true, DZ: true } }
    ],
    materials: [
      { id: "SteelDemo", E: 200000000, G: 76923077, nu: 0.3, rho: 78.5 }
    ],
    sections: [
      { id: "DemoSection", A: 0.01, Iy: 0.000006, Iz: 0.00008, J: 0.0000008 }
    ],
    members: [
      { id: "B1", iNode: "N1", jNode: "N2", materialId: "SteelDemo", sectionId: "DemoSection" }
    ],
    loads: [
      { type: "distributed", memberId: "B1", direction: "Fy", w1: -10, w2: -10, x1: 0, x2: 6, case: "LIVE" }
    ],
    combinations: [
      { name: "DEMO_SERVICE", factors: { LIVE: 1 } }
    ]
  };

  runButton.addEventListener("click", async () => {
    const originalText = "Run sample analysis";
    runButton.disabled = true;
    runButton.textContent = "Running analysis…";
    errorBox.hidden = true;
    resultsBox.hidden = true;
    try {
      const response = await fetch("/api/structural/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ model: demoBeam }),
        cache: "no-store"
      });
      const data = await response.json();
      if (!response.ok || data.ok !== true) throw new Error(data.error || "Analysis request failed.");
      renderResults(data);
      showToast("The analysis service returned results for the sample beam.");
    } catch (error) {
      errorBox.textContent = "Analysis failed: " + error.message;
      errorBox.hidden = false;
      showToast("The sample analysis did not complete. Check the message in the analysis panel.");
    } finally {
      runButton.disabled = false;
      runButton.innerHTML = originalText + ' <span>→</span>';
    }
  });

  document.querySelectorAll("[data-not-ready]").forEach((button) => {
    button.addEventListener("click", () => showToast(button.dataset.notReady || "This workflow is planned but not connected yet."));
  });
  $("#workspaceSwitch").addEventListener("click", () => showToast("Workspace switching will be added with account and cloud support."));
  $("#profileMore").addEventListener("click", () => showToast("Profile settings are not connected in this prototype."));
  $("#statusButton").addEventListener("click", () => showToast("The connected solver currently analyses a defined sample beam only. Building-model mapping and member design are not yet connected."));

  const settingsDialog = $("#settingsDialog");
  $("#modelSettingsButton").addEventListener("click", () => {
    if (typeof settingsDialog.showModal === "function") settingsDialog.showModal();
    else showToast("Project settings require a modern browser.");
  });
  $("#closeSettings").addEventListener("click", () => settingsDialog.close());
  $("#cancelSettings").addEventListener("click", () => settingsDialog.close());
  settingsDialog.addEventListener("click", (event) => {
    if (event.target === settingsDialog) settingsDialog.close();
  });
  $("#saveSettings").addEventListener("click", (event) => {
    event.preventDefault();
    const type = $("#structureType").value;
    const storeys = $("#storeyCount").value;
    $(".summary-card:nth-child(1) > strong").textContent = type.replace("Reinforced concrete building", "RC building").replace("Steel frame building", "Steel frame").replace("Masonry structure", "Masonry").replace("Mixed structural system", "Mixed system");
    $(".summary-card:nth-child(2) > strong").textContent = storeys.replace(" storeys", "") + " levels";
    $(".summary-card:nth-child(2) > small").textContent = "Prototype setup only — not analysed";
    settingsDialog.close();
    showToast("Preview settings updated in this page only. No building analysis was recalculated.");
  });
  document.querySelectorAll(".structural-stage").forEach((stage) => {
    stage.addEventListener("click", () => {
      document.querySelectorAll(".structural-stage").forEach(item => item.classList.remove("active"));
      stage.classList.add("active");
    });
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && settingsDialog.open) settingsDialog.close();
  });
  checkEngine();
})();