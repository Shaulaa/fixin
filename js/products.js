// products.js - satu sumber logic untuk fixin_products:
// 1) render katalog publik (index.html, services.html)
// 2) CRUD produk admin (admin-products.html)
// Butuh utils.js + storage.js, dan untuk halaman admin butuh auth.js juga.

// ---------- Ikon (dipakai ulang dari service-card yang sudah ada) ----------

var PRODUCT_ICONS = {
  HP: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>',
  Laptop: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>',
  Tablet: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="4" y1="18" x2="20" y2="18"/></svg>',
  default: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0-1.4 0l-6 6a1 1 0 0 0 0 1.4l3 3a1 1 0 0 0 1.4 0l6-6a1 1 0 0 0 0-1.4z"/><path d="M9 5 6 2M19 15l3 3M12 2v2M2 12h2M20 12h2M12 20v2"/></svg>'
};

var ARROW_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>';

function getProductIcon(category) {
  return PRODUCT_ICONS[category] || PRODUCT_ICONS.default;
}



// ---------- Data layer (dipakai admin & tahap booking nanti) ----------

function getActiveProducts() {
  return getProducts().filter(function (p) { return p.active; });
}

function getProductById(id) {
  var products = getProducts();
  for (var i = 0; i < products.length; i++) {
    if (products[i].id === id) return products[i];
  }
  return null;
}

function addProduct(data) {
  var products = getProducts();
  var exists = products.some(function (p) {
    return p.name.toLowerCase() === data.name.toLowerCase() && p.category.toLowerCase() === data.category.toLowerCase();
  });
  if (exists) throw new Error("Produk dengan nama & kategori yang sama sudah ada.");
  var newProduct = {
    id: generateId("PRD"),
    name: data.name,
    category: data.category,
    description: data.description,
    price: Number(data.price),
    estimatedTime: data.estimatedTime,
    active: data.active !== false
  };
  products.push(newProduct);
  setProducts(products);
  return newProduct;
}

function updateProductById(id, data) {
  var products = getProducts();
  for (var i = 0; i < products.length; i++) {
    if (products[i].id === id) {
      var dup = products.some(function (p, idx) {
        return idx !== i && p.name.toLowerCase() === data.name.toLowerCase() && p.category.toLowerCase() === data.category.toLowerCase();
      });
      if (dup) throw new Error("Produk dengan nama & kategori yang sama sudah ada.");
      products[i].name = data.name;
      products[i].category = data.category;
      products[i].description = data.description;
      products[i].price = Number(data.price);
      products[i].estimatedTime = data.estimatedTime;
      products[i].active = data.active;
      setProducts(products);
      return products[i];
    }
  }
  return null;
}

function deleteProductById(id) {
  var products = getProducts().filter(function (p) { return p.id !== id; });
  setProducts(products);
}

function toggleProductActiveById(id) {
  var products = getProducts();
  for (var i = 0; i < products.length; i++) {
    if (products[i].id === id) {
      products[i].active = !products[i].active;
      setProducts(products);
      return products[i];
    }
  }
  return null;
}

function validateProductForm(data) {
  var errors = [];
  if (!data.name.trim()) errors.push("Nama layanan wajib diisi.");
  if (!data.category.trim()) errors.push("Kategori wajib dipilih.");
  if (!data.description.trim()) errors.push("Deskripsi wajib diisi.");
  if (!data.estimatedTime.trim()) errors.push("Estimasi waktu wajib diisi.");
  if (data.price === "" || isNaN(data.price) || Number(data.price) <= 0) {
    errors.push("Harga harus berupa angka lebih dari 0.");
  }
  return errors;
}

// ---------- Render katalog publik ----------

