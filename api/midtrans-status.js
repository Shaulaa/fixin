// Verify with the same sandbox used by midtrans-token; never trust redirect status.
module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { orderId, midtransOrderId, grossAmount } = req.body || {};
  if (typeof orderId !== "string" || typeof midtransOrderId !== "string" ||
      !/^[A-Za-z0-9_-]{1,100}$/.test(midtransOrderId) ||
      !midtransOrderId.startsWith(orderId + "-") || !orderId ||
      !Number.isInteger(grossAmount) || grossAmount < 1 || grossAmount > 1000000000) {
    return res.status(400).json({ error: "Data transaksi tidak valid" });
  }
  const key = process.env.MIDTRANS_SERVER_KEY;
  if (!key) return res.status(500).json({ error: "Konfigurasi pembayaran belum tersedia" });
  try {
    const response = await fetch("https://api.sandbox.midtrans.com/v2/" + encodeURIComponent(midtransOrderId) + "/status", {
      headers: { Accept: "application/json", Authorization: "Basic " + Buffer.from(key + ":").toString("base64") },
      signal: AbortSignal.timeout(10000)
    });
    const data = await response.json();
    if (!response.ok || data.status_code === "404") {
      return res.status(502).json({ error: "Status transaksi belum tersedia" });
    }
    if (data.order_id !== midtransOrderId || Number(data.gross_amount) !== grossAmount) {
      return res.status(409).json({ error: "Transaksi tidak cocok dengan pesanan" });
    }
    let paymentStatus = "Pending";
    if (["settlement", "capture"].includes(data.transaction_status) &&
        (!data.fraud_status || data.fraud_status === "accept")) paymentStatus = "Lunas";
    else if (["deny", "cancel", "expire", "failure"].includes(data.transaction_status) || data.fraud_status === "deny") paymentStatus = "Gagal";
    // Return only the status, never customer/card details from the provider.
    return res.status(200).json({ paymentStatus });
  } catch (_) {
    return res.status(502).json({ error: "Gagal memeriksa status pembayaran" });
  }
};
