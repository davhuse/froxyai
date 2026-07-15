(() => {
  "use strict";
  const $ = (selector, parent = document) => parent.querySelector(selector);
  const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
  const sidebar = $("#admin-sidebar");
  const backdrop = $("#admin-backdrop");
  const menu = $("#admin-menu");
  const close = $("#admin-close");
  const navItems = $$(".admin-nav-item");
  const views = $$(".admin-view");
  const title = $("#admin-page-title");
  const toast = $("#admin-toast");
  let toastTimer;

  const names = { overview: "Genel bakış", users: "Kullanıcılar", models: "Modeller", credits: "Krediler", system: "Sistem sağlığı" };
  const showToast = (message) => { window.clearTimeout(toastTimer); toast.textContent = message; toast.classList.add("is-visible"); toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2600); };
  const closeSidebar = () => { sidebar.classList.remove("is-open"); backdrop.classList.remove("is-open"); };
  const showView = (name) => { views.forEach((view) => view.classList.toggle("is-hidden", view.id !== `${name}-view`)); navItems.forEach((item) => item.classList.toggle("is-active", item.dataset.adminView === name)); title.textContent = names[name]; closeSidebar(); window.scrollTo({ top: 0, behavior: "smooth" }); };

  navItems.forEach((item) => item.addEventListener("click", () => showView(item.dataset.adminView)));
  $$("[data-admin-view]:not(.admin-nav-item)").forEach((button) => button.addEventListener("click", () => showView(button.dataset.adminView)));
  menu.addEventListener("click", () => { sidebar.classList.add("is-open"); backdrop.classList.add("is-open"); });
  close.addEventListener("click", closeSidebar); backdrop.addEventListener("click", closeSidebar);

  $$(".model-switch").forEach((toggle) => toggle.addEventListener("click", () => { const enabled = !toggle.classList.contains("is-on"); toggle.classList.toggle("is-on", enabled); toggle.setAttribute("aria-checked", String(enabled)); showToast(`${toggle.dataset.modelName} ${enabled ? "etkinleştirildi" : "duraklatıldı"}.`); }));
  $$(".model-config").forEach((button) => button.addEventListener("click", () => showToast(`${button.dataset.modelConfig} ayarları prototipte açılmaya hazır.`)));
  $$("[data-credit-action]").forEach((button) => button.addEventListener("click", () => showToast(`${button.dataset.creditAction} işlemi prototipte başlatıldı.`)));
  $("#add-credit").addEventListener("click", () => showToast("Kredi ekleme ekranı prototipte açılmaya hazır."));
  $("#invite-user").addEventListener("click", () => showToast("Kullanıcı davet akışı prototipte başlatıldı."));
  $("#overview-report").addEventListener("click", () => showToast("Genel bakış raporu hazırlanıyor."));
  $("#model-sync").addEventListener("click", () => showToast("Model kataloğu başarıyla eşitlendi."));
  $("#run-check").addEventListener("click", () => showToast("Sistem denetimi tamamlandı: sorun bulunamadı."));
  $("#add-integration").addEventListener("click", () => showToast("Yeni entegrasyon ekleme akışı prototipte hazır."));
  $("#refresh-dashboard").addEventListener("click", () => { $("#last-sync").textContent = "şimdi"; showToast("Gösterge paneli yenilendi."); });
  $$("[data-user-action]").forEach((button) => button.addEventListener("click", () => showToast(`${button.dataset.userAction} için yönetim menüsü açılmaya hazır.`)));

  const search = $("#user-search"); const rows = $$("#user-rows tr"); const visible = $("#users-visible"); let currentFilter = "all";
  const filterUsers = () => { const query = search.value.trim().toLocaleLowerCase("tr-TR"); let count = 0; rows.forEach((row) => { const matchesFilter = currentFilter === "all" || row.dataset.userStatus === currentFilter; const matchesQuery = !query || row.textContent.toLocaleLowerCase("tr-TR").includes(query); row.hidden = !(matchesFilter && matchesQuery); if (!row.hidden) count += 1; }); visible.textContent = `${count} kullanıcı gösteriliyor`; };
  search.addEventListener("input", filterUsers); $$(".user-filter").forEach((button) => button.addEventListener("click", () => { currentFilter = button.dataset.userFilter; $$(".user-filter").forEach((item) => item.classList.toggle("is-selected", item === button)); filterUsers(); }));
})();
