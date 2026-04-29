const readPageBtn = document.getElementById("readPageBtn");
const voiceCommandBtn = document.getElementById("voiceCommandBtn");
const micTestBtn = document.getElementById("micTestBtn");
const toggleAutoReadBtn = document.getElementById("toggleAutoReadBtn");
const commandStatus = document.getElementById("commandStatus");
const examForm = document.getElementById("examForm");
const answeredCount = document.getElementById("answeredCount");
const progressFill = document.getElementById("progressFill");
const diagSecureContext = document.getElementById("diagSecureContext");
const diagRecognition = document.getElementById("diagRecognition");
const diagSynthesis = document.getElementById("diagSynthesis");
const diagMicPermission = document.getElementById("diagMicPermission");
const diagListeningState = document.getElementById("diagListeningState");
const diagMicLevel = document.getElementById("diagMicLevel");
const diagLastError = document.getElementById("diagLastError");
const diagLastTranscript = document.getElementById("diagLastTranscript");

if (commandStatus && examForm) {
  const setStatus = (message) => {
    commandStatus.textContent = message;
  };

  const normalizeText = (value) =>
    value
      .toLowerCase()
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[.,;:!?]/g, "");

  let autoReadEnabled = true;
  let lastSpokenText = "";
  let lastSpokenAt = 0;
  let lastQuestionAnnounced = "";
  let isListening = false;
  let listenTimeoutId = null;
  let micPermissionState = "desconocido";
  let heardTranscriptInSession = false;
  let sessionStartedAt = 0;
  let autoRetriedOnce = false;
  let micTestStream = null;
  let micTestAnimationId = null;
  let micTestAudioCtx = null;
  const setDiagValue = (element, value) => {
    if (element) {
      element.textContent = value;
    }
  };

  const refreshMicPermission = async () => {
    if (!navigator.permissions?.query) {
      micPermissionState = "no soportado";
      setDiagValue(diagMicPermission, micPermissionState);
      return micPermissionState;
    }
    try {
      const result = await navigator.permissions.query({ name: "microphone" });
      micPermissionState = result.state;
      setDiagValue(diagMicPermission, micPermissionState);
      result.onchange = () => {
        micPermissionState = result.state;
        setDiagValue(diagMicPermission, micPermissionState);
      };
    } catch (error) {
      micPermissionState = "desconocido";
      setDiagValue(diagMicPermission, micPermissionState);
    }
    return micPermissionState;
  };

  const ensureMicAccess = async () => {
    await refreshMicPermission();
    if (micPermissionState === "granted") {
      return true;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("Tu navegador no soporta solicitud de microfono via getUserMedia.");
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      await refreshMicPermission();
      return true;
    } catch (error) {
      setDiagValue(diagLastError, error.name || "mic-access-error");
      setStatus("No se pudo obtener permiso de microfono. Revisa el candado del navegador.");
      await refreshMicPermission();
      return false;
    }
  };

  const stopMicTest = () => {
    if (micTestAnimationId) {
      cancelAnimationFrame(micTestAnimationId);
      micTestAnimationId = null;
    }
    if (micTestStream) {
      micTestStream.getTracks().forEach((track) => track.stop());
      micTestStream = null;
    }
    if (micTestAudioCtx) {
      micTestAudioCtx.close();
      micTestAudioCtx = null;
    }
    if (micTestBtn) {
      micTestBtn.textContent = "Probar microfono";
    }
    setDiagValue(diagMicLevel, "-");
  };

  const startMicTest = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("Prueba de microfono no disponible en este navegador.");
      return;
    }
    try {
      micTestStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) {
        setStatus("AudioContext no disponible para medir nivel.");
        stopMicTest();
        return;
      }
      micTestAudioCtx = new AudioCtx();
      const source = micTestAudioCtx.createMediaStreamSource(micTestStream);
      const analyser = micTestAudioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      if (micTestBtn) {
        micTestBtn.textContent = "Detener prueba";
      }
      setStatus("Prueba de microfono activa. Habla para ver nivel.");

      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i += 1) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        const percent = Math.min(100, Math.round(rms * 220));
        setDiagValue(diagMicLevel, `${percent}%`);
        micTestAnimationId = requestAnimationFrame(tick);
      };
      tick();
    } catch (error) {
      setDiagValue(diagLastError, error.name || "mic-test-error");
      setStatus("No se pudo iniciar la prueba de microfono.");
      stopMicTest();
    }
  };

  const speak = (text) => {
    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
      return;
    }
    const now = Date.now();
    if (text === lastSpokenText && now - lastSpokenAt < 600) {
      return;
    }
    lastSpokenText = text;
    lastSpokenAt = now;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "es-ES";
    utterance.rate = 1;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
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

  const executeCommand = (rawText) => {
    const rawCommand = normalizeText(rawText);

    if (!rawCommand) {
      setStatus("No se detecto un comando valido.");
      return;
    }

    if (rawCommand.includes("enviar")) {
      setStatus("Enviando examen.");
      examForm.requestSubmit();
      return;
    }

    if (rawCommand.includes("inicio")) {
      setStatus("Volviendo al inicio del examen.");
      window.location.href = "/exam/start";
      return;
    }

    if (rawCommand.includes("limpiar")) {
      clearAnswers();
      setStatus("Se limpiaron las respuestas seleccionadas.");
      return;
    }

    setStatus("Comando no reconocido. Usa: enviar, inicio o limpiar.");
  };
  examForm.addEventListener("change", updateProgress);
  updateProgress();

  const getRadiosInGroup = (radio) =>
    Array.from(examForm.querySelectorAll(`input[type="radio"][name="${radio.name}"]`));

  // Keep arrow navigation without auto-selecting an option.
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

  const hasSpeechSynthesis = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  setDiagValue(diagSynthesis, hasSpeechSynthesis ? "si" : "no");
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
        const textToRead = `${title}. ${progress}. Primera pregunta: ${firstQuestion}`;
        speak(textToRead);
        setStatus("Lectura por voz iniciada.");
      });
    }
  }

  if (toggleAutoReadBtn) {
    toggleAutoReadBtn.addEventListener("click", () => {
      autoReadEnabled = !autoReadEnabled;
      toggleAutoReadBtn.textContent = `Lectura auto: ${autoReadEnabled ? "ON" : "OFF"}`;
      setStatus(
        autoReadEnabled ? "Lectura automatica activada." : "Lectura automatica desactivada."
      );
    });
  }

  examForm.addEventListener("focusin", (event) => {
    if (!autoReadEnabled || !hasSpeechSynthesis) {
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
    const selectionState = target.checked ? "Seleccionada." : "No seleccionada.";
    const shouldReadQuestion = lastQuestionAnnounced !== questionId;
    lastQuestionAnnounced = questionId;
    const speech = shouldReadQuestion
      ? `${questionTitle}. Opcion: ${optionLabel}. ${selectionState}`
      : `Opcion: ${optionLabel}. ${selectionState}`;
    speak(speech);
  });

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const secureContext =
    window.isSecureContext ||
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";
  setDiagValue(diagSecureContext, secureContext ? "si" : "no");
  setDiagValue(diagRecognition, SpeechRecognition ? "si" : "no");
  setDiagValue(diagListeningState, "inactivo");

  refreshMicPermission();

  if (voiceCommandBtn) {
    if (!SpeechRecognition || !secureContext) {
      voiceCommandBtn.disabled = true;
      voiceCommandBtn.setAttribute("aria-disabled", "true");
      voiceCommandBtn.title =
        "Comandos por voz no disponibles. Usa HTTPS o localhost y navegador compatible.";
    } else {
      const recognition = new SpeechRecognition();
      recognition.lang = navigator.language?.startsWith("es") ? navigator.language : "es-ES";
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.continuous = true;

      voiceCommandBtn.addEventListener("click", async () => {
        try {
          if (isListening) {
            recognition.stop();
            isListening = false;
            if (listenTimeoutId) {
              window.clearTimeout(listenTimeoutId);
              listenTimeoutId = null;
            }
            setStatus("Escucha detenida.");
            return;
          }
          const micReady = await ensureMicAccess();
          if (!micReady) {
            return;
          }
          heardTranscriptInSession = false;
          autoRetriedOnce = false;
          sessionStartedAt = Date.now();
          setDiagValue(diagLastError, "ninguno");
          setDiagValue(diagLastTranscript, "-");
          setStatus("Escuchando comando de voz... habla ahora.");
          recognition.start();
          // Safety timeout: closes hanging sessions in some browsers.
          listenTimeoutId = window.setTimeout(() => {
            if (isListening) {
              recognition.stop();
            }
          }, 7000);
        } catch (error) {
          setStatus(`No se pudo iniciar la voz: ${error.message || "intenta de nuevo"}.`);
        }
      });

      recognition.addEventListener("start", () => {
        isListening = true;
        sessionStartedAt = Date.now();
        voiceCommandBtn.textContent = "Detener voz";
        setDiagValue(diagListeningState, "escuchando");
        setDiagValue(diagLastError, "ninguno");
      });

      recognition.addEventListener("audiostart", () => {
        setDiagValue(diagListeningState, "audio detectado");
      });

      recognition.addEventListener("speechstart", () => {
        setDiagValue(diagListeningState, "voz detectada");
      });

      recognition.addEventListener("result", (event) => {
        let finalText = "";
        let interimText = "";
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const segment = event.results[i][0]?.transcript || "";
          if (event.results[i].isFinal) {
            finalText += `${segment} `;
          } else {
            interimText += `${segment} `;
          }
        }
        const cleanFinal = finalText.trim();
        const cleanInterim = interimText.trim();
        if (cleanInterim) {
          setDiagValue(diagLastTranscript, `~ ${cleanInterim}`);
          setDiagValue(diagListeningState, "procesando voz");
        }
        if (cleanFinal) {
          heardTranscriptInSession = true;
          setDiagValue(diagLastTranscript, cleanFinal);
          setStatus(`Comando detectado: ${cleanFinal}`);
          executeCommand(cleanFinal);
          recognition.stop();
        }
      });

      recognition.addEventListener("end", () => {
        const sessionDuration = Date.now() - sessionStartedAt;
        isListening = false;
        if (listenTimeoutId) {
          window.clearTimeout(listenTimeoutId);
          listenTimeoutId = null;
        }
        voiceCommandBtn.textContent = "Comando por voz";
        setDiagValue(diagListeningState, "inactivo");

        if (!heardTranscriptInSession && sessionDuration < 900 && !autoRetriedOnce) {
          autoRetriedOnce = true;
          setStatus("Reintentando escucha automaticamente...");
          try {
            recognition.start();
            return;
          } catch (error) {
            setDiagValue(diagLastError, `retry-failed:${error.message || "unknown"}`);
          }
        }

        if (!heardTranscriptInSession) {
          setStatus("No se detecto un comando. Habla justo despues de pulsar el boton.");
        }
      });

      recognition.addEventListener("error", (event) => {
        heardTranscriptInSession = false;
        setDiagValue(diagLastError, event.error);
        if (event.error === "not-allowed") {
          isListening = false;
          voiceCommandBtn.textContent = "Comando por voz";
          setDiagValue(diagListeningState, "error");
          setStatus("Permiso de microfono denegado. Habilitalo en el navegador.");
          return;
        }
        if (event.error === "audio-capture") {
          isListening = false;
          voiceCommandBtn.textContent = "Comando por voz";
          setDiagValue(diagListeningState, "error");
          setStatus("No se detecta microfono disponible.");
          return;
        }
        if (event.error === "no-speech") {
          isListening = false;
          voiceCommandBtn.textContent = "Comando por voz";
          setDiagValue(diagListeningState, "sin voz");
          setStatus("No se detecto voz. Intenta hablar mas cerca del microfono.");
          return;
        }
        if (event.error === "network") {
          isListening = false;
          voiceCommandBtn.textContent = "Comando por voz";
          setDiagValue(diagListeningState, "error de red");
          setStatus("Error de red del reconocimiento de voz. Reintenta en Chrome/Edge.");
          return;
        }
        isListening = false;
        voiceCommandBtn.textContent = "Comando por voz";
        setDiagValue(diagListeningState, "error");
        setStatus(`No se pudo procesar la voz (${event.error}). Intenta nuevamente.`);
      });

      recognition.addEventListener("nomatch", () => {
        setDiagValue(diagLastError, "nomatch");
        setStatus("Se detecto audio, pero no se entendio el comando.");
      });
    }
  }

  if (micTestBtn) {
    micTestBtn.addEventListener("click", async () => {
      if (micTestStream) {
        stopMicTest();
        setStatus("Prueba de microfono detenida.");
        return;
      }
      await startMicTest();
    });
  }
}
