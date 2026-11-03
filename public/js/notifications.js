(() => {
    const badges = document.querySelectorAll("[data-notification-count]");
    if (!badges.length) return;
    async function refresh() {
        if (document.hidden) return;
        try {
            const response = await fetch("/professor/notifications/count", { headers: { Accept: "application/json" } });
            if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) return;
            const { unread } = await response.json();
            badges.forEach(badge => { badge.textContent = unread ? `(${unread})` : ""; });
        } catch (_error) {}
    }
    refresh();
    setInterval(refresh, 15000);
    document.addEventListener("visibilitychange", refresh);
})();