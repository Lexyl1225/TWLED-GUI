// logging instance (use electron-log when available)
var log;
try {
    log = require('electron-log');
} catch (e) {
    log = console;
}

var ipcRenderer = null;
try {
    ipcRenderer = require('electron').ipcRenderer;
} catch (e) {
    log.warn("Updater: ipcRenderer not available, automatic install disabled");
}

// fallback only; the real version comes from the main process (package.json)
const twledGuiVersionFallback = "0.7.5";
const updateRepo = "Lexyl1225/TWLED-GUI";
const remindLaterMs = 259200000; // 3 days

var twledGuiVersion = twledGuiVersionFallback;
var updateRelease = null;     // { version, name, notes, date, url }
var updateAsset = null;       // { name, url, size } for this OS, or null
var updateState = "idle";     // idle | available | downloading | installing | opened | error
var updateModal = null;

// ---------- helpers ----------

function parseVersion(v) {
    return String(v || "").trim().replace(/^v/i, "").split(/[-+]/)[0].split(".").map(function (n) {
        return parseInt(n, 10) || 0;
    });
}

// > 0 if a is newer than b
function compareVersions(a, b) {
    var x = parseVersion(a), y = parseVersion(b);
    for (var i = 0; i < Math.max(x.length, y.length); i++) {
        var d = (x[i] || 0) - (y[i] || 0);
        if (d !== 0) return d;
    }
    return 0;
}

function formatBytes(bytes) {
    if (!bytes) return "0 MB";
    return (bytes / 1048576).toFixed(1) + " MB";
}

function cleanIpcError(err) {
    var msg = (err && err.message) ? err.message : String(err);
    return msg.replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
}

// picks the installer that matches this OS / CPU from the release assets
function pickAsset(assets) {
    var exts;
    if (process.platform === "win32") {
        exts = [".exe", ".msi"];
    } else if (process.platform === "darwin") {
        exts = [".dmg", ".pkg"];
    } else if (process.env.APPIMAGE) {
        exts = [".appimage"];
    } else {
        var fs = require("fs");
        if (fs.existsSync("/usr/bin/dpkg")) exts = [".deb", ".appimage"];
        else if (fs.existsSync("/usr/bin/rpm")) exts = [".rpm", ".appimage"];
        else exts = [".appimage"];
    }
    var archNames = {
        x64: ["x64", "amd64", "x86_64"],
        arm64: ["arm64", "aarch64"],
        ia32: ["ia32", "i386", "x86"]
    };
    var mine = archNames[process.arch] || [process.arch];
    var foreign = [];
    Object.keys(archNames).forEach(function (k) {
        if (k !== process.arch) foreign = foreign.concat(archNames[k]);
    });
    var hasArch = function (name, list) {
        return list.some(function (a) { return new RegExp("[-_.]" + a + "([-_.]|$)", "i").test(name); });
    };

    for (var i = 0; i < exts.length; i++) {
        var candidates = (assets || []).filter(function (a) {
            return a && a.browser_download_url && a.name.toLowerCase().endsWith(exts[i]);
        });
        var match = candidates.find(function (a) { return hasArch(a.name, mine); }) ||
            candidates.find(function (a) { return !hasArch(a.name, foreign); });
        if (match) {
            return { name: match.name, url: match.browser_download_url, size: match.size || 0 };
        }
    }
    return null;
}

// ---------- modal rendering ----------

function el(id) {
    return document.getElementById(id);
}

function setFooter(buttons) {
    var footer = el("updatePopupFooter");
    footer.innerHTML = "";
    buttons.forEach(function (b) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = b.cls;
        btn.textContent = b.label;
        btn.addEventListener("click", b.onClick);
        footer.appendChild(btn);
    });
}

function setProgress(mode, received, total) {
    var wrap = el("updateProgress");
    var bar = el("updateProgressBar");
    var text = el("updateProgressText");
    if (mode === "hidden") {
        wrap.hidden = true;
        return;
    }
    wrap.hidden = false;
    if (mode === "indeterminate" || !total) {
        bar.className = "indeterminate";
        bar.style.width = "";
        text.textContent = received ? formatBytes(received) + " downloaded" : "";
    } else {
        var pct = Math.min(100, Math.floor(received / total * 100));
        bar.className = "determinate";
        bar.style.width = pct + "%";
        text.textContent = pct + "% · " + formatBytes(received) + " of " + formatBytes(total);
    }
}