function renderProductCatalog(containerId) {
  var container = document.getElementById(containerId);
  if (!container) return;

  var products = getActiveProducts();

  if (products.length === 0) {
    container.innerHTML = '<p style="color:var(--text-muted);">Belum ada layanan aktif saat ini. Silakan kembali lagi nanti.</p>';
    return;
  }

  container.innerHTML = products.map(function (p) {
    return (
      '<div class="service-card" data-product-id="' + p.id + '" style="cursor:pointer;">' +
        '<div class="diamond">' + getProductIcon(p.category) + '</div>' +
        '<span class="service-card-category">' + escapeHtml(p.category) + '</span>' +
        '<h3>' + escapeHtml(p.name) + '</h3>' +
        '<p>' + escapeHtml(p.description) + '</p>' +
        '<span class="price">Mulai ' + formatRupiah(p.price) + '</span>' +
        '<span class="service-card-eta">Estimasi ' + escapeHtml(p.estimatedTime) + '</span>' +
        '<a href="booking.html?product=' + encodeURIComponent(p.id) + '" class="arrow-btn" aria-label="Booking ' + escapeHtml(p.name) + '">' + ARROW_ICON + '</a>' +
      '</div>'
    );
  }).join("");

  container.addEventListener('click', function(e) {
    var card = e.target.closest('.service-card');
    if (!card) return;
    
    // Ignore if clicked on the booking link
    if (e.target.closest('.arrow-btn')) return;

    var productId = card.getAttribute('data-product-id');
    if (productId) openServiceDetail(productId);
  });
}

// ---------- Admin: tabel produk ----------

function renderAdminProductsTable() {
  var tbody = document.getElementById("productsTableBody");
  var emptyState = document.getElementById("productsEmptyState");
  if (!tbody) return;

  var products = getProducts();

  if (products.length === 0) {
    tbody.innerHTML = "";
    if (emptyState) emptyState.style.display = "block";
    return;
  }
  if (emptyState) emptyState.style.display = "none";

  tbody.innerHTML = products.map(function (p) {
    var statusBadge = p.active
      ? '<span class="status-badge status-active">Aktif</span>'
      : '<span class="status-badge status-inactive">Nonaktif</span>';

    return (
      '<tr>' +
        '<td>' + escapeHtml(p.name) + '</td>' +
        '<td>' + escapeHtml(p.category) + '</td>' +
        '<td>' + formatRupiah(p.price) + '</td>' +
        '<td>' + escapeHtml(p.estimatedTime) + '</td>' +
        '<td>' + statusBadge + '</td>' +
        '<td class="admin-table-actions">' +
          '<button type="button" class="btn-link" data-action="edit" data-id="' + p.id + '">Edit</button>' +
          '<button type="button" class="btn-link" data-action="toggle" data-id="' + p.id + '">' + (p.active ? "Nonaktifkan" : "Aktifkan") + '</button>' +
          '<button type="button" class="btn-link btn-link-danger" data-action="delete" data-id="' + p.id + '">Hapus</button>' +
        '</td>' +
      '</tr>'
    );
  }).join("");
}

// ---------- Admin: toast feedback ----------

var fixinToastTimer = null;

function showToast(message) {
  var toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(fixinToastTimer);
  fixinToastTimer = setTimeout(function () {
    toast.classList.remove("show");
  }, 2500);
}

// ---------- Admin: modal create/edit ----------

function openProductModal(product) {
  var backdrop = document.getElementById("productModalBackdrop");
  var title = document.getElementById("productModalTitle");
  var form = document.getElementById("productForm");
  var errorBox = document.getElementById("productFormError");

  if (errorBox) {
    errorBox.style.display = "none";
    errorBox.textContent = "";
  }

  if (product) {
    title.textContent = "Edit Produk";
    document.getElementById("productId").value = product.id;
    document.getElementById("productName").value = product.name;
    document.getElementById("productCategory").value = product.category;
    document.getElementById("productEstimatedTime").value = product.estimatedTime;
    document.getElementById("productDescription").value = product.description;
    document.getElementById("productPrice").value = product.price;
    document.getElementById("productActive").checked = product.active;
  } else {
    title.textContent = "Tambah Produk";
    form.reset();
    document.getElementById("productId").value = "";
    document.getElementById("productActive").checked = true;
  }

  backdrop.classList.add("show");
}

