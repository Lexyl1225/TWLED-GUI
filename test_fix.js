// Test file to verify fixes
// This file verifies the button click works

// Check if event listeners are attached
console.log("Button element:", document.getElementById("discoverLightsButton"));
console.log("Select element:", document.getElementById("scanMethod"));

// Check if scanLights function is defined
console.log("scanLights function:", typeof scanLights);

// Test a click
setTimeout(() => {
    const button = document.getElementById("discoverLightsButton");
    const select = document.getElementById("scanMethod");
    console.log("Button text:", button.innerText);
    console.log("Selected method:", select.value);
    
    // Try clicking
    button.click();
    console.log("Clicked button");
}, 1000);
