(() => {
  const $ = (selector) => document.querySelector(selector);
  const toast = $("#toast");
  let timer;
  const showToast = (message) => {
    toast.textContent = message;
    toast.classList.add("visible");
    window.clearTimeout(timer);
    timer = window.setTimeout(() => toast.classList.remove("visible"), 3300);
  };

  document.querySelectorAll("[data-not-ready]").forEach((button) => {
    button.addEventListener("click", () => showToast(button.dataset.notReady || "This workflow is planned but not connected yet."));
  });
  $("#workspaceSwitch").addEventListener("click", () => showToast("Workspace switching will be added with account and cloud support."));
  $("#profileMore").addEventListener("click", () => showToast("Profile settings are not connected in this prototype."));
  $("#statusButton").addEventListener("click", () => showToast("This is a concept preview. No structural analysis or member design has been executed."));

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
    $(".summary-card:nth-child(2) > strong").innerHTML = storeys.replace(" storeys", "") + ' <small>levels</small>';
    $(".summary-card:nth-child(2) > small").textContent = "Prototype setup only — not analysed";
    settingsDialog.close();
    showToast("Preview settings updated in this page only. No structural results were calculated.");
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
})();