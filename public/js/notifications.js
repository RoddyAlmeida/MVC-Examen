(() => {
    const badges = document.querySelectorAll("[data-notification-count]");
    if (!badges.length) return;
    let refreshing = false;
    let loaded = false;
    function state(value, description) {
        badges.forEach(badge => {
            badge.dataset.requestState = value;
            badge.title = description;
            badge.setAttribute("role", "status");
            badge.setAttribute("aria-label", description);
        });
    }
    async function refresh() {
        if (document.hidden || refreshing) return;
        refreshing = true;
        if (!loaded) state("loading", "Cargando notificaciones...");
        try {
            const response = await fetch("/professor/notifications/count", { headers: { Accept: "application/json" }, signal: globalThis.AbortSignal?.timeout?.(15000) });
            if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) throw new Error("Unavailable");
            const { unread } = await response.json();
            badges.forEach(badge => { badge.textContent = unread ? `(${unread})` : ""; });
            loaded = true;
            state("ready", `${unread} notificaciones sin leer`);
        } catch (_error) {
            state("error", "No se pudieron actualizar las notificaciones. Reintentando...");
        } finally {
            refreshing = false;
        }
    }
    refresh();
    setInterval(refresh, 15000);
    document.addEventListener("visibilitychange", refresh);
})();