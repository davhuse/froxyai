(() => {
  "use strict";

  const navToggle = document.querySelector("#mobile-nav-toggle");
  const nav = document.querySelector("#site-nav");
  const billingButtons = document.querySelectorAll(".billing-option");
  const prices = document.querySelectorAll("[data-monthly]");
  const toast = document.querySelector("#landing-toast");
  let toastTimer;

  const showToast = (message) => {
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add("is-visible");
    toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2400);
  };

  navToggle.addEventListener("click", () => {
    const open = nav.classList.toggle("is-open");
    navToggle.classList.toggle("is-open", open);
    navToggle.setAttribute("aria-expanded", String(open));
  });

  nav.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => {
    nav.classList.remove("is-open");
    navToggle.classList.remove("is-open");
    navToggle.setAttribute("aria-expanded", "false");
  }));

  billingButtons.forEach((button) => button.addEventListener("click", () => {
    const billing = button.dataset.billing;
    billingButtons.forEach((item) => item.classList.toggle("is-selected", item === button));
    prices.forEach((price) => { price.textContent = price.dataset[billing]; });
    showToast(billing === "yearly" ? "Yıllık fiyatlar ve %20 avantaj gösteriliyor." : "Aylık fiyatlar gösteriliyor.");
  }));
})();
