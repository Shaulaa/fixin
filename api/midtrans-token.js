// api/midtrans-token.js
// =====================================================================
// Serverless function (Vercel) - SATU-SATUNYA tempat Server Key boleh dipakai.
//
// Server Key diambil dari environment variable MIDTRANS_SERVER_KEY,
// yang di-set lewat Vercel Dashboard (Project Settings > Environment
// Variables) atau file .env.local untuk testing lokal - BUKAN ditulis
// langsung di kode ini, dan file .env.local JANGAN pernah di-commit/push
// ke Git (sudah ada di .gitignore).
//
// Alur:
//   1. Frontend (js/checkout.js) POST { orderId, grossAmount, customer }
//   2. Function ini panggil Midtrans Snap API pakai Server Key
//   3. Midtrans balikin Snap Token
//   4. Function balikin { snapToken } ke frontend
//   5. Frontend panggil snap.pay(snapToken) -> muncul popup Midtrans asli
// =====================================================================

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  var serverKey = process.env.MIDTRANS_SERVER_KEY;
  if (!serverKey) {
    // Env var belum di-set - beri pesan jelas, bukan error diam-diam.
    res.status(500).json({ error: "MIDTRANS_SERVER_KEY belum di-set di environment variables" });
    return;
  }

  var body = req.body || {};
  var orderId = body.orderId;
  var grossAmount = Number(body.grossAmount);
  var customer = body.customer || {};
  var returnUrl = body.returnUrl;

  if (!orderId || !grossAmount) {
    res.status(400).json({ error: "orderId dan grossAmount wajib diisi" });
    return;
  }

  if (!Number.isInteger(grossAmount) || grossAmount < 1 || grossAmount > 1000000000) {
    res.status(400).json({ error: "grossAmount tidak valid" });
    return;
  }

  // Midtrans mewajibkan order_id unik per percobaan transaksi. Tempel
  // timestamp supaya klik "Bayar" berkali-kali pada order FIXIN yang sama
  // tidak bentrok dengan transaksi sebelumnya di sisi Midtrans.
  var midtransOrderId = orderId + "-" + Date.now();
  var authHeader = "Basic " + Buffer.from(serverKey + ":").toString("base64");

  try {
    var midtransRes = await fetch("https://app.sandbox.midtrans.com/snap/v1/transactions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: authHeader
      },
      body: JSON.stringify({
        transaction_details: {
          order_id: midtransOrderId,
          gross_amount: grossAmount
        },
        customer_details: {
          first_name: customer.name || "Pelanggan FIXIN",
          phone: customer.phone || "",
          email: customer.email || "demo@fixin.test"
        },
        // Kalau frontend kirim returnUrl, pakai itu supaya tombol "Back to
        // Merchant" di halaman sukses Snap kembali ke website kita sendiri
        // (bukan default sandbox Midtrans / example.com).
        callbacks: returnUrl ? { finish: returnUrl } : undefined
      })
    });

    var data = await midtransRes.json();

    if (!midtransRes.ok) {
      res.status(midtransRes.status).json({ error: data.error_messages || "Gagal membuat Snap Token" });
      return;
    }

    res.status(200).json({ snapToken: data.token, midtransOrderId: midtransOrderId });
  } catch (err) {
    res.status(500).json({ error: "Server error: " + err.message });
  }
};

