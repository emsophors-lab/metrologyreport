import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import L from 'leaflet';
import { 
  MapPin, 
  Trash2, 
  ExternalLink, 
  Loader2, 
  AlertCircle,
  Crosshair,
  X,
  Map
} from 'lucide-react';
import nmcLogo from './NMClogo.png';

interface BusinessLocationMapProps {
  latitude: number | null;
  longitude: number | null;
  onChange: (lat: number | null, lon: number | null, address?: string) => void;
  locationSource?: string;
  onSourceChange?: (source: string) => void;
  isLocationLocked: boolean;
  setIsLocationLocked: (locked: boolean) => void;
}

const getFriendlySource = (source: string) => {
  switch (source) {
    case 'map_click':
      return { kh: 'ចុចជ្រើសរើសលើផែនទី', en: 'Map Click', color: 'bg-indigo-50 border-indigo-200 text-[#353C96]' };
    case 'current_location':
      return { kh: 'ចាប់យកឧបករណ៍ជីភីអេស', en: 'GPS Device', color: 'bg-emerald-50 border-emerald-200 text-emerald-800' };
    case 'manual_entry':
      return { kh: 'បញ្ចូលនិយាមការដោយដៃ', en: 'Manual Entry', color: 'bg-blue-55 text-blue-800 border-blue-200' };
    case 'map_drag':
      return { kh: 'អូសទាញទីតាំង (រំកិល)', en: 'Marker Dragged', color: 'bg-amber-50 border-amber-200 text-amber-700 font-bold' };
    default:
      return { kh: 'មិនទាន់កំណត់', en: 'Not Set', color: 'bg-slate-50 border-slate-200 text-slate-550' };
  }
};

