// animations.js - animasi scroll dan interaksi (vanilla JS + IntersectionObserver)
//
// Tidak mengubah fungsi apa pun di main.js, auth.js, products.js, booking.js,
// atau tracking.js. File ini hanya menambah class/atribut animasi.
// Wajib dimuat PALING AKHIR di setiap halaman supaya katalog layanan yang
// dirender products.js sudah ada saat elemen-elemennya ditandai.
//
// Yang dikerjakan di sini
//   1. Navbar: class "is-scrolled" saat halaman digulir
//   2. Scroll reveal (fade up/left/right/scale) dengan stagger
//   3. Counter angka "10+ Tahun Pengalaman", jalan sekali saja
//   4. Memutar ulang animasi pesan error/hasil tracking kalau form dikirim lagi
//
// Hero dan page header dianimasikan murni lewat CSS (css/animations.css).

(function () {
  "use strict";

  var reduceMotion =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var hasIO = "IntersectionObserver" in window;

  function isMobile() {
    return window.innerWidth <= 680;
  }

  // Jumlah kolom grid saat ini, dipakai supaya stagger dihitung per baris
  // (kartu baris ke-2 tidak perlu menunggu lama).
  function gridCols() {
    var w = window.innerWidth;
    if (w > 960) return 3;
    if (w > 680) return 2;
    return 1;
  }

  function toArray(list) {
    return Array.prototype.slice.call(list);
  }

  // ---------------------------------------------------------------
  // 1. Navbar saat scroll
  // ---------------------------------------------------------------
  var navbar = null;
  var pending = []; // elemen reveal yang belum muncul
  var ticking = false;

  function onScroll() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(function () {
      ticking = false;
      var y = window.pageYOffset || document.documentElement.scrollTop || 0;

      // Baca dulu, tulis belakangan (hindari layout thrashing)
      var atBottom = false;
      if (pending.length) {
        atBottom =
          window.innerHeight + y >=
          document.documentElement.scrollHeight - 4;
      }

      if (navbar) navbar.classList.toggle("is-scrolled", y > 8);

      // Pengaman: kalau sudah mentok di bawah, tampilkan semua yang tersisa
      // supaya tidak ada elemen yang terjebak tersembunyi.
      if (atBottom) revealAll();
    });
  }

  // ---------------------------------------------------------------
  // 2. Scroll reveal
  // ---------------------------------------------------------------
  var io = null;

  function cleanup(el) {
    // Setelah animasi selesai, lepas atribut reveal supaya style bawaan
    // (termasuk efek hover card) berlaku normal lagi tanpa bentrok.
    el.removeAttribute("data-anim");
    el.classList.remove("is-in");
    el.style.removeProperty("--anim-delay");
  }

  function reveal(el) {
    if (el.classList.contains("is-in")) return;
    el.classList.add("is-in");
    if (io) io.unobserve(el);

    var idx = pending.indexOf(el);
    if (idx !== -1) pending.splice(idx, 1);

    var delay = parseInt(el.style.getPropertyValue("--anim-delay"), 10) || 0;
    window.setTimeout(function () {
      cleanup(el);
    }, delay + 900);
  }

  function revealAll() {
    pending.slice().forEach(reveal);
  }

  function mark(el, type, delay) {
    if (!el || el.__fxSeen) return;
    el.__fxSeen = true;

    // Di HP gerakan horizontal diganti vertikal supaya tidak ada
    // risiko scroll samping dan terasa lebih halus.
    if (isMobile() && (type === "left" || type === "right")) type = "up";

    el.setAttribute("data-anim", type);
    el.style.setProperty("--anim-delay", (delay || 0) + "ms");
    pending.push(el);
    io.observe(el);
  }

  // Beri stagger ke sekumpulan elemen
  function stagger(list, type, base, step) {
    toArray(list).forEach(function (el, i) {
      mark(el, type, base + i * step);
    });
  }

  // Card di dalam grid: delay dihitung per kolom supaya stagger rapi
  function staggerGrid(list, base) {
    var cols = gridCols();
    toArray(list).forEach(function (el, i) {
      var delay = cols === 1 ? base : base + (i % cols) * 90;
      mark(el, "card", delay);
    });
  }

  function markCatalog() {
    var grid = document.getElementById("catalogGrid");
    if (!grid) return;
    var kids = toArray(grid.children).filter(function (el) {
      return !el.__fxSeen;
    });
    var cards = kids.filter(function (el) {
      return el.classList.contains("service-card");
    });
    staggerGrid(cards, 80);
    kids.forEach(function (el) {
      if (!el.classList.contains("service-card")) mark(el, "up", 0);
    });
  }

  function setupReveal() {
    if (!hasIO) return;

    io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          // Elemen yang sudah ada di atas viewport (misal halaman dibuka
          // langsung ke #tentang) langsung ditampilkan tanpa menunggu.
          if (entry.isIntersecting || entry.boundingClientRect.top < 0) {
            reveal(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" }
    );

    // Heading section: eyebrow, judul, lalu subjudul dengan delay kecil
    toArray(document.querySelectorAll(".section-head-row > div")).forEach(
      function (box) {
        stagger(box.children, "up", 0, 70);
      }
    );

    // Konten Tentang
    toArray(document.querySelectorAll(".about-grid")).forEach(function (grid) {
      mark(grid.querySelector(".about-visual"), "left", 0);

      var text = grid.querySelector(".about-text");
      if (text) {
        stagger(
          text.querySelectorAll(":scope > .eyebrow, :scope > .section-heading, :scope > .section-desc"),
          "up",
          80,
          70
        );
        stagger(text.querySelectorAll(".about-point"), "right", 260, 90);
      }
    });

    // Card keunggulan
    toArray(document.querySelectorAll(".feature-grid")).forEach(function (grid) {
      staggerGrid(grid.querySelectorAll(":scope > .feature-card"), 100);
    });

    // Card layanan (dirender dinamis oleh products.js)
    markCatalog();
    var catalog = document.getElementById("catalogGrid");
    if (catalog && "MutationObserver" in window) {
      new MutationObserver(markCatalog).observe(catalog, { childList: true });
    }

    // FAQ items
    toArray(document.querySelectorAll(".faq-list")).forEach(function (list) {
      stagger(list.querySelectorAll(".faq-item"), "up", 0, 60);
    });

    // Estimasi harga cards
    toArray(document.querySelectorAll(".price-grid")).forEach(function (grid) {
      staggerGrid(grid.querySelectorAll(":scope > .price-estimate-card"), 80);
    });

    // Banner CTA
    toArray(document.querySelectorAll(".section-cta .container")).forEach(
      function (box) {
        stagger(box.children, "up", 0, 80);
      }
    );

    // Kartu form (booking, lacak servis, login)
    toArray(document.querySelectorAll(".form-card")).forEach(function (card) {
      mark(card, "up", 120);
    });

    // Footer
    toArray(document.querySelectorAll(".footer-grid")).forEach(function (grid) {
      stagger(grid.children, "up", 0, 70);
    });
  }

  // ---------------------------------------------------------------
  // 3. Counter (sekali saja saat pertama kali terlihat)
  // ---------------------------------------------------------------
  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function runCounter(el, target, suffix) {
    var duration = 1100;
    var start = null;

    function frame(ts) {
      if (start === null) start = ts;
      var p = Math.min((ts - start) / duration, 1);
      el.textContent = Math.round(target * easeOutCubic(p)) + suffix;
      if (p < 1) {
        window.requestAnimationFrame(frame);
      } else {
        el.textContent = target + suffix;
      }
    }
    window.requestAnimationFrame(frame);
  }

  function setupCounters() {
    if (reduceMotion || !hasIO) return;

    var counters = [];
    toArray(
      document.querySelectorAll(".badge-years strong, [data-count]")
    ).forEach(function (el) {
      var m = el.textContent.trim().match(/^(\d+)(\D*)$/);
      if (!m) return;
      var item = { el: el, target: parseInt(m[1], 10), suffix: m[2] };
      el.textContent = "0" + item.suffix;
      counters.push(item);
    });
    if (!counters.length) return;

    var counterIO = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          counterIO.unobserve(entry.target);
          var item = counters.filter(function (c) {
            return c.el === entry.target;
          })[0];
          if (item) {
            window.setTimeout(function () {
              runCounter(item.el, item.target, item.suffix);
            }, 250);
          }
        });
      },
      { threshold: 0.6 }
    );

    counters.forEach(function (c) {
      counterIO.observe(c.el);
    });

    // Pengaman: kalau observer tidak sempat jalan, angka tetap benar
    window.addEventListener("load", function () {
      window.setTimeout(function () {
        counters.forEach(function (c) {
          if (c.el.textContent === "0" + c.suffix && c.el.getBoundingClientRect().top < 0) {
            c.el.textContent = c.target + c.suffix;
          }
        });
      }, 1500);
    });
  }

  // ---------------------------------------------------------------
  // 4. Putar ulang animasi pesan saat form dikirim lagi
  // ---------------------------------------------------------------
  function replay(el) {
    if (!el || el.offsetParent === null) return; // hanya kalau sedang tampil
    el.style.animation = "none";
    void el.offsetWidth; // paksa browser memulai ulang animasi
    el.style.animation = "";
  }

  function setupMessageReplay() {
    if (reduceMotion) return;

    var trackingForm = document.getElementById("trackingForm");
    if (trackingForm) {
      trackingForm.addEventListener("submit", function () {
        // setTimeout 0 supaya jalan SETELAH handler di tracking.js selesai
        window.setTimeout(function () {
          replay(document.getElementById("trackingResult"));
          replay(document.getElementById("trackingNotFound"));
        }, 0);
      });
    }

    var loginForm = document.getElementById("loginForm");
    if (loginForm) {
      loginForm.addEventListener("submit", function () {
        window.setTimeout(function () {
          replay(document.getElementById("loginError"));
        }, 0);
      });
    }
  }

  // ---------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------
  function init() {
    navbar = document.querySelector(".navbar");

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    onScroll();

    if (reduceMotion) return;

    setupReveal();
    setupCounters();
    setupMessageReplay();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
