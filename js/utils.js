// utils.js - helper umum: format tampilan & generator kode/id
// Dipakai di seluruh halaman FIXIN (public, user, admin).

/**
 * Format angka jadi Rupiah, contoh: 150000 -> "Rp 150.000"
 */
function formatRupiah(angka) {
  var n = Number(angka) || 0;
  var bagian = Math.round(Math.abs(n)).toString();
  var hasil = "";
  var sisa = bagian.length % 3;

  if (sisa > 0) {
    hasil += bagian.substring(0, sisa);
  }
  for (var i = sisa; i < bagian.length; i += 3) {
    hasil += (hasil ? "." : "") + bagian.substring(i, i + 3);
  }

  return (n < 0 ? "-Rp " : "Rp ") + hasil;
}

/**
 * Format tanggal ke format Indonesia, contoh: "16 September 2026"
 * Menerima Date, string ISO ("2026-09-16T..."), atau string "YYYY-MM-DD".
 */
function formatDateIndonesia(input) {
  var namaBulan = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
  ];

  var tanggal;
  if (input instanceof Date) {
    tanggal = input;
  } else if (typeof input === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input)) {
    // "YYYY-MM-DD" dari <input type="date"> diparse manual biar tidak geser timezone
    var bagian = input.split("-");
    tanggal = new Date(Number(bagian[0]), Number(bagian[1]) - 1, Number(bagian[2]));
  } else {
    tanggal = new Date(input);
  }

  if (isNaN(tanggal.getTime())) return "-";

  return tanggal.getDate() + " " + namaBulan[tanggal.getMonth()] + " " + tanggal.getFullYear();
}

/**
 * Generator ID umum, contoh: generateId("ORD") -> "ORD-20260916-482"
 * Dipakai untuk id user, produk, order, dsb.
 */
function generateId(prefix) {
  var now = new Date();
  var yyyy = now.getFullYear();
  var mm = String(now.getMonth() + 1).padStart(2, "0");
  var dd = String(now.getDate()).padStart(2, "0");
  var acak = String(Math.floor(Math.random() * 900) + 100); // 100-999

  return (prefix || "ID") + "-" + yyyy + mm + dd + "-" + acak;
}

/**
 * Generator kode servis khusus, format lama tetap dipertahankan: "FX-1234"
 * supaya kompatibel dengan booking.js & tracking.js yang sudah ada.
 */
function generateServiceCode() {
  var now = new Date();
  var mm = String(now.getMonth() + 1).padStart(2, "0");
  var dd = String(now.getDate()).padStart(2, "0");
  var acak = String(Math.floor(Math.random() * 9000) + 1000);
  return "FX-" + mm + dd + "-" + acak;
}

function hashPassword(plaintext) {
  var encoded = new TextEncoder().encode(String(plaintext));
  return crypto.subtle.digest("SHA-256", encoded).then(function (buf) {
    return Array.prototype.map.call(new Uint8Array(buf), function (b) {
      return ("00" + b.toString(16)).slice(-2);
    }).join("");
  });
}

function checkPassword(plaintext, hash) {
  return hashPassword(plaintext).then(function (h) { return h === hash; });
}


/**
 * Escape HTML untuk mencegah XSS.
 */
function escapeHtml(value) {
  return String(value === null || value === undefined ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
