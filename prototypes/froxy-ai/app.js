(() => {
  "use strict";

  const $ = (selector, parent = document) => parent.querySelector(selector);
  const $$ = (selector, parent = document) => Array.from(parent.querySelectorAll(selector));

  const elements = {
    sidebar: $("#sidebar"),
    sidebarBackdrop: $("#sidebar-backdrop"),
    sidebarOpen: $("#sidebar-open"),
    sidebarClose: $("#sidebar-close"),
    newChat: $("#new-chat"),
    navItems: $$(".nav-item"),
    views: $$(".view"),
    modelTrigger: $("#model-trigger"),
    modelMenu: $("#model-menu"),
    modelValue: $("#model-value"),
    modelOptions: $$(".model-option"),
    emptyState: $("#empty-state"),
    messageList: $("#message-list"),
    composer: $("#composer"),
    input: $("#prompt-input"),
    send: $("#send-button"),
    attach: $("#attach-button"),
    fileInput: $("#file-input"),
    fileDropZone: $("#file-drop-zone"),
    attachmentList: $("#attachment-list"),
    suggestionButtons: $$('[data-suggestion]'),
    modeButtons: $$(".mode-pill"),
    imagePrompt: $("#image-prompt"),
    visualStyleButtons: $$(".visual-style"),
    visionGenerate: $("#vision-generate"),
    imageCanvas: $("#image-canvas"),
    canvasCaption: $("#canvas-caption"),
    imageStatus: $(".image-status"),
    variationCards: $$(".variation-card"),
    promptSearch: $("#prompt-search"),
    libraryFilters: $$(".library-filter"),
    libraryCards: $$(".library-card"),
    libraryEmpty: $("#library-empty"),
    projectNew: $("#project-new"),
    projectGrid: $("#project-grid"),
    conversationList: $("#conversation-list"),
    share: $("#share-button"),
    toast: $("#toast")
  };

  const state = {
    model: "Froxy Core",
    mode: "Fikir üret",
    imageStyle: "editorial",
    attachments: [],
    isThinking: false,
    toastTimer: null
  };

  const icon = (path) => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    const svgPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    svgPath.setAttribute("d", path);
    svg.append(svgPath);
    return svg;
  };

  const showToast = (message) => {
    window.clearTimeout(state.toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.add("is-visible");
    state.toastTimer = window.setTimeout(() => elements.toast.classList.remove("is-visible"), 2600);
  };

  const scrollToLatest = () => {
    window.requestAnimationFrame(() => {
      const activeView = $(".view:not(.is-hidden)");
      if (activeView) activeView.scrollTop = activeView.scrollHeight;
    });
  };

  const autoResize = () => {
    elements.input.style.height = "auto";
    elements.input.style.height = `${Math.min(elements.input.scrollHeight, 128)}px`;
  };

  const updateSendButton = () => {
    elements.send.disabled = state.isThinking || (!elements.input.value.trim() && !state.attachments.length);
  };

  const setView = (viewName) => {
    elements.views.forEach((view) => {
      view.classList.toggle("is-hidden", view.id !== `${viewName}-view`);
    });
    elements.navItems.forEach((item) => item.classList.toggle("is-active", item.dataset.view === viewName));
    closeSidebar();
  };

  const openSidebar = () => {
    elements.sidebar.classList.add("is-open");
    elements.sidebarBackdrop.classList.add("is-open");
  };

  const closeSidebar = () => {
    elements.sidebar.classList.remove("is-open");
    elements.sidebarBackdrop.classList.remove("is-open");
  };

  const closeModelMenu = () => {
    elements.modelMenu.classList.remove("is-open");
    elements.modelTrigger.setAttribute("aria-expanded", "false");
  };

  const switchToChat = () => setView("chat");

  const renderAttachments = () => {
    elements.attachmentList.replaceChildren();
    state.attachments.forEach((file, index) => {
      const chip = document.createElement("span");
      chip.className = "attachment-chip";
      const name = document.createElement("span");
      name.textContent = file.name;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "remove-attachment";
      remove.dataset.attachmentIndex = String(index);
      remove.setAttribute("aria-label", `${file.name} dosyasını kaldır`);
      remove.textContent = "×";
      chip.append(name, remove);
      elements.attachmentList.append(chip);
    });
    updateSendButton();
  };

  const addFiles = (fileList) => {
    const incoming = Array.from(fileList || []);
    if (!incoming.length) return;
    const existingNames = new Set(state.attachments.map((file) => file.name));
    incoming.forEach((file) => {
      if (!existingNames.has(file.name)) state.attachments.push(file);
    });
    renderAttachments();
    showToast(`${incoming.length} dosya sohbete eklendi.`);
  };

  const imageStyleCopy = {
    editorial: "Buz mavisi × seçici enerji",
    cinematic: "Sıcak kontrast × derin atmosfer",
    minimal: "Az öğe × yüksek odak"
  };

  const setImageStatus = (label, isGenerating = false) => {
    const indicator = $("i", elements.imageStatus) || document.createElement("i");
    elements.imageStatus.replaceChildren(indicator, document.createTextNode(` ${label}`));
    elements.imageStatus.classList.toggle("is-generating", isGenerating);
  };

  const renderImageStyle = () => {
    elements.imageCanvas.className = `image-canvas ${state.imageStyle}`;
    elements.canvasCaption.textContent = imageStyleCopy[state.imageStyle];
    elements.visualStyleButtons.forEach((button) => {
      button.classList.toggle("is-selected", button.dataset.imageStyle === state.imageStyle);
    });
  };

  const generateVisual = () => {
    if (elements.visionGenerate.disabled) return;
    const prompt = elements.imagePrompt.value.trim() || "Froxy için sakin ama futuristik bir ürün lansman görseli";
    elements.visionGenerate.disabled = true;
    elements.visionGenerate.textContent = "Varyasyonlar hazırlanıyor...";
    setImageStatus("İşleniyor", true);

    window.setTimeout(() => {
      renderImageStyle();
      elements.canvasCaption.textContent = `${imageStyleCopy[state.imageStyle]} · ${prompt.slice(0, 44)}${prompt.length > 44 ? "…" : ""}`;
      elements.visionGenerate.disabled = false;
      elements.visionGenerate.replaceChildren(document.createTextNode("✦ 4 yeni varyasyon oluştur"));
      setImageStatus("Hazır");
      showToast("4 görsel yön hazır. Bir varyasyonu seçebilirsin.");
    }, 720);
  };

  const filterLibrary = () => {
    const query = elements.promptSearch.value.trim().toLocaleLowerCase("tr-TR");
    const selectedFilter = $(".library-filter.is-selected")?.dataset.filter || "all";
    let visibleCount = 0;
    elements.libraryCards.forEach((card) => {
      const matchesFilter = selectedFilter === "all" || card.dataset.category === selectedFilter;
      const matchesQuery = !query || card.textContent.toLocaleLowerCase("tr-TR").includes(query);
      const isVisible = matchesFilter && matchesQuery;
      card.hidden = !isVisible;
      if (isVisible) visibleCount += 1;
    });
    elements.libraryEmpty.hidden = visibleCount > 0;
  };

  const openProject = (prompt) => {
    newChat();
    elements.input.value = prompt;
    autoResize();
    updateSendButton();
    showToast("Proje bağlamı çalışma alanına taşındı.");
  };

  const makeText = (text) => {
    const node = document.createElement("p");
    node.textContent = text;
    return node;
  };

  const appendUserMessage = (text, attachments) => {
    const message = document.createElement("article");
    message.className = "message user-message";

    const avatar = document.createElement("div");
    avatar.className = "message-avatar";
    avatar.textContent = "HA";

    const content = document.createElement("div");
    content.className = "message-content";
    const label = document.createElement("div");
    label.className = "message-label";
    label.textContent = "Sen";
    const bubble = document.createElement("div");
    bubble.className = "message-bubble user-bubble";
    bubble.append(makeText(text || "Ekli dosyaları incele."));
    content.append(label, bubble);

    if (attachments.length) {
      const files = document.createElement("div");
      files.className = "message-attachments";
      attachments.forEach((file) => {
        const fileNode = document.createElement("span");
        fileNode.className = "message-file";
        const fileName = document.createElement("span");
        fileName.textContent = file.name;
        fileNode.append(fileName);
        files.append(fileNode);
      });
      content.append(files);
    }

    message.append(avatar, content);
    elements.messageList.append(message);
  };

  const responseFor = (prompt) => {
    const lower = prompt.toLocaleLowerCase("tr-TR");
    if (lower.includes("landing") || lower.includes("web sitesi") || lower.includes("site")) {
      return {
        title: "Froxy'nin ilk yönü: fikirden netliğe hızla geç.",
        intro: "Bu çalışma için en güçlü vaadi, ziyaretçiyi ilk birkaç saniyede somut bir sonraki adıma taşımak olur.",
        points: [
          "Hero alanında tek, canlı bir soruyla başlayın: “Bugün neyi netleştirelim?”",
          "Hemen altında gerçek bir çalışma akışını gösterin; boş vaat yerine dönüşen bir fikri görünür kılın.",
          "CTA'yı “İlk fikrini şekillendir” yapın ve ziyaretçiye düşük eforlu bir başlangıç verin."
        ],
        outcome: "Önerilen ton: cesur, sakin, teknik ama insan.",
        subline: "Dikkat çekmek için bağırmak yerine, kullanıcının düşüncesini daha berrak hale getirin."
      };
    }
    if (lower.includes("rota") || lower.includes("istanbul")) {
      return {
        title: "Ritmi olan bir rota kuralım.",
        intro: "Rotayı sadece mekan listesi değil, keşif ve dinlenme arasında dengeli bir anlatı gibi tasarlamak daha iyi sonuç verir.",
        points: [
          "İlk günü bir semtte yoğunlaştırın; ulaşım yerine meraka zaman ayırın.",
          "Her gün için bir ana tema ve bir esnek keşif aralığı belirleyin.",
          "Planın sonuna “tekrar gelmek istediğim yerler” notunu ekleyin."
        ],
        outcome: "İlk karar: günün ritmi mi, yoksa tek bir semtin derinliği mi?",
        subline: "İstersen bunu saat saat, bütçe ve ilgi alanına göre ayrıntılandırabilirim."
      };
    }
    if (lower.includes("ürün") || lower.includes("fikir") || lower.includes("test")) {
      return {
        title: "Önce sinyali yakalayalım, sonra büyütelim.",
        intro: "Fikri hemen çözüm olarak değil, doğrulanabilir bir varsayım olarak çerçevelemek en verimli ilk adım olur.",
        points: [
          "Hedef kullanıcıyı tek bir bağlam ve tek bir acıyla tanımlayın.",
          "Çözümün küçük bir vaadini test edecek tek sayfalık bir deney hazırlayın.",
          "Kararı izlenimle değil, kayıt bırakma veya geri dönüş sinyaliyle verin."
        ],
        outcome: "İlk testin hedefi: “İnsanlar bunun için geri gelir mi?”",
        subline: "Bir sonraki adımda hipotezi, mesajı ve ölçüm planını tek kartta toplayabiliriz."
      };
    }
    return {
      title: "Bunu net bir çalışma parçasına çevirebiliriz.",
      intro: "İyi başlangıç, tek seferde her şeyi çözmek değil; sıradaki doğru soruyu görünür kılmaktır.",
      points: [
        "Önce hedefi tek cümleyle sabitleyin.",
        "Sonucu değiştirecek iki varsayımı ayırın.",
        "Bugün tamamlanabilecek en küçük, görünür adımı seçin."
      ],
      outcome: "Odak: küçük bir adım, ölçülebilir bir ilerleme.",
      subline: "İstersen bu taslağı seçtiğin çalışma moduna göre derinleştirebilirim."
    };
  };

  const responsePlainText = (response) => `${response.title}\n\n${response.intro}\n\n${response.points.map((point) => `• ${point}`).join("\n")}\n\n${response.outcome}`;

  const actionButton = (label, svgPath, handler) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "response-action";
    button.append(icon(svgPath), document.createTextNode(label));
    button.addEventListener("click", handler);
    return button;
  };

  const appendAssistantMessage = (prompt, alternative = false) => {
    const response = responseFor(prompt);
    if (alternative) response.subline = "Aynı fikri farklı bir çerçeveden ele aldım; hangisinin daha çok sana benzediğini seçebilirsin.";

    const message = document.createElement("article");
    message.className = "message assistant-message";
    const avatar = document.createElement("div");
    avatar.className = "message-avatar";
    avatar.textContent = "F";

    const content = document.createElement("div");
    content.className = "message-content";
    const label = document.createElement("div");
    label.className = "message-label";
    label.textContent = `${state.model} · ${state.mode}`;
    const bubble = document.createElement("div");
    bubble.className = "message-bubble assistant-bubble";

    const title = document.createElement("h3");
    title.textContent = response.title;
    const intro = makeText(response.intro);
    const list = document.createElement("ul");
    list.className = "insight-list";
    response.points.forEach((point) => {
      const item = document.createElement("li");
      item.textContent = point;
      list.append(item);
    });
    const outcome = document.createElement("div");
    outcome.className = "outcome-card";
    const outcomeLabel = document.createElement("span");
    outcomeLabel.textContent = "Çalışma kartı";
    const outcomeTitle = document.createElement("strong");
    outcomeTitle.textContent = response.outcome;
    const outcomeText = document.createElement("p");
    outcomeText.textContent = response.subline;
    outcome.append(outcomeLabel, outcomeTitle, outcomeText);

    const meta = document.createElement("div");
    meta.className = "response-meta";
    ["İlk taslak", state.model, "Odak modu"].forEach((source) => {
      const chip = document.createElement("span");
      chip.className = "source-chip";
      chip.textContent = source;
      meta.append(chip);
    });

    const actions = document.createElement("div");
    actions.className = "response-actions";
    actions.append(
      actionButton("Kopyala", "M8 5h10a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm-3 4V4a1 1 0 0 1 1-1h9", () => copyText(responsePlainText(response), "Yanıt panoya kopyalandı.")),
      actionButton("Yeniden üret", "M20 11a8 8 0 1 1-2.2-5.5M20 4v7h-7", () => regenerate(prompt)),
      actionButton("Beğendim", "M7 10v10H4V10h3Zm2 10h7.2a2 2 0 0 0 1.94-1.5l1.3-5A2 2 0 0 0 16.5 11H13l.55-3.1A2.2 2.2 0 0 0 11.4 5L9 10", () => showToast("Geri bildirimin kaydedildi. ✦"))
    );

    bubble.append(title, intro, list, outcome, meta, actions);
    content.append(label, bubble);
    message.append(avatar, content);
    elements.messageList.append(message);
    scrollToLatest();
  };

  const showThinking = () => {
    const message = document.createElement("article");
    message.className = "message thinking-message";
    message.id = "thinking-message";
    const avatar = document.createElement("div");
    avatar.className = "message-avatar";
    avatar.textContent = "F";
    const dots = document.createElement("div");
    dots.className = "thinking-bubble";
    [0, 1, 2].forEach(() => dots.append(document.createElement("i")));
    const label = document.createElement("span");
    label.textContent = "Froxy düşünüyor";
    dots.append(label);
    message.append(avatar, dots);
    elements.messageList.append(message);
    scrollToLatest();
  };

  const addRecentConversation = (prompt) => {
    const existing = $$(".conversation-item", elements.conversationList).find((item) => item.dataset.prompt === prompt);
    $$(".conversation-item", elements.conversationList).forEach((item) => item.classList.remove("is-current"));
    if (existing) {
      existing.classList.add("is-current");
      return;
    }
    const item = document.createElement("button");
    item.type = "button";
    item.className = "conversation-item is-current";
    item.dataset.prompt = prompt;
    const mark = document.createElement("span");
    mark.className = "conversation-icon icon-violet";
    mark.textContent = "✦";
    const content = document.createElement("span");
    content.className = "conversation-content";
    const title = document.createElement("strong");
    title.textContent = prompt.replace(/\s+/g, " ").slice(0, 31);
    const time = document.createElement("small");
    time.textContent = "Şimdi";
    content.append(title, time);
    item.append(mark, content);
    elements.conversationList.prepend(item);
  };

  const sendMessage = () => {
    const text = elements.input.value.trim();
    const attachments = [...state.attachments];
    if (state.isThinking || (!text && !attachments.length)) return;

    state.isThinking = true;
    switchToChat();
    elements.emptyState.hidden = true;
    appendUserMessage(text, attachments);
    addRecentConversation(text || "Ekli dosyaları incele");
    elements.input.value = "";
    elements.input.style.height = "auto";
    state.attachments = [];
    renderAttachments();
    showThinking();
    updateSendButton();

    window.setTimeout(() => {
      $("#thinking-message")?.remove();
      appendAssistantMessage(text || "Ekli dosyaları incele");
      state.isThinking = false;
      updateSendButton();
    }, 880);
  };

  const regenerate = (prompt) => {
    if (state.isThinking) return;
    state.isThinking = true;
    updateSendButton();
    showThinking();
    window.setTimeout(() => {
      $("#thinking-message")?.remove();
      appendAssistantMessage(prompt, true);
      state.isThinking = false;
      updateSendButton();
    }, 650);
  };

  const newChat = () => {
    state.isThinking = false;
    state.attachments = [];
    elements.messageList.replaceChildren();
    elements.emptyState.hidden = false;
    elements.input.value = "";
    elements.input.style.height = "auto";
    renderAttachments();
    $$(".conversation-item", elements.conversationList).forEach((item, index) => item.classList.toggle("is-current", index === 0));
    switchToChat();
    elements.input.focus();
    showToast("Yeni çalışma alanı hazır.");
  };

  const copyText = async (text, successMessage) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(successMessage);
    } catch {
      showToast("Kopyalama izni bulunamadı.");
    }
  };

  elements.sidebarOpen.addEventListener("click", openSidebar);
  elements.sidebarClose.addEventListener("click", closeSidebar);
  elements.sidebarBackdrop.addEventListener("click", closeSidebar);
  elements.newChat.addEventListener("click", newChat);

  elements.navItems.forEach((item) => {
    if (item.dataset.view) item.addEventListener("click", () => setView(item.dataset.view));
  });

  elements.modelTrigger.addEventListener("click", (event) => {
    event.stopPropagation();
    const isOpen = elements.modelMenu.classList.toggle("is-open");
    elements.modelTrigger.setAttribute("aria-expanded", String(isOpen));
  });

  elements.modelOptions.forEach((option) => option.addEventListener("click", () => {
    state.model = option.dataset.model;
    elements.modelValue.textContent = state.model;
    elements.modelOptions.forEach((modelOption) => {
      const selected = modelOption === option;
      modelOption.classList.toggle("is-selected", selected);
      modelOption.setAttribute("aria-selected", String(selected));
    });
    closeModelMenu();
    showToast(`${state.model} seçildi.`);
  }));

  elements.modeButtons.forEach((button) => button.addEventListener("click", () => {
    state.mode = button.dataset.mode;
    elements.modeButtons.forEach((modeButton) => modeButton.classList.toggle("is-selected", modeButton === button));
    showToast(`${state.mode} modu aktif.`);
  }));

  elements.visualStyleButtons.forEach((button) => button.addEventListener("click", () => {
    state.imageStyle = button.dataset.imageStyle;
    renderImageStyle();
    showToast(`${button.textContent} görsel yönü seçildi.`);
  }));

  elements.visionGenerate.addEventListener("click", generateVisual);

  elements.variationCards.forEach((card, index) => card.addEventListener("click", () => {
    elements.variationCards.forEach((variation) => variation.classList.toggle("is-current", variation === card));
    elements.canvasCaption.textContent = `Varyasyon ${index + 1} · ${imageStyleCopy[state.imageStyle]}`;
    showToast(`Varyasyon ${index + 1} seçildi.`);
  }));

  elements.promptSearch.addEventListener("input", filterLibrary);
  elements.libraryFilters.forEach((filter) => filter.addEventListener("click", () => {
    elements.libraryFilters.forEach((item) => item.classList.toggle("is-selected", item === filter));
    filterLibrary();
  }));

  elements.projectNew.addEventListener("click", () => openProject("Yeni proje için hedefi, ilk çıktıyı, en büyük riski ve bugün tamamlanacak ilk adımı netleştir."));
  elements.projectGrid.addEventListener("click", (event) => {
    const project = event.target.closest("[data-project-prompt]");
    if (project) openProject(project.dataset.projectPrompt);
  });

  elements.suggestionButtons.forEach((button) => button.addEventListener("click", () => {
    switchToChat();
    elements.input.value = button.dataset.suggestion;
    autoResize();
    elements.input.focus();
    showToast("Başlangıç sorusu hazır; düzenleyip gönderebilirsin.");
  }));

  elements.composer.addEventListener("submit", (event) => {
    event.preventDefault();
    sendMessage();
  });

  elements.input.addEventListener("input", () => {
    autoResize();
    updateSendButton();
  });

  elements.input.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      sendMessage();
    }
  });

  elements.attach.addEventListener("click", () => elements.fileInput.click());
  elements.fileDropZone.addEventListener("click", () => elements.fileInput.click());
  elements.fileInput.addEventListener("change", () => {
    addFiles(elements.fileInput.files);
    elements.fileInput.value = "";
  });

  elements.attachmentList.addEventListener("click", (event) => {
    const remove = event.target.closest(".remove-attachment");
    if (!remove) return;
    state.attachments.splice(Number(remove.dataset.attachmentIndex), 1);
    renderAttachments();
  });

  elements.conversationList.addEventListener("click", (event) => {
    const item = event.target.closest(".conversation-item");
    if (!item) return;
    $$(".conversation-item", elements.conversationList).forEach((entry) => entry.classList.toggle("is-current", entry === item));
    switchToChat();
    elements.input.value = item.dataset.prompt || "";
    autoResize();
    elements.input.focus();
    updateSendButton();
    showToast("Önceki çalışma tekrar açıldı.");
  });

  elements.share.addEventListener("click", () => copyText("Froxy AI — çalışma alanı prototipi", "Paylaşım metni panoya kopyalandı."));

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".model-picker")) closeModelMenu();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeModelMenu();
      closeSidebar();
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      newChat();
    }
  });

  renderImageStyle();
  filterLibrary();
  updateSendButton();
})();