function closeUpdateModal() {
    if (updateModal) updateModal.close();
    updateState = "idle";
}

function openReleasePage() {
    var url = updateRelease && updateRelease.url;
    if (url) {
        require("electron").shell.openExternal(url);
    } else if (typeof openRelease === "function") {
        openRelease();
    }
}

function renderUpdate(state, info) {
    updateState = state;
    // keep the session alive while an update is running (see handleIdleTimeout in script.js)
    window.twledUpdateInProgress = (state === "downloading" || state === "installing");

    var title = el("updatePopupTitle");
    var text = el("updatePopupText");
    var details = el("updateDetails");
    var notes = el("updateNotes");
    var v = updateRelease ? updateRelease.version : "";

    details.hidden = true;
    notes.hidden = true;
    el("updatePopup").classList.toggle("is-error", state === "error");

    switch (state) {
        case "available":
            title.textContent = "New update available!";
            text.textContent = "TWLED-GUI " + v + " is ready to download. You are using version " + twledGuiVersion + ".";
            details.hidden = false;
            el("updateDetailVersion").textContent = twledGuiVersion + " → " + v;
            el("updateDetailDate").textContent = updateRelease.date || "–";
            el("updateDetailFile").textContent = updateAsset
                ? updateAsset.name + " (" + formatBytes(updateAsset.size) + ")"
                : "No installer for your system in this release";
            if (updateRelease.notes) {
                notes.hidden = false;
                notes.textContent = updateRelease.notes;
            }
            setProgress("hidden");
            var buttons = [
                { label: "Remind me later", cls: "btn-ghost", onClick: function () { remindLater(); closeUpdateModal(); } },
                { label: "Not now", cls: "btn-secondary", onClick: closeUpdateModal }
            ];
            if (updateAsset && ipcRenderer) {
                buttons.push({ label: "Download & install", cls: "btn-primary", onClick: startUpdate });
            } else {
                buttons.push({ label: "Open release page", cls: "btn-primary", onClick: function () { openReleasePage(); closeUpdateModal(); } });
            }
            setFooter(buttons);
            break;

        case "downloading":
            title.textContent = "Downloading update…";
            text.textContent = "Downloading TWLED-GUI " + v + ". It will be installed automatically when the download finishes.";
            setProgress("determinate", 0, updateAsset.size);
            setFooter([{ label: "Cancel", cls: "btn-secondary", onClick: cancelUpdate }]);
            break;

        case "installing":
            title.textContent = "Installing update…";
            text.textContent = "Download complete. TWLED-GUI will now close, install version " + v + " and restart automatically.";
            setProgress("indeterminate");
            el("updateProgressText").textContent = "Installing…";
            setFooter([]);
            break;

        case "opened":
            title.textContent = "Installer opened";
            text.textContent = "The installer for TWLED-GUI " + v + " has been opened. Follow its steps to finish the update.";
            setProgress("hidden");
            setFooter([{ label: "Close", cls: "btn-primary", onClick: closeUpdateModal }]);
            break;

        case "error":
            title.textContent = "Update failed";
            text.textContent = (info || "Something went wrong.") + " You can try again or download the update manually.";
            setProgress("hidden");
            setFooter([
                { label: "Close", cls: "btn-ghost", onClick: closeUpdateModal },
                { label: "Open release page", cls: "btn-secondary", onClick: function () { openReleasePage(); closeUpdateModal(); } },
                { label: "Retry", cls: "btn-primary", onClick: startUpdate }
            ]);
            break;
    }
}

// ---------- download + auto install ----------

function startUpdate() {
    if (!updateAsset || !ipcRenderer) return;
    renderUpdate("downloading");
    ipcRenderer.invoke("update:start", updateAsset).then(function (result) {
        if (result === "installing") {
            localStorage.setItem("pendingUpdateVersion", updateRelease.version);
            renderUpdate("installing");
        } else {
            renderUpdate("opened");
        }
    }).catch(function (err) {
        var msg = cleanIpcError(err);
        log.warn("Update failed: " + msg);
        if (msg === "Download cancelled") {
            renderUpdate("available");
            M.toast({ html: "Update download cancelled", displayLength: 2000 });
        } else {
            renderUpdate("error", msg.replace(/\.?$/, "."));
        }
    });
}

