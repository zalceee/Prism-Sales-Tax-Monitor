
/*
==========================================================
PRISM SALES TAX MONITOR
CONTENT SCRIPT
==========================================================
*/

const CONFIG = {

    TENDER_BUTTON: "tenderbutton",

    ITEM_CONTAINER: [
        "#transactionItems",
        "#searchTransactionItemsResultList"
    ],

    TOLERANCE: 0.009,

    VAT_DIVISOR: 1.12,

    VAT_RATE: 0.12

};


/*
==========================================================
HELPERS
==========================================================
*/

function normalizeText(value) {

    return (value || "")
        .replace(/\s+/g, " ")
        .trim();

}


function parseMoney(value) {

    if (!value) return null;

    const match = String(value).match(
        /-?\s*\d[\d,]*(?:\.\d{1,2})?/
    );

    if (!match) return null;

    const result = Number(
        match[0].replace(/[,\s]/g, "")
    );

    return Number.isFinite(result) ? result : null;

}


function formatMoney(value) {

    return "PHP " + Number(value || 0).toLocaleString(
        "en-PH",
        {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }
    );

}


function roundMoney(value) {

    return Math.round(
        (value + Number.EPSILON) * 100
    ) / 100;

}


/*
==========================================================
GET TRANSACTION CONTAINER
==========================================================
*/

function getTransactionArea() {

    for (const selector of CONFIG.ITEM_CONTAINER) {

        const area = document.querySelector(selector);

        if (area) return area;

    }

    return null;

}


/*
==========================================================
GET TRANSACTION ITEMS
==========================================================
*/

function getTransactionItems() {

    const area = getTransactionArea();

    if (!area) return [];

    let elements = Array.from(
        area.querySelectorAll(
            '[ng-repeat*="thisTransactionItem"]'
        )
    );

    // Include the container itself if it is a repeated item.
    if (
        area.matches &&
        area.matches('[ng-repeat*="thisTransactionItem"]')
    ) {
        elements.unshift(area);
    }

    elements = elements.filter(element => {

        const text = normalizeText(element.innerText);

        return (
            /ALU\s*\d+/i.test(text) &&
            /Ext\s*Price/i.test(text)
        );

    });

    // Fallback for layouts without the expected Angular attribute.
    if (elements.length === 0) {

        const candidates = Array.from(
            area.querySelectorAll("div")
        ).filter(element => {

            const text = normalizeText(element.innerText);

            return (
                /ALU\s*\d+/i.test(text) &&
                /Ext\s*Price/i.test(text)
            );

        });

        elements = candidates.filter(element => {

            return !Array.from(element.children).some(child => {

                const text = normalizeText(child.innerText);

                return (
                    /ALU\s*\d+/i.test(text) &&
                    /Ext\s*Price/i.test(text)
                );

            });

        });

    }

    return elements;

}


/*
==========================================================
EXTRACT EXT PRICE
==========================================================
*/

function extractExtPrice(text) {

    const match = text.match(
        /Ext\s*Price\s*[:：]?\s*(?:₱|PHP|P)?\s*(-?\s*\d[\d,]*(?:\.\d{1,2})?)/i
    );

    if (!match) return null;

    return parseMoney(match[1]);

}


/*
==========================================================
EXTRACT ITEM INFORMATION
==========================================================
*/

function extractItemDetails(element) {

    const text = normalizeText(element.innerText);

    const aluMatch = text.match(
        /ALU\s*([0-9]+)/i
    );

    const extPrice = extractExtPrice(text);

    const firstLine = normalizeText(
        element.innerText.split("\n")[0]
    );

    return {

        name: firstLine,

        alu: aluMatch ? aluMatch[1] : "",

        extPrice: extPrice

    };

}


/*
==========================================================
CALCULATE TOTAL EXT PRICE
==========================================================
*/

