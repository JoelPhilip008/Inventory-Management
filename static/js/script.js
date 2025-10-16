// js/script.js

// --- ======================================================= ---
// ---                 GLOBAL CONSTANTS & VARS                 ---
// --- ======================================================= ---
const headers = Array.from(document.querySelectorAll('#inv-table thead th')).map(th => th.dataset.headerName || th.innerText.trim());
const unitsColIndex = headers.findIndex(h => h.toLowerCase().includes('existing units'));
const remarksColIndex = headers.findIndex(h => h.toLowerCase().includes('remarks'));
const sectionColIndex = headers.findIndex(h => h.toLowerCase().includes('section'));
const itemNoColIndex = headers.findIndex(h => h.toLowerCase().includes('item no'));

let advancedVisible = false;
let selectedItemNo = null;
let transactionType = null;

// --- ======================================================= ---
// ---            ADMIN-ONLY FUNCTIONS (index.html)            ---
// --- ======================================================= ---

function adjust(e, itemNo, delta) {
  e.preventDefault();
  const tr = document.querySelector(`tr[data-item-no="${itemNo}"]`);
  if (!tr) return;
  const unitsCell = tr.cells[unitsColIndex];
  if (!unitsCell) return;
  let cur = parseFloat(unitsCell.innerText) || 0;
  let next = cur + delta;
  if (next < 0) next = 0;
  fetch('/update', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({item_no: itemNo, col_name: 'Existing Units', new_value: next})
  }).then(r => r.json()).then(j => {
    if (j.ok) {
      unitsCell.innerText = next;
      if (remarksColIndex > -1 && tr.cells[remarksColIndex]) {
        tr.cells[remarksColIndex].innerText = next <= 0 ? 'Out of Stock' : (next <= 5 ? 'Low Stock' : 'In Stock');
      }
      tr.classList.remove('row-update-success', 'row-update-decrease');
      tr.classList.add(delta > 0 ? 'row-update-success' : 'row-update-decrease');
      setTimeout(() => tr.classList.remove('row-update-success','row-update-decrease'), 1000);
    } else {
      alert('Update failed: ' + (j.error || JSON.stringify(j)));
    }
  }).catch(err => alert('Error: ' + err));
}

function deleteItem(e, itemNo) {
  e.preventDefault();
  if (!confirm('Are you sure you want to delete this item? This action cannot be undone.')) return;
  fetch('/delete', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({item_no: itemNo})
  }).then(r => r.json()).then(j => {
    if (j.ok) {
      const tr = document.querySelector(`tr[data-item-no="${itemNo}"]`);
      if (tr) {
        tr.style.opacity = 0;
        setTimeout(() => location.reload(), 500);
      } else {
        location.reload();
      }
    } else {
      alert('Deletion failed: ' + (j.error || JSON.stringify(j)));
    }
  }).catch(err => alert('Error: ' + err));
}

// --- ======================================================= ---
// ---       TRANSACTION FUNCTIONS (transaction.html)        ---
// --- ======================================================= ---

