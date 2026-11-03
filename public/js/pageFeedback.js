(() => {
    const root = document.getElementById("page-feedback");
    if (!root) return;
    const message = document.getElementById("page-feedback-message");
    const dismiss = document.getElementById("page-feedback-dismiss");
    let active = false;
    let pendingForm = null;
    let pendingButton = null;
    let pendingLabel = null;
    let previousLabel = "";
    let slowTimer;

    function show(state, text) {
        root.hidden = false;
        root.dataset.state = state;
        message.textContent = text;
        dismiss.hidden = state !== "error";
    }

    function reset() {
        clearTimeout(slowTimer);
        active = false;
        pendingForm?.removeAttribute("aria-busy");
        pendingButton?.removeAttribute("aria-busy");
        if (pendingLabel) pendingLabel.textContent = previousLabel;
        pendingForm = null;
        pendingButton = null;
        pendingLabel = null;
        root.hidden = true;
        root.dataset.state = "idle";
    }

    function start(text, form = null, button = null) {
        reset();
        active = true;
        pendingForm = form;
        pendingButton = button;
        form?.setAttribute("aria-busy", "true");
        button?.setAttribute("aria-busy", "true");
        pendingLabel = button?.querySelector("[data-submit-label]");
        if (pendingLabel) {
            previousLabel = pendingLabel.textContent;
            pendingLabel.textContent = text;
        }
        show("loading", text);
        slowTimer = setTimeout(() => {
            show("slow", form?.method.toLowerCase() === "post"
                ? "Está tardando más de lo habitual. Espera sin volver a enviar el formulario."
                : "La carga está tardando más de lo habitual. Espera un momento.");
        }, 10000);
    }

    function fail(text) {
        reset();
        show("error", text);
    }

    document.addEventListener("submit", event => {
        if (event.defaultPrevented) return;
        const form = event.target;
        if (!(form instanceof HTMLFormElement) || form.target && form.target !== "_self" || form.method === "dialog") return;
        if (active && pendingForm === form) {
            event.preventDefault();
            return;
        }
        const destination = new URL(event.submitter?.hasAttribute("formaction") ? event.submitter.formAction : form.action, location.href);
        if (destination.origin !== location.origin) return;
        const labels = { "/login": "Iniciando sesión...", "/register": "Creando cuenta..." };
        const text = form.dataset.loadingMessage || labels[destination.pathname]
            || (form.enctype === "multipart/form-data" ? "Subiendo e importando archivo..."
                : form.method.toLowerCase() === "get" ? "Cargando resultados..."
                    : form.id === "examForm" ? "Guardando respuestas..." : "Guardando cambios...");
        start(text, form, event.submitter);
    });

    document.addEventListener("click", event => {
        if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        const link = event.target.closest?.("a[href]");
        if (!link || link.hasAttribute("download") || link.target && link.target !== "_self") return;
        const destination = new URL(link.href, location.href);
        if (destination.origin !== location.origin || !["http:", "https:"].includes(destination.protocol)) return;
        if (destination.pathname === location.pathname && destination.search === location.search && destination.hash) return;
        start("Cargando...");
    });

    dismiss.addEventListener("click", reset);
    window.addEventListener("pageshow", reset);
    window.addEventListener("offline", () => {
        if (active) {
            clearTimeout(slowTimer);
            show("slow", "Sin conexión. La operación no está confirmada; no vuelvas a enviarla hasta comprobar su estado.");
        }
    });
    window.appFeedback?.onNavigation(state => {
        if (state.status === "loading" && !active) start("Cargando...");
        if (state.status === "ready") reset();
        if (state.status === "error") fail("No se pudo cargar la página. La operación no está confirmada.");
    });
})();