function calculateExtPrice() {

    const elements = getTransactionItems();

    if (elements.length === 0) {

        return {
            success: false,
            message: "No transaction items detected."
        };

    }

    const items = [];

    let total = 0;

    for (const element of elements) {

        const item = extractItemDetails(element);

        if (item.extPrice === null) {

            console.warn(
                "Unable to read Ext Price:",
                item
            );

            return {
                success: false,
                message: "Unable to read an item's Ext Price."
            };

        }

        items.push(item);

        total += item.extPrice;

    }

    return {

        success: true,

        items: items,

        total: roundMoney(total)

    };

}


/*
==========================================================
READ PRISM SALES TAX
==========================================================
*/

function getDisplayedSalesTax() {

    const elements = Array.from(
        document.querySelectorAll(
            "tr, td, div, span, li"
        )
    );

    const candidates = elements.filter(element => {

        const text = normalizeText(element.innerText);

        return /^Sales\s*Tax(?:\s|:|$)/i.test(text);

    });

    // Prefer the smallest element containing both label and amount.
    candidates.sort((a, b) => {

        return normalizeText(a.innerText).length -
               normalizeText(b.innerText).length;

    });

    for (const element of candidates) {

        const text = normalizeText(element.innerText);

        const match = text.match(
            /^Sales\s*Tax\s*[:：]?\s*(?:₱|PHP|P)?\s*(-?\s*\d[\d,]*(?:\.\d{1,2})?)/i
        );

        if (match) {

            return parseMoney(match[1]);

        }

    }

    return null;

}


/*
==========================================================
READ TRANSACTION SUMMARY
==========================================================
*/

function getSummaryValue(label) {

    const elements = Array.from(
        document.querySelectorAll(
            "tr, td, div, span, li"
        )
    );

    const escaped = label.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
    );

    const regex = new RegExp(
        "^" + escaped + "(?:\\s|:|$)",
        "i"
    );

    const candidates = elements.filter(element => {

        return regex.test(
            normalizeText(element.innerText)
        );

    });

    candidates.sort((a, b) => {

        return normalizeText(a.innerText).length -
               normalizeText(b.innerText).length;

    });

    for (const element of candidates) {

        const text = normalizeText(element.innerText);

        const value = text.replace(regex, "").trim();

        if (value) return value;

    }

    return "";

}


/*
==========================================================
GET TRANSACTION ID
==========================================================
*/