export const BusinessLocationMap: React.FC<BusinessLocationMapProps> = ({
  latitude,
  longitude,
  onChange,
  locationSource = '',
  onSourceChange,
  isLocationLocked,
  setIsLocationLocked
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const isLockedRef = useRef(isLocationLocked);
  useEffect(() => {
    isLockedRef.current = isLocationLocked;
  }, [isLocationLocked]);

  const defaultLat = 11.5564; // Phnom Penh
  const defaultLng = 104.9282;

  // Manual Dialog form state
  const [showManualModal, setShowManualModal] = useState(false);
  const [modalLat, setModalLat] = useState('');
  const [modalLng, setModalLng] = useState('');
  const [modalError, setModalError] = useState('');

  // Google Maps URL Import state
  const [importUrl, setImportUrl] = useState('');
  const [importError, setImportError] = useState('');

  // Robust parser for Google Maps links
  const parseGoogleMapsUrl = (urlStr: string): { lat: number; lng: number } | null => {
    try {
      const trimmed = urlStr.trim();
      
      // Format: ...@11.6180721,104.9114962,18z
      const atMatch = trimmed.match(/@([0-9.-]+),([0-9.-]+)/);
      if (atMatch && atMatch[1] && atMatch[2]) {
        const lat = Number(atMatch[1]);
        const lng = Number(atMatch[2]);
        if (Number.isFinite(lat) && lat >= -90 && lat <= 90 && Number.isFinite(lng) && lng >= -180 && lng <= 180) {
          return { lat, lng };
        }
      }

      // Format: ...q=11.6180721,104.9114962 or query=11.6180721,104.9114962
      const qMatch = trimmed.match(/[?&](q|query)=([0-9.-]+),([0-9.-]+)/);
      if (qMatch && qMatch[2] && qMatch[3]) {
        const lat = Number(qMatch[2]);
        const lng = Number(qMatch[3]);
        if (Number.isFinite(lat) && lat >= -90 && lat <= 90 && Number.isFinite(lng) && lng >= -180 && lng <= 180) {
          return { lat, lng };
        }
      }
      
      // General fallback decimal matching (comma separated)
      const generalMatch = trimmed.match(/([0-9.-]+),\s*([0-9.-]+)/);
      if (generalMatch && generalMatch[1] && generalMatch[2]) {
        const lat = Number(generalMatch[1]);
        const lng = Number(generalMatch[2]);
        if (Number.isFinite(lat) && lat >= -90 && lat <= 90 && Number.isFinite(lng) && lng >= -180 && lng <= 180) {
          return { lat, lng };
        }
      }
    } catch (e) {
      console.warn('Error parsing Google Maps URL:', e);
    }
    return null;
  };

  // Geocoding, current location loading, and error states
  const [geocoding, setGeocoding] = useState(false);
  const [resolvedAddress, setResolvedAddress] = useState('');
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState('');
  const [gpsPermissionDenied, setGpsPermissionDenied] = useState(false);

  // Robust geocoder service using OSM Nominatim
  const triggerGeocode = (lat: number, lng: number) => {
    setGeocoding(true);
    fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`, {
      headers: {
        'Accept-Language': 'km,en'
      }
    })
      .then(res => res.json())
      .then(data => {
        setGeocoding(false);
        const addr = data.display_name || '';
        setResolvedAddress(addr);
        onChange(lat, lng, addr);
      })
      .catch(err => {
        console.warn('OSM Geocoding Error:', err);
        setGeocoding(false);
        onChange(lat, lng);
      });
  };

  // 1. One-time Map Initialization
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapRef.current) return;

    const container = mapContainerRef.current as any;
    let isDisposed = false;
    const timers: number[] = [];

    const initialLat = latitude !== null ? latitude : defaultLat;
    const initialLng = longitude !== null ? longitude : defaultLng;
    const initialZoom = latitude !== null ? 16 : 12;

    const map = L.map(container, {
      center: [initialLat, initialLng],
      zoom: initialZoom,
      zoomControl: true,
      scrollWheelZoom: true,
      dragging: true,
    });

    mapRef.current = map;
    setMapReady(true);

    // Load OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    // Click on map Selection
    map.on('click', (e: L.LeafletMouseEvent) => {
      if (isLockedRef.current) {
        alert(
          'ទីតាំងនេះត្រូវបានកំណត់ដោយនិយាមការរួចហើយ។ ប្រសិនបើចង់កែ សូមចុច កែទីតាំង ឬ សម្អាតទីតាំង ជាមុនសិន។\n\nThis location has already been locked by manual coordinates. To change it, please click Edit Location or Clear Location first.'
        );
        return;
      }
      const clickLat = Number(e.latlng.lat);
      const clickLng = Number(e.latlng.lng);
      onSourceChange?.('map_click');
      onChange(clickLat, clickLng);
      triggerGeocode(clickLat, clickLng);
    });

    // Invalidate size to ensure rendering loads accurately and handle hidden/rendered states
    const resizeObserver = new ResizeObserver(() => {
      if (!isDisposed && mapRef.current) {
        mapRef.current.invalidateSize();
      }
    });
    
    if (mapContainerRef.current) {
      resizeObserver.observe(mapContainerRef.current);
    }

    // Direct staggered fallback layout triggers to ensure correct sizing after various transitions or render updates
    [100, 200, 400, 700, 1200, 2000].forEach(delay => {
      const timer = window.setTimeout(() => {
        if (!isDisposed && mapRef.current) {
          mapRef.current.invalidateSize();
        }
      }, delay);
      timers.push(timer);
    });

    return () => {
      isDisposed = true;
      timers.forEach(window.clearTimeout);
      resizeObserver.disconnect();
      if (mapRef.current) {
        mapRef.current.off();
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
        setMapReady(false);
      }
    };
  }, []); // Run once on mount

  // 2. Synchronize Prop Coordinates with Marker/Map pan
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    if (latitude === null || longitude === null) {
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
      return;
    }

    const targetLat = Number(latitude);
    const targetLng = Number(longitude);
    if (isNaN(targetLat) || isNaN(targetLng)) return;

    // Custom high-precision marker with concentric verification ring, crosshair, and NMC branding Logo
    const customHtml = `
      <div class="relative flex items-center justify-center pointer-events-none" style="width: 44px; height: 44px; margin: 0; padding: 0; box-sizing: border-box;">
        <!-- Precise high-contrast red dot exactly on coordinate point -->
        <div class="absolute rounded-full bg-red-650 border border-white shadow-xs" style="width: 6px; height: 6px; z-index: 50; pointer-events: none;"></div>
        
        <!-- Precise target crosshair lines radiating outwards -->
        <div class="absolute bg-red-500 opacity-80" style="width: 1.5px; height: 44px; z-index: 1; pointer-events: none;"></div>
        <div class="absolute bg-red-500 opacity-80" style="width: 44px; height: 1.5px; z-index: 1; pointer-events: none;"></div>
        
        <!-- Concentric dashed outer ring -->
        <div class="absolute rounded-full border border-dashed border-red-500" style="width: 38px; height: 38px; z-index: 2; pointer-events: none;"></div>

        <!-- Center NMC Logo Circle -->
        <div class="absolute rounded-full border-2 border-[#353C96] bg-white/90 shadow-md flex items-center justify-center" style="width: 28px; height: 28px; z-index: 10; pointer-events: none;">
          <img src="${nmcLogo}" class="rounded-full object-contain" style="width: 24px; height: 24px;" referrerPolicy="no-referrer" />
        </div>
      </div>
    `;

    const nmcIcon = L.divIcon({
      html: customHtml,
      className: 'custom-leaflet-marker-picker',
      iconSize: [44, 44],
      iconAnchor: [22, 22],
    });

    if (!markerRef.current) {
      const marker = L.marker([targetLat, targetLng], {
        icon: nmcIcon,
        draggable: !isLocationLocked
      }).addTo(map);

      // Handle marker drag adjust location with exact coordinates
      marker.on('dragend', () => {
        if (isLockedRef.current) return;
        const position = marker.getLatLng();
        const dragLat = Number(position.lat);
        const dragLng = Number(position.lng);
        onSourceChange?.('map_drag');
        onChange(dragLat, dragLng);
        triggerGeocode(dragLat, dragLng);
      });

      markerRef.current = marker;
    } else {
      const currentPos = markerRef.current.getLatLng();
      const diffLat = Math.abs(currentPos.lat - targetLat);
      const diffLng = Math.abs(currentPos.lng - targetLng);
      if (diffLat > 0.0000001 || diffLng > 0.0000001) {
        markerRef.current.setLatLng([targetLat, targetLng]);
      }
      
      // Update icon dynamically to ensure latest lock state / anchor positioning
      markerRef.current.setIcon(nmcIcon);

      // Update draggability dynamically
      if (isLocationLocked) {
        markerRef.current.dragging?.disable();
      } else {
        markerRef.current.dragging?.enable();
      }
    }

    // Keep map centered on marker when coords change from non-drag sources (uses 18 zoom for manual_entry)
    const currentMapCenter = map.getCenter();
    const distanceThreshold = 0.0000001; 
    if (
      Math.abs(currentMapCenter.lat - targetLat) > distanceThreshold ||
      Math.abs(currentMapCenter.lng - targetLng) > distanceThreshold
    ) {
      const targetZoom = locationSource === 'manual_entry' ? 18 : (map.getZoom() < 12 ? 16 : map.getZoom());
      map.setView([targetLat, targetLng], targetZoom);
    }
  }, [latitude, longitude, mapReady, isLocationLocked]);

  // Handler: Manual Coordinates Submission (Modal dialog form confirmation)
  const handleManualSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    try {
      const modalLatStr = String(modalLat).trim();
      const modalLngStr = String(modalLng).trim();

      const exactLat = Number(modalLatStr);
      const exactLng = Number(modalLngStr);

      if (!Number.isFinite(exactLat) || exactLat < -90 || exactLat > 90) {
        setModalError('រយៈទទឹង Latitude ត្រូវស្ថិតនៅចន្លោះ -90 ដល់ 90 ឌឺក្រេ។ / Latitude must be between -90 and 90 degrees.');
        return;
      }
      if (!Number.isFinite(exactLng) || exactLng < -180 || exactLng > 180) {
        setModalError('រយៈបណ្ដោល Longitude ត្រូវស្ថិតនៅចន្លោះ -180 ដល់ 180 ឌឺក្រេ។ / Longitude must be between -180 and 180 degrees.');
        return;
      }

      setModalError('');
      setShowManualModal(false);
      onSourceChange?.('manual_entry');
      setIsLocationLocked(true);
      
      // Immediately update coordinate state in parent so marker moves instantly
      onChange(exactLat, exactLng); 
      
      if (mapRef.current) {
        mapRef.current.setView([exactLat, exactLng], 18);
        setTimeout(() => {
          mapRef.current?.invalidateSize();
        }, 100);
      }
      triggerGeocode(exactLat, exactLng);
    } catch (err: any) {
      setModalError(err.message || 'Error processing coordinates.');
    }
  };

  // Handler: GPS Geolocation capture
  const handleUseCurrentLocation = () => {
    if (isLocationLocked) {
      alert(
        'ទីតាំងនេះត្រូវបានកំណត់ដោយនិយាមការរួចហើយ។ ប្រសិនបើចង់កែ សូមចុច កែទីតាំង ឬ សម្អាតទីតាំង ជាមុនសិន។\n\nThis location has already been locked by manual coordinates. To change it, please click Edit Location or Clear Location first.'
      );
      return;
    }

    if (!navigator.geolocation) {
      setGpsError('កម្មវិធីរុករករបស់អ្នកមិនគាំទ្រប្រព័ន្ធ Geolocation ឡើយ / Browser doesn\'t support GPS.');
      setGpsPermissionDenied(false);
      return;
    }

    setGpsLoading(true);
    setGpsError('');
    setGpsPermissionDenied(false);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude: gpsLat, longitude: gpsLng } = position.coords;
        const finalLat = Number(gpsLat);
        const finalLng = Number(gpsLng);
        
        setGpsLoading(false);
        setGpsError('');
        setGpsPermissionDenied(false);
        onSourceChange?.('current_location');
        setIsLocationLocked(true);
        onChange(finalLat, finalLng); // Immediately update coordinate state in parent
        if (mapRef.current) {
          mapRef.current.setView([finalLat, finalLng], 18);
        }
        triggerGeocode(finalLat, finalLng);
      },
      (error) => {
        setGpsLoading(false);
        switch (error.code) {
          case error.PERMISSION_DENIED:
            setGpsPermissionDenied(true);
            setGpsError(
              'មិនអាចចាប់យកទីតាំងបច្ចុប្បន្នបានទេ ព្រោះអ្នកមិនបានអនុញ្ញាតការចូលប្រើទីតាំង។ សូមអនុញ្ញាត Location Permission ក្នុង browser ឬប្រើប៊ូតុង បញ្ចូលនិយាមការ ដើម្បីបញ្ចូល Latitude/Longitude ដោយដៃ។ / Unable to get current location because location permission was not granted. Please allow Location Permission in your browser or use Enter Coordinates to manually input Latitude/Longitude.'
            );
            break;
          case error.POSITION_UNAVAILABLE:
          case error.TIMEOUT:
          default:
            setGpsPermissionDenied(false);
            setGpsError(
              'មិនអាចចាប់យកទីតាំងបច្ចុប្បន្នបានទេ។ សូមព្យាយាមម្តងទៀត ឬបញ្ចូលនិយាមការ Latitude/Longitude ដោយដៃ។ / Unable to get current location. Please try again or manually enter Latitude/Longitude.'
            );
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      }
    );
  };

  const handleClearLocation = () => {
    setGpsError('');
    setGpsPermissionDenied(false);
    setImportUrl('');
    setImportError('');
    onSourceChange?.('');
    setIsLocationLocked(false);
    onChange(null, null, '');
    setResolvedAddress('');
  };

  // Coordinate string formatter helper preserving exact entered decimal places (at least 7 places)
  const formatCoordinateVal = (val: number | null) => {
    if (val === null) return 'N/A';
    const str = val.toString();
    const parts = str.split('.');
    if (parts.length > 1 && parts[1].length > 7) {
      return str;
    }
    return val.toFixed(7);
  };

  const sourceDetails = getFriendlySource(locationSource);

  // Handler: Edit Location
  const handleEditLocation = () => {
    setIsLocationLocked(false);
    alert('ឥឡូវនេះអ្នកអាចកែទីតាំងបាន។\n\nYou can now edit the location.');
  };

  return (
    <div className="space-y-4 font-sans max-w-full">
      {/* 1. Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#C9D2E3]/50 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="bg-[#353C96] text-white p-1.5 rounded-md shrink-0 shadow-xs">
            <MapPin className="h-4 w-4" />
          </div>
          <div className="space-y-0.5">
            <h4 className="text-xs sm:text-[13px] font-bold font-muol text-[#353C96] leading-snug">
              ផែនទីទីតាំងសហគ្រាស
            </h4>
            <p className="text-[10px] sm:text-[11px] font-semibold text-[#5B6785] leading-none">
              Business Address Interactive Map
            </p>
          </div>
        </div>
      </div>

      {/* 2. Map Container with absolute loaders and overlay modal */}
      <div 
        className="rounded-md border border-[#C9D2E3] bg-[#F5F7FB] shadow-sm overflow-hidden relative w-full h-[320px] min-h-[320px]"
        style={{ height: '320px', minHeight: '320px' }}
      >
        {/* Leaflet map object */}
        <div className="w-full h-full relative z-10" style={{ height: '100%', minHeight: '100%' }}>
          <div ref={mapContainerRef} className="w-full h-full" style={{ outline: 'none', height: '100%', width: '100%' }} />
        </div>

        {/* Dynamic geocoding loader overlay */}
        {geocoding && (
          <div className="absolute top-3 left-3 bg-white/95 px-3 py-1.5 text-[10px] font-semibold text-[#1E293B] border border-[#C9D2E3] rounded-md shadow-sm flex items-center gap-2 z-20 animate-pulse">
            <Loader2 className="h-3.5 w-3.5 text-[#353C96] animate-spin" />
            <span>កំពុងស្វែងរកអាសយដ្ឋាន (Resolving Address...)</span>
          </div>
        )}
      </div>

      {/* Modal-style Dialog Panel Overlay rendered outside map container with fixed viewport layer using React Portal onto document.body */}
      {showManualModal && createPortal(
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-[9999]" style={{ zIndex: 9999 }}>
          <div className="bg-white rounded-lg border border-[#C9D2E3] w-full max-w-sm overflow-hidden shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="bg-[#353C96] text-white p-3.5 flex items-center justify-between">
              <span className="font-bold text-xs font-muol text-white">បញ្ចូលនិយាមការភូមិសាស្ត្រ (Enter Coordinates)</span>
              <button
                type="button"
                onClick={() => {
                  setShowManualModal(false);
                  setModalError('');
                }}
                className="text-white/80 hover:text-white transition-colors p-1"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-4 space-y-3.5">
              {modalError && (
                <div className="text-[10px] sm:text-[11px] font-bold text-red-700 bg-red-50 border border-red-200 p-2.5 rounded-md flex items-start gap-1.5">
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-650" />
                  <span>{modalError}</span>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-[#5B6785] block">
                  រយៈទទឹងទីតាំង (Latitude) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="any"
                  required
                  value={modalLat}
                  onChange={(e) => setModalLat(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleManualSubmit();
                    }
                  }}
                  placeholder="ឧទាហរណ៍៖ 11.5564 (ចន្លោះ -90 ដល់ 90)"
                  className="w-full text-xs p-2.5 bg-white border border-[#C9D2E3] rounded-md focus:ring-1 focus:ring-[#353C96] focus:border-[#353C96] focus:outline-hidden font-mono font-bold text-[#1F2A44]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-[#5B6785] block">
                  រយៈបណ្ដោលទីតាំង (Longitude) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="any"
                  required
                  value={modalLng}
                  onChange={(e) => setModalLng(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleManualSubmit();
                    }
                  }}
                  placeholder="ឧទាហរណ៍៖ 104.9282 (ចន្លោះ -180 ដល់ 180)"
                  className="w-full text-xs p-2.5 bg-white border border-[#C9D2E3] rounded-md focus:ring-1 focus:ring-[#353C96] focus:border-[#353C96] focus:outline-hidden font-mono font-bold text-[#1F2A44]"
                />
              </div>

              {/* Optional Import google maps link section */}
              <div className="border-t border-dashed border-[#C9D2E3] pt-3.5 space-y-2">
                <label className="text-[10px] font-bold text-[#5B6785] block">
                  នាំចូលពីតំណភ្ជាប់ Google Maps (Import from Google Maps Link)
                </label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={importUrl}
                    onChange={(e) => {
                      setImportUrl(e.target.value);
                      setImportError('');
                    }}
                    placeholder="ផាសតំណភ្ជាប់ Google Maps / Paste Google Maps URL..."
                    className="flex-1 text-xs p-2.5 bg-white border border-[#C9D2E3] rounded-md focus:ring-1 focus:ring-[#353C96] focus:border-[#353C96] focus:outline-hidden"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!importUrl) return;
                      const coords = parseGoogleMapsUrl(importUrl);
                      if (coords) {
                        setModalLat(String(coords.lat));
                        setModalLng(String(coords.lng));
                        setImportError('');
                        alert(`បានរកឃើញនិយាមការដោយជោគជ័យ៖\nLatitude: ${coords.lat}\nLongitude: ${coords.lng}\n\nGoogle Maps link parsed successfully! Current Latitude & Longitude values are filled.`);
                      } else {
                        setImportError('មិនអាចរកឃើញនិយាមការក្នុងលីងនេះទេ។ សូមពិនិត្យម្តងទៀត។ / Could not find valid coordinates in this link. Please check again.');
                      }
                    }}
                    style={{ backgroundColor: '#2563eb', color: '#ffffff' }}
                    className="bg-[#2563eb] hover:bg-blue-700 text-white text-[10px] sm:text-xs font-bold px-3 py-2 rounded-md transition-all cursor-pointer shadow-2xs"
                  >
                    នាំចូល
                  </button>
                </div>
                {importError && (
                  <p className="text-[10px] text-red-650 leading-tight font-medium">{importError}</p>
                )}
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowManualModal(false);
                    setModalError('');
                  }}
                  style={{ backgroundColor: '#353C96', color: '#ffffff' }}
                  className="flex-1 bg-[#353C96] hover:bg-[#2D327F] text-white rounded-md py-2 text-xs font-bold transition-all cursor-pointer text-center"
                >
                  បោះបង់ (Cancel)
                </button>
                <button
                  type="button"
                  onClick={() => handleManualSubmit()}
                  style={{ backgroundColor: '#353C96', color: '#ffffff' }}
                  className="flex-1 bg-[#353C96] hover:bg-[#2D327F] text-white rounded-md py-2 text-xs font-bold transition-all cursor-pointer text-center"
                >
                  រក្សាទុក (Save)
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {gpsError && (
        <div className="space-y-3">
          <div className="flex items-start gap-2.5 text-xs font-bold text-red-700 bg-red-50 p-3.5 rounded-lg border border-red-200 shadow-2xs">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-655" />
            <span className="leading-relaxed">{gpsError}</span>
          </div>

          {gpsPermissionDenied && (
            <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-4 space-y-3 text-xs text-[#475569] shadow-2xs">
              <div className="font-medium space-y-2.5">
                <div className="text-[#334155] leading-relaxed">
                  <p className="font-bold text-[#1E293B] flex items-center gap-1.5">
                    📍 របៀបបើកដំណើរការទីតាំង (How to Enable Location Access):
                  </p>
                  <p className="mt-1">
                    សម្រាប់ iPhone/Safari/Chrome សូមចូលទៅ <span className="font-semibold text-[#353C96]">Settings → Privacy & Security → Location Services → Browser → Allow Location Access</span>។
                  </p>
                  <p className="text-[11px] text-[#64748B] italic mt-0.5">
                    For iPhone/Safari/Chrome, please go to Settings → Privacy & Security → Location Services → Browser → Allow Location Access.
                  </p>
                </div>

                <div className="border-t border-slate-250 pt-2.5 text-[#334155] leading-relaxed">
                  <p className="font-bold text-amber-700 flex items-center gap-1">
                    ⚠️ ចំណាំសម្រាប់ប្រព័ន្ធសាកល្បង (AI Studio Preview Note):
                  </p>
                  <p className="mt-1">
                    ប្រសិនបើកំពុងប្រើ <span className="font-bold text-[#353C96]">AI Studio Preview</span> ហើយ Location ត្រូវបាន Block សូមសាកល្បងលើ <a href="https://ais-pre-nmgbgbd647arjsyjuqbcse-211647852106.asia-southeast1.run.app" target="_blank" rel="noreferrer" className="text-[#353C96] hover:underline font-bold decoration-dotted">deployed site</a> ឬបញ្ចូលនិយាមការដោយដៃ។
                  </p>
                  <p className="text-[11px] text-[#64748B] italic mt-0.5">
                    If Location is blocked inside AI Studio Preview, please test on the deployed site or enter coordinates manually.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. Detailed coordinate readouts details below Map */}
      <div className="space-y-3 pt-1">
        {/* Left Side: Coordinates and Location Source Display */}
        <div className="space-y-2 w-full min-w-0 rounded-lg border border-[#C9D2E3] bg-white p-3 shadow-2xs">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 font-bold">
            <span className="block w-full text-[#353C96] font-mono text-xs sm:text-[13px] bg-blue-50 border border-blue-150 px-2.5 py-1 rounded-md shadow-2xs break-all">
              Lat: {formatCoordinateVal(latitude)}, Lng: {formatCoordinateVal(longitude)}
            </span>
            {isLocationLocked && latitude !== null && longitude !== null && (
              <>
                {locationSource === 'manual_entry' ? (
                  <span className="inline-flex items-center gap-1 bg-blue-600 border border-blue-500 rounded-md px-2.5 py-1 text-[11px] font-bold text-white font-sans shadow-sm">
                    📍 បានកំណត់ដោយនិយាមការ / Manual Coordinate Entry
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 bg-slate-600 border border-slate-500 rounded-md px-2.5 py-1 text-[11px] font-bold text-white font-sans shadow-sm">
                    📍 {sourceDetails.kh} / {sourceDetails.en}
                  </span>
                )}
                <span className="inline-flex items-center gap-1 bg-emerald-600 border border-emerald-500 rounded-md px-2.5 py-1 text-[11px] font-bold text-white font-sans shadow-sm">
                  🔒 ទីតាំងត្រូវបានចាក់សោ / Location Locked
                </span>
              </>
            )}
            {locationSource && !isLocationLocked && (
              <span className={`inline-flex items-center gap-1 border rounded-md px-2 py-1 text-[10px] font-bold ${sourceDetails.color} font-sans uppercase`}>
                ប្រភពទីតាំង៖ {sourceDetails.kh} ({sourceDetails.en})
              </span>
            )}
          </div>

          {resolvedAddress && (
            <p className="text-[10px] sm:text-[11px] font-medium text-slate-500 leading-snug truncate" title={resolvedAddress}>
              📍 {resolvedAddress}
            </p>
          )}

          {/* Coordinate Verification Display (Requirement 8) */}
          {latitude !== null && longitude !== null && (
            <div className="bg-slate-50 border border-slate-250 rounded-lg p-3 text-xs font-mono space-y-1 block mt-2 text-slate-700 shadow-2xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-150 pb-1.5 mb-1.5">
                <span className="font-bold">Lat: {formatCoordinateVal(latitude)}, Lng: {formatCoordinateVal(longitude)}</span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(`${latitude},${longitude}`);
                    alert('ចម្លងនិយាមការបានសម្រេច! / Coordinates copied successfully!');
                  }}
                  className="bg-[#353C96] hover:bg-[#2D327F] text-white font-sans text-[10px] font-bold px-2.5 py-1 rounded-md cursor-pointer transition-colors shrink-0 shadow-3xs"
                >
                  📋 ចម្លងនិយាមការ (Copy Coordinates)
                </button>
              </div>
              <div className="text-slate-600 font-sans text-[11px] font-semibold">
                Source: {locationSource === 'manual_entry' ? 'Manual Coordinate Entry' : (sourceDetails.en || 'Not Set')}
              </div>
              <div className="text-slate-600 font-sans text-[11px] font-semibold">
                Status: {isLocationLocked ? 'Location Locked' : 'Unlocked'}
              </div>
            </div>
          )}
        </div>

        {/* Right Side: Primary government-styling Action Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full">
          {/* STATE 1: No location selected */}
          {latitude === null || longitude === null ? (
            <>
              {/* Enter Coordinates Button */}
              <button
                type="button"
                onClick={() => {
                  setModalLat('');
                  setModalLng('');
                  setShowManualModal(true);
                }}
                style={{ backgroundColor: '#353C96', color: '#ffffff' }}
                className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md bg-[#353C96] px-4 py-2.5 text-xs font-bold leading-snug text-white shadow hover:bg-[#2D327F] transition-all cursor-pointer whitespace-normal text-center"
              >
                📍 បញ្ចូលនិយាមការ / Enter Coordinates
              </button>

              {/* Use Current GPS Location Button */}
              <button
                type="button"
                onClick={handleUseCurrentLocation}
                disabled={gpsLoading}
                style={{ backgroundColor: '#353C96', color: '#ffffff' }}
                className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md bg-[#353C96] px-4 py-2.5 text-xs font-bold leading-snug text-white shadow hover:bg-[#2D327F] transition-all cursor-pointer disabled:opacity-50 whitespace-normal text-center"
              >
                {gpsLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-white" />
                    <span>កំពុងចាប់យកទីតាំង... / Getting location...</span>
                  </>
                ) : (
                  <>
                    🎯 ចាប់យកទីតាំងបច្ចុប្បន្ន / Use Current Location
                  </>
                )}
              </button>
            </>
          ) : (
            /* Location Selected */
            <>
              {isLocationLocked ? (
                /* STATE 2: Location selected and LOCKED */
                <>
                  {/* Edit Location Button */}
                  <button
                    type="button"
                    onClick={handleEditLocation}
                    style={{ backgroundColor: '#2563eb', color: '#ffffff' }}
                    className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md bg-[#2563eb] px-4 py-2.5 text-xs font-bold leading-snug text-white shadow hover:bg-blue-700 transition-all cursor-pointer whitespace-normal text-center"
                  >
                    ✏️ កែទីតាំង / Edit Location
                  </button>

                  {/* Clear Location Button */}
                  <button
                    type="button"
                    onClick={handleClearLocation}
                    className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-md border border-rose-300 bg-white hover:bg-rose-50 px-4 py-2.5 text-xs font-bold leading-snug text-rose-600 transition-all cursor-pointer font-sans shadow-2xs whitespace-normal text-center"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span>សម្អាតទីតាំង / Clear Location</span>
                  </button>
                </>
              ) : (
                /* STATE 3: Location selected and UNLOCKED */
                <>
                  {/* Enter Coordinates Button */}
                  <button
                    type="button"
                    onClick={() => {
                      setModalLat(String(latitude));
                      setModalLng(String(longitude));
                      setShowManualModal(true);
                    }}
                    style={{ backgroundColor: '#353C96', color: '#ffffff' }}
                    className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md bg-[#353C96] px-4 py-2.5 text-xs font-bold leading-snug text-white shadow hover:bg-[#2D327F] transition-all cursor-pointer whitespace-normal text-center"
                  >
                    📍 បញ្ចូលនិយាមការ / Enter Coordinates
                  </button>

                  {/* Use Current GPS Location Button */}
                  <button
                    type="button"
                    onClick={handleUseCurrentLocation}
                    disabled={gpsLoading}
                    style={{ backgroundColor: '#353C96', color: '#ffffff' }}
                    className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md bg-[#353C96] px-4 py-2.5 text-xs font-bold leading-snug text-white shadow hover:bg-[#2D327F] transition-all cursor-pointer disabled:opacity-50 whitespace-normal text-center"
                  >
                    {gpsLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin text-white" />
                        <span>កំពុងចាប់យកទីតាំង... / Getting location...</span>
                      </>
                    ) : (
                      <>
                        🎯 ចាប់យកទីតាំងបច្ចុប្បន្ន / Use Current Location
                      </>
                    )}
                  </button>

                  {/* Clear Location Button */}
                  <button
                    type="button"
                    onClick={handleClearLocation}
                    className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-md border border-rose-300 bg-white hover:bg-rose-50 px-4 py-2.5 text-xs font-bold leading-snug text-rose-600 transition-all cursor-pointer font-sans shadow-2xs whitespace-normal text-center"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span>សម្អាតទីតាំង / Clear Location</span>
                  </button>
                </>
              )}

              {/* Show external map links under verification buttons regardless of lock state if coordinates exist */}
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 border border-slate-300 bg-white hover:bg-slate-100 rounded-md px-3.5 py-2.5 text-xs font-bold leading-snug text-slate-700 transition-all cursor-pointer font-sans shadow-2xs whitespace-normal text-center"
              >
                <Map className="h-3.5 w-3.5 text-blue-650" />
                <span>បើកក្នុង Google Maps / Open in Google Maps</span>
              </a>

              <a
                href={`https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=18/${latitude}/${longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 border border-slate-300 bg-white hover:bg-slate-100 rounded-md px-3.5 py-2.5 text-xs font-bold leading-snug text-slate-700 transition-all cursor-pointer font-sans shadow-2xs whitespace-normal text-center"
              >
                <ExternalLink className="h-3.5 w-3.5 text-green-650" />
                <span>បើកក្នុង OpenStreetMap / Open in OpenStreetMap</span>
              </a>
            </>
          )}
        </div>
      </div>
      
    </div>
  );
};
