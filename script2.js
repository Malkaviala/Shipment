// Initialize Firebase (replace with your own config)
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

function initAutocomplete() {
    const shipperAddressInput = document.getElementById('shipperAddress');
    const receiverAddressInput = document.getElementById('receiverAddress');

    // Initialize Google Maps Autocomplete for Shipper Address
    const shipperAutocomplete = new google.maps.places.Autocomplete(shipperAddressInput, {
        types: ['geocode']
    });

    // Initialize Google Maps Autocomplete for Receiver Address
    const receiverAutocomplete = new google.maps.places.Autocomplete(receiverAddressInput, {
        types: ['geocode']
    });
}

// Initialize autocomplete once the page is loaded
window.onload = function() {
    initAutocomplete();
    displayShipments(); // Show all shipments initially
};

// Handle form submission
document.getElementById('shipmentForm').addEventListener('submit', function(e) {
    e.preventDefault();
    
    const rateInput = document.getElementById('rate').value;
    const rate = rateInput ? parseFloat(rateInput) : 0;
    
    const shipment = {
        broker: document.getElementById('broker').value,
        loadId: document.getElementById('loadId').value,
        rate: rate,
        shipperName: document.getElementById('shipperName').value,
        shipperAddress: document.getElementById('shipperAddress').value,
        receiverName: document.getElementById('receiverName').value,
        receiverAddress: document.getElementById('receiverAddress').value,
        pickupDate: document.getElementById('pickupDate').value,
        deliveryDate: document.getElementById('deliveryDate').value
    };

    const pdfFile = document.getElementById('pdfFile').files[0];

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
});

function addShipmentToFirestore(shipment) {
    return db.collection("shipments").add(shipment)
        .then((docRef) => {
            console.log("Shipment added with ID: ", docRef.id);
            alert("Shipment added successfully!");
            document.getElementById('shipmentForm').reset();
            if (document.getElementById('viewShipments').style.display === 'block') {
                displayShipments(); // Refresh the shipment list if it's visible
            }
        })
        .catch((error) => {
            console.error("Error adding shipment: ", error);
            alert("Error adding shipment. Please try again.");
        });
}

// Function to display shipments filtered by pickup date
function displayShipments(fromDate = null, toDate = null) {
    const shipmentList = document.getElementById('shipmentList');
    shipmentList.innerHTML = '<p>Loading shipments...</p>'; // Loading indicator

    let totalRate = 0;
    let query = db.collection("shipments").orderBy("pickupDate", "desc");

    // If both fromDate and toDate are provided, apply the date range filter
    if (fromDate && toDate) {
        // Ensure we're working with strings in the correct format for Firestore
        const startDate = fromDate.toISOString().split('T')[0];
        const endDate = toDate.toISOString().split('T')[0];
        
        query = db.collection("shipments")
                  .where("pickupDate", ">=", startDate)
                  .where("pickupDate", "<=", endDate)
                  .orderBy("pickupDate", "desc");
    }

    query.get().then((querySnapshot) => {
        shipmentList.innerHTML = ''; // Clear loading indicator
        
        if (querySnapshot.empty) {
            shipmentList.innerHTML = '<p>No shipments found for the selected date range.</p>';
            document.getElementById('totalRate').textContent = '$0.00';
            return;
        }

        querySnapshot.forEach((doc) => {
            const shipment = doc.data();
            const shipmentRate = shipment.rate ? parseFloat(shipment.rate) : 0;
            totalRate += shipmentRate;

            const shipmentElement = document.createElement('div');
            shipmentElement.className = 'shipment-item';
            shipmentElement.innerHTML = `
                <h3>Load ID: ${shipment.loadId}</h3>
                <p><strong>Broker:</strong> ${shipment.broker}</p>
                <p><strong>Rate:</strong> $${formatNumber(shipmentRate)}</p>
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
            shipmentList.appendChild(shipmentElement);
        });

        // Update total rate display with thousand separator
        document.getElementById('totalRate').textContent = `$${formatNumber(totalRate)}`;
    }).catch((error) => {
        console.error("Error getting shipments: ", error);
        shipmentList.innerHTML = '<p>Error loading shipments. Please try again later.</p>';
    });
}

// Function to filter shipments based on pickup date
function filterShipments() {
    const fromDateInput = document.getElementById('fromDate').value;
    const toDateInput = document.getElementById('toDate').value;

    if (!fromDateInput || !toDateInput) {
        alert("Please select both a start and an end date for filtering.");
        return;
    }

    const fromDate = new Date(fromDateInput);
    const toDate = new Date(toDateInput);

    // Ensure fromDate is not after toDate
    if (fromDate > toDate) {
        alert("Start date must be before or equal to end date.");
        return;
    }

    displayShipments(fromDate, toDate);
}

// Function to reset filters and show all shipments
function resetFilters() {
    document.getElementById('fromDate').value = '';
    document.getElementById('toDate').value = '';
    displayShipments();
}

// Function to switch between tabs
function showTab(tabId) {
    document.getElementById('addShipmentForm').style.display = 'none';
    document.getElementById('viewShipments').style.display = 'none';
    document.getElementById(tabId).style.display = 'block';

    // Update active tab
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    event.target.classList.add('active');

    if (tabId === 'viewShipments') {
        displayShipments();
    }
}

// Initial display
showTab('addShipmentForm');