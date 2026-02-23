(function () {
    const DEFAULT_USERNAME = "Admin";
    const DEFAULT_PASSWORD = "@admin123";
    const MAX_ATTEMPTS = 10;
    const LOCK_DURATION_MS = 10 * 60 * 1000; // 10 minutes

    const form = document.getElementById("loginForm");
    const usernameInput = document.getElementById("username");
    const passwordInput = document.getElementById("password");
    const lockMessage = document.getElementById("lockMessage");
    const loginBtn = document.getElementById("loginBtn");

    if (!form) {
        return;
    }

    function toast(message) {
        try {
            M.toast({ html: message, displayLength: 2000 });
        } catch (e) {
            console.log(message);
        }
    }

    function getStoredCredentials() {
        const defaults = { username: DEFAULT_USERNAME, password: DEFAULT_PASSWORD };
        try {
            const raw = localStorage.getItem("appCredentials");
            if (!raw) {
                return defaults;
            }
            const parsed = JSON.parse(raw);
            if (parsed && parsed.username && parsed.password) {
                return parsed;
            }
        } catch (error) {
            console.warn("Invalid credential payload, reverting to defaults", error);
        }
        return defaults;
    }

    function getRemainingLockMs() {
        const blockedUntil = parseInt(localStorage.getItem("loginBlockedUntil") || "0", 10);
        if (!blockedUntil) {
            return 0;
        }
        const diff = blockedUntil - Date.now();
        if (diff <= 0) {
            localStorage.removeItem("loginBlockedUntil");
            localStorage.removeItem("loginAttempts");
            return 0;
        }
        return diff;
    }

    function formatDuration(ms) {
        const totalSeconds = Math.ceil(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes}m ${seconds}s`;
    }

    function toggleForm(disabled) {
        usernameInput.disabled = disabled;
        passwordInput.disabled = disabled;
        loginBtn.disabled = disabled;
    }

    let lockInterval;
    function updateLockState() {
        const remaining = getRemainingLockMs();
        if (remaining > 0) {
            toggleForm(true);
            const msg = `Too many attempts. Try again in ${formatDuration(remaining)}.`;
            lockMessage.textContent = msg;
            if (!lockInterval) {
                lockInterval = setInterval(() => {
                    const stillRemaining = getRemainingLockMs();
                    if (stillRemaining > 0) {
                        lockMessage.textContent = `Too many attempts. Try again in ${formatDuration(stillRemaining)}.`;
                    } else {
                        clearInterval(lockInterval);
                        lockInterval = null;
                        lockMessage.textContent = "";
                        toggleForm(false);
                    }
                }, 1000);
            }
            return true;
        } else {
            if (lockInterval) {
                clearInterval(lockInterval);
                lockInterval = null;
            }
            toggleForm(false);
            lockMessage.textContent = "";
            return false;
        }
    }

    const initialCreds = getStoredCredentials();
    if (usernameInput) {
        usernameInput.value = initialCreds.username;
        setTimeout(() => {
            if (window.M && typeof M.updateTextFields === "function") {
                M.updateTextFields();
            }
        }, 0);
    }

    function handleSuccess() {
        sessionStorage.setItem("authenticated", "true");
        localStorage.removeItem("loginAttempts");
        localStorage.removeItem("loginBlockedUntil");
        window.location.href = "index.html";
    }

    function handleFailure() {
        let attempts = parseInt(localStorage.getItem("loginAttempts") || "0", 10);
        attempts += 1;
        localStorage.setItem("loginAttempts", attempts);
        toast("wrong password try again!");
        if (attempts >= MAX_ATTEMPTS) {
            const blockedUntil = Date.now() + LOCK_DURATION_MS;
            localStorage.setItem("loginBlockedUntil", String(blockedUntil));
            updateLockState();
        }
    }

    if (sessionStorage.getItem("authenticated") === "true" && getRemainingLockMs() === 0) {
        window.location.href = "index.html";
        return;
    }

    updateLockState();

    form.addEventListener("submit", function (event) {
        event.preventDefault();
        if (updateLockState()) {
            toast("wrong password try again!");
            return;
        }
        const username = (usernameInput.value || "").trim();
        const password = passwordInput.value || "";
        const credentials = getStoredCredentials();
        if (username === credentials.username && password === credentials.password) {
            handleSuccess();
        } else {
            handleFailure();
        }
    });
})();
