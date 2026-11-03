(() => {
    const form = document.getElementById("questionEditor");
    if (!form) return;

    const typeSelect = document.getElementById("questionType");
    const optionList = document.getElementById("choiceOptions");

    function updatePreview() {
        const preview = document.querySelector("[data-preview-options]");
        if (!preview) return;
        document.querySelector("[data-preview-type]").textContent = typeSelect.selectedOptions[0].textContent.trim();
        document.querySelector("[data-preview-prompt]").textContent = form.elements.prompt.value.trim() || "Enunciado de la pregunta";
        preview.replaceChildren();
        const type = typeSelect.value;
        const options = type === "multiple_choice" ? [...optionList.querySelectorAll('input[type="text"]')].map((input, index) => input.value || `Opción ${index + 1}`) : type === "true_false" ? ["Verdadero", "Falso"] : [];
        if (options.length) {
            options.forEach(text => {
                const row = document.createElement("div");
                row.className = "question-preview-option";
                const radio = document.createElement("input");
                radio.type = "radio";
                radio.disabled = true;
                radio.setAttribute("aria-hidden", "true");
                const label = document.createElement("span");
                label.textContent = text;
                row.append(radio, label);
                preview.append(row);
            });
        } else {
            const text = document.createElement("p");
            text.className = "question-preview-answer";
            text.textContent = type === "fill_drag" ? form.elements.fillTemplate.value || "Frase con {{blank}}" : type === "crossword" ? form.elements.crosswordEntries.value || "Palabras y pistas" : "Respuesta del estudiante";
            preview.append(text);
        }
    }

    function updateTypeFields() {
        form.querySelectorAll("[data-type-fields]").forEach((section) => {
            const active = section.dataset.typeFields === typeSelect.value;
            section.hidden = !active;
            section.querySelectorAll("input, textarea, select, button").forEach((field) => {
                field.disabled = !active;
            });
        });
        updatePreview();
    }

    function renumberOptions() {
        const rows = [...optionList.querySelectorAll(".choice-option-row")];
        rows.forEach((row, index) => {
            const radio = row.querySelector('input[type="radio"]');
            const text = row.querySelector('input[type="text"]');
            radio.value = String(index);
            radio.setAttribute("aria-label", `Marcar opción ${index + 1} como correcta`);
            text.placeholder = `Opción ${index + 1}`;
            text.setAttribute("aria-label", `Opción ${index + 1}`);
            row.querySelector("button").setAttribute("aria-label", `Eliminar opción ${index + 1}`);
        });
        optionList.querySelectorAll(".remove-option").forEach((button) => {
            button.disabled = rows.length <= 2;
        });
        updatePreview();
    }

    document.getElementById("addOption").addEventListener("click", () => {
        const row = document.createElement("div");
        row.className = "choice-option-row";
        row.innerHTML = '<input type="radio" name="correctIndex"><input type="text" name="optionText[]" class="form-input"><button type="button" class="btn btn-secondary remove-option" aria-label="Eliminar opción"><i class="ti ti-x" aria-hidden="true"></i></button>';
        optionList.append(row);
        renumberOptions();
        row.querySelector('input[type="text"]').focus();
    });

    optionList.addEventListener("click", (event) => {
        const button = event.target.closest(".remove-option");
        if (!button || optionList.querySelectorAll(".choice-option-row").length <= 2) return;
        const row = button.closest(".choice-option-row");
        const wasCorrect = row.querySelector('input[type="radio"]').checked;
        row.remove();
        renumberOptions();
        if (wasCorrect) optionList.querySelector('input[type="radio"]').checked = true;
    });

    typeSelect.addEventListener("change", updateTypeFields);
    form.addEventListener("input", updatePreview);
    updateTypeFields();
    renumberOptions();
})();
