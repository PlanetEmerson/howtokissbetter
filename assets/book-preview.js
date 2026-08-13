(function () {
    "use strict";

    var dialog = document.querySelector("[data-preview-viewer]");
    var previewLinks = Array.prototype.slice.call(document.querySelectorAll("[data-preview-item]"));
    if (!dialog || !previewLinks.length) {
        return;
    }

    var pages = previewLinks.map(function (link) {
        var image = link.querySelector("img");
        return {
            id: link.dataset.previewOpen,
            title: link.dataset.previewTitle,
            src: link.dataset.previewWebp || link.href,
            alt: image ? image.alt : link.dataset.previewTitle
        };
    });
    var imageNode = dialog.querySelector("[data-preview-image]");
    var captionNode = dialog.querySelector("[data-preview-caption]");
    var indexNode = dialog.querySelector("[data-preview-index]");
    var totalNode = dialog.querySelector("[data-preview-total]");
    var stage = dialog.querySelector("[data-preview-stage]");
    var closeButton = dialog.querySelector("[data-preview-close]");
    var currentIndex = 0;
    var lastFocused = null;
    var touchStartX = null;

    totalNode.textContent = String(pages.length);

    function pageIndex(previewId) {
        var found = pages.findIndex(function (page) {
            return page.id === previewId;
        });
        return found >= 0 ? found : 0;
    }

    function render(index, animate) {
        currentIndex = (index + pages.length) % pages.length;
        var page = pages[currentIndex];

        function updatePage() {
            imageNode.src = page.src;
            imageNode.alt = page.alt;
            captionNode.textContent = page.title;
            indexNode.textContent = String(currentIndex + 1);
        }

        if (!animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            updatePage();
            return;
        }

        stage.classList.add("is-turning");
        window.setTimeout(function () {
            updatePage();
            stage.classList.remove("is-turning");
        }, 120);
    }

    function open(previewId) {
        lastFocused = document.activeElement;
        render(pageIndex(previewId), false);
        if (typeof dialog.showModal === "function") {
            if (!dialog.open) {
                dialog.showModal();
            }
        } else {
            dialog.setAttribute("open", "");
            document.body.classList.add("preview-dialog-open");
        }
        closeButton.focus({ preventScroll: true });
    }

    function close() {
        if (typeof dialog.close === "function" && dialog.open) {
            dialog.close();
        } else {
            dialog.removeAttribute("open");
            document.body.classList.remove("preview-dialog-open");
            returnFocus();
        }
    }

    function returnFocus() {
        if (lastFocused && typeof lastFocused.focus === "function") {
            lastFocused.focus({ preventScroll: true });
        }
    }

    function next() {
        render(currentIndex + 1, true);
    }

    function previous() {
        render(currentIndex - 1, true);
    }

    dialog.querySelector("[data-preview-next]").addEventListener("click", next);
    dialog.querySelector("[data-preview-prev]").addEventListener("click", previous);
    closeButton.addEventListener("click", close);
    dialog.addEventListener("close", returnFocus);
    dialog.addEventListener("click", function (event) {
        if (event.target === dialog) {
            close();
        }
    });
    dialog.addEventListener("keydown", function (event) {
        if (event.key === "ArrowRight") {
            event.preventDefault();
            next();
        }
        if (event.key === "ArrowLeft") {
            event.preventDefault();
            previous();
        }
        if (event.key === "Escape") {
            event.preventDefault();
            close();
        }
    });
    stage.addEventListener("touchstart", function (event) {
        touchStartX = event.changedTouches[0].clientX;
    }, { passive: true });
    stage.addEventListener("touchend", function (event) {
        if (touchStartX === null) {
            return;
        }
        var distance = event.changedTouches[0].clientX - touchStartX;
        touchStartX = null;
        if (Math.abs(distance) < 48) {
            return;
        }
        if (distance < 0) {
            next();
        } else {
            previous();
        }
    }, { passive: true });

    window.KPNBookPreview = {
        open: open,
        close: close,
        next: next,
        previous: previous
    };
})();
