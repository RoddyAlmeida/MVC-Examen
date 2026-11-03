(() => {
    const session = document.querySelector("[data-exam-session]");
    if (!session) return;
    const endpoint = `/student/exams/${session.dataset.examId}/heartbeat`;
    let stopped = false;
    let sending = false;
    let queued = false;
    let internalNavigation = false;

    function payload(action) {
        return new URLSearchParams({ _csrf: session.dataset.csrfToken, token: session.dataset.securityToken, action });
    }

    async function pulse() {
        if (stopped) return;
        if (sending) { queued = true; return; }
        sending = true;
        try {
            const response = await fetch(endpoint, { method: "POST", body: payload(document.hidden || session.inert ? "leave" : "heartbeat") });
            if (response.redirected || [400, 403, 409].includes(response.status)) stopped = true;
        } catch (_error) {} finally {
            sending = false;
            if (queued) { queued = false; pulse(); }
        }
    }

    let timer = setInterval(pulse, 15000);
    document.addEventListener("visibilitychange", pulse);
    new MutationObserver(pulse).observe(session, { attributes: true, attributeFilter: ["inert"] });
    document.getElementById("examForm")?.addEventListener("submit", () => { internalNavigation = true; });
    document.addEventListener("click", event => {
        const anchor = event.target.closest("a[href]");
        if (anchor) {
            const url = new URL(anchor.href);
            if (url.origin === location.origin && url.pathname === location.pathname) internalNavigation = true;
        }
    });
    window.addEventListener("pagehide", () => {
        stopped = true;
        clearInterval(timer);
        if (!internalNavigation) {
            const body = payload("leave");
            if (!navigator.sendBeacon?.(endpoint, body)) fetch(endpoint, { method: "POST", body, keepalive: true }).catch(() => {});
        }
    });
    window.addEventListener("pageshow", event => {
        if (!event.persisted) return;
        stopped = false;
        internalNavigation = false;
        clearInterval(timer);
        timer = setInterval(pulse, 15000);
        pulse();
    });
    pulse();
})();