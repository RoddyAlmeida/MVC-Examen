const toggleReadBtn = document.getElementById("toggleReadBtn");
const clearAnswersBtn = document.getElementById("clearAnswersBtn");
const goHomeBtn = document.getElementById("goHomeBtn");
const commandStatus = document.getElementById("commandStatus");
const examForm = document.getElementById("examForm");
const answeredCount = document.getElementById("answeredCount");
const progressFill = document.getElementById("progressFill");

if (commandStatus && examForm) {
  const speech = window.guidedSpeech;
  let guidedReadEnabled = speech ? speech.isEnabled() : localStorage.getItem("guidedReadEnabled") !== "false";
  let lastQuestionAnnounced = "";
  let keyboardNavigationMode = true;
  const speak = (text) => {
    if (!speech) return;
    speech.speak(text);
  };

  const setStatus = (message) => {
    commandStatus.textContent = message;
  };

  const clearAnswers = () => {
    const selected = examForm.querySelectorAll('input[type="radio"]:checked');
    selected.forEach((radio) => {
      radio.checked = false;
    });
    updateProgress();
  };

  const updateProgress = () => {
    const groups = new Map();
    const radios = examForm.querySelectorAll('input[type="radio"]');
    radios.forEach((radio) => {
      if (!groups.has(radio.name)) {
        groups.set(radio.name, false);
      }
      if (radio.checked) {
        groups.set(radio.name, true);
      }
    });

    const total = groups.size;
    let completed = 0;
    groups.forEach((isCompleted) => {
      if (isCompleted) {
        completed += 1;
      }
    });

    if (answeredCount) {
      answeredCount.textContent = String(completed);
    }
    if (progressFill) {
      const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
      progressFill.style.width = `${percent}%`;
    }

    const cards = examForm.querySelectorAll("[data-question-card]");
    cards.forEach((card) => {
      const checked = card.querySelector('input[type="radio"]:checked');
      card.classList.toggle("is-answered", Boolean(checked));
    });
  };

  const getRadiosInGroup = (radio) =>
    Array.from(examForm.querySelectorAll(`input[type="radio"][name="${radio.name}"]`));

  examForm.addEventListener("change", updateProgress);
  updateProgress();

  document.addEventListener("keydown", () => {
    keyboardNavigationMode = true;
  });
  document.addEventListener("mousedown", () => {
    keyboardNavigationMode = false;
  });
  document.addEventListener("touchstart", () => {
    keyboardNavigationMode = false;
  });

  // Arrows move focus between options without selecting.
  examForm.addEventListener("keydown", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.type !== "radio") {
      return;
    }

    const key = event.key;
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(key)) {
      if (key === " " || key === "Spacebar") {
        setTimeout(() => {
          const labelText = target.closest("label")?.textContent?.trim() || "opcion";
          setStatus(`Seleccionada: ${labelText}`);
          speak(`Seleccionada: ${labelText}`);
          updateProgress();
        }, 0);
      }
      return;
    }

    event.preventDefault();
    const radios = getRadiosInGroup(target);
    const currentIndex = radios.indexOf(target);
    const direction = key === "ArrowUp" || key === "ArrowLeft" ? -1 : 1;
    const nextIndex = (currentIndex + direction + radios.length) % radios.length;
    radios[nextIndex].focus();
  });

  examForm.addEventListener("focusin", (event) => {
    if (!keyboardNavigationMode) {
      return;
    }
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.type !== "radio") {
      return;
    }
    const questionCard = target.closest("[data-question-card]");
    const questionId = target.name;
    const questionTitle = questionCard?.querySelector(".question-text")?.textContent?.trim() || "";
    const optionLabel = target.closest("label")?.textContent?.trim() || "";
    const shouldReadQuestion = lastQuestionAnnounced !== questionId;
    lastQuestionAnnounced = questionId;
    const speechText = shouldReadQuestion
      ? `${questionTitle}. Opcion: ${optionLabel}`
      : `Opcion: ${optionLabel}`;
    speak(speechText);
    setStatus(`${questionTitle}. Opcion enfocada: ${optionLabel}`);
  });

  if (toggleReadBtn) {
    toggleReadBtn.textContent = `Lectura guiada: ${guidedReadEnabled ? "ON" : "OFF"}`;
    toggleReadBtn.addEventListener("click", () => {
      guidedReadEnabled = !guidedReadEnabled;
      if (speech) {
        if (!guidedReadEnabled) {
          // Speak once and then stay silent.
          speech.systemSpeak("Lectura desactivada.");
          speech.setEnabled(false);
        } else {
          speech.setEnabled(true);
          speech.systemSpeak("Lectura activada.");
        }
      } else {
        localStorage.setItem("guidedReadEnabled", String(guidedReadEnabled));
      }
      toggleReadBtn.textContent = `Lectura guiada: ${guidedReadEnabled ? "ON" : "OFF"}`;
      setStatus(
        guidedReadEnabled
          ? "Lectura guiada activada en espanol."
          : "Lectura guiada desactivada."
      );
    });
  }

  if (clearAnswersBtn) {
    clearAnswersBtn.addEventListener("click", () => {
      clearAnswers();
      setStatus("Respuestas limpiadas.");
    });
  }

  if (goHomeBtn) {
    goHomeBtn.addEventListener("click", () => {
      if (speech) speech.stop();
      window.location.href = "/exam/start";
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.altKey && event.key.toLowerCase() === "l") {
      event.preventDefault();
      clearAnswers();
      setStatus("Respuestas limpiadas por atajo Alt+L.");
      return;
    }
    if (event.altKey && event.key.toLowerCase() === "i") {
      event.preventDefault();
      window.location.href = "/exam/start";
      return;
    }
    if (event.ctrlKey && event.key === "Enter") {
      event.preventDefault();
      if (speech) speech.stop();
      examForm.requestSubmit();
      setStatus("Enviando examen por atajo Ctrl+Enter.");
    }
  });

  examForm.addEventListener("submit", () => {
    if (speech) speech.stop();
  });
}