function closeProductModal() {
  var backdrop = document.getElementById("productModalBackdrop");
  if (backdrop) backdrop.classList.remove("show");
}

// ---------- Admin: modal konfirmasi hapus ----------

var pendingDeleteProductId = null;

function openDeleteProductModal(product) {
  pendingDeleteProductId = product.id;
  document.getElementById("deleteProductName").textContent = product.name;
  document.getElementById("deleteModalBackdrop").classList.add("show");
}

function closeDeleteProductModal() {
  pendingDeleteProductId = null;
  document.getElementById("deleteModalBackdrop").classList.remove("show");
}

// ---------- Init ----------

document.addEventListener("DOMContentLoaded", function () {
  // Katalog publik: jalan kalau elemen "catalogGrid" ada di halaman ini.
  renderProductCatalog("catalogGrid");

  // Halaman admin produk: jalan kalau wrapper "adminProductsPage" ada.
  var adminPage = document.getElementById("adminProductsPage");
  if (!adminPage) return;

  var session = requireRole("admin");
  if (!session) return; // sudah di-redirect oleh requireRole

  var welcome = document.getElementById("adminWelcome");
  if (welcome) welcome.textContent = session.name;

  renderAdminProductsTable();

  var openCreateBtn = document.getElementById("openCreateModal");
  if (openCreateBtn) {
    openCreateBtn.addEventListener("click", function () {
      openProductModal(null);
    });
  }

  var closeModalBtn = document.getElementById("closeProductModal");
  if (closeModalBtn) closeModalBtn.addEventListener("click", closeProductModal);

  var cancelFormBtn = document.getElementById("cancelProductForm");
  if (cancelFormBtn) cancelFormBtn.addEventListener("click", closeProductModal);

  var tbody = document.getElementById("productsTableBody");
  if (tbody) {
    tbody.addEventListener("click", function (e) {
      var btn = e.target.closest("button[data-action]");
      if (!btn) return;

      var id = btn.getAttribute("data-id");
      var product = getProductById(id);
      if (!product) return;

      var action = btn.getAttribute("data-action");
      if (action === "edit") {
        openProductModal(product);
      } else if (action === "delete") {
        openDeleteProductModal(product);
      } else if (action === "toggle") {
        toggleProductActiveById(id);
        renderAdminProductsTable();
        showToast("Status produk diperbarui.");
      }
    });
  }

  var productForm = document.getElementById("productForm");
  if (productForm) {
    productForm.addEventListener("submit", function (e) {
      e.preventDefault();

      var data = {
        name: document.getElementById("productName").value,
        category: document.getElementById("productCategory").value,
        description: document.getElementById("productDescription").value,
        estimatedTime: document.getElementById("productEstimatedTime").value,
        price: document.getElementById("productPrice").value,
        active: document.getElementById("productActive").checked
      };

      var errors = validateProductForm(data);
      var errorBox = document.getElementById("productFormError");

      if (errors.length > 0) {
        if (errorBox) {
          errorBox.textContent = errors.join(" ");
          errorBox.style.display = "block";
        }
        return;
      }

      var id = document.getElementById("productId").value;
      try {
        if (id) {
          updateProductById(id, data);
          showToast("Produk berhasil diperbarui.");
        } else {
          addProduct(data);
          showToast("Produk berhasil ditambahkan.");
        }
        closeProductModal();
        renderAdminProductsTable();
      } catch (err) {
        if (errorBox) {
          errorBox.textContent = err.message;
          errorBox.style.display = "block";
        }
      }
    });
  }

  var cancelDeleteBtn = document.getElementById("cancelDelete");
  if (cancelDeleteBtn) cancelDeleteBtn.addEventListener("click", closeDeleteProductModal);

  var confirmDeleteBtn = document.getElementById("confirmDelete");
  if (confirmDeleteBtn) {
    confirmDeleteBtn.addEventListener("click", function () {
      if (!pendingDeleteProductId) return;
      deleteProductById(pendingDeleteProductId);
      closeDeleteProductModal();
      renderAdminProductsTable();
      showToast("Produk berhasil dihapus.");
    });
  }
});