function getTransactionId() {

    const match = window.location.href.match(
        /\/docs\/([^/?#]+)/
    );

    return match ? match[1] : "UNKNOWN";

}


/*
==========================================================
GET COMPLETE TAX STATUS
==========================================================
*/

function getTaxStatus() {

    const calculation = calculateExtPrice();

    if (!calculation.success) {

        return {

            status: "UNKNOWN",

            message: calculation.message

        };

    }

    const displayedTax = getDisplayedSalesTax();

    if (displayedTax === null) {

        return {

            status: "UNKNOWN",

            message: "Prism Sales Tax could not be detected."

        };

    }

    /*
    ------------------------------------------------------
    VAT FORMULA

    (SUM OF EXT PRICE / 1.12) * 0.12

    Round only after calculating the total.
    ------------------------------------------------------
    */

    const expectedTax = roundMoney(
        (calculation.total / CONFIG.VAT_DIVISOR) *
        CONFIG.VAT_RATE
    );

    const difference = roundMoney(
        displayedTax - expectedTax
    );

    const isMatch =
        Math.abs(difference) <= CONFIG.TOLERANCE;

    return {

        status: isMatch ? "MATCH" : "MISMATCH",

        extPriceTotal: calculation.total,

        expectedTax: expectedTax,

        displayedTax: displayedTax,

        difference: difference,

        items: calculation.items,

        transactionId: getTransactionId(),

        store: getSummaryValue("Store"),

        storeNumber: getSummaryValue("Store Number"),

        cashier: getSummaryValue("Cashier"),

        timestamp: new Date().toISOString()

    };

}


/*
==========================================================
SEND EMAIL ALERT
==========================================================
*/

function sendEmailAlert(status) {

    const emailKey = [
        status.transactionId,
        status.extPriceTotal,
        status.expectedTax,
        status.displayedTax
    ].join("_");

    const storageKey = "PRISM_TAX_EMAIL_" + emailKey;

    // Prevent repeated requests from the same browser tab.
    if (sessionStorage.getItem(storageKey)) {

        console.log(
            "[Prism Tax] Email already requested for this discrepancy."
        );

        return;

    }

    // Mark before sending to prevent rapid repeated clicks.
    sessionStorage.setItem(storageKey, "PENDING");

    chrome.runtime.sendMessage({

        action: "SEND_TAX_ALERT",

        payload: {

            status: status.status,

            transactionId: status.transactionId,

            store: status.store,

            storeNumber: status.storeNumber,

            cashier: status.cashier,

            timestamp: status.timestamp,

            extPriceTotal: status.extPriceTotal,

            expectedTax: status.expectedTax,

            displayedTax: status.displayedTax,

            difference: status.difference,

            items: status.items

        }

    }, response => {

        if (chrome.runtime.lastError) {

            sessionStorage.removeItem(storageKey);

            console.error(
                "[Prism Tax] Extension error:",
                chrome.runtime.lastError.message
            );

            return;

        }

        if (response && response.success) {

            sessionStorage.setItem(storageKey, "SENT");

            console.log(
                "[Prism Tax] Email API response:",
                response.result
            );

        } else {

            sessionStorage.removeItem(storageKey);

            console.error(
                "[Prism Tax] Email sending failed:",
                response
            );

        }

    });

}


/*
==========================================================
TENDER BUTTON VALIDATION
==========================================================
*/

document.addEventListener("click", function(event) {

    const tenderButton = event.target.closest(
        "#" + CONFIG.TENDER_BUTTON
    );

    if (!tenderButton) return;

    const status = getTaxStatus();

    console.log(
        "[Prism Tax Monitor]",
        status
    );

    /*
    ------------------------------------------------------
    UNKNOWN STATUS
    ------------------------------------------------------
    */

    if (status.status === "UNKNOWN") {

        const proceed = confirm(

            "PRISM SALES TAX WARNING\n\n" +

            status.message +

            "\n\nThe extension cannot verify the Sales Tax.\n\n" +

            "Do you want to continue with Tender?"

        );

        if (!proceed) {

            event.preventDefault();

            event.stopPropagation();

            event.stopImmediatePropagation();

        }

        return;

    }


    /*
    ------------------------------------------------------
    MATCH
    ------------------------------------------------------
    */

    if (status.status === "MATCH") {

        console.log(
            "[Prism Tax] Sales Tax calculation is correct."
        );

        return;

    }


    /*
    ------------------------------------------------------
    MISMATCH WARNING
    ------------------------------------------------------
    */

    const warning =

        "SALES TAX MISMATCH DETECTED!\n\n" +

        "Store: " + (status.store || "Unknown") + "\n\n" +

        "Total Ext Price: " +
        formatMoney(status.extPriceTotal) + "\n\n" +

        "Expected VAT: " +
        formatMoney(status.expectedTax) + "\n\n" +

        "Prism Sales Tax: " +
        formatMoney(status.displayedTax) + "\n\n" +

        "Difference: " +
        formatMoney(status.difference) + "\n\n" +

        "An email notification will be sent if you proceed.\n\n" +

        "Do you want to continue with Tender?";


    const proceed = confirm(warning);


    /*
    ------------------------------------------------------
    CANCEL TENDER
    ------------------------------------------------------
    */

    if (!proceed) {

        event.preventDefault();

        event.stopPropagation();

        event.stopImmediatePropagation();

        console.warn(
            "[Prism Tax] Tender cancelled by cashier."
        );

        return;

    }


    /*
    ------------------------------------------------------
    CASHIER CONFIRMED
    ------------------------------------------------------
    */

    sendEmailAlert(status);

    console.warn(
        "[Prism Tax] Mismatch confirmed. Email notification requested."
    );

}, true);


/*
==========================================================
INITIAL DEBUG INFORMATION
==========================================================
*/

console.log(
    "Prism Sales Tax Monitor loaded."
);
