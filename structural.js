(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const toast = $("#toast");
  const runButton = $("#runDemoAnalysis");
  const errorBox = $("#analysisError");
  const resultsBox = $("#analysisResults");
  const svg = $("#structuralDiagram");
  const STORAGE_KEY = "caddr.structural-model.v1";
  const BASELINE = {
    beamWidth: 250,
    beamDepth: 450,
    beamLoad: 12,
    columnWidth: 300,
    columnDepth: 300
  };
  const X_GRID = [0, 4, 8];
  const GRID_NAMES = ["A", "B", "C"];
  function makeLevels(count) {
    const safeCount = Math.max(2, Math.min(5, Math.round(Number(count) || 3)));
    return Array.from({ length: safeCount }, (_, index) => ({
      id: "L" + index,
      label: index === 0 ? "FOUNDATION" : "LEVEL " + index + " · +" + (index * 3.3).toFixed(1) + " m",
      y: Number((index * 3.3).toFixed(3))
    }));
  }
  let LEVELS = makeLevels(3);
  const DISPLAY = {
    model: { title: "MODEL VIEW", unit: "", fields: [] },
    moment: { title: "BENDING MOMENT DIAGRAM", unit: "kN·m", beam: "momentZ", column: "momentY", fields: ["maxMomentZ", "minMomentZ"] },
    shear: { title: "SHEAR FORCE DIAGRAM", unit: "kN", beam: "shearFy", column: "shearFz", fields: ["maxShearY", "minShearY"] },
    deflection: { title: "DEFLECTION DIAGRAM · MAGNIFIED", unit: "mm", beam: "deflectionY", column: "deflectionZ", fields: ["maxDeflectionY", "minDeflectionY"] }
  };

  let toastTimer;
  let members = makeDefaultMembers();
  let latestAnalysis = null;
  let selectedMemberId = members.find(member => member.kind === "beam")?.id || members[0]?.id || null;
  let currentMode = "model";
  let engineReady = false;

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 3400);
  }

  function makeDefaultMembers() {
    const result = [];
    for (let span = 0; span < 2; span++) {
      for (let level = 1; level < LEVELS.length; level++) {
        const id = "BEAM_B" + (span + 1) + "_L" + level;
        result.push({
          id, kind: "beam",
          label: "Beam B" + (span + 1) + " · Level " + level,
          iNode: "N_" + GRID_NAMES[span] + "_L" + level,
          jNode: "N_" + GRID_NAMES[span + 1] + "_L" + level,
          width: BASELINE.beamWidth, depth: BASELINE.beamDepth, load: BASELINE.beamLoad
        });
      }
    }
    for (let grid = 0; grid < 3; grid++) {
      for (let level = 0; level < LEVELS.length - 1; level++) {
        const id = "COL_" + GRID_NAMES[grid] + "_L" + level + "_L" + (level + 1);
        result.push({
          id, kind: "column",
          label: "Column " + GRID_NAMES[grid] + " · " + LEVELS[level].label.split(" ·")[0] + "–L" + (level + 1),
          iNode: "N_" + GRID_NAMES[grid] + "_L" + level,
          jNode: "N_" + GRID_NAMES[grid] + "_L" + (level + 1),
          width: BASELINE.columnWidth, depth: BASELINE.columnDepth, load: 0
        });
      }
    }
    return result;
  }

  function restoreMemberEdits() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!saved || typeof saved !== "object") return;
      if (Number.isInteger(saved.levels) && saved.levels >= 2 && saved.levels <= 5) {
        LEVELS = makeLevels(saved.levels);
        members = makeDefaultMembers();
      }
      if (!saved.members || typeof saved.members !== "object") return;
      members.forEach(member => {
        const candidate = saved.members[member.id];
        if (!candidate || typeof candidate !== "object") return;
        const width = Number(candidate.width);
        const depth = Number(candidate.depth);
        const load = Number(candidate.load);
        if (Number.isFinite(width) && width >= 100 && width <= 1500) member.width = width;
        if (Number.isFinite(depth) && depth >= 100 && depth <= 2000) member.depth = depth;
        if (member.kind === "beam" && Number.isFinite(load) && load >= 0 && load <= 500) member.load = load;
      });
    } catch (_) {
      // An unavailable or malformed browser preference never prevents opening the model.
    }
  }

  function persistMemberEdits() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        version: 1,
        units: "kN-m",
        levels: LEVELS.length,
        members: Object.fromEntries(members.map(member => [member.id, {
          width: member.width, depth: member.depth, load: member.load
        }]))
      }));
    } catch (_) {
      showToast("Changes are active in this session, but this browser blocked local saving.");
    }
  }

  function makeFrameModel() {
    const nodes = [];
    LEVELS.forEach(level => {
      X_GRID.forEach((x, index) => {
        const supports = level.id === "L0"
          ? { DX: true, DY: true, DZ: true, RX: true, RY: true, RZ: true }
          : {};
        nodes.push({
          id: "N_" + GRID_NAMES[index] + "_" + level.id,
          x, y: level.y, z: 0,
          supports
        });
      });
    });

    const materials = [{
      id: "Concrete_E25GPa",
      E: 25000000,
      G: 10416666.6667,
      nu: 0.2,
      rho: 24
    }];

    const sectionMap = new Map();
    const memberPayload = members.map(member => {
      const b = member.width / 1000;
      const h = member.depth / 1000;
      const A = b * h;
      // For horizontal beams, Iz is the in-plane strong-axis inertia used by Mz.
      // The square sample columns have identical Iy/Iz; properties are regenerated after every edit.
      let Iy, Iz;
      if (member.kind === "beam") {
        Iy = h * Math.pow(b, 3) / 12;
        Iz = b * Math.pow(h, 3) / 12;
      } else {
        Iy = b * Math.pow(h, 3) / 12;
        Iz = h * Math.pow(b, 3) / 12;
      }
      const longSide = Math.max(b, h);
      const shortSide = Math.min(b, h);
      const ratio = shortSide / longSide;
      const J = longSide * Math.pow(shortSide, 3) *
        (1 / 3 - 0.21 * ratio * (1 - Math.pow(ratio, 4) / 12));
      const sectionId = "SEC_" + member.id;
      sectionMap.set(sectionId, { id: sectionId, A, Iy, Iz, J });
      return {
        id: member.id,
        label: member.label,
        kind: member.kind,
        iNode: member.iNode,
        jNode: member.jNode,
        materialId: "Concrete_E25GPa",
        sectionId,
        rotation: 0,
        widthMm: member.width,
        depthMm: member.depth,
        lineLoadKNM: member.kind === "beam" ? member.load : 0
      };
    });

    const nodesById = Object.fromEntries(nodes.map(node => [node.id, node]));
    const loads = members.filter(member => member.kind === "beam").map(member => {
      const start = nodesById[member.iNode];
      const end = nodesById[member.jNode];
      return {
        type: "distributed",
        memberId: member.id,
        direction: "FY",
        w1: -member.load,
        w2: -member.load,
        x1: 0,
        x2: Math.hypot(end.x - start.x, end.y - start.y, end.z - start.z),
        case: "G"
      };
    });

    return {
      name: "Residential Block A — editable frame",
      units: "kN-m",
      modelType: "planarFrameInGlobalXY",
      nodes,
      materials,
      sections: [...sectionMap.values()],
      members: memberPayload.map(member => ({
        id: member.id, label: member.label, kind: member.kind,
        iNode: member.iNode, jNode: member.jNode,
        materialId: member.materialId, sectionId: member.sectionId,
        rotation: member.rotation
      })),
      loads,
      combinations: [{ name: "G_SERVICE", factors: { G: 1.0 } }]
    };
  }

  function nodeCoordinates() {
    const lookup = {};
    LEVELS.forEach(level => {
      X_GRID.forEach((x, index) => {
        lookup["N_" + GRID_NAMES[index] + "_" + level.id] = { x, y: level.y, z: 0 };
      });
    });
    return lookup;
  }

  function pointFor(nodeId) {
    const coords = nodeCoordinates()[nodeId];
    const height = Math.max(1, LEVELS[LEVELS.length - 1].y);
    return {
      x: 115 + (coords.x / 8) * 490,
      y: 321 - (coords.y / height) * 205
    };
  }

  function memberResultMap() {
    const combo = latestAnalysis?.combinations?.[0];
    return Object.fromEntries((combo?.members || []).map(result => [result.memberId, result]));
  }

  function selectedMetricResult(member, result) {
    if (!member || !result) return null;
    if (currentMode === "moment") return member.kind === "beam"
      ? peakAbs(result.maxMomentZ, result.minMomentZ)
      : peakAbs(result.maxMomentY, result.minMomentY);
    if (currentMode === "shear") return member.kind === "beam"
      ? peakAbs(result.maxShearY, result.minShearY)
      : peakAbs(result.maxShearZ, result.minShearZ);
    if (currentMode === "deflection") return member.kind === "beam"
      ? peakAbs(result.maxDeflectionY, result.minDeflectionY)
      : peakAbs(result.maxDeflectionZ, result.minDeflectionZ);
    return null;
  }

  function diagramField(member) {
    const def = DISPLAY[currentMode];
    return !def || currentMode === "model" ? null : def[member.kind];
  }

  function peakAbs(a, b) {
    const values = [a, b].map(value => value === null || value === undefined ? null : Number(value))
      .filter(value => value !== null && Number.isFinite(value));
    return values.length ? Math.max(...values.map(Math.abs)) : null;
  }

  function getMemberDiagramValues(member, result) {
    const field = diagramField(member);
    const samples = result?.diagramSamples;
    if (!field || !Array.isArray(samples)) return [];
    return samples.map(sample => sample[field]).filter(value => value !== null && value !== undefined && Number.isFinite(Number(value))).map(Number);
  }

  function modeGlobalScale() {
    const resultMap = memberResultMap();
    const values = members.flatMap(member => getMemberDiagramValues(member, resultMap[member.id]));
    return Math.max(0.000001, ...values.map(value => Math.abs(value)));
  }

  function svgText(x, y, text, className, anchor = "middle") {
    return '<text x="' + x + '" y="' + y + '" class="' + className + '" text-anchor="' + anchor + '">' +
      String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") + '</text>';
  }

  function formatNumber(value, decimals = 2) {
    const number = value === null || value === undefined ? NaN : Number(value);
    return Number.isFinite(number)
      ? number.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
      : "—";
  }

  function maxResultValue(result, keys) {
    let peak = 0;
    let found = false;
    keys.forEach(key => {
      const value = result && Number(result[key]);
      if (result && result[key] !== null && result[key] !== undefined && Number.isFinite(value)) {
        peak = Math.max(peak, Math.abs(value));
        found = true;
      }
    });
    return found ? peak : null;
  }

  function resultForMember(id) {
    return memberResultMap()[id] || null;
  }

  function diagramColor(mode, value) {
    if (mode === "moment") return value < 0 ? "#d67b43" : "#6b77d8";
    if (mode === "shear") return value < 0 ? "#d67b43" : "#3188bd";
    if (mode === "deflection") return "#7b68ca";
    return "#5c91d4";
  }

  function diagramOverlay(member, p1, p2, result, scale) {
    const field = diagramField(member);
    const samples = result?.diagramSamples;
    if (!field || !Array.isArray(samples) || samples.length < 2) return "";
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const len = Math.max(1, Math.hypot(dx, dy));
    const normal = { x: -dy / len, y: dx / len };
    const targetScale = currentMode === "deflection" ? 26 : 31;
    const localMax = Math.max(0.000001, scale);
    const diagramPoints = samples.map((sample, index) => {
      const fraction = Number.isFinite(Number(sample.x)) && Number(result.length) > 0
        ? Math.min(1, Math.max(0, Number(sample.x) / Number(result.length)))
        : index / (samples.length - 1);
      const value = Number(sample[field] ?? 0);
      const offset = Number.isFinite(value) ? value / localMax * targetScale : 0;
      return { x: p1.x + dx * fraction + normal.x * offset, y: p1.y + dy * fraction + normal.y * offset, value };
    });
    const path = diagramPoints.map((p, index) => (index ? "L " : "M ") + p.x.toFixed(2) + " " + p.y.toFixed(2)).join(" ");
    const fillPath = "M " + p1.x + " " + p1.y + " " + diagramPoints.map(p => "L " + p.x.toFixed(2) + " " + p.y.toFixed(2)).join(" ") + " L " + p2.x + " " + p2.y + " Z";
    const peak = selectedMetricResult(member, result);
    const signedValues = samples.map(sample => Number(sample[field])).filter(value => Number.isFinite(value));
    const signedPeak = signedValues.sort((a, b) => Math.abs(b) - Math.abs(a))[0] || 0;
    const color = diagramColor(currentMode, signedPeak);
    const isSelected = member.id === selectedMemberId;
    const mid = diagramPoints[Math.floor(diagramPoints.length / 2)];
    const unit = DISPLAY[currentMode].unit;
    return '<path d="' + fillPath + '" class="diagram-area ' + (isSelected ? "selected" : "") + '" fill="' + color + '" fill-opacity="' + (isSelected ? "0.32" : "0.13") + '" stroke="none"/>' +
      '<path d="' + path + '" class="diagram-curve ' + (isSelected ? "selected" : "") + '" stroke="' + color + '"/>';
  }

  function renderDiagram() {
    updateModelCounts();
    const coordinateMap = nodeCoordinates();
    const resultMap = memberResultMap();
    const scale = modeGlobalScale();
    const parts = [
      '<defs><pattern id="modelGrid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="#e7edf5" stroke-width=".8"/></pattern><marker id="loadArrow" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto"><path d="M0 0L6 3L0 6Z" fill="#ce9855"/></marker></defs>',
      '<rect x="0" y="0" width="720" height="390" rx="8" fill="#fbfdff"/>',
      '<rect x="0" y="0" width="720" height="390" rx="8" fill="url(#modelGrid)"/>',
      '<g class="model-grid-guides">'
    ];

    X_GRID.forEach((x, index) => {
      const p = pointFor("N_" + GRID_NAMES[index] + "_L0");
      parts.push('<line x1="' + p.x + '" y1="76" x2="' + p.x + '" y2="329" stroke="#d7e2f0" stroke-dasharray="3 5"/>');
      parts.push('<circle cx="' + p.x + '" cy="45" r="13" fill="#fff" stroke="#c8d7e9"/>');
      parts.push(svgText(p.x, 49, GRID_NAMES[index], "grid-bubble-label"));
    });
    LEVELS.forEach(level => {
      const p = pointFor("N_A_" + level.id);
      parts.push('<line x1="78" y1="' + p.y + '" x2="635" y2="' + p.y + '" stroke="#d7e2f0" stroke-dasharray="3 5"/>');
      parts.push(svgText(71, p.y + 3, level.id === "L0" ? "0.0" : level.y.toFixed(1), "level-label", "end"));
    });
    parts.push('</g>');
    const groundLeft = pointFor("N_A_L0"), groundRight = pointFor("N_C_L0");
    parts.push('<line x1="' + (groundLeft.x - 40) + '" y1="' + (groundLeft.y + 14) + '" x2="' + (groundRight.x + 40) + '" y2="' + (groundRight.y + 14) + '" stroke="#9badc2" stroke-width="1.4"/>');

    // Draw support symbols under the three fixed base joints.
    X_GRID.forEach((x, index) => {
      const p = pointFor("N_" + GRID_NAMES[index] + "_L0");
      parts.push('<path d="M ' + (p.x - 12) + ' ' + (p.y + 13) + ' L ' + (p.x + 12) + ' ' + (p.y + 13) + ' L ' + p.x + ' ' + (p.y + 1) + ' Z" fill="#dbe5f0" stroke="#899db5" stroke-width="1"/>');
    });

    const ordered = [...members].sort((a, b) => (a.kind === "column" ? 0 : 1) - (b.kind === "column" ? 0 : 1));
    ordered.forEach(member => {
      const p1 = pointFor(member.iNode), p2 = pointFor(member.jNode);
      const selected = member.id === selectedMemberId;
      const result = resultMap[member.id];
      const isBeam = member.kind === "beam";
      if (currentMode !== "model" && result) {
        parts.push(diagramOverlay(member, p1, p2, result, scale));
        parts.push('<line x1="' + p1.x + '" y1="' + p1.y + '" x2="' + p2.x + '" y2="' + p2.y + '" class="diagram-baseline ' + (selected ? "selected" : "") + '"/>');
      } else {
        const thickness = Math.max(4, Math.min(11, (member.kind === "beam" ? member.depth : member.width) / 65));
        const color = selected ? "#ef9e55" : (isBeam ? "#6b91c7" : "#244d7b");
        parts.push('<line x1="' + p1.x + '" y1="' + p1.y + '" x2="' + p2.x + '" y2="' + p2.y + '" stroke="' + color + '" stroke-width="' + (thickness + (selected ? 3 : 0)) + '" stroke-linecap="round" opacity=".24"/>');
        parts.push('<line x1="' + p1.x + '" y1="' + p1.y + '" x2="' + p2.x + '" y2="' + p2.y + '" class="structural-member ' + member.kind + (selected ? " selected" : "") + '" data-member-id="' + member.id + '" stroke="' + color + '" stroke-width="' + thickness + '" stroke-linecap="round"/>');
        if (currentMode === "model" && isBeam) {
          const q = Math.max(0, member.load || 0);
          const arrowCount = 4;
          for (let i = 1; i <= arrowCount; i++) {
            const x = p1.x + (p2.x - p1.x) * i / (arrowCount + 1);
            parts.push('<line x1="' + x + '" y1="' + (p1.y - 25) + '" x2="' + x + '" y2="' + (p1.y - 7) + '" stroke="#ce9855" stroke-width="1.1" marker-end="url(#loadArrow)" opacity="' + (q > 0 ? ".9" : ".25") + '"/>');
          }
          parts.push(svgText((p1.x + p2.x) / 2, p1.y - 32, "q = " + formatNumber(q, 1) + " kN/m", "line-load-label"));
        }
      }

      // A wide transparent hit target makes thin members easy to select.
      parts.push('<line x1="' + p1.x + '" y1="' + p1.y + '" x2="' + p2.x + '" y2="' + p2.y + '" class="member-hit-target" data-member-id="' + member.id + '" tabindex="0" role="button" aria-label="Select ' + member.label.replace(/&/g, "&amp;").replace(/"/g, "&quot;") + '"/>');
      if (currentMode !== "model" && selected && result) {
        const value = selectedMetricResult(member, result);
        const midX = (p1.x + p2.x) / 2, midY = (p1.y + p2.y) / 2;
        if (value !== null) parts.push(svgText(midX + 9, midY - 8, formatNumber(currentMode === "deflection" ? value * 1000 : value, currentMode === "deflection" ? 3 : 1) + " " + DISPLAY[currentMode].unit, "selected-diagram-label"));
      }
    });

    // Joints remain visible above the members, and are part of the shared frame geometry.
    Object.keys(coordinateMap).forEach(nodeId => {
      const p = pointFor(nodeId);
      parts.push('<circle cx="' + p.x + '" cy="' + p.y + '" r="4.1" class="model-joint"/>');
    });
    parts.push(svgText(620, 365, currentMode === "model" ? "SCHEMATIC · kN-m" : DISPLAY[currentMode].unit + " · " + (latestAnalysis?.combinations?.[0]?.name || ""), "diagram-foot-label", "end"));
    svg.innerHTML = parts.join("");
    $("#diagramModeLabel").textContent = DISPLAY[currentMode].title;
    $("#diagramLegend").classList.toggle("result-legend", currentMode !== "model");
    const labels = currentMode === "model"
      ? '<span><i class="legend-beam"></i>Beams</span><span><i class="legend-column"></i>Columns</span><span><i class="legend-joint"></i>Joints</span><span><i class="legend-load"></i>Entered line load</span>'
      : '<span><i class="legend-moment"></i>Positive diagram</span><span><i class="legend-negative"></i>Negative diagram</span><span><i class="legend-joint"></i>Joints</span>';
    $("#diagramLegend").innerHTML = labels;
    $$("#structuralDiagram [data-member-id]").forEach(target => {
      const activate = () => selectMember(target.dataset.memberId);
      target.addEventListener("click", activate);
      target.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); activate(); }
      });
    });
    updateViewButtons();
  }

  function updateViewButtons() {
    $$("[data-diagram-mode]").forEach(button => {
      const active = button.dataset.diagramMode === currentMode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
      button.disabled = button.dataset.diagramMode !== "model" && !latestAnalysis;
      button.title = button.disabled ? "Run analysis to inspect this diagram." : "";
    });
  }

  function updateModelCounts() {
    const jointCount = Object.keys(nodeCoordinates()).length;
    $("#modelCountLabel").textContent = members.length + " members · " + jointCount + " joints";
    $("#modelLevelSummary").textContent = "Ground + " + (LEVELS.length - 1) + " upper levels";
    $(".summary-card:nth-child(2) > strong").innerHTML = LEVELS.length + ' <small>levels</small>';
    $(".summary-card:nth-child(2) > small").textContent = "Ground + " + (LEVELS.length - 1) + " upper levels";
  }

  function selectMember(id) {
    const member = members.find(item => item.id === id);
    if (!member) return;
    selectedMemberId = id;
    drawInspector();
    updateLoadList();
    renderDiagram();
  }

  function drawInspector() {
    const member = members.find(item => item.id === selectedMemberId);
    if (!member) return;
    $("#selectedMemberType").textContent = member.kind.toUpperCase();
    $("#selectedMemberType").className = "member-type-badge " + member.kind;
    $("#selectedMemberTitle").textContent = member.label;
    $("#selectedMemberSubtitle").textContent = member.id;
    $("#memberWidth").value = String(member.width);
    $("#memberDepth").value = String(member.depth);
    $("#memberLoad").value = String(member.kind === "beam" ? member.load : 0);
    $("#memberLoadField").hidden = member.kind !== "beam";
    $("#memberInspectorHelp").textContent = member.kind === "beam"
      ? "Section dimensions and entered gravity line load are sent to the solver when you run analysis."
      : "Section dimensions are sent to the solver when you run analysis. Columns do not receive this beam line-load input.";
    const b = member.width / 1000, h = member.depth / 1000;
    const area = b * h;
    const strongI = member.kind === "beam" ? b * Math.pow(h, 3) / 12 : Math.max(b * Math.pow(h, 3), h * Math.pow(b, 3)) / 12;
    $("#sectionArea").textContent = formatNumber(area, 4) + " m²";
    $("#sectionInertia").textContent = formatNumber(strongI, 6) + " m⁴";
    const result = resultForMember(member.id);
    $("#selectedMemberResults").hidden = !latestAnalysis || !result;
    if (latestAnalysis && result) {
      const moment = member.kind === "beam" ? peakAbs(result.maxMomentZ, result.minMomentZ) : peakAbs(result.maxMomentY, result.minMomentY);
      const shear = member.kind === "beam" ? peakAbs(result.maxShearY, result.minShearY) : peakAbs(result.maxShearZ, result.minShearZ);
      const deflection = member.kind === "beam" ? peakAbs(result.maxDeflectionY, result.minDeflectionY) : peakAbs(result.maxDeflectionZ, result.minDeflectionZ);
      $("#inspectorComboName").textContent = latestAnalysis.combinations?.[0]?.name || "—";
      $("#inspectorMoment").textContent = moment === null ? "—" : formatNumber(moment, 2) + " kN·m";
      $("#inspectorShear").textContent = shear === null ? "—" : formatNumber(shear, 2) + " kN";
      $("#inspectorDeflection").textContent = deflection === null ? "—" : formatNumber(deflection * 1000, 3) + " mm";
    }
  }

  function updateLoadList() {
    const list = $("#beamLoadList");
    if (!list) return;
    list.replaceChildren();
    members.filter(member => member.kind === "beam").forEach(member => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "beam-load-row" + (member.id === selectedMemberId ? " selected" : "");
      button.dataset.memberId = member.id;
      const title = document.createElement("span");
      title.className = "beam-load-name";
      title.textContent = member.label;
      const value = document.createElement("strong");
      value.textContent = formatNumber(member.load, 1) + " kN/m";
      const arrow = document.createElement("span");
      arrow.className = "beam-load-edit";
      arrow.textContent = "Edit →";
      button.append(title, value, arrow);
      button.addEventListener("click", () => {
        selectMember(member.id);
        $("#model").scrollIntoView({ behavior: "smooth", block: "start" });
      });
      list.append(button);
    });
  }

  function invalidateResults() {
    latestAnalysis = null;
    resultsBox.hidden = true;
    errorBox.hidden = true;
    $("#selectedMemberResults").hidden = true;
    currentMode = "model";
    updateViewButtons();
  }

  function applyMemberProperties() {
    const member = members.find(item => item.id === selectedMemberId);
    if (!member) return;
    const width = Number($("#memberWidth").value);
    const depth = Number($("#memberDepth").value);
    const load = Number($("#memberLoad").value);
    if (!Number.isFinite(width) || width < 100 || width > 1500) {
      showToast("Section width must be between 100 and 1,500 mm.");
      $("#memberWidth").focus(); return;
    }
    if (!Number.isFinite(depth) || depth < 100 || depth > 2000) {
      showToast("Section depth must be between 100 and 2,000 mm.");
      $("#memberDepth").focus(); return;
    }
    if (member.kind === "beam" && (!Number.isFinite(load) || load < 0 || load > 500)) {
      showToast("Enter a downward line-load magnitude between 0 and 500 kN/m.");
      $("#memberLoad").focus(); return;
    }
    member.width = width;
    member.depth = depth;
    if (member.kind === "beam") member.load = load;
    persistMemberEdits();
    invalidateResults();
    drawInspector();
    updateLoadList();
    renderDiagram();
    $("#memberInspectorHelp").textContent = "Applied to " + member.id + ". Run Analysis again to calculate the edited model.";
    showToast("Updated " + member.id + ". Previous analysis results have been cleared.");
  }

  function resetSelectedMember() {
    const member = members.find(item => item.id === selectedMemberId);
    if (!member) return;
    member.width = member.kind === "beam" ? BASELINE.beamWidth : BASELINE.columnWidth;
    member.depth = member.kind === "beam" ? BASELINE.beamDepth : BASELINE.columnDepth;
    member.load = member.kind === "beam" ? BASELINE.beamLoad : 0;
    persistMemberEdits();
    invalidateResults();
    drawInspector();
    updateLoadList();
    renderDiagram();
    showToast("Restored default properties for " + member.id + ".");
  }

  function resetFrameModel() {
    LEVELS = makeLevels(3);
    members = makeDefaultMembers();
    selectedMemberId = members.find(member => member.kind === "beam")?.id || members[0]?.id || null;
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
    invalidateResults();
    drawInspector();
    updateLoadList();
    renderDiagram();
    showToast("The demonstration frame has been reset.");
  }

  function setDiagramMode(mode) {
    if (!DISPLAY[mode]) return;
    if (mode !== "model" && !latestAnalysis) {
      showToast("Run Analysis first to generate a real result diagram.");
      return;
    }
    currentMode = mode;
    renderDiagram();
  }

  function setEngineState(state, message) {
    $("#solverStatusText").textContent = state === "ready" ? "Connected" : state === "failed" ? "Unavailable" : "Checking…";
    $("#solverStatusDetail").textContent = state === "ready" ? "PyNiteFEA API responding" : state === "failed" ? "Check the deployment and API logs" : "Checking the analysis service";
    $("#solverConnection").className = "solver-connection " + state;
    $("#solverConnectionText").textContent = message;
    $("#engineBadge").textContent = state === "ready" ? "Engine connected" : state === "failed" ? "Engine unavailable" : "Checking engine";
    $("#engineBadge").className = "area-status " + (state === "ready" ? "status-connected" : state === "failed" ? "status-disconnected" : "status-preview");
    $("#solverSummaryCard").classList.toggle("summary-card-muted", state !== "ready");
    engineReady = state === "ready";
    runButton.disabled = !engineReady;
  }

  async function checkEngine() {
    setEngineState("pending", "Checking the live structural analysis service…");
    try {
      const response = await fetch("/api/structural/health", { headers: { Accept: "application/json" }, cache: "no-store" });
      const data = await response.json();
      if (!response.ok || data.status !== "ok" || data.engine !== "PyNiteFEA") {
        throw new Error(data.error || "The analysis engine did not report ready.");
      }
      setEngineState("ready", data.engine + " " + data.version + " is responding.");
      $("#statusButton").title = "Analysis engine: " + data.engine + " " + data.version;
    } catch (error) {
      setEngineState("failed", "Could not reach the analysis API.");
      errorBox.textContent = "Solver health check failed: " + error.message + " Refresh the preview and check the Vercel deployment if this persists.";
      errorBox.hidden = false;
    }
  }

  function makeMetricCard(label, value, unit, decimals = 2) {
    const card = document.createElement("div");
    card.className = "analysis-metric";
    const caption = document.createElement("span");
    caption.textContent = label;
    const row = document.createElement("div");
    row.className = "analysis-metric-value";
    const strong = document.createElement("strong");
    strong.textContent = typeof value === "string" ? value : formatNumber(value, decimals);
    const unitNode = document.createElement("small");
    unitNode.textContent = unit;
    row.append(strong, unitNode);
    card.append(caption, row);
    return card;
  }

  function makeResultTable(title, headers, rows) {
    const section = document.createElement("section");
    section.className = "result-table-section";
    const heading = document.createElement("h4");
    heading.textContent = title;
    const scroll = document.createElement("div");
    scroll.className = "table-scroll";
    const table = document.createElement("table");
    const head = document.createElement("thead");
    const headerRow = document.createElement("tr");
    headers.forEach(text => {
      const th = document.createElement("th");
      th.textContent = text;
      headerRow.append(th);
    });
    head.append(headerRow);
    const body = document.createElement("tbody");
    rows.forEach(values => {
      const row = document.createElement("tr");
      values.forEach(value => {
        const cell = document.createElement("td");
        cell.textContent = value === null || value === undefined ? "—" : String(value);
        row.append(cell);
      });
      body.append(row);
    });
    table.append(head, body);
    scroll.append(table);
    section.append(heading, scroll);
    return section;
  }

  function renderResults(data) {
    const combo = data.combinations?.[0];
    if (!combo || !Array.isArray(combo.members) || combo.members.length !== members.length) {
      throw new Error("The solver response did not include results for every current frame member.");
    }
    latestAnalysis = data;
    const mappedMembers = combo.members.map(result => ({
      ...result,
      kind: members.find(member => member.id === result.memberId)?.kind || result.kind
    }));
    const moments = mappedMembers.map(result => {
      const kind = result.kind;
      return kind === "beam" ? peakAbs(result.maxMomentZ, result.minMomentZ) : peakAbs(result.maxMomentY, result.minMomentY);
    }).filter(value => value !== null);
    const shears = mappedMembers.map(result => {
      const kind = result.kind;
      return kind === "beam" ? peakAbs(result.maxShearY, result.minShearY) : peakAbs(result.maxShearZ, result.minShearZ);
    }).filter(value => value !== null);
    const deflections = mappedMembers.map(result => {
      const kind = result.kind;
      return kind === "beam" ? peakAbs(result.maxDeflectionY, result.minDeflectionY) : peakAbs(result.maxDeflectionZ, result.minDeflectionZ);
    }).filter(value => value !== null);
    const peakMoment = moments.length ? Math.max(...moments) : null;
    const peakShear = shears.length ? Math.max(...shears) : null;
    const peakDeflection = deflections.length ? Math.max(...deflections) : null;
    $("#analysisSummary").replaceChildren(
      makeMetricCard("PEAK MOMENT", peakMoment, "kN·m"),
      makeMetricCard("PEAK SHEAR", peakShear, "kN"),
      makeMetricCard("MAX MEMBER DEFLECTION", peakDeflection === null ? null : peakDeflection * 1000, "mm", 3),
      makeMetricCard("MEMBERS SOLVED", mappedMembers.length, "members", 0)
    );
    $("#analysisResultMeta").textContent = (data.modelName || "Editable frame") + " · " + combo.name + " · " + (data.analysisMethod || "linear-elastic");
    const nodes = Array.isArray(combo.nodes) ? combo.nodes : [];
    $("#analysisTable").replaceChildren(
      makeResultTable("Node results", ["Node", "Reaction FY (kN)", "Reaction FX (kN)", "Vertical displacement DY (mm)"], nodes.map(node => [
        node.nodeId,
        formatNumber(node.reactions?.FY, 2),
        formatNumber(node.reactions?.FX, 2),
        node.displacements?.DY === null || node.displacements?.DY === undefined ? "—" : formatNumber(Number(node.displacements.DY) * 1000, 3)
      ])),
      makeResultTable("Member force summary", ["Member", "Type", "Length (m)", "Peak shear (kN)", "Peak moment (kN·m)", "Peak deflection (mm)"], mappedMembers.map(result => {
        const member = members.find(item => item.id === result.memberId);
        const shear = member?.kind === "beam" ? peakAbs(result.maxShearY, result.minShearY) : peakAbs(result.maxShearZ, result.minShearZ);
        const moment = member?.kind === "beam" ? peakAbs(result.maxMomentZ, result.minMomentZ) : peakAbs(result.maxMomentY, result.minMomentY);
        const deflection = member?.kind === "beam" ? peakAbs(result.maxDeflectionY, result.minDeflectionY) : peakAbs(result.maxDeflectionZ, result.minDeflectionZ);
        return [member?.label || result.memberId, member?.kind || result.kind, formatNumber(result.length, 2), formatNumber(shear, 2), formatNumber(moment, 2), deflection === null ? "—" : formatNumber(deflection * 1000, 3)];
      }))
    );
    resultsBox.hidden = false;
    errorBox.hidden = true;
    currentMode = "moment";
    updateViewButtons();
    drawInspector();
    renderDiagram();
    resultsBox.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest" });
  }

  async function runAnalysis() {
    if (!engineReady) {
      showToast("The analysis engine is not connected yet.");
      return;
    }
    const model = makeFrameModel();
    const originalText = "Run Analysis";
    runButton.disabled = true;
    runButton.textContent = "Analysing model…";
    errorBox.hidden = true;
    resultsBox.hidden = true;
    try {
      const response = await fetch("/api/structural/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ model }),
        cache: "no-store"
      });
      const data = await response.json();
      if (!response.ok || data.ok !== true) throw new Error(data.error || "The solver rejected this model.");
      renderResults(data);
      showToast("Analysis completed. The diagrams and tables are linked to this model revision.");
    } catch (error) {
      errorBox.textContent = "Analysis failed: " + error.message;
      errorBox.hidden = false;
      showToast("The model did not solve. See the analysis message for details.");
    } finally {
      runButton.disabled = !engineReady;
      runButton.innerHTML = originalText + ' <span>→</span>';
    }
  }

  function bindProjectSettings() {
    $("#workspaceSwitch").addEventListener("click", () => showToast("Workspace switching will be added with account and cloud support."));
    $("#profileMore").addEventListener("click", () => showToast("Profile settings are not connected in this prototype."));
    $("#statusButton").addEventListener("click", () => showToast("The current solver runs a linear-elastic frame analysis. Reinforced-concrete code design and reinforcement detailing are not connected."));
    const settingsDialog = $("#settingsDialog");
    $("#modelSettingsButton").addEventListener("click", () => {
      if (typeof settingsDialog.showModal === "function") settingsDialog.showModal();
      else showToast("Project settings require a modern browser.");
    });
    $("#closeSettings").addEventListener("click", () => settingsDialog.close());
    $("#cancelSettings").addEventListener("click", () => settingsDialog.close());
    settingsDialog.addEventListener("click", event => { if (event.target === settingsDialog) settingsDialog.close(); });
    $("#saveSettings").addEventListener("click", event => {
      event.preventDefault();
      const requestedLevels = Number($("#storeyCount").value);
      if (!Number.isInteger(requestedLevels) || requestedLevels < 2 || requestedLevels > 5) {
        showToast("Choose between 2 and 5 model levels including the base.");
        return;
      }
      const previous = Object.fromEntries(members.map(member => [member.id, {
        width: member.width, depth: member.depth, load: member.load
      }]));
      LEVELS = makeLevels(requestedLevels);
      members = makeDefaultMembers();
      members.forEach(member => {
        const old = previous[member.id];
        if (!old) return;
        member.width = old.width;
        member.depth = old.depth;
        member.load = old.load;
      });
      if (!members.some(member => member.id === selectedMemberId)) {
        selectedMemberId = members.find(member => member.kind === "beam")?.id || members[0]?.id || null;
      }
      persistMemberEdits();
      invalidateResults();
      drawInspector();
      updateLoadList();
      renderDiagram();
      settingsDialog.close();
      showToast("Frame rebuilt with " + LEVELS.length + " levels. Run analysis again for the updated geometry.");
    });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && settingsDialog.open) settingsDialog.close();
    });
  }

  restoreMemberEdits();
  drawInspector();
  updateLoadList();
  renderDiagram();
  $("#applyMemberChanges").addEventListener("click", applyMemberProperties);
  $("#resetMemberProperties").addEventListener("click", resetSelectedMember);
  $("#resetFrameModel").addEventListener("click", resetFrameModel);
  $("#runDemoAnalysis").addEventListener("click", runAnalysis);
  $$("[data-diagram-mode]").forEach(button => button.addEventListener("click", () => setDiagramMode(button.dataset.diagramMode)));
  bindProjectSettings();
  checkEngine();
})();