import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { cn } from "@/lib/utils";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

interface MapPickerProps {
  latitude?: number;
  longitude?: number;
  onLocationChange?: (lat: number, lng: number) => void;
  className?: string;
  readOnly?: boolean;
  zoom?: number;
}

function MapUpdater({ latitude, longitude }: { latitude: number; longitude: number }) {
  const map = useMap();
  
  useEffect(() => {
    if (latitude && longitude) {
      map.setView([latitude, longitude], map.getZoom());
    }
  }, [latitude, longitude, map]);
  
  return null;
}

function LocationMarker({ 
  position, 
  onPositionChange, 
  readOnly 
}: { 
  position: [number, number] | null; 
  onPositionChange?: (lat: number, lng: number) => void;
  readOnly?: boolean;
}) {
  const markerRef = useRef<L.Marker>(null);

  useMapEvents({
    click(e) {
      if (!readOnly && onPositionChange) {
        onPositionChange(e.latlng.lat, e.latlng.lng);
      }
    },
  });

  if (!position) return null;

  return (
    <Marker
      position={position}
      ref={markerRef}
      draggable={!readOnly}
      eventHandlers={{
        dragend() {
          const marker = markerRef.current;
          if (marker && onPositionChange) {
            const latlng = marker.getLatLng();
            onPositionChange(latlng.lat, latlng.lng);
          }
        },
      }}
    />
  );
}

export function MapPicker({
  latitude,
  longitude,
  onLocationChange,
  className,
  readOnly = false,
  zoom = 15,
}: MapPickerProps) {
  const [position, setPosition] = useState<[number, number] | null>(
    latitude && longitude ? [latitude, longitude] : null
  );

  useEffect(() => {
    if (latitude && longitude) {
      setPosition([latitude, longitude]);
    }
  }, [latitude, longitude]);

  const handlePositionChange = (lat: number, lng: number) => {
    setPosition([lat, lng]);
    onLocationChange?.(lat, lng);
  };

  const defaultCenter: [number, number] = position || [41.9028, 12.4964];

  return (
    <div className={cn("relative rounded-lg overflow-hidden border", className)}>
      <MapContainer
        center={defaultCenter}
        zoom={position ? zoom : 6}
        style={{ height: "100%", width: "100%", minHeight: "250px" }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {position && (
          <MapUpdater latitude={position[0]} longitude={position[1]} />
        )}
        <LocationMarker
          position={position}
          onPositionChange={handlePositionChange}
          readOnly={readOnly}
        />
      </MapContainer>
      {!readOnly && (
        <div className="absolute bottom-2 left-2 right-2 bg-background/90 backdrop-blur-sm rounded px-2 py-1 text-xs text-muted-foreground z-[1000]">
          Clicca sulla mappa per posizionare il marker, oppure trascinalo per spostarlo
        </div>
      )}
    </div>
  );
}
