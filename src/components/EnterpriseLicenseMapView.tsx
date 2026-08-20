import React, { Component, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { Focus, LocateFixed, Maximize2, Minimize2, RotateCcw, Search, X } from "lucide-react";
import MarkerClusterGroup from "react-leaflet-cluster";
import {
  CircleMarker,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import "react-leaflet-cluster/dist/assets/MarkerCluster.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.Default.css";
import nmcLogo from "./NMClogo.png";

/**
 * EnterpriseLicenseMapView
 * ------------------------------------------------------------
 * Purpose:
 * Render a real OpenStreetMap/Leaflet map for the License Map tab.
 *
 * Use this component ONLY inside:
 * ផែនទីទីតាំងអាជ្ញាប័ណ្ណ / License Map
 *
 * Required packages:
 * npm install leaflet react-leaflet
 * npm install -D @types/leaflet
 */

export type EnterpriseLicenseRecord = Record<string, any>;

export interface EnterpriseLicenseMapViewProps {
  licenses: EnterpriseLicenseRecord[];
  nmcLogoUrl?: string;
  onViewLicense?: (license: EnterpriseLicenseRecord) => void;
  className?: string;
  groupSharedLocations?: boolean;
  language?: 'km' | 'en';
  isLoading?: boolean;
}

const CAMBODIA_CENTER: [number, number] = [12.5657, 104.991];
const CAMBODIA_DEFAULT_ZOOM = 7;

function firstValue(record: EnterpriseLicenseRecord, keys: string[]): string {
  for (const key of keys) {
    const value = record?.[key];
    if (value !== null && value !== undefined && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return "";
}

function getCompanyName(license: EnterpriseLicenseRecord): string {
  return (
    firstValue(license, [
      "company_name_kh",
      "enterprise_name_kh",
      "business_name_kh",
      "licensee_name_kh",
      "company_name",
      "enterprise_name",
      "business_name",
      "company_name_en",
      "enterprise_name_en",
      "legal_representative_name",
      "representative_name",
      "owner_name",
    ]) || "N/A"
  );
}

function getLicenseNumber(license: EnterpriseLicenseRecord): string {
  return (
    firstValue(license, [
      "license_number",
      "business_license_number",
      "license_no",
      "certificate_number",
    ]) || "N/A"
  );
}

function getStatus(license: EnterpriseLicenseRecord): string {
  return (
    firstValue(license, [
      "license_status",
      "status",
      "current_status",
      "validity_status",
    ]) || "N/A"
  );
}

function getProvince(license: EnterpriseLicenseRecord): string {
  return firstValue(license, ["province_city", "province", "province_name", "city"]);
}

function getServiceType(license: EnterpriseLicenseRecord): string {
  return firstValue(license, ["service_scope", "business_type", "service_type", "measuring_instrument_type"]);
}

function getStatusGroup(license: EnterpriseLicenseRecord): "active" | "expiring" | "expired" {
  const status = getStatus(license).toLowerCase();
  if (status.includes("expiring") || status.includes("ជិត")) return "expiring";
  if (status.includes("expired") || status.includes("cancel") || status.includes("suspend") || status.includes("ផុត")) return "expired";
  return "active";
}

function getDaysLeft(license: EnterpriseLicenseRecord): number | null {
  const value = firstValue(license, ["license_expiry_date", "expiry_date", "expiration_date"]);
  if (!value) return null;
  const expiry = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  if (Number.isNaN(expiry.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  expiry.setHours(0, 0, 0, 0);
  return Math.ceil((expiry.getTime() - today.getTime()) / 86400000);
}

function isTelegramLinked(license: EnterpriseLicenseRecord): boolean {
  return Boolean(firstValue(license, ["telegram_chat_id", "telegram_connected_at"])) ||
    license?.telegram_linked === true || license?.is_telegram_linked === true;
}

function getCompleteness(license: EnterpriseLicenseRecord): number {
  const checks = [getCompanyName(license) !== "N/A", getLicenseNumber(license) !== "N/A", getKhmerAddress(license), getProvince(license), getServiceType(license), getLatitude(license), getLongitude(license)];
  return Math.round(checks.filter((value) => value !== null && value !== "").length / checks.length * 100);
}

function getSearchText(license: EnterpriseLicenseRecord): string {
  return [
    getCompanyName(license),
    firstValue(license, ["company_name_en", "enterprise_name_en", "company_name"]),
    getLicenseNumber(license),
    getProvince(license),
    getKhmerAddress(license),
    firstValue(license, ["license_owner_name", "legal_representative", "representative_name", "owner_name"]),
    getServiceType(license),
  ].join(" ").toLowerCase();
}

function getKhmerAddress(license: EnterpriseLicenseRecord): string {
  return (
    firstValue(license, [
      "business_address_kh",
      "company_address_kh",
      "enterprise_address_kh",
      "business_geo_address_kh",
      "address_kh",
      "business_geo_address",
      "business_address",
      "company_address",
      "enterprise_address",
      "address",
    ]) || "មិនមានអាសយដ្ឋានជាភាសាខ្មែរ"
  );
}

function getLatitude(license: EnterpriseLicenseRecord): number | null {
  const value =
    license?.business_latitude ??
    license?.latitude ??
    license?.lat ??
    license?.gps_latitude;

  if (value === null || value === undefined || String(value).trim() === "") {
    return null;
  }

  const lat = Number(value);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return null;
  return lat;
}

function getLongitude(license: EnterpriseLicenseRecord): number | null {
  const value =
    license?.business_longitude ??
    license?.longitude ??
    license?.lng ??
    license?.gps_longitude;

  if (value === null || value === undefined || String(value).trim() === "") {
    return null;
  }

  const lng = Number(value);
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) return null;
  return lng;
}

function formatCoordinate(value: number): string {
  return Number(value).toFixed(7).replace(/0+$/, "").replace(/\.$/, "");
}

function createNmcIcon(nmcLogoUrl?: string): L.DivIcon {
  const logo = nmcLogoUrl && String(nmcLogoUrl).trim() !== ""
    ? `<img src="${encodeURI(nmcLogoUrl)}" alt="" />`
    : "<span>NMC</span>";
  return L.divIcon({
    className: "nmc-enterprise-marker",
    html: `<div class="nmc-enterprise-marker__pin">${logo}</div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    popupAnchor: [0, -22],
  });
}

function createClusterIcon(cluster: { getChildCount: () => number }): L.DivIcon {
  const count = cluster.getChildCount();
  return L.divIcon({
    className: "nmc-cluster-marker",
    html: `<div class="nmc-cluster-marker__outer"><span>${count}</span></div>`,
    iconSize: [50, 50],
    iconAnchor: [25, 25],
  });
}

function ResizeMapFix() {
  const map = useMap();

  useEffect(() => {
    const timer1 = window.setTimeout(() => map.invalidateSize(), 100);
    const timer2 = window.setTimeout(() => map.invalidateSize(), 500);

    const handleResize = () => map.invalidateSize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.clearTimeout(timer1);
      window.clearTimeout(timer2);
      window.removeEventListener("resize", handleResize);
    };
  }, [map]);

  return null;
}

function fitLocations(map: L.Map, locations: Array<{ lat: number; lng: number }>) {
  map.closePopup();
  if (locations.length === 0) {
    map.setView(CAMBODIA_CENTER, CAMBODIA_DEFAULT_ZOOM, { animate: true });
  } else if (locations.length === 1) {
    map.setView([locations[0].lat, locations[0].lng], 16, { animate: true });
  } else {
    map.fitBounds(L.latLngBounds(locations.map(({ lat, lng }) => [lat, lng])), {
      padding: [50, 50], maxZoom: 13, animate: true,
    });
  }
}

function MapViewportController({
  locations,
  normalRequest,
  fitRequest,
  focusRequest,
}: {
  locations: Array<{ lat: number; lng: number }>;
  normalRequest: number;
  fitRequest: number;
  focusRequest: { id: number; lat: number; lng: number } | null;
}) {
  const map = useMap();
  const initializedRef = useRef(false);
  const handledNormalRef = useRef(normalRequest);
  const handledFitRef = useRef(fitRequest);
  const handledFocusRef = useRef(0);

  useEffect(() => {
    if (initializedRef.current || locations.length === 0) return;
    initializedRef.current = true;
    fitLocations(map, locations);
  }, [locations, map]);

  useEffect(() => {
    if (handledNormalRef.current === normalRequest) return;
    handledNormalRef.current = normalRequest;
    map.closePopup();
    map.setView(CAMBODIA_CENTER, CAMBODIA_DEFAULT_ZOOM, { animate: true });
  }, [map, normalRequest]);

  useEffect(() => {
    if (handledFitRef.current === fitRequest) return;
    handledFitRef.current = fitRequest;
    fitLocations(map, locations);
  }, [fitRequest, locations, map]);

  useEffect(() => {
    if (!focusRequest || handledFocusRef.current === focusRequest.id) return;
    handledFocusRef.current = focusRequest.id;
    map.flyTo([focusRequest.lat, focusRequest.lng], Math.max(map.getZoom(), 15), { duration: 0.6 });
  }, [focusRequest, map]);

  return null;
}

function EnterpriseMarkerPopup({
  license,
  lat,
  lng,
  onViewLicense,
}: {
  license: EnterpriseLicenseRecord;
  lat: number;
  lng: number;
  onViewLicense?: (license: EnterpriseLicenseRecord) => void;
}) {
  const companyName = getCompanyName(license);
  const licenseNumber = getLicenseNumber(license);
  const status = getStatus(license);
  const khmerAddress = getKhmerAddress(license);

  const osmUrl = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`;
  const googleUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  const issueDate = firstValue(license, ["license_issue_date", "issue_date"]) || "N/A";
  const expiryDate = firstValue(license, ["license_expiry_date", "expiry_date", "expiration_date"]) || "N/A";

  return (
    <div style={{ minWidth: 260, maxWidth: 340, fontSize: 13 }}>
      <div style={{ fontWeight: 800, color: "#353C96", marginBottom: 6 }}>
        {companyName}
      </div>

      <div style={{ marginBottom: 4 }}>
        <strong>លេខអាជ្ញាប័ណ្ណ / License No.:</strong> {licenseNumber}
      </div>

      <div style={{ marginBottom: 4 }}>
        <strong>ស្ថានភាព / Status:</strong> {status}
      </div>

      <div style={{ marginBottom: 4 }}><strong>Issue / Expiry:</strong> {issueDate} / {expiryDate}</div>
      <div style={{ marginBottom: 4 }}><strong>Province:</strong> {getProvince(license) || "N/A"}</div>
      <div style={{ marginBottom: 4 }}><strong>Telegram:</strong> {isTelegramLinked(license) ? "Linked" : "Not linked"}</div>
      <div style={{ marginBottom: 4 }}><strong>Data completeness:</strong> {getCompleteness(license)}%</div>

      <div style={{ marginBottom: 4 }}>
        <strong>អាសយដ្ឋាន / Address:</strong>
        <div style={{ marginTop: 2, lineHeight: 1.35 }}>{khmerAddress}</div>
      </div>

      <div style={{ marginBottom: 8 }}>
        <strong>GPS:</strong> {formatCoordinate(lat)}, {formatCoordinate(lng)}
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {onViewLicense && (
          <button
            type="button"
            onClick={() => onViewLicense(license)}
            style={{
              border: 0,
              borderRadius: 6,
              background: "#353C96",
              color: "#fff",
              padding: "6px 10px",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            មើលលម្អិត / View
          </button>
        )}

        <a
          href={osmUrl}
          target="_blank"
          rel="noreferrer"
          style={{
            border: "1px solid #353C96",
            borderRadius: 6,
            color: "#353C96",
            padding: "6px 10px",
            textDecoration: "none",
            fontWeight: 700,
          }}
        >
          Open OSM
        </a>

        <a
          href={googleUrl}
          target="_blank"
          rel="noreferrer"
          style={{
            border: "1px solid #353C96",
            borderRadius: 6,
            color: "#353C96",
            padding: "6px 10px",
            textDecoration: "none",
            fontWeight: 700,
          }}
        >
          Google Maps
        </a>
        <button
          type="button"
          onClick={() => navigator.clipboard?.writeText(`${formatCoordinate(lat)}, ${formatCoordinate(lng)}`)}
          style={{ border: "1px solid #353C96", borderRadius: 6, color: "#353C96", background: "#fff", padding: "6px 10px", fontWeight: 700, cursor: "pointer" }}
        >
          Copy Coordinates
        </button>
      </div>
    </div>
  );
}

function EnterpriseLocationGroupPopup({
  locations,
  onViewLicense,
}: {
  locations: Array<{ license: EnterpriseLicenseRecord; lat: number; lng: number }>;
  onViewLicense?: (license: EnterpriseLicenseRecord) => void;
}) {
  if (locations.length === 1) {
    const { license, lat, lng } = locations[0];
    return <EnterpriseMarkerPopup license={license} lat={lat} lng={lng} onViewLicense={onViewLicense} />;
  }

  const { lat, lng } = locations[0];
  const googleUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

  return (
    <div style={{ minWidth: 280, maxWidth: 380, fontSize: 13 }}>
      <div style={{ fontWeight: 800, color: '#353C96', marginBottom: 6 }}>
        {locations.length} licensed enterprises at this GPS location
      </div>
      <div style={{ marginBottom: 8, color: '#475569' }}>
        GPS: {formatCoordinate(lat)}, {formatCoordinate(lng)}
      </div>
      <div style={{ maxHeight: 220, overflowY: 'auto', borderTop: '1px solid #e2e8f0' }}>
        {locations.map(({ license }, index) => (
          <div key={`${String(license?.id || index)}-${index}`} style={{ padding: '8px 0', borderBottom: '1px solid #e2e8f0' }}>
            <div style={{ fontWeight: 800, color: '#0f172a' }}>{getCompanyName(license)}</div>
            <div style={{ marginTop: 2 }}><strong>License:</strong> {getLicenseNumber(license)}</div>
            <div style={{ marginTop: 2 }}><strong>Status:</strong> {getStatus(license)}</div>
            {onViewLicense && (
              <button
                type="button"
                onClick={() => onViewLicense(license)}
                style={{ border: 0, borderRadius: 6, background: '#353C96', color: '#fff', padding: '5px 8px', cursor: 'pointer', fontWeight: 700, marginTop: 6 }}
              >
                View
              </button>
            )}
          </div>
        ))}
      </div>
      <a
        href={googleUrl}
        target="_blank"
        rel="noreferrer"
        style={{ display: 'inline-block', marginTop: 10, border: '1px solid #353C96', borderRadius: 6, color: '#353C96', padding: '6px 10px', textDecoration: 'none', fontWeight: 700 }}
      >
        Open in Google Maps
      </a>
    </div>
  );
}

interface MapErrorBoundaryState {
  hasError: boolean;
  message: string;
}

class MapErrorBoundary extends Component<
  { children: React.ReactNode },
  MapErrorBoundaryState
> {
  state: MapErrorBoundaryState = { hasError: false, message: "" };

  static getDerivedStateFromError(error: unknown): MapErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  componentDidCatch(error: unknown) {
    console.error("EnterpriseLicenseMapView crashed:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            border: "1px solid #fecaca",
            background: "#fff1f2",
            color: "#991b1b",
            borderRadius: 12,
            padding: 16,
          }}
        >
          <strong>ផែនទីមិនអាចផ្ទុកបានទេ / Map could not be loaded.</strong>
          <div style={{ marginTop: 8, fontSize: 13 }}>{this.state.message}</div>
        </div>
      );
    }

    return (this as any).props.children;
  }
}

export function EnterpriseLicenseMapView({
  licenses,
  nmcLogoUrl = nmcLogo,
  onViewLicense,
  className = "",
  groupSharedLocations = true,
  language = "en",
  isLoading = false,
}: EnterpriseLicenseMapViewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [provinceFilter, setProvinceFilter] = useState("all");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [gpsFilter, setGpsFilter] = useState("all");
  const [telegramFilter, setTelegramFilter] = useState("all");
  const [validityFilter, setValidityFilter] = useState("all");
  const [normalRequest, setNormalRequest] = useState(0);
  const [fitRequest, setFitRequest] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationMessage, setLocationMessage] = useState("");
  const [focusRequest, setFocusRequest] = useState<{ id: number; lat: number; lng: number } | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchQuery.trim().toLowerCase()), 250);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    if (!isFullscreen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsFullscreen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    window.setTimeout(() => window.dispatchEvent(new Event("resize")), 50);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
      window.setTimeout(() => window.dispatchEvent(new Event("resize")), 50);
    };
  }, [isFullscreen]);

  const provinces = useMemo(() => Array.from(new Set((licenses || []).map(getProvince).filter(Boolean))).sort(), [licenses]);
  const services = useMemo(() => Array.from(new Set((licenses || []).map(getServiceType).filter(Boolean))).sort(), [licenses]);
  const filteredLicenses = useMemo(() => (licenses || []).filter((license) => {
    if (debouncedSearch && !getSearchText(license).includes(debouncedSearch)) return false;
    if (statusFilter !== "all" && getStatusGroup(license) !== statusFilter) return false;
    if (provinceFilter !== "all" && getProvince(license) !== provinceFilter) return false;
    if (serviceFilter !== "all" && getServiceType(license) !== serviceFilter) return false;
    const hasGps = getLatitude(license) !== null && getLongitude(license) !== null;
    if (gpsFilter === "gps" && !hasGps) return false;
    if (gpsFilter === "missing" && hasGps) return false;
    if (telegramFilter === "linked" && !isTelegramLinked(license)) return false;
    if (telegramFilter === "unlinked" && isTelegramLinked(license)) return false;
    const days = getDaysLeft(license);
    if (validityFilter === "30" && (days === null || days < 0 || days > 30)) return false;
    if (validityFilter === "90" && (days === null || days < 0 || days > 90)) return false;
    if (validityFilter === "expired" && (days === null || days >= 0)) return false;
    return true;
  }), [debouncedSearch, gpsFilter, licenses, provinceFilter, serviceFilter, statusFilter, telegramFilter, validityFilter]);

  const validLocations = useMemo(() => {
    return filteredLicenses
      .map((license, index) => {
        const lat = getLatitude(license);
        const lng = getLongitude(license);
        if (lat === null || lng === null) return null;

        return {
          license,
          lat,
          lng,
          key:
            `${String(license?.id || getLicenseNumber(license))}-${index}`,
        };
      })
      .filter(Boolean) as Array<{
      license: EnterpriseLicenseRecord;
      lat: number;
      lng: number;
      key: string;
    }>;
  }, [filteredLicenses]);

  const nmcIcon = useMemo(() => createNmcIcon(nmcLogoUrl), [nmcLogoUrl]);

  const locationGroups = useMemo(() => {
    const groups = new Map<string, {
      key: string;
      lat: number;
      lng: number;
      locations: typeof validLocations;
    }>();

    validLocations.forEach((location) => {
      // Coordinates are rounded only for grouping. Each popup still shows the stored value.
      const key = `${location.lat.toFixed(6)},${location.lng.toFixed(6)}`;
      const group = groups.get(key);
      if (group) {
        group.locations.push(location);
      } else {
        groups.set(key, { key, lat: location.lat, lng: location.lng, locations: [location] });
      }
    });

    return Array.from(groups.values());
  }, [validLocations]);

  const groupedEnterpriseCount = locationGroups.reduce((total, group) => total + Math.max(0, group.locations.length - 1), 0);
  const displayedLocationGroups = useMemo(() => (
    groupSharedLocations
      ? locationGroups
      : validLocations.map((location) => ({
        key: location.key,
        lat: location.lat,
        lng: location.lng,
        locations: [location],
      }))
  ), [groupSharedLocations, locationGroups, validLocations]);

  const statusCounts = {
    active: filteredLicenses.filter((license) => getStatusGroup(license) === "active").length,
    expiring: filteredLicenses.filter((license) => getStatusGroup(license) === "expiring").length,
    expired: filteredLicenses.filter((license) => getStatusGroup(license) === "expired").length,
  };
  const missingGps = filteredLicenses.length - validLocations.length;
  const hasFilters = Boolean(searchQuery || statusFilter !== "all" || provinceFilter !== "all" || serviceFilter !== "all" || gpsFilter !== "all" || telegramFilter !== "all" || validityFilter !== "all");
  const clearFilters = () => {
    setSearchQuery("");
    setDebouncedSearch("");
    setStatusFilter("all");
    setProvinceFilter("all");
    setServiceFilter("all");
    setGpsFilter("all");
    setTelegramFilter("all");
    setValidityFilter("all");
  };
  const locateUser = () => {
    setLocationMessage("");
    if (!navigator.geolocation) {
      setLocationMessage("Location is not available in this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      const location = { lat: coords.latitude, lng: coords.longitude };
      setUserLocation(location);
      setFocusRequest({ id: Date.now(), ...location });
    }, () => setLocationMessage(label("មិនអាចប្រើទីតាំងបច្ចុប្បន្នបានទេ។", "Location permission denied.")), {
      enableHighAccuracy: true, timeout: 10000, maximumAge: 60000,
    });
  };
  const label = (kh: string, en: string) => language === "km" ? kh : en;

  return (
    <div className={`${className} ${isFullscreen ? "nmc-map-fullscreen" : ""}`}>
      <style>
        {`
          .nmc-license-map .leaflet-container {
            width: 100%;
            height: 100%;
            z-index: 0;
          }
          .nmc-license-map .leaflet-popup-content-wrapper {
            border-radius: 10px;
          }
          .nmc-enterprise-marker,
          .nmc-cluster-marker {
            background: transparent;
            border: 0;
          }
          .nmc-enterprise-marker__pin {
            width: 44px;
            height: 44px;
            display: flex;
            align-items: center;
            justify-content: center;
            box-sizing: border-box;
            border: 4px solid #16a34a;
            border-radius: 9999px;
            background: #ffffff;
            box-shadow: 0 2px 10px rgba(15, 23, 42, .48);
          }
          .nmc-enterprise-marker__pin img { width: 32px; height: 32px; object-fit: contain; border-radius: 9999px; }
          .nmc-enterprise-marker__pin span { color: #173f73; font-size: 10px; font-weight: 900; }
          .nmc-cluster-marker__outer {
            width: 50px;
            height: 50px;
            display: flex;
            align-items: center;
            justify-content: center;
            box-sizing: border-box;
            border: 4px solid #f5c242;
            border-radius: 9999px;
            background: #173f73;
            box-shadow: 0 2px 11px rgba(15, 23, 42, .48);
          }
          .nmc-cluster-marker__outer span { color: #ffffff; font-size: 15px; font-weight: 900; line-height: 1; }
          .nmc-map-fullscreen { position:fixed !important; inset:0; z-index:10000; background:#eef4f8; padding:12px; overflow:auto; }
          .nmc-map-fullscreen .nmc-license-map { height:calc(100vh - 290px) !important; min-height:360px !important; }
          .nmc-map-toolbar { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:10px; }
          .nmc-map-search { position:relative; flex:1 1 320px; }
          .nmc-map-search input, .nmc-map-filter { width:100%; height:40px; border:1px solid #c9d2e3; border-radius:6px; background:#fff; padding:0 10px; font-weight:650; }
          .nmc-map-search input { padding-left:36px; }
          .nmc-map-search svg { position:absolute; left:11px; top:11px; color:#64748b; }
          .nmc-map-button { height:40px; display:inline-flex; align-items:center; justify-content:center; gap:6px; border:1px solid #244b82; border-radius:6px; padding:0 11px; background:#fff; color:#244b82; font-weight:800; cursor:pointer; white-space:nowrap; }
          .nmc-map-button.primary { background:#173f73; color:#fff; }
          .nmc-map-filter-row { display:grid; grid-template-columns:repeat(4,minmax(130px,1fr)); gap:8px; margin-bottom:10px; }
          .nmc-map-summary { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:10px; }
          .nmc-map-summary span { border-left:4px solid var(--tone); border-radius:4px; background:#f8fafc; padding:7px 10px; min-width:105px; color:#64748b; font-size:11px; font-weight:750; }
          .nmc-map-summary strong { display:block; color:#0f172a; font-size:17px; }
          .nmc-map-legend { display:flex; gap:14px; flex-wrap:wrap; align-items:center; padding-top:10px; color:#475569; font-size:12px; font-weight:750; }
          .nmc-map-legend span { display:inline-flex; gap:6px; align-items:center; }
          .nmc-map-legend i { width:10px; height:10px; border-radius:50%; }
          @media(max-width:700px) {
            .nmc-map-filter-row { grid-template-columns:1fr 1fr; }
            .nmc-map-button { flex:1 1 auto; }
            .nmc-license-map { height:430px !important; min-height:350px !important; }
            .nmc-map-fullscreen { padding:5px; }
            .nmc-map-fullscreen .nmc-license-map { height:calc(100vh - 390px) !important; }
          }
        `}
      </style>

      <div
        style={{
          border: "1px solid #C9D2E3",
          borderRadius: 8,
          background: "#ffffff",
          padding: 16,
          boxShadow: "0 1px 4px rgba(15, 23, 42, .08)",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "flex-start",
            justifyContent: "space-between",
            flexWrap: "wrap",
            marginBottom: 12,
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                color: "#353C96",
                fontSize: 22,
                fontWeight: 900,
                lineHeight: 1.25,
              }}
            >
              {label("ផែនទីទីតាំងអាជ្ញាប័ណ្ណ", "License Map")}
            </h2>
            <div style={{ color: "#475569", fontWeight: 700, marginTop: 4 }}>
              {label("ទីតាំងសហគ្រាសដែលទទួលបានអាជ្ញាប័ណ្ណ", "Enterprise license locations")}
            </div>
          </div>

          {groupSharedLocations && <div className="nmc-map-toolbar">
            <button className="nmc-map-button" type="button" title="Return to Cambodia view" onClick={() => setNormalRequest((value) => value + 1)}><RotateCcw size={15} />{label("ទិដ្ឋភាពធម្មតា", "Normal View")}</button>
            <button className="nmc-map-button" type="button" title="Fit all filtered enterprises" onClick={() => setFitRequest((value) => value + 1)}><Focus size={15} />{label("បង្ហាញទាំងអស់", "Fit All")}</button>
            <button className="nmc-map-button" type="button" title="Show current location" onClick={locateUser}><LocateFixed size={15} />{label("ទីតាំងបច្ចុប្បន្ន", "Current Location")}</button>
            <button className="nmc-map-button primary" type="button" title={isFullscreen ? "Exit fullscreen" : "Fullscreen map"} onClick={() => setIsFullscreen((value) => !value)}>{isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}{isFullscreen ? "Exit" : label("ពេញអេក្រង់", "Fullscreen")}</button>
          </div>}
        </div>

        {groupSharedLocations && <>
          <div className="nmc-map-toolbar">
            <div className="nmc-map-search"><Search size={17} /><input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder={label("ស្វែងរកសហគ្រាស លេខអាជ្ញាប័ណ្ណ ខេត្ត...", "Search enterprise, license, province...")} aria-label="Search enterprise locations" /></div>
            {hasFilters && <button className="nmc-map-button" type="button" onClick={clearFilters}><X size={15} />{label("សម្អាតតម្រង", "Clear filters")}</button>}
          </div>
          <div className="nmc-map-filter-row">
            <select className="nmc-map-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Status filter"><option value="all">Status: All</option><option value="active">Active</option><option value="expiring">Expiring Soon</option><option value="expired">Expired</option></select>
            <select className="nmc-map-filter" value={provinceFilter} onChange={(event) => setProvinceFilter(event.target.value)} aria-label="Province filter"><option value="all">Province: All</option>{provinces.map((value) => <option key={value} value={value}>{value}</option>)}</select>
            <select className="nmc-map-filter" value={serviceFilter} onChange={(event) => setServiceFilter(event.target.value)} aria-label="Service filter"><option value="all">Service: All</option>{services.map((value) => <option key={value} value={value}>{value}</option>)}</select>
            <select className="nmc-map-filter" value={gpsFilter} onChange={(event) => setGpsFilter(event.target.value)} aria-label="GPS filter"><option value="all">GPS: All</option><option value="gps">Has GPS</option><option value="missing">Missing GPS</option></select>
            <select className="nmc-map-filter" value={telegramFilter} onChange={(event) => setTelegramFilter(event.target.value)} aria-label="Telegram filter"><option value="all">Telegram: All</option><option value="linked">Linked</option><option value="unlinked">Not linked</option></select>
            <select className="nmc-map-filter" value={validityFilter} onChange={(event) => setValidityFilter(event.target.value)} aria-label="Validity filter"><option value="all">Validity: All</option><option value="30">Expires in 30 days</option><option value="90">Expires in 90 days</option><option value="expired">Expired</option></select>
            <button className="nmc-map-button" type="button" onClick={() => setFitRequest((value) => value + 1)}>Fit filtered results</button>
          </div>
          <div className="nmc-map-summary">
            <span style={{"--tone":"#173f73"} as React.CSSProperties}><strong>{validLocations.length}</strong>On map</span>
            <span style={{"--tone":"#16a34a"} as React.CSSProperties}><strong>{statusCounts.active}</strong>Active</span>
            <span style={{"--tone":"#f59e0b"} as React.CSSProperties}><strong>{statusCounts.expiring}</strong>Expiring Soon</span>
            <span style={{"--tone":"#dc2626"} as React.CSSProperties}><strong>{statusCounts.expired}</strong>Expired</span>
            <span style={{"--tone":"#94a3b8"} as React.CSSProperties}><strong>{missingGps}</strong>Missing GPS</span>
          </div>
        </>}

        {locationMessage && <div style={{ marginBottom: 12, color: "#92400e", fontWeight: 700 }}>{locationMessage}</div>}

        {!isLoading && validLocations.length === 0 && (
          <div
            style={{
              marginBottom: 12,
              border: "1px solid #fde68a",
              background: "#fffbeb",
              color: "#92400e",
              borderRadius: 10,
              padding: 12,
              fontWeight: 700,
            }}
          >
            មិនមានទីតាំងសហគ្រាសសម្រាប់បង្ហាញលើផែនទីទេ។ សូមបញ្ចូល Latitude
            និង Longitude ក្នុងទម្រង់អាជ្ញាប័ណ្ណជាមុនសិន។
            <br />
            {filteredLicenses.length === 0 ? "No enterprises match the current filters." : "No licensed enterprise locations are available on the map."}
          </div>
        )}

        {isLoading && <div style={{ marginBottom: 12, color: "#475569", fontWeight: 700 }}>Loading enterprise locations...</div>}

        <MapErrorBoundary>
          <div
            className="nmc-license-map"
            style={{
              width: "100%",
              height: "600px",
              minHeight: "420px",
              border: "1px solid #C9D2E3",
              borderRadius: 12,
              overflow: "hidden",
              background: "#f8fafc",
            }}
          >
            <MapContainer
              center={CAMBODIA_CENTER}
              zoom={CAMBODIA_DEFAULT_ZOOM}
              minZoom={groupSharedLocations ? 5 : undefined}
              maxZoom={groupSharedLocations ? 19 : undefined}
              zoomControl={true}
              scrollWheelZoom={true}
              className="h-full w-full"
              style={{ width: "100%", height: "100%" }}
            >
              <ResizeMapFix />
              <TileLayer
                attribution="&copy; OpenStreetMap contributors"
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              {groupSharedLocations ? <MarkerClusterGroup
                chunkedLoading
                animate
                removeOutsideVisibleBounds
                showCoverageOnHover={false}
                spiderfyOnMaxZoom
                spiderfyDistanceMultiplier={1.7}
                zoomToBoundsOnClick
                iconCreateFunction={createClusterIcon}
              >{validLocations.map(({ key, lat, lng, license }) => (
                <Marker
                  key={key}
                  position={[lat, lng]}
                  icon={nmcIcon}
                  title={getCompanyName(license)}
                >
                  <Popup>
                    <EnterpriseMarkerPopup license={license} lat={lat} lng={lng} onViewLicense={onViewLicense} />
                  </Popup>
                </Marker>
              ))}</MarkerClusterGroup> : displayedLocationGroups.map(({ key, lat, lng, locations }) => (
                <Marker key={key} position={[lat, lng]} icon={nmcIcon} title={getCompanyName(locations[0].license)}>
                  <Popup><EnterpriseLocationGroupPopup locations={locations} onViewLicense={onViewLicense} /></Popup>
                </Marker>
              ))}

              {userLocation && <CircleMarker center={[userLocation.lat, userLocation.lng]} radius={9} pathOptions={{ color: "#fff", weight: 3, fillColor: "#2563eb", fillOpacity: 1 }}><Popup>Your current location</Popup></CircleMarker>}

              <MapViewportController
                locations={validLocations.map(({ lat, lng }) => ({ lat, lng }))}
                normalRequest={normalRequest}
                fitRequest={fitRequest}
                focusRequest={focusRequest}
              />
            </MapContainer>
          </div>
        </MapErrorBoundary>
        <div className="nmc-map-legend">
          <span><i style={{background:"#16a34a"}} />{label("សកម្ម", "Active")}</span>
          <span><i style={{background:"#f59e0b"}} />{label("ជិតផុតកំណត់", "Expiring Soon")}</span>
          <span><i style={{background:"#dc2626"}} />{label("ផុតកំណត់", "Expired")}</span>
          <span><i style={{background:"#94a3b8"}} />{label("គ្មាន GPS", "Missing GPS")}</span>
          {groupSharedLocations && <span><i style={{background:"#173f73", border:"2px solid #d4af37"}} />Cluster count</span>}
        </div>
      </div>
    </div>
  );
}

export default EnterpriseLicenseMapView;
