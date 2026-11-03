(() => {
    const form = document.getElementById("examForm");
    if (!form) return;

    function selectDragChoice(questionId, value) {
        const select = form.querySelector(`[data-drag-select="${questionId}"]`);
        if (!select) return;
        select.value = value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
    }

    form.querySelectorAll("[data-drag-choice]").forEach((choice) => {
        choice.addEventListener("click", () => selectDragChoice(choice.dataset.dragChoice, choice.dataset.choiceValue));
        choice.addEventListener("dragstart", (event) => {
            event.dataTransfer.setData("text/plain", choice.dataset.choiceValue);
            event.dataTransfer.setData("application/x-question-id", choice.dataset.dragChoice);
        });
    });

    form.querySelectorAll("[data-drop-answer]").forEach((target) => {
        target.addEventListener("dragover", (event) => event.preventDefault());
        target.addEventListener("drop", (event) => {
            event.preventDefault();
            const questionId = event.dataTransfer.getData("application/x-question-id");
            if (questionId === target.dataset.dropAnswer) {
                selectDragChoice(questionId, event.dataTransfer.getData("text/plain"));
            }
        });
    });

    form.querySelectorAll("[data-drag-select]").forEach((select) => {
        const target = form.querySelector(`[data-drop-answer="${select.dataset.dragSelect}"]`);
        select.addEventListener("change", () => {
            if (target) target.textContent = select.value || "Suelta o selecciona una respuesta";
        });
    });

    form.querySelectorAll("[data-crossword-cell]").forEach((cell) => {
        cell.addEventListener("input", () => {
            cell.value = [...cell.value].slice(-1)[0]?.toLocaleUpperCase("es") || "";
            if (cell.value) {
                const cells = [...form.querySelectorAll(`[data-crossword-cell="${cell.dataset.crosswordCell}"]`)];
                cells[cells.indexOf(cell) + 1]?.focus();
            }
        });
        cell.addEventListener("keydown", (event) => {
            const cells = [...form.querySelectorAll(`[data-crossword-cell="${cell.dataset.crosswordCell}"]`)];
            const index = cells.indexOf(cell);
            if (event.key === "Backspace" && !cell.value && index > 0) cells[index - 1].focus();
            if (event.key === "ArrowRight") cells[index + 1]?.focus();
            if (event.key === "ArrowLeft") cells[index - 1]?.focus();
            if (event.key === "Enter") event.preventDefault();
        });
    });
})();