function cancelUpdate() {
    if (ipcRenderer) ipcRenderer.invoke("update:cancel");
}

if (ipcRenderer) {
    ipcRenderer.on("update:progress", function (event, p) {
        if (updateState === "downloading") {
            setProgress("determinate", p.received, p.total);
        }
    });
    ipcRenderer.on("update:status", function (event, s) {
        if (s && s.state === "installing" && updateRelease) {
            localStorage.setItem("pendingUpdateVersion", updateRelease.version);
            renderUpdate("installing");
        }
    });
}

// ---------- update check ----------

function showUpdateAvailable() {
    if (!updateModal) return;
    renderUpdate("available");
    updateModal.open();
    sessionStorage.setItem("updateReminder", "true");
}

// checks if a update is available
function checkForUpdate() {
    let xhr = new XMLHttpRequest();
    xhr.open('GET', 'https://api.github.com/repos/' + updateRepo + '/releases/latest', true);
    xhr.setRequestHeader("Accept", "application/vnd.github+json");
    xhr.timeout = 5000; // 5 second timeout

    xhr.onload = function () {
        try {
            if (xhr.status !== 200) {
                log.warn("Update check failed: HTTP " + xhr.status);
                return;
            }
            var release = JSON.parse(xhr.responseText);
            var latest = String(release.tag_name || release.name || "").trim().replace(/^v/i, "");
            if (!latest || release.draft || release.prerelease) {
                return;
            }
            log.debug("Latest TWLED-GUI Version: " + latest);
            if (compareVersions(latest, twledGuiVersion) <= 0) {
                return;
            }
            log.info("New update available: " + latest);
            updateRelease = {
                version: latest,
                name: release.name || latest,
                notes: String(release.body || "").trim(),
                date: release.published_at ? new Date(release.published_at).toLocaleDateString() : "",
                url: release.html_url || ("https://github.com/" + updateRepo + "/releases")
            };
            updateAsset = pickAsset(release.assets);
            if (!updateAsset) {
                log.warn("No update asset found for " + process.platform + "/" + process.arch);
            }
            showUpdateAvailable();
        } catch (e) {
            log.warn("Update check parsing error: " + e.message);
        }
    };

    xhr.onerror = function () {
        log.warn("Update check failed: Network error");
    };

    xhr.ontimeout = function () {
        log.warn("Update check timed out");
    };

    xhr.send();
}

// shows a toast after the app restarted from an automatic install
function reportFinishedUpdate() {
    var pending = localStorage.getItem("pendingUpdateVersion");
    if (!pending) return;
    localStorage.removeItem("pendingUpdateVersion");
    if (compareVersions(twledGuiVersion, pending) >= 0) {
        M.toast({ html: "TWLED-GUI was updated to version " + escapeHtml(twledGuiVersion), displayLength: 4000 });
    } else {
        M.toast({ html: "The update to version " + escapeHtml(pending) + " was not installed", displayLength: 4000 });
    }
}

function initUpdater() {
    var popup = el("updatePopup");
    if (popup) {
        // not dismissible: an outside click must not hide a running download
        updateModal = M.Modal.init(popup, { dismissible: false });
    }

    var versionReady = ipcRenderer
        ? ipcRenderer.invoke("update:get-version").catch(function () { return twledGuiVersionFallback; })
        : Promise.resolve(twledGuiVersionFallback);

    versionReady.then(function (version) {
        twledGuiVersion = version || twledGuiVersionFallback;
        log.debug("Current TWLED-GUI Version: " + twledGuiVersion);
        reportFinishedUpdate();

        if (sessionStorage.getItem("updateReminder") === null) {
            var remindTime = localStorage.getItem("remindLaterTime");
            if (remindTime === null || (Date.now() - remindTime) >= remindLaterMs) {
                checkForUpdate();
            }
        }
    });
}

initUpdater();
