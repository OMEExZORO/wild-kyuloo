"use client";

// Small map of the neighbourhoods where this crowd stands out (Fill the room).
// Loaded with next/dynamic (no SSR): Leaflet needs `window`.

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { CircleMarker, MapContainer, TileLayer, Tooltip } from "react-leaflet";
import type { Promo } from "@/lib/promo";

export default function PromoMap({ hotspots, venue }: { hotspots: Promo["hotspots"]; venue: [number, number] | null }) {
  const points: [number, number][] = [...hotspots.map((h) => [h.lat, h.lon] as [number, number]), ...(venue ? [venue] : [])];
  if (!points.length) return null;
  const bounds = L.latLngBounds(points).pad(0.3);
  return (
    <MapContainer bounds={bounds} scrollWheelZoom={false} className="h-72 w-full rounded-2xl">
      <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" maxNativeZoom={19} />
      {venue && (
        <CircleMarker center={venue} radius={7} pathOptions={{ color: "#6250d6", weight: 3, fillOpacity: 0.9 }}>
          <Tooltip direction="top">The venue</Tooltip>
        </CircleMarker>
      )}
      {hotspots.map((h, i) => (
        <CircleMarker key={h.area} center={[h.lat, h.lon]} radius={16 - i * 2} pathOptions={{ color: "#0b0b0b", weight: 2, fillColor: "#c6f432", fillOpacity: 0.85 }}>
          <Tooltip permanent direction="center" className="!border-0 !bg-transparent !p-0 !font-bold !shadow-none">
            {i + 1}
          </Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
