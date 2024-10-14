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

let isEditing = false;
let currentEditId = null;

let map;
let directionsService;
let directionsRenderer;

function initMap() {
    directionsService = new google.maps.DirectionsService();
    directionsRenderer = new google.maps.DirectionsRenderer();
    map = new google.maps.Map(document.getElementById('map'), {
        zoom: 7,
        center: { lat: 41.85, lng: -87.65 } // Default center (you can adjust this)
    });
    directionsRenderer.setMap(map);
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

// Initialize autocomplete and map once the page is loaded
window.onload = function() {
    initAutocomplete();
    initMap();
};

// Handle form submission
document.getElementById('shipmentForm').addEventListener('submit', function(e) {
    e.preventDefault();
    
    const shipment = {
        broker: document.getElementById('broker').value,
        loadId: document.getElementById('loadId').value,
        rate: parseFloat(document.getElementById('rate').value),
        shipperName: document.getElementById('shipperName').value,
        shipperAddress: document.getElementById('shipperAddress').value,
        receiverName: document.getElementById('receiverName').value,
        receiverAddress: document.getElementById('receiverAddress').value,
        pickupDate: document.getElementById('pickupDate').value,
        deliveryDate: document.getElementById('deliveryDate').value
    };

    const pdfFile = document.getElementById('pdfFile').files[0];

    // Handle PDF upload and shipment save/update
    handleShipmentSubmission(shipment, pdfFile);
});

function handleShipmentSubmission(shipment, pdfFile) {
    if (pdfFile) {
        const storageRef = storage.ref('shipment_pdfs/' + shipment.loadId + '_' + pdfFile.name);
        storageRef.put(pdfFile)
            .then((snapshot) => snapshot.ref.getDownloadURL())
            .then((downloadURL) => {
                shipment.pdfUrl = downloadURL;
                saveOrUpdateShipment(shipment);
            })
            .catch((error) => {
                console.error("Error uploading PDF: ", error);
                alert("Error uploading PDF. Please try again.");
            });
    } else {
        saveOrUpdateShipment(shipment);
    }
}

function saveOrUpdateShipment(shipment) {
    if (isEditing && currentEditId) {
        // Update existing shipment
        updateShipmentInFirestore(currentEditId, shipment);
    } else {
        // Add new shipment
        addShipmentToFirestore(shipment);
    }
}

function updateShipmentInFirestore(shipmentId, shipment) {
    return db.collection("shipments").doc(shipmentId).update(shipment)
        .then(() => {
            alert("Shipment updated successfully!");
            resetForm();
            showTab('viewShipments');
            displayShipments();
        })
        .catch((error) => {
            console.error("Error updating shipment: ", error);
            alert("Error updating shipment. Please try again.");
        });
}

function addShipmentToFirestore(shipment) {
    return db.collection("shipments").add(shipment)
        .then((docRef) => {
            console.log("Shipment added with ID: ", docRef.id);
            alert("Shipment added successfully!");
            resetForm();
            showTab('viewShipments');
            displayShipments();
        })
        .catch((error) => {
            console.error("Error adding shipment: ", error);
            alert("Error adding shipment. Please try again.");
        });
}

function resetForm() {
    document.getElementById('shipmentForm').reset();
    const submitButton = document.querySelector('#shipmentForm button[type="submit"]');
    submitButton.textContent = 'Add Shipment';
    
    const cancelButton = document.getElementById('cancelEdit');
    if (cancelButton) {
        cancelButton.remove();
    }
    
    isEditing = false;
    currentEditId = null;
}

function displayShipments(fromDate = null, toDate = null) {
    const shipmentList = document.getElementById('shipmentList');
    shipmentList.innerHTML = ''; // Clear existing list

    let totalRate = 0;
    let query = db.collection("shipments").orderBy("deliveryDate", "desc");

    if (fromDate && toDate) {
        query = query
            .where("deliveryDate", ">=", fromDate.toISOString().split("T")[0])
            .where("deliveryDate", "<=", toDate.toISOString().split("T")[0]);
    }

    query.get().then(async (querySnapshot) => {
        if (querySnapshot.empty) {
            shipmentList.innerHTML = '<p>No shipments found for the selected date range.</p>';
            document.getElementById('totalRate').textContent = '$0.00';
            return;
        }

        let shipments = [];
        querySnapshot.forEach((doc) => {
            const shipment = doc.data();
            shipment.id = doc.id;
            shipments.push(shipment);
        });

        // Calculate distances for all shipments
        await calculateAllDistances(shipments);

        shipments.forEach((shipment, index) => {
            totalRate += shipment.rate ? parseFloat(shipment.rate) : 0;

            const shipmentElement = document.createElement('div');
            shipmentElement.className = 'shipment-item';
            shipmentElement.innerHTML = `
                <h3>Load ID: ${shipment.loadId}</h3>
                <p><strong>Broker:</strong> ${shipment.broker}</p>
                <p><strong>Rate:</strong> $${shipment.rate ? shipment.rate.toFixed(2) : 'N/A'}</p>
                <p><strong>Pick Up Date:</strong> ${shipment.pickupDate || 'N/A'}</p>
                <p><strong>Delivery Date:</strong> ${shipment.deliveryDate || 'N/A'}</p>
                ${shipment.shipmentDistance ? `<p><strong>Shipment Distance:</strong> ${shipment.shipmentDistance.toFixed(2)} miles</p>` : ''}
                ${shipment.deadMiles ? `<p><strong>Dead Miles:</strong> ${shipment.deadMiles.toFixed(2)} miles</p>` : ''}
                <hr/>
                <p><strong>Shipper:</strong> ${shipment.shipperName}</p>
                <p><strong>Address:</strong> ${shipment.shipperAddress}</p>
                <hr/>
                <p><strong>Receiver:</strong> ${shipment.receiverName}</p>
                <p><strong>Address:</strong> ${shipment.receiverAddress}</p>
                <hr/>
                ${shipment.pdfUrl ? `<p><a href="${shipment.pdfUrl}" target="_blank" class="pdf-link">View PDF</a></p>` : ''}
                <button onclick="editShipment('${shipment.id}')">Edit</button>
                <button onclick="deleteShipment('${shipment.id}')">Delete</button>
                <button onclick="showRoute('${shipment.id}')">Show Route</button>
            `;

            shipmentList.appendChild(shipmentElement);
        });

        document.getElementById('totalRate').textContent = `$${totalRate.toFixed(2)}`;
    }).catch((error) => {
        console.error("Error getting shipments: ", error);
        shipmentList.innerHTML = '<p>Error loading shipments. Please try again later.</p>';
    });
}

async function calculateAllDistances(shipments) {
    for (let i = 0; i < shipments.length; i++) {
        const currentShipment = shipments[i];
        
        // Calculate shipment distance (pickup to delivery)
        try {
            currentShipment.shipmentDistance = await getDistance(currentShipment.shipperAddress, currentShipment.receiverAddress);
        } catch (error) {
            console.error("Error calculating shipment distance:", error);
            currentShipment.shipmentDistance = null;
        }

        // Calculate dead miles (if not the last shipment)
        if (i < shipments.length - 1) {
            const nextShipment = shipments[i + 1];
            try {
                currentShipment.deadMiles = await getDistance(currentShipment.receiverAddress, nextShipment.shipperAddress);
            } catch (error) {
                console.error("Error calculating dead miles:", error);
                currentShipment.deadMiles = null;
            }
        } else {
            currentShipment.deadMiles = 0; // No dead miles for the last shipment
        }
    }
}


function getDistance(origin, destination) {
    return new Promise((resolve, reject) => {
        const service = new google.maps.DistanceMatrixService();
        service.getDistanceMatrix(
            {
                origins: [origin],
                destinations: [destination],
                travelMode: 'DRIVING',
                unitSystem: google.maps.UnitSystem.IMPERIAL,
            },
            (response, status) => {
                if (status === 'OK') {
                    const distance = response.rows[0].elements[0].distance.value / 1609.34; // Convert meters to miles
                    resolve(distance);
                } else {
                    reject(new Error('Failed to calculate distance'));
                }
            }
        );
    });
}

function filterShipments() {
    const fromDateInput = document.getElementById('fromDate').value;
    const toDateInput = document.getElementById('toDate').value;

    const fromDate = fromDateInput ? new Date(fromDateInput) : null;
    const toDate = toDateInput ? new Date(toDateInput) : null;

    if (fromDate && toDate) {
        displayShipments(fromDate, toDate);
    } else {
        alert("Please select both a start and an end date for filtering.");
    }
}

function resetFilters() {
    document.getElementById('fromDate').value = '';
    document.getElementById('toDate').value = '';
    displayShipments();
}

function editShipment(shipmentId) {
    isEditing = true;
    currentEditId = shipmentId;
    
    db.collection("shipments").doc(shipmentId).get().then((doc) => {
        if (doc.exists) {
            const shipment = doc.data();
            
            // Load the shipment data into the form fields
            document.getElementById('broker').value = shipment.broker;
            document.getElementById('loadId').value = shipment.loadId;
            document.getElementById('rate').value = shipment.rate;
            document.getElementById('shipperName').value = shipment.shipperName;
            document.getElementById('shipperAddress').value = shipment.shipperAddress;
            document.getElementById('receiverName').value = shipment.receiverName;
            document.getElementById('receiverAddress').value = shipment.receiverAddress;
            document.getElementById('pickupDate').value = shipment.pickupDate;
            document.getElementById('deliveryDate').value = shipment.deliveryDate;

            // Change form button text to "Update Shipment"
            const submitButton = document.querySelector('#shipmentForm button[type="submit"]');
            submitButton.textContent = 'Update Shipment';
            
            // Add a cancel button if it doesn't exist
            if (!document.getElementById('cancelEdit')) {
                const cancelButton = document.createElement('button');
                cancelButton.id = 'cancelEdit';
                cancelButton.type = 'button';
                cancelButton.textContent = 'Cancel Edit';
                cancelButton.onclick = cancelEditing;
                submitButton.parentNode.insertBefore(cancelButton, submitButton.nextSibling);
            }

            // Show the Add Shipment form
            showTab('addShipmentForm');
        }
    }).catch((error) => {
        console.error("Error retrieving shipment: ", error);
        alert("Error retrieving shipment for editing. Please try again.");
    });
}

function cancelEditing() {
    resetForm();
}

function deleteShipment(shipmentId) {
    if (confirm("Are you sure you want to delete this shipment?")) {
        db.collection("shipments").doc(shipmentId).delete()
            .then(() => {
                alert("Shipment deleted successfully!");
                displayShipments();
            })
            .catch((error) => {
                console.error("Error deleting shipment: ", error);
                alert("Error deleting shipment. Please try again.");
            });
    }
}

function showRoute(shipmentId) {
    db.collection("shipments").doc(shipmentId).get().then((doc) => {
        if (doc.exists) {
            const shipment = doc.data();
            const origin = shipment.shipperAddress;
            const destination = shipment.receiverAddress;

            const request = {
                origin: origin,
                destination: destination,
                travelMode: 'DRIVING'
            };

            directionsService.route(request, function(result, status) {
                if (status === 'OK') {
                    directionsRenderer.setDirections(result);
                    // Show the map
                    document.getElementById('map').style.display = 'block';
                    // Optionally, scroll to the map
                    document.getElementById('map').scrollIntoView({behavior: "smooth"});
                }
            });
        }
    }).catch((error) => {
        console.error("Error getting shipment: ", error);
    });
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

// Call displayShipments when the page loads to show all shipments
displayShipments();
