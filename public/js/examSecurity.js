(() => {
    const session = document.querySelector("[data-exam-session]");
    if (!session) { window.examSecurity?.exitFullscreen(); return; }
    const mode = session.dataset.securityMode;
    if (mode === "none") { window.examSecurity?.exitFullscreen(); return; }
    const endpoint = `/student/exams/${session.dataset.examId}/security-events`;
    let navigating = false;
    let outside = false;
    let overlay = null;

    function report(type) {
        const body = new URLSearchParams({ _csrf: session.dataset.csrfToken, token: session.dataset.securityToken, eventId: crypto.randomUUID(), type });
        if (navigator.sendBeacon?.(endpoint, body)) return;
        fetch(endpoint, { method: "POST", body, keepalive: true }).catch(() => {});
    }

    async function resume() {
        if (mode === "locked" && !window.examSecurity && !document.fullscreenElement) {
            try { await document.documentElement.requestFullscreen(); } catch (_error) { return; }
        }
        if (window.examSecurity) window.examSecurity.enterFullscreen(mode);
        overlay?.remove();
        overlay = null;
        session.inert = false;
        outside = false;
    }

    function showReturn() {
        if (overlay || navigating) return;
        overlay = document.createElement("div");
        overlay.className = "security-overlay";
        overlay.setAttribute("role", "dialog");
        overlay.setAttribute("aria-modal", "true");
        overlay.setAttribute("aria-label", "Volver al examen");
        overlay.innerHTML = '<div class="security-overlay-content"><h2>Modo restringido</h2><button class="btn btn-primary" type="button"><i class="ti ti-arrows-maximize" aria-hidden="true"></i> Volver al examen</button></div>';
        document.body.appendChild(overlay);
        session.inert = true;
        const button = overlay.querySelector("button");
        button.addEventListener("click", resume);
        button.focus();
    }

    function left(type) {
        if (navigating || outside) return;
        outside = true;
        report(type);
        if (mode === "locked") showReturn();
    }

    window.addEventListener("blur", () => left("blur"));
    document.addEventListener("visibilitychange", () => {
        if (document.hidden) left("hidden");
        else if (mode === "monitored") outside = false;
    });
    window.addEventListener("focus", () => { if (mode === "monitored") outside = false; });
    document.addEventListener("fullscreenchange", () => {
        if (mode === "locked" && !document.fullscreenElement && !window.examSecurity) left("fullscreen_exit");
    });
    window.addEventListener("pagehide", () => { if (!navigating) report("navigation"); });
    window.addEventListener("beforeunload", event => {
        if (mode === "locked" && !navigating) { event.preventDefault(); event.returnValue = ""; }
    });
    document.addEventListener("click", event => {
        const anchor = event.target.closest("a[href]");
        if (!anchor) return;
        const url = new URL(anchor.href);
        if (url.origin === location.origin && url.pathname === location.pathname) {
            navigating = true;
            window.examSecurity?.exitFullscreen();
            return;
        }
        if (mode === "locked") { event.preventDefault(); left("navigation"); }
    });
    document.getElementById("examForm")?.addEventListener("submit", () => {
        navigating = true;
        window.examSecurity?.exitFullscreen();
    });
    if (window.examSecurity) {
        window.examSecurity.enterFullscreen(mode);
        window.examSecurity.onSecurityEvent(data => { if (data.type === "left") left("blur"); else if (data.type === "returned" && mode === "monitored") outside = false; });
    } else if (mode === "locked") {
        showReturn();
    }
})();