function openTransactionModal(type, itemNo) {
  selectedItemNo = itemNo;
  transactionType = type;
  
  const tr = document.querySelector(`tr[data-item-no="${itemNo}"]`);
  if (!tr) return;

  // Since transaction.html has a fixed header, we can rely on indices.
  const componentName = tr.cells[2].innerText;
  const currentStock = parseInt(tr.cells[5].innerText, 10);
  
  const modalEl = document.getElementById("transactionModal");
  if (!modalEl) return;
  
  // Get all the elements inside the modal we need to update
  const title = modalEl.querySelector('.modal-title');
  const quantityLabel = modalEl.querySelector('#modalQuantityLabel');
  const confirmButton = modalEl.querySelector('#confirmButton');
  const header = modalEl.querySelector('.modal-header');
  const quantityInput = document.getElementById("transactionQuantity");
  const modalInfo = document.getElementById('modalItemInfo');

  modalInfo.innerHTML = `
    <strong>Item:</strong> ${componentName}<br>
    <strong>Current Stock:</strong> <span class="fw-bold fs-5 text-dark">${currentStock}</span>
  `;
  
  quantityInput.value = 1;

  if (type === 'retrieve') {
    title.innerText = 'Retrieve Item';
    if(quantityLabel) quantityLabel.innerText = 'Quantity to Retrieve:';
    confirmButton.className = 'btn btn-success fw-bold';
    confirmButton.innerText = 'Confirm Retrieval';
    header.className = 'modal-header bg-success text-white';
    quantityInput.max = currentStock;
  } else { // type === 'return'
    title.innerText = 'Return Item';
    if(quantityLabel) quantityLabel.innerText = 'Quantity to Return:';
    confirmButton.className = 'btn btn-info fw-bold text-white';
    confirmButton.innerText = 'Confirm Return';
    header.className = 'modal-header bg-info text-white';
    quantityInput.removeAttribute('max');
  }
  
  // ✅ THIS IS THE FIX: Create and show the modal instance here.
  const modal = new bootstrap.Modal(modalEl);
  modal.show();
}

function changeQuantity(delta) {
  const input = document.getElementById("transactionQuantity");
  if (!input) return;
  let value = parseInt(input.value) || 0;
  let newValue = Math.max(1, value + delta);
  
  if (transactionType === 'retrieve') {
    let max = parseInt(input.max) || Infinity;
    if(newValue > max) newValue = max;
  }
  
  input.value = newValue;
}

function confirmTransaction() {
  const quantityInput = document.getElementById("transactionQuantity");
  if (!selectedItemNo || !quantityInput || !transactionType) return;

  const quantity = parseInt(quantityInput.value);
  if (isNaN(quantity) || quantity <= 0) {
    alert("Please enter a valid quantity.");
    return;
  }
  
  if (transactionType === 'retrieve' && quantity > parseInt(quantityInput.max)) {
    alert("Cannot retrieve more than the available stock.");
    return;
  }

  const endpoint = transactionType === 'retrieve' ? `/retrieve/${selectedItemNo}` : `/return_item/${selectedItemNo}`;
  const confirmButton = document.getElementById('confirmButton');
  confirmButton.disabled = true;
  confirmButton.innerText = 'Processing...';

  fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ quantity: quantity }),
  })
    .then(response => response.json())
    .then(data => {
      alert(data.message || data.error);
      if (data.success) {
        location.reload();
      } else {
        confirmButton.disabled = false;
        confirmButton.innerText = transactionType === 'retrieve' ? 'Confirm Retrieval' : 'Confirm Return';
      }
    })
    .catch(err => {
      console.error("Transaction error:", err);
      alert("An error occurred during the transaction.");
      confirmButton.disabled = false;
      confirmButton.innerText = transactionType === 'retrieve' ? 'Confirm Retrieval' : 'Confirm Return';
    });
}


// --- ======================================================= ---
// ---        SHARED FUNCTIONS & INITIALIZATION                ---
// --- ======================================================= ---

function resetSearch() {
  const searchInput = document.getElementById('search');
  if(searchInput) {
    searchInput.value = '';
    searchInput.dispatchEvent(new Event('input'));
  }
}

function filterBySection(selectedSection) {
  const searchInput = document.getElementById('search');
  if(searchInput) {
      searchInput.dataset.selectedSection = selectedSection;
      searchInput.dispatchEvent(new Event('input'));
  }

  const allHeaderCells = document.querySelectorAll('#table-headers th');
  const allDataCells = document.querySelectorAll('#table-body td');
  if (itemNoColIndex > -1 && sectionColIndex > -1) {
    const colsToHide = [headers[itemNoColIndex], headers[sectionColIndex]];
    const shouldHide = !!selectedSection;
    allHeaderCells.forEach(th => {
      if (colsToHide.includes(th.dataset.headerName)) {
        th.classList.toggle('section-filtered-column', shouldHide);
      }
    });
    allDataCells.forEach(td => {
      if (colsToHide.includes(td.dataset.colName)) {
        td.classList.toggle('section-filtered-column', shouldHide);
      }
    });
  }
}

