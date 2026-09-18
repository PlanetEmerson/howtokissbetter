(function () {
    "use strict";

    var MEASUREMENT_ID = "G-YNQ785TC90";
    var PRODUCT = {
        id: "kiss-report",
        title: "Kiss Test full report",
        price: 4.99,
        currency: "USD"
    };
    var KEYS = {
        answers: "kt_answers_v1",
        pronoun: "kt_pronoun_v1",
        from: "kt_from_v1",
        token: "kt_token_v1",
        paidAnswers: "kt_paid_answers_v1",
        api: "kt_api"
    };
    var QUESTION_COUNT = 10;
    var RESULT_PATH = "/kiss-test/result/";
    var QUIZ_PATH = "/kiss-test/";
    var SHARE_URL = "https://howtokissbetter.com/kiss-test/?ref=share";
    var SUPPORT_EMAIL = "contact@howtokissbetter.com";
    var SCORING_DELAY = 1200;
    var SLUG = /^[a-z0-9-]{1,100}$/;
    var SHORT_SLUG = /^[a-z0-9-]{1,40}$/;
    var ARCHETYPE_ID = /^[a-z-]{1,24}$/;
    // The checkout API rejects the whole form when these fields are malformed, so only
    // values in GA's own shape are forwarded.
    var GA_ID_SHAPES = { client_id: /^\d{1,12}\.\d{1,12}$/, session_id: /^\d{1,16}$/ };
    var THEM_SET = { he: "they", him: "them", his: "their", He: "They", His: "Their" };
    var LOCKED_TITLES = [
        "Where your points went (8 dimensions)",
        "The 3 habits costing you the most, and the fix for each",
        "What {he}'s actually noticing (from your answers)",
        "The one move for {archetype}",
        "Your 7-day fix"
    ];
    var UNLOCK_LIST = [
        "Your score and where every point went, across 8 dimensions",
        "The 3 habits costing you the most, and the fix for each, pulled from the book",
        "What {he}'s actually noticing (from your answers)",
        "The one move for {archetype}",
        "Your 7-day fix"
    ];
    var CHECKOUT_NOTICES = {
        canceled: "Checkout was canceled. Nothing was charged; your result is still here whenever you're ready.",
        failed: "The payment service didn't respond. Nothing was charged. Try again in a moment.",
        invalid: "That checkout request didn't match this result. Retake the test and try again.",
        unavailable: "Unlocking is offline for a moment. Nothing was charged. Try again shortly."
    };
    var gaIds = { client_id: "", session_id: "" };
    var paywallViewed = false;

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

    function engine() {
        return window.KissScore || null;
    }

    function apiBase() {
        return safeStorage(window.localStorage, "getItem", KEYS.api) || document.body.dataset.kissApi || "";
    }

    function el(tag, className, text) {
        var node = document.createElement(tag);
        if (className) {
            node.className = className;
        }
        if (text !== undefined && text !== null) {
            node.textContent = String(text);
        }
        return node;
    }

    function clear(node) {
        while (node.firstChild) {
            node.removeChild(node.firstChild);
        }
    }

    function mount(container, screen) {
        clear(container);
        container.appendChild(screen);
    }

    function focusHeading(heading) {
        heading.setAttribute("tabindex", "-1");
        if (typeof heading.focus === "function") {
            heading.focus();
        }
    }

    function reducedMotion() {
        return Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
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

    function postJson(path, body) {
        return window.fetch(apiBase() + path, {
            method: "POST",
            headers: { "Content-Type": "text/plain" },
            body: JSON.stringify(body)
        }).then(function (response) {
            return response.json().then(function (data) {
                return { status: response.status, data: data || {} };
            }, function () {
                return { status: response.status, data: {} };
            });
        });
    }

    function pronounSetFor(choice) {
        var ks = engine();
        var set = ks && typeof ks.pronounSet === "function" ? ks.pronounSet(choice) : null;
        return set || THEM_SET;
    }

    // Mirrors KissScore.applyPronouns so the paid report renders even when the engine
    // script failed to load; "{he}'s" becomes "they're" for the plural set.
    function applyPronouns(text, set) {
        set = set || THEM_SET;
        return String(text).replace(/\{(he|him|his|He|His)\}('s)?/g, function (match, token, contraction) {
            var word = set[token];
            if (typeof word !== "string") {
                return match;
            }
            if (!contraction) {
                return word;
            }
            return word + (set.he === "they" ? "'re" : "'s");
        });
    }

    function blankAnswers() {
        var answers = [];
        for (var i = 0; i < QUESTION_COUNT; i++) {
            answers.push("");
        }
        return answers;
    }

    // Stored as ten characters, "_" for an unanswered question, so a reload resumes.
    function readAnswers() {
        var stored = safeStorage(window.sessionStorage, "getItem", KEYS.answers) || "";
        var answers = blankAnswers();
        if (stored.length !== QUESTION_COUNT) {
            return answers;
        }
        for (var i = 0; i < QUESTION_COUNT; i++) {
            var letter = stored.charAt(i);
            answers[i] = /^[a-d]$/.test(letter) ? letter : "";
        }
        return answers;
    }

    function writeAnswers(answers) {
        var encoded = answers.map(function (letter) {
            return letter || "_";
        }).join("");
        safeStorage(window.sessionStorage, "setItem", KEYS.answers, encoded);
    }

    function isComplete(answers) {
        return answers.every(Boolean);
    }

    function answeredCount(answers) {
        return answers.filter(Boolean).length;
    }

    function readContext() {
        var raw = safeStorage(window.sessionStorage, "getItem", KEYS.from);
        try {
            var parsed = raw ? JSON.parse(raw) : null;
            return parsed && typeof parsed === "object" ? parsed : null;
        } catch (error) {
            return null;
        }
    }

    function writeContext(context) {
        safeStorage(window.sessionStorage, "setItem", KEYS.from, JSON.stringify(context));
    }

    function questionIndex(id) {
        var ks = engine();
        var questions = ks && ks.DATA ? ks.DATA.questions : [];
        for (var i = 0; i < questions.length; i++) {
            if (questions[i].id === id) {
                return i;
            }
        }
        return -1;
    }

    function optionFor(index, id) {
        var ks = engine();
        var question = ks && ks.DATA ? ks.DATA.questions[index] : null;
        if (!question) {
            return null;
        }
        for (var i = 0; i < question.options.length; i++) {
            if (question.options[i].id === id) {
                return question.options[i];
            }
        }
        return null;
    }

    // Query string from an article hook card; unknown values are dropped, never echoed.
    function parseHandoff(search) {
        var params = new URLSearchParams(search || "");
        var handoff = { from: "", hook: "", placement: "", q: "", a: "", index: -1, entry: "direct" };
        var from = params.get("from") || "";
        var hook = params.get("hook") || "";
        var placement = params.get("placement") || "";
        var q = params.get("q") || "";
        var a = params.get("a") || "";
        if (SLUG.test(from)) {
            handoff.from = from;
        }
        if (SHORT_SLUG.test(hook)) {
            handoff.hook = hook;
        }
        if (SHORT_SLUG.test(placement)) {
            handoff.placement = placement;
        }
        var index = questionIndex(q);
        if (index >= 0 && optionFor(index, a)) {
            handoff.q = q;
            handoff.a = a;
            handoff.index = index;
            handoff.entry = "inline";
        } else if (params.get("ref") === "share") {
            handoff.entry = "share";
        } else if (handoff.from) {
            handoff.entry = "article";
        }
        return handoff;
    }

    // First unanswered question after `current` (-1 to start), or -1 when done.
    function nextIndex(answers, current) {
        for (var i = current + 1; i < answers.length; i++) {
            if (!answers[i]) {
                return i;
            }
        }
        return -1;
    }

    function buildCheckoutFields(options) {
        var fields = {
            product: "report",
            answers: options.answers,
            v: String(options.version),
            src: options.from || "direct",
            placement: "quiz-paywall",
            entry: options.entry || "direct",
            cancel: RESULT_PATH
        };
        var ids = options.gaIds || {};
        if (ids.client_id) {
            fields.ga_cid = ids.client_id;
        }
        if (ids.session_id) {
            fields.ga_sid = ids.session_id;
        }
        return fields;
    }

    // Everything the free page may say about the score: counts and names, never the number.
    function freeSummary(result) {
        var teasers = result.teasers || {};
        var costing = Number(teasers.costingCount) || 0;
        var strongest = teasers.strongestDimension ? teasers.strongestDimension.name : "";
        var costingLine = costing === 0
            ? "None of your 10 answers are costing you points."
            : costing + " of your 10 answers " + (costing === 1 ? "is" : "are") + " costing you points.";
        return {
            archetype: result.archetype,
            band: result.band ? result.band.id : "",
            bandLabel: result.band ? result.band.label : "",
            costingCount: costing,
            strongestDimension: strongest,
            teaser: costingLine + (strongest ? " Your strongest dimension is " + strongest + "." : "")
        };
    }

    function startPayload(context) {
        return {
            entry: context.entry || "direct",
            article: context.from || "direct",
            offer_key: context.hook || "none",
            placement: context.placement || "landing"
        };
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

    function progressScreen(className, label, headingText) {
        var screen = el("div", "quiz-screen " + className);
        var progress = el("p", "quiz-progress", label);
        progress.setAttribute("aria-live", "polite");
        screen.appendChild(progress);
        var heading = el("h2", "quiz-question", headingText);
        heading.setAttribute("tabindex", "-1");
        screen.appendChild(heading);
        screen.heading = heading;
        return screen;
    }

    function optionButton(text, pressed, onSelect) {
        var item = el("li");
        var button = el("button", "quiz-option", text);
        button.type = "button";
        button.setAttribute("aria-pressed", pressed ? "true" : "false");
        button.addEventListener("click", onSelect);
        item.appendChild(button);
        return item;
    }

    function setupQuizPage() {
        if (document.body.dataset.pageKind !== "quiz") {
            return;
        }
        var app = document.getElementById("kiss-test-app");
        if (!app) {
            return;
        }
        var handoff = parseHandoff(window.location.search);
        var context = readContext();
        var answers = readAnswers();
        var pronoun = safeStorage(window.sessionStorage, "getItem", KEYS.pronoun) || "";
        var inProgress = false;

        function data() {
            return engine().DATA;
        }

        function showEngineMissing() {
            var screen = progressScreen("quiz-screen--error", "One moment", "The test didn't finish loading.");
            screen.appendChild(el("p", "quiz-note", "Reload the page to try again. If it keeps happening, email " + SUPPORT_EMAIL + "."));
            var reload = el("button", "conversion-button conversion-button-secondary", "Reload");
            reload.type = "button";
            reload.addEventListener("click", function () {
                window.location.reload();
            });
            screen.appendChild(reload);
            mount(app, screen);
            focusHeading(screen.heading);
        }

        function renderPronoun() {
            inProgress = true;
            var screen = progressScreen("quiz-screen--pronoun", "Before we start", data().pronoun.prompt);
            var list = el("ul", "quiz-options");
            data().pronoun.options.forEach(function (option) {
                list.appendChild(optionButton(option.label, pronoun === option.id, function () {
                    pronoun = option.id;
                    safeStorage(window.sessionStorage, "setItem", KEYS.pronoun, pronoun);
                    renderQuestion(nextIndex(answers, -1));
                }));
            });
            screen.appendChild(list);
            screen.appendChild(el("p", "quiz-note", data().pronoun.note));
            mount(app, screen);
            focusHeading(screen.heading);
        }

        function renderQuestion(index) {
            if (index < 0) {
                renderScoring();
                return;
            }
            inProgress = true;
            var question = data().questions[index];
            var set = pronounSetFor(pronoun);
            var aspirational = pronoun === "nobody" && question.promptNobody;
            var prompt = aspirational ? question.promptNobody : applyPronouns(question.prompt, set);
            var screen = progressScreen("quiz-screen--question", "Question " + (index + 1) + " of " + QUESTION_COUNT, prompt);
            var bar = el("div", "quiz-progress-bar");
            bar.setAttribute("aria-hidden", "true");
            bar.style.setProperty("--quiz-progress", Math.round((answeredCount(answers) / QUESTION_COUNT) * 100) + "%");
            screen.insertBefore(bar, screen.firstChild);

            var list = el("ul", "quiz-options");
            question.options.forEach(function (option) {
                list.appendChild(optionButton(applyPronouns(option.text, set), answers[index] === option.id, function () {
                    answers[index] = option.id;
                    writeAnswers(answers);
                    sendEvent("quiz_answer", { question_index: index + 1, entry: (context && context.entry) || "direct" });
                    renderQuestion(nextIndex(answers, index));
                }));
            });
            screen.appendChild(list);

            var back = el("button", "quiz-back", "Back");
            back.type = "button";
            back.addEventListener("click", function () {
                if (index === 0) {
                    renderPronoun();
                } else {
                    renderQuestion(index - 1);
                }
            });
            screen.appendChild(back);
            mount(app, screen);
            focusHeading(screen.heading);
        }

        function renderScoring() {
            var screen = progressScreen("quiz-screen--scoring", "Scoring", "Scoring your answers. Eight dials, ten taps.");
            var dials = el("div", "quiz-dials");
            dials.setAttribute("aria-hidden", "true");
            for (var i = 0; i < 8; i++) {
                dials.appendChild(el("span"));
            }
            screen.appendChild(dials);
            mount(app, screen);
            focusHeading(screen.heading);
            window.setTimeout(finishScoring, reducedMotion() ? 0 : SCORING_DELAY);
        }

        function finishScoring() {
            var result;
            try {
                result = engine().score(answers.join(""));
            } catch (error) {
                showEngineMissing();
                return;
            }
            writeAnswers(answers);
            sendEvent("quiz_complete", {
                archetype: result.archetype.id,
                score_band: result.band.id,
                score: result.score,
                entry: (context && context.entry) || "direct",
                article: (context && context.from) || "direct"
            });
            window.location.assign(RESULT_PATH);
        }

        function begin(event) {
            if (event) {
                event.preventDefault();
            }
            if (!engine() || !engine().DATA) {
                showEngineMissing();
                return;
            }
            if (inProgress) {
                var heading = app.querySelector(".quiz-question");
                if (heading) {
                    focusHeading(heading);
                }
                return;
            }
            answers = blankAnswers();
            writeAnswers(answers);
            pronoun = "";
            safeStorage(window.sessionStorage, "removeItem", KEYS.pronoun);
            context = { from: handoff.from, hook: handoff.hook, placement: handoff.placement, entry: handoff.entry };
            writeContext(context);
            sendEvent("quiz_start", startPayload(context));
            renderPronoun();
        }

        var starts = document.querySelectorAll("[data-quiz-start]");
        Array.prototype.forEach.call(starts, function (button) {
            button.addEventListener("click", begin);
        });

        if (handoff.entry === "inline") {
            answers = blankAnswers();
            answers[handoff.index] = handoff.a;
            writeAnswers(answers);
            pronoun = "";
            safeStorage(window.sessionStorage, "removeItem", KEYS.pronoun);
            context = { from: handoff.from, hook: handoff.hook, placement: handoff.placement, entry: "inline" };
            writeContext(context);
            sendEvent("quiz_start", startPayload(context));
            sendEvent("quiz_answer", { question_index: handoff.index + 1, entry: "inline" });
            // A reload must resume, not re-answer, so the handoff leaves the URL once stored.
            if (window.history && typeof window.history.replaceState === "function") {
                window.history.replaceState(null, "", window.location.pathname);
            }
            renderPronoun();
            return;
        }

        if (answeredCount(answers) > 0 && !isComplete(answers) && engine() && engine().DATA) {
            if (!pronoun) {
                renderPronoun();
            } else {
                renderQuestion(nextIndex(answers, -1));
            }
        }
    }

    function archetypeImage(archetype) {
        var media = el("div", "quiz-card__media");
        if (!ARCHETYPE_ID.test(String(archetype.id))) {
            return media;
        }
        var base = "/assets/images/kiss-test/archetypes/" + archetype.id;
        var picture = el("picture");
        var source = el("source");
        source.setAttribute("srcset", base + ".webp");
        source.setAttribute("type", "image/webp");
        picture.appendChild(source);
        var img = el("img");
        img.setAttribute("src", base + ".jpg");
        img.setAttribute("alt", archetype.name + " archetype card");
        img.setAttribute("width", "1080");
        img.setAttribute("height", "1350");
        img.setAttribute("decoding", "async");
        picture.appendChild(img);
        media.appendChild(picture);
        return media;
    }

    function shareText(archetype, paid) {
        var middle = paid
            ? "Kiss Score " + paid.score + ", " + paid.bandLabel + "."
            : "I'm not telling you my score.";
        return "I took the Kiss Test and got " + archetype.name + ". \"" + archetype.tagline + "\" " + middle + " Take it and tell me yours:";
    }

    function copyText(text) {
        if (window.navigator && window.navigator.clipboard && typeof window.navigator.clipboard.writeText === "function") {
            return window.navigator.clipboard.writeText(text);
        }
        return Promise.reject(new Error("clipboard_unavailable"));
    }

    function shareActions(archetype, paid) {
        var actions = el("div", "quiz-card__actions");
        var status = el("p", "quiz-card__status");
        status.setAttribute("aria-live", "polite");
        var text = shareText(archetype, paid);

        function report(method) {
            sendEvent("share_click", { method: method, archetype: archetype.id });
        }

        function copyFallback(value, method) {
            copyText(value).then(function () {
                status.textContent = "Copied. Paste it anywhere.";
                report(method);
            }, function () {
                status.textContent = "Copy this: " + value;
            });
        }

        var share = el("button", "conversion-button", paid ? "Share with my score" : "Share my archetype");
        share.type = "button";
        share.addEventListener("click", function () {
            if (window.navigator && typeof window.navigator.share === "function") {
                window.navigator.share({ title: "The Kiss Test", text: text, url: SHARE_URL }).then(function () {
                    report("web_share");
                }, function () {
                    status.textContent = "";
                });
                return;
            }
            copyFallback(text + " " + SHARE_URL, "copy");
        });
        actions.appendChild(share);

        var copy = el("button", "conversion-button conversion-button-secondary", "Copy link");
        copy.type = "button";
        copy.addEventListener("click", function () {
            copyFallback(SHARE_URL, "copy_link");
        });
        actions.appendChild(copy);
        actions.appendChild(status);
        return actions;
    }

    function archetypeCard(archetype, paid) {
        var card = el("section", "quiz-card");
        card.setAttribute("aria-label", "Your archetype");
        card.appendChild(archetypeImage(archetype));
        var body = el("div", "quiz-card__body");
        body.appendChild(el("p", "quiz-card__eyebrow", "Kiss Test result"));
        var title = el("h1", "quiz-card__title", "You're " + archetype.name + ".");
        body.appendChild(title);
        body.appendChild(el("p", "quiz-card__tagline", archetype.tagline));
        body.appendChild(el("p", "quiz-card__url", "howtokissbetter.com/kiss-test"));
        card.appendChild(body);
        card.appendChild(shareActions(archetype, paid));
        card.heading = title;
        return card;
    }

    function blurredScore() {
        var graphic = el("div", "quiz-score-card__blur");
        graphic.setAttribute("aria-hidden", "true");
        graphic.appendChild(el("span", "quiz-score-card__digit"));
        graphic.appendChild(el("span", "quiz-score-card__digit"));
        var bar = el("div", "quiz-score-card__bar");
        bar.appendChild(el("span"));
        graphic.appendChild(bar);
        return graphic;
    }

    function fillIn(text, archetype, set) {
        return applyPronouns(String(text).replace(/\{archetype\}/g, archetype.name), set);
    }

    function paywallForm(state) {
        var form = el("form", "quiz-paywall__form");
        form.setAttribute("method", "post");
        form.setAttribute("action", apiBase() + "/api/checkout");
        form.setAttribute("data-report-checkout", "");
        var fields = buildCheckoutFields({
            answers: state.answers,
            version: state.version,
            from: state.context.from,
            entry: state.context.entry,
            gaIds: gaIds
        });
        Object.keys(fields).forEach(function (name) {
            setHiddenField(form, name, fields[name]);
        });
        var button = el("button", "conversion-button quiz-paywall__button", "Unlock my full report · $4.99");
        button.type = "submit";
        form.appendChild(button);

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
            sendEvent("begin_checkout", {
                currency: PRODUCT.currency,
                value: PRODUCT.price,
                product: "report",
                placement: "quiz-paywall",
                archetype: state.summary.archetype.id,
                score_band: state.summary.band,
                items: [{ item_id: PRODUCT.id, item_name: PRODUCT.title, price: PRODUCT.price, quantity: 1 }],
                event_callback: submitOnce,
                event_timeout: 400
            });
            window.setTimeout(submitOnce, 500);
        });
        return form;
    }

    function scoreCard(state) {
        var archetype = state.summary.archetype;
        var card = el("section", "quiz-score-card");
        card.id = "kiss-test-paywall";
        card.setAttribute("aria-label", "Your Kiss Score, locked");
        card.appendChild(el("p", "conversion-kicker", "Your Kiss Score"));
        card.appendChild(blurredScore());
        var claim = el("p", "quiz-score-card__claim");
        claim.appendChild(el("strong", null, "Computed from your 10 answers. Not a vibe. A number."));
        card.appendChild(claim);
        card.appendChild(el("p", "quiz-score-card__teaser", state.summary.teaser));
        var behind = el("p", "quiz-score-card__behind");
        behind.appendChild(el("strong", null, "Behind the unlock:"));
        card.appendChild(behind);
        var list = el("ul", "quiz-paywall__list");
        UNLOCK_LIST.forEach(function (line) {
            list.appendChild(el("li", null, fillIn(line, archetype, state.set)));
        });
        card.appendChild(list);
        var checkoutNotice = Object.prototype.hasOwnProperty.call(CHECKOUT_NOTICES, state.checkoutReturn)
            ? CHECKOUT_NOTICES[state.checkoutReturn]
            : "";
        [checkoutNotice, state.notice].forEach(function (text) {
            if (!text) {
                return;
            }
            var notice = el("p", "quiz-notice", text);
            notice.setAttribute("role", "status");
            card.appendChild(notice);
        });
        card.appendChild(paywallForm(state));
        card.appendChild(el("p", "quiz-paywall__once", "One-time payment. No subscription, no account. Apple Pay, Google Pay, or card."));
        var fine = el("p", "quiz-paywall__fine");
        fine.appendChild(el("em", null, "A five-minute read, assembled from your answers, not a template with your name on it. For fun and self-awareness, not a scientific instrument. You must be 18 or older to purchase. Not satisfied? Email me. I will make it right. " + SUPPORT_EMAIL));
        card.appendChild(fine);
        if (state.retry) {
            var retry = el("button", "conversion-button conversion-button-secondary quiz-retry", "Retry unlock check");
            retry.type = "button";
            retry.addEventListener("click", state.retry);
            card.appendChild(retry);
        }
        return card;
    }

    // The two strongest-habit blurbs come from the functions; the section stays empty on any failure.
    function loadStrengths(section, state) {
        postJson("/api/kiss-free", { answers: state.answers }).then(function (result) {
            var free = result.status === 200 && result.data.ok === true ? result.data.free : null;
            var blurbs = free && Array.isArray(free.strongestBlurbs) ? free.strongestBlurbs : [];
            if (!blurbs.length) {
                return;
            }
            var heading = el("h2", "quiz-section-title", "Your two strongest habits");
            section.appendChild(heading);
            blurbs.slice(0, 2).forEach(function (blurb) {
                if (!blurb || typeof blurb !== "object") {
                    return;
                }
                var item = el("article", "quiz-blurb");
                item.appendChild(el("h3", null, applyPronouns(blurb.title || "", state.set)));
                item.appendChild(el("p", null, applyPronouns(blurb.text || "", state.set)));
                section.appendChild(item);
            });
        }, function () {
            return null;
        });
    }

    function lockedList(state) {
        var wrap = el("div", "quiz-locked-list");
        LOCKED_TITLES.forEach(function (title) {
            var section = el("section", "quiz-locked-section");
            section.appendChild(el("h2", "quiz-section-title", fillIn(title, state.summary.archetype, state.set)));
            var body = el("div", "quiz-locked");
            body.setAttribute("aria-hidden", "true");
            for (var i = 0; i < 3; i++) {
                body.appendChild(el("p", null, "This section is assembled from your answers and reads differently for every archetype. It opens with the report, alongside the score it is built on."));
            }
            section.appendChild(body);
            var note = el("p", "quiz-locked__note");
            note.appendChild(el("em", null, "Unlocks with the report."));
            var link = el("a", "quiz-unlock-link", "Unlock · $4.99");
            link.setAttribute("href", "#kiss-test-paywall");
            note.appendChild(link);
            section.appendChild(note);
            wrap.appendChild(section);
        });
        return wrap;
    }

    function statusScreen(root, headingText, text, action) {
        var screen = el("section", "quiz-result-static");
        screen.appendChild(el("p", "conversion-kicker", "Kiss Test result"));
        var heading = el("h1", null, headingText);
        heading.setAttribute("tabindex", "-1");
        screen.appendChild(heading);
        var status = el("p", null, text);
        status.setAttribute("role", "status");
        screen.appendChild(status);
        if (action) {
            screen.appendChild(action);
        }
        mount(root, screen);
        focusHeading(heading);
    }

    function linkButton(text, href) {
        var link = el("a", "conversion-button", text);
        link.setAttribute("href", href);
        return link;
    }

    function renderFree(root, state) {
        var ks = engine();
        var result = null;
        try {
            result = ks ? ks.score(state.answers) : null;
        } catch (error) {
            result = null;
        }
        if (!result) {
            statusScreen(root, "One moment.", "Your answers are saved on this device, but the scoring engine didn't load. Reload this page to see your result.", linkButton("Reload", RESULT_PATH));
            return;
        }
        state.summary = freeSummary(result);
        var card = archetypeCard(state.summary.archetype, null);
        clear(root);
        root.appendChild(card);
        var read = el("section", "quiz-read");
        read.appendChild(el("p", null, state.summary.archetype.read || ""));
        root.appendChild(read);
        root.appendChild(scoreCard(state));
        var strengths = el("section", "quiz-strengths");
        root.appendChild(strengths);
        loadStrengths(strengths, state);
        root.appendChild(lockedList(state));
        focusHeading(card.heading);
        sendEvent("result_view", { tier: "free", archetype: state.summary.archetype.id });
        if (!paywallViewed) {
            paywallViewed = true;
            sendEvent("paywall_view", {
                archetype: state.summary.archetype.id,
                score_band: state.summary.band,
                "return": state.checkoutReturn || "none"
            });
        }
    }

    function levelAttr(value) {
        var level = String(value || "").toLowerCase();
        return /^[a-z-]{1,24}$/.test(level) ? level : "";
    }

    function localDimension(local, label) {
        var dimensions = local && Array.isArray(local.dimensions) ? local.dimensions : [];
        for (var i = 0; i < dimensions.length; i++) {
            if (dimensions[i].name === label) {
                return dimensions[i];
            }
        }
        return null;
    }

    // Every value here comes from the server; it is written through textContent, never as HTML.
    function paidItems(section, state, local) {
        var id = String(section.id || "");
        var items = Array.isArray(section.items) ? section.items : [];
        var text = function (value) {
            return applyPronouns(value === undefined || value === null ? "" : value, state.set);
        };
        if (id === "score") {
            var dims = el("ul", "quiz-dims-paid");
            items.forEach(function (item) {
                if (!item || typeof item !== "object") {
                    return;
                }
                var row = el("li", "quiz-dim");
                var level = levelAttr(item.level);
                if (level) {
                    row.setAttribute("data-level", level);
                }
                row.appendChild(el("span", "quiz-dim__label", text(item.label)));
                row.appendChild(el("span", "quiz-dim__level", text(item.level)));
                var dimension = localDimension(local, String(item.label));
                if (dimension && typeof dimension.fraction === "number") {
                    var bar = el("span", "quiz-dim__bar");
                    bar.setAttribute("aria-hidden", "true");
                    var fill = el("span");
                    fill.style.setProperty("--dim", Math.round(dimension.fraction * 100) + "%");
                    bar.appendChild(fill);
                    row.appendChild(bar);
                }
                row.appendChild(el("span", "quiz-dim__line", text(item.line)));
                dims.appendChild(row);
            });
            return dims;
        }
        if (id === "fix") {
            var days = el("ol", "quiz-fix");
            items.forEach(function (item) {
                if (!item || typeof item !== "object") {
                    return;
                }
                var day = el("li");
                day.appendChild(el("strong", null, "Day " + text(item.day) + ": " + text(item.title)));
                day.appendChild(el("p", null, text(item.text)));
                days.appendChild(day);
            });
            return days;
        }
        if (items.length && typeof items[0] === "string") {
            var list = el("ul", "quiz-paid-list");
            items.forEach(function (item) {
                list.appendChild(el("li", null, text(item)));
            });
            return list;
        }
        var blurbs = el("div", "quiz-paid-items");
        items.forEach(function (item) {
            if (!item || typeof item !== "object") {
                return;
            }
            var blurb = el("article", "quiz-blurb");
            blurb.appendChild(el("h3", null, text(item.title)));
            blurb.appendChild(el("p", null, text(item.text)));
            blurbs.appendChild(blurb);
        });
        return blurbs;
    }

    function paidSection(section, state, local) {
        var wrap = el("section", "quiz-paid-section" + (levelAttr(section.id) ? " quiz-paid-section--" + levelAttr(section.id) : ""));
        wrap.appendChild(el("h2", "quiz-section-title", applyPronouns(section.title || "", state.set)));
        if (section.headline) {
            wrap.appendChild(el("p", "quiz-score-headline", applyPronouns(section.headline, state.set)));
        }
        (Array.isArray(section.paragraphs) ? section.paragraphs : []).forEach(function (paragraph) {
            wrap.appendChild(el("p", "quiz-paid-paragraph", applyPronouns(paragraph, state.set)));
        });
        if (Array.isArray(section.items) && section.items.length) {
            wrap.appendChild(paidItems(section, state, local));
        }
        return wrap;
    }

    function renderPaid(root, state, paid) {
        var sections = paid && Array.isArray(paid.sections) ? paid.sections : [];
        if (!sections.length) {
            statusScreen(root, "Unlocked.", "The report came back empty. Email " + SUPPORT_EMAIL + " with your receipt and I will fix it.", null);
            return;
        }
        var local = null;
        try {
            local = engine() && state.answers ? engine().score(state.answers) : null;
        } catch (error) {
            local = null;
        }
        clear(root);
        var header = el("header", "quiz-paid-header");
        header.appendChild(el("p", "conversion-kicker", "Kiss Test report"));
        var heading = el("h1", null, "Unlocked. Here's the honest version.");
        header.appendChild(heading);
        root.appendChild(header);
        sections.forEach(function (section) {
            if (section && typeof section === "object") {
                root.appendChild(paidSection(section, state, local));
            }
        });
        if (local && local.archetype) {
            var share = el("section", "quiz-paid-share");
            share.appendChild(el("h2", "quiz-section-title", "Tell someone. Or don't."));
            share.appendChild(shareActions(local.archetype, { score: local.score, bandLabel: local.band.label }));
            root.appendChild(share);
        }
        var lede = document.querySelector("[data-email-lede]");
        if (lede) {
            lede.textContent = "I'll send your full report link, so it reopens on any device. You also get the free chapter, The 10 Kiss Commandments, because you'll want it for the fixes.";
        }
        focusHeading(heading);
        sendEvent("result_view", { tier: "paid", archetype: local ? local.archetype.id : "unknown" });
        sendEvent("unlock_view", { product: "report" });
    }

    function verifyNotice(status, mode) {
        if (status === 401) {
            return "This device's unlock has expired (unlocks last 30 days). The link in your receipt email reopens the report.";
        }
        if (status === 402) {
            return "That order isn't marked as paid yet. If you did pay, email " + SUPPORT_EMAIL + " and I will sort it out.";
        }
        if (status === 404) {
            return "That order wasn't found. If you paid, email " + SUPPORT_EMAIL + ".";
        }
        if (status === 409) {
            return "The test has been updated since this report was unlocked. Retake it for a fresh result.";
        }
        if (mode === "network") {
            return "Could not reach the report service. Check your connection and try again.";
        }
        return "The report service is unavailable right now. Nothing new was charged. Try again in a moment.";
    }

    function setupResultPage() {
        if (document.body.dataset.pageKind !== "quiz-result") {
            return;
        }
        var root = document.getElementById("kiss-test-result");
        if (!root) {
            return;
        }
        var params = new URLSearchParams(window.location.search);
        var sessionId = params.get("session_id") || "";
        var stored = readAnswers();
        var ks = engine();
        var state = {
            answers: isComplete(stored) ? stored.join("") : "",
            version: ks ? (ks.VERSION !== undefined ? ks.VERSION : (ks.DATA && ks.DATA.version)) : "",
            context: readContext() || { from: "", hook: "", placement: "", entry: "direct" },
            set: pronounSetFor(safeStorage(window.sessionStorage, "getItem", KEYS.pronoun) || ""),
            checkoutReturn: params.get("checkout") || "",
            notice: "",
            retry: null,
            summary: null
        };
        var token = safeStorage(window.localStorage, "getItem", KEYS.token) || "";
        captureGaIds();

        function fallback(notice, retryable, retry) {
            if (state.answers) {
                state.notice = notice;
                state.retry = retryable ? retry : null;
                renderFree(root, state);
                return;
            }
            statusScreen(root, "Nothing to show yet.", notice + " Take the test again for a fresh result.", linkButton("Take the Kiss Test", QUIZ_PATH));
        }

        function verify(body, mode) {
            statusScreen(root, "One moment.", "Checking your unlock...", null);
            function again() {
                verify(body, mode);
            }
            postJson("/api/verify", body).then(function (result) {
                var data = result.data || {};
                if (result.status === 200 && data.ok === true && data.product === "report") {
                    if (typeof data.token === "string" && data.token) {
                        token = data.token;
                        safeStorage(window.localStorage, "setItem", KEYS.token, token);
                    }
                    if (state.answers) {
                        safeStorage(window.localStorage, "setItem", KEYS.paidAnswers, state.answers);
                    }
                    // A refresh is then served from the token, so Stripe is asked once per purchase.
                    if (sessionId && window.history && typeof window.history.replaceState === "function") {
                        window.history.replaceState(null, "", window.location.pathname);
                    }
                    renderPaid(root, state, data.payload && data.payload.report ? data.payload.report.paid : null);
                    return;
                }
                if (result.status === 401 && mode === "token") {
                    token = "";
                    safeStorage(window.localStorage, "removeItem", KEYS.token);
                }
                var retryable = result.status >= 500 || result.status === 0;
                fallback(verifyNotice(result.status, mode), retryable, again);
            }, function () {
                fallback(verifyNotice(0, "network"), true, again);
            });
        }

        if (sessionId) {
            verify({ session_id: sessionId }, "session");
        } else if (token) {
            verify(state.answers ? { token: token, answers: state.answers } : { token: token }, "token");
        } else if (state.answers) {
            renderFree(root, state);
        } else {
            window.location.replace(QUIZ_PATH);
        }
    }

    window.KissQuiz = {
        parseHandoff: parseHandoff,
        nextIndex: nextIndex,
        buildCheckoutFields: buildCheckoutFields,
        freeSummary: freeSummary
    };

    document.addEventListener("DOMContentLoaded", function () {
        setupQuizPage();
        setupResultPage();
    });
})();
