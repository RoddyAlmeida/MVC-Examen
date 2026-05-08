(function () {
  if (!window.examSecurity) return;

  var overlayEl = null;
  var warningEl = null;
  var countdownInterval = null;

  window.examSecurity.onSecurityEvent(function (data) {
    if (data.type === "left") {
      showCountdown();
    } else if (data.type === "returned") {
      hideCountdown();
    } else if (data.type === "failed") {
      failExam();
    }
  });

  function showCountdown() {
    if (overlayEl) return;
    if (warningEl) return;

    var seconds = 2;

    warningEl = document.createElement("div");
    warningEl.className = "security-warning";
    warningEl.setAttribute("role", "alert");
    warningEl.innerHTML =
      '<span class="security-warning-icon">&#9888;</span>' +
      '<span class="security-warning-text">Has salido del entorno del examen. Vuelve en <strong id="securityCountdown">' + seconds + '</strong> segundos o el examen sera invalidado.</span>';

    document.body.appendChild(warningEl);

    countdownInterval = setInterval(function () {
      seconds--;
      var el = document.getElementById("securityCountdown");
      if (el) el.textContent = seconds;
    }, 1000);
  }

  function hideCountdown() {
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
    if (warningEl) {
      if (warningEl.parentNode) warningEl.parentNode.removeChild(warningEl);
      warningEl = null;
    }
  }

  function failExam() {
    hideCountdown();
    if (overlayEl) return;

    var closeSeconds = 5;

    overlayEl = document.createElement("div");
    overlayEl.className = "security-overlay";
    overlayEl.setAttribute("role", "alertdialog");
    overlayEl.setAttribute("aria-modal", "true");
    overlayEl.setAttribute("aria-label", "Examen invalidado");
    overlayEl.innerHTML =
      '<div class="security-overlay-content">' +
      '<h1 class="security-overlay-title">Examen Invalidado</h1>' +
      '<p class="security-overlay-desc">No has regresado al examen a tiempo.</p>' +
      '<p class="security-overlay-score">Puntaje: <strong>0</strong></p>' +
      '<p class="security-overlay-note">Esta decision no puede revertirse.</p>' +
      '<p class="security-overlay-autoclose">La aplicacion se cerrara en <strong id="closeCountdown">' + closeSeconds + '</strong> segundos.</p>' +
      "</div>";

    document.body.appendChild(overlayEl);

    var inputs = document.querySelectorAll("input, button, textarea, select");
    for (var i = 0; i < inputs.length; i++) {
      inputs[i].disabled = true;
    }

    var autoCloseTimer = setInterval(function () {
      closeSeconds--;
      var el = document.getElementById("closeCountdown");
      if (el) el.textContent = closeSeconds;
      if (closeSeconds <= 0) {
        clearInterval(autoCloseTimer);
        if (window.examSecurity && window.examSecurity.closeApp) {
          window.examSecurity.closeApp();
        }
      }
    }, 1000);
  }
})();
