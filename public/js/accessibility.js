const commandInput = document.getElementById("commandInput");
const runCommandBtn = document.getElementById("runCommandBtn");
const readPageBtn = document.getElementById("readPageBtn");
const voiceCommandBtn = document.getElementById("voiceCommandBtn");
const commandStatus = document.getElementById("commandStatus");
const examForm = document.getElementById("examForm");
const answeredCount = document.getElementById("answeredCount");
const progressFill = document.getElementById("progressFill");

if (commandInput && runCommandBtn && commandStatus && examForm) {
  const setStatus = (message) => {
    commandStatus.textContent = message;
  };

  const normalizeText = (value) =>
    value
      .toLowerCase()
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

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

  const executeCommand = () => {
    const rawCommand = normalizeText(commandInput.value);

    if (!rawCommand) {
      setStatus("Ingresa un comando antes de ejecutar.");
      return;
    }

    if (rawCommand === "enviar" || rawCommand === "enviar examen") {
      setStatus("Enviando examen.");
      examForm.requestSubmit();
      return;
    }

    if (rawCommand === "inicio" || rawCommand === "volver al inicio") {
      setStatus("Volviendo al inicio del examen.");
      window.location.href = "/exam/start";
      return;
    }

    if (rawCommand === "limpiar") {
      clearAnswers();
      setStatus("Se limpiaron las respuestas seleccionadas.");
      return;
    }

    setStatus("Comando no reconocido. Usa: enviar, inicio o limpiar.");
  };

  runCommandBtn.addEventListener("click", executeCommand);
  commandInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      executeCommand();
    }
  });
  examForm.addEventListener("change", updateProgress);
  updateProgress();

  const hasSpeechSynthesis = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  if (readPageBtn) {
    if (!hasSpeechSynthesis) {
      readPageBtn.disabled = true;
      readPageBtn.setAttribute("aria-disabled", "true");
      readPageBtn.title = "Lectura por voz no disponible en este navegador.";
    } else {
      readPageBtn.addEventListener("click", () => {
        const title = document.querySelector("h1")?.textContent?.trim() || "Examen en linea";
        const progress = `Has respondido ${answeredCount?.textContent || "0"} preguntas.`;
        const firstQuestion = document.querySelector(".question-text")?.textContent?.trim() || "";
        const textToRead = `${title}. ${progress} Primera pregunta: ${firstQuestion}`;
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(textToRead);
        utterance.lang = "es-ES";
        utterance.rate = 1;
        utterance.pitch = 1;
        window.speechSynthesis.speak(utterance);
        setStatus("Lectura por voz iniciada.");
      });
    }
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const secureContext =
    window.isSecureContext ||
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";

  if (voiceCommandBtn) {
    if (!SpeechRecognition || !secureContext) {
      voiceCommandBtn.disabled = true;
      voiceCommandBtn.setAttribute("aria-disabled", "true");
      voiceCommandBtn.title =
        "Comandos por voz no disponibles. Usa HTTPS o localhost y navegador compatible.";
    } else {
      const recognition = new SpeechRecognition();
      recognition.lang = "es-ES";
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      voiceCommandBtn.addEventListener("click", () => {
        setStatus("Escuchando comando de voz...");
        recognition.start();
      });

      recognition.addEventListener("result", (event) => {
        const voiceText = event.results[0][0].transcript || "";
        commandInput.value = voiceText;
        setStatus(`Comando detectado: ${voiceText}`);
        executeCommand();
      });

      recognition.addEventListener("error", (event) => {
        if (event.error === "not-allowed") {
          setStatus("Permiso de microfono denegado. Habilitalo en el navegador.");
          return;
        }
        if (event.error === "audio-capture") {
          setStatus("No se detecta microfono disponible.");
          return;
        }
        if (event.error === "no-speech") {
          setStatus("No se detecto voz. Intenta hablar mas cerca del microfono.");
          return;
        }
        setStatus("No se pudo procesar la voz. Intenta nuevamente.");
      });
    }
  }
}
