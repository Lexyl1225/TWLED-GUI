// Shows the app version (read from the VERSION file in the project root) on every page.
// A page can place it explicitly with an element carrying [data-app-version];
// otherwise a small badge is added to the bottom-right corner.
(function () {
    function readVersion() {
        try {
            const fs = require("fs");
            const path = require("path");
            return fs.readFileSync(path.join(__dirname, "VERSION"), "utf8").trim();
        } catch (e) {
            return "";
        }
    }

    function render() {
        const version = readVersion();
        if (!version) return;
        const label = "v" + version;

        const slots = document.querySelectorAll("[data-app-version]");
        if (slots.length) {
            slots.forEach(function (slot) { slot.textContent = label; });
            return;
        }

        const badge = document.createElement("div");
        badge.className = "app-version-badge";
        badge.textContent = label;
        badge.title = "TWLED-GUI " + label;
        document.body.appendChild(badge);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", render);
    } else {
        render();
    }
})();
