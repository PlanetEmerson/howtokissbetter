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
        self: "kt_self_v1",
        api: "kt_api"
    };
    // Unscored. Stored in sessionStorage only; never in the URL, GA4 events, or checkout fields.
    var SELF_TAP = {
        label: "One more, only so the picture matches",
        prompt: "And you?",
        note: "This never leaves your phone. It only picks the illustration.",
        options: [
            { id: "woman", label: "A woman" },
            { id: "man", label: "A man" },
            { id: "skip", label: "Rather not say" }
        ]
    };
    var QUESTION_COUNT = 10;
    var RESULT_PATH = "/kiss-test/result/";
    var QUIZ_PATH = "/kiss-test/";
    var SHARE_URL = "https://howtokissbetter.com/kiss-test/#ref=share";
    var SHARE_TITLE = "The Kiss Test";
    var SHARE_SUBJECT = "My Kiss Test result";
    var IMAGE_ROOT = "/assets/images/kiss-test/archetypes/";
    var VIDEO_ROOT = "/assets/video/archetypes/";
    var SCORE_PLATE = "/assets/video/score-plate.mp4";
    var SCORE_DEMO = "/assets/video/score-demo.mp4";
    var WAVE_GAP = 1800;
    var WAVE_REST = 4200;
    var CARD_REST = 3200;
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
        "Your 7-day fix",
        "Retakes for 30 days on this device. Fix one habit, retake, watch the number move."
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

    // Reduced motion, data saver and slow links get today's stills: no video
    // element is created for them, so nothing downloads and nothing moves.
    function motionAllowed() {
        var connection = window.navigator && window.navigator.connection;
        if (reducedMotion() || (connection && (connection.saveData === true || /2g$/.test(String(connection.effectiveType || ""))))) {
            return false;
        }
        return typeof document.createElement("video").canPlayType === "function";
    }

    // A silent inline clip that stays invisible until it is really playing, so
    // a blocked autoplay or a missing file leaves the still in place.
    function quietVideo(className, src, poster, preload) {
        var video = el("video", className);
        video.setAttribute("muted", "");
        video.muted = true;
        video.setAttribute("playsinline", "");
        video.setAttribute("webkit-playsinline", "");
        video.setAttribute("preload", preload);
        video.setAttribute("aria-hidden", "true");
        if (poster) {
            video.setAttribute("poster", poster);
        }
        var source = el("source");
        source.setAttribute("src", src);
        source.setAttribute("type", "video/mp4");
        video.appendChild(source);
        video.addEventListener("playing", function () {
            video.classList.add("is-playing");
        });
        function remove() {
            if (video.parentNode) {
                video.parentNode.removeChild(video);
            }
        }
        video.addEventListener("error", remove);
        source.addEventListener("error", remove);
        return video;
    }

    // Keeps a card's clip alive: it plays again after a rest, only while its
    // box is on screen, and lets go once the box has left the document.
    function keepAlive(video, box) {
        var timer = null;
        var seen = true;
        function again() {
            timer = null;
            if (seen && video.parentNode) {
                video.currentTime = 0;
                playQuietly(video);
            }
        }
        video.addEventListener("ended", function () {
            window.clearTimeout(timer);
            timer = window.setTimeout(again, CARD_REST);
        });
        if (typeof window.IntersectionObserver !== "function") {
            return;
        }
        var watch = new window.IntersectionObserver(function (entries) {
            seen = entries[entries.length - 1].isIntersecting;
            if (!video.parentNode) {
                watch.disconnect();
            } else if (!seen) {
                video.pause();
            } else if (video.ended) {
                window.clearTimeout(timer);
                again();
            } else if (video.paused) {
                playQuietly(video);
            }
        }, { threshold: 0.3 });
        watch.observe(box);
    }

    function playQuietly(video) {
        var pending = video.play();
        if (pending && typeof pending.then === "function") {
            pending.then(null, function () {
                return null;
            });
        }
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
        // The engine owns the token grammar (pronouns, contractions, {v:verb}
        // agreement); this local fallback only covers a missing engine.
        if (window.KissScore && typeof window.KissScore.applyPronouns === "function") {
            return window.KissScore.applyPronouns(String(text), set);
        }
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

    // Picks the illustration only: two men, two women, or the mixed default for
    // every other combination (including "them", "nobody", and "rather not say").
    function pairingFor(partnerId, selfId) {
        if (partnerId === "him" && selfId === "man") {
            return "mm";
        }
        if (partnerId === "her" && selfId === "woman") {
            return "ww";
        }
        return "mw";
    }

    function storedPairing() {
        return pairingFor(
            safeStorage(window.sessionStorage, "getItem", KEYS.pronoun) || "",
            safeStorage(window.sessionStorage, "getItem", KEYS.self) || ""
        );
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

    // Handoff from an article hook card (fragment or query string); unknown values are dropped, never echoed.
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

    // Landing page clips: a row card loads nothing until it is hovered (fine
    // pointers) or mostly in view (touch), plays once and ends on its own
    // still; the tier demo loops only while it is on screen.
    function setupLandingMotion() {
        var thumbs = document.querySelectorAll(".quiz-archetype-card img");
        var demo = document.querySelector("[data-score-demo]");
        if ((!thumbs.length && !demo) || !motionAllowed()) {
            return;
        }
        var observes = typeof window.IntersectionObserver === "function";
        var deck = [];
        var row = null;
        Array.prototype.forEach.call(thumbs, function (img) {
            var match = /\/archetypes\/([a-z-]+)-mw-thumb\.webp$/.exec(img.getAttribute("src") || "");
            var card = img.parentNode;
            var video = null;
            if (!match || !card) {
                return;
            }
            row = card.parentNode;
            function play() {
                if (!video) {
                    video = quietVideo("", VIDEO_ROOT + match[1] + "-mw.mp4", img.getAttribute("src"), "none");
                    video.setAttribute("width", "540");
                    video.setAttribute("height", "675");
                    card.insertBefore(video, img.nextSibling);
                }
                if (video.ended) {
                    video.currentTime = 0;
                }
                playQuietly(video);
            }
            card.addEventListener("mouseenter", play);
            deck.push({
                play: play,
                pause: function () {
                    if (video) {
                        video.pause();
                    }
                }
            });
        });
        if (deck.length && observes) {
            // The row ripples while it is on screen: a card starts every
            // WAVE_GAP, rests after the last one, then goes round again.
            var timer = null;
            var index = 0;
            var step = function () {
                deck[index % deck.length].play();
                index += 1;
                timer = window.setTimeout(step, index % deck.length ? WAVE_GAP : WAVE_REST);
            };
            new window.IntersectionObserver(function (entries) {
                window.clearTimeout(timer);
                if (entries[entries.length - 1].isIntersecting) {
                    step();
                } else {
                    deck.forEach(function (item) {
                        item.pause();
                    });
                }
            }, { threshold: 0.25 }).observe(row);
        }
        if (!demo || !observes) {
            return;
        }
        var poster = demo.querySelector("img");
        var loop = null;
        new window.IntersectionObserver(function (entries) {
            var visible = entries[entries.length - 1].isIntersecting;
            if (visible && !loop) {
                loop = quietVideo("", SCORE_DEMO, poster ? poster.getAttribute("src") : "", "none");
                loop.setAttribute("loop", "");
                loop.setAttribute("width", "536");
                loop.setAttribute("height", "670");
                demo.insertBefore(loop, poster ? poster.nextSibling : null);
            }
            if (visible) {
                playQuietly(loop);
            } else if (loop) {
                loop.pause();
            }
        }, { threshold: 0.4 }).observe(demo);
    }

    // On phones the hero still comes alive once the page has loaded: the
    // kitchen clip fades in over it, fades back to the still when it ends,
    // rests, and plays again while the hero is on screen. Wider screens keep
    // the still; the clip is portrait and a wide hero would crop the faces.
    function setupHeroMotion() {
        var media = document.querySelector(".quiz-hero__media");
        if (!media || !motionAllowed() || !window.matchMedia("(max-width: 767px)").matches) {
            return;
        }
        function start() {
            var video = quietVideo("quiz-hero__video", "/assets/video/kiss-test/hero-kitchen-mobile.mp4", "", "auto");
            video.addEventListener("ended", function () {
                video.classList.remove("is-playing");
            });
            media.appendChild(video);
            keepAlive(video, media);
            playQuietly(video);
        }
        if (document.readyState === "complete") {
            start();
        } else {
            window.addEventListener("load", start);
        }
    }

    function setupQuizPage() {
        if (document.body.dataset.pageKind !== "quiz") {
            return;
        }
        var app = document.getElementById("kiss-test-app");
        if (!app) {
            return;
        }
        setupLandingMotion();
        setupHeroMotion();
        // Hooks carry the handoff in the fragment so Google indexes one /kiss-test/ URL;
        // links shared or indexed before 2026-09-24 still carry it in the query string.
        var fragment = window.location.hash.slice(1);
        var handoff = parseHandoff(fragment.indexOf("=") >= 0 ? fragment : window.location.search);
        var context = readContext();
        var answers = readAnswers();
        var pronoun = safeStorage(window.sessionStorage, "getItem", KEYS.pronoun) || "";
        var selfChoice = safeStorage(window.sessionStorage, "getItem", KEYS.self) || "";
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
                    renderSelf();
                }));
            });
            screen.appendChild(list);
            screen.appendChild(el("p", "quiz-note", data().pronoun.note));
            mount(app, screen);
            focusHeading(screen.heading);
        }

        function renderSelf() {
            inProgress = true;
            var screen = progressScreen("quiz-screen--self", SELF_TAP.label, SELF_TAP.prompt);
            var list = el("ul", "quiz-options");
            SELF_TAP.options.forEach(function (option) {
                list.appendChild(optionButton(option.label, selfChoice === option.id, function () {
                    selfChoice = option.id;
                    safeStorage(window.sessionStorage, "setItem", KEYS.self, selfChoice);
                    renderQuestion(nextIndex(answers, -1));
                }));
            });
            screen.appendChild(list);
            screen.appendChild(el("p", "quiz-note", SELF_TAP.note));
            var back = el("button", "quiz-back", "Back");
            back.type = "button";
            back.addEventListener("click", renderPronoun);
            screen.appendChild(back);
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
                    renderSelf();
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
            var dimensions = data().dimensions || [];
            for (var i = 0; i < 8; i++) {
                var dial = el("div", "quiz-dial");
                dial.appendChild(el("span", "quiz-dial__bar"));
                var name = el("span", "quiz-dial__name", dimensions[i] ? dimensions[i].name : "");
                name.setAttribute("aria-hidden", "true");
                dial.appendChild(name);
                dials.appendChild(dial);
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
            selfChoice = "";
            safeStorage(window.sessionStorage, "removeItem", KEYS.pronoun);
            safeStorage(window.sessionStorage, "removeItem", KEYS.self);
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
            selfChoice = "";
            safeStorage(window.sessionStorage, "removeItem", KEYS.pronoun);
            safeStorage(window.sessionStorage, "removeItem", KEYS.self);
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
            } else if (!selfChoice) {
                renderSelf();
            } else {
                renderQuestion(nextIndex(answers, -1));
            }
        }
    }

    function archetypeImageBase(archetype) {
        if (!ARCHETYPE_ID.test(String(archetype.id))) {
            return "";
        }
        return IMAGE_ROOT + archetype.id + "-" + storedPairing();
    }

    // "thumb" is the 540px webp used where the card is decoration, not the
    // artwork. "motion" layers the reveal clip over the full-size still; only
    // the mw pairing has clips, so mm and ww keep the still.
    function archetypeImage(archetype, variant, motion) {
        var media = el("div", "quiz-card__media");
        var base = archetypeImageBase(archetype);
        if (!base) {
            return media;
        }
        var img = el("img");
        img.setAttribute("alt", archetype.name + " archetype card");
        img.setAttribute("decoding", "async");
        if (variant === "thumb") {
            img.setAttribute("src", base + "-thumb.webp");
            img.setAttribute("width", "540");
            img.setAttribute("height", "675");
            media.appendChild(img);
            return liveCard(media, archetype, motion);
        }
        var picture = el("picture");
        var source = el("source");
        source.setAttribute("srcset", base + ".webp");
        source.setAttribute("type", "image/webp");
        picture.appendChild(source);
        img.setAttribute("src", base + ".jpg");
        img.setAttribute("width", "1080");
        img.setAttribute("height", "1350");
        picture.appendChild(img);
        media.appendChild(picture);
        return liveCard(media, archetype, motion);
    }

    // Layers the reveal clip over a card's still and keeps it alive. No
    // poster: the picture underneath is the poster, and a poster URL would
    // fetch the jpg beside the webp the picture already chose.
    function liveCard(media, archetype, motion) {
        if (motion && storedPairing() === "mw" && motionAllowed()) {
            var video = quietVideo("quiz-card__video", VIDEO_ROOT + archetype.id + "-mw.mp4", "", "auto");
            video.setAttribute("autoplay", "");
            video.setAttribute("width", "896");
            video.setAttribute("height", "1120");
            media.appendChild(video);
            keepAlive(video, media);
            playQuietly(video);
        }
        return media;
    }

    // The dare makes the partner player two, and only the paid number settles
    // it, so the share loop sells the report on its own.
    function shareText(archetype, paid) {
        var ending = paid
            ? "Kiss Score " + paid.score + ", " + paid.bandLabel + ". Your turn. Lower score buys dinner:"
            : "I'm not telling you my score. Take it. Lower score buys dinner:";
        return "I took the Kiss Test and got " + archetype.name + ". \"" + archetype.tagline + "\" " + ending;
    }

    function shareLinks(text, url) {
        var both = encodeURIComponent(text + " " + url);
        return {
            whatsapp: "https://wa.me/?text=" + both,
            sms: "sms:?&body=" + both,
            x: "https://twitter.com/intent/tweet?text=" + encodeURIComponent(text) + "&url=" + encodeURIComponent(url),
            facebook: "https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(url),
            email: "mailto:?subject=" + encodeURIComponent(SHARE_SUBJECT) + "&body=" + both
        };
    }

    function copyText(text) {
        var clipboard = window.navigator && window.navigator.clipboard;
        if (clipboard && typeof clipboard.writeText === "function") {
            return clipboard.writeText(text);
        }
        return Promise.reject(new Error("clipboard_unavailable"));
    }

    function shareIcon() {
        var ns = "http://www.w3.org/2000/svg";
        var svg = document.createElementNS(ns, "svg");
        svg.setAttribute("class", "quiz-share-cta__icon");
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("aria-hidden", "true");
        svg.setAttribute("focusable", "false");
        var path = document.createElementNS(ns, "path");
        path.setAttribute("d", "M12 3v12m0-12 4 4m-4-4-4 4M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7");
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", "currentColor");
        path.setAttribute("stroke-width", "2");
        path.setAttribute("stroke-linecap", "round");
        path.setAttribute("stroke-linejoin", "round");
        svg.appendChild(path);
        return svg;
    }

    // In-page fallback for browsers without Web Share: one dialog per opening,
    // removed again on close so labels and focus never go stale.
    function shareSheet(options) {
        var dialog = el("dialog", "quiz-share");
        dialog.setAttribute("aria-labelledby", "quiz-share-title");
        var shell = el("div", "quiz-share__shell");
        var header = el("div", "quiz-share__header");
        var titles = el("div");
        titles.appendChild(el("p", "quiz-share__eyebrow", "Share"));
        var title = el("h2", "quiz-share__title", "Your archetype card");
        title.id = "quiz-share-title";
        titles.appendChild(title);
        header.appendChild(titles);
        var closeButton = el("button", "quiz-share__close", "Close");
        closeButton.type = "button";
        closeButton.setAttribute("aria-label", "Close share sheet");
        header.appendChild(closeButton);
        shell.appendChild(header);

        var body = el("div", "quiz-share__body");
        var media = archetypeImage(options.archetype);
        media.className = "quiz-share__media";
        body.appendChild(media);
        body.appendChild(el("blockquote", "quiz-share__text", options.text + " " + SHARE_URL));
        var grid = el("div", "quiz-share__grid");
        var toast = el("p", "quiz-share__toast");
        toast.setAttribute("role", "status");
        toast.setAttribute("aria-live", "polite");
        var focusables = [closeButton];
        var lastFocused = null;

        function copyAction(label, value, method) {
            var button = el("button", "quiz-share__action", label);
            button.type = "button";
            button.addEventListener("click", function () {
                copyText(value).then(function () {
                    button.textContent = "Copied";
                    toast.textContent = "Copied";
                    options.report(method);
                    window.setTimeout(function () {
                        button.textContent = label;
                        toast.textContent = "";
                    }, 2000);
                }, function () {
                    toast.textContent = "Copy isn't available here. Try one of the other options.";
                });
            });
            grid.appendChild(button);
            focusables.push(button);
        }

        function linkAction(label, href, method, attrs) {
            var link = el("a", "quiz-share__action", label);
            link.setAttribute("href", href);
            Object.keys(attrs || {}).forEach(function (name) {
                link.setAttribute(name, attrs[name]);
            });
            link.addEventListener("click", function () {
                options.report(method);
            });
            grid.appendChild(link);
            focusables.push(link);
        }

        var links = shareLinks(options.text, SHARE_URL);
        var external = { target: "_blank", rel: "noopener" };
        copyAction("Copy link", SHARE_URL, "copy_link");
        copyAction("Copy text", options.text + " " + SHARE_URL, "copy_text");
        linkAction("WhatsApp", links.whatsapp, "whatsapp", external);
        linkAction("Messages", links.sms, "sms");
        linkAction("X", links.x, "x", external);
        linkAction("Facebook", links.facebook, "facebook", external);
        linkAction("Email", links.email, "email");
        if (options.jpg) {
            linkAction("Save image", options.jpg, "image", { download: "kiss-test-" + options.archetype.id + ".jpg" });
        }
        body.appendChild(grid);
        body.appendChild(toast);
        shell.appendChild(body);
        dialog.appendChild(shell);

        function dismiss() {
            document.body.classList.remove("quiz-share-open");
            if (dialog.parentNode) {
                dialog.parentNode.removeChild(dialog);
            }
            if (lastFocused && typeof lastFocused.focus === "function") {
                lastFocused.focus({ preventScroll: true });
            }
        }

        function close() {
            if (typeof dialog.close === "function" && dialog.open) {
                dialog.close();
            } else {
                dialog.removeAttribute("open");
                dismiss();
            }
        }

        function open() {
            lastFocused = document.activeElement || null;
            document.body.appendChild(dialog);
            if (typeof dialog.showModal === "function") {
                dialog.showModal();
            } else {
                dialog.setAttribute("open", "");
                document.body.classList.add("quiz-share-open");
            }
            closeButton.focus({ preventScroll: true });
        }

        closeButton.addEventListener("click", close);
        dialog.addEventListener("close", dismiss);
        dialog.addEventListener("click", function (event) {
            if (event.target === dialog) {
                close();
            }
        });
        dialog.addEventListener("keydown", function (event) {
            if (event.key === "Escape") {
                event.preventDefault();
                close();
                return;
            }
            if (event.key !== "Tab") {
                return;
            }
            var first = focusables[0];
            var last = focusables[focusables.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        });
        return { open: open, close: close, dialog: dialog };
    }

    // The archetype jpg as a File for Web Share; null when the image or the File
    // API is unavailable, so the share degrades to text and url.
    function shareFile(jpg, archetype) {
        if (!jpg || typeof window.fetch !== "function" || typeof window.File !== "function") {
            return Promise.resolve(null);
        }
        return window.fetch(jpg).then(function (response) {
            if (!response.ok) {
                throw new Error("image_unavailable");
            }
            return response.blob();
        }).then(function (blob) {
            return new window.File([blob], "kiss-test-" + archetype.id + ".jpg", { type: "image/jpeg" });
        }).then(null, function () {
            return null;
        });
    }

    function webShare(nav, text, file) {
        var data = { title: SHARE_TITLE, text: text, url: SHARE_URL };
        if (file) {
            var withFile = { files: [file], title: SHARE_TITLE, text: text, url: SHARE_URL };
            if (nav.canShare(withFile)) {
                data = withFile;
            }
        }
        return nav.share(data);
    }

    // One primary button: the native share sheet where the browser has one, the
    // in-page sheet everywhere else, and after a native share fails for any reason
    // other than the visitor dismissing it.
    function shareActions(archetype, paid) {
        var actions = el("div", "quiz-card__actions");
        var text = shareText(archetype, paid);
        var base = archetypeImageBase(archetype);
        var jpg = base ? base + ".jpg" : "";
        var sharing = false;

        function report(method) {
            sendEvent("share_click", { method: method, archetype: archetype.id });
        }

        function openSheet() {
            shareSheet({ archetype: archetype, text: text, jpg: jpg, report: report }).open();
        }

        var button = el("button", "conversion-button quiz-share-cta__button");
        button.type = "button";
        button.appendChild(shareIcon());
        button.appendChild(el("span", null, paid ? "Share my score" : "Share my result"));
        button.addEventListener("click", function () {
            var nav = window.navigator;
            if (!nav || typeof nav.share !== "function" || typeof nav.canShare !== "function") {
                openSheet();
                return;
            }
            if (sharing) {
                return;
            }
            sharing = true;
            shareFile(jpg, archetype).then(function (file) {
                return webShare(nav, text, file);
            }).then(function () {
                sharing = false;
                report("web_share");
            }, function (error) {
                sharing = false;
                if (!error || error.name !== "AbortError") {
                    openSheet();
                }
            });
        });
        actions.appendChild(button);
        actions.appendChild(el("p", "quiz-share-cta__sub", "Post your archetype. Your score stays private unless you choose."));
        return actions;
    }

    function archetypeCard(archetype, paid, options) {
        options = options || {};
        var card = el("section", "quiz-card");
        card.setAttribute("aria-label", "Your archetype");
        card.appendChild(archetypeImage(archetype, "", true));
        var body = el("div", "quiz-card__body");
        body.appendChild(el("p", "quiz-card__eyebrow", options.eyebrow || "Kiss Test result"));
        var title = el(options.headingTag || "h1", "quiz-card__title", "You're " + archetype.name + ".");
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
        var button = el("button", "conversion-button conversion-sheen quiz-paywall__button", "Unlock my full report · $4.99");
        button.type = "submit";
        form.appendChild(button);
        var guarantee = el("p", "kiss-guarantee");
        guarantee.setAttribute("data-guarantee", "");
        var mark = el("span", "kiss-guarantee__mark", "30");
        mark.setAttribute("aria-hidden", "true");
        guarantee.appendChild(mark);
        var terms = el("span");
        terms.appendChild(el("strong", null, "30-day guarantee."));
        terms.appendChild(document.createTextNode(" Not worth it? One email, full refund. "));
        terms.appendChild(el("span", "kiss-guarantee__keep", "Keep it anyway. I can't take it back."));
        guarantee.appendChild(terms);
        form.appendChild(guarantee);

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
        claim.appendChild(el("span", "quiz-score-card__endowment", "It's already scored. It's sitting under the blur."));
        card.appendChild(claim);
        card.appendChild(el("p", "quiz-score-card__teaser", state.summary.teaser));
        card.appendChild(el("p", "quiz-score-card__floor", "Nobody scores under 20. The report is the fix, not the verdict."));
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
        card.appendChild(el("p", "quiz-paywall__once", "One-time payment. No subscription, no account. Tap, pay on Stripe's page with Apple Pay, Google Pay, Link, or card, and you land back here with the report on this screen."));
        var fine = el("p", "quiz-paywall__fine");
        fine.appendChild(el("em", null, "A five-minute read, assembled from your answers, not a template with your name on it. For fun and self-awareness, not a scientific instrument. You must be 18 or older to purchase. Refunds: email " + SUPPORT_EMAIL + " within 30 days."));
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

    // "Retake the test" starts fresh: a half-finished retake left in
    // sessionStorage would otherwise resume mid-test on /kiss-test/.
    function retakeFresh(link) {
        link.addEventListener("click", function () {
            safeStorage(window.sessionStorage, "removeItem", KEYS.answers);
        });
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
        if (id === "tonight") {
            var steps = el("ol", "quiz-steps");
            items.forEach(function (item) {
                if (typeof item === "string") {
                    steps.appendChild(el("li", null, text(stripOrdinal(item))));
                }
            });
            return steps;
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

    // Paragraphs then items, except "tonight", whose paragraph is the sign-off
    // and reads after the steps.
    function paidSection(section, state, local) {
        var id = levelAttr(section.id);
        var wrap = el("section", "quiz-paid-section" + (id ? " quiz-paid-section--" + id : ""));
        wrap.appendChild(el("h2", "quiz-section-title", applyPronouns(section.title || "", state.set)));
        if (section.headline) {
            wrap.appendChild(el("p", "quiz-score-headline", applyPronouns(section.headline, state.set)));
        }
        var paragraphClass = "quiz-paid-paragraph" + (id === "verdict" ? " quiz-verdict" : "") + (id === "tonight" ? " quiz-signoff" : "");
        var paragraphs = (Array.isArray(section.paragraphs) ? section.paragraphs : []).map(function (paragraph) {
            return el("p", paragraphClass, applyPronouns(paragraph, state.set));
        });
        var items = Array.isArray(section.items) && section.items.length ? paidItems(section, state, local) : null;
        var order = id === "tonight" ? [items].concat(paragraphs) : paragraphs.concat([items]);
        order.forEach(function (node) {
            if (node) {
                wrap.appendChild(node);
            }
        });
        return wrap;
    }

    // The server numbers list items ("1. ..."); the markup numbers them itself.
    function stripOrdinal(value) {
        return String(value || "").replace(/^\d+\.\s*/, "");
    }

    function firstItemTitle(sections, id) {
        for (var i = 0; i < sections.length; i++) {
            var section = sections[i];
            if (!section || section.id !== id || !Array.isArray(section.items) || !section.items.length) {
                continue;
            }
            var first = section.items[0];
            var title = first && typeof first === "object" ? first.title : first;
            return stripOrdinal(title);
        }
        return "";
    }

    // At a glance, above the first paid section: thumb, name, score and the two
    // chips the rest of the report expands on.
    function glanceCard(local, sections, state, compact) {
        var card = el("section", compact ? "quiz-glance quiz-glance--compact" : "quiz-glance");
        card.setAttribute("aria-label", "Your result at a glance");
        if (motionAllowed()) {
            // The reveal moment: the gold plate breathes once behind the
            // count-up, then fades and leaves the DOM.
            var plate = quietVideo("quiz-glance__plate", SCORE_PLATE, "", "auto");
            plate.setAttribute("autoplay", "");
            plate.addEventListener("ended", function () {
                plate.classList.add("is-done");
                window.setTimeout(function () {
                    if (plate.parentNode) {
                        plate.parentNode.removeChild(plate);
                    }
                }, 800);
            });
            card.appendChild(plate);
            playQuietly(plate);
        }
        var body = el("div", "quiz-glance__body");
        if (!compact) {
            var media = archetypeImage(local.archetype, "thumb", true);
            media.className = "quiz-glance__media";
            card.appendChild(media);
            body.appendChild(el("p", "quiz-glance__name", local.archetype.name));
            body.appendChild(el("p", "quiz-glance__tagline", local.archetype.tagline));
        }
        var score = el("p", "quiz-glance__score");
        score.appendChild(el("span", "quiz-glance__score-label", "Kiss Score"));
        score.appendChild(el("strong", null, local.score));
        // Sighted count-up stand-in; the <strong> stays the score assistive tech
        // reads and quiz.css hides it visually only where the count runs.
        var count = el("span", "quiz-glance__count");
        count.setAttribute("aria-hidden", "true");
        count.style.setProperty("--kiss-score", String(local.score));
        score.appendChild(count);
        score.appendChild(el("span", null, local.band.label));
        body.appendChild(score);
        var chips = el("ul", "quiz-glance__chips");
        [["Strongest", firstItemTitle(sections, "strengths")], ["Costliest", firstItemTitle(sections, "costs")]].forEach(function (pair) {
            if (!pair[1]) {
                return;
            }
            var chip = el("li", "quiz-glance__chip");
            chip.appendChild(el("span", "quiz-glance__chip-label", pair[0] + ": "));
            chip.appendChild(el("span", null, applyPronouns(pair[1], state.set)));
            chips.appendChild(chip);
        });
        if (chips.firstChild) {
            body.appendChild(chips);
        }
        card.appendChild(body);
        return card;
    }

    function renderPaid(root, state, report) {
        // The report describes the answers that were paid for, which can differ
        // from this browser's latest run (a Stripe return link, or a retake in
        // progress). Its own free summary drives the header, not local state.
        var paid = report && report.paid ? report.paid : report;
        var sections = paid && Array.isArray(paid.sections) ? paid.sections : [];
        if (!sections.length) {
            statusScreen(root, "Unlocked.", "The report came back empty. Email " + SUPPORT_EMAIL + " with your receipt and I will fix it.", null);
            return;
        }
        var local = null;
        if (report && report.free && report.free.archetype && report.free.band) {
            local = report.free;
            if (typeof local.answers === "string" && local.answers) {
                state.answers = local.answers;
            }
        } else {
            try {
                local = engine() && state.answers ? engine().score(state.answers) : null;
            } catch (error) {
                local = null;
            }
        }
        clear(root);
        var header = el("header", "quiz-paid-header");
        header.appendChild(el("p", "conversion-kicker", "Kiss Test report"));
        var heading = el("h1", null, "Unlocked. Here's the honest version.");
        header.appendChild(heading);
        root.appendChild(header);
        if (local && local.archetype && local.band) {
            // The full-size archetype art stays on the unlocked page too; the
            // compact glance below it carries the score and the two chips.
            root.appendChild(archetypeCard(local.archetype, { score: local.score, bandLabel: local.band.label }, { headingTag: "h2", eyebrow: "Kiss Test report" }));
            root.appendChild(glanceCard(local, sections, state, true));
        }
        sections.forEach(function (section) {
            if (section && typeof section === "object") {
                root.appendChild(paidSection(section, state, local));
            }
        });
        var signoff = el("div", "quiz-paid-signoff");
        signoff.appendChild(el("p", "quiz-signoff", "That's the honest version. Day 7, retake it. Your report stays open 30 days and I want that number to move. C.J."));
        var retake = el("a", "quiz-paid-signoff__link", "Retake the test");
        retake.setAttribute("href", QUIZ_PATH + "#kiss-test-app");
        retake.setAttribute("data-quiz-retake", "");
        retakeFresh(retake);
        signoff.appendChild(retake);
        root.appendChild(signoff);
        // The feedback form and its sent line are static markup after the
        // root, hidden until a paid render moves the right one into place.
        var params = new URLSearchParams(window.location.search);
        var feedback = document.querySelector(params.get("feedback") === "sent" ? "[data-feedback-sent]" : "form.kiss-feedback");
        if (feedback) {
            feedback.removeAttribute("hidden");
            root.appendChild(feedback);
        }
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
            return "This device's 30-day window on the report has ended. Bought it less than 30 days ago? Email " + SUPPORT_EMAIL + " and I will sort it out.";
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
        Array.prototype.forEach.call(document.querySelectorAll("[data-quiz-retake]"), retakeFresh);

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
                    renderPaid(root, state, data.payload && data.payload.report ? data.payload.report : null);
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
        freeSummary: freeSummary,
        pairingFor: pairingFor,
        shareLinks: shareLinks
    };

    document.addEventListener("DOMContentLoaded", function () {
        setupQuizPage();
        setupResultPage();
    });
})();
