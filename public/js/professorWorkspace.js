(() => {
    const form = document.getElementById("examDetailsForm");
    if (form) {
        function summarize() {
            const title = document.querySelector("[data-exam-summary-title]");
            const course = document.querySelector("[data-exam-summary-course]");
            const duration = document.querySelector("[data-exam-summary-duration]");
            const ranking = document.querySelector("[data-exam-summary-ranking]");
            title.textContent = form.elements.title.value.trim() || "Sin título";
            if (form.elements.courseId) course.textContent = form.elements.courseId.value ? form.elements.courseId.selectedOptions[0].textContent : "Sin seleccionar";
            duration.textContent = form.elements.timerEnabled.checked ? `${form.elements.timeLimitMinutes.value || '--'} min` : "Sin límite";
            ranking.textContent = form.elements.leaderboardEnabled.checked ? "Activado" : "Desactivado";
        }
        form.addEventListener("input", summarize);
        form.addEventListener("change", summarize);
        summarize();
    }
    const dialog = document.getElementById("professor-confirm");
    if (!dialog) return;
    let pendingForm;
    let submitter;
    let authorized;
    document.addEventListener("submit", event => {
        if (event.defaultPrevented || !event.target.matches("form[data-confirm-message]")) return;
        if (authorized === event.target) { authorized = null; return; }
        event.preventDefault();
        pendingForm = event.target;
        submitter = event.submitter;
        dialog.querySelector("[data-confirm-copy]").textContent = pendingForm.dataset.confirmMessage;
        dialog.showModal();
    });
    dialog.querySelectorAll("[data-confirm-cancel]").forEach(button => button.addEventListener("click", () => dialog.close()));
    dialog.addEventListener("keydown", event => {
        if (event.key === "Escape") { event.preventDefault(); dialog.close(); }
    });
    dialog.addEventListener("close", () => { pendingForm = null; submitter = null; });
    dialog.querySelector("[data-confirm-accept]").addEventListener("click", () => {
        const target = pendingForm;
        const button = submitter;
        authorized = target;
        dialog.close();
        if (target) target.requestSubmit(button);
    });
})();