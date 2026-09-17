(function () {
    "use strict";

    var MEASUREMENT_ID = "G-YNQ785TC90";
    var PRODUCT = {
        id: "kiss-book",
        title: "Kiss Perfect Now",
        price: 9.99,
        currency: "USD"
    };
    var LEAD_EVENT_KEY = "kpn_generate_lead_v2";
    var OFFER_IMPRESSION_PREFIX = "kpn_offer_impression_v2:";
    var BOOK_TOKEN_KEY = "kt_book_token_v1";
    var SUPPORT_EMAIL = "contact@howtokissbetter.com";
    var VALID_OFFER_KEYS = [
        "practice",
        "technique",
        "touch",
        "chemistry",
        "relationship",
        "boundaries",
        "complete-guide"
    ];
    // The checkout API rejects the whole form when these fields are malformed, so only
    // values in GA's own shape are forwarded.
    var GA_ID_SHAPES = { client_id: /^\d{1,12}\.\d{1,12}$/, session_id: /^\d{1,16}$/ };
    var gaIds = { client_id: "", session_id: "" };

    function safeStorage(storage, method, key, value) {
        try {
            return storage[method](key, value);
        } catch (error) {
            return null;
        }
    }

    function sendEvent(name, params) {
        if (typeof window.gtag !== "function") {
            return;
        }
        window.gtag("event", name, params || {});
    }

    function productItems() {
        return [{
            item_id: PRODUCT.id,
            item_name: PRODUCT.title,
            price: PRODUCT.price,
            quantity: 1
        }];
    }

    function articleTitle() {
        var heading = document.querySelector("article h1");
        return heading ? heading.textContent.trim() : document.title;
    }

    function offerVariant(element) {
        return element.dataset.offerVariant || "not-applicable";
    }

    function offerPayload(element) {
        var articleSlug = element.dataset.articleSlug || document.body.dataset.articleSlug || "not-an-article";
        return {
            page: window.location.pathname,
            article: articleSlug,
            article_title: articleTitle(),
            placement: element.dataset.offerPlacement || "unknown",
            offer_key: element.dataset.offerKey || document.body.dataset.offerKey || "complete-guide",
            chapter_id: element.dataset.chapterId || document.body.dataset.chapterId || "chapter-01",
            variant: offerVariant(element)
        };
    }

    function impressionKey(payload) {
        return OFFER_IMPRESSION_PREFIX + [
            payload.page,
            payload.placement,
            payload.offer_key
        ].join("|");
    }

    function trackOfferView(element) {
        var payload = offerPayload(element);
        var key = impressionKey(payload);
        if (safeStorage(window.sessionStorage, "getItem", key)) {
            return;
        }
        safeStorage(window.sessionStorage, "setItem", key, "1");
        sendEvent("offer_view", payload);
    }

    function trackOfferViews() {
        var offers = document.querySelectorAll(".js-offer");
        if (!("IntersectionObserver" in window)) {
            offers.forEach(function (offer) {
                if (offer.getAttribute("aria-hidden") !== "true") {
                    trackOfferView(offer);
                }
            });
            return;
        }

        var observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting || entry.intersectionRatio < 0.35) {
                    return;
                }
                trackOfferView(entry.target);
                observer.unobserve(entry.target);
            });
        }, { threshold: [0.35] });

        offers.forEach(function (offer) {
            if (!offer.classList.contains("mobile-buy-bar") && !offer.classList.contains("home-sticky-buy")) {
                observer.observe(offer);
            }
        });
    }

    function bindOfferClicks() {
        document.addEventListener("click", function (event) {
            var link = event.target.closest("[data-offer-link]");
            if (!link) {
                return;
            }
            sendEvent("offer_click", offerPayload(link));
        });
    }

    function captureGaIds() {
        if (typeof window.gtag !== "function") {
            return;
        }
        Object.keys(gaIds).forEach(function (field) {
            window.gtag("get", MEASUREMENT_ID, field, function (value) {
                if (GA_ID_SHAPES[field].test(String(value))) {
                    gaIds[field] = String(value);
                }
            });
        });
    }

    function setHiddenField(form, name, value) {
        var input = form.querySelector('input[name="' + name + '"]');
        if (!input) {
            input = document.createElement("input");
            input.type = "hidden";
            input.name = name;
            form.appendChild(input);
        }
        input.value = value;
    }

    function bindCheckoutForms() {
        var forms = document.querySelectorAll("form[data-checkout-form]");
        if (!forms.length) {
            return;
        }
        captureGaIds();
        forms.forEach(function (form) {
            form.addEventListener("submit", function (event) {
                if (form.dataset.checkoutSubmitted === "true") {
                    event.preventDefault();
                    return;
                }
                form.dataset.checkoutSubmitted = "true";
                if (gaIds.client_id) {
                    setHiddenField(form, "ga_cid", gaIds.client_id);
                }
                if (gaIds.session_id) {
                    setHiddenField(form, "ga_sid", gaIds.session_id);
                }
                if (typeof window.gtag !== "function") {
                    return;
                }

                event.preventDefault();
                var submitted = false;
                function submitOnce() {
                    if (submitted) {
                        return;
                    }
                    submitted = true;
                    form.submit();
                }
                var payload = offerPayload(form);
                sendEvent("begin_checkout", {
                    currency: PRODUCT.currency,
                    value: Number(form.dataset.price) || PRODUCT.price,
                    product: "book",
                    placement: payload.placement,
                    article: payload.article,
                    offer_key: payload.offer_key,
                    items: productItems(),
                    event_callback: submitOnce,
                    event_timeout: 400
                });
                window.setTimeout(submitOnce, 500);
            });
        });
    }

    function setupMobileBuyBar() {
        var bar = document.querySelector(".mobile-buy-bar");
        var articleHeader = document.querySelector("article header");
        if (!bar || !articleHeader) {
            return;
        }

        var link = bar.querySelector("a, button");
        var visibleBefore = false;
        document.body.classList.add("has-mobile-buy-bar");

        function updateBar() {
            var mobileViewport = window.matchMedia("(max-width: 767px)").matches;
            var introPassed = articleHeader.getBoundingClientRect().bottom < 0;
            var footer = document.querySelector("footer");
            var footerNear = footer && footer.getBoundingClientRect().top < window.innerHeight + 72;
            var otherOfferInView = Array.prototype.some.call(
                document.querySelectorAll(".js-offer:not(.mobile-buy-bar)"),
                function (offer) {
                    var bounds = offer.getBoundingClientRect();
                    return bounds.bottom > 0 && bounds.top < window.innerHeight;
                }
            );
            var visible = mobileViewport && introPassed && !footerNear && !otherOfferInView;

            bar.classList.toggle("is-visible", visible);
            bar.setAttribute("aria-hidden", visible ? "false" : "true");
            if (link) {
                link.tabIndex = visible ? 0 : -1;
            }
            if (visible && !visibleBefore) {
                trackOfferView(bar);
            }
            visibleBefore = visible;
        }

        updateBar();
        window.addEventListener("scroll", updateBar, { passive: true });
        window.addEventListener("resize", updateBar);
    }

    function requestedOfferKey() {
        var params = new URLSearchParams(window.location.search);
        var hashKey = window.location.hash.replace(/^#/, "");
        var key = params.get("offer_key") || hashKey || "complete-guide";
        return VALID_OFFER_KEYS.indexOf(key) >= 0 ? key : "complete-guide";
    }

    function sourcePlacement() {
        return new URLSearchParams(window.location.search).get("utm_content") || "book-page";
    }

    function openPreview(previewId, source, offerKey) {
        var viewer = document.querySelector("[data-preview-viewer]");
        if (!viewer || !window.KPNBookPreview) {
            return;
        }
        window.KPNBookPreview.open(previewId);
        sendEvent("preview_open", {
            preview_id: previewId,
            offer_key: offerKey,
            source_placement: source
        });
    }

    function setupBookPage() {
        if (document.body.dataset.pageKind !== "book") {
            return;
        }

        var offerKey = requestedOfferKey();
        var selectedPathway = offerKey === "complete-guide" ? "practice" : offerKey;
        document.body.classList.add("is-enhanced");
        document.body.dataset.offerKey = offerKey;
        document.querySelectorAll("[data-book-offer-key]").forEach(function (node) {
            node.dataset.bookOfferKey = offerKey;
        });
        document.querySelectorAll("[data-pathway]").forEach(function (button) {
            button.setAttribute("aria-pressed", button.dataset.pathway === selectedPathway ? "true" : "false");
        });
        document.querySelectorAll("[data-pathway-panel]").forEach(function (panel) {
            panel.hidden = panel.dataset.pathwayPanel !== selectedPathway;
        });

        sendEvent("view_item", {
            currency: PRODUCT.currency,
            value: PRODUCT.price,
            offer_key: offerKey,
            items: productItems()
        });

        document.querySelectorAll("[data-preview-open]").forEach(function (button) {
            button.addEventListener("click", function (event) {
                event.preventDefault();
                openPreview(
                    button.dataset.previewOpen || "contents-one",
                    button.dataset.previewSource || sourcePlacement(),
                    offerKey
                );
            });
        });

        document.querySelectorAll("[data-pathway]").forEach(function (button) {
            button.addEventListener("click", function (event) {
                event.preventDefault();
                var selected = button.dataset.pathway;
                document.querySelectorAll("[data-pathway]").forEach(function (other) {
                    other.setAttribute("aria-pressed", other === button ? "true" : "false");
                });
                document.querySelectorAll("[data-pathway-panel]").forEach(function (panel) {
                    panel.hidden = panel.dataset.pathwayPanel !== selected;
                });
                sendEvent("book_pathway_select", {
                    offer_key: selected,
                    chapter_id: button.dataset.chapterId || "chapter-01"
                });
            });
        });
    }

    function setupHomePage() {
        if (document.body.dataset.pageKind !== "home") {
            return;
        }

        var offerKey = document.body.dataset.offerKey || "complete-guide";
        document.body.classList.add("is-enhanced");

        document.querySelectorAll("[data-preview-open]").forEach(function (button) {
            button.addEventListener("click", function (event) {
                event.preventDefault();
                openPreview(
                    button.dataset.previewOpen || "contents-one",
                    button.dataset.previewSource || "home-page",
                    offerKey
                );
            });
        });

        document.querySelectorAll("[data-home-pathway]").forEach(function (link) {
            link.addEventListener("click", function () {
                sendEvent("home_pathway_select", {
                    offer_key: link.dataset.homePathway,
                    chapter_id: link.dataset.chapterId || "chapter-01"
                });
            });
        });
    }

    function setupHomeStickyBar() {
        if (document.body.dataset.pageKind !== "home") {
            return;
        }
        var bar = document.querySelector("[data-home-sticky]");
        var heroButton = document.querySelector("[data-home-hero-cta]");
        var link = bar && bar.querySelector("a, button");
        var visibleBefore = false;
        if (!bar || !heroButton || !link) {
            return;
        }

        function updateStickyBar() {
            var mobileViewport = window.matchMedia("(max-width: 767px)").matches;
            var heroPassed = heroButton.getBoundingClientRect().bottom < 0;
            var footer = document.querySelector(".home-footer");
            var footerNear = footer && footer.getBoundingClientRect().top < window.innerHeight + 72;
            var previewOpen = Boolean(document.querySelector("[data-preview-viewer][open]"));
            var visible = mobileViewport && heroPassed && !footerNear && !previewOpen;

            bar.classList.toggle("is-visible", visible);
            document.body.classList.toggle("has-home-sticky", visible);
            bar.setAttribute("aria-hidden", visible ? "false" : "true");
            link.tabIndex = visible ? 0 : -1;
            if (visible && !visibleBefore) {
                trackOfferView(bar);
            }
            visibleBefore = visible;
        }

        updateStickyBar();
        window.addEventListener("scroll", updateStickyBar, { passive: true });
        window.addEventListener("resize", updateStickyBar);
        var preview = document.querySelector("[data-preview-viewer]");
        if (preview) {
            preview.addEventListener("close", updateStickyBar);
        }
        document.addEventListener("click", function (event) {
            if (event.target.closest("[data-preview-open], [data-preview-close]")) {
                window.setTimeout(updateStickyBar, 0);
            }
        });
    }

    function setupBookStickyBar() {
        if (document.body.dataset.pageKind !== "book") {
            return;
        }
        var bar = document.querySelector("[data-book-sticky]");
        var heroButton = document.querySelector("[data-hero-checkout]");
        var link = bar && bar.querySelector("a, button");
        if (!bar || !heroButton || !link) {
            return;
        }

        function updateStickyBar() {
            var mobileViewport = window.matchMedia("(max-width: 767px)").matches;
            var heroPassed = heroButton.getBoundingClientRect().bottom < 0;
            var footer = document.querySelector(".book-footer");
            var footerNear = footer && footer.getBoundingClientRect().top < window.innerHeight + 72;
            var previewOpen = Boolean(document.querySelector("[data-preview-viewer][open]"));
            var visible = mobileViewport && heroPassed && !footerNear && !previewOpen;
            bar.classList.toggle("is-visible", visible);
            document.body.classList.toggle("has-book-sticky", visible);
            bar.setAttribute("aria-hidden", visible ? "false" : "true");
            link.tabIndex = visible ? 0 : -1;
        }

        updateStickyBar();
        window.addEventListener("scroll", updateStickyBar, { passive: true });
        window.addEventListener("resize", updateStickyBar);
        document.addEventListener("click", function (event) {
            if (event.target.closest("[data-preview-open], [data-preview-close]")) {
                window.setTimeout(updateStickyBar, 0);
            }
        });
    }

    function setupThanksPage() {
        if (document.body.dataset.pageKind !== "book-thanks") {
            return;
        }
        var api = document.body.dataset.kissApi || "";
        var status = document.querySelector("[data-thanks-status]");
        var downloads = document.querySelector("[data-thanks-downloads]");
        if (!api || !status || !downloads) {
            return;
        }
        var sessionId = new URLSearchParams(window.location.search).get("session_id") || "";
        var token = safeStorage(window.localStorage, "getItem", BOOK_TOKEN_KEY) || "";

        function setStatus(text, state) {
            status.textContent = text;
            status.dataset.state = state;
        }

        function clearDownloads() {
            while (downloads.firstChild) {
                downloads.removeChild(downloads.firstChild);
            }
        }

        // Every value here comes from the server; it is written through DOM properties, never as HTML.
        function renderDownloads(items) {
            clearDownloads();
            items.forEach(function (item) {
                if (!item || typeof item.url !== "string" || item.url.indexOf("https://") !== 0) {
                    return;
                }
                var link = document.createElement("a");
                link.className = "conversion-button book-thanks__download";
                link.href = item.url;
                link.setAttribute("download", "");
                link.textContent = String(item.label || "Download");
                downloads.appendChild(link);
            });
        }

        function showRetry() {
            clearDownloads();
            var button = document.createElement("button");
            button.type = "button";
            button.className = "conversion-button conversion-button-secondary book-thanks__retry";
            button.textContent = "Retry";
            button.addEventListener("click", verify);
            downloads.appendChild(button);
        }

        function showNetworkError() {
            setStatus("Could not reach the download service. Check your connection and try again.", "error");
            showRetry();
        }

        function handleVerifyResult(result) {
            var data = result.data || {};
            if (result.status === 200 && data.ok === true) {
                if (typeof data.token === "string" && data.token) {
                    token = data.token;
                    safeStorage(window.localStorage, "setItem", BOOK_TOKEN_KEY, token);
                }
                renderDownloads((data.payload && data.payload.downloads) || []);
                if (!downloads.firstChild) {
                    setStatus("Your order is confirmed, but the files are not ready yet. Try again in a minute, or email " + SUPPORT_EMAIL + ".", "error");
                    showRetry();
                    return;
                }
                setStatus("Links are good for an hour; reopen this page any time for fresh ones. Check your email too.", "ready");
                sendEvent("unlock_view", { product: "book" });
                return;
            }
            if (result.status === 401) {
                // The stored token no longer verifies; forget it so the email link is the way back in.
                token = "";
                safeStorage(window.localStorage, "removeItem", BOOK_TOKEN_KEY);
            }
            if (result.status === 401 || result.status === 402 || result.status === 404) {
                clearDownloads();
                setStatus("This link has not been paid yet or has expired. If you paid, email " + SUPPORT_EMAIL + ".", "unpaid");
                return;
            }
            showNetworkError();
        }

        function verify() {
            if (!sessionId && !token) {
                setStatus("No order found on this device. Open the link from your email, or write to " + SUPPORT_EMAIL + ".", "missing");
                return;
            }
            setStatus("Checking your order...", "pending");
            window.fetch(api + "/api/verify", {
                method: "POST",
                headers: { "Content-Type": "text/plain" },
                body: JSON.stringify(sessionId ? { session_id: sessionId } : { token: token })
            }).then(function (response) {
                return response.json().then(function (data) {
                    return { status: response.status, data: data };
                });
            }).then(handleVerifyResult).catch(showNetworkError);
        }

        verify();
    }

    function trackConfirmedLead() {
        if (document.body.dataset.pageKind !== "confirmed") {
            return;
        }
        if (safeStorage(window.localStorage, "getItem", LEAD_EVENT_KEY)) {
            return;
        }
        safeStorage(window.localStorage, "setItem", LEAD_EVENT_KEY, "1");
        sendEvent("generate_lead", {
            form_id: "free_chapter_double_confirmation",
            source_page: safeStorage(window.localStorage, "getItem", "kiss_free_chapter_source") || "brevo_confirmation"
        });
    }

    function rememberFormSource() {
        if (!document.querySelector("[data-brevo-form]")) {
            return;
        }
        safeStorage(window.localStorage, "setItem", "kiss_free_chapter_source", window.location.pathname);
    }

    document.addEventListener("DOMContentLoaded", function () {
        bindOfferClicks();
        trackOfferViews();
        bindCheckoutForms();
        setupMobileBuyBar();
        setupBookPage();
        setupBookStickyBar();
        setupHomePage();
        setupHomeStickyBar();
        setupThanksPage();
        trackConfirmedLead();
        rememberFormSource();
    });
})();
