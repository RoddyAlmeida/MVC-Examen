(() => {
    const toggle = document.getElementById("timerEnabled");
    if (toggle) {
        const duration = document.getElementById("timerDuration");
        const input = document.getElementById("timeLimitMinutes");
        toggle.addEventListener("change", () => {
            duration.hidden = !toggle.checked;
            input.disabled = !toggle.checked;
            input.required = toggle.checked;
        });
    }

    const timer = document.querySelector("[data-exam-timer]");
    const form = document.getElementById("examForm");
    if (!timer || !form) return;
    const clock = timer.querySelector("[data-timer-clock]");
    const status = timer.querySelector("[data-timer-status]");
    const origin = { monotonic: performance.now(), wall: Date.now() };
    const now = () => Math.max(performance.now() - origin.monotonic, Date.now() - origin.wall);
    let deadline = Number(timer.dataset.remainingMs);
    let navigating = false;
    let saving = false;
    let dirty = false;
    let warned = false;
    let expiring = false;
    let waitingSubmission = false;
    let pendingSave = Promise.resolve();
    let interval;

    function finish() {
        if (navigating || expiring) return;
        expiring = true;
        clearInterval(interval);
        status.textContent = "Tiempo agotado";
        form.noValidate = true;
        form.requestSubmit();
    }

    function tick() {
        const remaining = Math.max(0, deadline - now());
        const seconds = Math.ceil(remaining / 1000);
        clock.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
        timer.classList.toggle("is-urgent", seconds <= 60);
        if (seconds <= 60 && !warned) {
            warned = true;
            status.textContent = "Queda menos de un minuto";
        }
        if (!seconds) finish();
    }

    async function save() {
        if (navigating || saving || !dirty) return;
        saving = true;
        dirty = false;
        status.textContent = warned ? "Guardando respuestas. Queda menos de un minuto" : "Guardando respuestas...";
        const body = new URLSearchParams(new FormData(form));
        body.set("_saveAnswers", "on");
        const sentAt = now();
        try {
            const reply = await fetch(form.action, { method: "POST", body, headers: { Accept: "application/json" } });
            if (!reply.ok || !reply.headers.get("content-type")?.includes("application/json")) throw new Error("Save failed");
            const result = await reply.json();
            if (navigating) return;
            if (result.finished) {
                navigating = true;
                clearInterval(interval);
                form.dispatchEvent(new Event("submit", { bubbles: true }));
                location.assign(result.redirect);
                return;
            }
            deadline = sentAt + result.remainingMs;
            status.textContent = warned ? "Queda menos de un minuto" : "Respuestas guardadas";
            tick();
        } catch (_error) {
            dirty = true;
            status.textContent = "No se pudo guardar. Reintentando...";
        } finally {
            saving = false;
        }
    }

    function queueSave() {
        if (!saving && !expiring) pendingSave = save();
    }

    form.addEventListener("input", () => { dirty = true; });
    form.addEventListener("change", () => { dirty = true; queueSave(); });
    document.getElementById("clearAnswersBtn")?.addEventListener("click", () => { dirty = true; queueSave(); });
    form.addEventListener("submit", event => {
        if (saving && !navigating) {
            event.preventDefault();
            status.textContent = "Guardando respuestas antes de enviar...";
            if (!waitingSubmission) {
                waitingSubmission = true;
                pendingSave.then(() => {
                    waitingSubmission = false;
                    if (!navigating) form.requestSubmit(event.submitter);
                });
            }
            return;
        }
        navigating = true;
        clearInterval(interval);
    });
    window.addEventListener("pagehide", () => { navigating = true; clearInterval(interval); });
    window.addEventListener("pageshow", event => { if (event.persisted) location.reload(); });
    document.addEventListener("visibilitychange", () => { tick(); queueSave(); });
    interval = setInterval(() => { tick(); queueSave(); }, 500);
    tick();
})();