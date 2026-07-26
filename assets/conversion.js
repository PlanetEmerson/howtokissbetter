(function () {
    "use strict";

    var PRODUCT = {
        id: "YyLMc",
        title: "Kiss Perfect Now: A Master Class in Kissology",
        price: 4.95,
        currency: "USD"
    };

    var TOP_ARTICLE_OFFERS = {
        "/blog/how-to-practice-kissing/": {
            title: "Turn practice into real skill",
            copy: "Use focused drills for pressure, timing, confidence, and the parts of kissing that only a partner can teach."
        },
        "/blog/why-kissing-feels-awkward/": {
            title: "Make an awkward kiss feel natural",
            copy: "Learn how to slow down, read your partner, and recover without letting one odd second take over."
        },
        "/blog/kissing-positions/": {
            title: "Find positions that feel easy",
            copy: "Get clear guidance for angles, hand placement, pace, comfort, and changing positions without breaking the moment."
        },
        "/blog/how-to-tell-someone-theyre-a-bad-kisser/": {
            title: "Give useful feedback without killing the mood",
            copy: "Use calm, specific ways to guide a kiss together while keeping trust and confidence intact."
        },
        "/blog/first-kiss-nerves-what-actually-matters/": {
            title: "Calm the nerves before they take over",
            copy: "Use a simple first-kiss plan that helps you stay present, read consent, and stop grading every move."
        },
        "/blog/how-to-kiss-someones-neck/": {
            title: "Make neck kissing feel good, not random",
            copy: "Learn where to start, how much pressure to use, and how to follow your partner's response."
        },
        "/blog/how-to-kiss-with-a-height-difference/": {
            title: "Make the height difference work",
            copy: "Use better angles, stable positions, and small moves that keep both people comfortable."
        },
        "/blog/how-to-kiss-slowly/": {
            title: "Slow down without losing the spark",
            copy: "Learn how pauses, pressure, and pace build tension while keeping the kiss responsive."
        },
        "/blog/lip-biting-while-kissing/": {
            title: "Use a lip bite with care",
            copy: "Get the timing, pressure, and consent cues that make a playful bite feel welcome."
        },
        "/blog/how-to-make-someone-want-to-kiss-you/": {
            title: "Build the moment without forcing it",
            copy: "Learn how to notice interest, create space for a yes, and make the lead-in feel clear."
        }
    };

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

    function articleName() {
        var heading = document.querySelector("article h1");
        return heading ? heading.textContent.trim() : document.title;
    }

    function offerLink(placement, label) {
        var link = document.createElement("a");
        link.className = "conversion-button conversion-offer__link";
        link.href = "/book/?utm_source=howtokissbetter&utm_medium=site&utm_campaign=conversion_repair&utm_content=" + encodeURIComponent(placement);
        link.textContent = label;
        link.dataset.offerLink = "true";
        link.dataset.offerPlacement = placement;
        return link;
    }

    function addArticleOffer() {
        var offer = TOP_ARTICLE_OFFERS[window.location.pathname];
        var content = document.querySelector(".article-content");
        if (!offer || !content || content.querySelector(".conversion-offer")) {
            return;
        }

        var paragraphs = Array.prototype.slice.call(content.querySelectorAll("p"));
        if (paragraphs.length < 4) {
            return;
        }

        var insertAt = Math.max(2, Math.floor(paragraphs.length * 0.25));
        var target = paragraphs[Math.min(insertAt, paragraphs.length - 1)];
        var panel = document.createElement("aside");
        panel.className = "conversion-offer js-offer";
        panel.dataset.offerPlacement = "article-quarter";
        panel.setAttribute("aria-label", "Book recommendation");

        var eyebrow = document.createElement("p");
        eyebrow.className = "conversion-offer__eyebrow";
        eyebrow.textContent = "Go beyond this guide";

        var title = document.createElement("h2");
        title.className = "conversion-offer__title";
        title.textContent = offer.title;

        var copy = document.createElement("p");
        copy.className = "conversion-offer__copy";
        copy.textContent = offer.copy;

        panel.appendChild(eyebrow);
        panel.appendChild(title);
        panel.appendChild(copy);
        panel.appendChild(offerLink("article-quarter", "See the full $4.95 book"));
        target.insertAdjacentElement("afterend", panel);
    }

    function addMobileBuyBar() {
        if (!TOP_ARTICLE_OFFERS[window.location.pathname]) {
            return;
        }

        var articleHeader = document.querySelector("article header");
        if (!articleHeader) {
            return;
        }

        var bar = document.createElement("aside");
        bar.className = "mobile-buy-bar";
        bar.setAttribute("aria-label", "Book offer");
        bar.innerHTML = '<p class="mobile-buy-bar__copy"><strong>Kiss Perfect Now</strong>Full guide, $4.95</p>';
        var link = offerLink("mobile-buy-bar", "See the book");
        link.className = "mobile-buy-bar__link";
        link.tabIndex = -1;
        bar.appendChild(link);
        bar.setAttribute("aria-hidden", "true");
        document.body.appendChild(bar);
        document.body.classList.add("has-mobile-buy-bar");

        function updateBar() {
            var introPassed = window.scrollY > articleHeader.offsetTop + articleHeader.offsetHeight;
            var footer = document.querySelector("footer");
            var footerNear = footer && footer.getBoundingClientRect().top < window.innerHeight + 72;
            var offerInView = Array.prototype.some.call(document.querySelectorAll(".js-offer"), function (offer) {
                var bounds = offer.getBoundingClientRect();
                return bounds.bottom > 0 && bounds.top < window.innerHeight;
            });
            var visible = introPassed && !footerNear && !offerInView;

            bar.classList.toggle("is-visible", visible);
            bar.setAttribute("aria-hidden", visible ? "false" : "true");
            link.tabIndex = visible ? 0 : -1;
        }

        updateBar();
        window.addEventListener("scroll", updateBar, { passive: true });
        window.addEventListener("resize", updateBar);
    }

    function trackOfferViews() {
        if (!("IntersectionObserver" in window)) {
            return;
        }

        var observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting || entry.target.dataset.offerSeen === "true") {
                    return;
                }
                entry.target.dataset.offerSeen = "true";
                sendEvent("offer_view", {
                    article: articleName(),
                    page: window.location.pathname,
                    placement: entry.target.dataset.offerPlacement || "unknown"
                });
                observer.unobserve(entry.target);
            });
        }, { threshold: 0.35 });

        document.querySelectorAll(".js-offer").forEach(function (offer) {
            observer.observe(offer);
        });
    }

    function bindOfferClicks() {
        document.addEventListener("click", function (event) {
            var link = event.target.closest("[data-offer-link]");
            if (!link) {
                return;
            }
            sendEvent("offer_click", {
                article: articleName(),
                page: window.location.pathname,
                placement: link.dataset.offerPlacement || "unknown"
            });
        });
    }

    function trackBookPage() {
        if (document.body.dataset.pageKind !== "book") {
            return;
        }
        sendEvent("view_item", {
            currency: PRODUCT.currency,
            value: PRODUCT.price,
            items: productItems()
        });

        document.querySelectorAll("[data-payhip-checkout]").forEach(function (button) {
            button.addEventListener("click", function (event) {
                event.preventDefault();
                sendEvent("begin_checkout", {
                    currency: PRODUCT.currency,
                    value: PRODUCT.price,
                    button_placement: button.dataset.checkoutPlacement || "book-page",
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

    function trackConfirmedLead() {
        if (document.body.dataset.pageKind !== "confirmed") {
            return;
        }
        var key = "kiss_generate_lead_sent";
        if (sessionStorage.getItem(key)) {
            return;
        }
        sessionStorage.setItem(key, "1");
        sendEvent("generate_lead", {
            form: "free_chapter_double_confirmation",
            source_page: localStorage.getItem("kiss_free_chapter_source") || "brevo_confirmation"
        });
    }

    function rememberFormSource() {
        if (!document.querySelector("[data-brevo-form]")) {
            return;
        }
        localStorage.setItem("kiss_free_chapter_source", window.location.pathname);
    }

    function setupExitPopup() {
        var popup = document.getElementById("exit-popup");
        if (!popup) {
            return;
        }

        var seenKey = "kiss_popup_seen";
        var shown = false;

        function show() {
            if (shown || localStorage.getItem(seenKey)) {
                return;
            }
            shown = true;
            popup.classList.add("active");
            sendEvent("offer_view", {
                article: document.title,
                page: window.location.pathname,
                placement: "free-chapter-popup"
            });
        }

        function hide() {
            popup.classList.remove("active");
            localStorage.setItem(seenKey, "1");
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
        addArticleOffer();
        addMobileBuyBar();
        bindOfferClicks();
        trackOfferViews();
        trackBookPage();
        trackConfirmedLead();
        rememberFormSource();
        setupExitPopup();
    });
})();
