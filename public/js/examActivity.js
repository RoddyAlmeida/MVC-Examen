(() => {
    const panel = document.querySelector("[data-exam-activity]");
    if (!panel) return;
    const rows = panel.querySelector("[data-activity-rows]");
    const count = panel.querySelector("[data-activity-count]");
    const status = panel.querySelector("[data-activity-status]");
    const refreshButton = panel.querySelector("[data-activity-refresh]");
    let attempts = [];
    let receivedAt = performance.now();
    let serverTime = 0;
    let refreshing = false;

    function duration(seconds) {
        const total = Math.max(0, Math.floor(seconds));
        const hours = Math.floor(total / 3600);
        const minutes = Math.floor(total % 3600 / 60);
        return `${hours ? `${hours} h ` : ""}${minutes} min ${total % 60} s`;
    }

    function responding(attempt, elapsed) {
        return attempt.state === "responding" && serverTime + elapsed * 1000 - Date.parse(attempt.lastSeenAt) <= 45000;
    }

    function tick() {
        const elapsed = (performance.now() - receivedAt) / 1000;
        count.textContent = String(attempts.filter(attempt => responding(attempt, elapsed)).length);
        attempts.forEach((attempt, index) => {
            const row = rows.children[index];
            row.querySelector("[data-duration]").textContent = duration(attempt.elapsedSeconds + elapsed);
            row.querySelector("[data-presence]").textContent = responding(attempt, elapsed) ? "Respondiendo" : "Sin actividad reciente";
        });
    }

    function render() {
        rows.replaceChildren();
        if (!attempts.length) {
            const row = document.createElement("tr");
            const cell = document.createElement("td");
            cell.colSpan = 5;
            cell.textContent = "No hay intentos en curso.";
            row.appendChild(cell);
            rows.appendChild(row);
        }
        attempts.forEach(attempt => {
            const row = document.createElement("tr");
            [attempt.student.name, "", new Date(attempt.startedAt).toLocaleTimeString("es"), "", new Date(attempt.lastSeenAt).toLocaleTimeString("es")].forEach((value, index) => {
                const cell = document.createElement("td");
                cell.textContent = value;
                if (index === 1) cell.dataset.presence = "";
                if (index === 3) { cell.dataset.duration = ""; cell.className = "activity-duration"; }
                row.appendChild(cell);
            });
            rows.appendChild(row);
        });
        tick();
    }

    async function refresh(force = false) {
        if (refreshing || document.hidden && !force) return;
        refreshing = true;
        refreshButton.disabled = true;
        refreshButton.setAttribute?.("aria-busy", "true");
        if (force || !serverTime) status.textContent = "Consultando actividad...";
        try {
            const response = await fetch(panel.dataset.activityUrl, { cache: "no-store", headers: { Accept: "application/json" }, signal: globalThis.AbortSignal?.timeout?.(15000) });
            if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) throw new Error("Unavailable");
            const data = await response.json();
            attempts = data.attempts;
            serverTime = Date.parse(data.updatedAt);
            receivedAt = performance.now();
            render();
            status.textContent = `Actualizado: ${new Date(data.updatedAt).toLocaleTimeString("es")}`;
        } catch (_error) { status.textContent = "No se pudo actualizar la actividad. Reintentando..."; }
        finally {
            refreshing = false;
            refreshButton.disabled = false;
            refreshButton.removeAttribute?.("aria-busy");
        }
    }

    refreshButton.addEventListener("click", () => refresh(true));
    document.addEventListener("visibilitychange", () => refresh());
    let poll = setInterval(refresh, 5000);
    let clock = setInterval(() => { if (!document.hidden) tick(); }, 1000);
    window.addEventListener("pagehide", () => { clearInterval(poll); clearInterval(clock); });
    window.addEventListener("pageshow", event => {
        if (!event.persisted) return;
        clearInterval(poll);
        clearInterval(clock);
        poll = setInterval(refresh, 5000);
        clock = setInterval(() => { if (!document.hidden) tick(); }, 1000);
        refresh();
    });
    refresh(true);
})();