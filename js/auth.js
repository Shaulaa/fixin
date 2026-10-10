// auth.js - login, logout, dan guard role.
// Butuh js/storage.js (getUsers, getSession, setSession, clearSession)
// dan js/utils.js sudah ter-load lebih dulu.

/**
 * Cari user yang cocok email + password di fixin_users.
 * Return objek user kalau ketemu, null kalau tidak.
 */
function findUserByEmail(email) {
  var users = getUsers();
  for (var i = 0; i < users.length; i++) {
    var u = users[i];
    if (String(u.email).toLowerCase() === String(email).toLowerCase()) {
      return u;
    }
  }
  return null;
}

/**
 * Proses login. Kalau kredensial valid, simpan session ke fixin_session
 * dan return objek session. Kalau tidak valid, return null.
 */
function login(email, password) {
  var user = findUserByEmail(email);
  if (!user) return Promise.resolve(null);
  return checkPassword(password, user.password).then(function (ok) {
    if (!ok) return null;
    var session = {
      userId: user.id,
      name: user.name,
      role: user.role,
      loginAt: new Date().toISOString()
    };
    setSession(session);
    return session;
  });
}

/**
 * Hapus session lalu kembalikan ke halaman utama.
 * Minta konfirmasi dulu supaya tidak ke-klik gak sengaja.
 */
function logout() {
  if (!window.confirm("Yakin mau keluar dari akun ini?")) return;
  clearSession();
  window.location.href = "index.html";
}

/**
 * Redirect sesuai role setelah login berhasil.
 */
function redirectByRole(role) {
  if (role === "admin") {
    window.location.href = "admin-dashboard.html";
  } else {
    window.location.href = "index.html";
  }
}

/**
 * Guard: halaman butuh login apapun rolenya.
 * Kalau belum login, lempar ke login.html.
 * Return session kalau valid, null kalau tidak (dan sudah redirect).
 */
function requireAuth() {
  var session = getSession();
  if (!session) {
    // Bawa halaman asal lewat query "redirect", supaya setelah login
    // sukses, user langsung balik ke halaman yang tadi mau dibuka
    // (misalnya booking.html), bukan selalu ke dashboard.
    var tujuan = window.location.pathname.split("/").pop() + window.location.search;
    window.location.href = "login.html?redirect=" + encodeURIComponent(tujuan);
    return null;
  }
  return session;
}

/**
 * Guard: halaman butuh login DENGAN role tertentu ("user" atau "admin").
 * Belum login -> login.html. Login tapi role tidak cocok -> index.html.
 */
function requireRole(role) {
  var session = requireAuth();
  if (!session) return null;

  if (session.role !== role) {
    window.location.href = "index.html";
    return null;
  }
  return session;
}

/**
 * Escape teks yang dimasukkan ke innerHTML (nama user), biar aman dari HTML injection.
 */
function escapeHtmlNav(value) { return typeof escapeHtml === "function" ? escapeHtml(value) : value; }

/**
 * Isi area #navAuthArea di navbar (kalau ada di halaman ini) sesuai status login:
 * - Belum login  -> tombol "Masuk" ke login.html.
 * - Login user    -> nama + tombol "Riwayat Pesanan" + "Keluar".
 * - Login admin   -> nama + tombol "Dashboard Admin" + "Keluar".
 * Dipanggil di semua halaman publik supaya navbar konsisten dan alur
 * login/logout/ke-dashboard tidak lagi tersembunyi di balik booking.html.
 */