// ---------- Modal Service Detail ----------

var DETAIL_KERUSAKAN = {
  Laptop: [
    "Laptop lemot / performa menurun",
    "Tidak bisa menyala",
    "Overheating / panas berlebih",
    "Keyboard rusak / tidak responsif",
    "SSD atau HDD bermasalah",
    "Windows error / blue screen",
    "Layar retak atau bergaris",
    "Baterai tidak terisi"
  ],
  HP: [
    "Layar pecah / retak",
    "Baterai boros / cepat habis",
    "Charging bermasalah",
    "Bootloop / restart terus",
    "Speaker atau microphone bermasalah",
    "Kamera buram / tidak berfungsi",
    "Tombol power / volume rusak"
  ],
  Tablet: [
    "Layar retak atau tidak responsif",
    "Baterai kembung atau boros",
    "Charging port rusak",
    "Software error / hang",
    "Speaker tidak berfungsi"
  ]
};

function openServiceDetail(productId) {
  var product = getProductById(productId);
  if (!product) return;

  var kerusakan = DETAIL_KERUSAKAN[product.category] || DETAIL_KERUSAKAN.Laptop;
  var kerusakanHtml = kerusakan.map(function(k) {
    return '<li>' + escapeHtml(k) + '</li>';
  }).join('');

  // Create or reuse modal
  var modal = document.getElementById('serviceDetailModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'serviceDetailModal';
    modal.className = 'modal-backdrop';
    document.body.appendChild(modal);
  }

  modal.innerHTML =
    '<div class="modal-content service-detail-modal">' +
      '<button class="modal-close" aria-label="Tutup">&times;</button>' +
      '<div class="service-detail-header">' +
        '<div class="diamond">' + getProductIcon(product.category) + '</div>' +
        '<div>' +
          '<span class="service-card-category">' + escapeHtml(product.category) + '</span>' +
          '<h2>' + escapeHtml(product.name) + '</h2>' +
        '</div>' +
      '</div>' +
      '<div class="service-detail-body">' +
        '<div class="service-detail-info">' +
          '<p class="service-detail-desc">' + escapeHtml(product.description) + '</p>' +
          '<div class="service-detail-meta">' +
            '<div class="meta-item"><span class="meta-label">Estimasi Waktu</span><span class="meta-value">' + escapeHtml(product.estimatedTime) + '</span></div>' +
            '<div class="meta-item"><span class="meta-label">Kisaran Harga</span><span class="meta-value price">' + formatRupiah(product.price) + '</span></div>' +
            '<div class="meta-item"><span class="meta-label">Garansi</span><span class="meta-value">7 - 30 hari</span></div>' +
          '</div>' +
        '</div>' +
        '<div class="service-detail-issues">' +
          '<h4>Jenis kerusakan yang ditangani</h4>' +
          '<ul>' + kerusakanHtml + '</ul>' +
        '</div>' +
      '</div>' +
      '<div class="service-detail-footer">' +
        '<a href="booking.html?product=' + encodeURIComponent(product.id) + '" class="btn btn-teal btn-block">Booking Sekarang</a>' +
      '</div>' +
    '</div>';

  modal.classList.add('show');
  document.body.style.overflow = 'hidden';

  // Close handlers
  modal.querySelector('.modal-close').addEventListener('click', closeServiceDetail);
  modal.addEventListener('click', function(e) {
    if (e.target === modal) closeServiceDetail();
  });
  document.addEventListener('keydown', function handler(e) {
    if (e.key === 'Escape') {
      closeServiceDetail();
      document.removeEventListener('keydown', handler);
    }
  });
}

function closeServiceDetail() {
  var modal = document.getElementById('serviceDetailModal');
  if (modal) {
    modal.classList.remove('show');
    document.body.style.overflow = '';
  }
}
