import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { AlertTriangle } from 'lucide-react';
import nmcLogo from './NMClogo.png';

interface MiniLocationMapProps {
  latitude: number;
  longitude: number;
  companyName: string;
  licenseStatus: string;
  onOpenFullMap?: () => void;
}

export const MiniLocationMap: React.FC<MiniLocationMapProps> = ({
  latitude,
  longitude,
  companyName,
  licenseStatus,
  onOpenFullMap
}) => {
  const lat = Number(latitude);
  const lng = Number(longitude);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  const isValidCoords = !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0;

  useEffect(() => {
    if (!isValidCoords || !mapContainerRef.current) return;
    let isDisposed = false;
    const timers: number[] = [];

    // Initialize map
    const map = L.map(mapContainerRef.current, {
      center: [lat, lng],
      zoom: 14,
      zoomControl: true,
      dragging: true,
      scrollWheelZoom: false,
    });

    mapRef.current = map;

    // Add OpenStreetMap tile layer
    // For high-volume production, NMC may later use a dedicated tile provider or self-hosted tiles.
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    // Dynamic marker accent styling matching other maps
    let ringColor = 'border-emerald-500 bg-emerald-50/90';
    let badgeColor = 'bg-emerald-500';

    if (licenseStatus === 'Expiring Soon') {
      ringColor = 'border-amber-500 bg-amber-50/90';
      badgeColor = 'bg-amber-505';
    } else if (licenseStatus === 'Expired') {
      ringColor = 'border-rose-500 bg-rose-50/90';
      badgeColor = 'bg-rose-500';
    } else if (licenseStatus === 'Suspended' || licenseStatus === 'Cancelled') {
      ringColor = 'border-slate-400 bg-slate-100/90';
      badgeColor = 'bg-slate-400';
    }

    const customHtml = `
      <div class="relative flex items-center justify-center" style="width: 38px; height: 38px;">
        <div class="absolute inset-0 rounded-full border-2 ${ringColor} shadow-md animate-pulse" style="width: 38px; height: 38px;"></div>
        <img src="${nmcLogo}" class="rounded-full border border-white bg-white object-contain" style="width: 28px; height: 28px; z-index: 10;" referrerPolicy="no-referrer" />
        <span class="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border border-white ${badgeColor}" style="z-index: 20;"></span>
      </div>
    `;

    const nmcIcon = L.divIcon({
      html: customHtml,
      className: 'custom-nmc-marker-mini',
      iconSize: [38, 38],
      iconAnchor: [19, 19],
    });

    markerRef.current = L.marker([lat, lng], { icon: nmcIcon, title: companyName }).addTo(map);

    [100, 350].forEach(delay => {
      const timer = window.setTimeout(() => {
        if (!isDisposed && mapRef.current) {
          mapRef.current.invalidateSize();
        }
      }, delay);
      timers.push(timer);
    });

    // Clean up on unmount
    return () => {
      isDisposed = true;
      timers.forEach(window.clearTimeout);
      if (mapRef.current) {
        mapRef.current.off();
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
      }
    };
  }, [lat, lng, licenseStatus, companyName]);

  // Fallback for missing/invalid coords
  if (!isValidCoords) {
    return (
      <div className="space-y-1.5 font-sans">
        <div className="flex justify-between items-center text-[11px] text-slate-500 font-bold">
          <span>📍 ទីតាំងក្រុមហ៊ុនលើផែនទី (Company Location Map)</span>
        </div>
        <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 flex items-center justify-center text-center h-[160px]">
          <span className="text-[10.5px] italic text-slate-400 font-semibold">គ្មានព័ត៌មានទីតាំងសរុប (No saved coordinates)</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5 font-sans" id={`mini-map-block-${latitude}-${longitude}`}>
      <div className="flex justify-between items-center text-[11px] text-[#2D327F] font-bold">
        <span>📍 ទីតាំងក្រុមហ៊ុនលើផែនទី (Company Location Map)</span>
        {onOpenFullMap && (
          <button
            type="button"
            onClick={onOpenFullMap}
            className="text-[#353C96] hover:underline cursor-pointer flex items-center gap-0.5 font-bold text-[10.5px]"
          >
            🗺️ បើកផែនទីពេញ (Open Full Map) &rarr;
          </button>
        )}
      </div>
      
      <div className="relative border border-slate-200 rounded-xl overflow-hidden shadow-xs h-[160px] bg-slate-100">
        <div ref={mapContainerRef} className="w-full h-full" style={{ outline: 'none' }} />
      </div>
    </div>
  );
};
