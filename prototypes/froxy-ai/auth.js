(() => {
  "use strict";

  const tabs = [...document.querySelectorAll(".auth-tab")];
  const switches = [...document.querySelectorAll("[data-switch-mode]")];
  const title = document.querySelector("#auth-title");
  const subtitle = document.querySelector("#auth-subtitle");
  const form = document.querySelector("#auth-form");
  const nameRow = document.querySelector("#name-row");
  const nameInput = document.querySelector("#full-name");
  const consentRow = document.querySelector("#consent-row");
  const consent = document.querySelector("#consent");
  const submit = document.querySelector("#auth-submit");
  const providerLabel = document.querySelector("#provider-label");
  const legal = document.querySelector("#auth-legal");
  const password = document.querySelector("#password");
  const passwordToggle = document.querySelector("#password-toggle");
  const toast = document.querySelector("#auth-toast");
  const forgot = document.querySelector("#forgot-link");
  let mode = new URLSearchParams(window.location.search).get("mode") === "signup" ? "signup" : "signin";
  let toastTimer;

  const showToast = (message) => {
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add("is-visible");
    toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2600);
  };

  const render = () => {
    const signup = mode === "signup";
    tabs.forEach((tab) => {
      const active = tab.dataset.mode === mode;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
    });
    nameRow.hidden = !signup;
    nameInput.required = signup;
    consentRow.hidden = !signup;
    consent.required = signup;
    title.textContent = signup ? "Kendi alanını aç." : "Tekrar hoş geldin.";
    subtitle.textContent = signup ? "İlk netlik anın birkaç saniye uzakta." : "Çalışma alanın kaldığın yerden hazır.";
    submit.innerHTML = `${signup ? "Ücretsiz hesap oluştur" : "Giriş yap"} <span>→</span>`;
    providerLabel.textContent = signup ? "Google ile hesap oluştur" : "Google ile devam et";
    legal.innerHTML = signup
      ? 'Zaten hesabın var mı? <button type="button" data-switch-mode="signin">Giriş yap</button>'
      : 'Hesabın yok mu? <button type="button" data-switch-mode="signup">Ücretsiz hesap oluştur</button>';
  };

  tabs.forEach((tab) => tab.addEventListener("click", () => { mode = tab.dataset.mode; render(); }));
  legal.addEventListener("click", (event) => { const button = event.target.closest("[data-switch-mode]"); if (button) { mode = button.dataset.switchMode; render(); } });
  switches.forEach((button) => button.addEventListener("click", () => { mode = button.dataset.switchMode; render(); }));

  passwordToggle.addEventListener("click", () => {
    const show = password.type === "password";
    password.type = show ? "text" : "password";
    passwordToggle.setAttribute("aria-label", show ? "Şifreyi gizle" : "Şifreyi göster");
  });

  forgot.addEventListener("click", (event) => { event.preventDefault(); showToast("Şifre sıfırlama akışı prototipte simüle edilir."); });
  document.querySelector("#provider-button").addEventListener("click", () => showToast("Sağlayıcı girişi prototipte simüle edilir."));

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!form.checkValidity()) { form.reportValidity(); return; }
    submit.disabled = true;
    submit.textContent = mode === "signup" ? "Alan hazırlanıyor..." : "Giriş yapılıyor...";
    showToast(mode === "signup" ? "Froxy alanın hazırlanıyor." : "Froxy alanına yönlendiriliyorsun.");
    window.setTimeout(() => { window.location.assign("index.html"); }, 650);
  });

  render();
})();
