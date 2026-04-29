const pageRoot = document.querySelector("[data-page-read]");

if (!window.guidedSpeech) {
  window.guidedSpeech = (() => {
    let enabled = localStorage.getItem("guidedReadEnabled") !== "false";
    let lastText = "";
    let lastAt = 0;

    const getSpanishVoice = () => {
      if (!("speechSynthesis" in window)) {
        return null;
      }
      const voices = window.speechSynthesis.getVoices();
      return (
        voices.find((voice) => voice.lang.toLowerCase().startsWith("es")) ||
        voices.find((voice) => voice.lang.toLowerCase().includes("es")) ||
        null
      );
    };

    const internalSpeak = (text, force) => {
      if (!text || !("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
        return;
      }
      if (!force && !enabled) {
        return;
      }
      const now = Date.now();
      if (!force && text === lastText && now - lastAt < 700) {
        return;
      }
      lastText = text;
      lastAt = now;

      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      const spanishVoice = getSpanishVoice();
      if (spanishVoice) {
        utterance.voice = spanishVoice;
        utterance.lang = spanishVoice.lang;
      } else {
        utterance.lang = "es-ES";
      }
      utterance.rate = 0.95;
      utterance.pitch = 1;
      window.speechSynthesis.speak(utterance);
    };

    return {
      isEnabled: () => enabled,
      setEnabled: (value) => {
        enabled = Boolean(value);
        localStorage.setItem("guidedReadEnabled", String(enabled));
      },
      speak: (text) => internalSpeak(text, false),
      systemSpeak: (text) => internalSpeak(text, true),
      stop: () => {
        if ("speechSynthesis" in window) {
          window.speechSynthesis.cancel();
        }
      },
    };
  })();
}

if (pageRoot) {
  const speech = window.guidedSpeech;
  let keyboardNavigationMode = true;
  const introText = pageRoot.getAttribute("data-page-read");
  if (introText) {
    window.setTimeout(() => speech.speak(introText), 250);
  }

  document.addEventListener("keydown", () => {
    keyboardNavigationMode = true;
  });
  document.addEventListener("mousedown", () => {
    keyboardNavigationMode = false;
  });
  document.addEventListener("touchstart", () => {
    keyboardNavigationMode = false;
  });

  document.addEventListener("focusin", (event) => {
    if (!keyboardNavigationMode) {
      return;
    }
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const message = target.getAttribute("data-speak");
    if (message) {
      speech.speak(message);
    }
  });
}
