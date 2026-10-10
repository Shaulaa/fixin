// booking.js - proses form booking (booking.html)
//
// Catatan: form booking cepat yang dulu ada di homepage (skema data lama:
// kode/status/dibuatPada) sudah dihapus dan diganti tombol ke sini, karena
// skema lamanya tidak kompatibel dengan dashboard/checkout/invoice/Midtrans.
// Semua booking sekarang lewat satu form ini saja.

document.addEventListener("DOMContentLoaded", function () {
  // Skema order baru mengikuti docs/02-DATA-AND-FILE-ARCHITECTURE.md
  // (productId, deliveryMethod, subtotal/deliveryFee/total, serviceStatus, dst)
  var fullForm = document.getElementById("bookingForm");
  if (!fullForm) return;

  // Biaya jemput demo. Nilai tetap untuk keperluan tugas, bukan tarif nyata.
  var PICKUP_FEE = 20000;

  var layananSelect = document.getElementById("layanan");
  var deliveryRadios = fullForm.querySelectorAll('input[name="deliveryMethod"]');
  var pickupAddressField = document.getElementById("pickupAddressField");
  var alamatJemputInput = document.getElementById("alamatJemput");
  var optionDropoff = document.getElementById("optionDropoff");
  var optionPickup = document.getElementById("optionPickup");

  var summaryLayanan = document.getElementById("summaryLayanan");
  var summarySubtotal = document.getElementById("summarySubtotal");
  var summaryOngkir = document.getElementById("summaryOngkir");
  var summaryTotal = document.getElementById("summaryTotal");

  // Isi pilihan layanan dari fixin_products yang aktif saja.
  // Cegah pemilihan tanggal di masa lalu.
  var inputTanggal = document.getElementById("tanggal");
  if (inputTanggal) {
    var today = new Date();
    var yyyy = today.getFullYear();
    var mm = String(today.getMonth() + 1).padStart(2, "0");
    var dd = String(today.getDate()).padStart(2, "0");
    inputTanggal.min = yyyy + "-" + mm + "-" + dd;
  }

  function isiPilihanLayanan() {
    if (!layananSelect) return;
    var produkAktif = getActiveProducts();

    produkAktif.forEach(function (p) {
      var opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.name + " - " + formatRupiah(p.price);
      layananSelect.appendChild(opt);
    });

    // Bug fix: link dari kartu katalog (index.html/services.html) mengirim
    // ?product=ID supaya layanan yang diklik langsung terpilih di sini,
    // tapi query string-nya sebelumnya tidak pernah dibaca sama sekali.
    var params = new URLSearchParams(window.location.search);
    var preselectId = params.get("product");
    if (preselectId) {
      layananSelect.value = preselectId;
      updateSummary();
    }
  }

  function getDeliveryMethod() {
    var checked = fullForm.querySelector('input[name="deliveryMethod"]:checked');
    return checked ? checked.value : "dropoff";
  }

  // Tampilkan/sembunyikan field alamat jemput sesuai metode yang dipilih.
  function updateDeliveryUI() {
    var metode = getDeliveryMethod();
    var isPickup = metode === "pickup";

    pickupAddressField.classList.toggle("hidden", !isPickup);
    if (alamatJemputInput) {
      alamatJemputInput.required = isPickup;
      if (!isPickup) alamatJemputInput.value = "";
    }

    if (optionDropoff) optionDropoff.classList.toggle("active", !isPickup);
    if (optionPickup) optionPickup.classList.toggle("active", isPickup);

    updateSummary();
  }

  // Perbarui ringkasan biaya berdasarkan layanan & metode yang dipilih.
  function updateSummary() {
    var produk = getProductById(layananSelect.value);
    var subtotal = produk ? Number(produk.price) : 0;
    var ongkir = getDeliveryMethod() === "pickup" ? PICKUP_FEE : 0;
    var total = subtotal + ongkir;

    summaryLayanan.textContent = produk ? produk.name : "Belum dipilih";
    summarySubtotal.textContent = formatRupiah(subtotal);
    summaryOngkir.textContent = formatRupiah(ongkir);
    summaryTotal.textContent = formatRupiah(total);

    if (produk && produk.category) {
      var perangkatSelect = document.getElementById("perangkat");
      if (perangkatSelect) {
        var punyaOpsi = false;
        for (var i = 0; i < perangkatSelect.options.length; i++) {
          if (perangkatSelect.options[i].value === produk.category) {
            punyaOpsi = true;
            break;
          }
        }
        perangkatSelect.value = punyaOpsi ? produk.category : "Lainnya";
      }
    }
  }

  isiPilihanLayanan();
  updateDeliveryUI();

  layananSelect.addEventListener("change", updateSummary);
  deliveryRadios.forEach(function (radio) {
    radio.addEventListener("change", updateDeliveryUI);
  });

  fullForm.addEventListener("submit", function (e) {
    e.preventDefault();

    var formData = new FormData(fullForm);
    var produk = getProductById(layananSelect.value);
    if (!produk) {
      layananSelect.focus();
      return;
    }

    var deliveryMethod = getDeliveryMethod();
    var isPickup = deliveryMethod === "pickup";
    var pickupAddress = isPickup ? (alamatJemputInput.value || "").trim() : "";

    if (isPickup && !pickupAddress) {
      alamatJemputInput.focus();
      return;
    }

    var subtotal = Number(produk.price);
    var deliveryFee = isPickup ? PICKUP_FEE : 0;
    var total = subtotal + deliveryFee;
    var now = new Date().toISOString();
    var session = getSession();

    var order = {
      id: generateId("ORD"),
      serviceCode: generateServiceCode(),
      userId: session ? session.userId : null,
      customerName: formData.get("nama"),
      customerEmail: formData.get("email"),
      phone: formData.get("hp"),
      productId: produk.id,
      serviceName: produk.name,
      deviceType: formData.get("perangkat"),
      complaint: formData.get("keluhan") || "",
      serviceDate: formData.get("tanggal"),
      deliveryMethod: deliveryMethod,
      pickupAddress: pickupAddress,
      subtotal: subtotal,
      deliveryFee: deliveryFee,
      total: total,
      serviceStatus: "Pending",
      paymentStatus: "Belum Dibayar",
      paymentType: null,
      createdAt: now,
      updatedAt: now,
      serviceHistory: [{ status: "Pending", at: now }]
    };

    var orders = getOrders();
    orders.push(order);
    setOrders(orders);

    window.location.href = "checkout.html?order=" + order.id;
  });
});




