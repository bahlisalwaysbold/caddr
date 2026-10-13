(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const dialog = $("#newProjectDialog");
  const projectGrid = $("#projectGrid");
  const projectEmpty = $("#projectEmpty");
  const toast = $("#toast");
  let toastTimer;

  const showToast = (message) => {
    toast.textContent = message;
    toast.classList.add("visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 3200);
  };

  const openProjectDialog = () => {
    $("#newProjectForm").reset();
    if (typeof dialog.showModal === "function") dialog.showModal();
    else showToast("Your browser does not support the project dialog. Please use a modern browser.");
    window.setTimeout(() => $("#projectName").focus(), 30);
  };

  $("#newProjectButton").addEventListener("click", openProjectDialog);
  $("#closeProjectDialog").addEventListener("click", () => dialog.close());
  $("#cancelProjectButton").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });

  const countProjects = () => {
    const count = $$(".project-card", projectGrid).length;
    $("#projectNavCount").textContent = String(count);
  };

  const makeProjectCard = (name, type) => {
    const card = document.createElement("article");
    card.className = "project-card searchable user-project";
    card.dataset.search = (name + " " + type).toLowerCase();
    const preview = document.createElement("div");
    preview.className = "project-preview preview-residential";
    const tag = document.createElement("span");
    tag.className = "preview-tag";
    tag.textContent = type.toUpperCase();
    const drawing = document.createElement("svg");
    drawing.setAttribute("viewBox", "0 0 220 116");
    drawing.setAttribute("aria-hidden", "true");
    drawing.innerHTML = '<g fill="none" stroke="currentColor" stroke-width="1.4"><path d="M35 90V33l75-21 76 21v57M35 33l75 24 76-24M110 57v51M57 41v54M82 49v55M137 49v55M163 41v54M35 61l75 23 76-23M35 90l75 18 76-18"/><path d="M57 41 110 12 163 41M82 49l28-37 27 37" opacity=".5"/></g>';
    preview.append(tag, drawing);
    const body = document.createElement("div");
    body.className = "project-card-body";
    const titleRow = document.createElement("div");
    titleRow.className = "project-title-row";
    const title = document.createElement("h3");
    title.textContent = name;
    const status = document.createElement("span");
    status.className = "status status-blue";
    status.textContent = "New project";
    titleRow.append(title, status);
    const description = document.createElement("p");
    description.textContent = type + " · Set up your project brief";
    const meta = document.createElement("div");
    meta.className = "project-meta";
    const local = document.createElement("span");
    local.textContent = "Saved in this browser";
    meta.append(local);
    const link = document.createElement("a");
    link.className = "card-open";
    link.href = "structural.html";
    link.append(document.createTextNode("Open project "));
    const arrow = document.createElement("span");
    arrow.textContent = "→";
    link.append(arrow);
    body.append(titleRow, description, meta, link);
    card.append(preview, body);
    return card;
  };

  $("#newProjectForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const name = $("#projectName").value.trim();
    const type = $("#projectType").value;
    if (!name) {
      $("#projectName").focus();
      return;
    }
    projectGrid.prepend(makeProjectCard(name, type));
    dialog.close();
    countProjects();
    applySearch();
    showToast("Project added to this browser. Cloud sync is not connected yet.");
  });

  let activeSearch = "";
  const applySearch = () => {
    let visibleProjects = 0;
    $$(".searchable").forEach((item) => {
      const haystack = ((item.dataset.search || "") + " " + item.textContent).toLowerCase();
      const matches = !activeSearch || haystack.includes(activeSearch);
      item.hidden = !matches;
      if (matches && item.classList.contains("project-card")) visibleProjects++;
    });
    projectEmpty.hidden = visibleProjects > 0 || !activeSearch;
  };
  $("#globalSearch").addEventListener("input", (event) => {
    activeSearch = event.target.value.trim().toLowerCase();
    applySearch();
  });
  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      $("#globalSearch").focus();
    }
    if (event.key === "Escape" && dialog.open) dialog.close();
  });

  $("#viewAllProjects").addEventListener("click", () => {
    $("#projects").scrollIntoView({ behavior: "smooth", block: "start" });
    showToast("All visible projects are listed here. Use search to narrow the list.");
  });
  $("#importDrawingButton").addEventListener("click", () => $("#drawingUpload").click());
  $("#drawingUpload").addEventListener("change", (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    showToast(file.name + " selected. Open CAD Drafting to import supported DXF or .bahl files.");
    if (/\.(dxf|bahl|json)$/i.test(file.name)) {
      const shouldOpen = window.confirm("Open the CAD workspace to import this file? The file still needs to be selected in the CAD import dialog.");
      if (shouldOpen) window.location.href = "cad.html";
    } else {
      showToast("That file type is not supported by the current prototype. Try DXF, .bahl or JSON.");
    }
    event.target.value = "";
  });
  $("#notificationsButton").addEventListener("click", () => showToast("You’re all caught up. Project notifications are not connected yet."));
  $("#workspaceSwitch").addEventListener("click", () => showToast("Workspace switching will be added with account and cloud support."));
  $("#profileMore").addEventListener("click", () => showToast("Profile settings are not connected in this prototype."));
  $$(".card-more").forEach(button => button.addEventListener("click", () => showToast("Project actions will be connected when project storage is added.")));
  countProjects();
})();