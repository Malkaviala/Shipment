// Initialize Firebase
const firebaseConfig = {
    apiKey: "AIzaSyBVH4syVcOVAJJI0BkPl8EWUcarmgqQIH0",
    authDomain: "shipment-c50a1.firebaseapp.com",
    projectId: "shipment-c50a1",
    storageBucket: "shipment-c50a1.appspot.com",
    messagingSenderId: "552502680496",
    appId: "1:552502680496:web:5563feea124f54904d5475",
    measurementId: "G-6C927VG178"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const storage = firebase.storage();

// Utility function to format numbers with thousand separators
function formatNumber(number) {
    return number.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

// Initialize Google Maps Autocomplete
function initAutocomplete() {
    const shipperAddressInput = document.getElementById('shipperAddress');
    const receiverAddressInput = document.getElementById('receiverAddress');

    if (shipperAddressInput && receiverAddressInput) {
        new google.maps.places.Autocomplete(shipperAddressInput, {
            types: ['geocode']
        });

        new google.maps.places.Autocomplete(receiverAddressInput, {
            types: ['geocode']
        });
    }
}

// Initialize page
document.addEventListener('DOMContentLoaded', function() {
    initAutocomplete();
    
    // Set up search functionality
    const searchBar = document.getElementById('searchBar');
    if (searchBar) {
        let debounceTimeout;
        searchBar.addEventListener('input', () => {
            clearTimeout(debounceTimeout);
            debounceTimeout = setTimeout(searchShipments, 300);
        });
    }

    // Set up form submission
    const shipmentForm = document.getElementById('shipmentForm');
    if (shipmentForm) {
        shipmentForm.addEventListener('submit', handleFormSubmission);
    }

    // Set up filter buttons
    const applyFilterBtn = document.getElementById('applyFilterBtn');
    if (applyFilterBtn) {
        applyFilterBtn.addEventListener('click', filterShipments);
    }

    const clearFilterBtn = document.getElementById('clearFilterBtn');
    if (clearFilterBtn) {
        clearFilterBtn.addEventListener('click', resetFilters);
    }

    displayShipments();
});

// Handle form submission
function handleFormSubmission(e) {
    e.preventDefault();
    
    const rateInput = document.getElementById('rate');
    const rate = rateInput && rateInput.value ? parseFloat(rateInput.value) : 0;
    
    const shipment = {
        broker: document.getElementById('broker')?.value || '',
        loadId: document.getElementById('loadId')?.value || '',
        rate: rate,
        shipperName: document.getElementById('shipperName')?.value || '',
        shipperAddress: document.getElementById('shipperAddress')?.value || '',
        receiverName: document.getElementById('receiverName')?.value || '',
        receiverAddress: document.getElementById('receiverAddress')?.value || '',
        pickupDate: document.getElementById('pickupDate')?.value || '',
        deliveryDate: document.getElementById('deliveryDate')?.value || ''
    };

    const pdfFileInput = document.getElementById('pdfFile');
    const pdfFile = pdfFileInput?.files[0];

    if (pdfFile) {
        const storageRef = storage.ref('shipment_pdfs/' + shipment.loadId + '_' + pdfFile.name);
        storageRef.put(pdfFile).then((snapshot) => {
            console.log('PDF uploaded successfully');
            return snapshot.ref.getDownloadURL();
        }).then((downloadURL) => {
            shipment.pdfUrl = downloadURL;
            return addShipmentToFirestore(shipment);
        }).catch((error) => {
            console.error("Error uploading PDF: ", error);
            alert("Error uploading PDF. Please try again.");
        });
    } else {
        addShipmentToFirestore(shipment);
    }
}

// Add shipment to Firestore
function addShipmentToFirestore(shipment) {
    return db.collection("shipments").add(shipment)
        .then((docRef) => {
            console.log("Shipment added with ID: ", docRef.id);
            alert("Shipment added successfully!");
            const form = document.getElementById('shipmentForm');
            if (form) form.reset();
            const viewShipmentsTab = document.getElementById('viewShipments');
            if (viewShipmentsTab && viewShipmentsTab.style.display === 'block') {
                displayShipments();
            }
        })
        .catch((error) => {
            console.error("Error adding shipment: ", error);
            alert("Error adding shipment. Please try again.");
        });
}

// Search shipments
function searchShipments() {
    const searchInput = document.getElementById('searchBar');
    if (!searchInput) return;

    const searchKeyword = searchInput.value.toLowerCase().trim();
    displayShipments(null, null, searchKeyword);
}

// Filter shipments by date
function filterShipments() {
    const fromDateInput = document.getElementById('filterStartDate');
    const toDateInput = document.getElementById('filterEndDate');

    if (!fromDateInput || !toDateInput || !fromDateInput.value || !toDateInput.value) {
        alert("Please select both a start and end date for filtering.");
        return;
    }

    const fromDate = new Date(fromDateInput.value);
    const toDate = new Date(toDateInput.value);
    toDate.setHours(23, 59, 59);

    if (fromDate > toDate) {
        alert("Start date must be before or equal to end date.");
        return;
    }

    const searchInput = document.getElementById('searchBar');
    const searchKeyword = searchInput ? searchInput.value.toLowerCase().trim() : '';
    displayShipments(fromDate, toDate, searchKeyword);
}

// Reset filters
function resetFilters() {
    const fromDateInput = document.getElementById('filterStartDate');
    const toDateInput = document.getElementById('filterEndDate');
    const searchInput = document.getElementById('searchBar');
    
    if (fromDateInput) fromDateInput.value = '';
    if (toDateInput) toDateInput.value = '';
    if (searchInput) searchInput.value = '';
    
    displayShipments();
}

// Display shipments
function displayShipments(fromDate = null, toDate = null, searchKeyword = '') {
    const shipmentList = document.getElementById('shipmentList');
    if (!shipmentList) return;
    
    shipmentList.innerHTML = '<p>Loading shipments...</p>';

    let query = db.collection("shipments").orderBy("pickupDate", "desc");

    query.get().then((querySnapshot) => {
        shipmentList.innerHTML = '';
        let totalRate = 0;
        let matchFound = false;

        querySnapshot.forEach((doc) => {
            const shipment = doc.data();
            let includeShipment = true;

            // Date filtering
            if (fromDate && toDate && shipment.pickupDate) {
                const shipmentDate = new Date(shipment.pickupDate);
                if (shipmentDate < fromDate || shipmentDate > toDate) {
                    includeShipment = false;
                }
            }

            // Keyword filtering
            if (searchKeyword && includeShipment) {
                const searchableFields = [
                    shipment.broker,
                    shipment.loadId,
                    shipment.shipperName,
                    shipment.receiverName
                ].map(field => (field || '').toLowerCase());
                
                if (!searchableFields.some(field => field.includes(searchKeyword))) {
                    includeShipment = false;
                }
            }

            if (includeShipment) {
                matchFound = true;
                const shipmentRate = shipment.rate ? parseFloat(shipment.rate) : 0;
                totalRate += shipmentRate;
                
                const shipmentElement = createShipmentElement(shipment);
                shipmentList.appendChild(shipmentElement);
            }
        });

        if (!matchFound) {
            shipmentList.innerHTML = '<p>No shipments found for the selected criteria.</p>';
        }
        
        const totalRateElement = document.getElementById('totalRate');
        if (totalRateElement) {
            totalRateElement.textContent = `$${formatNumber(totalRate)}`;
        }
    }).catch((error) => {
        console.error("Error getting shipments: ", error);
        shipmentList.innerHTML = '<p>Error loading shipments. Please try again.</p>';
    });
}

// Create shipment element
function createShipmentElement(shipment) {
    const shipmentElement = document.createElement('div');
    shipmentElement.className = 'shipment-item';
    shipmentElement.innerHTML = `
        <h3>Load ID: ${shipment.loadId}</h3>
        <p><strong>Broker:</strong> ${shipment.broker}</p>
        <p><strong>Rate:</strong> $${formatNumber(shipment.rate || 0)}</p>
        <hr/>
        <p><strong>Shipper:</strong> ${shipment.shipperName}</p>
        <p><strong>Address:</strong> ${shipment.shipperAddress}</p>
        <p><strong>Pick Up Date:</strong> ${shipment.pickupDate || 'N/A'}</p>
        <hr/>
        <p><strong>Receiver:</strong> ${shipment.receiverName}</p>
        <p><strong>Address:</strong> ${shipment.receiverAddress}</p>
        <p><strong>Delivery Date:</strong> ${shipment.deliveryDate || 'N/A'}</p>
        <hr/>
        ${shipment.pdfUrl ? `<p><a href="${shipment.pdfUrl}" target="_blank" class="pdf-link">View PDF</a></p>` : ''}
    `;
    return shipmentElement;
}

// Switch between tabs
function showTab(tabId) {
    const addShipmentForm = document.getElementById('addShipmentForm');
    const viewShipments = document.getElementById('viewShipments');
    
    if (addShipmentForm) addShipmentForm.style.display = 'none';
    if (viewShipments) viewShipments.style.display = 'none';
    
    const selectedTab = document.getElementById(tabId);
    if (selectedTab) selectedTab.style.display = 'block';

    // Update active tab
    const tabButtons = document.querySelectorAll('.tab');
    tabButtons.forEach(tab => {
        if (tab.getAttribute('onclick').includes(tabId)) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });

    if (tabId === 'viewShipments') {
        displayShipments();
    }
}
