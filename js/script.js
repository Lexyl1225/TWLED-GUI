// Electron-log not available in renderer context via import; use console as fallback
var verbose = console.log;

// Simple auth guard: redirect to login if a protected page is accessed without authentication
var currentPath = window.location.pathname || "";
var isLoginPage = currentPath.indexOf("login.html") !== -1;
if (!isLoginPage) {
    var isAuthenticated = sessionStorage.getItem("authenticated") === "true";
    var blockedUntil = parseInt(localStorage.getItem("loginBlockedUntil") || "0", 10);
    if (!isAuthenticated || (blockedUntil && blockedUntil > Date.now())) {
        window.location.href = "login.html";
    }
}

function logout() {
    sessionStorage.removeItem("authenticated");
    window.location.href = "login.html";
}

function getIdleTimeoutMs() {
    var minutes = parseInt(localStorage.getItem("idleTimeoutMinutes") || "1", 10);
    if (!minutes || minutes < 1) {
        minutes = 1;
        localStorage.setItem("idleTimeoutMinutes", String(minutes));
    }
    return minutes * 60 * 1000;
}

var idleTimerId = null;
function scheduleIdleLogout() {
    if (idleTimerId) {
        clearTimeout(idleTimerId);
    }
    idleTimerId = setTimeout(handleIdleTimeout, getIdleTimeoutMs());
}

function handleIdleTimeout() {
    // don't log out while an app update is downloading/installing (set by js/updater.js)
    if (window.twledUpdateInProgress) {
        scheduleIdleLogout();
        return;
    }
    try {
        if (typeof M !== "undefined" && M.toast) {
            M.toast({ html: 'Session timed out due to inactivity', displayLength: 2000 });
        }
    } catch (e) {
        console.log('Session timed out due to inactivity');
    }
    logout();
}

function initIdleWatcher() {
    if (isLoginPage) {
        return;
    }
    var events = ['click', 'mousemove', 'keydown', 'touchstart', 'scroll'];
    events.forEach(function (evt) {
        window.addEventListener(evt, scheduleIdleLogout, { passive: true });
    });
    scheduleIdleLogout();
}

initIdleWatcher();

document.getElementById("logo").addEventListener("click", openRepositorie);
// the imgClicked variable prevents the goToTWled() function from beeing triggerd when clicking in a button
var imgClicked = false;

// Light mode
if (localStorage.getItem("twledUiCfg") === null) {
    var ui = {
        theme: {
            base: "dark"
        }
    };
} else {
    var ui = JSON.parse(localStorage.getItem("twledUiCfg"));
    if (ui.theme.base == "light") {
        document.body.style.backgroundColor = "#8e19dbff";
        document.body.style.color = "black";
    }
}

// create json
if (localStorage.getItem("lights") === null) {
    verbose("No local storage item found. Creating one...");
    var lights = [];
    json = JSON.stringify(lights);
    localStorage.setItem("lights", json);
}

// "#rrggbb" -> [r, g, b]
function hexToRgb(hex) {
    var value = String(hex || "").replace("#", "");
    return [
        parseInt(value.slice(0, 2), 16) || 0,
        parseInt(value.slice(2, 4), 16) || 0,
        parseInt(value.slice(4, 6), 16) || 0
    ];
}

// [r, g, b(, w)] -> "#rrggbb"
function rgbToHex(rgb) {
    return "#" + rgb.slice(0, 3).map(function (v) {
        return ("0" + (v | 0).toString(16)).slice(-2);
    }).join("");
}

// Sets the accent color plus a readable text color to put on top of it
function setAccentColor(color) {
    var root = document.documentElement;
    if (!color) {
        root.style.removeProperty("--theme-color");
        root.style.removeProperty("--theme-ink");
        return;
    }
    var rgb = hexToRgb(color);
    var luminance = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
    root.style.setProperty("--theme-color", color);
    root.style.setProperty("--theme-ink", luminance > 0.5 ? "#0b0d12" : "#ffffff");
}

// Apply saved theme
function applyTheme() {
    let theme = JSON.parse(localStorage.getItem("twledTheme") || "{}");
    setAccentColor(theme.themeColor);
    if (theme.backgroundColor) {
        document.body.style.backgroundColor = theme.backgroundColor;
    }
    if (theme.backgroundImage) {
        document.body.style.backgroundImage = "url('" + theme.backgroundImage + "')";
        document.body.style.backgroundSize = "cover";
        document.body.style.backgroundAttachment = "fixed";
        document.body.style.backgroundRepeat = "no-repeat";
    }
}

