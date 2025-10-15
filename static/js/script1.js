// --- GLOBAL CONSTANTS ---
const headers = Array.from(document.querySelectorAll('#inv-table thead th')).map(th => th.dataset.headerName || th.innerText.trim());
const unitsColIndex = headers.findIndex(h => h.toLowerCase().includes('existing units'));
const remarksColIndex = headers.findIndex(h => h.toLowerCase().includes('remarks'));
const sectionColIndex = headers.findIndex(h => h.toLowerCase().includes('section'));
const itemNoColIndex = headers.findIndex(h => h.toLowerCase().includes('item no'));
const advancedHeaders = ['Part number', 'SKU ID', 'Remarks', 'URLS'];

// --- GLOBAL VARIABLES ---
let advancedVisible = false;
let retrieveModal = null;
let selectedItemNo = null;

// --- ADMIN-ONLY FUNCTIONS ---
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
    body: JSON.stringify({item_no: itemNo, col_name: headers[unitsColIndex], new_value: next})
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
        tr.classList.add('row-update-decrease');
        setTimeout(() => location.reload(), 500);
      } else {
        location.reload();
      }
    } else {
      alert('Deletion failed: ' + (j.error || JSON.stringify(j)));
    }
  }).catch(err => alert('Error: ' + err));
}

function addItem(e) {
  e.preventDefault();
  const form = document.getElementById('addForm');
  const container = form.closest('.add-form');
  if(container) container.classList.add('submitting');
  fetch('/add', { method:'POST', body: new FormData(form) }).then(() => {
    location.reload();
  });
  return false;
}

// --- SHARED FUNCTIONS ---
function resetSearch() {
  const searchInput = document.getElementById('search');
  if(searchInput) {
    searchInput.value = '';
    searchInput.dispatchEvent(new Event('input'));
  }
}

function filterBySection(selectedSection) {
  document.getElementById('search').dispatchEvent(new Event('input'));
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
  document.querySelectorAll('.advanced-add-field').forEach(field => field.style.display = advancedVisible ? 'block' : 'none');
}

// --- RETRIEVAL PAGE FUNCTIONS ---
function openRetrieveModal(itemNo) {
  selectedItemNo = itemNo;
  const tr = document.querySelector(`tr[data-item-no="${itemNo}"]`);
  if (!tr) return;
  const componentName = tr.cells[2].innerText;
  const currentStock = parseInt(tr.cells[5].innerText);
  const modalInfo = document.getElementById('modalItemInfo');
  if (modalInfo) {
      modalInfo.innerHTML = `<strong>Item:</strong> ${componentName}<br><strong>Available Stock:</strong> <span class="fw-bold fs-5 text-success">${currentStock}</span>`;
  }
  const quantityInput = document.getElementById("retrieveQuantity");
  quantityInput.max = currentStock;
  quantityInput.value = 1;
  const modal = new bootstrap.Modal(document.getElementById("retrieveModal"));
  modal.show();
}

function changeQuantity(delta) {
  const input = document.getElementById("retrieveQuantity");
  if (!input) return;
  let value = parseInt(input.value) || 0;
  let max = parseInt(input.max) || Infinity;
  let newValue = Math.max(1, value + delta);
  if (newValue > max) { newValue = max; }
  input.value = newValue;
}

function confirmRetrieve() {
  const quantityInput = document.getElementById("retrieveQuantity");
  if (!selectedItemNo || !quantityInput) return;
  const quantity = parseInt(quantityInput.value);
  if (isNaN(quantity) || quantity <= 0) {
    alert("Please enter a valid quantity.");
    return;
  }
  if (quantity > parseInt(quantityInput.max)) {
      alert("Cannot retrieve more than the available stock.");
      return;
  }
  const confirmButton = document.querySelector('#retrieveModal .btn-success');
  confirmButton.disabled = true;
  confirmButton.innerText = 'Processing...';
  fetch(`/retrieve/${selectedItemNo}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ quantity: quantity }),
  }).then(response => response.json()).then(data => {
      if (data.success) {
        alert("Item retrieved successfully!");
        location.reload();
      } else {
        alert(data.error || "Error retrieving item.");
        confirmButton.disabled = false;
        confirmButton.innerText = 'Confirm';
      }
    }).catch(err => {
      console.error("Retrieve error:", err);
      alert("An error occurred while retrieving the item.");
      confirmButton.disabled = false;
      confirmButton.innerText = 'Confirm';
    });
}

// --- MAIN INITIALIZATION LOGIC ---
document.addEventListener('DOMContentLoaded', function() {
    const searchInput = document.getElementById('search');
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            const q = this.value.trim().toLowerCase();
            const rows = document.querySelectorAll('#table-body tr');
            const sectionFilterEl = document.getElementById('sectionFilter');
            const sectionFilterValue = sectionFilterEl ? sectionFilterEl.value : '';
            rows.forEach(r => {
                const text = r.innerText.toLowerCase();
                const rowSectionCell = (sectionColIndex > -1 && sectionFilterValue && r.cells[sectionColIndex]) ? r.cells[sectionColIndex] : null;
                const rowSection = rowSectionCell ? rowSectionCell.innerText.trim() : '';
                const matchesSearch = (!q || text.includes(q));
                const matchesSectionFilter = (!sectionFilterValue || rowSection.toLowerCase() === sectionFilterValue.toLowerCase());
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
        const addNewSectionOption = document.createElement('option');
        addNewSectionOption.value = '___NEW_SECTION___';
        addNewSectionOption.innerText = 'Add New Section...';
        addSectionDropdown.appendChild(addNewSectionOption);
        addSectionDropdown.addEventListener('change', function() {
            if (this.value === '___NEW_SECTION___') {
                const newSectionName = prompt('Enter new section name:');
                if (newSectionName && newSectionName.trim() !== '') {
                    const sanitized = newSectionName.trim();
                    const filterDropdown = document.getElementById('sectionFilter');
                    if (filterDropdown) filterDropdown.appendChild(new Option(sanitized, sanitized));
                    addSectionDropdown.insertBefore(new Option(sanitized, sanitized), addNewSectionOption);
                    addSectionDropdown.value = sanitized;
                } else {
                    this.value = '';
                }
            }
        });
        initializeAdvancedColumns();
    }
    
    // This part does not need a check as it's specific to retrieve.html, but having one is safe.
    const modalEl = document.getElementById('retrieveModal');
    if (modalEl) {
        // This line is important, but might not be strictly necessary if you re-init on every open.
        // However, it's good practice.
    }
});