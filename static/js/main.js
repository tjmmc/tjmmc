document.addEventListener("DOMContentLoaded", function () {
    var toggle = document.getElementById("js-navbar-toggle");
    var links = document.getElementById("js-navlinks");
    if (toggle && links) {
        toggle.addEventListener("click", function () {
            links.classList.toggle("open");
        });
    }
});
