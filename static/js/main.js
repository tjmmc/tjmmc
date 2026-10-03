document.addEventListener("DOMContentLoaded", function () {
    // Mobile menu
    var toggle = document.getElementById("js-navbar-toggle");
    var links = document.getElementById("js-navlinks");
    if (toggle && links) {
        toggle.addEventListener("click", function () {
            var open = links.classList.toggle("open");
            toggle.setAttribute("aria-expanded", open ? "true" : "false");
        });
        links.addEventListener("click", function (e) {
            if (e.target.tagName === "A") {
                links.classList.remove("open");
                toggle.setAttribute("aria-expanded", "false");
            }
        });
    }

    // Videos: show a thumbnail, and only load YouTube's player when someone clicks.
    document.querySelectorAll("a[data-yt]").forEach(function (a) {
        a.addEventListener("click", function (e) {
            if (e.metaKey || e.ctrlKey || e.shiftKey) return; // let new-tab clicks through
            e.preventDefault();
            var iframe = document.createElement("iframe");
            iframe.src = "https://www.youtube-nocookie.com/embed/" + a.dataset.yt + "?autoplay=1&rel=0";
            iframe.title = a.getAttribute("aria-label") || "YouTube video";
            iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
            iframe.allowFullscreen = true;
            var frame = document.createElement("div");
            frame.className = "Video-frame";
            frame.appendChild(iframe);
            a.replaceWith(frame);
        });
    });

    // Dates: the site only rebuilds when someone pushes, so hide events that have passed since.
    var today = new Date();
    var iso = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0");
    document.querySelectorAll(".Event[data-date]").forEach(function (li) {
        if (li.dataset.date < iso) li.hidden = true;
    });
});
