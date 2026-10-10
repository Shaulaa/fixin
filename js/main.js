// main.js - dipakai di semua halaman

// Tombol "Kembali": kalau halaman sebelumnya (referrer) masih dalam satu
// situs dan ada riwayat browser, balik pakai history.back() supaya balik
// ke halaman yang benar-benar terakhir dibuka (mis. booking -> checkout
// -> kembali ke booking). Kalau halaman dibuka langsung (bookmark, tab
// baru, atau refresh) sehingga tidak ada riwayat yang relevan, redirect
// ke fallbackUrl supaya tombol kembali tetap selalu berfungsi.
function goBack(fallbackUrl) {
  try {
    var sameOrigin =
      document.referrer &&
      document.referrer.indexOf(window.location.origin) === 0;
    if (sameOrigin && window.history.length > 1) {
      window.history.back();
      return false;
    }
  } catch (e) {
    /* ignore, fallback ke redirect di bawah */
  }
  window.location.href = fallbackUrl;
  return false;
}

try {
  localStorage.removeItem("fixin_darkmode");
  document.documentElement.classList.remove("dark");
} catch (e) {}

document.addEventListener("DOMContentLoaded", function () {
  var toggle = document.querySelector(".nav-toggle");
  var links = document.querySelector(".nav-links");

  if (toggle && links) {
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Buka menu");

    toggle.addEventListener("click", function () {
      var isOpen = links.classList.toggle("open");
      toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
      toggle.setAttribute("aria-label", isOpen ? "Tutup menu" : "Buka menu");
    });

    links.addEventListener("click", function (event) {
      if (event.target.closest("a")) {
        links.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
        toggle.setAttribute("aria-label", "Buka menu");
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        links.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
        toggle.setAttribute("aria-label", "Buka menu");
      }
    });
  }

  // Menyesuaikan menu aktif dengan section yang sedang terlihat di beranda.
  var sectionLinks = Array.prototype.slice.call(
    document.querySelectorAll('.nav-links a[href^="#"]')
  );
  var sections = sectionLinks
    .map(function (link) {
      var href = link.getAttribute("href");
      return href && href.length > 1 ? document.querySelector(href) : null;
    })
    .filter(Boolean);

  if (sectionLinks.length && sections.length) {
    var setActiveLink = function (sectionId) {
      sectionLinks.forEach(function (link) {
        link.classList.toggle("active", link.getAttribute("href") === "#" + sectionId);
      });
    };

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) setActiveLink(entry.target.id);
      });
    }, { rootMargin: "-35% 0px -55% 0px", threshold: 0 });

    sections.forEach(function (section) { observer.observe(section); });
  }

  // ---- Testimoni Marquee: clone cards for seamless infinite loop ----
  var tracks = document.querySelectorAll(".testi-marquee__track");
  tracks.forEach(function (track) {
    // Clone all original cards and append them so animation loops seamlessly
    var cards = Array.prototype.slice.call(track.children);
    cards.forEach(function (card) {
      var clone = card.cloneNode(true);
      clone.setAttribute("aria-hidden", "true");
      track.appendChild(clone);
    });
  });

  var testimonialToggle = document.getElementById("testimoniToggle");
  var testimonialRows = document.getElementById("testimoniRows");
  if (testimonialToggle && testimonialRows) {
    testimonialToggle.hidden = false;
    testimonialToggle.addEventListener("click", function () {
      var paused = testimonialRows.classList.toggle("is-paused");
      testimonialToggle.setAttribute("aria-pressed", String(paused));
      testimonialToggle.textContent = paused ? "Lanjutkan animasi" : "Jeda animasi";
    });
  }
});

document.addEventListener("DOMContentLoaded", function () {
  var faqQuestions = document.querySelectorAll('.faq-question');
  faqQuestions.forEach(function(question) {
    question.addEventListener('click', function() {
      var item = this.parentElement;
      var isActive = item.classList.contains('active');
      
      // Close all other active items
      document.querySelectorAll('.faq-item.active').forEach(function(activeItem) {
        if (activeItem !== item) {
          activeItem.classList.remove('active');
          activeItem.querySelector('.faq-question').setAttribute('aria-expanded', 'false');
        }
      });
      
      // Toggle current item
      if (isActive) {
        item.classList.remove('active');
        this.setAttribute('aria-expanded', 'false');
      } else {
        item.classList.add('active');
        this.setAttribute('aria-expanded', 'true');
      }
    });
  });
});
