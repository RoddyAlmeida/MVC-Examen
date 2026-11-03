(() => {
    function open(dialog) {
        if (dialog && !dialog.open) dialog.showModal();
    }

    function reset(dialog) {
        delete dialog.dataset.redirect;
        const form = dialog.querySelector("[data-user-form]");
        form.reset();
        form.hidden = false;
        const status = dialog.querySelector("[data-dialog-status]");
        status.hidden = true;
        status.textContent = "";
        status.classList.remove("is-error", "is-success");
        dialog.querySelector("[data-dialog-finish]").hidden = true;
    }

    function message(dialog, text, state) {
        const status = dialog.querySelector("[data-dialog-status]");
        status.hidden = false;
        status.textContent = text;
        status.setAttribute("role", state === "error" ? "alert" : "status");
        status.classList.toggle("is-error", state === "error");
        status.classList.toggle("is-success", state === "success");
    }

    document.addEventListener("click", event => {
        const trigger = event.target.closest?.("[data-dialog-open], [data-dialog-close], [data-user-action]");
        if (!trigger) return;
        if (trigger.hasAttribute("data-dialog-close")) {
            const dialog = trigger.closest("dialog");
            if (dialog?.dataset.pending !== "true") dialog?.close();
            return;
        }
        if (trigger.dataset.dialogOpen) {
            open(document.getElementById(trigger.dataset.dialogOpen));
            return;
        }
        const action = trigger.dataset.userAction;
        const account = JSON.parse(trigger.dataset.account || "{}");
        const dialog = document.getElementById(action === "delete" ? "admin-delete-user-dialog" : "admin-account-dialog");
        reset(dialog);
        const form = dialog.querySelector("form");
        if (action === "delete") {
            form.action = `/admin/users/${account.id}/delete`;
            dialog.querySelector("[data-delete-user-name]").textContent = account.name || account.email;
        } else {
            const editing = action === "edit";
            form.action = editing ? `/admin/users/${account.id}/update` : "/admin/users";
            dialog.querySelector("h2").textContent = editing ? "Editar usuario" : "Nuevo usuario";
            form.elements.name.value = editing ? account.name : "";
            form.elements.email.value = editing ? account.email : "";
            form.elements.role.value = editing ? account.role : "estudiante";
            form.elements.password.required = !editing;
            form.elements.password.placeholder = editing ? "Sin cambios" : "Mínimo 8 caracteres";
            document.getElementById("account-password-label").textContent = editing ? "Nueva contraseña" : "Contraseña";
            form.querySelector("[data-submit-label]").textContent = editing ? "Guardar cambios" : "Crear usuario";
        }
        open(dialog);
    });

    document.querySelectorAll("dialog.admin-dialog").forEach(dialog => {
        dialog.addEventListener("keydown", event => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            if (dialog.dataset.pending !== "true") dialog.close();
        });
        dialog.addEventListener("cancel", event => {
            if (dialog.dataset.pending === "true") event.preventDefault();
        });
        dialog.addEventListener("close", () => {
            const password = dialog.querySelector('input[type="password"]');
            if (password) password.value = "";
            if (dialog.dataset.redirect) location.assign(dialog.dataset.redirect);
        });
    });

    document.querySelectorAll("[data-user-form]").forEach(form => {
        form.addEventListener("submit", async event => {
            event.preventDefault();
            const dialog = form.closest("dialog");
            if (dialog.dataset.pending === "true") return;
            const body = new URLSearchParams(new FormData(form));
            const controls = [...dialog.querySelectorAll("button, input, select")].map(control => [control, control.disabled]);
            const button = form.querySelector('button[type="submit"]');
            const label = button.querySelector("[data-submit-label]");
            const previousLabel = label.textContent;
            label.textContent = "Procesando...";
            controls.forEach(([control]) => { control.disabled = true; });
            dialog.dataset.pending = "true";
            form.setAttribute("aria-busy", "true");
            button.setAttribute("aria-busy", "true");
            message(dialog, "Procesando la solicitud...", "loading");
            const slow = setTimeout(() => message(dialog, "Está tardando más de lo habitual. Espera sin volver a enviar la solicitud.", "loading"), 10000);
            try {
                const reply = await fetch(form.action, {
                    method: "POST", body, headers: { Accept: "application/json" },
                    signal: AbortSignal.timeout(30000),
                });
                if (reply.redirected || !reply.headers.get("content-type")?.includes("application/json")) throw new Error("Unconfirmed response");
                const result = await reply.json();
                if (!reply.ok) {
                    message(dialog, result.message || "No se pudo completar la operación.", "error");
                    dialog.querySelector("[data-dialog-status]").focus();
                    return;
                }
                const destination = new URL(result.redirect, location.origin);
                if (destination.origin !== location.origin || !/^\/admin\/users(?:\/\d+)?$/.test(destination.pathname)) throw new Error("Invalid response");
                dialog.dataset.redirect = destination.pathname;
                form.hidden = true;
                const finish = dialog.querySelector("[data-dialog-finish]");
                finish.hidden = false;
                finish.textContent = "Listo";
                message(dialog, result.message, "success");
            } catch (_error) {
                form.hidden = true;
                dialog.dataset.redirect = "/admin/users";
                const finish = dialog.querySelector("[data-dialog-finish]");
                finish.hidden = false;
                finish.textContent = "Comprobar estado";
                message(dialog, "No se pudo confirmar la operación. Comprueba el listado antes de volver a enviarla.", "error");
            } finally {
                clearTimeout(slow);
                delete dialog.dataset.pending;
                controls.forEach(([control, disabled]) => { control.disabled = disabled; });
                form.removeAttribute("aria-busy");
                button.removeAttribute("aria-busy");
                label.textContent = previousLabel;
                if (form.hidden) dialog.querySelector("[data-dialog-finish]").focus();
            }
        });
    });
})();