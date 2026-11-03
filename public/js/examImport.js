(() => {
    const form = document.getElementById("examImportForm");
    if (!form) return;

    const fileInput = document.getElementById("qtiPackage");
    const submitButton = document.getElementById("importSubmit");
    const status = document.getElementById("importStatus");

    fileInput.addEventListener("change", () => {
        const file = fileInput.files[0];
        if (!file) {
            submitButton.disabled = true;
            status.textContent = "Elige un paquete ZIP de hasta 10 MB.";
            return;
        }
        if (!file.name.toLowerCase().endsWith(".zip")) {
            submitButton.disabled = true;
            fileInput.value = "";
            status.textContent = "Solo se admiten paquetes QTI con extensión .zip.";
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            submitButton.disabled = true;
            fileInput.value = "";
            status.textContent = "El paquete supera el límite de 10 MB.";
            return;
        }
        submitButton.disabled = false;
        status.textContent = `Paquete listo: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
    });
})();