applyTheme();
// Default PC Mode on
if (localStorage.getItem("pcm") === null) {
    localStorage.setItem("pcm", true);
}

// Opens Github page in default browser
function openRepositorie() {
    const { shell } = require('electron')
    shell.openExternal('https://github.com/Lexyl1225/TWLED-GUI')
}

// Opens the latest release of TWLED-GUI in default browser
function openRelease() {
    const { shell } = require('electron')
    shell.openExternal('https://github.com/Lexyl1225/TWLED-GUI/releases')
}

// Escapes text before it goes into innerHTML (device names come from the network)
function escapeHtml(value) {
    return String(value === undefined || value === null ? "" : value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

// Inline SVG icons used by the light cards
var icons = {
    power: "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M12 2v10\"/><path d=\"M18.4 6.6a9 9 0 1 1-12.8 0\"/></svg>",
    trash: "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M3 6h18\"/><path d=\"M8 6V4h8v2\"/><path d=\"m19 6-1 14H6L5 6\"/></svg>",
    pencil: "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M12 20h9\"/><path d=\"M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z\"/></svg>",
    sun: "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"12\" r=\"4\"/><path d=\"M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4\"/></svg>"
};

// Status dot, name and "ip · Online/Offline" shared by all light cards
function lightMetaHtml(element) {
    var state = "unknown";
    var status = "";
    if (element.online === true) {
        state = "online";
        status = " · Online";
    } else if (element.online === false) {
        state = "offline";
        status = " · Offline";
    }
    return "<span class=\"status-dot " + state + "\"></span>" +
        "<div class=\"device-meta\">" +
        "<h5 class=\"device-name\">" + escapeHtml(element.name) + "</h5>" +
        "<span class=\"device-sub\">" + escapeHtml(element.ip) + status + "</span>" +
        "</div>";
}

function emptyStateHtml(title, text, withAddButton) {
    var txt = "<div class=\"empty-state\"><h3>" + title + "</h3><p>" + text + "</p>";
    if (withAddButton) {
        txt += "<a class=\"btn-primary\" href=\"add.html\">Add a light</a>";
    }
    return txt + "</div>";
}

// Shows all Lighs in main page
var lastLightsHtml = null;
function showLights() {
    var container = document.getElementById("lights");
    // don't rebuild the cards while a brightness slider or color picker is in use
    var active = document.activeElement;
    if (active && active.tagName === "INPUT" && container.contains(active)) {
        return;
    }
    var lights = JSON.parse(localStorage.getItem("lights"));
    var txt = "";
    for (let index = 0; index < lights.length; index++) {
        const element = lights[index];
        var offline = element.online === false ? " disabled" : "";
        var bri = typeof element.bri === "number" ? element.bri : 128;
        var briPct = Math.round(bri / 255 * 100);
        var color = /^#[0-9a-f]{6}$/i.test(element.color) ? element.color : "#ffffff";
        txt += "<article class=\"light device" + (offline ? " is-offline" : "") + "\" onclick=\"goToTWled(" + index + ")\">";
        txt += "<div class=\"device-top\">" + lightMetaHtml(element);
        // Light mode
        txt += "<button type=\"button\" id=\"img" + index + "\" class=\"round-btn " + (ui.theme.base == "light" ? "darkicon" : "icon");
        if (element.on === true) {
            txt += " on";
        }
        txt += "\" onclick=\"toggleLight(" + index + ");\" title=\"Toggle power\" aria-pressed=\"" + (element.on === true) + "\">" + icons.power + "</button>";
        txt += "</div>";
        // clicks on the controls must not open the TWLED page
        txt += "<div class=\"device-controls\" onclick=\"event.stopPropagation()\">";
        txt += "<span class=\"ctrl-icon\">" + icons.sun + "</span>";
        txt += "<input type=\"range\" class=\"bri-slider\" min=\"1\" max=\"255\" value=\"" + bri + "\" style=\"--fill: " + briPct + "%\" aria-label=\"Brightness\"" + offline;
        txt += " oninput=\"previewBrightness(this)\" onchange=\"setBrightness(" + index + ", this.value)\" onpointerup=\"releaseControl(this)\">";
        txt += "<output class=\"bri-value\">" + briPct + "%</output>";
        txt += "<input type=\"color\" class=\"color-swatch\" value=\"" + color + "\" aria-label=\"Color\" title=\"Color\"" + offline;
        txt += " onchange=\"setColor(" + index + ", this.value); releaseControl(this);\">";
        txt += "</div></article>";
    }
    if (lights.length === 0) {
        txt = emptyStateHtml("No lights yet", "Discover lights on your network or add one by IP address.", true);
    }
    if (txt !== lastLightsHtml) {
        container.innerHTML = txt;
        lastLightsHtml = txt;
    }
}

// Shows all Lighs in delete page
function showLightsDel() {
    var lights = JSON.parse(localStorage.getItem("lights"));
    var txt = "";
    for (let index = 0; index < lights.length; index++) {
        const element = lights[index];
        txt += "<article class=\"light device\"><div class=\"device-top\">" + lightMetaHtml(element);
        txt += "<button type=\"button\" onclick=\"del(" + index + ")\" class=\"round-btn del\" title=\"Remove " + escapeHtml(element.name) + "\">" + icons.trash + "</button>";
        txt += "</div></article>";
    }
    if (lights.length === 0) {
        txt = emptyStateHtml("Nothing to remove", "You haven't added any lights.", false);
    }
    document.getElementById("lights").innerHTML = txt;
}

// Shows all Lights in rename page
function showLightsRename() {
    var lights = JSON.parse(localStorage.getItem("lights"));
    var txt = "";
    for (let index = 0; index < lights.length; index++) {
        const element = lights[index];
        txt += "<article class=\"light device\"><div class=\"device-top\">" + lightMetaHtml(element);
        txt += "<button type=\"button\" onclick=\"openRenameDialog(" + index + ")\" class=\"round-btn\" title=\"Rename " + escapeHtml(element.name) + "\">" + icons.pencil + "</button>";
        txt += "</div></article>";
    }
    if (lights.length === 0) {
        txt = emptyStateHtml("Nothing to rename", "You haven't added any lights.", false);
    }
    document.getElementById("lights").innerHTML = txt;
}

// Track the current index being renamed
var currentRenameIndex = null;

// Open rename dialog
function openRenameDialog(index) {
    var lights = JSON.parse(localStorage.getItem("lights"));
    var currentName = lights[index].name;
    currentRenameIndex = index;
    document.getElementById("renameInput").value = currentName;
    document.getElementById("renameInput").focus();
    var modal = M.Modal.getInstance(document.getElementById("renameModal"));
    modal.open();
}

// Confirm rename and save
function confirmRename() {
    if (currentRenameIndex !== null) {
        var lights = JSON.parse(localStorage.getItem("lights"));
        var newName = document.getElementById("renameInput").value.trim();
        if (newName !== "") {
            lights[currentRenameIndex].name = newName;
            localStorage.setItem("lights", JSON.stringify(lights));
            showLightsRename();
        }
        currentRenameIndex = null;
        var modal = M.Modal.getInstance(document.getElementById("renameModal"));
        modal.close();
    }
}

// get the status of lights
// check if on or off and connection to them
function getStatus(doneCallback) {
    var lights = JSON.parse(localStorage.getItem("lights")) || [];
    if (lights.length === 0) {
        if (typeof doneCallback === 'function') doneCallback();
        return;
    }
    var remaining = lights.length;
    for (let index = 0; index < lights.length; index++) {
        (function(idx) {
            const ip = lights[idx].ip;

            let xhr = new XMLHttpRequest();
            xhr.open('GET', 'http://' + ip + "/json", true);
            xhr.onload = function () {
                try {
                    var json = JSON.parse(xhr.response);
                    lights[idx].online = true;
                    lights[idx].on = json.state.on;
                    lights[idx].version = json.info.ver;
                    lights[idx].bri = json.state.bri;
                    var seg = json.state.seg && json.state.seg[0];
                    if (seg && Array.isArray(seg.col) && Array.isArray(seg.col[0])) {
                        lights[idx].color = rgbToHex(seg.col[0]);
                    }
                } catch (e) {
                    lights[idx].online = false;
                }
                localStorage.setItem("lights", JSON.stringify(lights));
                showLights();
                remaining--;
                if (remaining === 0 && typeof doneCallback === 'function') doneCallback();
            };
            xhr.onerror = function () {
                lights[idx].online = false;
                localStorage.setItem("lights", JSON.stringify(lights));
                showLights();
                remaining--;
                if (remaining === 0 && typeof doneCallback === 'function') doneCallback();
            }
            xhr.send();
        })(index);
    }
}

// Refresh helper: disable refresh button, show toast, and re-enable when polling completes
function refreshStatus() {
    var btn = document.getElementById('refreshBtn');
    if (btn) {
        btn.style.pointerEvents = 'none';
        btn.style.opacity = '0.5';
    }
    try {
        M.toast({html: 'Refreshing...', displayLength: 1500});
    } catch (e) {
        console.log('Refreshing...');
    }
    getStatus(function() {
        if (btn) {
            btn.style.pointerEvents = '';
            btn.style.opacity = '';
        }
        try {
            M.toast({html: 'Refresh complete', displayLength: 1500});
        } catch (e) {
            console.log('Refresh complete');
        }
    });
}

// opens the TWLED page and set the correct ip address to localstorage
function goToTWled(index) {
    // doesent trigger when a button is clicked
    if (imgClicked !== true) {
        var lights = JSON.parse(localStorage.getItem("lights"));
        var ip = lights[index].ip;
        var version = lights[index].version;
        localStorage.setItem("locIp", ip);
        localStorage.setItem("locVersion", version);
        location.href = "twled-viewer.html";
    }
}

// toggels the light
function toggleLight(index) {
    imgClicked = true;
    var lights = JSON.parse(localStorage.getItem("lights"));
    var ip = lights[index].ip;
    var xhr = new XMLHttpRequest();
    xhr.open('GET', 'http://' + ip + "/win&T=2", true);
    xhr.onload = function () {
        imgClicked = false;
        getStatus();
    };
    // without this an unreachable light would leave imgClicked stuck and block opening any light
    xhr.onerror = function () {
        imgClicked = false;
        getStatus();
    };
    xhr.send();
}

// sends a WLED HTTP API command to a light, e.g. "A=128"
function sendCommand(light, params) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', 'http://' + light.ip + "/win&" + params, true);
    xhr.onload = function () {
        getStatus();
    };
    xhr.onerror = function () {
        try {
            M.toast({ html: 'Could not reach ' + escapeHtml(light.name), displayLength: 2000 });
        } catch (e) {
            console.log('Could not reach ' + light.name);
        }
    };
    xhr.send();
}

// updates the slider fill and percentage while dragging
function previewBrightness(slider) {
    var pct = Math.round(slider.value / 255 * 100);
    slider.style.setProperty("--fill", pct + "%");
    var output = slider.parentNode.querySelector(".bri-value");
    if (output) {
        output.textContent = pct + "%";
    }
}

// sets the brightness (1-255) of a light
function setBrightness(index, value) {
    var lights = JSON.parse(localStorage.getItem("lights"));
    lights[index].bri = parseInt(value, 10);
    localStorage.setItem("lights", JSON.stringify(lights));
    sendCommand(lights[index], "A=" + lights[index].bri);
}

// sets the primary color ("#rrggbb") of a light
function setColor(index, hex) {
    var lights = JSON.parse(localStorage.getItem("lights"));
    var rgb = hexToRgb(hex);
    lights[index].color = hex.toLowerCase();
    localStorage.setItem("lights", JSON.stringify(lights));
    sendCommand(lights[index], "R=" + rgb[0] + "&G=" + rgb[1] + "&B=" + rgb[2]);
}

// drops focus after a touch/mouse interaction so status polling can re-render the cards again
function releaseControl(control) {
    setTimeout(function () {
        control.blur();
    }, 0);
}

// deletes a light from localstorage
function del(index) {
    var lights = JSON.parse(localStorage.getItem("lights"));
    lights.splice(index, 1);
    localStorage.setItem("lights", JSON.stringify(lights));
    showLightsDel();
}

// set remind later time
function remindLater() {
    localStorage.setItem('remindLaterTime', Date.now());
}

function sync() {
    getStatus();
    setTimeout(sync, 10000);
}

