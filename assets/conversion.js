(function () {
    "use strict";

    var PRODUCT = {
        id: "dbMu6",
        title: "Kiss Perfect Now: A Master Class in Kissology",
        price: 4.95,
        currency: "USD"
    };
    var MOBILE_OFFER_VARIANT_KEY = "kpn_mobile_offer_variant_v1";
    var LEAD_EVENT_KEY = "kpn_generate_lead_v2";
    var OFFER_IMPRESSION_PREFIX = "kpn_offer_impression_v2:";
    var VALID_OFFER_KEYS = [
        "practice",
        "technique",
        "touch",
        "chemistry",
        "relationship",
        "boundaries",
        "complete-guide"
    ];

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

    function assignedVariant() {
        var existing = safeStorage(window.localStorage, "getItem", MOBILE_OFFER_VARIANT_KEY);
        if (existing === "control" || existing === "treatment") {
            return existing;
        }

        var generated = "control";
        if (window.crypto && window.crypto.getRandomValues) {
            var randomValue = new Uint32Array(1);
            window.crypto.getRandomValues(randomValue);
            generated = randomValue[0] % 2 === 0 ? "control" : "treatment";
        } else {
            generated = Math.random() < 0.5 ? "control" : "treatment";
        }
        safeStorage(window.localStorage, "setItem", MOBILE_OFFER_VARIANT_KEY, generated);
        return generated;
    }

    function applyMobileOfferExperiment() {
        if (document.body.dataset.pageKind !== "article") {
            return;
        }
        var variant = assignedVariant();
        document.querySelectorAll("[data-offer-variant]").forEach(function (node) {
            if (node.closest(".mobile-buy-bar")) {
                node.dataset.offerVariant = variant;
            } else {
                node.dataset.offerVariant = "not-applicable";
            }
        });

        var mobileBar = document.querySelector(".mobile-buy-bar");
        var mobileTitle = document.querySelector("[data-mobile-offer-title]");
        var mobileCopy = document.querySelector("[data-mobile-offer-copy]");
        var mobileLink = mobileBar && mobileBar.querySelector("a");
        if (variant === "treatment") {
            if (mobileBar) {
                mobileBar.setAttribute("aria-label", "Book offer");
            }
            if (mobileTitle) {
                mobileTitle.textContent = "183-page kissing guide";
            }
            if (mobileCopy) {
                mobileCopy.textContent = "PDF + EPUB · $4.95";
            }
            if (mobileLink) {
                mobileLink.textContent = "See the guide";
            }
        }
    }

    function offerVariant(element) {
        if (element.dataset.offerPlacement !== "mobile-buy-bar") {
            return "not-applicable";
        }
        return element.dataset.offerVariant || assignedVariant();
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

    function setupMobileBuyBar() {
        var bar = document.querySelector(".mobile-buy-bar");
        var articleHeader = document.querySelector("article header");
        if (!bar || !articleHeader) {
            return;
        }

        var link = bar.querySelector("a");
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

    function bindPayhipCheckouts(offerKey) {
        document.querySelectorAll("[data-payhip-checkout]").forEach(function (button) {
            if (button.dataset.checkoutBound === "true") {
                return;
            }
            button.dataset.checkoutBound = "true";
            button.addEventListener("click", function (event) {
                event.preventDefault();
                sendEvent("begin_checkout", {
                    currency: PRODUCT.currency,
                    value: PRODUCT.price,
                    button_placement: button.dataset.checkoutPlacement || "book-page",
                    offer_key: button.dataset.offerKey || offerKey,
                    items: productItems()
                });
                if (window.Payhip && window.Payhip.Checkout) {
                    window.Payhip.Checkout.open({ product: PRODUCT.id });
                } else {
                    window.location.href = button.href;
                }
            });
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

        bindPayhipCheckouts(offerKey);

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
        bindPayhipCheckouts("complete-guide");

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
        var link = bar && bar.querySelector("a");
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
        var link = bar && bar.querySelector("a");
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

    function setupExitPopup() {
        var popup = document.getElementById("exit-popup");
        if (!popup) {
            return;
        }

        var seenKey = "kiss_popup_seen";
        var shown = false;
        function show() {
            if (shown || safeStorage(window.localStorage, "getItem", seenKey)) {
                return;
            }
            shown = true;
            popup.classList.add("active");
            sendEvent("offer_view", {
                article: document.title,
                page: window.location.pathname,
                placement: "free-chapter-popup",
                offer_key: "free-chapter",
                chapter_id: "chapter-14",
                variant: "not-applicable"
            });
        }
        function hide() {
            popup.classList.remove("active");
            safeStorage(window.localStorage, "setItem", seenKey, "1");
        }

        popup.querySelectorAll("[data-popup-close]").forEach(function (button) {
            button.addEventListener("click", hide);
        });
        popup.addEventListener("click", function (event) {
            if (event.target === popup) {
                hide();
            }
        });
        document.addEventListener("keydown", function (event) {
            if (event.key === "Escape" && popup.classList.contains("active")) {
                hide();
            }
        });
        document.addEventListener("mouseleave", function (event) {
            if (event.clientY < 0) {
                show();
            }
        });
        window.setTimeout(show, 45000);
    }

    document.addEventListener("DOMContentLoaded", function () {
        applyMobileOfferExperiment();
        bindOfferClicks();
        trackOfferViews();
        setupMobileBuyBar();
        setupBookPage();
        setupBookStickyBar();
        setupHomePage();
        setupHomeStickyBar();
        trackConfirmedLead();
        rememberFormSource();
        setupExitPopup();
    });
})();
