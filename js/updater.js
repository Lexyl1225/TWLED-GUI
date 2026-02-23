// logging instance (use electron-log when available)
var log;
try {
    log = require('electron-log');
} catch (e) {
    log = console;
}

// set version
const twledGuiVersion = "0.7.3";
log.debug("Current TWLED-GUI Version: " + twledGuiVersion);

if (sessionStorage.getItem("updateReminder") === null) {
    if (localStorage.getItem("remindLaterTime") === null || (Date.now() - localStorage.getItem("remindLaterTime")) >= 259200000) {  // 3 days
        checkForUpdate();
    }
}

// checks if a update is available
function checkForUpdate() {
    let xhr = new XMLHttpRequest();
    xhr.open('GET', 'https://tomsworldph-my.sharepoint.com/:f:/g/personal/alexander_fernandez_tomsworld_com_ph/IgBaJ91yvKJtT6l7NSlGShVFASeWvYxBNL8Wyjn4odmrHg4?e=QQ5EuN', true);
    xhr.timeout = 5000; // 5 second timeout
    
    xhr.onload = function () {
        try {
            if (xhr.response && xhr.response.trim() !== twledGuiVersion) {
                log.info("New update available!");
                let instance = M.Modal.getInstance(document.getElementById("updatePopup"));
                if (instance) {
                    document.getElementById("updatePopupText").innerText = "A new update for TWLED-GUI is available.\n\nYour version: " + twledGuiVersion + "\nLatest version: " + xhr.response;
                    instance.open();
                    sessionStorage.setItem("updateReminder", "true");
                }
            }
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