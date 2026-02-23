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

// Apply saved theme
function applyTheme() {
    let theme = JSON.parse(localStorage.getItem("twledTheme") || "{}");
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
    shell.openExternal('https://tomsworldph-my.sharepoint.com/:f:/g/personal/alexander_fernandez_tomsworld_com_ph/EsFLbkWSnd9HrWgJrJmp318B0NlLb56zShA1BNbNoQXD1A?e=cEGorC')
}

// Opens the latest release of TWLED-GUI in default browser
function openRelease() {
    const { shell } = require('electron')
    shell.openExternal('https://tomsworldph-my.sharepoint.com/:f:/g/personal/alexander_fernandez_tomsworld_com_ph/EsFLbkWSnd9HrWgJrJmp318B0NlLb56zShA1BNbNoQXD1A?e=cEGorC')
}

// Shows all Lighs in main page
function showLights() {
    var lights = JSON.parse(localStorage.getItem("lights"));
    var txt = "";
    var oldTxt = document.getElementById("lights").innerHTML;
    for (let index = 0; index < lights.length; index++) {
        const element = lights[index];
        txt += "<div class=\"light\" onclick=\"goToTWled(" + index + ")\" style=\"cursor: pointer;\">\n<br>\n";
        // Light mode
        if (ui.theme.base == "light") {
            txt += "<img src=\"images/icon_power.png\" id=\"img" + index + "\" class=\"darkicon ";
        }
        else {
            txt += "<img src=\"images/icon_power.png\" id=\"img" + index + "\" class=\"icon ";
        }
        if (element.on === true) {
            txt += "on";
        }
        txt += "\" onclick=\"toggleLight(" + index + ");\" height=\"75\">\n";
        txt += "<h5>" + element.name + "</h5>\n" + element.ip;
        if (element.online === false) {
            txt += " (Offline)\n";
        } else if (element.online === true) {
            txt += " (Online)\n";
        }
        txt += "<br><br></div><hr>";
    }
    if (txt !== oldTxt) {
        document.getElementById("lights").innerHTML = txt;
    }
}

// Shows all Lighs in delete page
function showLightsDel() {
    var lights = JSON.parse(localStorage.getItem("lights"));
    var txt = "";
    for (let index = 0; index < lights.length; index++) {
        const element = lights[index];
        txt += "<div class=\"light\">\n<br>\n";
        txt += "<img src=\"images/icon_delete.png\" onclick=\"del(" + index + ")\" class=\"icon del\" height=75>\n";
        txt += "<h5>" + element.name + "</h5>\n" + element.ip;
        if (element.online === false) {
            txt += " (Offline)\n";
        } else if (element.online === true) {
            txt += " (Online)\n";
        }
        txt += "<br><br></div><hr>";
    }
    document.getElementById("lights").innerHTML = txt;
}

// Shows all Lights in rename page
function showLightsRename() {
    var lights = JSON.parse(localStorage.getItem("lights"));
    var txt = "";
    for (let index = 0; index < lights.length; index++) {
        const element = lights[index];
        txt += "<div class=\"light\">\n<br>\n";
        txt += "<img src=\"images/icon_modify.png\" onclick=\"openRenameDialog(" + index + ")\" class=\"icon\" height=75 style=\"cursor: pointer;\">\n";
        txt += "<h5>" + element.name + "</h5>\n" + element.ip;
        if (element.online === false) {
            txt += " (Offline)\n";
        } else if (element.online === true) {
            txt += " (Online)\n";
        }
        txt += "<br><br></div><hr>";
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
    xhr.send();
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