function initializeAdvancedColumns() {
  const savedState = localStorage.getItem('advancedColumnsVisible');
  advancedVisible = savedState === 'true';
  applyAdvancedColumnsState();
  const btn = document.getElementById('advancedToggleBtn');
  if (btn) {
      btn.innerText = advancedVisible ? 'Hide Advanced' : 'Show Advanced';
      btn.classList.toggle('advanced-open', advancedVisible);
  }
}

function toggleAdvancedColumns() {
  advancedVisible = !advancedVisible;
  localStorage.setItem('advancedColumnsVisible', advancedVisible);
  applyAdvancedColumnsState();
  const btn = document.getElementById('advancedToggleBtn');
  if (btn) {
      btn.innerText = advancedVisible ? 'Hide Advanced' : 'Show Advanced';
      btn.classList.toggle('advanced-open', advancedVisible);
  }
}

function applyAdvancedColumnsState() {
  document.querySelectorAll('.advanced-column').forEach(col => col.classList.toggle('advanced-visible', advancedVisible));
  const addForm = document.getElementById('addForm');
  if(addForm) {
      addForm.querySelectorAll('.advanced-add-field').forEach(field => field.style.display = advancedVisible ? 'block' : 'none');
  }
}

document.addEventListener('DOMContentLoaded', function() {
    const searchInput = document.getElementById('search');
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            const q = this.value.trim().toLowerCase();
            const selectedSection = this.dataset.selectedSection || '';
            const rows = document.querySelectorAll('#table-body tr');
            rows.forEach(r => {
                const text = r.innerText.toLowerCase();
                const rowSectionCell = (sectionColIndex > -1 && r.cells[sectionColIndex]) ? r.cells[sectionColIndex] : null;
                const rowSectionText = rowSectionCell ? rowSectionCell.innerText.trim().toLowerCase() : '';
                const matchesSearch = (!q || text.includes(q));
                const matchesSectionFilter = (!selectedSection || rowSectionText === selectedSection.toLowerCase());
                if (matchesSearch && matchesSectionFilter) {
                    r.style.display = '';
                    setTimeout(() => r.style.opacity = 1, 10);
                } else {
                    r.style.opacity = 0;
                    setTimeout(()=> { r.style.display = 'none'; }, 300);
                }
            });
        });
    }

    const addSectionDropdown = document.getElementById('addSection');
    if (addSectionDropdown) {
        initializeAdvancedColumns();
    }
});

// function openSectionNav() {
//   const sidebar = document.getElementById("sectionOffcanvas");
//   const main = document.getElementById("mainContent");
//   if (sidebar) sidebar.style.width = "250px";
//   if (main) main.style.marginLeft = "250px";
// }

// function closeSectionNav() {
//   const sidebar = document.getElementById("sectionOffcanvas");
//   const main = document.getElementById("mainContent");
//   if (sidebar) sidebar.style.width = "0";
//   if (main) main.style.marginLeft = "0";
// }

// --- SIDEBAR NAVIGATION (CORRECTED) ---
function toggleSectionNav() {
  const sidebar = document.getElementById("sectionOffcanvas");
  const main = document.getElementById("mainContent");

  if (sidebar && main) {
    // Check if the sidebar is currently open
    if (sidebar.style.width === "250px") {
      // If it's open, close it
      sidebar.style.width = "0";
      main.style.marginLeft = "0";
    } else {
      // If it's closed, open it
      sidebar.style.width = "250px";
      main.style.marginLeft = "250px";
    }
  }
}

// We can keep a separate close function for the 'x' button and clicking on links
function closeSectionNav() {
  const sidebar = document.getElementById("sectionOffcanvas");
  const main = document.getElementById("mainContent");
  if (sidebar) sidebar.style.width = "0";
  if (main) main.style.marginLeft = "0";
}


// end of file