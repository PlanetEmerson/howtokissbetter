(function () {
    "use strict";

    var MEASUREMENT_ID = "G-YNQ785TC90";
    var PRODUCT = {
        id: "kiss-report",
        title: "Kiss Test full report",
        price: 2.99,
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
    // One tap sets the question pronouns (partner) and the illustration (self).
    // Unscored. Stored in sessionStorage only; never in the URL, GA4 events, or checkout fields.
    var PAIRINGS = [
        { self: "woman", partner: "him", label: "I'm a woman kissing a man" },
        { self: "man", partner: "her", label: "I'm a man kissing a woman" },
        { self: "woman", partner: "her", label: "I'm a woman kissing a woman" },
        { self: "man", partner: "him", label: "I'm a man kissing a man" }
    ];
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
        "Where every point went, across 8 dimensions",
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
    // Tags paywall_view and the report's begin_checkout since the free tier started showing the score.
    var PAYWALL_VARIANT = "score-first";
    var PRICE_LABEL = "$" + PRODUCT.price.toFixed(2);
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

    // Everything the free page may say about the score: the number, its band, counts and names, and
    // the costliest answer's points. That habit's name comes from /api/kiss-free; its fix never does.
    function freeSummary(result) {
        var teasers = result.teasers || {};
        var costing = Number(teasers.costingCount) || 0;
        var strongest = teasers.strongestDimension ? teasers.strongestDimension.name : "";
        var costingLine = costing === 0
            ? "None of your 10 answers are costing you points."
            : costing + " of your 10 answers " + (costing === 1 ? "is" : "are") + " costing you points.";
        var costliest = Array.isArray(result.costliest) ? result.costliest : [];
        var top = costliest[0];
        var dimension = top ? (result.dimensions || []).filter(function (d) { return d.key === top.dimension; })[0] : null;
        var ks = engine();
        var bands = ks && ks.DATA && Array.isArray(ks.DATA.bands) ? ks.DATA.bands : [];
        var topBand = bands.reduce(function (best, band) { return !best || band.min > best.min ? band : best; }, null);
        var score = Number(result.score) || 0;
        return {
            archetype: result.archetype,
            score: score,
            band: result.band ? result.band.id : "",
            topBand: topBand ? { id: topBand.id, label: topBand.label, gap: Math.max(0, topBand.min - score) } : null,
            bandLabel: result.band ? result.band.label : "",
            costingCount: costing,
            costliestCount: costliest.length,
            costliest: top ? { points: top.points, max: top.max, dimension: dimension ? dimension.name : "" } : null,
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

    var PAIR_ICONS = {
        woman: "M18 9a6 6 0 1 1-12 0 6 6 0 0 1 12 0ZM12 15v7M8.5 18.5h7",
        man: "M16 14a6 6 0 1 1-12 0 6 6 0 0 1 12 0ZM14.3 9.7 20 4M15 4h5v5",
        heart: "M12 20.5s-7.5-4.6-7.5-10.3A4.2 4.2 0 0 1 12 7.6a4.2 4.2 0 0 1 7.5 2.6c0 5.7-7.5 10.3-7.5 10.3Z"
    };

    function pairIcon(kind) {
        var ns = "http://www.w3.org/2000/svg";
        var svg = document.createElementNS(ns, "svg");
        svg.setAttribute("class", "quiz-pair__icon quiz-pair__icon--" + kind);
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("aria-hidden", "true");
        svg.setAttribute("focusable", "false");
        var path = document.createElementNS(ns, "path");
        path.setAttribute("d", PAIR_ICONS[kind]);
        svg.appendChild(path);
        return svg;
    }

    function pairSide(kind, who, className) {
        var side = el("span", className);
        side.appendChild(pairIcon(kind));
        side.appendChild(el("span", "quiz-pair__who", who));
        return side;
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

        function choose(partner, self) {
            pronoun = partner;
            selfChoice = self;
            safeStorage(window.sessionStorage, "setItem", KEYS.pronoun, pronoun);
            safeStorage(window.sessionStorage, "setItem", KEYS.self, selfChoice);
            renderQuestion(nextIndex(answers, -1));
        }

        function renderPairing() {
            inProgress = true;
            var label = answeredCount(answers) > 0 ? "Answer saved · one tap first" : "Before we start";
            var screen = progressScreen("quiz-screen--pairing", label, "Who's kissing who?");
            var grid = el("ul", "quiz-options quiz-pairs");
            PAIRINGS.forEach(function (pair) {
                var item = optionButton("", pronoun === pair.partner && selfChoice === pair.self, function () {
                    choose(pair.partner, pair.self);
                });
                var button = item.firstChild;
                button.classList.add("quiz-pair");
                button.setAttribute("aria-label", pair.label);
                button.appendChild(pairSide(pair.self, "You", "quiz-pair__side quiz-pair__side--you"));
                button.appendChild(pairIcon("heart"));
                button.appendChild(pairSide(pair.partner === "him" ? "man" : "woman", pair.partner === "him" ? "Him" : "Her", "quiz-pair__side"));
                grid.appendChild(item);
            });
            screen.appendChild(grid);
            var more = el("ul", "quiz-options quiz-pairs__more");
            data().pronoun.options.forEach(function (option) {
                if (option.aspirational) {
                    more.appendChild(optionButton(option.label, pronoun === option.id, function () {
                        choose(option.id, "skip");
                    }));
                }
            });
            more.appendChild(optionButton("Other, or rather not say", selfChoice === "skip" && pronoun !== "nobody", renderPronoun));
            screen.appendChild(more);
            mount(app, screen);
            focusHeading(screen.heading);
        }

        // "Other, or rather not say": the partner alone sets the pronouns, and
        // the illustration falls back to the mixed default.
        function renderPronoun() {
            inProgress = true;
            var screen = progressScreen("quiz-screen--pronoun", "Before we start", data().pronoun.prompt);
            var list = el("ul", "quiz-options");
            data().pronoun.options.forEach(function (option) {
                list.appendChild(optionButton(option.label, pronoun === option.id && selfChoice === "skip", function () {
                    choose(option.id, "skip");
                }));
            });
            screen.appendChild(list);
            screen.appendChild(el("p", "quiz-note", data().pronoun.note));
            var back = el("button", "quiz-back", "Back");
            back.type = "button";
            back.addEventListener("click", renderPairing);
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
                    renderPairing();
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
            renderPairing();
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
            renderPairing();
            // Focus alone scrolls just far enough to show the card, which leaves the hero's
            // Start button above it on phones; article readers have already started.
            app.scrollIntoView({ block: "start" });
            return;
        }

        if (answeredCount(answers) > 0 && !isComplete(answers) && engine() && engine().DATA) {
            if (!pronoun) {
                renderPairing();
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
        var card = el("section", options.compact ? "quiz-card quiz-card--compact" : "quiz-card");
        card.setAttribute("aria-label", "Your archetype");
        card.appendChild(archetypeImage(archetype, "", true));
        var body = el("div", "quiz-card__body");
        body.appendChild(el("p", "quiz-card__eyebrow", options.eyebrow || "Kiss Test result"));
        var title = el(options.headingTag || "h1", "quiz-card__title", "You're " + archetype.name + ".");
        body.appendChild(title);
        body.appendChild(el("p", "quiz-card__tagline", archetype.tagline));
        body.appendChild(el("p", "quiz-card__url", "howtokissbetter.com/kiss-test"));
        card.appendChild(body);
        if (!options.compact) {
            card.appendChild(shareActions(archetype, paid));
        }
        card.heading = title;
        return card;
    }

    function plainScore(summary) {
        var figure = el("p", "quiz-score-card__score");
        figure.appendChild(el("strong", null, String(summary.score)));
        figure.appendChild(el("span", "quiz-score-card__out-of", "/100"));
        figure.appendChild(el("span", "quiz-score-card__band", summary.bandLabel));
        return figure;
    }

    function scoreBar(score) {
        var bar = el("div", "quiz-score-card__bar");
        bar.setAttribute("aria-hidden", "true");
        var fill = el("span");
        fill.style.setProperty("--score", Math.max(0, Math.min(100, score)) + "%");
        bar.appendChild(fill);
        return bar;
    }

    // Ranked against the report's habits, not the teaser's count: the engine picks one habit per
    // dimension and counts answers the teaser does not, so "only" or "one of two" could contradict it.
    var COSTLIEST_RANK = {
        1: "It's the one habit the report fixes.",
        2: "It's the first of the two habits the report fixes.",
        3: "It's the first of the three habits the report fixes."
    };
    // When fewer answers cost points than the report covers, "first of the three" read as a
    // contradiction of the teaser's "1 of your 10 answers", so name the rest as weakest spots.
    var NEXT_SPOTS = { 1: "your next weakest spot", 2: "your next two weakest spots" };

    function costliestMeta(summary, named) {
        var cost = summary.costliest;
        var where = named && cost.dimension ? " on " + cost.dimension : "";
        var habits = Math.min(summary.costliestCount, 3);
        var rank;
        if (summary.costingCount === 0) {
            rank = "It's your lowest spot, even with nothing costing you.";
        } else if (habits > 1 && summary.costingCount < habits) {
            rank = "The report fixes it first, then " + NEXT_SPOTS[habits - 1] + ".";
        } else {
            rank = COSTLIEST_RANK[habits];
        }
        return "Scored " + cost.points + " of " + cost.max + " points" + where + ". " + rank;
    }

    // High scorers were told "Dangerous, in a Good Way" and had no reason to pay for a fix, so
    // their pitch sells the gap to the top band and what the partner notices instead.
    function pitchLine(summary) {
        if (!summary.costliest || summary.costingCount === 0) {
            return "Nothing's costing you points. The report shows where every one came from, and how to keep them.";
        }
        var top = summary.topBand;
        if (top && summary.band === top.id) {
            return top.label + ". The report shows the habit still costing you points, and what {he}'s actually noticing.";
        }
        if (top && summary.band === "dangerous" && top.gap > 0) {
            return top.gap + (top.gap === 1 ? " point" : " points") + " off " + top.label + ". The report shows where those points went, and what {he}'s actually noticing.";
        }
        return "Now you know what's costing you. The report shows why, and what to do instead.";
    }

    // Stands in with the dimension until /api/kiss-free answers with the habit's own title.
    function costliestBlock(summary) {
        var block = el("div", "quiz-cost");
        block.appendChild(el("p", "quiz-cost__label", summary.costingCount === 0 ? "Your weakest spot" : "Costing you the most"));
        block.name = el("p", "quiz-cost__title", summary.costliest.dimension ? "A habit in " + summary.costliest.dimension : "One habit");
        block.appendChild(block.name);
        block.meta = el("p", "quiz-cost__meta", costliestMeta(summary, false));
        block.appendChild(block.meta);
        return block;
    }

    function nameCostliest(block, summary, title, set) {
        block.name.textContent = applyPronouns(title, set);
        block.meta.textContent = costliestMeta(summary, true);
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
        var button = el("button", "conversion-button conversion-sheen quiz-paywall__button", "Unlock my full report · " + PRICE_LABEL);
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

        function begin(event, placement) {
            if (form.dataset.checkoutSubmitted === "true") {
                event.preventDefault();
                return;
            }
            form.dataset.checkoutSubmitted = "true";
            setHiddenField(form, "placement", placement);
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
                placement: placement,
                archetype: state.summary.archetype.id,
                score_band: state.summary.band,
                variant: PAYWALL_VARIANT,
                items: [{ item_id: PRODUCT.id, item_name: PRODUCT.title, price: PRODUCT.price, quantity: 1 }],
                event_callback: submitOnce,
                event_timeout: 400
            });
            window.setTimeout(submitOnce, 500);
        }
        form.addEventListener("submit", function (event) {
            begin(event, "quiz-paywall");
        });
        // For the locked sections' unlock buttons: the same checkout, without a native submit event,
        // under its own placement so the pulse can tell which button sold.
        form.start = function () {
            var event = { prevented: false, preventDefault: function () { this.prevented = true; } };
            begin(event, "quiz-locked");
            if (!event.prevented) {
                form.submit();
            }
        };
        // Back from Stripe can restore this page from the back/forward cache with the guard
        // still set, which would leave every unlock button dead.
        window.addEventListener("pageshow", function (event) {
            if (event.persisted) {
                delete form.dataset.checkoutSubmitted;
            }
        });
        return form;
    }

    function scoreCard(state) {
        var archetype = state.summary.archetype;
        var card = el("section", "quiz-score-card");
        card.id = "kiss-test-paywall";
        card.setAttribute("aria-label", "Your Kiss Score");
        card.appendChild(el("p", "conversion-kicker", "Your Kiss Score"));
        card.appendChild(plainScore(state.summary));
        card.appendChild(scoreBar(state.summary.score));
        card.appendChild(el("p", "quiz-score-card__teaser", state.summary.teaser));
        if (state.summary.costliest) {
            card.costliest = costliestBlock(state.summary);
            card.appendChild(card.costliest);
        }
        card.appendChild(el("p", "quiz-score-card__pitch", fillIn(pitchLine(state.summary), archetype, state.set)));
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
        // The button sits right under the costliest habit so it lands on the first screen on a phone;
        // the list of what's inside follows it instead of pushing it down.
        card.form = paywallForm(state);
        card.appendChild(card.form);
        var behind = el("p", "quiz-score-card__behind");
        behind.appendChild(el("strong", null, "Behind the unlock:"));
        card.appendChild(behind);
        var list = el("ul", "quiz-paywall__list");
        UNLOCK_LIST.forEach(function (line) {
            list.appendChild(el("li", null, fillIn(line, archetype, state.set)));
        });
        card.appendChild(list);
        var claim = el("p", "quiz-score-card__claim");
        claim.appendChild(el("strong", null, "Computed from your 10 answers. Not a vibe. A number."));
        card.appendChild(claim);
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

    // The two strongest-habit blurbs and the costliest habit's name come from the functions. On any
    // failure, or from a deploy that predates the name, the section stays empty and the dimension stands in.
    function loadFreeTier(section, costliest, state) {
        postJson("/api/kiss-free", { answers: state.answers }).then(function (result) {
            var free = result.status === 200 && result.data.ok === true ? result.data.free : null;
            var habit = free && free.costliestHabit;
            if (costliest && habit && typeof habit.title === "string" && habit.title) {
                nameCostliest(costliest, state.summary, habit.title, state.set);
            }
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

    // Each locked section's unlock starts checkout through the paywall form, so its GA event and
    // double-submit guard apply; it used to only scroll back up to the paywall.
    function lockedList(state, form) {
        var wrap = el("div", "quiz-locked-list");
        LOCKED_TITLES.forEach(function (title) {
            var section = el("section", "quiz-locked-section");
            section.appendChild(el("h2", "quiz-section-title", fillIn(title, state.summary.archetype, state.set)));
            var body = el("div", "quiz-locked");
            body.setAttribute("aria-hidden", "true");
            for (var i = 0; i < 3; i++) {
                body.appendChild(el("p", null, "This section is assembled from your answers and reads differently for every archetype. It opens with the report, alongside the breakdown it is built on."));
            }
            section.appendChild(body);
            var note = el("p", "quiz-locked__note");
            note.appendChild(el("em", null, "Unlocks with the report."));
            var unlock = el("button", "quiz-unlock-link", "Unlock · " + PRICE_LABEL);
            unlock.type = "button";
            unlock.addEventListener("click", form.start);
            note.appendChild(unlock);
            section.appendChild(note);
            wrap.appendChild(section);
        });
        return wrap;
    }

    function attrs(node, values) {
        Object.keys(values).forEach(function (name) {
            node.setAttribute(name, values[name]);
        });
        return node;
    }

    // The free result's one email box: a Brevo double opt-in through the functions, which
    // recompute the result from the answers. Only the archetype and band reach GA4.
    function emailCapture(state) {
        var section = el("section", "quiz-email-capture");
        section.appendChild(el("p", "conversion-kicker", "Not tonight?"));
        section.appendChild(el("h2", "quiz-section-title", "Get your result by email."));
        section.appendChild(el("p", "quiz-email-capture__lede", "Your score, the habit costing you most, and the unlock link, in your inbox. Plus two short notes from me. Unsubscribe anytime."));
        var form = el("form", "quiz-email-capture__form");
        var field = el("label", "quiz-email-capture__field");
        field.appendChild(el("span", null, "Your email"));
        var input = attrs(el("input", "quiz-email-capture__input"), { type: "email", name: "email", required: "", autocomplete: "email", inputmode: "email" });
        field.appendChild(input);
        form.appendChild(field);
        var check = el("label", "quiz-email-capture__check");
        var adult = attrs(el("input"), { type: "checkbox", name: "adult", required: "" });
        check.appendChild(adult);
        check.appendChild(el("span", null, "I'm 18 or older."));
        form.appendChild(check);
        var trap = attrs(el("input", "quiz-email-capture__hp"), { type: "text", name: "website", tabindex: "-1", autocomplete: "off", "aria-hidden": "true" });
        form.appendChild(trap);
        var button = el("button", "conversion-button quiz-email-capture__button", "Email me my result");
        button.type = "submit";
        form.appendChild(button);
        section.appendChild(form);
        var fine = el("p", "quiz-email-capture__fine", "Your email and answers go to Brevo, my email service. Nothing else. Details in ");
        fine.appendChild(attrs(el("a", null, "Privacy"), { href: "/privacy/" }));
        fine.appendChild(document.createTextNode("."));
        section.appendChild(fine);
        var status = el("p", "quiz-email-capture__status");
        status.setAttribute("aria-live", "polite");
        section.appendChild(status);

        var sending = false;
        form.addEventListener("submit", function (event) {
            event.preventDefault();
            if (sending) {
                return;
            }
            var email = String(input.value || "").trim();
            // Native validation stops most bad submits first; this covers browsers without it.
            if (!email || !adult.checked) {
                status.textContent = "Add your email and tick the 18+ box.";
                return;
            }
            sending = true;
            button.disabled = true;
            status.textContent = "";
            function failWith(message) {
                sending = false;
                button.disabled = false;
                status.textContent = message;
            }
            postJson("/api/kiss-email", { email: email, answers: state.answers, adult: true, website: String(trap.value || "") }).then(function (result) {
                if (result.status !== 200 || result.data.ok !== true) {
                    // Only a refused address is the reader's to fix; anything else is on our side.
                    failWith(result.data.error === "bad_email"
                        ? "That address didn't work. Check it and try again."
                        : "That didn't send. Try again in a few minutes.");
                    return;
                }
                section.removeChild(form);
                status.textContent = "Check your inbox. Tap the confirm link and your result is on its way.";
                // The focused button just left with the form; keep keyboard focus here.
                focusHeading(status);
                sendEvent("email_capture", {
                    placement: "result-email",
                    archetype: state.summary.archetype.id,
                    score_band: state.summary.band
                });
            }, function () {
                failWith("Couldn't reach the server. Try again in a moment.");
            });
        });
        return section;
    }

    // The static free-chapter section (Brevo's hosted form) belongs to the paid view and the
    // status screens; the free result carries its own box above, so the page shows one.
    function showHostedEmail(visible) {
        var hosted = document.querySelector(".quiz-email");
        if (!hosted) {
            return;
        }
        if (visible) {
            hosted.removeAttribute("hidden");
        } else {
            hosted.setAttribute("hidden", "");
        }
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
        // Compact card, then the score and the unlock: the full-height art and the share button
        // used to fill the first screen and push the $ button to the third.
        var card = archetypeCard(state.summary.archetype, null, { compact: true });
        clear(root);
        if (state.emailConfirmed) {
            var confirmed = el("p", "quiz-notice", "You're in. Your result is on its way to your inbox.");
            confirmed.setAttribute("role", "status");
            root.appendChild(confirmed);
        }
        root.appendChild(card);
        var paywall = scoreCard(state);
        root.appendChild(paywall);
        var read = el("section", "quiz-read");
        read.appendChild(el("p", null, state.summary.archetype.read || ""));
        root.appendChild(read);
        var strengths = el("section", "quiz-strengths");
        root.appendChild(strengths);
        loadFreeTier(strengths, paywall.costliest, state);
        root.appendChild(lockedList(state, paywall.form));
        // Just back from the confirm link: already subscribed, so no second sign-up box.
        if (!state.emailConfirmed) {
            root.appendChild(emailCapture(state));
        }
        showHostedEmail(false);
        var share = el("section", "quiz-share-section");
        share.appendChild(el("h2", "quiz-section-title", "Tell someone. Or don't."));
        share.appendChild(shareActions(state.summary.archetype, null));
        root.appendChild(share);
        focusHeading(card.heading);
        sendEvent("result_view", { tier: "free", archetype: state.summary.archetype.id });
        if (!paywallViewed) {
            paywallViewed = true;
            sendEvent("paywall_view", {
                archetype: state.summary.archetype.id,
                score_band: state.summary.band,
                variant: PAYWALL_VARIANT,
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
            var share = el("section", "quiz-share-section");
            share.appendChild(el("h2", "quiz-section-title", "Tell someone. Or don't."));
            share.appendChild(shareActions(local.archetype, { score: local.score, bandLabel: local.band.label }));
            root.appendChild(share);
        }
        // A retry can turn a free render into this one; the free view hid the hosted form.
        showHostedEmail(true);
        var lede = document.querySelector("[data-email-lede]");
        if (lede) {
            lede.textContent = "Your report stays open on this device for 30 days. This sends the chapter its fixes build on.";
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

    // Brevo's confirm link lands as ?email=confirmed#a=<answers>, often in a browser that never
    // took the test, so the answers ride in the fragment, which never reaches the page request.
    // Valid answers are stored before the render; both markers then leave the address bar.
    function readEmailReturn(params) {
        var ks = engine();
        var hash = window.location.hash || "";
        var answers = hash.indexOf("#a=") === 0 ? hash.slice(3).toLowerCase() : "";
        var restored = Boolean(ks && answers && ks.isValidAnswers(answers));
        if (restored) {
            writeAnswers(answers.split(""));
        }
        var confirmed = params.get("email") === "confirmed";
        if (confirmed) {
            params.delete("email");
            sendEvent("email_confirmed", { placement: "result-email" });
        }
        if ((restored || confirmed) && window.history && typeof window.history.replaceState === "function") {
            var query = params.toString();
            window.history.replaceState(null, "", window.location.pathname + (query ? "?" + query : "") + (restored ? "" : hash));
        }
        return confirmed;
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
        var emailConfirmed = readEmailReturn(params);
        var sessionId = params.get("session_id") || "";
        var stored = readAnswers();
        var ks = engine();
        var state = {
            answers: isComplete(stored) ? stored.join("") : "",
            version: ks ? (ks.VERSION !== undefined ? ks.VERSION : (ks.DATA && ks.DATA.version)) : "",
            context: readContext() || { from: "", hook: "", placement: "", entry: "direct" },
            set: pronounSetFor(safeStorage(window.sessionStorage, "getItem", KEYS.pronoun) || ""),
            checkoutReturn: params.get("checkout") || "",
            emailConfirmed: emailConfirmed,
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
