document.addEventListener("DOMContentLoaded", function () {
    var toggle = document.getElementById("js-navbar-toggle");
    var links = document.getElementById("js-navlinks");
    if (toggle && links) {
        toggle.addEventListener("click", function () {
            links.classList.toggle("open");
        });
    }
});

<script>
(function () {
    const track = document.getElementById('carouselTrack');
    const dotsContainer = document.getElementById('carouselDots');
    if (!track || !dotsContainer) return;

    const slides = Array.from(track.children);
    const dots = Array.from(dotsContainer.children);
    let currentIndex = 0;
    let autoplayTimer;

    function goToSlide(index) {
        currentIndex = (index + slides.length) % slides.length;
        track.style.transform = `translateX(-${currentIndex * 100}%)`;
        dots.forEach((dot, i) => {
            dot.classList.toggle('is-active', i === currentIndex);
        });
    }

    dots.forEach((dot) => {
        dot.addEventListener('click', () => {
            goToSlide(parseInt(dot.dataset.index, 10));
            resetAutoplay();
        });
    });

    function startAutoplay() {
        autoplayTimer = setInterval(() => {
            goToSlide(currentIndex + 1);
        }, 4000);
    }

    function resetAutoplay() {
        clearInterval(autoplayTimer);
        startAutoplay();
    }

    goToSlide(0);
    startAutoplay();
})();
</script>
