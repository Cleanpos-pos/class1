import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icons in Leaflet with bundlers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

interface DeliveryLocation {
    id: string;
    customer_name: string;
    customer_address: string;
    lat?: number;
    lng?: number;
    status?: string;
}

interface DeliveryMapProps {
    deliveries: DeliveryLocation[];
    onMarkerClick?: (delivery: DeliveryLocation) => void;
    selectedDeliveryId?: string;
}

const DeliveryMap: React.FC<DeliveryMapProps> = ({ deliveries, onMarkerClick, selectedDeliveryId }) => {
    const mapRef = useRef<L.Map | null>(null);
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const markersRef = useRef<{ [key: string]: L.Marker }>({});

    // State to store geocoded coordinates
    const [geocodedLocations, setGeocodedLocations] = React.useState<{ [key: string]: { lat: number, lng: number } }>({});

    useEffect(() => {
        // Function to geocode a single address
        const geocodeAddress = async (id: string, address: string) => {
            if (geocodedLocations[id]) return; // Already geocoded

            try {
                const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`, {
                    headers: {
                        'User-Agent': 'CleanPOS-DriverApp/1.0'
                    }
                });
                const data = await response.json();
                if (data && data.length > 0) {
                    setGeocodedLocations(prev => ({
                        ...prev,
                        [id]: { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
                    }));
                }
            } catch (error) {
                console.error("Geocoding failed for", address, error);
            }
        };

        // Trigger geocoding for deliveries without coordinates
        deliveries.forEach(d => {
            if (!d.lat && !d.lng && !geocodedLocations[d.id]) {
                // simple debounce/delay to be nice to the free API
                setTimeout(() => geocodeAddress(d.id, d.customer_address), Math.random() * 1000);
            }
        });
    }, [deliveries]);

    useEffect(() => {
        if (!mapContainerRef.current) return;

        // Initialize map centered on UK (default)
        if (!mapRef.current) {
            mapRef.current = L.map(mapContainerRef.current).setView([54.5, -4], 6); // zoomed out to UK

            // Add OpenStreetMap tiles
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
                maxZoom: 19,
            }).addTo(mapRef.current);
        }

        // Clear existing markers
        Object.values(markersRef.current).forEach((marker: any) => marker.remove());
        markersRef.current = {};

        // Add markers for deliveries with coordinates
        const bounds: L.LatLngBoundsExpression = [];

        deliveries.forEach((delivery, index) => {
            // Use geocoded coords if available, otherwise passed coords, otherwise skip (or fallback locally if you really want)
            // We removed the hardcoded Winchester randomizer to solve the user's issue.
            const coords = geocodedLocations[delivery.id] || (delivery.lat && delivery.lng ? { lat: delivery.lat, lng: delivery.lng } : null);

            if (!coords) return;

            const { lat, lng } = coords;
            bounds.push([lat, lng]);

            // Create custom icon based on status
            const isSelected = delivery.id === selectedDeliveryId;
            const isCompleted = delivery.status === 'delivered' || delivery.status === 'completed';

            const iconHtml = `
        <div style="
          background-color: ${isCompleted ? '#10b981' : isSelected ? '#3b82f6' : '#f59e0b'};
          width: 32px;
          height: 32px;
          border-radius: 50%;
          border: 3px solid white;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: bold;
          font-size: 14px;
        ">
          ${index + 1}
        </div>
      `;

            const customIcon = L.divIcon({
                html: iconHtml,
                className: 'custom-marker',
                iconSize: [32, 32],
                iconAnchor: [16, 16],
            });

            const marker = L.marker([lat, lng], { icon: customIcon })
                .addTo(mapRef.current!)
                .bindPopup(`
          <div style="min-width: 200px;">
            <h3 style="font-weight: bold; margin-bottom: 8px;">${delivery.customer_name}</h3>
            <p style="font-size: 12px; color: #666; margin-bottom: 8px;">${delivery.customer_address}</p>
            <div style="display: flex; align-items: center; gap: 4px;">
              <span style="
                background-color: ${isCompleted ? '#dcfce7' : '#fef3c7'};
                color: ${isCompleted ? '#166534' : '#92400e'};
                padding: 2px 8px;
                border-radius: 12px;
                font-size: 10px;
                font-weight: bold;
                text-transform: uppercase;
              ">
                ${delivery.status || 'pending'}
              </span>
            </div>
          </div>
        `);

            marker.on('click', () => {
                if (onMarkerClick) {
                    onMarkerClick(delivery);
                }
            });

            markersRef.current[delivery.id] = marker;
        });

        // Fit map to show all markers
        if (bounds.length > 0 && mapRef.current) {
            mapRef.current.fitBounds(bounds, { padding: [50, 50] });
        }
    }, [deliveries, selectedDeliveryId, onMarkerClick, geocodedLocations]);

    // Update marker styles when selection changes
    useEffect(() => {
        if (!selectedDeliveryId) return;

        const selectedDelivery = deliveries.find(d => d.id === selectedDeliveryId);
        if (selectedDelivery && markersRef.current[selectedDeliveryId]) {
            markersRef.current[selectedDeliveryId].openPopup();
        }
    }, [selectedDeliveryId, deliveries]);

    return (
        <div
            ref={mapContainerRef}
            style={{
                width: '100%',
                height: '600px',
                borderRadius: '8px',
                overflow: 'hidden'
            }}
        />
    );
};

export default DeliveryMap;
