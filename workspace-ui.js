(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const shell = $("#engineeringWorkspace");
  if (!shell) return;

  const source = $(".structural-main-grid");
  const slots = {
    model: $("#workspacePanelModel"),
    loads: $("#workspacePanelLoads"),
    analysis: $("#workspacePanelAnalysis"),
    design: $("#workspacePanelDesign"),
    drawings: $("#workspacePanelDrawings")
  };
  const model = source && $("#model", source);
  const loads = source && $("#loads", source);
  const analysis = source && $("#analysis", source);
  const design = source && $("#design", source);
  const detailing = source && $("#detailing", source);
  const quantities = source && $("#quantities", source);
  const budgeting = source && $("#budgeting", source);

  // Move the existing live sections; never clone the model or its controls.
  if (model && slots.model) slots.model.append(model);
  if (loads && slots.loads) slots.loads.append(loads);
  if (analysis && slots.analysis) slots.analysis.append(analysis);
  if (design && quantities && budgeting && $("#workspaceDesignGrid")) {
    $("#workspaceDesignGrid").append(design, quantities, budgeting);
  }
  if (detailing && slots.drawings) slots.drawings.append(detailing);
  if (source) source.remove();

  const STORE_KEY = "caddr.structural-workspace-ui.v1";
  const CHAT_KEY = "caddr.project-conversation.residential-block-a.v1";
  const svg = $("#structuralDiagram");
  const chatMessages = $("#conversationMessages");
  const chatForm = $("#conversationForm");
  const chatInput = $("#conversationInput");
  const initialViewBox = { x: 0, y: 0, w: 720, h: 390 };
  let camera = { ...initialViewBox };
  let activeTab = "model";
  let activeStorey = "full-frame";
  let pendingProposal = null;
  let spacePressed = false;
  let panning = null;
  let suppressClick = false;
  let fallbackFullscreen = false;
  let history = [];
  let groupOpen = { storeys: true, beams: true, columns: true, structure: true, drawings: true };

  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    if (saved && typeof saved === "object") {
      if (typeof saved.explorerCollapsed === "boolean") shell.classList.toggle("explorer-collapsed", saved.explorerCollapsed);
      if (typeof saved.conversationCollapsed === "boolean") shell.classList.toggle("conversation-collapsed", saved.conversationCollapsed);
      if (typeof saved.activeTab === "string" && slots[saved.activeTab]) activeTab = saved.activeTab;
      if (saved.camera && ["x", "y", "w", "h"].every(k => Number.isFinite(saved.camera[k]))) {
        camera = { x: saved.camera.x, y: saved.camera.y, w: Math.max(80, saved.camera.w), h: Math.max(45, saved.camera.h) };
      }
      if (saved.groupOpen && typeof saved.groupOpen === "object") groupOpen = { ...groupOpen, ...saved.groupOpen };
      if (typeof saved.activeStorey === "string") activeStorey = saved.activeStorey;
    }
  } catch (_) { /* Continue with session defaults if local storage is unavailable. */ }
  try {
    const savedChat = JSON.parse(localStorage.getItem(CHAT_KEY) || "[]");
    if (Array.isArray(savedChat)) history = savedChat.filter(item => item && ["user", "assistant"].includes(item.role) && typeof item.text === "string").slice(-80);
  } catch (_) { history = []; }

  function saveWorkspaceState() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        explorerCollapsed: shell.classList.contains("explorer-collapsed"),
        conversationCollapsed: shell.classList.contains("conversation-collapsed"),
        activeTab,
        camera,
        activeStorey,
        groupOpen
      }));
    } catch (_) { /* Panel controls remain functional without persistence. */ }
  }

  function persistChat() {
    try { localStorage.setItem(CHAT_KEY, JSON.stringify(history.slice(-80))); } catch (_) {}
  }

  function setTab(name, shouldSave = true) {
    if (!slots[name]) return;
    activeTab = name;
    Object.entries(slots).forEach(([key, panel]) => {
      if (!panel) return;
      panel.hidden = key !== name;
      panel.classList.toggle("is-active", key === name);
    });
    $$("[data-workspace-tab]").forEach(button => {
      const active = button.dataset.workspaceTab === name;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    });
    const names = { model: "Model", loads: "Loads", analysis: "Analysis", design: "Design", drawings: "Drawings" };
    $("#workspaceViewLabel").textContent = names[name] || "Model";
    $("#workspaceSubtoolbar").classList.toggle("model-tools-visible", name === "model");
    syncContext();
    if (shouldSave) saveWorkspaceState();
  }

  function setCollapsed(which, collapsed) {
    const className = which === "explorer" ? "explorer-collapsed" : "conversation-collapsed";
    shell.classList.toggle(className, collapsed);
    const control = $("#toggle" + (which === "explorer" ? "Explorer" : "Conversation"));
    const inside = $("#" + (which === "explorer" ? "explorerCollapse" : "conversationCollapse"));
    [control, inside].filter(Boolean).forEach(button => {
      button.setAttribute("aria-pressed", String(!collapsed));
      button.setAttribute("aria-expanded", String(!collapsed));
      button.title = collapsed ? "Show " + (which === "explorer" ? "Project Explorer" : "Project conversation") : "Hide " + (which === "explorer" ? "Project Explorer" : "Project conversation");
    });
    if (control) control.textContent = collapsed ? (which === "explorer" ? "☷ Explorer" : "▤ Conversation") : (which === "explorer" ? "◂ Explorer" : "Conversation ▸");
    saveWorkspaceState();
    window.requestAnimationFrame(() => { if (svg) svg.setAttribute("preserveAspectRatio", "xMidYMid meet"); });
  }

  function currentMember() {
    return {
      title: ($("#selectedMemberTitle")?.textContent || "No member selected").trim(),
      id: ($("#selectedMemberSubtitle")?.textContent || "").trim(),
      kind: ($("#selectedMemberType")?.textContent || "").trim().toLowerCase(),
      width: Number($("#memberWidth")?.value),
      depth: Number($("#memberDepth")?.value),
      load: Number($("#memberLoad")?.value)
    };
  }

  function projectContext() {
    const member = currentMember();
    const count = ($("#modelCountLabel")?.textContent || "Frame model").trim();
    const levelInfo = ($("#modelLevelSummary")?.textContent || "Levels not specified").trim();
    const selected = member.id ? member.title + " (" + member.id + ")" : "No member selected";
    const storey = activeStorey === "full-frame" ? "Full frame" : activeStorey;
    return { member, count, levelInfo, selected, storey };
  }

  function syncContext() {
    const ctx = projectContext();
    $("#workspaceContextLabel").textContent = ctx.selected + "  ·  " + ctx.count;
    $("#conversationContext").textContent = "Residential Block A  ·  " + (ctx.storey === "Full frame" ? ctx.levelInfo : ctx.storey) + (ctx.member.id ? "  ·  " + ctx.member.title : "");
    $$(".explorer-row[data-member-id]").forEach(row => {
      const selected = row.dataset.memberId === ctx.member.id;
      row.classList.toggle("selected", selected);
      row.setAttribute("aria-current", selected ? "true" : "false");
    });
    $$(".explorer-row[data-storey]").forEach(row => {
      const selected = row.dataset.storey === activeStorey;
      row.classList.toggle("selected", selected);
      row.setAttribute("aria-current", selected ? "true" : "false");
    });
  }

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function addExplorerGroup(parent, key, title, count) {
    const details = document.createElement("details");
    details.className = "explorer-group";
    details.open = Boolean(groupOpen[key]);
    const summary = document.createElement("summary");
    summary.append(node("span", "tree-caret", "›"), node("span", "tree-group-title", title), node("span", "tree-count", String(count)));
    details.append(summary);
    details.addEventListener("toggle", () => {
      groupOpen[key] = details.open;
      const caret = $(".tree-caret", summary);
      if (caret) caret.textContent = details.open ? "⌄" : "›";
      saveWorkspaceState();
    });
    const caret = $(".tree-caret", summary);
    if (caret) caret.textContent = details.open ? "⌄" : "›";
    parent.append(details);
    return details;
  }

  function addExplorerRow(parent, label, icon, action, attributes = {}) {
    const button = node("button", "explorer-row");
    button.type = "button";
    button.append(node("span", "tree-icon", icon), node("span", "tree-row-label", label));
    Object.entries(attributes).forEach(([key, value]) => { button.dataset[key] = value; });
    if (action) button.addEventListener("click", action);
    else {
      button.disabled = true;
      button.classList.add("planned-row");
      button.title = "This element type is not present in the current demonstration frame.";
    }
    parent.append(button);
    return button;
  }

  function targetLabel(target) {
    return (target.getAttribute("aria-label") || target.dataset.memberId || "Structural member").replace(/^Select\s+/i, "");
  }

  function selectMemberFromExplorer(target) {
    setTab("model");
    if (target) target.click();
    syncContext();
  }

  function renderExplorer() {
    const tree = $("#explorerTree");
    if (!tree || !svg) return;
    tree.replaceChildren();
    const projectRoot = node("div", "explorer-project-root");
    projectRoot.append(node("span", "explorer-project-icon", "⌂"));
    const rootCopy = node("span", "explorer-project-copy");
    rootCopy.append(node("strong", "", "Residential Block A"), node("small", "", "Reinforced concrete frame"));
    projectRoot.append(rootCopy, node("span", "explorer-root-dot", "●"));
    tree.append(projectRoot);

    const levelCount = Math.max(2, Math.min(5, Number($("#storeyCount")?.value) || 3));
    const storeyGroup = addExplorerGroup(tree, "storeys", "Storeys", levelCount);
    addExplorerRow(storeyGroup, "Foundation / Ground", "⌂", () => {
      activeStorey = "Foundation / Ground";
      syncContext();
      saveWorkspaceState();
    }, { storey: "Foundation / Ground" });
    for (let level = 1; level < levelCount; level++) {
      const label = "Level " + level + " · +" + (level * 3.3).toFixed(1) + " m";
      addExplorerRow(storeyGroup, label, "↕", () => {
        activeStorey = label;
        syncContext();
        saveWorkspaceState();
      }, { storey: label });
    }

    const targets = $$(".member-hit-target[data-member-id]", svg).map(target => ({
      target,
      id: target.dataset.memberId || "",
      label: targetLabel(target),
      kind: (target.dataset.memberId || "").startsWith("BEAM_") ? "beam" : "column"
    }));
    const structures = addExplorerGroup(tree, "structure", "Structural elements", targets.length);
    const beams = targets.filter(item => item.kind === "beam").sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    const columns = targets.filter(item => item.kind === "column").sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    const beamGroup = addExplorerGroup(structures, "beams", "Beams", beams.length);
    beams.forEach(item => addExplorerRow(beamGroup, item.label, "━", () => selectMemberFromExplorer(item.target), { memberId: item.id }));
    const columnGroup = addExplorerGroup(structures, "columns", "Columns", columns.length);
    columns.forEach(item => addExplorerRow(columnGroup, item.label, "┃", () => selectMemberFromExplorer(item.target), { memberId: item.id }));
    addExplorerRow(structures, "Slabs · not modelled", "▱", null, { placeholder: "slabs" });
    addExplorerRow(structures, "Foundations · not modelled", "⌂", null, { placeholder: "foundations" });

    const drawings = addExplorerGroup(tree, "drawings", "Drawings & files", 1);
    addExplorerRow(drawings, "Open CAD drafting", "⌗", () => { window.location.href = "cad.html"; });
    syncContext();
  }

  function applyCamera() {
    if (!svg) return;
    svg.setAttribute("viewBox", [camera.x, camera.y, camera.w, camera.h].map(value => Number(value.toFixed(3))).join(" "));
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    saveWorkspaceState();
  }

  function fitCamera() {
    camera = { ...initialViewBox };
    applyCamera();
  }

  function zoomCamera(factor, clientX, clientY) {
    if (!svg || activeTab !== "model") return;
    const rect = svg.getBoundingClientRect();
    const px = Math.min(1, Math.max(0, (clientX - rect.left) / Math.max(rect.width, 1)));
    const py = Math.min(1, Math.max(0, (clientY - rect.top) / Math.max(rect.height, 1)));
    const newW = Math.max(100, Math.min(1400, camera.w * factor));
    const newH = newW * initialViewBox.h / initialViewBox.w;
    const anchorX = camera.x + px * camera.w;
    const anchorY = camera.y + py * camera.h;
    camera = { x: anchorX - px * newW, y: anchorY - py * newH, w: newW, h: newH };
    applyCamera();
  }

  function getViewPoint(clientX, clientY) {
    const rect = svg.getBoundingClientRect();
    return {
      x: camera.x + ((clientX - rect.left) / Math.max(rect.width, 1)) * camera.w,
      y: camera.y + ((clientY - rect.top) / Math.max(rect.height, 1)) * camera.h
    };
  }

  function bindModelNavigation() {
    if (!svg) return;
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    applyCamera();
    svg.addEventListener("wheel", event => {
      if (activeTab !== "model") return;
      event.preventDefault();
      zoomCamera(event.deltaY < 0 ? 0.86 : 1.16, event.clientX, event.clientY);
    }, { passive: false });
    svg.addEventListener("pointerdown", event => {
      const panGesture = event.button === 1 || (event.button === 0 && spacePressed);
      if (!panGesture || activeTab !== "model") return;
      event.preventDefault();
      event.stopPropagation();
      panning = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: camera.x, startY: camera.y, moved: false };
      try { svg.setPointerCapture(event.pointerId); } catch (_) {}
      svg.classList.add("is-panning");
    });
    svg.addEventListener("pointermove", event => {
      if (!panning || event.pointerId !== panning.id) return;
      const rect = svg.getBoundingClientRect();
      const dx = (event.clientX - panning.x) * camera.w / Math.max(rect.width, 1);
      const dy = (event.clientY - panning.y) * camera.h / Math.max(rect.height, 1);
      if (Math.abs(dx) + Math.abs(dy) > 1) panning.moved = true;
      camera.x = panning.startX - dx;
      camera.y = panning.startY - dy;
      svg.setAttribute("viewBox", [camera.x, camera.y, camera.w, camera.h].join(" "));
    });
    const endPan = event => {
      if (!panning || (event.pointerId !== undefined && event.pointerId !== panning.id)) return;
      if (panning.moved) {
        suppressClick = true;
        window.setTimeout(() => { suppressClick = false; }, 0);
        saveWorkspaceState();
      }
      panning = null;
      svg.classList.remove("is-panning");
    };
    svg.addEventListener("pointerup", endPan);
    svg.addEventListener("pointercancel", endPan);
    svg.addEventListener("lostpointercapture", endPan);
    svg.addEventListener("click", event => {
      if (!suppressClick) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);

    document.addEventListener("keydown", event => {
      const tag = event.target && event.target.tagName;
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(tag) || (event.target && event.target.isContentEditable);
      if (event.code === "Space" && !typing) { spacePressed = true; event.preventDefault(); }
      if (event.key === "Escape" && fallbackFullscreen) exitFullscreen();
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "f") {
        event.preventDefault();
        toggleFullscreen();
      }
    });
    document.addEventListener("keyup", event => { if (event.code === "Space") spacePressed = false; });
    window.addEventListener("blur", () => { spacePressed = false; panning = null; svg.classList.remove("is-panning"); });
    $("#workspaceZoomIn").addEventListener("click", () => zoomCamera(0.82, svg.getBoundingClientRect().left + svg.getBoundingClientRect().width / 2, svg.getBoundingClientRect().top + svg.getBoundingClientRect().height / 2));
    $("#workspaceZoomOut").addEventListener("click", () => zoomCamera(1.22, svg.getBoundingClientRect().left + svg.getBoundingClientRect().width / 2, svg.getBoundingClientRect().top + svg.getBoundingClientRect().height / 2));
    $("#workspaceFitModel").addEventListener("click", fitCamera);
  }

  function syncChatContext() {
    const ctx = projectContext();
    $("#conversationContext").textContent = "Residential Block A  ·  " + (ctx.storey === "full-frame" ? ctx.levelInfo : ctx.storey) + (ctx.member.id ? "  ·  " + ctx.member.title : "");
  }

  function renderMessage(item) {
    const wrapper = node("article", "conversation-message " + (item.role === "user" ? "from-user" : "from-project"));
    const head = node("div", "message-head", item.role === "user" ? "You" : "Project notes");
    const body = node("div", "message-body", item.text);
    wrapper.append(head, body);
    chatMessages.append(wrapper);
    return wrapper;
  }

  function addMessage(role, text, persist = true) {
    const entry = { role, text, time: Date.now() };
    history.push(entry);
    history = history.slice(-80);
    renderMessage(entry);
    if (persist) persistChat();
    chatMessages.scrollTop = chatMessages.scrollHeight;
    syncChatContext();
  }

  function addProposalCard(proposal, parent) {
    const card = node("div", "proposal-card");
    card.append(node("div", "proposal-kicker", "REVIEW PROPOSED CHANGE"));
    card.append(node("div", "proposal-summary", proposal.description));
    const caution = node("div", "proposal-help", "This will update the selected member using the existing editor and clear the previous analysis results.");
    card.append(caution);
    const actions = node("div", "proposal-actions");
    const apply = node("button", "conversation-send", "Apply change");
    apply.type = "button";
    const cancel = node("button", "conversation-cancel", "Cancel");
    cancel.type = "button";
    apply.addEventListener("click", () => {
      if (!pendingProposal) return;
      const latest = currentMember();
      if (latest.id !== pendingProposal.memberId) {
        pendingProposal = null;
        card.remove();
        addMessage("assistant", "The selection changed before the proposal was applied. Select the intended member and ask again.");
        return;
      }
      const field = pendingProposal.field === "load" ? $("#memberLoad") : pendingProposal.field === "width" ? $("#memberWidth") : $("#memberDepth");
      if (!field || !Number.isFinite(pendingProposal.value)) return;
      field.value = String(pendingProposal.value);
      $("#applyMemberChanges").click();
      pendingProposal = null;
      card.remove();
      addMessage("assistant", "Change submitted through the existing member editor. Previous analysis results have been cleared; run Analysis again to recalculate the updated frame.");
      renderExplorer();
    });
    cancel.addEventListener("click", () => {
      pendingProposal = null;
      card.remove();
      addMessage("assistant", "Proposal cancelled. The model has not been changed.");
    });
    actions.append(apply, cancel);
    card.append(actions);
    parent.append(card);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function liveTargets() {
    return $$(".member-hit-target[data-member-id]", svg).map(target => ({
      target, id: target.dataset.memberId || "", label: targetLabel(target),
      kind: (target.dataset.memberId || "").startsWith("BEAM_") ? "beam" : "column"
    }));
  }

  function resolveMention(text) {
    const normalized = text.toLowerCase();
    const explicit = normalized.match(/\b(beam|column)\s+([a-z]\d*|[a-z])(?:\s*(?:at|,)?\s*(?:level|l)\s*(\d+))?\b/i);
    if (!explicit) return { status: "current" };
    const kind = explicit[1].toLowerCase();
    const label = explicit[2].toUpperCase();
    const level = explicit[3] ? Number(explicit[3]) : null;
    const matches = liveTargets().filter(item => {
      if (item.kind !== kind) return false;
      const labelMatch = item.label.toUpperCase().includes(kind.toUpperCase() + " " + label) || item.id.toUpperCase().includes(label);
      if (!labelMatch) return false;
      if (level === null) return true;
      if (kind === "column" && level === 0) return item.label.toLowerCase().includes("foundation");
      return item.label.toLowerCase().includes("level " + level);
    });
    if (matches.length === 1) {
      matches[0].target.click();
      return { status: "selected", item: matches[0] };
    }
    if (matches.length > 1) return { status: "ambiguous", label: kind + " " + label, matches };
    return { status: "not-found", label: kind + " " + label };
  }

  function proposeChange(text) {
    const fieldMatch = text.match(/\b(width|depth|line\s*load|load)\b[\s\S]{0,40}?(?:\bto\b|\bat\b|=)?\s*(-?\d+(?:\.\d+)?)/i)
      || text.match(/\b(set|change|make|update)\b\s+(width|depth|load)\s+(-?\d+(?:\.\d+)?)/i);
    if (!fieldMatch) return false;
    let fieldName, valueText;
    if (fieldMatch[1] && /^(width|depth|line\s*load|load)$/i.test(fieldMatch[1])) {
      fieldName = fieldMatch[1].toLowerCase().replace(/\s+/g, "");
      valueText = fieldMatch[2];
    } else {
      fieldName = fieldMatch[2].toLowerCase();
      valueText = fieldMatch[3];
    }
    const hasIntent = /\b(change|set|make|update|increase|reduce|change the|please)\b/i.test(text);
    if (!hasIntent) return false;
    fieldName = fieldName.includes("load") ? "load" : fieldName;
    const value = Number(valueText);
    const mention = resolveMention(text);
    if (mention.status === "ambiguous") {
      addMessage("assistant", "I found more than one " + mention.label + ". Please identify the storey (for example, “beam B1 level 2”) before requesting a change.");
      return true;
    }
    if (mention.status === "not-found") {
      addMessage("assistant", "I couldn't find " + mention.label + " in the current demonstration frame. Choose an element from Project Explorer and try again.");
      return true;
    }
    const member = currentMember();
    if (!member.id || member.title === "No member selected") {
      addMessage("assistant", "Select a beam or column in Project Explorer first, then request a width, depth or supported beam-load change.");
      return true;
    }
    if (fieldName === "load" && member.kind !== "beam") {
      addMessage("assistant", "The current prototype only supports entered line loads on beams. I haven't changed the model.");
      return true;
    }
    const input = fieldName === "load" ? $("#memberLoad") : fieldName === "width" ? $("#memberWidth") : $("#memberDepth");
    const min = Number(input.min), max = Number(input.max);
    if (!Number.isFinite(value) || value < min || value > max) {
      addMessage("assistant", "That value is outside the current editor range (" + min + " to " + max + "). Nothing was changed.");
      return true;
    }
    pendingProposal = {
      memberId: member.id,
      field: fieldName,
      value,
      description: member.title + " · " + (fieldName === "load" ? "line load" : "section " + fieldName) + ": " + (fieldName === "load" ? member.load + " → " + value + " kN/m" : member[fieldName] + " → " + value + " mm")
    };
    addMessage("assistant", "I prepared a change for the currently selected element. Review it and approve it below; the model will not change until you choose Apply change.");
    const parent = chatMessages.lastElementChild;
    addProposalCard(pendingProposal, parent);
    return true;
  }

  function interpretRequest(rawText) {
    const text = rawText.trim();
    if (!text) return;
    addMessage("user", text);
    if (proposeChange(text)) return;
    const lower = text.toLowerCase();
    const ctx = projectContext();

    if (/\b(run|start|perform|calculate)\b.*\banalysis\b|\banalysis now\b/.test(lower)) {
      setTab("analysis");
      $("#runDemoAnalysis").click();
      addMessage("assistant", "I started the existing frame analysis for the current model revision. Check the Analysis tab for the solver response and results.");
      return;
    }
    if (/\b(moment|bending)\b/.test(lower) && /\b(show|view|diagram|plot|display)\b/.test(lower)) {
      setTab("model");
      const button = $('[data-diagram-mode="moment"]');
      button.click();
      addMessage("assistant", $("#analysisResults").hidden ? "I switched to the bending-moment view control. Run Analysis first if no result diagram is available." : "The model is now showing the bending-moment results from the latest solver response.");
      return;
    }
    if (/\bshear\b/.test(lower) && /\b(show|view|diagram|plot|display)\b/.test(lower)) {
      setTab("model");
      $('[data-diagram-mode="shear"]').click();
      addMessage("assistant", $("#analysisResults").hidden ? "I switched to the shear view control. Run Analysis first if no result diagram is available." : "The model is now showing shear results from the latest solver response.");
      return;
    }
    if (/\b(deflection|displacement)\b/.test(lower) && /\b(show|view|diagram|plot|display)\b/.test(lower)) {
      setTab("model");
      $('[data-diagram-mode="deflection"]').click();
      addMessage("assistant", $("#analysisResults").hidden ? "I switched to the deflection view control. Run Analysis first if no result diagram is available." : "The model is now showing deflection results from the latest solver response.");
      return;
    }
    const mentionOnly = resolveMention(text);
    if (mentionOnly.status === "ambiguous") {
      addMessage("assistant", "Several elements match " + mentionOnly.label + ". Please specify its level so I can select the right member.");
      return;
    }
    if (mentionOnly.status === "not-found") {
      addMessage("assistant", "I couldn't find " + mentionOnly.label + " in this demonstration frame. The Explorer lists the currently modelled beams and columns.");
      return;
    }
    if (/\b(beams?|columns?|members?|storeys?|levels?)\b/.test(lower) && /\b(how many|count|number|summari[sz]e|overview|model size|model summary)\b/.test(lower) || /\b(summari[sz]e the current model|model summary|model overview)\b/.test(lower)) {
      const items = liveTargets();
      const nBeam = items.filter(item => item.kind === "beam").length;
      const nCol = items.filter(item => item.kind === "column").length;
      const nLevels = Math.max(2, Math.min(5, Number($("#storeyCount")?.value) || 3));
      addMessage("assistant", "Current model: " + nLevels + " levels including the base, " + nBeam + " beams and " + nCol + " columns (" + items.length + " frame members total). Slabs and foundations are visible as planned categories in the Explorer but are not modelled in this frame yet.");
      return;
    }
    if (/\bwhat (is|are) (the )?(selected|current) (member|element|section|properties)\b|\bselected member\b|\bsection properties\b/.test(lower)) {
      const area = ($("#sectionArea")?.textContent || "not available").trim();
      const inertia = ($("#sectionInertia")?.textContent || "not available").trim();
      addMessage("assistant", ctx.member.title + " (" + (ctx.member.id || "no member ID") + "): width " + (Number.isFinite(ctx.member.width) ? ctx.member.width + " mm" : "—") + ", depth " + (Number.isFinite(ctx.member.depth) ? ctx.member.depth + " mm" : "—") + (ctx.member.kind === "beam" ? ", entered downward line load " + ctx.member.load + " kN/m" : "") + ". Rectangular section area: " + area + "; displayed inertia: " + inertia + ". These are geometry properties, not a design-code capacity check.");
      return;
    }
    if (/\b(show|open|go to|switch to)\b.*\b(loads?)\b/.test(lower)) {
      setTab("loads");
      addMessage("assistant", "The Loads tab is open. Its editable beam rows use the same member data as the model.");
      return;
    }
    if (/\b(show|open|go to|switch to)\b.*\b(drawings?|cad)\b/.test(lower)) {
      setTab("drawings");
      addMessage("assistant", "The Drawings tab shows the current drawing handoff. Open CAD drafting to work in the existing separate CAD editor; automatic structural-model-to-drawing generation is not connected yet.");
      return;
    }
    if (/\b(peak moment|maximum moment|results|latest analysis|peak shear|deflection result)\b/.test(lower)) {
      if ($("#analysisResults").hidden) {
        addMessage("assistant", "There are no current solver results to report. Open Analysis and run the current frame first.");
      } else {
        setTab("analysis");
        addMessage("assistant", "Latest solver results for the current analysed revision:\n" + ($("#analysisSummary")?.innerText || "").replace(/\n{2,}/g, "\n").trim() + "\nThese results describe the defined linear-elastic demonstration frame, not a certified building design.");
      }
      return;
    }
    if (/\b(hello|hi|hey|help|what can you do|commands|capabilities)\b/.test(lower)) {
      addMessage("assistant", "I can read the current frame and selected member, summarise model counts and section dimensions, open Loads/Drawings views, switch to moment/shear/deflection plots when results exist, start the existing analysis, and propose width/depth/beam-line-load changes for your approval. I won't apply proposed edits without your confirmation.");
      return;
    }
    addMessage("assistant", "I have the current project context (" + ctx.count + "; " + ctx.selected + "). I can answer about visible frame members and their current dimensions, switch the existing model/result views, open Loads or Drawings, run the supported frame analysis, or prepare an approval-gated change to a selected member's width, depth or beam line load. That request isn't supported as a model operation yet, so I haven't changed anything.");
  }

  function setupConversation() {
    chatMessages.replaceChildren();
    if (!history.length) {
      history = [{
        role: "assistant",
        text: "This conversation is connected to the current project frame. Ask about the selected member, model counts or latest analysis. Supported member edits will be proposed for your approval before they are applied."
      }];
      persistChat();
    }
    history.forEach(renderMessage);
    $("#conversationForm").addEventListener("submit", event => {
      event.preventDefault();
      const text = chatInput.value;
      chatInput.value = "";
      interpretRequest(text);
    });
    $("#conversationInput").addEventListener("keydown", event => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        chatForm.requestSubmit();
      }
    });
    $$(".conversation-suggestion").forEach(button => button.addEventListener("click", () => {
      chatInput.value = button.dataset.prompt || button.textContent.trim();
      chatForm.requestSubmit();
    }));
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function updateFullscreenButton() {
    const active = document.fullscreenElement === shell || fallbackFullscreen;
    $("#toggleWorkspaceFullscreen").textContent = active ? "⛶ Exit full screen" : "⛶ Full screen";
    $("#toggleWorkspaceFullscreen").setAttribute("aria-pressed", String(active));
    $("#toggleWorkspaceFullscreen").title = active ? "Exit full screen (Esc)" : "Expand the model workspace to full screen";
    shell.classList.toggle("is-fullscreen", active);
  }

  async function enterFullscreen() {
    if (document.fullscreenElement === shell || fallbackFullscreen) return;
    if (typeof shell.requestFullscreen === "function") {
      try {
        await shell.requestFullscreen({ navigationUI: "hide" });
        return;
      } catch (_) { /* Fall back to an in-page full-window workspace. */ }
    }
    fallbackFullscreen = true;
    shell.classList.add("workspace-fullscreen-fallback");
    updateFullscreenButton();
  }

  async function exitFullscreen() {
    if (fallbackFullscreen) {
      fallbackFullscreen = false;
      shell.classList.remove("workspace-fullscreen-fallback");
      updateFullscreenButton();
      return;
    }
    if (document.fullscreenElement === shell && document.exitFullscreen) {
      try { await document.exitFullscreen(); } catch (_) {}
    }
  }

  function toggleFullscreen() {
    if (document.fullscreenElement === shell || fallbackFullscreen) exitFullscreen();
    else enterFullscreen();
  }

  function bindWorkspaceControls() {
    $$("[data-workspace-tab]").forEach(button => {
      button.addEventListener("click", () => setTab(button.dataset.workspaceTab));
      button.addEventListener("keydown", event => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const tabs = $$("[data-workspace-tab]");
        let index = tabs.indexOf(button);
        if (event.key === "Home") index = 0;
        else if (event.key === "End") index = tabs.length - 1;
        else index = (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
        tabs[index].focus();
        setTab(tabs[index].dataset.workspaceTab);
      });
    });
    $("#toggleExplorer").addEventListener("click", () => setCollapsed("explorer", !shell.classList.contains("explorer-collapsed")));
    $("#explorerCollapse").addEventListener("click", () => setCollapsed("explorer", true));
    $("#toggleConversation").addEventListener("click", () => setCollapsed("conversation", !shell.classList.contains("conversation-collapsed")));
    $("#conversationCollapse").addEventListener("click", () => setCollapsed("conversation", true));
    $("#toggleWorkspaceFullscreen").addEventListener("click", toggleFullscreen);
    $("#openCADWorkspace").addEventListener("click", () => { window.location.href = "cad.html"; });
    document.addEventListener("fullscreenchange", updateFullscreenButton);
    document.addEventListener("fullscreenerror", () => {
      addMessage("assistant", "The browser could not enter native full-screen mode. Use the workspace full-screen button again to try the supported full-window fallback.");
    });
    $("#saveSettings").addEventListener("click", () => window.setTimeout(renderExplorer, 0));

  }

  function syncExplorerSelection() {
    syncContext();
  }

  bindWorkspaceControls();
  bindModelNavigation();
  $("#explorerSearch").addEventListener("input", event => {
    const query = event.target.value.trim().toLowerCase();
    $(".explorer-row", $("#explorerTree")).forEach(row => {
      row.hidden = Boolean(query) && !row.textContent.toLowerCase().includes(query);
    });
    $(".explorer-group", $("#explorerTree")).forEach(group => {
      const matchingRows = $(".explorer-row", group).filter(row => !row.hidden).length;
      group.hidden = Boolean(query) && matchingRows === 0;
      if (query && matchingRows) group.open = true;
      else if (!query) {
        const summaryText = $(".tree-group-title", group)?.textContent || "";
        const key = summaryText.toLowerCase().includes("storey") ? "storeys" :
          summaryText.toLowerCase() === "beams" ? "beams" :
          summaryText.toLowerCase() === "columns" ? "columns" :
          summaryText.toLowerCase().includes("structural") ? "structure" : "drawings";
        group.open = Boolean(groupOpen[key]);
      }
    });
  });
  setupConversation();
  renderExplorer();
  setTab(activeTab, false);
  setCollapsed("explorer", shell.classList.contains("explorer-collapsed"));
  setCollapsed("conversation", shell.classList.contains("conversation-collapsed"));
  if (svg && typeof MutationObserver === "function") {
    const observer = new MutationObserver(syncExplorerSelection);
    observer.observe(svg, { childList: true, subtree: false });
  }
  window.addEventListener("resize", () => {
    if (svg) svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  });
  updateFullscreenButton();
})();