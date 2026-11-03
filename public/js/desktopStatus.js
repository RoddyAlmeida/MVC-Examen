(() => {
    const title = document.getElementById("desktop-status-title");
    const message = document.getElementById("desktop-status-message");
    const warning = document.getElementById("desktop-status-warning");
    const retry = document.getElementById("desktop-retry");
    const main = document.querySelector("main");
    const spinner = document.querySelector(".page-feedback-spinner");
    let slowTimer;
    window.appFeedback?.onNavigation(state => {
        clearTimeout(slowTimer);
        const failed = state.status === "error";
        title.textContent = failed ? "No se pudo completar la conexión" : state.stage === "startup" ? "Iniciando aplicación" : "Conectando de nuevo";
        message.textContent = failed ? "El servicio no está disponible. Comprueba tu conexión e inténtalo de nuevo." : "Conectando con el servicio de datos...";
        main.setAttribute("aria-busy", String(!failed));
        spinner.hidden = failed;
        warning.hidden = !failed;
        retry.hidden = !failed;
        retry.disabled = false;
        if (!failed) slowTimer = setTimeout(() => { message.textContent = "La conexión está tardando más de lo habitual. Espera un momento."; }, 10000);
    });
    retry.addEventListener("click", () => {
        retry.disabled = true;
        window.appFeedback?.retry();
    });
})();