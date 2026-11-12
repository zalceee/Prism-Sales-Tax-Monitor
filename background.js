
/*
==========================================================
PRISM SALES TAX MONITOR
BACKGROUND SERVICE WORKER
==========================================================
*/

const CONFIG = {

  API_URL:
    "https://script.google.com/macros/s/AKfycbzQWxkxoWOLgA9upH8z8GxPElYPsM8sLoIc-mNvcX2eEeoqWYQndNEtN5quZRX-8R4lYQ/exec",

  API_TOKEN:
    "aYmypD6hLe2NE-bYdYRN61aA3_XmeVPiR3Lwax8EjpU"

};


/*
==========================================================
SEND EMAIL THROUGH GOOGLE APPS SCRIPT
==========================================================
*/

async function sendTaxAlert(data) {

  if (!CONFIG.API_URL.startsWith(
    "https://script.google.com/macros/s/"
  )) {

    throw new Error("Invalid Google Apps Script API URL.");

  }

  const payload = {
    ...data,
    token: CONFIG.API_TOKEN
  };

  const response = await fetch(CONFIG.API_URL, {

    method: "POST",

    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },

    body: JSON.stringify(payload),

    redirect: "follow"

  });

  if (!response.ok) {

    throw new Error(
      "API HTTP error: " + response.status
    );

  }

  const result = await response.json();

  if (!result.success) {

    throw new Error(
      result.message || "Email API failed."
    );

  }

  return result;

}


/*
==========================================================
MESSAGE LISTENER
==========================================================
*/

chrome.runtime.onMessage.addListener(
  (message, sender, sendResponse) => {

    if (message.action !== "SEND_TAX_ALERT") {
      return;
    }

    sendTaxAlert(message.payload)

      .then(result => {

        sendResponse({
          success: true,
          result: result
        });

      })

      .catch(error => {

        console.error(
          "Prism Sales Tax Email Error:",
          error
        );

        sendResponse({
          success: false,
          message: error.message
        });

      });

    return true;

  }
);