function renderNavAuth() {
  var area = document.getElementById("navAuthArea");
  var navLinks = document.querySelector(".nav-links");

  // Bersihkan link dashboard/riwayat lama di nav-links dulu (jaga-jaga
  // kalau renderNavAuth() sempat dipanggil lebih dari sekali).
  if (navLinks) {
    var linkLama = navLinks.querySelector("[data-nav-riwayat]");
    if (linkLama) linkLama.remove();
  }

  if (!area) return;

  var session = getSession();

  if (!session) {
    area.innerHTML = '<a href="login.html" class="btn btn-outline-dark nav-auth-btn">Masuk</a>';
    return;
  }

  var dashboardHref = session.role === "admin" ? "admin-dashboard.html" : "user-dashboard.html";
  var dashboardLabel = session.role === "admin" ? "Dashboard Admin" : "Riwayat Pesanan";

  // Link Riwayat Pesanan/Dashboard Admin masuk ke menu nav-links (bukan
  // di area auth sebelah tombol Keluar), biar posisinya konsisten sama
  // menu lain (Beranda, Layanan, Booking, dst).
  if (navLinks) {
    var linkDashboard = document.createElement("a");
    linkDashboard.href = dashboardHref;
    linkDashboard.textContent = dashboardLabel;
    linkDashboard.setAttribute("data-nav-riwayat", "1");
    navLinks.appendChild(linkDashboard);
  }

  area.innerHTML =
    '<span class="nav-auth-name">Halo, ' + escapeHtmlNav(session.name) + '</span>' +
    '<a href="#" class="btn btn-navy nav-auth-btn" id="navLogoutBtn">Keluar</a>';

  var navLogoutBtn = document.getElementById("navLogoutBtn");
  if (navLogoutBtn) {
    navLogoutBtn.addEventListener("click", function (e) {
      e.preventDefault();
      logout();
    });
  }
}

function syncMobileLogout() {
  var navLinks = document.querySelector(".nav-links");
  var logoutBtn = document.getElementById("logoutBtn") || document.getElementById("navLogoutBtn");

  if (!navLinks || !logoutBtn) return;

  var placeholder = document.querySelector(".nav-logout-placeholder");
  if (!placeholder) {
    placeholder = document.createElement("span");
    placeholder.className = "nav-logout-placeholder";
    logoutBtn.parentNode.insertBefore(placeholder, logoutBtn);
  }

  logoutBtn.classList.add("nav-mobile-logout");
  if (window.matchMedia("(max-width: 680px)").matches) {
    navLinks.appendChild(logoutBtn);
  } else {
    placeholder.parentNode.insertBefore(logoutBtn, placeholder.nextSibling);
  }
}

// ---------- Wiring form login.html + navbar semua halaman ----------

document.addEventListener("DOMContentLoaded", function () {
  renderNavAuth();
  syncMobileLogout();
  window.addEventListener("resize", syncMobileLogout);

  // Kalau sudah login dan buka lagi login.html, langsung arahkan ke dashboard.
  var existingSession = getSession();
  var loginForm = document.getElementById("loginForm");

  // Kalau requireAuth() yang melempar ke sini, ada query "redirect" berisi
  // halaman tujuan awal (misalnya booking.html). Kalau tidak ada, fallback
  // ke redirectByRole() seperti biasa (login manual lewat navbar).
  var redirectParam = new URLSearchParams(window.location.search).get("redirect");

  if (existingSession && loginForm) {
    if (redirectParam) window.location.href = redirectParam;
    else redirectByRole(existingSession.role);
    return;
  }

  if (loginForm) {
    var errorBox = document.getElementById("loginError");
    var submitBtn = loginForm.querySelector("button[type='submit']");

    loginForm.addEventListener("submit", function (e) {
      e.preventDefault();
      if (errorBox) errorBox.style.display = "none";
      if (submitBtn) submitBtn.disabled = true;

      var email = loginForm.email.value.trim();
      var password = loginForm.password.value;
      login(email, password).then(function (session) {
        if (!session) {
          if (errorBox) errorBox.style.display = "block";
          if (submitBtn) submitBtn.disabled = false;
          return;
        }
        if (redirectParam) window.location.href = redirectParam;
        else redirectByRole(session.role);
      });
    });
  }

  // Tombol show/hide password.
  var toggleBtn = document.getElementById("togglePassword");
  var passwordInput = document.getElementById("password");

  if (toggleBtn && passwordInput) {
    toggleBtn.addEventListener("click", function () {
      var isHidden = passwordInput.type === "password";
      passwordInput.type = isHidden ? "text" : "password";
      toggleBtn.textContent = isHidden ? "Sembunyikan" : "Tampilkan";
      toggleBtn.setAttribute("aria-label", isHidden ? "Sembunyikan password" : "Tampilkan password");
    });
  }

  // Tombol logout, dipasang di halaman manapun yang punya id="logoutBtn".
  var logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", function (e) {
      e.preventDefault();
      logout();
    });
  }
});


